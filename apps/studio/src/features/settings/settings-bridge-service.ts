import type { StudioSettings } from "../../contracts/entities";
import { StudioSettingsSchema } from "../../contracts/schemas";
import type {
  SettingsReply,
  SettingsRequest,
} from "../../contracts/settings-rpc";
import { nextRequestId } from "../users/request-id";

export class SettingsServiceError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "CONFLICT" | "INTERNAL" | "UNAVAILABLE",
  ) {
    super(code);
    this.name = "SettingsServiceError";
  }
}

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: SettingsReply | null) => void;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface SettingsPort {
  load(): Promise<StudioSettings>;
  save(
    expectedRevision: number,
    settings: StudioSettings,
  ): Promise<StudioSettings>;
}

/** Renderer adapter over the trusted settings IPC boundary. */
export class BuniumSettingsBridgeService implements SettingsPort {
  private readonly bridge: Bridge;
  private readonly pending = new Map<string, Pending>();
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    if (value.ok === true) {
      try {
        const parsed = StudioSettingsSchema.parse(
          (value as { result: unknown }).result,
        );
        resolve({ requestId: value.requestId, ok: true, result: parsed });
        return;
      } catch {
        resolve({ requestId: value.requestId, ok: false, error: "INTERNAL" });
        return;
      }
    }
    const code = String((value as { error?: unknown }).error);
    if (
      code === "INVALID_INPUT" ||
      code === "CONFLICT" ||
      code === "INTERNAL"
    ) {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: code as SettingsReply extends { ok: false; error: infer E }
          ? E
          : never,
      });
    } else {
      resolve({ requestId: value.requestId, ok: false, error: "INTERNAL" });
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new SettingsServiceError("UNAVAILABLE");
    this.bridge = bridge;
    bridge.on("settings.reply", this.receive);
  }

  load(): Promise<StudioSettings> {
    return this.request({ method: "load" });
  }

  save(
    expectedRevision: number,
    settings: StudioSettings,
  ): Promise<StudioSettings> {
    return this.request({ method: "save", expectedRevision, settings });
  }

  close(): void {
    this.bridge.off?.("settings.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "INTERNAL" });
    }
    this.pending.clear();
  }

  private request(
    command: SettingsRequest["command"],
  ): Promise<StudioSettings> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new SettingsServiceError("UNAVAILABLE"));
      }, 15_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (!reply) reject(new SettingsServiceError("INTERNAL"));
        else if (!reply.ok) reject(new SettingsServiceError(reply.error));
        else resolve(reply.result);
      });
      this.bridge.send(
        "settings.request",
        JSON.stringify({ requestId, command }),
      );
    });
  }
}
