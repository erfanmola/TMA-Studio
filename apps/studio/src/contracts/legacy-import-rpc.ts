import type { Platform } from "./entities";

export type LegacyWarningCode =
  | "invalid-bot-tokens-not-imported"
  | "invalid-mock-photos-omitted"
  | "colliding-project-ids-remapped"
  | "duplicate-mock-users-deduplicated"
  | "legacy-profile-choices-not-retained"
  | "per-profile-window-state-not-imported"
  | "unsupported-platforms-skipped"
  | "unsupported-preferences-skipped"
  | "existing-preferences-retained"
  | "active-mock-user-unavailable";

export interface LegacyImportWarning {
  code: LegacyWarningCode;
  count: number;
}

export interface LegacyImportPreview {
  sourceSha256: string;
  projectCount: number;
  mockUserCount: number;
  importableTokenCount: number;
  warnings: LegacyImportWarning[];
  platformMappings: Readonly<Record<string, Platform>>;
}

export interface LegacyImportResult extends LegacyImportPreview {
  status: "imported" | "already-imported";
  importedIdentityCount: number;
  importedProjectCount: number;
  preferencesImported: boolean;
}

export type LegacyImportCommand = { method: "detect" | "choose" | "import" };
export interface LegacyImportRequest {
  requestId: string;
  command: LegacyImportCommand;
}

export type LegacyImportOutcome =
  | { state: "not-found" }
  | { state: "canceled" }
  | { state: "preview"; preview: LegacyImportPreview }
  | { state: "imported" | "already-imported"; result: LegacyImportResult };

export type LegacyImportReply =
  | { requestId: string; ok: true; result: LegacyImportOutcome }
  | {
      requestId: string;
      ok: false;
      error:
        | "INVALID_INPUT"
        | "UNSUPPORTED_SCHEMA"
        | "VAULT_UNAVAILABLE"
        | "BACKUP_FAILED"
        | "IMPORT_FAILED";
    };

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function parseLegacyImportRequest(
  value: unknown,
): LegacyImportRequest | null {
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
    !exactKeys(candidate.command, ["method"]) ||
    !["detect", "choose", "import"].includes(String(candidate.command.method))
  ) {
    return null;
  }
  return {
    requestId: candidate.requestId,
    command: {
      method: candidate.command.method as LegacyImportCommand["method"],
    },
  };
}

function safePreview(value: LegacyImportPreview): boolean {
  return (
    /^[0-9a-f]{64}$/u.test(value.sourceSha256) &&
    Number.isSafeInteger(value.projectCount) &&
    value.projectCount >= 0 &&
    Number.isSafeInteger(value.mockUserCount) &&
    value.mockUserCount >= 0 &&
    Number.isSafeInteger(value.importableTokenCount) &&
    value.importableTokenCount >= 0 &&
    value.warnings.length <= 32 &&
    value.warnings.every(
      (warning) =>
        typeof warning.code === "string" &&
        Number.isSafeInteger(warning.count) &&
        warning.count >= 0,
    ) &&
    Object.entries(value.platformMappings).every(
      ([source, target]) =>
        ["android", "ios", "tdesktop", "macos", "web", "weba"].includes(
          source,
        ) &&
        ["android", "ios", "tdesktop", "macos", "webk", "weba"].includes(
          target,
        ),
    )
  );
}

export function safeLegacyImportReply(
  requestId: string,
  result: LegacyImportOutcome,
): LegacyImportReply {
  if (result.state === "preview" && !safePreview(result.preview)) {
    return { requestId, ok: false, error: "IMPORT_FAILED" };
  }
  if (
    (result.state === "imported" || result.state === "already-imported") &&
    (!safePreview(result.result) ||
      !Number.isSafeInteger(result.result.importedProjectCount) ||
      !Number.isSafeInteger(result.result.importedIdentityCount) ||
      typeof result.result.preferencesImported !== "boolean")
  ) {
    return { requestId, ok: false, error: "IMPORT_FAILED" };
  }
  const reply: LegacyImportReply = { requestId, ok: true, result };
  return JSON.stringify(reply).length <= 32_768
    ? reply
    : { requestId, ok: false, error: "IMPORT_FAILED" };
}
