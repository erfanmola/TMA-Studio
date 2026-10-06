import type { StudioSettings } from "../../src/contracts/entities";
import { StudioSettingsSchema } from "../../src/contracts/schemas";
import { defaultSettings } from "../../src/contracts/settings-defaults";
import {
  parseSettingsRequest,
  safeSettingsReply,
} from "../../src/contracts/settings-rpc";
import { StoreConflictError, type StudioStore } from "./store";

export class SettingsServiceError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "CONFLICT" | "INTERNAL") {
    super(code);
    this.name = "SettingsServiceError";
  }
}

export { defaultSettings };

/**
 * Host-owned settings. Persists via StudioStore with optimistic revisions
 * and applies always-on-top through the native window registry. Guest
 * dimensions are never derived here; the renderer resolves them from the
 * device catalog by `defaultDeviceId`.
 */
export class HostSettingsService {
  constructor(
    private readonly store: StudioStore,
    private readonly applyAlwaysOnTop?: (enabled: boolean) => void,
  ) {}

  load(): StudioSettings {
    try {
      return this.store.getSnapshot().settings ?? defaultSettings(0);
    } catch {
      throw new SettingsServiceError("INTERNAL");
    }
  }

  save(expectedRevision: number, input: StudioSettings): StudioSettings {
    let parsed: StudioSettings;
    try {
      parsed = StudioSettingsSchema.parse(input);
    } catch {
      throw new SettingsServiceError("INVALID_INPUT");
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new SettingsServiceError("INVALID_INPUT");
    }
    try {
      const saved = this.store.updateSettings(parsed, expectedRevision);
      try {
        this.applyAlwaysOnTop?.(saved.alwaysOnTop);
      } catch {
        // Persistence already committed; a native apply failure is
        // surfaced by the caller as INTERNAL without rolling back storage.
        throw new SettingsServiceError("INTERNAL");
      }
      return saved;
    } catch (error) {
      if (error instanceof StoreConflictError)
        throw new SettingsServiceError("CONFLICT");
      if (error instanceof SettingsServiceError) throw error;
      throw new SettingsServiceError("INTERNAL");
    }
  }
}

export async function handleSettingsRequest(
  payload: unknown,
  service: HostSettingsService,
) {
  const request = parseSettingsRequest(payload);
  if (!request) return null;
  try {
    if (request.command.method === "load")
      return safeSettingsReply(request.requestId, service.load());
    const saved = service.save(
      request.command.expectedRevision,
      request.command.settings,
    );
    return safeSettingsReply(request.requestId, saved);
  } catch (error) {
    return {
      requestId: request.requestId,
      ok: false as const,
      error:
        error instanceof SettingsServiceError
          ? error.code
          : ("INTERNAL" as const),
    };
  }
}
