import { describe, expect, test } from "bun:test";
import {
  type ManagedNativeWindow,
  StudioWindowRegistry,
} from "../../apps/studio/bunium/runtime/windows";

class FakeWindow implements ManagedNativeWindow {
  readonly calls: boolean[] = [];
  readonly closeListeners: Array<() => void> = [];
  closed = false;
  state = false;
  failOnEnable = false;

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  setAlwaysOnTop(enabled: boolean): void {
    this.calls.push(enabled);
    if (enabled && this.failOnEnable) throw new Error("unsupported");
    this.state = enabled;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) listener();
  }
}

describe("StudioWindowRegistry", () => {
  test("defaults off and applies changes to existing and new windows", () => {
    const registry = new StudioWindowRegistry();
    const existing = registry.register(new FakeWindow());
    expect(registry.alwaysOnTop).toBe(false);
    expect(existing.calls).toEqual([]);

    registry.setAlwaysOnTop(true);
    expect(existing.state).toBe(true);
    expect(existing.calls).toEqual([true]);

    const created = registry.create(() => new FakeWindow());
    expect(created.state).toBe(true);
    expect(created.calls).toEqual([true]);

    registry.setAlwaysOnTop(true);
    expect(existing.calls).toEqual([true]);
    registry.setAlwaysOnTop(false);
    expect(existing.state).toBe(false);
    expect(created.state).toBe(false);
    expect(registry.alwaysOnTop).toBe(false);

    created.close();
    registry.setAlwaysOnTop(true);
    expect(created.calls).toEqual([true, false]);
  });

  test("rolls back earlier windows when a later window rejects the change", () => {
    const registry = new StudioWindowRegistry();
    const first = registry.register(new FakeWindow());
    const second = new FakeWindow();
    second.failOnEnable = true;
    registry.register(second);

    expect(() => registry.setAlwaysOnTop(true)).toThrow("unsupported");
    expect(first.state).toBe(false);
    expect(first.calls).toEqual([true, false]);
    expect(registry.alwaysOnTop).toBe(false);
  });

  test("closes a new window when the active preference cannot be applied", () => {
    const registry = new StudioWindowRegistry();
    registry.setAlwaysOnTop(true);
    let closed = false;
    const unsupported: ManagedNativeWindow = {
      close() {
        closed = true;
      },
      onClose() {},
    };
    expect(() => registry.create(() => unsupported)).toThrow(
      "unavailable in the installed Bunium runtime",
    );
    expect(closed).toBe(true);
  });
});
