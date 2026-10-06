import type { StudioSettings } from "../../contracts/entities";
import {
  BuniumSettingsBridgeService,
  type SettingsPort,
  SettingsServiceError,
} from "./settings-bridge-service";

export type SettingsPhase = "loading" | "ready" | "saving" | "load-failed";
export type SettingsSnapshot = {
  phase: SettingsPhase;
  settings: StudioSettings | null;
  draft: StudioSettings | null;
  saveError: "INVALID_INPUT" | "CONFLICT" | "INTERNAL" | null;
  conflict: StudioSettings | null;
};

type Listener = (snapshot: SettingsSnapshot) => void;

const clone = (value: StudioSettings): StudioSettings =>
  JSON.parse(JSON.stringify(value)) as StudioSettings;

/** Local draft controller with optimistic-revision conflict handling. */
export class SettingsController {
  private snapshot: SettingsSnapshot = {
    phase: "loading",
    settings: null,
    draft: null,
    saveError: null,
    conflict: null,
  };
  private readonly listeners = new Set<Listener>();
  private closed = false;

  constructor(
    private readonly service: SettingsPort = new BuniumSettingsBridgeService(),
  ) {}

  get current(): SettingsSnapshot {
    return this.snapshot;
  }

  /** Notifies on later changes only; read `current` for the current state. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(): Promise<void> {
    this.set({ phase: "loading", saveError: null, conflict: null });
    try {
      const settings = await this.service.load();
      if (this.closed) return;
      this.set({
        phase: "ready",
        settings,
        draft: clone(settings),
        saveError: null,
      });
    } catch {
      if (this.closed) return;
      this.set({ phase: "load-failed" });
    }
  }

  edit(patch: Partial<StudioSettings>): void {
    if (!this.snapshot.draft) return;
    this.set({
      draft: { ...this.snapshot.draft, ...patch },
      saveError: null,
    });
  }

  editUpdate(patch: Partial<StudioSettings["update"]>): void {
    if (!this.snapshot.draft) return;
    this.set({
      draft: {
        ...this.snapshot.draft,
        update: { ...this.snapshot.draft.update, ...patch },
      },
      saveError: null,
    });
  }

  get dirty(): boolean {
    const { settings, draft } = this.snapshot;
    if (!settings || !draft) return false;
    return JSON.stringify(settings) !== JSON.stringify(draft);
  }

  async save(): Promise<void> {
    const { settings, draft } = this.snapshot;
    if (!settings || !draft || this.snapshot.phase === "saving") return;
    this.set({ phase: "saving", saveError: null, conflict: null });
    try {
      const saved = await this.service.save(settings.revision, draft);
      if (this.closed) return;
      this.set({ phase: "ready", settings: saved, draft: clone(saved) });
    } catch (error) {
      if (this.closed) return;
      const code =
        error instanceof SettingsServiceError ? error.code : "INTERNAL";
      if (code === "CONFLICT") {
        try {
          const current = await this.service.load();
          if (this.closed) return;
          this.set({
            phase: "ready",
            settings: current,
            conflict: current,
            saveError: "CONFLICT",
          });
        } catch {
          this.set({ phase: "ready", saveError: "INTERNAL" });
        }
        return;
      }
      if (
        code === "UNAVAILABLE" ||
        code === "INTERNAL" ||
        code === "INVALID_INPUT"
      ) {
        this.set({
          phase: "ready",
          saveError: code === "UNAVAILABLE" ? "INTERNAL" : code,
        });
        return;
      }
      this.set({ phase: "ready", saveError: "INTERNAL" });
    }
  }

  resolveConflict(choice: "reload" | "overwrite"): void {
    const { conflict } = this.snapshot;
    if (!conflict) return;
    if (choice === "reload") {
      this.set({ draft: clone(conflict), conflict: null, saveError: null });
      return;
    }
    this.set({ settings: conflict, conflict: null, saveError: null });
    void this.save();
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  private set(patch: Partial<SettingsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener(this.snapshot);
  }
}
