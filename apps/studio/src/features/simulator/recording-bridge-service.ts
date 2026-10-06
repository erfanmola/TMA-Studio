import type {
  RecordingReply,
  RecordingRequest,
  RecordingStatus,
} from "../../contracts/recording-rpc";
import { nextRequestId } from "../users/request-id";

export class RecordingServiceError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "NOT_RECORDING"
      | "ALREADY_RECORDING"
      | "INTERNAL"
      | "UNAVAILABLE",
  ) {
    super(code);
    this.name = "RecordingServiceError";
  }
}

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: RecordingReply | null) => void;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validReply(value: unknown): value is RecordingReply {
  if (!record(value) || typeof value.requestId !== "string") return false;
  if (value.ok === true) return record(value.result);
  return (
    value.ok === false &&
    [
      "INVALID_INPUT",
      "NOT_RECORDING",
      "ALREADY_RECORDING",
      "INTERNAL",
    ].includes(String(value.error))
  );
}

/**
 * Renderer adapter over the trusted recording IPC boundary. Frame payloads
 * never cross this channel; only start/stop/cancel/status commands and
 * status results do.
 */
export class BuniumRecordingBridgeService {
  private readonly bridge: Bridge;
  private readonly pending = new Map<string, Pending>();
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    resolve(validReply(value) ? value : null);
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new RecordingServiceError("UNAVAILABLE");
    this.bridge = bridge;
    bridge.on("recording.reply", this.receive);
  }

  start(simulatorId: string): Promise<RecordingStatus> {
    return this.request({
      method: "start",
      simulatorId,
    }) as Promise<RecordingStatus>;
  }

  stop(): Promise<RecordingStatus> {
    return this.request({ method: "stop" }) as Promise<RecordingStatus>;
  }

  cancel(): Promise<RecordingStatus> {
    return this.request({ method: "cancel" }) as Promise<RecordingStatus>;
  }

  status(): Promise<RecordingStatus> {
    return this.request({ method: "status" }) as Promise<RecordingStatus>;
  }

  close(): void {
    this.bridge.off?.("recording.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "INTERNAL" });
    }
    this.pending.clear();
  }

  private request(
    command: RecordingRequest["command"],
  ): Promise<RecordingStatus> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RecordingServiceError("UNAVAILABLE"));
      }, 30_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (!reply) reject(new RecordingServiceError("INTERNAL"));
        else if (!reply.ok) reject(new RecordingServiceError(reply.error));
        else resolve(reply.result);
      });
      this.bridge.send(
        "recording.request",
        JSON.stringify({ requestId, command }),
      );
    });
  }
}
