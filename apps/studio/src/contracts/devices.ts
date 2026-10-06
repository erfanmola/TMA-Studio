import type { DevicePreset } from "./entities";

/**
 * Card 05d device catalog. Decorative frame dimensions never determine DPI:
 * `targetDpr` is render pixels / CSS viewport pixels, independent of host
 * display scale, Studio uiScale, preview fit and toolbar side.
 */
export const DEVICE_PRESETS: readonly DevicePreset[] = [
  {
    id: "android-compact",
    platform: "android",
    labelKey: "settings.devices.androidCompact",
    viewport: { width: 412, height: 915 },
    targetDpr: 2.5,
    safeArea: { top: 24, right: 0, bottom: 48, left: 0 },
    contentSafeArea: { top: 24, right: 0, bottom: 80, left: 0 },
    frameAsset: "android-frame",
    capabilities: ["touch", "pointer-coarse"],
  },
  {
    id: "ios-compact",
    platform: "ios",
    labelKey: "settings.devices.iosCompact",
    viewport: { width: 390, height: 844 },
    targetDpr: 3,
    safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
    contentSafeArea: { top: 47, right: 0, bottom: 83, left: 0 },
    frameAsset: "ios-frame",
    capabilities: ["touch", "pointer-coarse"],
  },
  {
    id: "tdesktop-compact",
    platform: "tdesktop",
    labelKey: "settings.devices.tdesktopCompact",
    viewport: { width: 480, height: 640 },
    targetDpr: 1,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    contentSafeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    frameAsset: "tdesktop-frame",
    capabilities: ["pointer-fine", "hover"],
  },
  {
    id: "macos-compact",
    platform: "macos",
    labelKey: "settings.devices.macosCompact",
    viewport: { width: 480, height: 640 },
    targetDpr: 2,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    contentSafeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    frameAsset: "macos-frame",
    capabilities: ["pointer-fine", "hover"],
  },
  {
    id: "weba-compact",
    platform: "weba",
    labelKey: "settings.devices.webaCompact",
    viewport: { width: 412, height: 915 },
    targetDpr: 2,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    contentSafeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    frameAsset: "weba-frame",
    capabilities: ["touch", "pointer-coarse"],
  },
  {
    id: "webk-compact",
    platform: "webk",
    labelKey: "settings.devices.webkCompact",
    viewport: { width: 412, height: 915 },
    targetDpr: 2,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    contentSafeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    frameAsset: "webk-frame",
    capabilities: ["touch", "pointer-coarse"],
  },
];

export const DEFAULT_DEVICE_ID = "android-compact";

export function getDevicePreset(id: string): DevicePreset | null {
  return DEVICE_PRESETS.find((device) => device.id === id) ?? null;
}

/**
 * Guest viewport is a pure function of the selected device preset.
 * Studio uiScale, host display scale, preview fit and toolbar side must
 * never change it; they only affect surrounding chrome/layout.
 */
export function guestViewportForDevice(device: DevicePreset): {
  width: number;
  height: number;
} {
  return { width: device.viewport.width, height: device.viewport.height };
}
