import type { RecentProject } from "./home-service";

export type HomeCommand =
  | { method: "list-recent" }
  | { method: "remove-recent"; projectId: string };
export type HomeRequest = { requestId: string; command: HomeCommand };
export type HomeReply =
  | { requestId: string; ok: true; result: RecentProject[] | null }
  | {
      requestId: string;
      ok: false;
      error: "INVALID_INPUT" | "INTERNAL";
    };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  );
}

/** Validate the trusted renderer's bounded Home command before host storage. */
export function parseHomeRequest(value: unknown): HomeRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 4_096) return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (
    !record(candidate) ||
    !exactKeys(candidate, ["requestId", "command"]) ||
    typeof candidate.requestId !== "string" ||
    !/^[\w-]{1,64}$/u.test(candidate.requestId) ||
    !record(candidate.command) ||
    typeof candidate.command.method !== "string"
  )
    return null;
  const command = candidate.command;
  if (command.method === "list-recent" && exactKeys(command, ["method"])) {
    return {
      requestId: candidate.requestId,
      command: { method: command.method },
    };
  }
  if (
    command.method === "remove-recent" &&
    exactKeys(command, ["method", "projectId"]) &&
    validId(command.projectId)
  ) {
    return {
      requestId: candidate.requestId,
      command: {
        method: command.method,
        projectId: command.projectId,
      },
    };
  }
  return null;
}

export function safeHomeReply(
  requestId: string,
  result: RecentProject[] | null,
): HomeReply {
  const encoded = JSON.stringify(result);
  return encoded.length <= 16_384
    ? { requestId, ok: true, result }
    : { requestId, ok: false, error: "INTERNAL" };
}
