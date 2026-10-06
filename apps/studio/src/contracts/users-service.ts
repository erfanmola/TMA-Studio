import type { Identity, Project } from "./entities";

export type MockUserFields = Pick<
  Extract<Identity, { kind: "mock" }>,
  | "telegramId"
  | "firstName"
  | "lastName"
  | "username"
  | "languageCode"
  | "isPremium"
  | "photoUrl"
>;

export type ProjectReference = Pick<Project, "id" | "name" | "identityId">;

export class UsersServiceError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL",
  ) {
    super(code);
    this.name = "UsersServiceError";
  }
}

export function validateMockUserFields(fields: MockUserFields): MockUserFields {
  const firstName = fields.firstName.trim();
  const telegramId = fields.telegramId.trim();
  if (!firstName || firstName.length > 128) {
    throw new UsersServiceError("INVALID_INPUT");
  }
  if (!/^\d{1,32}$/u.test(telegramId)) {
    throw new UsersServiceError("INVALID_INPUT");
  }
  const photoUrl = fields.photoUrl?.trim();
  if (photoUrl) {
    try {
      const url = new URL(photoUrl);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username.length > 0 ||
        url.password.length > 0 ||
        photoUrl.length > 2048
      ) {
        throw new UsersServiceError("INVALID_INPUT");
      }
    } catch (error) {
      if (error instanceof UsersServiceError) throw error;
      throw new UsersServiceError("INVALID_INPUT");
    }
  }
  const optional = {
    ...(fields.lastName?.trim() ? { lastName: fields.lastName.trim() } : {}),
    ...(fields.username?.trim() ? { username: fields.username.trim() } : {}),
    ...(photoUrl ? { photoUrl } : {}),
  };
  return {
    telegramId,
    firstName,
    languageCode: fields.languageCode.trim() || "en",
    isPremium: fields.isPremium,
    ...optional,
  };
}

export interface UsersService {
  setRealIdentities?(
    identities: Extract<Identity, { kind: "telegram" }>[],
  ): void;
  deleteMock(
    identityId: string,
    expectedRevision: number,
    reassignToId?: string,
  ): Promise<void>;
  getIdentity(identityId: string): Promise<Identity | null>;
  listIdentities(): Promise<Identity[]>;
  listProjectReferences(identityId: string): Promise<ProjectReference[]>;
  saveMock(
    fields: MockUserFields,
    identityId?: string,
    expectedRevision?: number,
  ): Promise<Extract<Identity, { kind: "mock" }>>;
  subscribe?(listener: () => void): () => void;
}
