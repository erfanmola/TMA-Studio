import { randomUUID } from "node:crypto";
import type { Identity } from "../../src/contracts/entities";
import {
  type MockUserFields,
  type ProjectReference,
  type UsersService,
  UsersServiceError,
  validateMockUserFields,
} from "../../src/contracts/users-service";
import {
  StoreConflictError,
  StoreNotFoundError,
  type StudioStore,
} from "./store";

export type HostUsersServiceOptions = {
  newId?: () => string;
};

function mapError(error: unknown): never {
  if (error instanceof UsersServiceError) throw error;
  if (error instanceof StoreNotFoundError)
    throw new UsersServiceError("NOT_FOUND");
  if (error instanceof StoreConflictError)
    throw new UsersServiceError("CONFLICT");
  throw new UsersServiceError("INTERNAL");
}

/** Host-owned persistent mock identity service. Real identities are read-only here. */
export class HostUsersService implements UsersService {
  constructor(
    private readonly store: StudioStore,
    private readonly options: HostUsersServiceOptions = {},
  ) {}

  async listIdentities(): Promise<Identity[]> {
    try {
      return this.store.listIdentities();
    } catch (error) {
      return mapError(error);
    }
  }

  async getIdentity(identityId: string): Promise<Identity | null> {
    try {
      return this.store.getIdentity(identityId);
    } catch (error) {
      if (error instanceof StoreNotFoundError) return null;
      return mapError(error);
    }
  }

  async listProjectReferences(identityId: string): Promise<ProjectReference[]> {
    try {
      return this.store.listProjectReferences(identityId);
    } catch (error) {
      return mapError(error);
    }
  }

  async saveMock(
    fields: MockUserFields,
    identityId?: string,
    expectedRevision?: number,
  ): Promise<Extract<Identity, { kind: "mock" }>> {
    try {
      const validated = validateMockUserFields(fields);
      const existing = this.store
        .listIdentities()
        .find(
          (identity) =>
            identity.kind === "mock" &&
            identity.telegramId === validated.telegramId &&
            identity.id !== identityId,
        );
      if (existing) throw new UsersServiceError("CONFLICT");
      if (identityId) {
        const current = this.store.getIdentity(identityId);
        if (current.kind !== "mock") throw new UsersServiceError("CONFLICT");
        if (expectedRevision === undefined) {
          throw new UsersServiceError("INVALID_INPUT");
        }
        return this.store.updateMockIdentity(
          identityId,
          expectedRevision,
          validated,
        );
      }
      const identity = this.store.createIdentity({
        ...validated,
        id: this.options.newId?.() ?? randomUUID(),
        kind: "mock",
        revision: 1,
      });
      if (identity.kind !== "mock") throw new UsersServiceError("INTERNAL");
      return identity;
    } catch (error) {
      return mapError(error);
    }
  }

  async deleteMock(
    identityId: string,
    expectedRevision: number,
    reassignToId?: string,
  ): Promise<void> {
    try {
      this.store.deleteMockIdentity(identityId, expectedRevision, reassignToId);
    } catch (error) {
      return mapError(error);
    }
  }

  subscribe(listener: () => void): () => void {
    return this.store.snapshotAndSubscribe(() => listener()).unsubscribe;
  }
}
