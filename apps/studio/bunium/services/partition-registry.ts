import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Platform } from "../../src/contracts/entities";
import type {
  PartitionRegistry,
  SessionRuntime,
  TrustedPartition,
} from "../runtime/session";
import { partitionKey } from "../runtime/session";
import { StoreConflictError, type StudioStore } from "./store";

const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

/** Host-owned registry. Callers provide semantic IDs, never storage paths. */
export class PartitionRegistryService implements PartitionRegistry {
  private readonly runtime: NonNullable<SessionRuntime["BuniumSession"]>;

  constructor(
    private readonly store: StudioStore,
    runtime: SessionRuntime["BuniumSession"],
  ) {
    if (!runtime?.storageRoot) {
      throw new Error("Runtime partition storage root is unavailable.");
    }
    this.runtime = runtime;
  }

  register(options: {
    projectId: string;
    identityId: string;
    platform: Platform;
    isolationProfile: string;
    ephemeral?: boolean;
  }) {
    if (!PROFILE.test(options.isolationProfile))
      throw new TypeError("Invalid isolation profile.");
    const project = this.store.getProject(options.projectId).project;
    const identity = this.store.getIdentity(options.identityId);
    if (project.identityId !== identity.id)
      throw new StoreConflictError("Project identity changed.");
    const digest = createHash("sha256")
      .update(
        JSON.stringify([
          project.id,
          identity.id,
          options.platform,
          options.isolationProfile,
          options.ephemeral ? randomUUID() : "persistent",
        ]),
      )
      .digest("hex");
    return this.store.putPartition({
      id: `part_${digest}`,
      projectId: project.id,
      identityId: identity.id,
      platform: options.platform,
      isolationProfile: options.isolationProfile,
      ephemeral: options.ephemeral ?? false,
      schemaVersion: 1,
    });
  }

  resolve(partitionId: string):
    | (TrustedPartition & {
        projectId: string;
        identityId: string;
        platform: Platform;
        isolationProfile: string;
      })
    | undefined {
    const record = this.store.getPartition(partitionId);
    if (!record) return undefined;
    try {
      const project = this.store.getProject(record.projectId).project;
      const identity = this.store.getIdentity(record.identityId);
      if (project.identityId !== identity.id) return undefined;
    } catch {
      return undefined;
    }
    return { ...record };
  }

  /** Resolves a canonical CEF profile path from a trusted registry key. */
  canonicalDirectory(partitionId: string): string {
    const record = this.persistent(partitionId);
    const rootPath = resolve(this.runtime.storageRoot);
    const root = existsSync(rootPath) ? realpathSync(rootPath) : rootPath;
    const key = partitionKey(record.id);
    const directory = this.currentProfilePath(root, key);
    const rel = relative(root, directory);
    if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
      throw new Error("Partition path escaped its owner root.");
    }
    try {
      if (lstatSync(directory).isSymbolicLink())
        throw new Error("Partition path may not be a symlink.");
      const canonical = realpathSync(directory);
      const canonicalRelative = relative(root, canonical);
      if (
        !canonicalRelative ||
        canonicalRelative.startsWith(`..${sep}`) ||
        canonicalRelative === ".." ||
        isAbsolute(canonicalRelative)
      )
        throw new Error("Partition path is not canonical.");
      return canonical;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return directory;
      throw error;
    }
  }

  clear(partitionId: string): { removedNow: boolean } {
    const record = this.persistent(partitionId);
    this.canonicalDirectory(partitionId);
    return this.runtime.clearPartition(partitionKey(record.id));
  }

  remove(partitionId: string): boolean {
    const record = this.store.getPartition(partitionId);
    if (!record) return false;
    if (!record.ephemeral) {
      this.persistent(partitionId);
      this.canonicalDirectory(partitionId);
      this.runtime.removePartition(partitionKey(record.id));
    }
    this.store.deletePartition(partitionId);
    return true;
  }

  /** Ephemeral contexts disappear with the runtime process; remove their rows. */
  cleanupEphemeral(): number {
    let removed = 0;
    for (const record of this.store.listPartitions()) {
      if (record.ephemeral || !this.resolve(record.id)) {
        if (!record.ephemeral) {
          this.runtime.removePartition(partitionKey(record.id));
        }
        this.store.deletePartition(record.id);
        removed += 1;
      }
    }
    return removed;
  }

  private persistent(partitionId: string) {
    const record = this.resolve(partitionId);
    if (!record || record.ephemeral)
      throw new StoreConflictError("Persistent partition not found.");
    if (this.runtime.isInUse(partitionKey(record.id)))
      throw new StoreConflictError("Partition is in use.");
    return record;
  }

  private currentProfilePath(root: string, key: string): string {
    const metadataDirectory = join(root, "BuniumPartitions");
    const metadataFile = join(metadataDirectory, key);
    let generation = 1;
    try {
      if (lstatSync(metadataDirectory).isSymbolicLink())
        throw new Error("Partition metadata directory may not be a symlink.");
      if (lstatSync(metadataFile).isSymbolicLink())
        throw new Error("Partition metadata may not be a symlink.");
      const canonicalRoot = root;
      const canonicalMetadata = realpathSync(metadataFile);
      const rel = relative(canonicalRoot, canonicalMetadata);
      if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel))
        throw new Error("Partition metadata escaped its owner root.");
      const value = readFileSync(canonicalMetadata, "utf8").trim();
      const match = /^g([1-9][0-9]{0,8})$/u.exec(value);
      if (!match?.[1])
        throw new Error("Partition generation metadata is invalid.");
      generation = Number(match[1]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return join(root, `bp.${key}.g${generation}`);
  }
}
