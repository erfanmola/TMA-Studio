import { describe, expect, test } from "bun:test";
import {
  KeyedStudioWindowRegistry,
  type ReusableNativeWindow,
} from "../../apps/studio/bunium/runtime/keyed-windows";
import { StudioWindowRegistry } from "../../apps/studio/bunium/runtime/windows";

class FakeWindow implements ReusableNativeWindow {
  readonly closeListeners: Array<() => void> = [];
  showCalls = 0;
  focusCalls = 0;
  closed = false;

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  show(): void {
    this.showCalls += 1;
  }

  focus(): void {
    this.focusCalls += 1;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) listener();
  }
}

function makeRegistry(): KeyedStudioWindowRegistry<FakeWindow> {
  return new KeyedStudioWindowRegistry(new StudioWindowRegistry());
}

describe("KeyedStudioWindowRegistry", () => {
  test("reuses a stable key by showing and focusing its existing window", () => {
    const registry = makeRegistry();
    const window = new FakeWindow();
    let factoryCalls = 0;

    expect(registry.open("settings", () => window)).toBe(window);
    expect(
      registry.open("settings", () => {
        factoryCalls += 1;
        return new FakeWindow();
      }),
    ).toBe(window);

    expect(factoryCalls).toBe(0);
    expect(window.showCalls).toBe(1);
    expect(window.focusCalls).toBe(1);
    expect(registry.count).toBe(1);
  });

  test("removes closed windows and notifies when the last window closes", () => {
    const registry = makeRegistry();
    const first = new FakeWindow();
    const second = new FakeWindow();
    let emptyCalls = 0;
    registry.onEmpty(() => emptyCalls++);

    registry.open("first", () => first);
    registry.open("second", () => second);
    first.close();
    expect(registry.count).toBe(1);
    expect(emptyCalls).toBe(0);

    second.close();
    expect(registry.count).toBe(0);
    expect(emptyCalls).toBe(1);
  });

  test("explicit close permits reopening without a stale close removing replacement", () => {
    const registry = makeRegistry();
    const oldWindow = new FakeWindow();
    const replacement = new FakeWindow();
    let emptyCalls = 0;
    registry.onEmpty(() => emptyCalls++);
    registry.open("preview", () => oldWindow);

    expect(registry.close("preview")).toBe(true);
    expect(oldWindow.closed).toBe(true);
    expect(registry.count).toBe(0);

    registry.open("preview", () => replacement);
    for (const listener of oldWindow.closeListeners) listener();
    expect(registry.get("preview")).toBe(replacement);
    expect(registry.count).toBe(1);
    expect(emptyCalls).toBe(1);
  });

  test("returns false when explicitly closing a missing key", () => {
    const registry = makeRegistry();
    expect(registry.close("missing")).toBe(false);
    expect(registry.count).toBe(0);
  });

  test("closeAll closes all owned windows and signals empty once", () => {
    const registry = makeRegistry();
    const first = new FakeWindow();
    const second = new FakeWindow();
    let emptyCalls = 0;
    registry.onEmpty(() => emptyCalls++);
    registry.open("first", () => first);
    registry.open("second", () => second);

    registry.closeAll();

    expect(first.closed).toBe(true);
    expect(second.closed).toBe(true);
    expect(registry.count).toBe(0);
    expect(emptyCalls).toBe(1);
  });

  test("rejects empty keys", () => {
    const registry = makeRegistry();
    expect(() => registry.open("", () => new FakeWindow())).toThrow(
      "non-empty strings",
    );
  });

  test("a rejected registration throws without recording the key or emitting empty", () => {
    // Startup pins always-on-top from saved settings before any window
    // exists; a runtime without setAlwaysOnTop (e.g. an older installed
    // Bunium package) then rejects the first window. The key must stay
    // unrecorded and no empty-transition may fire -- otherwise the app-wide
    // shutdown path exits(0) before the error surfaces (silent death).
    const inner = new StudioWindowRegistry();
    const registry = new KeyedStudioWindowRegistry<FakeWindow>(inner);
    let emptyCalls = 0;
    registry.onEmpty(() => emptyCalls++);
    inner.setAlwaysOnTop(true);
    const window = new FakeWindow();
    expect(() => registry.open("home", () => window)).toThrow("unavailable");
    expect(window.closed).toBe(true);
    expect(registry.get("home")).toBeUndefined();
    expect(registry.count).toBe(0);
    expect(emptyCalls).toBe(0);
  });
});
