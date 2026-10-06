export interface ButtonState {
  visible: boolean;
  text: string;
  color?: string;
  textColor?: string;
  active: boolean;
  progress: boolean;
  shine: boolean;
  position?: "left" | "right" | "top" | "bottom";
}
export interface ButtonCollection {
  main: ButtonState;
  secondary: ButtonState;
  back: ButtonState;
  settings: ButtonState;
}

const defaultButton = (text: string): ButtonState => ({
  visible: false,
  text,
  active: true,
  progress: false,
  shine: false,
});

export function createButtons(): ButtonCollection {
  return {
    main: defaultButton("Continue"),
    secondary: defaultButton("Cancel"),
    back: defaultButton(""),
    settings: defaultButton(""),
  };
}

export function applyButtonCommand(
  state: ButtonCollection,
  eventType: string,
  value: unknown,
): ButtonCollection {
  const source = exactObject(value);
  const key =
    eventType === "web_app_setup_main_button"
      ? "main"
      : eventType === "web_app_setup_secondary_button"
        ? "secondary"
        : eventType === "web_app_setup_back_button"
          ? "back"
          : eventType === "web_app_setup_settings_button"
            ? "settings"
            : null;
  if (!key) throw new TypeError("Not a button setup event.");
  const allowed =
    key === "back" || key === "settings"
      ? ["is_visible"]
      : [
          "is_visible",
          "text",
          "color",
          "text_color",
          "is_active",
          "is_progress_visible",
          "has_shine_effect",
          "position",
          "icon_custom_emoji_id",
        ];
  if (Object.keys(source).some((field) => !allowed.includes(field)))
    throw new TypeError("Unknown button parameter.");
  const current = state[key];
  const next: ButtonState = { ...current };
  if ("is_visible" in source)
    next.visible = boolean(source.is_visible, "is_visible");
  if ("text" in source) next.text = text(source.text, "text");
  if ("color" in source) next.color = color(source.color, "color");
  if ("text_color" in source)
    next.textColor = color(source.text_color, "text_color");
  if ("is_active" in source)
    next.active = boolean(source.is_active, "is_active");
  if ("is_progress_visible" in source)
    next.progress = boolean(source.is_progress_visible, "is_progress_visible");
  if ("has_shine_effect" in source)
    next.shine = boolean(source.has_shine_effect, "has_shine_effect");
  if ("position" in source) {
    const position = source.position;
    if (!["left", "right", "top", "bottom"].includes(String(position)))
      throw new TypeError("Invalid button position.");
    next.position = position as ButtonState["position"];
  }
  return { ...state, [key]: next };
}

export function buttonPressEvent(
  state: ButtonCollection,
  key: keyof ButtonCollection,
): { eventType: string; eventData: null } | null {
  const button = state[key];
  if (!button.visible || !button.active || button.progress) return null;
  const eventType = {
    main: "main_button_pressed",
    secondary: "secondary_button_pressed",
    back: "back_button_pressed",
    settings: "settings_button_pressed",
  }[key];
  return { eventType, eventData: null };
}

function exactObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected button parameters.");
  return value as Record<string, unknown>;
}
function boolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`Invalid ${key}.`);
  return value;
}
function text(value: unknown, key: string): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new TypeError(`Invalid ${key}.`);
  return value;
}
function color(value: unknown, key: string): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value))
    throw new TypeError(`Invalid ${key}.`);
  return value.toLowerCase();
}
