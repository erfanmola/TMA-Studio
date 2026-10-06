export type HapticCommand =
  | {
      type: "impact";
      impact_style: "light" | "medium" | "heavy" | "rigid" | "soft";
    }
  | { type: "notification"; notification_type: "error" | "success" | "warning" }
  | { type: "selection_change" };
export interface HapticEffect {
  trigger(command: HapticCommand): "played" | "denied" | "unsupported";
}
export interface HapticResult {
  status:
    | "simulated"
    | "played"
    | "denied"
    | "unsupported"
    | "invalid"
    | "stale";
}

export class HapticProtocolService {
  constructor(
    private readonly generation: number,
    private readonly clientVersion: string | undefined,
    private readonly mode: "mock" | "real" = "mock",
    private readonly effect: HapticEffect = { trigger: () => "unsupported" },
  ) {}

  handle(value: unknown, generation = this.generation): HapticResult {
    if (generation !== this.generation) return { status: "stale" };
    if (!versionAtLeast(this.clientVersion, "6.1"))
      return { status: "unsupported" };
    const command = parseHaptic(value);
    if (!command) return { status: "invalid" };
    if (this.mode === "mock") return { status: "simulated" };
    return { status: this.effect.trigger(command) };
  }
}

export function parseHaptic(value: unknown): HapticCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.type === "impact") {
    if (
      Object.keys(data).some((key) => !["type", "impact_style"].includes(key))
    )
      return null;
    return ["light", "medium", "heavy", "rigid", "soft"].includes(
      String(data.impact_style),
    )
      ? {
          type: "impact",
          impact_style: data.impact_style as
            | "light"
            | "medium"
            | "heavy"
            | "rigid"
            | "soft",
        }
      : null;
  }
  if (data.type === "notification") {
    if (
      Object.keys(data).some(
        (key) => !["type", "notification_type"].includes(key),
      )
    )
      return null;
    return ["error", "success", "warning"].includes(
      String(data.notification_type),
    )
      ? {
          type: "notification",
          notification_type: data.notification_type as
            | "error"
            | "success"
            | "warning",
        }
      : null;
  }
  if (data.type === "selection_change" && Object.keys(data).length === 1)
    return { type: "selection_change" };
  return null;
}

function versionAtLeast(current: string | undefined, minimum: string): boolean {
  if (!current || !/^\d+(?:\.\d+)*$/u.test(current)) return false;
  const left = current.split(".").map(Number);
  const right = minimum.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}
