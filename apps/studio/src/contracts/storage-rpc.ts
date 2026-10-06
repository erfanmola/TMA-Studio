export type StorageUsageStatus = "ready" | "unknown" | "error";

export interface StorageUsageRow {
  partitionId: string;
  projectId: string;
  identityId: string;
  platform: string;
  bytes: number | null;
  status: StorageUsageStatus;
  fileCount: number;
  measuredAt: string;
}

export interface StorageScanResult {
  rows: StorageUsageRow[];
  scannedAt: string;
  errors: { partitionId: string; code: string }[];
}

export type StorageCommand =
  | { method: "scan" }
  | { method: "clear-cache"; partitionId: string }
  | { method: "clear-site-data"; partitionId: string };
export type StorageRequest = { requestId: string; command: StorageCommand };
export type StorageReply =
  | { requestId: string; ok: true; result: StorageScanResult | StorageUsageRow }
  | {
      requestId: string;
      ok: false;
      error:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "IN_USE"
        | "ABORTED"
        | "PARTIAL"
        | "INTERNAL";
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

function validRow(value: unknown): value is StorageUsageRow {
  if (!record(value)) return false;
  return (
    typeof value.partitionId === "string" &&
    typeof value.projectId === "string" &&
    typeof value.identityId === "string" &&
    typeof value.platform === "string" &&
    (typeof value.bytes === "number" || value.bytes === null) &&
    ["ready", "unknown", "error"].includes(String(value.status)) &&
    typeof value.fileCount === "number" &&
    typeof value.measuredAt === "string"
  );
}

function validScan(value: unknown): value is StorageScanResult {
  if (!record(value)) return false;
  return (
    Array.isArray(value.rows) &&
    value.rows.every(validRow) &&
    typeof value.scannedAt === "string" &&
    Array.isArray(value.errors)
  );
}

export function parseStorageRequest(value: unknown): StorageRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 16_384) return null;
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
  if (command.method === "scan" && exactKeys(command, ["method"])) {
    return { requestId: candidate.requestId, command: { method: "scan" } };
  }
  if (
    (command.method === "clear-cache" ||
      command.method === "clear-site-data") &&
    exactKeys(command, ["method", "partitionId"]) &&
    validId(command.partitionId)
  ) {
    return {
      requestId: candidate.requestId,
      command: {
        method: command.method,
        partitionId: command.partitionId as string,
      },
    };
  }
  return null;
}

export function safeStorageReply(
  requestId: string,
  result: StorageScanResult | StorageUsageRow,
): StorageReply {
  if (validScan(result) || validRow(result)) {
    const encoded = JSON.stringify(result);
    if (encoded.length <= 65_536) return { requestId, ok: true, result };
  }
  return { requestId, ok: false, error: "INTERNAL" };
}
