import { describe, expect, test } from "bun:test";
import { parseSimulatorRequest } from "../../apps/studio/src/contracts/simulator-rpc";

describe("simulator renderer command boundary", () => {
  test("accepts only narrow state changes and bounded content geometry", () => {
    expect(
      parseSimulatorRequest({
        requestId: "a1",
        command: { method: "set-mode", mode: "expanded" },
      }),
    ).toEqual({
      requestId: "a1",
      command: { method: "set-mode", mode: "expanded" },
    });
    expect(
      parseSimulatorRequest({
        requestId: "a2",
        command: { method: "set-side", side: "left" },
      }),
    ).not.toBeNull();
  });

  test("rejects identity, URL, partition, arbitrary window and out-of-range fields", () => {
    for (const command of [
      { method: "set-mode", mode: "expanded", simulatorId: "forged" },
      { method: "navigate", url: "https://attacker.example" },
      {
        method: "set-bounds",
        bounds: { x: 0, y: 0, width: 9000, height: 800 },
      },
      {
        method: "set-bounds",
        bounds: { x: -1, y: 0, width: 700, height: 800 },
      },
      { method: "set-side", side: "top", partitionId: "p" },
    ]) {
      expect(parseSimulatorRequest({ requestId: "a3", command })).toBeNull();
    }
    expect(
      parseSimulatorRequest({
        requestId: "bad id",
        command: { method: "reload" },
      }),
    ).toBeNull();
  });

  test("accepts bounded location overrides and clear without guest identity", () => {
    expect(
      parseSimulatorRequest({
        requestId: "loc-1",
        command: {
          method: "set-location",
          latitude: 37.7749,
          longitude: -122.4194,
          accuracy: 12,
        },
      }),
    ).toEqual({
      requestId: "loc-1",
      command: {
        method: "set-location",
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 12,
      },
    });
    expect(
      parseSimulatorRequest({
        requestId: "loc-2",
        command: { method: "clear-location" },
      }),
    ).not.toBeNull();
    for (const command of [
      { method: "set-location", latitude: 91, longitude: 0, accuracy: 1 },
      { method: "set-location", latitude: 0, longitude: -181, accuracy: 1 },
      { method: "set-location", latitude: 0, longitude: 0, accuracy: 100001 },
      {
        method: "set-location",
        latitude: 0,
        longitude: 0,
        accuracy: 1,
        simulatorId: "forged",
      },
    ])
      expect(
        parseSimulatorRequest({ requestId: "loc-bad", command }),
      ).toBeNull();
  });
});
