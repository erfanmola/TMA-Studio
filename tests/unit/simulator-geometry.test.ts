import { describe, expect, test } from "bun:test";
import {
  guestRect,
  SIMULATOR_TOOLBAR_GAP,
  SIMULATOR_TOOLBAR_SIZE,
  SIMULATOR_VERTICAL_TOOLBAR_SIZE,
} from "../../apps/studio/src/contracts/simulator";

describe("simulator guest geometry", () => {
  test("keeps the full 0.5rem gap between one rail and the guest on each physical side", () => {
    expect(SIMULATOR_TOOLBAR_GAP).toBe(8);
    expect(guestRect({ width: 1000, height: 800 }, "top")).toEqual({
      x: 0,
      y: SIMULATOR_TOOLBAR_SIZE + 8,
      width: 1000,
      height: 800 - SIMULATOR_TOOLBAR_SIZE - 8,
    });
    expect(guestRect({ width: 1000, height: 800 }, "bottom")).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800 - SIMULATOR_TOOLBAR_SIZE - 8,
    });
    expect(guestRect({ width: 1000, height: 800 }, "left")).toEqual({
      x: SIMULATOR_VERTICAL_TOOLBAR_SIZE + 8,
      y: 0,
      width: 1000 - SIMULATOR_VERTICAL_TOOLBAR_SIZE - 8,
      height: 800,
    });
    expect(guestRect({ width: 1000, height: 800 }, "right")).toEqual({
      x: 0,
      y: 0,
      width: 1000 - SIMULATOR_VERTICAL_TOOLBAR_SIZE - 8,
      height: 800,
    });
  });

  test("bounds narrow and fractional host sizes to positive integer pixels", () => {
    expect(guestRect({ width: 14.8, height: 13.2 }, "top")).toEqual({
      x: 0,
      y: 12,
      width: 14,
      height: 1,
    });
    expect(guestRect({ width: 14.8, height: 13.2 }, "right")).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 13,
    });
  });

  test("reserves the expanded location editor from the native guest layer on every side", () => {
    const host = { width: 1000, height: 800 };
    expect(guestRect(host, "top", undefined, undefined, 280)).toEqual({
      x: 0,
      y: SIMULATOR_TOOLBAR_SIZE + 8 + 280,
      width: 1000,
      height: 800 - SIMULATOR_TOOLBAR_SIZE - 8 - 280,
    });
    expect(guestRect(host, "bottom", undefined, undefined, 280)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800 - SIMULATOR_TOOLBAR_SIZE - 8 - 280,
    });
    expect(guestRect(host, "left", undefined, undefined, 240)).toEqual({
      x: SIMULATOR_VERTICAL_TOOLBAR_SIZE + 8 + 240,
      y: 0,
      width: 1000 - SIMULATOR_VERTICAL_TOOLBAR_SIZE - 8 - 240,
      height: 800,
    });
    expect(guestRect(host, "right", undefined, undefined, 240)).toEqual({
      x: 0,
      y: 0,
      width: 1000 - SIMULATOR_VERTICAL_TOOLBAR_SIZE - 8 - 240,
      height: 800,
    });
  });
});
