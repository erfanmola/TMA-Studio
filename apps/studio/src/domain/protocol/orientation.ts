export interface OrientationEffect {
  setLocked(locked: boolean): "applied" | "denied" | "unsupported";
}
export interface OrientationResult {
  status: "applied" | "denied" | "unsupported" | "invalid" | "stale";
  locked: boolean;
}

/** Orientation requests are explicit state changes; this adapter never polls sensors. */
export class OrientationProtocolService {
  private locked = false;
  constructor(
    private readonly generation: number,
    private readonly clientVersion: string | undefined,
    private readonly mode: "mock" | "real" = "mock",
    private readonly effect: OrientationEffect = {
      setLocked: () => "unsupported",
    },
  ) {}

  get isLocked(): boolean {
    return this.locked;
  }

  handle(value: unknown, generation = this.generation): OrientationResult {
    if (generation !== this.generation)
      return { status: "stale", locked: this.locked };
    if (!versionAtLeast(this.clientVersion, "8.0"))
      return { status: "unsupported", locked: this.locked };
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { status: "invalid", locked: this.locked };
    const data = value as Record<string, unknown>;
    if (Object.keys(data).length !== 1 || typeof data.locked !== "boolean")
      return { status: "invalid", locked: this.locked };
    const status =
      this.mode === "mock" ? "applied" : this.effect.setLocked(data.locked);
    if (status === "applied") this.locked = data.locked;
    return { status, locked: this.locked };
  }
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
