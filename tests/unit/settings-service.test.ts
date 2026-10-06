import { describe, expect, test } from "bun:test";
import {
  defaultSettings,
  HostSettingsService,
} from "../../apps/studio/bunium/services/settings-service";
import { StudioStore } from "../../apps/studio/bunium/services/store";

function freshStore() {
  return new StudioStore(":memory:");
}

describe("HostSettingsService (05d)", () => {
  test("loads defaults with alwaysOnTop false", () => {
    const store = freshStore();
    try {
      const service = new HostSettingsService(store);
      const settings = service.load();
      expect(settings.alwaysOnTop).toBe(false);
      expect(settings.locale).toBe("en");
      expect(settings.theme).toBe("system");
      expect(settings.defaultDeviceId).toBe("android-compact");
      expect(settings.toolbarSide).toBe("top");
    } finally {
      store.close();
    }
  });

  test("persists settings and applies alwaysOnTop via native adapter", () => {
    const store = freshStore();
    try {
      const applied: boolean[] = [];
      const service = new HostSettingsService(store, (enabled) => {
        applied.push(enabled);
      });
      const base = service.load();
      const saved = service.save(0, {
        ...base,
        alwaysOnTop: true,
        locale: "fa",
      });
      expect(saved.alwaysOnTop).toBe(true);
      expect(saved.locale).toBe("fa");
      expect(applied).toEqual([true]);
      expect(service.load().locale).toBe("fa");
    } finally {
      store.close();
    }
  });

  test("rejects stale revisions without applying native state", () => {
    const store = freshStore();
    try {
      const applied: boolean[] = [];
      const service = new HostSettingsService(store, (enabled) => {
        applied.push(enabled);
      });
      const base = service.load();
      service.save(0, { ...base, theme: "dark" });
      expect(() => service.save(0, { ...base, theme: "light" })).toThrow(
        "CONFLICT",
      );
      expect(applied).toEqual([false]);
    } finally {
      store.close();
    }
  });

  test("rejects invalid settings input", () => {
    const store = freshStore();
    try {
      const service = new HostSettingsService(store);
      const base = defaultSettings(0);
      expect(() => service.save(0, { ...base, locale: "xx" as never })).toThrow(
        "INVALID_INPUT",
      );
      expect(() => service.save(0, { ...base, uiScale: 3 as never })).toThrow(
        "INVALID_INPUT",
      );
    } finally {
      store.close();
    }
  });

  test("surfaces native apply failure as INTERNAL after commit", () => {
    const store = freshStore();
    try {
      const service = new HostSettingsService(store, () => {
        throw new Error("unsupported");
      });
      const base = service.load();
      expect(() => service.save(0, { ...base, alwaysOnTop: true })).toThrow(
        "INTERNAL",
      );
      // Storage committed; reload shows the persisted value.
      expect(service.load().alwaysOnTop).toBe(true);
    } finally {
      store.close();
    }
  });
});
