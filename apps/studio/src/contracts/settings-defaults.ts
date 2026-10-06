import { DEFAULT_DEVICE_ID } from "./devices";
import type { StudioSettings } from "./entities";

export function defaultSettings(revision = 0): StudioSettings {
  return {
    schemaVersion: 1,
    revision,
    locale: "en",
    theme: "system",
    uiScale: 1,
    alwaysOnTop: false,
    restoreWindows: true,
    closeToTray: false,
    hapticFrameShake: false,
    defaultDeviceId: DEFAULT_DEVICE_ID,
    toolbarSide: "top",
    update: {
      checkAutomatically: true,
      downloadAutomatically: false,
      channel: "stable",
    },
  };
}
