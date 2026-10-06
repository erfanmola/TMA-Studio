import type { StudioSettings } from "../../contracts/entities";
import { defaultSettings } from "../../contracts/settings-defaults";
import type { SettingsPort } from "../settings/settings-bridge-service";
import { SettingsServiceError } from "../settings/settings-bridge-service";

/** Development-only in-memory settings for review scenes. */
export class MemorySettingsService implements SettingsPort {
  private current: StudioSettings;
  failNextSave = false;

  constructor(initial?: Partial<StudioSettings>) {
    this.current = { ...defaultSettings(0), ...initial };
  }

  touch(patch: Partial<StudioSettings>): void {
    this.current = {
      ...this.current,
      ...patch,
      revision: this.current.revision + 1,
    };
  }

  async load(): Promise<StudioSettings> {
    return JSON.parse(JSON.stringify(this.current)) as StudioSettings;
  }

  async save(
    expectedRevision: number,
    settings: StudioSettings,
  ): Promise<StudioSettings> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new SettingsServiceError("INTERNAL");
    }
    if (expectedRevision !== this.current.revision) {
      throw new SettingsServiceError("CONFLICT");
    }
    this.current = {
      ...(JSON.parse(JSON.stringify(settings)) as StudioSettings),
      revision: this.current.revision + 1,
    };
    return JSON.parse(JSON.stringify(this.current)) as StudioSettings;
  }
}
