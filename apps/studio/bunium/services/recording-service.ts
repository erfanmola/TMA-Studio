import type { RecordingStatus } from "../../src/contracts/recording-rpc";
import { parseRecordingRequest } from "../../src/contracts/recording-rpc";

export class RecordingServiceError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "NOT_RECORDING"
      | "ALREADY_RECORDING"
      | "DISK_FULL"
      | "CRASHED"
      | "INTERNAL",
  ) {
    super(code);
    this.name = "RecordingServiceError";
  }
}

/** Opaque frame descriptor. Payload bytes never enter the session. */
export interface RecordingFrame {
  bytes: number;
  timestampMs: number;
  keyframe: boolean;
}

export interface RecordingManifestWriter {
  write(manifest: string): void;
}

const MAX_FRAMES = 900;
const MAX_BYTES = 48 * 1024 * 1024;

function isDiskFull(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOSPC"
  );
}

/**
 * Bounded recording session. Frames are counted, never copied: the buffer
 * holds descriptors only. Backpressure drops incoming frames and counts
 * them; memory stays capped at MAX_FRAMES descriptors / MAX_BYTES accounted.
 * The playable encoder remains an open native seam (01g spike only), so
 * finalize writes a frame manifest, not a video file.
 */
export class RecordingSession {
  private readonly frames: RecordingFrame[] = [];
  private bytesBuffered = 0;
  private dropped = 0;
  private readonly startedAt = Date.now();
  private ended = false;

  constructor(readonly simulatorId: string) {}

  get accepted(): number {
    return this.frames.length;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  get bufferedBytes(): number {
    return this.bytesBuffered;
  }

  elapsedMs(now = Date.now()): number {
    return Math.max(0, now - this.startedAt);
  }

  /** Returns true when the frame was buffered, false when dropped. */
  push(frame: RecordingFrame): boolean {
    if (this.ended) throw new RecordingServiceError("INTERNAL");
    if (
      !Number.isFinite(frame.bytes) ||
      frame.bytes < 0 ||
      frame.bytes > MAX_BYTES ||
      !Number.isFinite(frame.timestampMs)
    ) {
      throw new RecordingServiceError("INVALID_INPUT");
    }
    if (
      this.frames.length >= MAX_FRAMES ||
      this.bytesBuffered + frame.bytes > MAX_BYTES
    ) {
      this.dropped += 1;
      return false;
    }
    // Descriptors only: no payload copy is retained.
    this.frames.push({
      bytes: frame.bytes,
      timestampMs: frame.timestampMs,
      keyframe: frame.keyframe,
    });
    this.bytesBuffered += frame.bytes;
    return true;
  }

  finalize(writer: RecordingManifestWriter): RecordingStatus {
    if (this.ended) throw new RecordingServiceError("INTERNAL");
    this.ended = true;
    const manifest = JSON.stringify({
      simulatorId: this.simulatorId,
      framesAccepted: this.frames.length,
      framesDropped: this.dropped,
      bytesBuffered: this.bytesBuffered,
      elapsedMs: this.elapsedMs(),
    });
    try {
      writer.write(manifest);
    } catch (error) {
      if (isDiskFull(error)) throw new RecordingServiceError("DISK_FULL");
      throw new RecordingServiceError("INTERNAL");
    }
    return this.status("idle", null);
  }

  cancel(): RecordingStatus {
    if (this.ended) throw new RecordingServiceError("INTERNAL");
    this.ended = true;
    this.frames.length = 0;
    this.bytesBuffered = 0;
    return this.status("idle", null);
  }

  crash(): RecordingStatus {
    this.ended = true;
    this.frames.length = 0;
    this.bytesBuffered = 0;
    return this.status("failed", "CRASHED");
  }

  status(
    state: RecordingStatus["state"] = "recording",
    error: RecordingStatus["error"] = null,
  ): RecordingStatus {
    return {
      state,
      simulatorId: this.simulatorId,
      framesAccepted: this.frames.length,
      framesDropped: this.dropped,
      bytesBuffered: this.bytesBuffered,
      elapsedMs: this.elapsedMs(),
      error,
    };
  }
}

/** One active session per host; start/stop/cancel are explicit. */
export class HostRecordingService {
  private session: RecordingSession | null = null;

  start(simulatorId: string): RecordingStatus {
    if (typeof simulatorId !== "string" || simulatorId.length === 0)
      throw new RecordingServiceError("INVALID_INPUT");
    if (this.session) throw new RecordingServiceError("ALREADY_RECORDING");
    this.session = new RecordingSession(simulatorId);
    return this.session.status();
  }

  push(frame: RecordingFrame): RecordingStatus {
    if (!this.session) throw new RecordingServiceError("NOT_RECORDING");
    this.session.push(frame);
    return this.session.status();
  }

  stop(writer: RecordingManifestWriter): RecordingStatus {
    if (!this.session) throw new RecordingServiceError("NOT_RECORDING");
    try {
      return this.session.finalize(writer);
    } finally {
      this.session = null;
    }
  }

  cancel(): RecordingStatus {
    if (!this.session) throw new RecordingServiceError("NOT_RECORDING");
    try {
      return this.session.cancel();
    } finally {
      this.session = null;
    }
  }

  crash(): RecordingStatus {
    if (!this.session) throw new RecordingServiceError("NOT_RECORDING");
    try {
      return this.session.crash();
    } finally {
      this.session = null;
    }
  }

  status(): RecordingStatus {
    if (!this.session) {
      return {
        state: "idle",
        simulatorId: null,
        framesAccepted: 0,
        framesDropped: 0,
        bytesBuffered: 0,
        elapsedMs: 0,
        error: null,
      };
    }
    return this.session.status();
  }
}

export async function handleRecordingRequest(
  payload: unknown,
  service: HostRecordingService,
  writer: RecordingManifestWriter,
) {
  const request = parseRecordingRequest(payload);
  if (!request) return null;
  try {
    switch (request.command.method) {
      case "start":
        return {
          requestId: request.requestId,
          ok: true as const,
          result: service.start(request.command.simulatorId),
        };
      case "stop":
        return {
          requestId: request.requestId,
          ok: true as const,
          result: service.stop(writer),
        };
      case "cancel":
        return {
          requestId: request.requestId,
          ok: true as const,
          result: service.cancel(),
        };
      case "status":
        return {
          requestId: request.requestId,
          ok: true as const,
          result: service.status(),
        };
    }
  } catch (error) {
    const code =
      error instanceof RecordingServiceError ? error.code : "INTERNAL";
    if (code === "DISK_FULL" || code === "CRASHED") {
      return {
        requestId: request.requestId,
        ok: true as const,
        result: {
          state: "failed" as const,
          simulatorId: null,
          framesAccepted: 0,
          framesDropped: 0,
          bytesBuffered: 0,
          elapsedMs: 0,
          error: code,
        },
      };
    }
    return {
      requestId: request.requestId,
      ok: false as const,
      error:
        code === "INVALID_INPUT" ||
        code === "NOT_RECORDING" ||
        code === "ALREADY_RECORDING"
          ? code
          : ("INTERNAL" as const),
    };
  }
}
