import type {
  AccountIdentityView,
  AccountStatus,
  LoginState,
} from "./account-service";

export type AccountCommand =
  | { method: "status" }
  | { method: "list-accounts" }
  | { method: "begin-phone-login"; phone: string }
  | { method: "submit-code"; challengeId: string; code: string }
  | { method: "submit-password"; challengeId: string; password: string }
  | { method: "cancel"; challengeId?: string }
  | { method: "refresh"; identityId: string };

export interface AccountRequest {
  requestId: string;
  command: AccountCommand;
}
export type AccountResult = AccountStatus | LoginState | AccountIdentityView[];
export type AccountReply =
  | { requestId: string; ok: true; result: AccountResult }
  | { requestId: string; ok: false; error: "INVALID_INPUT" | "UNAVAILABLE" };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/** Strictly validate the untyped Bunium message before it reaches a host service. */
export function parseAccountRequest(value: unknown): AccountRequest | null {
  try {
    if (JSON.stringify(value).length > 4096) return null;
  } catch {
    return null;
  }
  if (!record(value) || !exactKeys(value, ["requestId", "command"]))
    return null;
  if (
    !boundedText(value.requestId, 64) ||
    !/^[\w-]+$/u.test(value.requestId) ||
    !record(value.command)
  )
    return null;
  const command = value.command;
  if (!boundedText(command.method, 32)) return null;
  switch (command.method) {
    case "status":
      return exactKeys(command, ["method"])
        ? { requestId: value.requestId, command: { method: "status" } }
        : null;
    case "list-accounts":
      return exactKeys(command, ["method"])
        ? { requestId: value.requestId, command: { method: "list-accounts" } }
        : null;
    case "begin-phone-login":
      return exactKeys(command, ["method", "phone"]) &&
        boundedText(command.phone, 16)
        ? {
            requestId: value.requestId,
            command: { method: command.method, phone: command.phone },
          }
        : null;
    case "submit-code":
      return exactKeys(command, ["method", "challengeId", "code"]) &&
        boundedText(command.challengeId, 64) &&
        boundedText(command.code, 8)
        ? {
            requestId: value.requestId,
            command: {
              method: command.method,
              challengeId: command.challengeId,
              code: command.code,
            },
          }
        : null;
    case "submit-password":
      return exactKeys(command, ["method", "challengeId", "password"]) &&
        boundedText(command.challengeId, 64) &&
        boundedText(command.password, 256)
        ? {
            requestId: value.requestId,
            command: {
              method: command.method,
              challengeId: command.challengeId,
              password: command.password,
            },
          }
        : null;
    case "cancel":
      return exactKeys(command, ["method", "challengeId"]) &&
        (command.challengeId === undefined ||
          boundedText(command.challengeId, 64))
        ? {
            requestId: value.requestId,
            command: {
              method: command.method,
              ...(typeof command.challengeId === "string"
                ? { challengeId: command.challengeId }
                : {}),
            },
          }
        : null;
    case "refresh":
      return exactKeys(command, ["method", "identityId"]) &&
        boundedText(command.identityId, 128)
        ? {
            requestId: value.requestId,
            command: { method: command.method, identityId: command.identityId },
          }
        : null;
    default:
      return null;
  }
}

const FORBIDDEN_RESULT_KEYS = new Set([
  "session",
  "sessionString",
  "phone",
  "phoneCodeHash",
  "password",
  "apiHash",
  "token",
  "accountRef",
]);
function resultIsSafe(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(resultIsSafe);
  if (!record(value))
    return (
      value === null || ["string", "number", "boolean"].includes(typeof value)
    );
  return Object.entries(value).every(
    ([key, child]) => !FORBIDDEN_RESULT_KEYS.has(key) && resultIsSafe(child),
  );
}

export function safeAccountReply(
  requestId: string,
  result: AccountResult,
): AccountReply {
  const encoded = JSON.stringify(result);
  if (encoded.length > 16_384 || !resultIsSafe(result))
    return { requestId, ok: false, error: "UNAVAILABLE" };
  return { requestId, ok: true, result };
}
