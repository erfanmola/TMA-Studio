import type { LaunchMode, Platform } from "../../contracts/entities";
import {
  applyButtonCommand,
  type ButtonCollection,
  buttonPressEvent,
  createButtons,
} from "./buttons";
import {
  applySafeArea,
  applyViewportUpdate,
  createViewportState,
  setLaunchMode,
  type ViewportState,
} from "./layout";
import {
  applyColorCommand,
  applyThemeParameters,
  createThemeState,
  type ThemeParameters,
  type ThemeState,
} from "./theme";
import {
  type NativeGuestProtocolChannel,
  NativeProtocolTransport,
  type ProtocolEvent,
} from "./transport";

export interface CoreProtocolState {
  navigationGeneration: number;
  profile: Platform;
  lifecycle: "loading" | "ready" | "closing" | "closed" | "crashed";
  visible: boolean;
  closeRequested: boolean;
  viewport: ViewportState;
  theme: ThemeState;
  buttons: ButtonCollection;
  guestMountId: string;
  processedEvents: number;
}

const STUDIO_THEME_PARAMETERS: Record<"light" | "dark", ThemeParameters> = {
  light: {
    bg_color: "#f7f6f8",
    secondary_bg_color: "#ffffff",
    text_color: "#242226",
    hint_color: "#625c67",
    link_color: "#0055b8",
    button_color: "#0055b8",
    button_text_color: "#ffffff",
  },
  dark: {
    bg_color: "#212121",
    secondary_bg_color: "#29292c",
    text_color: "#f5f5f7",
    hint_color: "#b9b9c0",
    link_color: "#9ac5ff",
    button_color: "#9ac5ff",
    button_text_color: "#14253d",
  },
};

export type CoreResult =
  | {
      status: "applied";
      replies: Array<{ eventType: string; eventData: unknown }>;
    }
  | { status: "invalid"; reason: string; replies: [] }
  | { status: "unsupported"; reason: string; replies: [] }
  | { status: "stale"; replies: [] };

type ProtocolReply = { eventType: string; eventData: unknown };

export function createCoreProtocolState(input: {
  navigationGeneration: number;
  profile: Platform;
  width: number;
  height: number;
  mode?: LaunchMode;
  theme?: "light" | "dark";
  themeParameters?: ThemeParameters;
  safeArea?: ViewportState["safeArea"];
  contentSafeArea?: ViewportState["contentSafeArea"];
  guestMountId: string;
}): CoreProtocolState {
  if (
    !Number.isSafeInteger(input.navigationGeneration) ||
    input.navigationGeneration < 0 ||
    !input.guestMountId
  ) {
    throw new TypeError("Invalid simulator context.");
  }
  return {
    navigationGeneration: input.navigationGeneration,
    profile: input.profile,
    lifecycle: "loading",
    visible: true,
    closeRequested: false,
    viewport: createViewportState(input),
    theme: input.themeParameters
      ? applyThemeParameters(
          createThemeState(input.theme),
          input.themeParameters,
        )
      : createThemeState(input.theme),
    buttons: createButtons(),
    guestMountId: input.guestMountId,
    processedEvents: 0,
  };
}

export function reduceCoreEvent(
  state: CoreProtocolState,
  event: ProtocolEvent,
): { state: CoreProtocolState; result: CoreResult } {
  if (event.navigationGeneration !== state.navigationGeneration)
    return { state, result: { status: "stale", replies: [] } };
  try {
    const eventData = event.eventData;
    validate04bPayload(event.eventType, eventData);
    let next = { ...state, processedEvents: state.processedEvents + 1 };
    const replies: ProtocolReply[] = [];
    switch (event.eventType) {
      case "web_app_ready":
        next = { ...next, lifecycle: "ready" };
        break;
      case "iframe_ready":
        next = { ...next, lifecycle: "ready" };
        break;
      case "web_app_expand":
        next = { ...next, viewport: setLaunchMode(next.viewport, "expanded") };
        replies.push({
          eventType: "viewport_changed",
          eventData: viewportEvent(next.viewport),
        });
        break;
      case "web_app_request_viewport":
        replies.push({
          eventType: "viewport_changed",
          eventData: viewportEvent(next.viewport),
        });
        break;
      case "web_app_request_safe_area":
        replies.push({
          eventType: "safe_area_changed",
          eventData: next.viewport.safeArea,
        });
        break;
      case "web_app_request_content_safe_area":
        replies.push({
          eventType: "content_safe_area_changed",
          eventData: next.viewport.contentSafeArea,
        });
        break;
      case "web_app_request_theme":
        replies.push({
          eventType: "theme_changed",
          eventData: { theme_params: next.theme.parameters },
        });
        break;
      case "web_app_request_fullscreen":
        replies.push({
          eventType: "fullscreen_failed",
          eventData: { error: "UNVERIFIED" },
        });
        break;
      case "web_app_exit_fullscreen":
        replies.push({
          eventType: "fullscreen_failed",
          eventData: { error: "UNVERIFIED" },
        });
        break;
      case "web_app_close":
        next = { ...next, closeRequested: true, lifecycle: "closing" };
        break;
      case "web_app_hide_keyboard":
      case "iframe_will_reload":
        break;
      case "web_app_set_header_color":
      case "web_app_set_background_color":
      case "web_app_set_bottom_bar_color":
        next = {
          ...next,
          theme: applyColorCommand(next.theme, event.eventType, eventData),
        };
        break;
      case "web_app_setup_back_button":
      case "web_app_setup_main_button":
      case "web_app_setup_secondary_button":
      case "web_app_setup_settings_button":
        next = {
          ...next,
          buttons: applyButtonCommand(next.buttons, event.eventType, eventData),
        };
        break;
      case "theme_changed":
        next = {
          ...next,
          theme: applyThemeParameters(
            next.theme,
            expectObject(eventData, "theme_params").theme_params,
          ),
        };
        break;
      case "viewport_changed":
        next = {
          ...next,
          viewport: applyViewportUpdate(
            next.viewport,
            eventData as Parameters<typeof applyViewportUpdate>[1],
          ),
        };
        break;
      case "safe_area_changed":
        next = { ...next, viewport: applySafeArea(next.viewport, eventData) };
        break;
      case "content_safe_area_changed":
        next = {
          ...next,
          viewport: applySafeArea(next.viewport, eventData, true),
        };
        break;
      case "fullscreen_changed":
        next = {
          ...next,
          viewport: setLaunchMode(
            next.viewport,
            readFullscreen(eventData) ? "fullscreen" : "expanded",
          ),
        };
        break;
      case "fullscreen_failed":
        replies.push({ eventType: "fullscreen_failed", eventData });
        break;
      case "visibility_changed":
        next = { ...next, visible: readVisibility(eventData) };
        break;
      case "back_button_pressed":
      case "main_button_pressed":
      case "secondary_button_pressed":
      case "settings_button_pressed":
        break;
      default:
        return {
          state,
          result: {
            status: "unsupported",
            reason: "Outside card 04b family.",
            replies: [],
          },
        };
    }
    return { state: next, result: { status: "applied", replies } };
  } catch (error) {
    return {
      state,
      result: {
        status: "invalid",
        reason:
          error instanceof Error ? error.message : "Invalid protocol event.",
        replies: [],
      },
    };
  }
}

export function withLaunchMode(
  state: CoreProtocolState,
  mode: LaunchMode,
): CoreProtocolState {
  return { ...state, viewport: setLaunchMode(state.viewport, mode) };
}

/** Core protocol runtime attached to one existing guest channel for its lifetime. */
export class CoreProtocolEngine {
  private unsubscribe: (() => void) | undefined;
  private readonly transport: NativeProtocolTransport;
  private listeners = new Set<(state: CoreProtocolState) => void>();

  constructor(
    private current: CoreProtocolState,
    guest: NativeGuestProtocolChannel,
  ) {
    if (guest.navigationGeneration !== current.navigationGeneration)
      throw new TypeError(
        "Guest channel generation does not match simulator state.",
      );
    this.transport = new NativeProtocolTransport(guest);
    this.unsubscribe = this.transport.subscribe((message) =>
      this.handle(message),
    );
  }

  get state(): CoreProtocolState {
    return this.current;
  }

  subscribe(listener: (state: CoreProtocolState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMode(mode: LaunchMode): void {
    this.current = withLaunchMode(this.current, mode);
    this.transport.postEvent(
      "viewport_changed",
      viewportEvent(this.current.viewport),
    );
    this.publish();
  }

  setTheme(theme: "light" | "dark"): void {
    const parameters = STUDIO_THEME_PARAMETERS[theme];
    this.current = {
      ...this.current,
      theme: applyThemeParameters(createThemeState(theme), parameters),
    };
    this.transport.postEvent("theme_changed", {
      theme_params: parameters,
    });
    this.publish();
  }

  setLifecycle(lifecycle: CoreProtocolState["lifecycle"]): void {
    this.current = { ...this.current, lifecycle };
    this.publish();
  }

  setVisibility(visible: boolean): boolean {
    if (this.current.visible === visible) return true;
    if (
      !this.transport.postEvent("visibility_changed", {
        is_visible: visible,
      })
    ) {
      return false;
    }
    this.current = { ...this.current, visible };
    this.publish();
    return true;
  }

  pressBackButton(): boolean {
    const event = buttonPressEvent(this.current.buttons, "back");
    return event
      ? this.transport.postEvent(event.eventType, event.eventData)
      : false;
  }

  setNavigationGeneration(navigationGeneration: number): void {
    if (!Number.isSafeInteger(navigationGeneration) || navigationGeneration < 0)
      throw new TypeError("Invalid simulator navigation generation.");
    if (navigationGeneration === this.current.navigationGeneration) return;
    this.current = { ...this.current, navigationGeneration };
    this.publish();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.listeners.clear();
  }

  private handle(message: ProtocolEvent): void {
    const reduced = reduceCoreEvent(this.current, message);
    if (reduced.result.status !== "applied") return;
    this.current = reduced.state;
    for (const reply of reduced.result.replies)
      this.transport.postEvent(reply.eventType, reply.eventData);
    this.publish();
  }

  private publish(): void {
    for (const listener of [...this.listeners]) listener(this.current);
  }
}

function viewportEvent(viewport: ViewportState) {
  return {
    width: viewport.width,
    height: viewport.height,
    is_expanded: viewport.isExpanded,
    is_state_stable: viewport.isStable,
  };
}
function readFullscreen(value: unknown): boolean {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { is_fullscreen?: unknown }).is_fullscreen !== "boolean"
  )
    throw new TypeError("Invalid fullscreen response.");
  return (value as { is_fullscreen: boolean }).is_fullscreen;
}
function readVisibility(value: unknown): boolean {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { is_visible?: unknown }).is_visible !== "boolean"
  )
    throw new TypeError("Invalid visibility response.");
  return (value as { is_visible: boolean }).is_visible;
}

function expectObject(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid protocol payload.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !(key in record))
    throw new TypeError("Invalid protocol payload fields.");
  return record;
}

function validate04bPayload(eventType: string, value: unknown): void {
  const payloadKeys: Record<string, readonly string[]> = {
    iframe_ready: ["reload_supported"],
    web_app_close: ["return_back"],
    web_app_request_fullscreen: [],
    web_app_exit_fullscreen: [],
    web_app_expand: [],
    web_app_hide_keyboard: [],
    web_app_ready: [],
    web_app_request_content_safe_area: [],
    web_app_request_safe_area: [],
    web_app_request_theme: [],
    web_app_request_viewport: [],
    iframe_will_reload: [],
    back_button_pressed: [],
    main_button_pressed: [],
    secondary_button_pressed: [],
    settings_button_pressed: [],
  };
  if (eventType in payloadKeys) {
    if (payloadKeys[eventType]?.length === 0) {
      if (value !== "")
        throw new TypeError("This event does not accept payload data.");
      return;
    }
    const object = exactObject(value, payloadKeys[eventType] ?? []);
    if (
      eventType === "iframe_ready" &&
      typeof object.reload_supported !== "boolean"
    )
      throw new TypeError("Invalid iframe readiness payload.");
    if (
      eventType === "web_app_close" &&
      "return_back" in object &&
      typeof object.return_back !== "boolean"
    )
      throw new TypeError("Invalid close payload.");
    return;
  }
  if (eventType === "viewport_changed") {
    const object = exactObject(value, [
      "width",
      "height",
      "is_expanded",
      "is_state_stable",
    ]);
    if (
      typeof object.width !== "number" ||
      typeof object.height !== "number" ||
      typeof object.is_expanded !== "boolean" ||
      typeof object.is_state_stable !== "boolean"
    )
      throw new TypeError("Invalid viewport payload.");
    return;
  }
  if (
    eventType === "safe_area_changed" ||
    eventType === "content_safe_area_changed"
  ) {
    exactObject(value, ["top", "right", "bottom", "left"]);
    return;
  }
  if (eventType === "fullscreen_changed") {
    const object = exactObject(value, ["is_fullscreen"]);
    if (typeof object.is_fullscreen !== "boolean")
      throw new TypeError("Invalid fullscreen payload.");
    return;
  }
  if (eventType === "fullscreen_failed") {
    const object = exactObject(value, ["error"]);
    if (typeof object.error !== "string")
      throw new TypeError("Invalid fullscreen error payload.");
    return;
  }
  if (eventType === "visibility_changed") {
    const object = exactObject(value, ["is_visible"]);
    if (typeof object.is_visible !== "boolean")
      throw new TypeError("Invalid visibility payload.");
  }
}

function exactObject(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected an event object payload.");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !allowed.includes(key)))
    throw new TypeError("Unexpected event payload field.");
  return object;
}
