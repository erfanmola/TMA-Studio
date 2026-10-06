import { findProtocolEvent } from "./registry";
import type { ProtocolEvent } from "./transport";

export type SensorKind = "accelerometer" | "gyroscope" | "device_orientation";
export type SensorSample =
  | { x: number; y: number; z: number }
  | { alpha: number; beta: number; gamma: number; absolute: boolean };
export interface SensorFeed {
  start(
    kind: SensorKind,
    refreshRate: number,
    needAbsolute: boolean,
  ): "available" | "denied" | "unsupported";
  stop(kind: SensorKind): void;
  sample(kind: SensorKind): SensorSample | null;
}
export interface SensorState {
  started: boolean;
  refreshRate: number;
  needAbsolute: boolean;
}
export type SensorResult = {
  status: "applied" | "denied" | "unsupported" | "stale" | "invalid";
  replies: Array<{ eventType: string; eventData: unknown }>;
};

/** Pull driven bounded fixture source; callers explicitly request one sample. */
export class BoundedMockSensorFeed implements SensorFeed {
  private readonly samples: Record<SensorKind, SensorSample[]> = {
    accelerometer: [
      { x: 0.25, y: -0.5, z: 9.75 },
      { x: 0.3, y: -0.4, z: 9.8 },
    ],
    gyroscope: [
      { x: 0.01, y: -0.02, z: 0.03 },
      { x: 0.02, y: -0.01, z: 0.025 },
    ],
    device_orientation: [
      { alpha: 180, beta: 4, gamma: -2, absolute: false },
      { alpha: 182, beta: 3, gamma: -1, absolute: false },
    ],
  };
  private cursors: Record<SensorKind, number> = {
    accelerometer: 0,
    gyroscope: 0,
    device_orientation: 0,
  };

  start(): "available" {
    return "available";
  }
  stop(): void {}

  sample(kind: SensorKind): SensorSample {
    const values = this.samples[kind];
    const cursor = this.cursors[kind] ?? 0;
    this.cursors[kind] = cursor + 1;
    return (
      values[cursor % values.length] ??
      (kind === "device_orientation"
        ? { alpha: 0, beta: 0, gamma: 0, absolute: false }
        : { x: 0, y: 0, z: 0 })
    );
  }
}

/** No browser sensor subscriptions or timers; data is pulled by the harness. */
export class SensorProtocolService {
  private states: Record<SensorKind, SensorState> = {
    accelerometer: { started: false, refreshRate: 1000, needAbsolute: false },
    gyroscope: { started: false, refreshRate: 1000, needAbsolute: false },
    device_orientation: {
      started: false,
      refreshRate: 1000,
      needAbsolute: false,
    },
  };

  constructor(
    private readonly navigationGeneration: number,
    private readonly clientVersion: string | undefined,
    private readonly feed: SensorFeed = unsupportedFeed,
  ) {}

  getState(kind: SensorKind): Readonly<SensorState> {
    return this.states[kind];
  }

  handle(event: ProtocolEvent): SensorResult {
    if (event.navigationGeneration !== this.navigationGeneration)
      return { status: "stale", replies: [] };
    const descriptor = findProtocolEvent(event.eventType);
    if (descriptor?.ownerCard !== "04e" || descriptor.direction !== "outgoing")
      return { status: "unsupported", replies: [] };
    if (!versionAtLeast(this.clientVersion, descriptor.minimumVersion))
      return {
        status: "unsupported",
        replies: failedReply(event.eventType, "UNSUPPORTED_VERSION"),
      };
    const spec = sensorEvent(event.eventType);
    if (!spec) return { status: "unsupported", replies: [] };
    if (spec.operation === "stop") {
      if (!isEmptyPayload(event.eventData))
        return { status: "invalid", replies: [] };
      this.feed.stop(spec.kind);
      this.states[spec.kind] = { ...this.states[spec.kind], started: false };
      return {
        status: "applied",
        replies: [{ eventType: `${spec.kind}_stopped`, eventData: "" }],
      };
    }
    const params = parseSensorStart(spec.kind, event.eventData);
    if (!params) return { status: "invalid", replies: [] };
    const result = this.feed.start(
      spec.kind,
      params.refreshRate,
      params.needAbsolute,
    );
    if (result === "available") {
      this.states[spec.kind] = { started: true, ...params };
      return {
        status: "applied",
        replies: [{ eventType: `${spec.kind}_started`, eventData: "" }],
      };
    }
    this.states[spec.kind] = { ...this.states[spec.kind], started: false };
    return {
      status: result === "denied" ? "denied" : "unsupported",
      replies: [
        {
          eventType: `${spec.kind}_failed`,
          eventData: {
            error: result === "denied" ? "PERMISSION_DENIED" : "UNSUPPORTED",
          },
        },
      ],
    };
  }

  sampleOnce(
    kind: SensorKind,
    generation = this.navigationGeneration,
  ): SensorResult {
    if (generation !== this.navigationGeneration)
      return { status: "stale", replies: [] };
    if (!this.states[kind].started) return { status: "denied", replies: [] };
    const rawSample = this.feed.sample(kind);
    const sample = rawSample ? sanitizeSample(kind, rawSample) : null;
    if (!sample) return { status: "invalid", replies: [] };
    return {
      status: "applied",
      replies: [{ eventType: `${kind}_changed`, eventData: sample }],
    };
  }

  dispose(): Array<{ eventType: string; eventData: unknown }> {
    const stopped: Array<{ eventType: string; eventData: unknown }> = [];
    for (const kind of Object.keys(this.states) as SensorKind[]) {
      if (!this.states[kind].started) continue;
      this.feed.stop(kind);
      this.states[kind] = { ...this.states[kind], started: false };
      stopped.push({ eventType: `${kind}_stopped`, eventData: "" });
    }
    return stopped;
  }
}

function sensorEvent(
  eventType: string,
): { kind: SensorKind; operation: "start" | "stop" } | null {
  const match =
    /^web_app_(start|stop)_(accelerometer|gyroscope|device_orientation)$/u.exec(
      eventType,
    );
  if (!match) return null;
  const sensor =
    match[2] === "device_orientation" ? "device_orientation" : match[2];
  return {
    kind: sensor as SensorKind,
    operation: match[1] === "start" ? "start" : "stop",
  };
}
function parseSensorStart(
  kind: SensorKind,
  value: unknown,
): { refreshRate: number; needAbsolute: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const allowed =
    kind === "device_orientation"
      ? ["refresh_rate", "need_absolute"]
      : ["refresh_rate"];
  if (Object.keys(data).some((key) => !allowed.includes(key))) return null;
  const refreshRate = data.refresh_rate;
  const rate = refreshRate === undefined ? 1000 : refreshRate;
  if (
    typeof rate !== "number" ||
    !Number.isInteger(rate) ||
    rate < 20 ||
    rate > 1000
  )
    return null;
  if (
    kind === "device_orientation" &&
    data.need_absolute !== undefined &&
    typeof data.need_absolute !== "boolean"
  )
    return null;
  return { refreshRate: rate, needAbsolute: data.need_absolute === true };
}
function sanitizeSample(
  kind: SensorKind,
  sample: SensorSample,
): SensorSample | null {
  const data = sample as unknown as Record<string, unknown>;
  if (kind === "device_orientation") {
    const valid =
      typeof data.absolute === "boolean" &&
      finite(data.alpha, 0, 360) &&
      finite(data.beta, -180, 180) &&
      finite(data.gamma, -180, 180);
    return valid
      ? {
          alpha: data.alpha as number,
          beta: data.beta as number,
          gamma: data.gamma as number,
          absolute: data.absolute as boolean,
        }
      : null;
  }
  const valid =
    finite(data.x, -1000, 1000) &&
    finite(data.y, -1000, 1000) &&
    finite(data.z, -1000, 1000);
  return valid
    ? { x: data.x as number, y: data.y as number, z: data.z as number }
    : null;
}
function finite(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
function isEmptyPayload(value: unknown): boolean {
  return value === "";
}
function versionAtLeast(
  current: string | undefined,
  minimum: string | undefined,
): boolean {
  if (!minimum) return true;
  if (!current || !/^\d+(?:\.\d+)*$/u.test(current)) return false;
  const left = current.split(".").map(Number);
  const right = minimum.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}
function failedReply(
  eventType: string,
  error: string,
): Array<{ eventType: string; eventData: unknown }> {
  const kind = sensorEvent(eventType);
  return kind?.operation === "start"
    ? [{ eventType: `${kind.kind}_failed`, eventData: { error } }]
    : [];
}
const unsupportedFeed: SensorFeed = {
  start: () => "unsupported",
  stop: () => undefined,
  sample: () => null,
};
