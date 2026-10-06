import type { LaunchMode, Platform } from "./entities";
import type { GuestRect, ToolbarSide } from "./simulator";

export type SimulatorCommand =
  | { method: "set-bounds"; bounds: GuestRect }
  | { method: "set-mode"; mode: LaunchMode }
  | { method: "set-side"; side: ToolbarSide }
  | { method: "set-theme"; theme: "light" | "dark" }
  | {
      method: "set-location";
      latitude: number;
      longitude: number;
      accuracy: number;
    }
  | { method: "clear-location" }
  | { method: "reload" }
  | { method: "close" }
  | { method: "android-back" }
  | { method: "android-home" }
  | { method: "android-tasks" }
  | { method: "android-resume" };

export type AndroidChromeCommand = Extract<
  SimulatorCommand,
  { method: `android-${string}` }
>;

export type SimulatorRequest = { requestId: string; command: SimulatorCommand };

export type SimulatorViewState = {
  mode: LaunchMode;
  platform: Platform;
  side: ToolbarSide;
  theme: "light" | "dark";
  lifecycle: "loading" | "ready" | "closing" | "closed" | "crashed";
};

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exact(value: RecordValue, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => key in value)
  );
}
function integer(value: unknown, min: number, max: number): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
  );
}
function safeBounds(value: unknown): value is GuestRect {
  return (
    record(value) &&
    exact(value, ["x", "y", "width", "height"]) &&
    integer(value.x, 0, 8192) &&
    integer(value.y, 0, 8192) &&
    integer(value.width, 1, 8192) &&
    integer(value.height, 1, 8192) &&
    value.x + value.width <= 8192 &&
    value.y + value.height <= 8192
  );
}

export function parseSimulatorRequest(value: unknown): SimulatorRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 4096) return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (
    !record(candidate) ||
    !exact(candidate, ["requestId", "command"]) ||
    typeof candidate.requestId !== "string" ||
    !/^[\w-]{1,64}$/u.test(candidate.requestId) ||
    !record(candidate.command) ||
    typeof candidate.command.method !== "string"
  )
    return null;
  const command = candidate.command;
  switch (command.method) {
    case "close":
    case "reload":
    case "clear-location":
      return exact(command, ["method"])
        ? {
            requestId: candidate.requestId,
            command: { method: command.method },
          }
        : null;
    case "android-back":
    case "android-home":
    case "android-tasks":
    case "android-resume":
      return exact(command, ["method"])
        ? {
            requestId: candidate.requestId,
            command: { method: command.method },
          }
        : null;
    case "set-mode":
      return exact(command, ["method", "mode"]) &&
        ["overlay", "expanded", "fullscreen"].includes(String(command.mode))
        ? {
            requestId: candidate.requestId,
            command: { method: "set-mode", mode: command.mode as LaunchMode },
          }
        : null;
    case "set-theme":
      return exact(command, ["method", "theme"]) &&
        (command.theme === "light" || command.theme === "dark")
        ? {
            requestId: candidate.requestId,
            command: { method: "set-theme", theme: command.theme },
          }
        : null;
    case "set-bounds":
      return exact(command, ["method", "bounds"]) && safeBounds(command.bounds)
        ? {
            requestId: candidate.requestId,
            command: { method: "set-bounds", bounds: command.bounds },
          }
        : null;
    case "set-side":
      return exact(command, ["method", "side"]) &&
        ["top", "bottom", "left", "right"].includes(String(command.side))
        ? {
            requestId: candidate.requestId,
            command: { method: "set-side", side: command.side as ToolbarSide },
          }
        : null;
    case "set-location":
      return exact(command, ["method", "latitude", "longitude", "accuracy"]) &&
        typeof command.latitude === "number" &&
        Number.isFinite(command.latitude) &&
        command.latitude >= -90 &&
        command.latitude <= 90 &&
        typeof command.longitude === "number" &&
        Number.isFinite(command.longitude) &&
        command.longitude >= -180 &&
        command.longitude <= 180 &&
        typeof command.accuracy === "number" &&
        Number.isFinite(command.accuracy) &&
        command.accuracy >= 0 &&
        command.accuracy <= 100_000
        ? {
            requestId: candidate.requestId,
            command: {
              method: "set-location",
              latitude: command.latitude,
              longitude: command.longitude,
              accuracy: command.accuracy,
            },
          }
        : null;
    default:
      return null;
  }
}
