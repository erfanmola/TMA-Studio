import type {
  StorageReply,
  StorageRequest,
  StorageScanResult,
  StorageUsageRow,
} from "../../contracts/storage-rpc";
import { nextRequestId } from "../users/request-id";

export class StorageServiceError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "IN_USE"
      | "ABORTED"
      | "PARTIAL"
      | "INTERNAL"
      | "UNAVAILABLE",
  ) {
    super(code);
    this.name = "StorageServiceError";
  }
}

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: StorageReply | null) => void;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validReply(value: unknown): value is StorageReply {
  if (!record(value) || typeof value.requestId !== "string") return false;
  if (value.ok === true) return record(value.result);
  return (
    value.ok === false &&
    [
      "INVALID_INPUT",
      "NOT_FOUND",
      "IN_USE",
      "ABORTED",
      "PARTIAL",
      "INTERNAL",
    ].includes(String(value.error))
  );
}

export interface StoragePort {
  scan(signal?: AbortSignal): Promise<StorageScanResult>;
  clearCache(partitionId: string): Promise<StorageUsageRow>;
  clearSiteData(partitionId: string): Promise<StorageUsageRow>;
}

/** Renderer adapter over the trusted storage IPC boundary. */
export class BuniumStorageBridgeService implements StoragePort {
  private readonly bridge: Bridge;
  private readonly pending = new Map<string, Pending>();
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    resolve(validReply(value) ? value : null);
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new StorageServiceError("UNAVAILABLE");
    this.bridge = bridge;
    bridge.on("storage.reply", this.receive);
  }

  scan(signal?: AbortSignal): Promise<StorageScanResult> {
    return this.request(
      { method: "scan" },
      signal,
    ) as Promise<StorageScanResult>;
  }

  clearCache(partitionId: string): Promise<StorageUsageRow> {
    return this.request({
      method: "clear-cache",
      partitionId,
    }) as Promise<StorageUsageRow>;
  }

  clearSiteData(partitionId: string): Promise<StorageUsageRow> {
    return this.request({
      method: "clear-site-data",
      partitionId,
    }) as Promise<StorageUsageRow>;
  }

  close(): void {
    this.bridge.off?.("storage.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "INTERNAL" });
    }
    this.pending.clear();
  }

  private request(
    command: StorageRequest["command"],
    signal?: AbortSignal,
  ): Promise<StorageScanResult | StorageUsageRow> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new StorageServiceError("ABORTED"));
        return;
      }
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new StorageServiceError("UNAVAILABLE"));
      }, 60_000);
      const onAbort = () => {
        this.pending.delete(requestId);
        window.clearTimeout(timer);
        reject(new StorageServiceError("ABORTED"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (!reply) reject(new StorageServiceError("INTERNAL"));
        else if (!reply.ok) reject(new StorageServiceError(reply.error));
        else resolve(reply.result);
      });
      this.bridge.send(
        "storage.request",
        JSON.stringify({ requestId, command }),
      );
    });
  }
}
