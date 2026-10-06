import type { StudioSettings } from "./entities";
import { StudioSettingsSchema } from "./schemas";

export type SettingsCommand =
  | { method: "load" }
  | { method: "save"; expectedRevision: number; settings: StudioSettings };
export type SettingsRequest = { requestId: string; command: SettingsCommand };
export type SettingsReply =
  | { requestId: string; ok: true; result: StudioSettings }
  | {
      requestId: string;
      ok: false;
      error: "INVALID_INPUT" | "CONFLICT" | "INTERNAL";
    };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseSettingsRequest(value: unknown): SettingsRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 32_768) return null;
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
  if (command.method === "load" && exactKeys(command, ["method"])) {
    return { requestId: candidate.requestId, command: { method: "load" } };
  }
  if (
    command.method === "save" &&
    exactKeys(command, ["method", "expectedRevision", "settings"])
  ) {
    if (
      typeof command.expectedRevision !== "number" ||
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 0
    )
      return null;
    try {
      const settings = StudioSettingsSchema.parse(command.settings);
      return {
        requestId: candidate.requestId,
        command: {
          method: "save",
          expectedRevision: command.expectedRevision,
          settings,
        },
      };
    } catch {
      return null;
    }
  }
  return null;
}

export function safeSettingsReply(
  requestId: string,
  result: StudioSettings,
): SettingsReply {
  const encoded = JSON.stringify(result);
  return encoded.length <= 16_384
    ? { requestId, ok: true, result }
    : { requestId, ok: false, error: "INTERNAL" };
}
