import type { Platform, Project } from "../../src/contracts/entities";
import {
  type IdentityOption,
  type ProjectFields,
  type ProjectService,
  ProjectServiceError,
  type SavedProject,
  type TokenEdit,
} from "../../src/contracts/project-service";
import { ValidationError } from "../../src/contracts/schemas";
import {
  StoreConflictError,
  StoreNotFoundError,
  type StudioStore,
} from "./store";
import { type SecretVault, VaultUnavailableError } from "./vault";

const tokenPattern = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/u;
const patchKeys = new Set<keyof ProjectFields>([
  "avatarColorIndex",
  "defaultMode",
  "identityId",
  "launch",
  "name",
  "splash",
  "url",
]);

export type HostProjectServiceOptions = {
  createIdentity?: () => Promise<string | null>;
  identities: () => IdentityOption[];
  launch?: (project: Project, platform: Platform) => Promise<void>;
  newId?: () => string;
  now?: () => Date;
};

function mapError(error: unknown): ProjectServiceError {
  if (error instanceof ProjectServiceError) return error;
  if (error instanceof StoreConflictError)
    return new ProjectServiceError("CONFLICT");
  if (error instanceof StoreNotFoundError)
    return new ProjectServiceError("NOT_FOUND");
  if (error instanceof ValidationError)
    return new ProjectServiceError("INVALID_INPUT");
  if (error instanceof VaultUnavailableError) {
    return new ProjectServiceError("VAULT_UNAVAILABLE");
  }
  return new ProjectServiceError("INTERNAL");
}

/**
 * Host implementation of the Project window port. Secrets go straight to the
 * vault; the store keeps only the opaque reference. A failed write deletes a
 * secret it just stored, and a replaced or removed secret is deleted only
 * after the project write succeeds.
 */
export class HostProjectService implements ProjectService {
  constructor(
    private readonly store: StudioStore,
    private readonly vault: SecretVault,
    private readonly options: HostProjectServiceOptions,
  ) {}

  private saved(project: Project): SavedProject {
    return { hasToken: project.botTokenRef !== undefined, project };
  }

  private async storeToken(token: string): Promise<string> {
    if (!tokenPattern.test(token))
      throw new ProjectServiceError("INVALID_INPUT");
    return this.vault.set(token);
  }

  async load(projectId: string): Promise<SavedProject> {
    try {
      return this.saved(this.store.getProject(projectId).project);
    } catch (error) {
      throw mapError(error);
    }
  }

  async listIdentities(): Promise<IdentityOption[]> {
    return this.options.identities();
  }

  async createIdentity(): Promise<string | null> {
    if (!this.options.createIdentity)
      throw new ProjectServiceError("UNAVAILABLE");
    return this.options.createIdentity();
  }

  async launch(projectId: string, platform: Platform): Promise<void> {
    const { project } = await this.load(projectId);
    if (!this.options.launch) throw new ProjectServiceError("UNAVAILABLE");
    await this.options.launch(project, platform);
  }

  async create(
    fields: ProjectFields,
    token: string | null,
  ): Promise<SavedProject> {
    let reference: string | undefined;
    try {
      if (token !== null) reference = await this.storeToken(token);
      const now = (this.options.now?.() ?? new Date()).toISOString();
      const project = this.store.createProject({
        ...fields,
        ...(reference ? { botTokenRef: reference } : {}),
        createdAt: now,
        id: this.options.newId?.() ?? crypto.randomUUID(),
        revision: 1,
        updatedAt: now,
      });
      return this.saved(project);
    } catch (error) {
      if (reference) await this.vault.delete(reference).catch(() => false);
      throw mapError(error);
    }
  }

  async update(
    projectId: string,
    expectedRevision: number,
    patch: Partial<ProjectFields>,
    token: TokenEdit,
  ): Promise<SavedProject> {
    let reference: string | undefined;
    try {
      for (const key of Object.keys(patch)) {
        if (!patchKeys.has(key as keyof ProjectFields)) {
          throw new ProjectServiceError("INVALID_INPUT");
        }
      }
      const current = this.store.getProject(projectId).project;
      // Check the revision before touching the vault so a stale save stores nothing.
      if (current.revision !== expectedRevision) {
        throw new ProjectServiceError("CONFLICT");
      }
      if (token.kind === "set") reference = await this.storeToken(token.value);
      const tokenPatch =
        token.kind === "set"
          ? { botTokenRef: reference }
          : token.kind === "remove"
            ? { botTokenRef: undefined }
            : {};
      const updated = this.store.updateProject(projectId, expectedRevision, {
        ...patch,
        ...tokenPatch,
      });
      if (token.kind !== "keep" && current.botTokenRef) {
        await this.vault.delete(current.botTokenRef).catch(() => false);
      }
      return this.saved(updated);
    } catch (error) {
      if (reference) await this.vault.delete(reference).catch(() => false);
      throw mapError(error);
    }
  }
}
