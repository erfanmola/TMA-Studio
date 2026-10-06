import { randomUUID } from "node:crypto";
import type {
  PermissionCapability,
  PermissionGrant,
} from "../../src/contracts/entities";
import type { PartitionRegistryService } from "./partition-registry";
import { StoreConflictError, type StudioStore } from "./store";

export interface NativePermissionProvider {
  request(capability: PermissionCapability): Promise<boolean>;
}

/** Must be populated by trusted host navigation events, never guest messages. */
export interface PermissionNavigationAuthority {
  current(
    partitionId: string,
  ): { origin: string; generation: number } | undefined;
}

export type PermissionResult =
  | { status: "prompt" }
  | { status: "denied"; source: "project" | "operating-system" }
  | { status: "granted"; mode: "native" | "simulated" };

/**
 * Project/origin/identity/navigation scoped permission decisions. Simulated
 * Mini App capabilities never reach the native OS permission provider.
 */
export class PermissionBroker {
  constructor(
    private readonly store: StudioStore,
    private readonly partitions: PartitionRegistryService,
    private readonly nativePermissions: NativePermissionProvider,
    private readonly navigation: PermissionNavigationAuthority,
  ) {}

  decide(input: {
    partitionId: string;
    origin: string;
    navigationGeneration: number;
    capability: PermissionCapability;
    mode: "native" | "simulated";
    decision: "allow" | "deny";
  }): PermissionGrant {
    const context = this.context(
      input.partitionId,
      input.origin,
      input.navigationGeneration,
    );
    const key = { ...context, capability: input.capability, mode: input.mode };
    return this.store.putPermissionGrant({
      ...key,
      id: `grant_${randomUUID()}`,
      decision: input.decision,
    });
  }

  async request(input: {
    partitionId: string;
    origin: string;
    navigationGeneration: number;
    capability: PermissionCapability;
    mode: "native" | "simulated";
  }): Promise<PermissionResult> {
    const context = this.context(
      input.partitionId,
      input.origin,
      input.navigationGeneration,
    );
    const key = { ...context, capability: input.capability, mode: input.mode };
    const grant = this.store.getPermissionGrant(key);
    if (!grant) return { status: "prompt" };
    if (grant.decision === "deny")
      return { status: "denied", source: "project" };
    if (input.mode === "simulated")
      return { status: "granted", mode: "simulated" };
    const allowed = await this.nativePermissions.request(input.capability);
    return allowed
      ? { status: "granted", mode: "native" }
      : { status: "denied", source: "operating-system" };
  }

  clearForOrigin(
    projectId: string,
    identityId: string,
    origin: string,
  ): number {
    const normalized = normalizeOrigin(origin);
    const project = this.store.getProject(projectId).project;
    if (
      project.identityId !== identityId ||
      projectOrigin(project.url) !== normalized
    ) {
      throw new StoreConflictError(
        "Permission scope no longer matches the project.",
      );
    }
    return this.store.clearPermissionGrants(projectId, normalized, identityId);
  }

  private context(
    partitionId: string,
    origin: string,
    navigationGeneration: number,
  ) {
    if (
      !Number.isSafeInteger(navigationGeneration) ||
      navigationGeneration < 0
    ) {
      throw new TypeError("Invalid navigation generation.");
    }
    const partition = this.partitions.resolve(partitionId);
    if (!partition) throw new StoreConflictError("Unknown or stale partition.");
    const current = this.navigation.current(partitionId);
    const project = this.store.getProject(partition.projectId).project;
    const normalized = normalizeOrigin(origin);
    if (
      !current ||
      current.generation !== navigationGeneration ||
      normalizeOrigin(current.origin) !== normalized ||
      project.identityId !== partition.identityId ||
      projectOrigin(project.url) !== normalized
    ) {
      throw new StoreConflictError(
        "Permission origin or identity does not match the project.",
      );
    }
    return {
      projectId: partition.projectId,
      origin: normalized,
      identityId: partition.identityId,
      navigationGeneration,
    };
  }
}

function projectOrigin(value: string): string {
  return normalizeOrigin(value);
}

function normalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Invalid permission origin.");
  }
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && isLocalhost(url.hostname))
    )
  ) {
    throw new TypeError("Permission origin must be HTTPS or local HTTP.");
  }
  return url.origin;
}

function isLocalhost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}
