import { describe, expect, test } from "bun:test";
import {
  AndroidChromeOverlays,
  type AndroidOverlayHost,
  androidChromeOverlayBounds,
} from "../../apps/studio/bunium/services/android-chrome-overlays";

function fakeHost() {
  const overlays: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    disposed: boolean;
    emitted: Array<{ name: string; payload: unknown }>;
    listeners: Map<string, (payload: unknown) => void>;
    url: string;
  }> = [];
  const host: AndroidOverlayHost = {
    createOverlay(options) {
      const entry = {
        bounds: {
          x: options.x,
          y: options.y,
          width: options.width,
          height: options.height,
        },
        disposed: false,
        emitted: [] as Array<{ name: string; payload: unknown }>,
        listeners: new Map<string, (payload: unknown) => void>(),
        url: options.url,
      };
      overlays.push(entry);
      return {
        on(name, listener) {
          entry.listeners.set(name, listener);
        },
        emit(name, payload) {
          entry.emitted.push({ name, payload });
        },
        setBounds(bounds) {
          entry.bounds = bounds;
        },
        dispose() {
          entry.disposed = true;
        },
      };
    },
  };
  return { host, overlays };
}

describe("Android chrome overlays", () => {
  test("keeps status and navigation hit areas outside the guest surface", () => {
    expect(
      androidChromeOverlayBounds({ x: 20, y: 30, width: 400, height: 700 }),
    ).toEqual({
      status: { x: 20, y: 30, width: 400, height: 48 },
      navigation: { x: 20, y: 690, width: 400, height: 40 },
      background: { x: 20, y: 78, width: 400, height: 612 },
    });
    expect(() =>
      androidChromeOverlayBounds({ x: 0, y: 0, width: 400, height: 88 }),
    ).toThrow(RangeError);
  });

  test("routes chrome actions and owns background overlay lifecycle", async () => {
    const { host, overlays } = fakeHost();
    const commands: string[] = [];
    const chrome = new AndroidChromeOverlays(host, {
      origin: "bunium://app",
      guestBounds: { x: 0, y: 48, width: 400, height: 672 },
      locale: "en",
      mode: "expanded",
      side: "top",
      theme: "dark",
      onCommand: (command) => commands.push(command.method),
    });
    expect(overlays).toHaveLength(2);
    expect(overlays[0]?.url).toContain("scene=android-chrome-overlay");
    overlays[1]?.listeners.get("simulator.request")?.({
      requestId: "android-navigation-1",
      command: { method: "android-home" },
    });
    expect(commands).toEqual(["android-home"]);

    chrome.setGuestBounds({ x: 4, y: 50, width: 390, height: 650 });
    expect(overlays[0]?.bounds).toEqual({
      x: 4,
      y: 50,
      width: 390,
      height: 48,
    });
    expect(overlays[1]?.bounds).toEqual({
      x: 4,
      y: 660,
      width: 390,
      height: 40,
    });
    expect(chrome.setGuestBounds({ x: 0, y: 0, width: 390, height: 80 })).toBe(
      false,
    );
    expect(overlays[0]?.bounds).toEqual({
      x: 4,
      y: 50,
      width: 390,
      height: 48,
    });
    chrome.setSurface("tasks");
    expect(overlays).toHaveLength(3);
    chrome.setSurface("mini-app");
    await Bun.sleep(10);
    expect(overlays[2]?.disposed).toBe(true);
    chrome.dispose();
    expect(overlays.slice(0, 2).every((overlay) => overlay.disposed)).toBe(
      true,
    );
  });
});
