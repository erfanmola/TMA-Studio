import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DEVICE_ID,
  DEVICE_PRESETS,
  getDevicePreset,
  guestViewportForDevice,
} from "../../apps/studio/src/contracts/devices";

describe("device catalog (05d)", () => {
  test("covers all six platforms once with bounded viewports", () => {
    const platforms = DEVICE_PRESETS.map((device) => device.platform).sort();
    expect(platforms).toEqual([
      "android",
      "ios",
      "macos",
      "tdesktop",
      "weba",
      "webk",
    ]);
    for (const device of DEVICE_PRESETS) {
      expect(device.viewport.width).toBeGreaterThanOrEqual(320);
      expect(device.viewport.height).toBeGreaterThanOrEqual(480);
      expect(device.targetDpr).toBeGreaterThanOrEqual(0.25);
      expect(device.targetDpr).toBeLessThanOrEqual(8);
    }
    expect(getDevicePreset(DEFAULT_DEVICE_ID)?.id).toBe(DEFAULT_DEVICE_ID);
    expect(getDevicePreset("missing")).toBeNull();
  });

  test("guest viewport is independent of Studio chrome state", () => {
    const device = getDevicePreset("android-compact");
    if (!device) throw new Error("missing android preset");
    const viewport = guestViewportForDevice(device);
    expect(viewport).toEqual({ width: 412, height: 915 });
    // Toolbar side, uiScale, theme and locale never enter this helper:
    // same device always yields the same guest viewport.
    expect(guestViewportForDevice(device)).toEqual(viewport);
    const ios = getDevicePreset("ios-compact");
    if (!ios) throw new Error("missing ios preset");
    expect(guestViewportForDevice(ios)).toEqual({ width: 390, height: 844 });
  });
});
