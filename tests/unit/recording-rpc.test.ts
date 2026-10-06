import { describe, expect, test } from "bun:test";
import { parseRecordingRequest } from "../../apps/studio/src/contracts/recording-rpc";

describe("recording RPC boundary (09b)", () => {
  test("parses start/status/stop/cancel", () => {
    expect(
      parseRecordingRequest(
        JSON.stringify({
          requestId: "req-1",
          command: { method: "start", simulatorId: "proj:android" },
        }),
      ),
    ).toEqual({
      requestId: "req-1",
      command: { method: "start", simulatorId: "proj:android" },
    });
    for (const method of ["stop", "cancel", "status"] as const) {
      expect(
        parseRecordingRequest({ requestId: "r", command: { method } }),
      ).toMatchObject({ command: { method } });
    }
  });

  test("rejects unknown fields, empty IDs and bad request IDs", () => {
    expect(
      parseRecordingRequest({
        requestId: "r",
        command: { method: "start", simulatorId: "" },
      }),
    ).toBeNull();
    expect(
      parseRecordingRequest({
        requestId: "r",
        command: { method: "start", simulatorId: "s", extra: 1 },
      }),
    ).toBeNull();
    expect(
      parseRecordingRequest({
        requestId: "!!!",
        command: { method: "status" },
      }),
    ).toBeNull();
  });
});
