import { describe, expect, test } from "bun:test";
import {
  HostRecordingService,
  RecordingSession,
} from "../../apps/studio/bunium/services/recording-service";

describe("RecordingSession backpressure (09b)", () => {
  test("bounds memory over a long run: descriptors capped, drops counted", () => {
    const session = new RecordingSession("sim-1");
    let accepted = 0;
    let dropped = 0;
    for (let i = 0; i < 10_000; i++) {
      if (
        session.push({
          bytes: 64 * 1024,
          timestampMs: i * 33,
          keyframe: i % 30 === 0,
        })
      )
        accepted += 1;
      else dropped += 1;
    }
    expect(session.accepted).toBeLessThanOrEqual(900);
    expect(session.bufferedBytes).toBeLessThanOrEqual(48 * 1024 * 1024);
    expect(session.droppedCount).toBe(dropped);
    expect(accepted + dropped).toBe(10_000);
    expect(dropped).toBeGreaterThan(0);
  });

  test("never retains payload copies, only descriptors", () => {
    const session = new RecordingSession("sim-1");
    const payload = {
      bytes: 100,
      timestampMs: 1,
      keyframe: true,
      extra: "must-not-persist",
    };
    session.push(
      payload as { bytes: number; timestampMs: number; keyframe: boolean },
    );
    const status = session.status();
    expect(status.framesAccepted).toBe(1);
    // Mutating the caller's object cannot change the buffered descriptor.
    (payload as { bytes: number }).bytes = 999_999;
    expect(session.bufferedBytes).toBe(100);
  });

  test("finalize writes a manifest; disk-full maps explicitly", () => {
    const session = new RecordingSession("sim-1");
    session.push({ bytes: 10, timestampMs: 0, keyframe: true });
    const written: string[] = [];
    const status = session.finalize({
      write: (manifest) => written.push(manifest),
    });
    expect(status.state).toBe("idle");
    expect(written).toHaveLength(1);
    const manifest = JSON.parse(written[0] as string) as {
      framesAccepted: number;
    };
    expect(manifest.framesAccepted).toBe(1);

    const full = new RecordingSession("sim-2");
    expect(() =>
      full.finalize({
        write: () => {
          throw Object.assign(new Error("no space"), { code: "ENOSPC" });
        },
      }),
    ).toThrow("DISK_FULL");
  });

  test("cancel discards; crash abandons with CRASHED status", () => {
    const session = new RecordingSession("sim-1");
    session.push({ bytes: 10, timestampMs: 0, keyframe: true });
    const canceled = session.cancel();
    expect(canceled.framesAccepted).toBe(0);
    expect(canceled.bytesBuffered).toBe(0);

    const crashing = new RecordingSession("sim-2");
    crashing.push({ bytes: 10, timestampMs: 0, keyframe: true });
    const crashed = crashing.crash();
    expect(crashed.state).toBe("failed");
    expect(crashed.error).toBe("CRASHED");
  });
});

describe("HostRecordingService lifecycle (09b)", () => {
  test("one session at a time with explicit stop/cancel", () => {
    const service = new HostRecordingService();
    expect(service.status().state).toBe("idle");
    service.start("sim-1");
    expect(() => service.start("sim-2")).toThrow("ALREADY_RECORDING");
    service.push({ bytes: 10, timestampMs: 0, keyframe: true });
    const stopped = service.stop({ write: () => undefined });
    expect(stopped.state).toBe("idle");
    expect(service.status().state).toBe("idle");
    expect(() => service.stop({ write: () => undefined })).toThrow(
      "NOT_RECORDING",
    );
    service.start("sim-3");
    service.cancel();
    expect(service.status().state).toBe("idle");
  });

  test("elapsed time advances", () => {
    const session = new RecordingSession("sim-1");
    const startedAt = (session as unknown as { startedAt: number }).startedAt;
    expect(session.elapsedMs(startedAt)).toBe(0);
    expect(session.elapsedMs(Date.now() + 1000)).toBeGreaterThanOrEqual(1000);
  });
});
