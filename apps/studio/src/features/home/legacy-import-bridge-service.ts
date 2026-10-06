import type {
  LegacyImportCommand,
  LegacyImportOutcome,
  LegacyImportReply,
  LegacyImportResult,
  LegacyImportWarning,
} from "../../contracts/legacy-import-rpc";
import { nextRequestId } from "../users/request-id";

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: LegacyImportReply | null) => void;
const warningCodes = [
  "invalid-bot-tokens-not-imported",
  "invalid-mock-photos-omitted",
  "colliding-project-ids-remapped",
  "duplicate-mock-users-deduplicated",
  "legacy-profile-choices-not-retained",
  "per-profile-window-state-not-imported",
  "unsupported-platforms-skipped",
  "unsupported-preferences-skipped",
  "existing-preferences-retained",
  "active-mock-user-unavailable",
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeWarning(value: unknown): value is LegacyImportWarning {
  return (
    record(value) &&
    typeof value.code === "string" &&
    warningCodes.includes(value.code as (typeof warningCodes)[number]) &&
    Number.isSafeInteger(value.count) &&
    Number(value.count) >= 0
  );
}

function safePreview(value: unknown): value is LegacyImportResult {
  if (!record(value)) return false;
  if (
    !/^[0-9a-f]{64}$/u.test(String(value.sourceSha256)) ||
    !Number.isSafeInteger(value.projectCount) ||
    Number(value.projectCount) < 0 ||
    !Number.isSafeInteger(value.mockUserCount) ||
    Number(value.mockUserCount) < 0 ||
    !Number.isSafeInteger(value.importableTokenCount) ||
    Number(value.importableTokenCount) < 0 ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(safeWarning) ||
    !record(value.platformMappings)
  ) {
    return false;
  }
  return Object.entries(value.platformMappings).every(
    ([source, target]) =>
      ["android", "ios", "tdesktop", "macos", "web", "weba"].includes(source) &&
      ["android", "ios", "tdesktop", "macos", "webk", "weba"].includes(
        String(target),
      ),
  );
}

function safeOutcome(value: unknown): value is LegacyImportOutcome {
  if (!record(value) || typeof value.state !== "string") return false;
  if (value.state === "not-found" || value.state === "canceled") return true;
  if (value.state === "preview") return safePreview(value.preview);
  if (value.state === "imported" || value.state === "already-imported") {
    return (
      safePreview(value.result) &&
      ["imported", "already-imported"].includes(
        String((value.result as LegacyImportResult).status),
      ) &&
      Number.isSafeInteger(
        (value.result as LegacyImportResult).importedProjectCount,
      ) &&
      Number.isSafeInteger(
        (value.result as LegacyImportResult).importedIdentityCount,
      ) &&
      typeof (value.result as LegacyImportResult).preferencesImported ===
        "boolean"
    );
  }
  return false;
}

/** Trusted renderer proxy; file paths and token contents stay in the host. */
export class LegacyImportBridgeService {
  private readonly pending = new Map<string, Pending>();
  private readonly bridge: Bridge;
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    if (
      value.ok === false &&
      [
        "INVALID_INPUT",
        "UNSUPPORTED_SCHEMA",
        "VAULT_UNAVAILABLE",
        "BACKUP_FAILED",
        "IMPORT_FAILED",
      ].includes(String(value.error))
    ) {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: value.error as Extract<
          LegacyImportReply,
          { ok: false }
        >["error"],
      });
    } else if (value.ok === true && safeOutcome(value.result)) {
      resolve({ requestId: value.requestId, ok: true, result: value.result });
    } else {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: "IMPORT_FAILED",
      });
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new Error("The trusted import bridge is unavailable.");
    this.bridge = bridge;
    bridge.on("legacy-import.reply", this.receive);
  }

  request(method: LegacyImportCommand["method"]): Promise<LegacyImportOutcome> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Legacy import did not complete."));
      }, 60_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (!reply?.ok) reject(new Error(reply?.error ?? "IMPORT_FAILED"));
        else resolve(reply.result);
      });
      this.bridge.send(
        "legacy-import.request",
        JSON.stringify({ requestId, command: { method } }),
      );
    });
  }

  close(): void {
    this.bridge.off?.("legacy-import.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "IMPORT_FAILED" });
    }
    this.pending.clear();
  }
}
