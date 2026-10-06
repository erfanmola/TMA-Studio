import type {
  AccountCommand,
  AccountReply,
  AccountResult,
} from "../../contracts/account-rpc";
import type {
  AccountIdentityView,
  AccountService,
  AccountStatus,
  LoginState,
} from "../../contracts/account-service";
import { nextRequestId } from "./request-id";

type Bridge = NonNullable<Window["__bunium"]>;
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function safeResult(value: unknown): value is AccountResult {
  if (Array.isArray(value))
    return value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        isRecord(entry.profile) &&
        typeof entry.profile.telegramId === "string" &&
        typeof entry.profile.firstName === "string" &&
        ["ready", "stale", "reauthorize"].includes(String(entry.status)) &&
        !("accountRef" in entry),
    );
  if (!isRecord(value)) return false;
  if ("providerConfigured" in value)
    return (
      typeof value.providerConfigured === "boolean" && isRecord(value.vault)
    );
  switch (value.state) {
    case "phone":
    case "cancelled":
      return true;
    case "code":
      return (
        typeof value.challengeId === "string" &&
        typeof value.maskedPhone === "string" &&
        typeof value.expiresAt === "string"
      );
    case "password":
      return typeof value.challengeId === "string";
    case "flood-wait":
      return (
        typeof value.retryAt === "string" &&
        ["phone", "code", "password"].includes(String(value.resume))
      );
    case "complete":
      return (
        typeof value.identityId === "string" &&
        isRecord(value.profile) &&
        typeof value.profile.telegramId === "string" &&
        typeof value.profile.firstName === "string"
      );
    case "error":
      return ["INVALID_CODE", "EXPIRED", "UNAVAILABLE", "REAUTHORIZE"].includes(
        String(value.code),
      );
    default:
      return false;
  }
}

/** Renderer proxy for Bunium's generic trusted-origin IPC channel. */
export class BuniumAccountBridgeService implements AccountService {
  private readonly bridge: Bridge;
  private readonly pending = new Map<string, (reply: AccountReply) => void>();
  private readonly receive = (payload: unknown) => {
    if (!isRecord(payload) || typeof payload.requestId !== "string") return;
    const resolve = this.pending.get(payload.requestId);
    if (!resolve) return;
    this.pending.delete(payload.requestId);
    if (
      payload.ok === false &&
      ["INVALID_INPUT", "UNAVAILABLE"].includes(String(payload.error))
    ) {
      resolve({
        requestId: payload.requestId,
        ok: false,
        error: payload.error as "INVALID_INPUT" | "UNAVAILABLE",
      });
    } else if (payload.ok === true && safeResult(payload.result)) {
      resolve({
        requestId: payload.requestId,
        ok: true,
        result: payload.result,
      });
    } else {
      resolve({
        requestId: payload.requestId,
        ok: false,
        error: "UNAVAILABLE",
      });
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge)
      throw new Error("The trusted Bunium account bridge is unavailable.");
    this.bridge = bridge;
    bridge.on("account.reply", this.receive);
  }
  status(): Promise<AccountStatus> {
    return this.request({ method: "status" }) as Promise<AccountStatus>;
  }
  listAccounts(): Promise<AccountIdentityView[]> {
    return this.request({ method: "list-accounts" }) as Promise<
      AccountIdentityView[]
    >;
  }
  beginPhoneLogin(phone: string): Promise<LoginState> {
    return this.request({
      method: "begin-phone-login",
      phone,
    }) as Promise<LoginState>;
  }
  submitCode(challengeId: string, code: string): Promise<LoginState> {
    return this.request({
      method: "submit-code",
      challengeId,
      code,
    }) as Promise<LoginState>;
  }
  submitPassword(challengeId: string, password: string): Promise<LoginState> {
    return this.request({
      method: "submit-password",
      challengeId,
      password,
    }) as Promise<LoginState>;
  }
  cancel(challengeId?: string): Promise<LoginState> {
    return this.request({
      method: "cancel",
      ...(challengeId ? { challengeId } : {}),
    }) as Promise<LoginState>;
  }
  refresh(identityId: string): Promise<LoginState> {
    return this.request({
      method: "refresh",
      identityId,
    }) as Promise<LoginState>;
  }
  close(): void {
    this.bridge.off?.("account.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "UNAVAILABLE" });
    }
    this.pending.clear();
  }
  private request(command: AccountCommand): Promise<AccountResult> {
    const requestId = nextRequestId();
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ state: "error", code: "UNAVAILABLE" });
      }, 120_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        resolve(
          reply.ok ? reply.result : { state: "error", code: "UNAVAILABLE" },
        );
      });
      this.bridge.send(
        "account.request",
        JSON.stringify({ requestId, command }),
      );
    });
  }
}
