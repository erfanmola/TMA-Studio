import type { Identity } from "./entities";
import type { MockUserFields, ProjectReference } from "./users-service";

export type SafeIdentity =
  | Extract<Identity, { kind: "mock" }>
  | Omit<Extract<Identity, { kind: "telegram" }>, "accountRef">;

export type UsersCommand =
  | { method: "list-identities" }
  | { method: "get-identity"; identityId: string }
  | { method: "list-project-references"; identityId: string }
  | {
      method: "save-mock";
      fields: MockUserFields;
      identityId?: string;
      expectedRevision?: number;
    }
  | {
      method: "delete-mock";
      identityId: string;
      expectedRevision: number;
      reassignToId?: string;
    };

export interface UsersRequest {
  requestId: string;
  command: UsersCommand;
}
export type UsersResult =
  | SafeIdentity[]
  | SafeIdentity
  | ProjectReference[]
  | null;
export type UsersReply =
  | { requestId: string; ok: true; result: UsersResult }
  | {
      requestId: string;
      ok: false;
      error: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL";
    };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function safeFields(value: unknown): value is MockUserFields {
  if (
    !record(value) ||
    !exactKeys(value, [
      "telegramId",
      "firstName",
      "lastName",
      "username",
      "languageCode",
      "isPremium",
      "photoUrl",
    ]) ||
    !text(value.telegramId, 32) ||
    !text(value.firstName, 128) ||
    !text(value.languageCode, 16) ||
    typeof value.isPremium !== "boolean"
  )
    return false;
  return (
    (value.lastName === undefined || text(value.lastName, 128)) &&
    (value.username === undefined || text(value.username, 128)) &&
    (value.photoUrl === undefined || text(value.photoUrl, 2048))
  );
}

/** Strictly validate renderer input before invoking the persistent host service. */
export function parseUsersRequest(value: unknown): UsersRequest | null {
  try {
    if (JSON.stringify(value).length > 8192) return null;
  } catch {
    return null;
  }
  if (
    !record(value) ||
    !exactKeys(value, ["requestId", "command"]) ||
    !text(value.requestId, 64) ||
    !/^[\w-]+$/u.test(value.requestId) ||
    !record(value.command) ||
    !text(value.command.method, 32)
  )
    return null;
  const command = value.command;
  switch (command.method) {
    case "list-identities":
      return exactKeys(command, ["method"])
        ? { requestId: value.requestId, command: { method: command.method } }
        : null;
    case "get-identity":
    case "list-project-references":
      return exactKeys(command, ["method", "identityId"]) &&
        text(command.identityId, 128)
        ? {
            requestId: value.requestId,
            command: { method: command.method, identityId: command.identityId },
          }
        : null;
    case "save-mock":
      return exactKeys(command, [
        "method",
        "fields",
        "identityId",
        "expectedRevision",
      ]) &&
        safeFields(command.fields) &&
        (command.identityId === undefined || text(command.identityId, 128)) &&
        (command.expectedRevision === undefined ||
          (Number.isSafeInteger(command.expectedRevision) &&
            Number(command.expectedRevision) > 0))
        ? {
            requestId: value.requestId,
            command: {
              method: command.method,
              fields: command.fields,
              ...(typeof command.identityId === "string"
                ? { identityId: command.identityId }
                : {}),
              ...(typeof command.expectedRevision === "number"
                ? { expectedRevision: command.expectedRevision }
                : {}),
            },
          }
        : null;
    case "delete-mock":
      return exactKeys(command, [
        "method",
        "identityId",
        "expectedRevision",
        "reassignToId",
      ]) &&
        text(command.identityId, 128) &&
        Number.isSafeInteger(command.expectedRevision) &&
        Number(command.expectedRevision) > 0 &&
        (command.reassignToId === undefined || text(command.reassignToId, 128))
        ? {
            requestId: value.requestId,
            command: {
              method: command.method,
              identityId: command.identityId,
              expectedRevision: command.expectedRevision as number,
              ...(typeof command.reassignToId === "string"
                ? { reassignToId: command.reassignToId }
                : {}),
            },
          }
        : null;
    default:
      return null;
  }
}

const FORBIDDEN_KEYS = new Set([
  "accountRef",
  "session",
  "phone",
  "phoneCodeHash",
  "password",
  "apiHash",
  "token",
]);
function safeValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(safeValue);
  if (!record(value)) return value === null || typeof value !== "object";
  return Object.entries(value).every(
    ([key, child]) => !FORBIDDEN_KEYS.has(key) && safeValue(child),
  );
}
export function safeUsersReply(
  requestId: string,
  result: UsersResult,
): UsersReply {
  const encoded = JSON.stringify(result);
  if (encoded.length > 16_384 || !safeValue(result))
    return { requestId, ok: false, error: "INTERNAL" };
  return { requestId, ok: true, result };
}
