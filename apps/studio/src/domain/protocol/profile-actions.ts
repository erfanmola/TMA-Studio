import {
  type ActionResult,
  action,
  checkAction,
  exactRecord,
} from "./action-utils";
import type { ProtocolEvent } from "./transport";

export interface ProfileActionEffects {
  requestChat(
    requestId: string,
    signal: AbortSignal,
  ): Promise<{
    status: "sent" | "cancelled" | "unsupported" | "failed";
    error?: string;
  }>;
  requestEmojiStatusAccess(
    signal: AbortSignal,
  ): Promise<"allowed" | "cancelled" | "unsupported">;
  setEmojiStatus(
    input: {
      customEmojiId: string;
      duration?: number;
    },
    signal: AbortSignal,
  ): Promise<"set" | "cancelled" | "unsupported" | "failed">;
  switchInlineQuery(
    input: {
      query: string;
      chatTypes: string[];
    },
    signal: AbortSignal,
  ): Promise<"opened" | "cancelled" | "unsupported">;
}

export interface ProfileGestureGate {
  consumeRecentGesture(maxAgeMs: number): boolean;
}

/** Profile actions retain their native/account boundary behind explicit effects. */
export class ProfileActionProtocolService {
  private generation: number;
  private closingConfirmation = false;
  private verticalSwipesAllowed = true;
  private busy = new Map<string, AbortController>();

  constructor(
    private readonly mode: "mock" | "real",
    generation: number,
    private readonly clientVersion: string | undefined,
    private readonly gesture?: ProfileGestureGate,
    private readonly effects?: ProfileActionEffects,
  ) {
    this.generation = generation;
  }

  get closeConfirmationRequired(): boolean {
    return this.closingConfirmation;
  }
  get allowVerticalSwipes(): boolean {
    return this.verticalSwipesAllowed;
  }

  async handle(event: ProtocolEvent): Promise<ActionResult> {
    const checked = checkAction(
      event,
      this.generation,
      this.clientVersion,
      "04h",
      "outgoing",
    );
    if (checked) return checked;
    switch (event.eventType) {
      case "web_app_setup_closing_behavior":
        if (
          !exactRecord(event.eventData, ["need_confirmation"]) ||
          typeof event.eventData.need_confirmation !== "boolean"
        )
          return action("invalid");
        this.closingConfirmation = event.eventData.need_confirmation;
        return action(this.mode === "mock" ? "simulated" : "applied");
      case "web_app_setup_swipe_behavior":
        if (
          !exactRecord(event.eventData, ["allow_vertical_swipe"]) ||
          typeof event.eventData.allow_vertical_swipe !== "boolean"
        )
          return action("invalid");
        this.verticalSwipesAllowed = event.eventData.allow_vertical_swipe;
        return action(this.mode === "mock" ? "simulated" : "applied");
      case "web_app_request_chat":
        return this.requestChat(event);
      case "web_app_request_emoji_status_access":
        return this.requestEmojiAccess(event);
      case "web_app_set_emoji_status":
        return this.setEmojiStatus(event);
      case "web_app_switch_inline_query":
        return this.switchInlineQuery(event);
      default:
        return action("unsupported");
    }
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.generation
    )
      return false;
    this.generation = nextGeneration;
    for (const controller of this.busy.values()) controller.abort();
    this.busy.clear();
    return true;
  }

  cancel(key: "chat" | "emoji-access" | "emoji-set" | "inline-query"): boolean {
    const controller = this.busy.get(key);
    if (!controller) return false;
    controller.abort();
    this.busy.delete(key);
    return true;
  }

  private async requestChat(event: ProtocolEvent): Promise<ActionResult> {
    const input = event.eventData;
    if (
      !exactRecord(input, ["req_id"]) ||
      typeof input.req_id !== "string" ||
      !validOpaqueId(input.req_id, 256)
    )
      return action("invalid");
    const reqId = input.req_id;
    if (this.mode !== "real" || !this.effects)
      return action("unsupported", [
        {
          eventType: "requested_chat_failed",
          eventData: { req_id: reqId },
        },
      ]);
    if (!this.gesture?.consumeRecentGesture(10_000))
      return action("denied", [
        {
          eventType: "requested_chat_failed",
          eventData: { req_id: reqId },
        },
      ]);
    return this.runOneShot(
      "chat",
      event.navigationGeneration,
      async (signal) => {
        try {
          const outcome = await this.effects?.requestChat(reqId, signal);
          if (outcome?.status === "sent")
            return action("applied", [
              {
                eventType: "requested_chat_sent",
                eventData: { req_id: reqId },
              },
            ]);
          const error =
            outcome?.status === "failed" ? safeError(outcome.error) : undefined;
          return action(
            outcome?.status === "unsupported" ? "unsupported" : "denied",
            [
              {
                eventType: "requested_chat_failed",
                eventData: { req_id: reqId, ...(error ? { error } : {}) },
              },
            ],
          );
        } catch {
          return action("denied", [
            {
              eventType: "requested_chat_failed",
              eventData: { req_id: reqId },
            },
          ]);
        }
      },
    );
  }

  private async requestEmojiAccess(
    event: ProtocolEvent,
  ): Promise<ActionResult> {
    if (!isEmptyPayload(event.eventData)) return action("invalid");
    if (this.mode !== "real" || !this.effects)
      return action("unsupported", [
        {
          eventType: "emoji_status_access_requested",
          eventData: { status: "cancelled" },
        },
      ]);
    if (!this.gesture?.consumeRecentGesture(10_000))
      return action("denied", [
        {
          eventType: "emoji_status_access_requested",
          eventData: { status: "cancelled" },
        },
      ]);
    return this.runOneShot(
      "emoji-access",
      event.navigationGeneration,
      async (signal) => {
        try {
          const outcome = await this.effects?.requestEmojiStatusAccess(signal);
          return action(
            outcome === "allowed"
              ? "applied"
              : outcome === "unsupported"
                ? "unsupported"
                : "denied",
            [
              {
                eventType: "emoji_status_access_requested",
                eventData: {
                  status: outcome === "allowed" ? "allowed" : "cancelled",
                },
              },
            ],
          );
        } catch {
          return action("denied", [
            {
              eventType: "emoji_status_access_requested",
              eventData: { status: "cancelled" },
            },
          ]);
        }
      },
    );
  }

  private async setEmojiStatus(event: ProtocolEvent): Promise<ActionResult> {
    const input = event.eventData;
    if (
      !exactRecord(input, ["custom_emoji_id"]) &&
      !exactRecord(input, ["custom_emoji_id", "duration"])
    )
      return action("invalid");
    if (
      typeof input.custom_emoji_id !== "string" ||
      !/^\d{1,20}$/u.test(input.custom_emoji_id) ||
      (input.duration !== undefined &&
        (!Number.isSafeInteger(input.duration) ||
          (input.duration as number) < 0 ||
          (input.duration as number) > 2_147_483_647))
    )
      return action("invalid");
    if (this.mode !== "real" || !this.effects)
      return emojiFailure("UNSUPPORTED", "unsupported");
    if (!this.gesture?.consumeRecentGesture(10_000))
      return emojiFailure("USER_DECLINED", "denied");
    const request = {
      customEmojiId: input.custom_emoji_id,
      ...(typeof input.duration === "number"
        ? { duration: input.duration }
        : {}),
    };
    return this.runOneShot(
      "emoji-set",
      event.navigationGeneration,
      async (signal) => {
        try {
          const outcome = await this.effects?.setEmojiStatus(request, signal);
          return outcome === "set"
            ? action("applied", [
                { eventType: "emoji_status_set", eventData: null },
              ])
            : emojiFailure(
                outcome === "unsupported"
                  ? "UNSUPPORTED"
                  : outcome === "cancelled"
                    ? "USER_DECLINED"
                    : "UNKNOWN_ERROR",
                outcome === "unsupported" ? "unsupported" : "denied",
              );
        } catch {
          return emojiFailure("UNKNOWN_ERROR", "denied");
        }
      },
    );
  }

  private async switchInlineQuery(event: ProtocolEvent): Promise<ActionResult> {
    const input = event.eventData;
    const chatTypes = ["users", "bots", "groups", "channels"];
    if (
      !exactRecord(input, ["query", "chat_types"]) ||
      typeof input.query !== "string" ||
      input.query.length > 256 ||
      !Array.isArray(input.chat_types) ||
      input.chat_types.length > 4 ||
      input.chat_types.some(
        (type) => typeof type !== "string" || !chatTypes.includes(type),
      ) ||
      new Set(input.chat_types).size !== input.chat_types.length
    )
      return action("invalid");
    if (this.mode !== "real" || !this.effects) return action("unsupported");
    const query = input.query;
    const requestedChatTypes = input.chat_types as string[];
    return this.runOneShot(
      "inline-query",
      event.navigationGeneration,
      async (signal) => {
        try {
          const outcome = await this.effects?.switchInlineQuery(
            {
              query,
              chatTypes: requestedChatTypes,
            },
            signal,
          );
          return action(
            outcome === "opened"
              ? "applied"
              : outcome === "cancelled"
                ? "denied"
                : "unsupported",
          );
        } catch {
          return action("denied");
        }
      },
    );
  }

  private async runOneShot(
    key: string,
    generation: number,
    work: (signal: AbortSignal) => Promise<ActionResult>,
  ): Promise<ActionResult> {
    if (this.busy.has(key)) return action("denied");
    const controller = new AbortController();
    this.busy.set(key, controller);
    try {
      const result = await work(controller.signal);
      if (controller.signal.aborted) return action("denied");
      return generation === this.generation ? result : action("stale");
    } finally {
      if (this.busy.get(key) === controller) this.busy.delete(key);
    }
  }
}

function isEmptyPayload(value: unknown): boolean {
  return value === null || value === "";
}
function validOpaqueId(value: string, max: number): boolean {
  return (
    value.length > 0 &&
    value.length <= max &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  );
}
function safeError(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]/gu, "_")
    .slice(0, 128);
  return clean || undefined;
}
function emojiFailure(
  error: string,
  status: "denied" | "unsupported",
): ActionResult {
  return action(status, [
    { eventType: "emoji_status_failed", eventData: { error } },
  ]);
}
