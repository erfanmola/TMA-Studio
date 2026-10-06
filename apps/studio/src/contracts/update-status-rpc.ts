import type { UpdateStatusRecord } from "./entities";
import { UpdateStatusRecordSchema } from "./schemas";

export type UpdateStatusCommand = { method: "get" };
export type UpdateStatusRequest = {
  requestId: string;
  command: UpdateStatusCommand;
};
export type UpdateStatusReply =
  | { requestId: string; ok: true; result: UpdateStatusRecord }
  | { requestId: string; ok: false; error: "INTERNAL" };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseUpdateStatusRequest(
  value: unknown,
): UpdateStatusRequest | null {
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
  if (
    candidate.command.method === "get" &&
    exactKeys(candidate.command, ["method"])
  ) {
    return { requestId: candidate.requestId, command: { method: "get" } };
  }
  return null;
}

export function safeUpdateStatusReply(
  requestId: string,
  result: UpdateStatusRecord,
): UpdateStatusReply {
  try {
    const parsed = UpdateStatusRecordSchema.parse(
      JSON.parse(JSON.stringify(result)) as unknown,
    );
    if (JSON.stringify(parsed).length <= 16_384) {
      return { requestId, ok: true, result: parsed };
    }
  } catch {
    // Fall through to the fail-closed reply below.
  }
  return { requestId, ok: false, error: "INTERNAL" };
}
