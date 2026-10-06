import type {
  StorageScanResult,
  StorageUsageRow,
} from "../../contracts/storage-rpc";
import {
  BuniumStorageBridgeService,
  type StoragePort,
  StorageServiceError,
} from "./storage-bridge-service";

/** Development-only in-memory storage for review scenes. */
export class MemoryStorageService implements StoragePort {
  private rows: StorageUsageRow[];
  failScan: null | "PARTIAL" | "INTERNAL" = null;
  failClear: string | null = null;

  constructor() {
    const now = new Date(0).toISOString();
    this.rows = [
      {
        partitionId: "part-android",
        projectId: "project-orbit",
        identityId: "identity-alex",
        platform: "android",
        bytes: 3_145_728,
        status: "ready",
        fileCount: 42,
        measuredAt: now,
      },
      {
        partitionId: "part-ios",
        projectId: "project-orbit",
        identityId: "identity-alex",
        platform: "ios",
        bytes: null,
        status: "unknown",
        fileCount: 0,
        measuredAt: now,
      },
    ];
  }

  async scan(signal?: AbortSignal): Promise<StorageScanResult> {
    if (signal?.aborted) throw new StorageServiceError("ABORTED");
    if (this.failScan === "PARTIAL") throw new StorageServiceError("PARTIAL");
    if (this.failScan === "INTERNAL") throw new StorageServiceError("INTERNAL");
    return {
      rows: this.rows.map((row) => ({ ...row })),
      scannedAt: new Date(0).toISOString(),
      errors: [],
    };
  }

  async clearCache(partitionId: string): Promise<StorageUsageRow> {
    const row = this.rows.find((entry) => entry.partitionId === partitionId);
    if (!row) throw new StorageServiceError("NOT_FOUND");
    if (this.failClear === partitionId)
      throw new StorageServiceError("INTERNAL");
    if (row.bytes !== null) row.bytes = Math.floor(row.bytes / 2);
    row.status = "ready";
    return { ...row };
  }

  async clearSiteData(partitionId: string): Promise<StorageUsageRow> {
    const row = this.rows.find((entry) => entry.partitionId === partitionId);
    if (!row) throw new StorageServiceError("NOT_FOUND");
    if (this.failClear === partitionId)
      throw new StorageServiceError("INTERNAL");
    row.bytes = 0;
    row.status = "ready";
    return { ...row };
  }
}

export type { StoragePort };
export { BuniumStorageBridgeService, StorageServiceError };
