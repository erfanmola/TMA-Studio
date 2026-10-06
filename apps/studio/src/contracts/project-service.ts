import type { Platform, Project, StudioErrorCode } from "./entities";

/** Token edits are intents; the renderer never receives a stored token. */
export type TokenEdit =
  | { kind: "keep" }
  | { kind: "set"; value: string }
  | { kind: "remove" };

export type ProjectFields = Pick<
  Project,
  | "name"
  | "url"
  | "avatarColorIndex"
  | "identityId"
  | "defaultMode"
  | "launch"
  | "splash"
>;

export type ProjectServiceErrorCode = StudioErrorCode | "VAULT_UNAVAILABLE";

export class ProjectServiceError extends Error {
  constructor(readonly code: ProjectServiceErrorCode) {
    super(code);
    this.name = "ProjectServiceError";
  }
}

export type SavedProject = {
  /** Whether the host vault holds a bot token; the token itself never returns. */
  hasToken: boolean;
  project: Project;
};

export type IdentityOption = {
  id: string;
  kind: "mock" | "telegram";
  label: string;
};

/**
 * Project window port. The host implementation owns the store, the vault and
 * ID/timestamp assignment; tokens travel renderer→host once per save and are
 * never read back.
 */
export interface ProjectService {
  create(fields: ProjectFields, token: string | null): Promise<SavedProject>;
  /** Opens the create-user flow; resolves with the new identity ID or null. */
  createIdentity(): Promise<string | null>;
  launch(projectId: string, platform: Platform): Promise<void>;
  listIdentities(): Promise<IdentityOption[]>;
  load(projectId: string): Promise<SavedProject>;
  update(
    projectId: string,
    expectedRevision: number,
    patch: Partial<ProjectFields>,
    token: TokenEdit,
  ): Promise<SavedProject>;
}

export function errorCode(error: unknown): ProjectServiceErrorCode {
  return error instanceof ProjectServiceError ? error.code : "INTERNAL";
}
