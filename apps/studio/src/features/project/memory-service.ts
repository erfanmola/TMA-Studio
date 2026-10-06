import type { Project } from "../../contracts/entities";
import {
  type IdentityOption,
  type ProjectFields,
  type ProjectService,
  ProjectServiceError,
  type SavedProject,
  type TokenEdit,
} from "../../contracts/project-service";

/**
 * Development-only in-memory port for review scenes. It keeps a boolean for
 * token presence and never stores the token text.
 */
export class MemoryProjectService implements ProjectService {
  private readonly projects = new Map<
    string,
    { hasToken: boolean; project: Project }
  >();
  private identities: IdentityOption[];
  failNextSave = false;
  private created = 0;

  constructor(identities: IdentityOption[]) {
    this.identities = [...identities];
  }

  addIdentity(identity: IdentityOption): void {
    if (!this.identities.some((existing) => existing.id === identity.id)) {
      this.identities.push(identity);
    }
  }

  private clone(record: { hasToken: boolean; project: Project }): SavedProject {
    return structuredClone(record);
  }

  seed(project: Project, hasToken: boolean): void {
    this.projects.set(project.id, { hasToken, project });
  }

  /** Simulates another window saving a change. */
  touch(projectId: string, patch: Partial<ProjectFields>): void {
    const record = this.projects.get(projectId);
    if (!record) return;
    record.project = {
      ...record.project,
      ...patch,
      revision: record.project.revision + 1,
    };
  }

  async load(projectId: string): Promise<SavedProject> {
    const record = this.projects.get(projectId);
    if (!record) throw new ProjectServiceError("NOT_FOUND");
    return this.clone(record);
  }

  async listIdentities(): Promise<IdentityOption[]> {
    return [...this.identities];
  }

  async createIdentity(): Promise<string | null> {
    this.created += 1;
    const id = `mock-created-${this.created}`;
    this.identities.push({
      id,
      kind: "mock",
      label: `Test user ${this.created} · Mock`,
    });
    return id;
  }

  async launch(): Promise<void> {
    throw new ProjectServiceError("UNAVAILABLE");
  }

  private guard(): void {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new ProjectServiceError("INTERNAL");
    }
  }

  async create(
    fields: ProjectFields,
    token: string | null,
  ): Promise<SavedProject> {
    this.guard();
    const now = new Date(0).toISOString();
    const project: Project = {
      ...fields,
      createdAt: now,
      id: `project-${this.projects.size + 1}`,
      revision: 1,
      updatedAt: now,
    };
    const record = { hasToken: token !== null, project };
    this.projects.set(project.id, record);
    return this.clone(record);
  }

  async update(
    projectId: string,
    expectedRevision: number,
    patch: Partial<ProjectFields>,
    token: TokenEdit,
  ): Promise<SavedProject> {
    this.guard();
    const record = this.projects.get(projectId);
    if (!record) throw new ProjectServiceError("NOT_FOUND");
    if (record.project.revision !== expectedRevision) {
      throw new ProjectServiceError("CONFLICT");
    }
    record.project = {
      ...record.project,
      ...patch,
      revision: record.project.revision + 1,
    };
    if (token.kind === "set") record.hasToken = true;
    if (token.kind === "remove") record.hasToken = false;
    return this.clone(record);
  }
}
