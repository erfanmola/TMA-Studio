import type { Platform, Project } from "../../contracts/entities";
import {
  type DraftErrors,
  draftFromProject,
  emptyDraft,
  fieldsFromDraft,
  hasErrors,
  isDirty,
  type ProjectDraft,
  patchFromDraft,
  validateDraft,
} from "./draft";
import {
  errorCode,
  type IdentityOption,
  type ProjectService,
  type ProjectServiceErrorCode,
  type SavedProject,
} from "./service";

export type ProjectPhase = "loading" | "load-failed" | "ready" | "saving";

export type ProjectState = {
  base: ProjectDraft;
  closePrompt: boolean;
  conflict: Project | null;
  draft: ProjectDraft;
  errors: DraftErrors;
  hasToken: boolean;
  identities: readonly IdentityOption[];
  launchError: ProjectServiceErrorCode | null;
  loadError: ProjectServiceErrorCode | null;
  phase: ProjectPhase;
  project: Project | null;
  saveError: ProjectServiceErrorCode | null;
  showErrors: boolean;
};

export type ProjectControllerOptions = {
  avatarColorIndex: Project["avatarColorIndex"];
  onClose: () => void;
  onSaved?: (project: Project) => void;
  projectId?: string;
  service: ProjectService;
};

type Listener = (state: ProjectState) => void;

/**
 * Project window state machine: create/manage, validation, save with
 * optimistic revision, conflict resolution that keeps the draft, dirty-close
 * prompt and the create-user detour. Launch actions exist only for a saved
 * project and always use its saved settings.
 */
export class ProjectController {
  private state: ProjectState;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly options: ProjectControllerOptions) {
    const draft = emptyDraft({
      avatarColorIndex: options.avatarColorIndex,
      identityId: "",
    });
    this.state = {
      base: draft,
      closePrompt: false,
      conflict: null,
      draft,
      errors: {},
      hasToken: false,
      identities: [],
      launchError: null,
      loadError: null,
      phase: "loading",
      project: null,
      saveError: null,
      showErrors: false,
    };
  }

  get snapshot(): ProjectState {
    return this.state;
  }

  get dirty(): boolean {
    return isDirty(this.state.draft, this.state.base);
  }

  /** Launch is available once the project exists in the store. */
  get canLaunch(): boolean {
    return this.state.project !== null && this.state.phase === "ready";
  }

  /** Notifies on later changes only; read `snapshot` for the current state. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<ProjectState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private validate(draft: ProjectDraft): DraftErrors {
    return validateDraft(draft, { hasStoredToken: this.state.hasToken });
  }

  private adopt(saved: SavedProject): void {
    const base = draftFromProject(saved.project);
    this.set({
      base,
      conflict: null,
      draft: base,
      errors: {},
      hasToken: saved.hasToken,
      phase: "ready",
      project: saved.project,
      saveError: null,
      showErrors: false,
    });
  }

  async load(): Promise<void> {
    this.set({ loadError: null, phase: "loading" });
    try {
      const identities = await this.options.service.listIdentities();
      if (this.options.projectId) {
        this.set({ identities });
        this.adopt(await this.options.service.load(this.options.projectId));
        return;
      }
      const draft = emptyDraft({
        avatarColorIndex: this.options.avatarColorIndex,
        identityId: identities[0]?.id ?? "",
      });
      this.set({ base: draft, draft, identities, phase: "ready" });
    } catch (error) {
      this.set({ loadError: errorCode(error), phase: "load-failed" });
    }
  }

  edit(update: (draft: ProjectDraft) => ProjectDraft): void {
    const draft = update(this.state.draft);
    this.set({
      draft,
      errors: this.validate(draft),
      launchError: null,
      saveError: null,
    });
  }

  /** Resolves true only after the host confirmed the write. */
  async save(): Promise<boolean> {
    if (this.state.phase !== "ready") return false;
    const draft = this.state.draft;
    const errors = this.validate(draft);
    if (hasErrors(errors)) {
      this.set({ errors, showErrors: true });
      return false;
    }
    const project = this.state.project;
    if (project && !isDirty(draft, this.state.base)) return true;
    this.set({ phase: "saving", saveError: null });
    try {
      const saved = project
        ? await this.options.service.update(
            project.id,
            project.revision,
            patchFromDraft(draft, project),
            draft.token,
          )
        : await this.options.service.create(
            fieldsFromDraft(draft),
            draft.token.kind === "set" ? draft.token.value.trim() : null,
          );
      this.adopt(saved);
      this.options.onSaved?.(saved.project);
      return true;
    } catch (error) {
      const code = errorCode(error);
      if (code === "CONFLICT" && project) {
        try {
          const latest = await this.options.service.load(project.id);
          this.set({
            conflict: latest.project,
            hasToken: latest.hasToken,
            phase: "ready",
          });
        } catch (reloadError) {
          this.set({ phase: "ready", saveError: errorCode(reloadError) });
        }
        return false;
      }
      // No fake saved state: the draft and dirty flag stay as they were.
      this.set({ phase: "ready", saveError: code });
      return false;
    }
  }

  /**
   * Conflict choices: keep my edits on top of the latest revision, or drop
   * them and load the latest. Either way nothing is lost silently.
   */
  async resolveConflict(choice: "overwrite" | "reload"): Promise<boolean> {
    const latest = this.state.conflict;
    if (!latest) return false;
    if (choice === "reload") {
      this.adopt({ hasToken: this.state.hasToken, project: latest });
      return true;
    }
    const base = this.state.project;
    if (!base) return false;
    // Re-send only the fields this draft changed relative to what it was based
    // on, at the latest revision, so the other editor's changes survive.
    this.set({
      conflict: null,
      project: { ...base, revision: latest.revision },
    });
    return this.save();
  }

  discard(): void {
    this.set({
      closePrompt: false,
      draft: this.state.base,
      errors: {},
      saveError: null,
      showErrors: false,
    });
  }

  requestClose(): void {
    if (this.state.phase === "saving") return;
    if (this.dirty) {
      this.set({ closePrompt: true });
      return;
    }
    this.options.onClose();
  }

  async resolveClose(choice: "save" | "discard" | "cancel"): Promise<void> {
    if (choice === "cancel") {
      this.set({ closePrompt: false });
      return;
    }
    if (choice === "discard") {
      this.set({ closePrompt: false });
      this.options.onClose();
      return;
    }
    this.set({ closePrompt: false });
    if (await this.save()) this.options.onClose();
  }

  /** Create-user detour: the draft is untouched while the other flow runs. */
  async createIdentity(): Promise<void> {
    try {
      const id = await this.options.service.createIdentity();
      if (!id) return;
      const identities = await this.options.service.listIdentities();
      this.set({ identities });
      this.edit((draft) => ({ ...draft, identityId: id }));
    } catch (error) {
      this.set({ saveError: errorCode(error) });
    }
  }

  /** Return a newly-created mock user to the still-open Project draft. */
  async selectCreatedIdentity(identityId: string): Promise<void> {
    const identities = await this.options.service.listIdentities();
    if (!identities.some((identity) => identity.id === identityId)) {
      this.set({ saveError: "NOT_FOUND" });
      return;
    }
    this.set({ identities });
    this.edit((draft) => ({ ...draft, identityId }));
  }

  async launch(platform: Platform): Promise<void> {
    const project = this.state.project;
    if (!project || !this.canLaunch) return;
    this.set({ launchError: null });
    try {
      await this.options.service.launch(project.id, platform);
    } catch (error) {
      this.set({ launchError: errorCode(error) });
    }
  }
}
