import { describe, expect, test } from "bun:test";
import { buttonPressEvent } from "../../apps/studio/src/domain/protocol/buttons";
import {
  CoreProtocolEngine,
  createCoreProtocolState,
  reduceCoreEvent,
  withLaunchMode,
} from "../../apps/studio/src/domain/protocol/lifecycle";
import catalog from "../../apps/studio/src/domain/protocol/registry.generated.json";
import { toTelegramCssVariables } from "../../apps/studio/src/domain/protocol/theme";
import type { ProtocolEvent } from "../../apps/studio/src/domain/protocol/transport";
import { encodeNativePostEvent } from "../../apps/studio/src/domain/protocol/transport";

const owned = catalog.events
  .filter((entry) => entry.ownerCard === "04b")
  .map((entry) => entry.event);
const base = () =>
  createCoreProtocolState({
    navigationGeneration: 7,
    profile: "android",
    width: 390,
    height: 844,
    mode: "overlay",
    safeArea: { top: 44, right: 0, bottom: 34, left: 0 },
    contentSafeArea: { top: 50, right: 0, bottom: 58, left: 0 },
    guestMountId: "guest-7",
  });
const event = (
  eventType: string,
  eventData: unknown = "",
  navigationGeneration = 7,
): ProtocolEvent => ({ eventType, eventData, navigationGeneration });

describe("Telegram core protocol families (04b)", () => {
  test("exercises every assigned registry row through the core fixture", () => {
    const payloads: Record<string, unknown> = {
      iframe_ready: { reload_supported: true },
      web_app_close: {},
      web_app_request_fullscreen: "",
      web_app_exit_fullscreen: "",
      web_app_request_theme: "",
      web_app_request_viewport: "",
      web_app_request_safe_area: "",
      web_app_request_content_safe_area: "",
      web_app_set_header_color: { color: "#abcdef" },
      web_app_set_background_color: { color: "#123456" },
      web_app_set_bottom_bar_color: { color: "#654321" },
      web_app_setup_back_button: { is_visible: true },
      web_app_setup_main_button: {
        is_visible: true,
        text: "Continue",
        color: "#2481cc",
        text_color: "#ffffff",
        is_active: true,
        is_progress_visible: false,
        has_shine_effect: false,
      },
      web_app_setup_secondary_button: {
        is_visible: true,
        text: "Cancel",
        position: "right",
      },
      web_app_setup_settings_button: { is_visible: true },
      theme_changed: {
        theme_params: { bg_color: "#ffffff", text_color: "#222222" },
      },
      viewport_changed: {
        width: 390,
        height: 800,
        is_expanded: true,
        is_state_stable: false,
      },
      safe_area_changed: { top: 48, right: 0, bottom: 34, left: 0 },
      content_safe_area_changed: { top: 50, right: 0, bottom: 58, left: 0 },
      fullscreen_changed: { is_fullscreen: true },
      fullscreen_failed: { error: "UNSUPPORTED" },
      visibility_changed: { is_visible: false },
    };
    for (const eventType of owned) {
      const state = base();
      const result = reduceCoreEvent(
        state,
        event(eventType, payloads[eventType] ?? ""),
      );
      expect(result.result.status).toBe("applied");
      expect(reduceCoreEvent(state, event(eventType, [])).result.status).toBe(
        "invalid",
      );
    }
  });

  test("ready, close, visibility, and mode transitions retain one guest mount", () => {
    const start = base();
    const ready = reduceCoreEvent(start, event("web_app_ready"));
    expect(ready.state.lifecycle).toBe("ready");
    const closed = reduceCoreEvent(ready.state, event("web_app_close", {}));
    expect(closed.state.closeRequested).toBe(true);
    expect(closed.state.lifecycle).toBe("closing");
    const hidden = reduceCoreEvent(
      closed.state,
      event("visibility_changed", { is_visible: false }),
    );
    expect(hidden.state.visible).toBe(false);
    const expanded = withLaunchMode(hidden.state, "expanded");
    const fullscreen = withLaunchMode(expanded, "fullscreen");
    const overlay = withLaunchMode(fullscreen, "overlay");
    expect(overlay.guestMountId).toBe("guest-7");
    expect(overlay.navigationGeneration).toBe(7);
    expect(overlay.viewport.mode).toBe("overlay");
  });

  test("core engine drives one existing guest through readiness, replies, and mode changes", () => {
    const guest = {
      navigationGeneration: 7,
      listener: undefined as
        | ((message: {
            data: string;
            navigationGeneration: number;
            simulatorId: string;
          }) => void)
        | undefined,
      sent: [] as string[],
      onInbound(
        callback: (message: {
          data: string;
          navigationGeneration: number;
          simulatorId: string;
        }) => void,
      ) {
        this.listener = callback;
        return () => {
          this.listener = undefined;
        };
      },
      postToGuest(generation: number, data: string) {
        if (generation !== this.navigationGeneration) return false;
        this.sent.push(data);
        return true;
      },
    };
    const engine = new CoreProtocolEngine(base(), guest);
    guest.listener?.({
      data: encodeNativePostEvent("web_app_ready", ""),
      navigationGeneration: 7,
      simulatorId: "sim-1",
    });
    expect(engine.state.lifecycle).toBe("ready");
    guest.listener?.({
      data: encodeNativePostEvent("web_app_request_theme", ""),
      navigationGeneration: 7,
      simulatorId: "sim-1",
    });
    expect(JSON.parse(guest.sent[0] ?? "{}")).toEqual({
      eventType: "theme_changed",
      eventData: { theme_params: engine.state.theme.parameters },
    });
    const mountId = engine.state.guestMountId;
    for (const mode of ["expanded", "fullscreen", "overlay"] as const)
      engine.setMode(mode);
    expect(engine.state.guestMountId).toBe(mountId);
    expect(guest.navigationGeneration).toBe(7);
    expect(guest.sent).toHaveLength(4);
    expect(JSON.parse(guest.sent.at(-1) ?? "{}")).toEqual({
      eventType: "viewport_changed",
      eventData: {
        width: engine.state.viewport.width,
        height: engine.state.viewport.height,
        is_expanded: false,
        is_state_stable: true,
      },
    });
    engine.dispose();
    expect(guest.listener).toBeUndefined();
  });

  test("viewport stability keeps last stable height and validates safe areas", () => {
    let state = base();
    state = reduceCoreEvent(
      state,
      event("viewport_changed", {
        width: 390,
        height: 500,
        is_expanded: true,
        is_state_stable: true,
      }),
    ).state;
    state = reduceCoreEvent(
      state,
      event("viewport_changed", {
        width: 390,
        height: 420,
        is_expanded: true,
        is_state_stable: false,
      }),
    ).state;
    expect(state.viewport.height).toBe(420);
    expect(state.viewport.stableHeight).toBe(500);
    const invalid = reduceCoreEvent(
      state,
      event("safe_area_changed", {
        top: 300,
        right: 0,
        bottom: 300,
        left: 0,
      }),
    );
    expect(invalid.result.status).toBe("invalid");
  });

  test("theme parameters map to official SDK CSS variables", () => {
    const result = reduceCoreEvent(
      base(),
      event("theme_changed", {
        theme_params: {
          bg_color: "#ffffff",
          text_color: "#202020",
          button_color: "#2481cc",
        },
      }),
    );
    expect(result.state.theme.scheme).toBe("light");
    expect(toTelegramCssVariables(result.state.theme)).toEqual({
      "--tg-color-scheme": "light",
      "--tg-theme-bg-color": "#ffffff",
      "--tg-theme-text-color": "#202020",
      "--tg-theme-button-color": "#2481cc",
    });
    expect(
      reduceCoreEvent(
        base(),
        event("theme_changed", { theme_params: { bg_color: "red" } }),
      ).result.status,
    ).toBe("invalid");
  });

  test("replies preserve SDK bootstrap order and theme envelope", () => {
    const state = base();
    const replies = [
      "web_app_request_theme",
      "web_app_request_viewport",
      "web_app_request_safe_area",
      "web_app_request_content_safe_area",
    ].flatMap((eventType) => {
      const result = reduceCoreEvent(state, event(eventType));
      return result.result.status === "applied" ? result.result.replies : [];
    });
    expect(replies.map((reply) => reply.eventType)).toEqual([
      "theme_changed",
      "viewport_changed",
      "safe_area_changed",
      "content_safe_area_changed",
    ]);
    expect(replies[0]?.eventData).toEqual({
      theme_params: state.theme.parameters,
    });
  });

  test("theme color keys resolve and fullscreen stays explicit while unverified", () => {
    const themed = reduceCoreEvent(
      base(),
      event("theme_changed", {
        theme_params: { bg_color: "#ffffff", secondary_bg_color: "#eeeeee" },
      }),
    ).state;
    const header = reduceCoreEvent(
      themed,
      event("web_app_set_header_color", { color_key: "secondary_bg_color" }),
    );
    expect(header.state.theme.colors.header).toBe("#eeeeee");
    const fullscreen = reduceCoreEvent(
      base(),
      event("web_app_request_fullscreen"),
    );
    expect(fullscreen.state.viewport.fullscreen).toBe(false);
    expect(fullscreen.result).toMatchObject({
      status: "applied",
      replies: [
        { eventType: "fullscreen_failed", eventData: { error: "UNVERIFIED" } },
      ],
    });
  });

  test("controls emit only visible, enabled non-progress button events", () => {
    const baseState = base();
    const shown = reduceCoreEvent(
      baseState,
      event("web_app_setup_main_button", {
        is_visible: true,
        text: "Open",
        is_active: true,
        is_progress_visible: false,
      }),
    ).state;
    expect(buttonPressEvent(shown.buttons, "main")).toEqual({
      eventType: "main_button_pressed",
      eventData: null,
    });
    const loading = reduceCoreEvent(
      shown,
      event("web_app_setup_main_button", { is_progress_visible: true }),
    ).state;
    expect(buttonPressEvent(loading.buttons, "main")).toBeNull();
    expect(buttonPressEvent(shown.buttons, "back")).toBeNull();
  });

  test("rejects stale messages and keeps profile capability unverified", () => {
    const state = base();
    const stale = reduceCoreEvent(state, event("web_app_ready", null, 6));
    expect(stale.result.status).toBe("stale");
    expect(stale.state).toBe(state);
    expect(owned.length).toBeGreaterThan(0);
    for (const row of catalog.events.filter(
      (entry) => entry.ownerCard === "04b",
    )) {
      expect(row.implemented).toBe(false);
      expect(row.status).toBe("unverified");
    }
  });
});
