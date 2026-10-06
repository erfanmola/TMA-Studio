import { describe, expect, test } from "bun:test";
import type {
  GuestBounds,
  GuestHandle,
  GuestLifecycleEvent,
} from "../../apps/studio/bunium/runtime/guest";
import { SimulatorController } from "../../apps/studio/bunium/services/simulator-controller";
import { createCoreProtocolState } from "../../apps/studio/src/domain/protocol/lifecycle";

function fakeGuest(initialGeneration = 3) {
  const bounds: GuestBounds[] = [];
  const lifecycleListeners = new Set<(event: GuestLifecycleEvent) => void>();
  const inboundListeners = new Set<
    (message: {
      data: string;
      navigationGeneration: number;
      simulatorId: string;
    }) => void
  >();
  const sentToGuest: string[] = [];
  let generation = initialGeneration;
  let disposed = false;
  const guest: GuestHandle = {
    get navigationGeneration() {
      return generation;
    },
    simulatorId: "simulator-1",
    dispose() {
      disposed = true;
    },
    navigate() {},
    onInbound(listener) {
      inboundListeners.add(listener);
      return () => inboundListeners.delete(listener);
    },
    onLifecycle(listener) {
      lifecycleListeners.add(listener);
      return () => lifecycleListeners.delete(listener);
    },
    postToGuest(_navigationGeneration, data) {
      sentToGuest.push(data);
      return true;
    },
    reload() {},
    setBounds(value) {
      bounds.push(value);
    },
  };
  return {
    bounds,
    fireMessage(data: unknown) {
      for (const listener of inboundListeners)
        listener({
          data: JSON.stringify(data),
          navigationGeneration: generation,
          simulatorId: "simulator-1",
        });
    },
    fireLifecycle(event: GuestLifecycleEvent) {
      generation = event.navigationGeneration;
      for (const listener of lifecycleListeners) listener(event);
    },
    get disposed() {
      return disposed;
    },
    guest,
    sentToGuest,
  };
}

describe("simulator controller", () => {
  test("retains one guest instance across side, mode, theme, and geometry changes", () => {
    const native = fakeGuest();
    const controller = new SimulatorController(
      native.guest,
      createCoreProtocolState({
        guestMountId: "mount-1",
        height: 720,
        navigationGeneration: 3,
        profile: "android",
        theme: "light",
        width: 480,
      }),
    );
    const originalGuest = controller.guest;
    const bounds = { height: 678, width: 480, x: 0, y: 42 };
    controller.setToolbarSide("top", bounds);
    controller.setMode("expanded");
    controller.setTheme("dark");
    controller.setToolbarSide("left", { height: 720, width: 430, x: 50, y: 0 });
    expect(controller.guest).toBe(originalGuest);
    expect(controller.state.guestMountId).toBe("mount-1");
    expect(controller.state.navigationGeneration).toBe(3);
    expect(controller.state.viewport.isExpanded).toBe(true);
    expect(controller.state.theme.scheme).toBe("dark");
    expect(controller.toolbarSide).toBe("left");
    expect(native.bounds).toEqual([
      bounds,
      { height: 720, width: 430, x: 50, y: 0 },
    ]);
    controller.dispose();
    expect(native.disposed).toBe(true);
  });

  test("moves protocol correlation to the loaded document generation", () => {
    const native = fakeGuest(0);
    const controller = new SimulatorController(
      native.guest,
      createCoreProtocolState({
        guestMountId: "mount-1",
        height: 720,
        navigationGeneration: 0,
        profile: "android",
        width: 480,
      }),
    );
    native.fireLifecycle({
      lifecycle: "loading",
      navigationGeneration: 1,
      url: "https://example.org/",
    });
    expect(controller.state.navigationGeneration).toBe(1);
    expect(controller.state.lifecycle).toBe("loading");
    native.fireLifecycle({
      lifecycle: "ready",
      navigationGeneration: 1,
      url: "https://example.org/",
    });
    expect(controller.state.navigationGeneration).toBe(1);
    expect(controller.state.lifecycle).toBe("ready");
    expect(controller.state.theme.parameters.bg_color).toBe("#f7f6f8");
  });

  test("routes Android back and visibility changes through the current guest generation", () => {
    const native = fakeGuest();
    const controller = new SimulatorController(
      native.guest,
      createCoreProtocolState({
        guestMountId: "mount-1",
        height: 720,
        navigationGeneration: 3,
        profile: "android",
        width: 480,
      }),
    );
    expect(controller.pressBackButton()).toBe(false);
    native.fireMessage({
      eventType: "web_app_setup_back_button",
      eventData: { is_visible: true },
    });
    expect(controller.pressBackButton()).toBe(true);
    expect(JSON.parse(native.sentToGuest[0] ?? "{}")).toEqual({
      eventType: "back_button_pressed",
      eventData: null,
    });
    expect(controller.setVisibility(false)).toBe(true);
    expect(controller.state.visible).toBe(false);
    expect(controller.setVisibility(false)).toBe(true);
    expect(native.sentToGuest.map((raw) => JSON.parse(raw).eventType)).toEqual([
      "back_button_pressed",
      "visibility_changed",
    ]);
    expect(controller.setVisibility(true)).toBe(true);
    expect(controller.state.visible).toBe(true);
    expect(controller.guest).toBe(native.guest);
    controller.dispose();
  });

  test("disposal is idempotent and disables later UI changes", () => {
    const native = fakeGuest();
    const controller = new SimulatorController(
      native.guest,
      createCoreProtocolState({
        guestMountId: "mount-1",
        height: 500,
        navigationGeneration: 3,
        profile: "ios",
        width: 360,
      }),
    );
    controller.dispose();
    controller.dispose();
    controller.setBounds({ height: 400, width: 300, x: 0, y: 0 });
    expect(native.disposed).toBe(true);
    expect(native.bounds).toEqual([]);
  });
});
