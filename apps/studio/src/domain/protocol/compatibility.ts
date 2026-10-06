import {
  type ActionResult,
  action,
  checkAction,
  exactRecord,
} from "./action-utils";
import type { ProtocolEvent } from "./transport";

const CUSTOM_REQUEST_ID = /^[A-Za-z0-9]{16}$/u;
const MAX_CUSTOM_JSON_BYTES = 65_536;

export type CustomMethodOutcome =
  | { status: "ok"; result: unknown }
  | { status: "error"; error: string }
  | { status: "cancelled" };
export interface CustomMethodProvider {
  invoke(input: {
    method: string;
    params: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<CustomMethodOutcome>;
}
export interface CloudStorageMethodBridge {
  invokeCloud(request: unknown): Promise<{
    status: "applied" | "simulated" | "unsupported" | "invalid" | "denied";
    value?: unknown;
    error?: string;
  }>;
}

/** Correlates generic methods; CloudStorage may be explicitly delegated to the 04f bridge. */
export class CompatibilityProtocolService {
  private generation: number;
  private active = new Map<string, AbortController>();

  constructor(
    private readonly mode: "mock" | "real",
    generation: number,
    private readonly clientVersion: string | undefined,
    private readonly methodProvider?: CustomMethodProvider,
    private readonly cloudStorage?: CloudStorageMethodBridge,
  ) {
    this.generation = generation;
  }

  async handle(event: ProtocolEvent): Promise<ActionResult> {
    const direction =
      event.eventType === "custom_method_invoked" ||
      event.eventType === "reload_iframe" ||
      event.eventType === "set_custom_style"
        ? "incoming"
        : "outgoing";
    const checked = checkAction(
      event,
      this.generation,
      this.clientVersion,
      "04h",
      direction,
    );
    if (checked) return checked;
    if (event.eventType === "web_app_invoke_custom_method")
      return this.invoke(event);
    if (event.eventType === "custom_method_invoked")
      return this.acceptCustomMethodReply(event.eventData);
    // These legacy events belong to Telegram's parent-frame bridge. They are not
    // interpreted as CSS or reload authority by the native direct-guest adapter.
    if (event.eventType === "reload_iframe")
      return isEmptyPayload(event.eventData)
        ? action("unsupported")
        : action("invalid");
    if (event.eventType === "set_custom_style")
      return typeof event.eventData === "string" &&
        event.eventData.length <= 16_384
        ? action("unsupported")
        : action("invalid");
    return action("unsupported");
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return false;
    this.generation = nextGeneration;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
    return true;
  }

  private async invoke(event: ProtocolEvent): Promise<ActionResult> {
    const input = event.eventData;
    if (
      !exactRecord(input, ["req_id", "method", "params"]) ||
      typeof input.req_id !== "string" ||
      !CUSTOM_REQUEST_ID.test(input.req_id) ||
      typeof input.method !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_.]{0,127}$/u.test(input.method) ||
      !isRecord(input.params) ||
      !boundedJson(input.params)
    )
      return action("invalid");
    const reqId = input.req_id;
    if (this.active.has(reqId)) return action("denied");
    const controller = new AbortController();
    this.active.set(reqId, controller);
    const generation = this.generation;
    try {
      if (isCloudStorageMethod(input.method) && this.cloudStorage) {
        const result = await this.cloudStorage.invokeCloud({
          method: input.method,
          params: input.params,
        });
        if (generation !== this.generation) return action("stale");
        if (
          (result.status === "applied" || result.status === "simulated") &&
          boundedJson(result.value)
        ) {
          return action(result.status, [
            {
              eventType: "custom_method_invoked",
              eventData: { req_id: reqId, result: result.value },
            },
          ]);
        }
        return this.methodFailure(
          reqId,
          result.error ??
            (result.status === "invalid" ? "INVALID_INPUT" : "UNSUPPORTED"),
          result.status === "unsupported" ? "unsupported" : "denied",
        );
      }
      if (this.mode !== "real" || !this.methodProvider)
        return this.methodFailure(reqId, "UNSUPPORTED", "unsupported");
      const outcome = await this.methodProvider.invoke({
        method: input.method,
        params: input.params,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return action("stale");
      if (generation !== this.generation) return action("stale");
      if (outcome.status === "ok" && boundedJson(outcome.result))
        return action("applied", [
          {
            eventType: "custom_method_invoked",
            eventData: { req_id: reqId, result: outcome.result },
          },
        ]);
      return this.methodFailure(
        reqId,
        outcome.status === "error"
          ? outcome.error
          : outcome.status === "cancelled"
            ? "CANCELLED"
            : "RESPONSE_TOO_LARGE",
        outcome.status === "cancelled" ? "denied" : "denied",
      );
    } catch {
      if (generation !== this.generation) return action("stale");
      return this.methodFailure(reqId, "UNAVAILABLE", "denied");
    } finally {
      if (this.active.get(reqId) === controller) this.active.delete(reqId);
    }
  }

  private acceptCustomMethodReply(input: unknown): ActionResult {
    if (
      !isRecord(input) ||
      !CUSTOM_REQUEST_ID.test(String(input.req_id ?? "")) ||
      !this.active.has(String(input.req_id))
    )
      return action("stale");
    const hasResult = Object.hasOwn(input, "result");
    const hasError = Object.hasOwn(input, "error");
    if (
      hasResult === hasError ||
      Object.keys(input).some(
        (key) => !["req_id", "result", "error"].includes(key),
      )
    )
      return action("invalid");
    if (hasResult && !boundedJson(input.result)) return action("invalid");
    if (
      hasError &&
      (typeof input.error !== "string" ||
        input.error.length === 0 ||
        input.error.length > 256)
    )
      return action("invalid");
    return action("applied");
  }

  private methodFailure(
    reqId: string,
    error: string,
    status: "denied" | "unsupported",
  ): ActionResult {
    return action(status, [
      {
        eventType: "custom_method_invoked",
        eventData: { req_id: reqId, error: safeError(error) },
      },
    ]);
  }
}

export interface OAuthResultContext {
  /** Request key is host generated and never sent to the guest. */
  requestId: string;
  navigationGeneration: number;
  origin: string;
  currentOrigin(): string;
  currentNavigationGeneration(): number;
}
export type OAuthProviderResult =
  | { status: "confirmed"; resultUrl: string | null }
  | { status: "cancelled" | "failed" };
export interface OAuthAuthorizationProvider {
  request(
    deepLink: string,
    inAppOrigin: string,
    signal: AbortSignal,
  ): Promise<OAuthProviderResult>;
}
export interface OAuthFlowStart {
  status: "applied" | "denied" | "invalid" | "unsupported";
  replies: Array<{ eventType: string; eventData: unknown }>;
  completion: Promise<ActionResult>;
}

/** Testable OAuth broker seam; unconfigured hosts explicitly do not advertise support. */
export class OAuthBroker {
  private active = new Map<
    string,
    { controller: AbortController; context: OAuthResultContext }
  >();
  constructor(private readonly provider?: OAuthAuthorizationProvider) {}

  async handle(
    input: unknown,
    context: OAuthResultContext,
  ): Promise<ActionResult> {
    const started = this.begin(input, context);
    const completed = await started.completion;
    return action(completed.status, [...started.replies, ...completed.replies]);
  }

  /** Makes the capability reply available before waiting on OAuth confirmation. */
  begin(input: unknown, context: OAuthResultContext): OAuthFlowStart {
    if (!this.provider)
      return {
        status: "unsupported",
        replies: [],
        completion: Promise.resolve(action("unsupported")),
      };
    const origin = canonicalWebOrigin(context.origin);
    if (
      !origin ||
      canonicalWebOrigin(context.currentOrigin()) !== origin ||
      context.currentNavigationGeneration() !== context.navigationGeneration ||
      context.requestId.length === 0 ||
      context.requestId.length > 128
    )
      return {
        status: "invalid",
        replies: [],
        completion: Promise.resolve(action("invalid")),
      };
    if (!exactRecord(input, []) && !exactRecord(input, ["url"])) {
      return {
        status: "denied",
        replies: [oauthSupported],
        completion: Promise.resolve(action("denied", [oauthFailed])),
      };
    }
    if (input.url === undefined)
      return {
        status: "applied",
        replies: [oauthSupported],
        completion: Promise.resolve(action("applied")),
      };
    if (typeof input.url !== "string" || !isOAuthDeepLink(input.url))
      return {
        status: "denied",
        replies: [oauthSupported],
        completion: Promise.resolve(action("denied", [oauthFailed])),
      };
    if (this.active.has(context.requestId))
      return {
        status: "denied",
        replies: [oauthSupported],
        completion: Promise.resolve(action("denied", [oauthFailed])),
      };
    const controller = new AbortController();
    const captured = {
      ...context,
      origin,
      currentOrigin: context.currentOrigin.bind(context),
      currentNavigationGeneration:
        context.currentNavigationGeneration.bind(context),
    };
    this.active.set(context.requestId, { controller, context: captured });
    const provider = this.provider;
    const completion = Promise.resolve()
      .then(() =>
        provider.request(input.url as string, origin, controller.signal),
      )
      .then((outcome) => {
        if (!this.isCurrent(context.requestId, captured))
          return action("stale");
        if (controller.signal.aborted) return action("denied", [oauthFailed]);
        if (
          outcome.status !== "confirmed" ||
          (outcome.resultUrl !== null &&
            (typeof outcome.resultUrl !== "string" ||
              outcome.resultUrl.length > 4096))
        )
          return action("denied", [oauthFailed]);
        return action("applied", [
          {
            eventType: "oauth_result_confirmed",
            eventData: { result_url: outcome.resultUrl },
          },
        ]);
      })
      .catch(() =>
        this.isCurrent(context.requestId, captured)
          ? action("denied", [oauthFailed])
          : action("stale"),
      )
      .finally(() => {
        const current = this.active.get(context.requestId);
        if (current?.context === captured)
          this.active.delete(context.requestId);
      });
    return { status: "applied", replies: [oauthSupported], completion };
  }

  cancel(requestId: string): boolean {
    const active = this.active.get(requestId);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  navigate(nextGeneration: number, nextOrigin: string): void {
    for (const [id, active] of this.active) {
      if (
        active.context.navigationGeneration !== nextGeneration ||
        active.context.origin !== canonicalWebOrigin(nextOrigin)
      ) {
        active.controller.abort();
        this.active.delete(id);
      }
    }
  }

  private isCurrent(requestId: string, context: OAuthResultContext): boolean {
    const entry = this.active.get(requestId);
    return (
      entry?.context === context &&
      context.currentNavigationGeneration() === context.navigationGeneration &&
      canonicalWebOrigin(context.currentOrigin()) === context.origin
    );
  }
}

const oauthSupported = {
  eventType: "oauth_supported",
  eventData: { version: 1 },
};
const oauthFailed = { eventType: "oauth_result_failed", eventData: null };

export function isOAuthDeepLink(value: string): boolean {
  if (
    !value ||
    value.length > 4096 ||
    [...value].some((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code <= 0x20 || code === 0x7f;
    })
  )
    return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.port && url.port !== "443") return false;
    if (url.protocol === "tg:" && url.port) return false;
    if (
      url.protocol === "tg:" &&
      url.hostname === "oauth" &&
      url.pathname === "" &&
      url.searchParams.size === 1 &&
      url.searchParams.get("token")
    )
      return true;
    if (
      url.protocol === "tg:" &&
      url.hostname === "resolve" &&
      url.pathname === "" &&
      url.searchParams.size === 2 &&
      url.searchParams.get("domain") === "oauth" &&
      url.searchParams.get("startapp")
    )
      return true;
    return (
      url.protocol === "https:" &&
      url.hostname === "t.me" &&
      url.pathname === "/oauth" &&
      url.searchParams.size === 1 &&
      Boolean(url.searchParams.get("startapp"))
    );
  } catch {
    return false;
  }
}

export function validate04hIncoming(
  eventType: string,
  input: unknown,
): boolean {
  switch (eventType) {
    case "custom_method_invoked":
      return (
        isRecord(input) &&
        CUSTOM_REQUEST_ID.test(String(input.req_id ?? "")) &&
        ((Object.keys(input).length === 2 &&
          Object.hasOwn(input, "result") &&
          boundedJson(input.result)) ||
          (Object.keys(input).length === 2 &&
            typeof input.error === "string" &&
            input.error.length > 0 &&
            input.error.length <= 256))
      );
    case "emoji_status_access_requested":
      return (
        exactRecord(input, ["status"]) &&
        (input.status === "allowed" || input.status === "cancelled")
      );
    case "emoji_status_failed":
      return (
        exactRecord(input, ["error"]) &&
        [
          "UNSUPPORTED",
          "SUGGESTED_EMOJI_INVALID",
          "DURATION_INVALID",
          "USER_DECLINED",
          "SERVER_ERROR",
          "UNKNOWN_ERROR",
        ].includes(String(input.error))
      );
    case "emoji_status_set":
    case "home_screen_added":
      return input === null;
    case "home_screen_checked":
      return (
        exactRecord(input, ["status"]) &&
        ["added", "missed", "unknown", "unsupported"].includes(
          String(input.status),
        )
      );
    case "home_screen_failed":
      return exactRecord(input, ["error"]) && input.error === "UNSUPPORTED";
    case "requested_chat_sent":
      return (
        exactRecord(input, ["req_id"]) &&
        typeof input.req_id === "string" &&
        input.req_id.length > 0 &&
        input.req_id.length <= 256
      );
    case "requested_chat_failed":
      return (
        (exactRecord(input, ["req_id"]) ||
          exactRecord(input, ["req_id", "error"])) &&
        typeof input.req_id === "string" &&
        input.req_id.length > 0 &&
        input.req_id.length <= 256 &&
        (input.error === undefined ||
          (typeof input.error === "string" && input.error.length <= 256))
      );
    case "reload_iframe":
      return isEmptyPayload(input);
    case "set_custom_style":
      return typeof input === "string" && input.length <= 16_384;
    default:
      return false;
  }
}

function isCloudStorageMethod(value: string): boolean {
  return [
    "saveStorageValue",
    "getStorageValues",
    "deleteStorageValues",
    "getStorageKeys",
  ].includes(value);
}
function canonicalWebOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (url.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin !== value
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function boundedJson(root: unknown): boolean {
  try {
    const raw = JSON.stringify(root);
    if (
      typeof raw !== "string" ||
      new TextEncoder().encode(raw).byteLength > MAX_CUSTOM_JSON_BYTES
    )
      return false;
    const parsed = JSON.parse(raw) as unknown;
    const stack: Array<{ value: unknown; depth: number }> = [
      { value: parsed, depth: 0 },
    ];
    let nodes = 0;
    while (stack.length) {
      const current = stack.pop();
      if (!current || ++nodes > 8192 || current.depth > 32) return false;
      if (
        current.value === null ||
        typeof current.value === "string" ||
        typeof current.value === "boolean"
      )
        continue;
      if (typeof current.value === "number") {
        if (!Number.isFinite(current.value)) return false;
        continue;
      }
      if (Array.isArray(current.value))
        for (const value of current.value)
          stack.push({ value, depth: current.depth + 1 });
      else if (isRecord(current.value))
        for (const value of Object.values(current.value))
          stack.push({ value, depth: current.depth + 1 });
      else return false;
    }
    return true;
  } catch {
    return false;
  }
}
function safeError(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_.-]/gu, "_")
      .slice(0, 128) || "UNAVAILABLE"
  );
}
function isEmptyPayload(value: unknown): boolean {
  return value === null || value === "";
}
