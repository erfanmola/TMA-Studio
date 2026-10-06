import type { CaptureReply, CaptureScope } from "../../contracts/capture";
import type { GuestRect, ToolbarSide } from "../../contracts/simulator";

type Bridge = NonNullable<Window["__bunium"]>;
let sequence = 0;

export class CaptureBridgeService {
  private readonly pending = new Map<string, (reply: CaptureReply) => void>();
  private readonly receive = (raw: unknown) => {
    if (!raw || typeof raw !== "object") return;
    const value = raw as Record<string, unknown>;
    if (typeof value.requestId !== "string") return;
    let reply: CaptureReply;
    if (value.ok === true && typeof value.fileName === "string") {
      reply = {
        requestId: value.requestId,
        ok: true,
        fileName: value.fileName,
      };
    } else if (
      value.ok === false &&
      ["CANCELED", "UNAVAILABLE", "FAILED"].includes(String(value.error))
    ) {
      reply = {
        requestId: value.requestId,
        ok: false,
        error: value.error as "CANCELED" | "UNAVAILABLE" | "FAILED",
      };
    } else return;
    this.pending.get(value.requestId)?.(reply);
  };

  constructor(private readonly bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new Error("The trusted capture bridge is unavailable.");
    bridge.on("capture.reply", this.receive);
  }

  request(input: {
    scope: CaptureScope;
    side: ToolbarSide;
    host: { width: number; height: number };
    guest: GuestRect;
  }): Promise<CaptureReply> {
    const requestId = `capture-${++sequence}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ requestId, ok: false, error: "FAILED" });
      }, 120_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        this.pending.delete(requestId);
        resolve(reply);
      });
      this.bridge?.send(
        "capture.request",
        JSON.stringify({ requestId, ...input }),
      );
    });
  }

  close(): void {
    this.bridge?.off?.("capture.reply", this.receive);
    for (const [requestId, resolve] of this.pending)
      resolve({ requestId, ok: false, error: "FAILED" });
    this.pending.clear();
  }
}
