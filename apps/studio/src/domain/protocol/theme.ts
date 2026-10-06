const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const THEME_KEYS = [
  "bg_color",
  "secondary_bg_color",
  "text_color",
  "hint_color",
  "link_color",
  "button_color",
  "button_text_color",
  "header_bg_color",
  "accent_text_color",
  "section_bg_color",
  "section_header_text_color",
  "subtitle_text_color",
  "destructive_text_color",
  "section_separator_color",
  "bottom_bar_bg_color",
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];
export type ThemeParameters = Partial<Record<ThemeKey, string>>;
export interface ThemeState {
  scheme: "light" | "dark";
  parameters: ThemeParameters;
  colors: { background?: string; header?: string; bottomBar?: string };
}

export function createThemeState(
  scheme: "light" | "dark" = "light",
): ThemeState {
  return { scheme, parameters: {}, colors: {} };
}

export function applyThemeParameters(
  state: ThemeState,
  value: unknown,
): ThemeState {
  const record = exactRecord(value, THEME_KEYS);
  const parameters: ThemeParameters = { ...state.parameters };
  for (const [key, color] of Object.entries(record)) {
    if (typeof color !== "string" || !HEX_COLOR.test(color)) {
      throw new TypeError(`Invalid Telegram theme color: ${key}.`);
    }
    parameters[key as ThemeKey] = color.toLowerCase();
  }
  const background = parameters.bg_color;
  return {
    ...state,
    scheme: background ? (isDark(background) ? "dark" : "light") : state.scheme,
    parameters,
  };
}

export function applyColorCommand(
  state: ThemeState,
  eventType: string,
  value: unknown,
): ThemeState {
  if (eventType === "web_app_request_theme") return state;
  const data = exactRecord(value, ["color", "color_key"] as const);
  if ("color" in data === "color_key" in data)
    throw new TypeError("Color command needs exactly one color value.");
  const color = data.color ?? data.color_key;
  if (typeof color !== "string")
    throw new TypeError("Color command needs color.");
  const allowedColorKeys =
    eventType === "web_app_set_bottom_bar_color"
      ? ["bg_color", "secondary_bg_color", "bottom_bar_bg_color"]
      : ["bg_color", "secondary_bg_color"];
  if ("color_key" in data && !allowedColorKeys.includes(color))
    throw new TypeError("Unsupported Telegram theme color key.");
  if (
    color !== "bg_color" &&
    color !== "secondary_bg_color" &&
    color !== "bottom_bar_bg_color" &&
    !HEX_COLOR.test(color)
  ) {
    throw new TypeError("Unsupported Telegram color token.");
  }
  const resolved = color.startsWith("#")
    ? color.toLowerCase()
    : state.parameters[color as ThemeKey];
  if (color.startsWith("#") && !HEX_COLOR.test(color))
    throw new TypeError("Invalid Telegram color.");
  if (eventType === "web_app_set_header_color")
    return { ...state, colors: { ...state.colors, header: resolved } };
  if (eventType === "web_app_set_background_color")
    return { ...state, colors: { ...state.colors, background: resolved } };
  if (eventType === "web_app_set_bottom_bar_color")
    return { ...state, colors: { ...state.colors, bottomBar: resolved } };
  return state;
}

export function toTelegramCssVariables(
  state: ThemeState,
): Record<string, string> {
  const vars: Record<string, string> = { "--tg-color-scheme": state.scheme };
  for (const [key, value] of Object.entries(state.parameters)) {
    if (value) vars[`--tg-theme-${key.replaceAll("_", "-")}`] = value;
  }
  return vars;
}

function exactRecord(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected an object payload.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key)))
    throw new TypeError("Unexpected payload field.");
  return record;
}

function isDark(hex: string): boolean {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
