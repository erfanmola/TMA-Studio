import { lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type {
  StorageScanResult,
  StorageUsageRow,
} from "../../src/contracts/storage-rpc";
import {
  parseStorageRequest,
  safeStorageReply,
} from "../../src/contracts/storage-rpc";
import type { StudioStore } from "./store";

export class StorageServiceError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "IN_USE"
      | "ABORTED"
      | "PARTIAL"
      | "INTERNAL",
  ) {
    super(code);
    this.name = "StorageServiceError";
  }
}

export interface StoragePartitionInfo {
  id: string;
  projectId: string;
  identityId: string;
  platform: string;
  ephemeral: boolean;
}

export interface StorageRuntime {
  canonicalDirectory(partitionId: string): string;
  isInUse(partitionId: string): boolean;
  clearSiteData(partitionId: string): void;
}

/** Cache-only subpaths (CEF/Chromium layout). Unknown layouts clear nothing. */
const CACHE_SUBPATHS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "Service Worker/CacheStorage",
  "DawnCache",
];

function measureDirectory(
  directory: string,
  signal: AbortSignal | undefined,
  budget: { files: number; bytes: number },
): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  const stack = [directory];
  while (stack.length > 0) {
    if (signal?.aborted) throw new StorageServiceError("ABORTED");
    const current = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { bytes, files };
      throw error;
    }
    for (const entry of entries) {
      if (signal?.aborted) throw new StorageServiceError("ABORTED");
      if (budget.files > 50_000 || budget.bytes > 2_147_483_648) {
        throw new StorageServiceError("INTERNAL");
      }
      const path = join(current, entry);
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        stack.push(path);
      } else if (stat.isFile()) {
        bytes += stat.size;
        files += 1;
        budget.bytes += stat.size;
        budget.files += 1;
      }
    }
  }
  return { bytes, files };
}

/**
 * Host-owned partition usage/clear. Filesystem walks stay inside canonical
 * partition directories; registry/store/vault records are never deleted by
 * clear operations. Site-data clear removes partition content and bumps the
 * runtime generation; cache clear removes only known cache subpaths.
 */
export class HostStorageService {
  constructor(
    private readonly store: StudioStore,
    private readonly runtime: StorageRuntime,
  ) {}

  listTargets(): StoragePartitionInfo[] {
    try {
      return this.store
        .listPartitions()
        .filter((record) => !record.ephemeral)
        .map((record) => ({
          id: record.id,
          projectId: record.projectId,
          identityId: record.identityId,
          platform: record.platform,
          ephemeral: record.ephemeral,
        }));
    } catch {
      throw new StorageServiceError("INTERNAL");
    }
  }

  async scan(signal?: AbortSignal): Promise<StorageScanResult> {
    const targets = this.listTargets();
    const rows: StorageUsageRow[] = [];
    const errors: { partitionId: string; code: string }[] = [];
    const budget = { files: 0, bytes: 0 };
    for (const target of targets) {
      if (signal?.aborted) throw new StorageServiceError("ABORTED");
      const measuredAt = new Date().toISOString();
      let directory: string;
      try {
        directory = this.runtime.canonicalDirectory(target.id);
      } catch {
        rows.push({
          partitionId: target.id,
          projectId: target.projectId,
          identityId: target.identityId,
          platform: target.platform,
          bytes: null,
          status: "error",
          fileCount: 0,
          measuredAt,
        });
        errors.push({ partitionId: target.id, code: "INTERNAL" });
        continue;
      }
      try {
        const { bytes, files } = measureDirectory(directory, signal, budget);
        // Missing directory means never-written usage: unknown, never zero.
        let exists = true;
        try {
          lstatSync(directory);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            exists = false;
          else throw error;
        }
        if (!exists) {
          rows.push({
            partitionId: target.id,
            projectId: target.projectId,
            identityId: target.identityId,
            platform: target.platform,
            bytes: null,
            status: "unknown",
            fileCount: 0,
            measuredAt,
          });
        } else {
          rows.push({
            partitionId: target.id,
            projectId: target.projectId,
            identityId: target.identityId,
            platform: target.platform,
            bytes,
            status: "ready",
            fileCount: files,
            measuredAt,
          });
        }
      } catch (error) {
        if (error instanceof StorageServiceError && error.code === "ABORTED")
          throw error;
        rows.push({
          partitionId: target.id,
          projectId: target.projectId,
          identityId: target.identityId,
          platform: target.platform,
          bytes: null,
          status: "error",
          fileCount: 0,
          measuredAt,
        });
        errors.push({ partitionId: target.id, code: "INTERNAL" });
      }
    }
    return { rows, scannedAt: new Date().toISOString(), errors };
  }

  clearCache(partitionId: string): StorageUsageRow {
    const target = this.requireIdle(partitionId);
    const directory = this.safeDirectory(partitionId);
    for (const sub of CACHE_SUBPATHS) {
      try {
        rmSync(join(directory, sub), { force: true, recursive: true });
      } catch {
        throw new StorageServiceError("INTERNAL");
      }
    }
    return this.remeasure(target);
  }

  clearSiteData(partitionId: string): StorageUsageRow {
    const target = this.requireIdle(partitionId);
    const directory = this.safeDirectory(partitionId);
    try {
      // Remove contents but keep the canonical directory itself so the
      // generation metadata stays valid; runtime then bumps generation.
      for (const entry of readdirSync(directory)) {
        rmSync(join(directory, entry), { force: true, recursive: true });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new StorageServiceError("INTERNAL");
    }
    try {
      this.runtime.clearSiteData(partitionId);
    } catch (error) {
      if (error instanceof StorageServiceError) throw error;
      throw new StorageServiceError("INTERNAL");
    }
    return this.remeasure(target);
  }

  private requireIdle(partitionId: string): StoragePartitionInfo {
    if (typeof partitionId !== "string" || partitionId.length === 0)
      throw new StorageServiceError("INVALID_INPUT");
    const target = this.listTargets().find((entry) => entry.id === partitionId);
    if (!target) throw new StorageServiceError("NOT_FOUND");
    try {
      if (this.runtime.isInUse(partitionId))
        throw new StorageServiceError("IN_USE");
    } catch (error) {
      if (error instanceof StorageServiceError) throw error;
      throw new StorageServiceError("INTERNAL");
    }
    return target;
  }

  private safeDirectory(partitionId: string): string {
    try {
      return this.runtime.canonicalDirectory(partitionId);
    } catch {
      throw new StorageServiceError("INTERNAL");
    }
  }

  private remeasure(target: StoragePartitionInfo): StorageUsageRow {
    const measuredAt = new Date().toISOString();
    try {
      const directory = this.runtime.canonicalDirectory(target.id);
      const { bytes, files } = measureDirectory(directory, undefined, {
        files: 0,
        bytes: 0,
      });
      return {
        partitionId: target.id,
        projectId: target.projectId,
        identityId: target.identityId,
        platform: target.platform,
        bytes,
        status: "ready",
        fileCount: files,
        measuredAt,
      };
    } catch {
      return {
        partitionId: target.id,
        projectId: target.projectId,
        identityId: target.identityId,
        platform: target.platform,
        bytes: null,
        status: "error",
        fileCount: 0,
        measuredAt,
      };
    }
  }
}

export async function handleStorageRequest(
  payload: unknown,
  service: HostStorageService,
  signal?: AbortSignal,
) {
  const request = parseStorageRequest(payload);
  if (!request) return null;
  try {
    if (request.command.method === "scan") {
      const result = await service.scan(signal);
      if (result.errors.length > 0) {
        return {
          requestId: request.requestId,
          ok: false as const,
          error: "PARTIAL" as const,
        };
      }
      return safeStorageReply(request.requestId, result);
    }
    const row =
      request.command.method === "clear-cache"
        ? service.clearCache(request.command.partitionId)
        : service.clearSiteData(request.command.partitionId);
    return safeStorageReply(request.requestId, row);
  } catch (error) {
    return {
      requestId: request.requestId,
      ok: false as const,
      error:
        error instanceof StorageServiceError
          ? error.code
          : ("INTERNAL" as const),
    };
  }
}
