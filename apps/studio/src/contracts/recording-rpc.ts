export type RecordingState = "idle" | "recording" | "finalizing" | "failed";

export interface RecordingStatus {
  state: RecordingState;
  simulatorId: string | null;
  framesAccepted: number;
  framesDropped: number;
  bytesBuffered: number;
  elapsedMs: number;
  error: "DISK_FULL" | "CRASHED" | "INTERNAL" | null;
}

export type RecordingCommand =
  | { method: "start"; simulatorId: string }
  | { method: "stop" }
  | { method: "cancel" }
  | { method: "status" };
export type RecordingRequest = { requestId: string; command: RecordingCommand };
export type RecordingReply =
  | { requestId: string; ok: true; result: RecordingStatus }
  | {
      requestId: string;
      ok: false;
      error:
        | "INVALID_INPUT"
        | "NOT_RECORDING"
        | "ALREADY_RECORDING"
        | "INTERNAL";
    };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function validSimulatorId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  );
}

export function parseRecordingRequest(value: unknown): RecordingRequest | null {
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
  if (command.method === "start") {
    if (!exactKeys(command, ["method", "simulatorId"])) return null;
    if (!validSimulatorId(command.simulatorId)) return null;
    return {
      requestId: candidate.requestId,
      command: { method: "start", simulatorId: command.simulatorId as string },
    };
  }
  if (
    (command.method === "stop" ||
      command.method === "cancel" ||
      command.method === "status") &&
    exactKeys(command, ["method"])
  ) {
    return {
      requestId: candidate.requestId,
      command: { method: command.method },
    };
  }
  return null;
}
