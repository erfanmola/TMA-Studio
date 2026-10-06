import { createHash } from "node:crypto";

/** Runtime session surface this adapter needs (Bunium session API v1). */
export interface RuntimeSession {
  readonly released: boolean;
  release(): void;
  retain(): RuntimeSession;
}

export interface SessionRuntime {
  sessionApiVersion?: number;
  BuniumSession?: {
    clearPartition(key: string): { generation: number; removedNow: boolean };
    ephemeral(): RuntimeSession;
    fromPartition(key: string): RuntimeSession;
    isInUse(key: string): boolean;
    removePartition(key: string): { removedNow: boolean };
    readonly storageRoot: string;
  };
}

/** Trusted registry entry; guests never supply these values. */
export interface TrustedPartition {
  ephemeral: boolean;
  id: string;
}

export interface PartitionRegistry {
  resolve(partitionId: string): TrustedPartition | undefined;
}

export interface PartitionLease {
  readonly partitionId: string;
  readonly session: RuntimeSession;
  /** Idempotent: a second call does nothing. */
  release(): void;
}

export type PartitionErrorCode =
  | "runtime-unsupported"
  | "unknown-partition"
  | "partition-in-use";

export class PartitionError extends Error {
  constructor(readonly code: PartitionErrorCode) {
    super(`partition: ${code}`);
    this.name = "PartitionError";
  }
}

/**
 * Derives the runtime storage key from a trusted registry ID. The key is a
 * fixed-length digest, so record IDs never reach the filesystem as paths.
 */
export function partitionKey(partitionId: string): string {
  return `p${createHash("sha256").update(partitionId, "utf8").digest("hex").slice(0, 40)}`;
}

type Entry = { references: number; session: RuntimeSession };

/**
 * Maps trusted partition records to isolated runtime sessions. Persistent
 * partitions resolve to the same on-disk context across restarts; ephemeral
 * ones share one in-memory context while any lease is open and are
 * discarded when the last lease is released.
 */
export class SessionAdapter {
  private readonly entries = new Map<string, Entry>();
  private readonly runtime: NonNullable<SessionRuntime["BuniumSession"]>;

  constructor(
    runtime: SessionRuntime,
    private readonly registry: PartitionRegistry,
  ) {
    if (runtime.sessionApiVersion !== 1 || !runtime.BuniumSession) {
      throw new PartitionError("runtime-unsupported");
    }
    this.runtime = runtime.BuniumSession;
  }

  acquire(partitionId: string): PartitionLease {
    const record = this.trusted(partitionId);
    let entry = this.entries.get(record.id);
    if (!entry) {
      entry = {
        references: 0,
        session: record.ephemeral
          ? this.runtime.ephemeral()
          : this.runtime.fromPartition(partitionKey(record.id)),
      };
      this.entries.set(record.id, entry);
    }
    entry.references += 1;
    const held = entry;
    let released = false;
    return {
      partitionId: record.id,
      release: () => {
        if (released) return;
        released = true;
        held.references -= 1;
        if (held.references === 0) {
          this.entries.delete(record.id);
          held.session.release();
        }
      },
      session: held.session,
    };
  }

  isInUse(partitionId: string): boolean {
    const record = this.trusted(partitionId);
    return (
      this.entries.has(record.id) ||
      (!record.ephemeral && this.runtime.isInUse(partitionKey(record.id)))
    );
  }

  /** Clears stored data. Callers close the partition's guests first. */
  clear(partitionId: string): { removedNow: boolean } {
    const record = this.idle(partitionId);
    if (record.ephemeral) return { removedNow: true };
    return {
      removedNow: this.runtime.clearPartition(partitionKey(record.id))
        .removedNow,
    };
  }

  /** Deletes a partition's storage when its registry record is deleted. */
  remove(partitionId: string): { removedNow: boolean } {
    const record = this.idle(partitionId);
    if (record.ephemeral) return { removedNow: true };
    return this.runtime.removePartition(partitionKey(record.id));
  }

  private idle(partitionId: string): TrustedPartition {
    const record = this.trusted(partitionId);
    if (this.isInUse(record.id)) throw new PartitionError("partition-in-use");
    return record;
  }

  private trusted(partitionId: string): TrustedPartition {
    const record = this.registry.resolve(partitionId);
    if (!record || record.id !== partitionId) {
      throw new PartitionError("unknown-partition");
    }
    return record;
  }
}
