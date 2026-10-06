import type { Identity } from "../../contracts/entities";
import { IdentitySchema } from "../../contracts/schemas";
import {
  type MockUserFields,
  type ProjectReference,
  type UsersService,
  validateMockUserFields,
} from "./service";

/** Deterministic review adapter. Production persistence belongs to the host. */
export class MemoryUsersService implements UsersService {
  private readonly identities = new Map<string, Identity>();
  private readonly projects = new Map<string, ProjectReference>();
  private nextUser = 1;
  private readonly listeners = new Set<() => void>();

  constructor(identities: Identity[], projects: ProjectReference[]) {
    for (const identity of identities) {
      const parsed = IdentitySchema.parse(identity);
      this.identities.set(parsed.id, parsed);
    }
    for (const project of projects) {
      this.projects.set(project.id, structuredClone(project));
    }
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listIdentities(): Promise<Identity[]> {
    return [...this.identities.values()].map((identity) =>
      this.clone(identity),
    );
  }

  setRealIdentities(
    identities: Extract<Identity, { kind: "telegram" }>[],
  ): void {
    const parsedIdentities: Extract<Identity, { kind: "telegram" }>[] = [];
    for (const identity of identities) {
      const parsed = IdentitySchema.parse(identity);
      if (parsed.kind === "telegram") parsedIdentities.push(parsed);
    }
    const current = [...this.identities.values()].filter(
      (identity) =>
        identity.kind === "telegram" && identity.accountRef === "host-managed",
    );
    if (JSON.stringify(current) === JSON.stringify(parsedIdentities)) return;
    for (const [id, identity] of this.identities)
      if (
        identity.kind === "telegram" &&
        identity.accountRef === "host-managed"
      )
        this.identities.delete(id);
    for (const identity of parsedIdentities)
      this.identities.set(identity.id, identity);
    this.notify();
  }

  async getIdentity(identityId: string): Promise<Identity | null> {
    const identity = this.identities.get(identityId);
    return identity ? this.clone(identity) : null;
  }

  async listProjectReferences(identityId: string): Promise<ProjectReference[]> {
    return [...this.projects.values()]
      .filter((project) => project.identityId === identityId)
      .map((project) => this.clone(project));
  }

  async saveMock(
    fields: MockUserFields,
    identityId?: string,
    expectedRevision?: number,
  ): Promise<Extract<Identity, { kind: "mock" }>> {
    const validated = validateMockUserFields(fields);
    const current = identityId ? this.identities.get(identityId) : undefined;
    if (identityId && current?.kind !== "mock") {
      throw new Error("Only existing mock users can be edited.");
    }
    if (current && current.revision !== expectedRevision) {
      throw new Error("This user changed. Reload and try again.");
    }
    if (
      [...this.identities.values()].some(
        (identity) =>
          identity.kind === "mock" &&
          identity.telegramId === validated.telegramId &&
          identity.id !== identityId,
      )
    ) {
      throw new Error("A mock user with this Telegram ID already exists.");
    }
    const id = current?.id ?? `mock-user-${this.nextUser++}`;
    const user = IdentitySchema.parse({
      ...validated,
      id,
      kind: "mock",
      revision: current?.revision ? current.revision + 1 : 1,
    }) as Extract<Identity, { kind: "mock" }>;
    this.identities.set(id, user);
    this.notify();
    return this.clone(user);
  }

  async deleteMock(
    identityId: string,
    expectedRevision: number,
    reassignToId?: string,
  ): Promise<void> {
    const identity = this.identities.get(identityId);
    if (identity?.kind !== "mock") {
      throw new Error("Only mock users can be deleted.");
    }
    if (identity.revision !== expectedRevision) {
      throw new Error("This user changed. Reload and try again.");
    }
    const references = await this.listProjectReferences(identityId);
    if (references.length > 0) {
      const target = reassignToId
        ? this.identities.get(reassignToId)
        : undefined;
      if (!target || target.id === identityId) {
        throw new Error("Choose another user before deleting this user.");
      }
      for (const reference of references) {
        this.projects.set(reference.id, {
          ...reference,
          identityId: target.id,
        });
      }
    }
    this.identities.delete(identityId);
    this.notify();
  }

  /** Review-only helper used to prove reassignment without exposing mutation in the UI. */
  projectReferences(): ProjectReference[] {
    return [...this.projects.values()].map((project) => this.clone(project));
  }
}
