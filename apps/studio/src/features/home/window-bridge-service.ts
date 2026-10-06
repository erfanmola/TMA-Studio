import type {
  StudioWindowAction,
  StudioWindowReply,
} from "../../contracts/studio-window-rpc";
import { nextRequestId } from "../users/request-id";

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: StudioWindowReply | null) => void;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Requests keyed native management windows from the Bunium main process. */
export class BuniumWindowBridgeService {
  private readonly pending = new Map<string, Pending>();
  private readonly bridge: Bridge;
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    if (value.ok === true) {
      resolve({ requestId: value.requestId, ok: true });
    } else if (
      value.ok === false &&
      ["INVALID_INPUT", "NOT_FOUND", "INTERNAL"].includes(String(value.error))
    ) {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: value.error as "INVALID_INPUT" | "NOT_FOUND" | "INTERNAL",
      });
    } else {
      resolve({ requestId: value.requestId, ok: false, error: "INTERNAL" });
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new Error("The trusted window bridge is unavailable.");
    this.bridge = bridge;
    bridge.on("studio.window.reply", this.receive);
  }

  open(action: StudioWindowAction): Promise<void> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Studio could not open the requested window."));
      }, 15_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (reply?.ok) resolve();
        else reject(new Error("Studio could not open the requested window."));
      });
      this.bridge.send(
        "studio.window.request",
        JSON.stringify({ requestId, action }),
      );
    });
  }

  closeWindow(windowKey: string): void {
    this.bridge.send("studio.window.close", JSON.stringify({ windowKey }));
  }

  close(): void {
    this.bridge.off?.("studio.window.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "INTERNAL" });
    }
    this.pending.clear();
  }
}
