import type { PermissionCapability } from "../../contracts/entities";
import { findProtocolEvent } from "./registry";
import type { ProtocolEvent } from "./transport";

export type BrokerDecision =
  | { status: "prompt" }
  | { status: "unsupported" }
  | { status: "denied"; source: "project" | "operating-system" }
  | { status: "granted"; mode: "native" | "simulated" };

export interface PermissionProtocolEffects {
  request(capability: PermissionCapability): Promise<BrokerDecision>;
  readLocation(): Promise<LocationResult | null>;
  openLocationSettings(): Promise<boolean>;
  requestPhone(): Promise<"sent" | "cancelled" | "unsupported">;
  requestWriteAccess(): Promise<"allowed" | "cancelled" | "unsupported">;
}

export interface LocationResult {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  course?: number | null;
  speed?: number | null;
  horizontal_accuracy?: number | null;
  vertical_accuracy?: number | null;
  course_accuracy?: number | null;
  speed_accuracy?: number | null;
}

export interface PermissionEventResult {
  status: "applied" | "denied" | "unsupported" | "stale" | "invalid";
  replies: Array<{ eventType: string; eventData: unknown }>;
}

/**
 * Protocol permission effects are injected at the trusted host boundary.
 * Mock sessions use deterministic simulated denial and never call any effect.
 */
export class PermissionProtocolService {
  constructor(
    private readonly mode: "mock" | "real",
    private readonly navigationGeneration: number,
    private readonly clientVersion: string | undefined,
    private readonly effects: PermissionProtocolEffects = unsupportedEffects,
  ) {}

  async handle(event: ProtocolEvent): Promise<PermissionEventResult> {
    if (event.navigationGeneration !== this.navigationGeneration)
      return { status: "stale", replies: [] };
    if (!isEmptyPayload(event.eventData))
      return { status: "invalid", replies: [] };
    const descriptor = findProtocolEvent(event.eventType);
    if (descriptor?.ownerCard !== "04d" || descriptor.direction !== "outgoing")
      return { status: "unsupported", replies: [] };
    if (
      descriptor.minimumVersion &&
      (!this.clientVersion ||
        !isVersionAtLeast(this.clientVersion, descriptor.minimumVersion))
    ) {
      return { status: "unsupported", replies: denyReply(event.eventType) };
    }
    try {
      switch (event.eventType) {
        case "web_app_check_location":
          return { status: "applied", replies: [await this.checkLocation()] };
        case "web_app_open_location_settings":
          if (this.mode === "mock")
            return { status: "denied", replies: [mockLocationCheck] };
          if (!(await this.effects.openLocationSettings()))
            return {
              status: "unsupported",
              replies: [unavailableLocationCheck],
            };
          return { status: "applied", replies: [await this.checkLocation()] };
        case "web_app_request_location":
          return { status: "applied", replies: [await this.requestLocation()] };
        case "web_app_request_phone":
          if (this.mode === "mock")
            return { status: "denied", replies: [phoneCancelled] };
          return this.phoneReply(await this.effects.requestPhone());
        case "web_app_request_write_access":
          if (this.mode === "mock")
            return { status: "denied", replies: [writeCancelled] };
          return this.writeReply(await this.effects.requestWriteAccess());
        default:
          return { status: "unsupported", replies: [] };
      }
    } catch {
      return { status: "denied", replies: denyReply(event.eventType) };
    }
  }

  private async checkLocation(): Promise<{
    eventType: string;
    eventData: unknown;
  }> {
    if (this.mode === "mock") return mockLocationCheck;
    const permission = await this.effects.request("location");
    if (permission.status === "unsupported") return unavailableLocationCheck;
    if (permission.status === "prompt") {
      return {
        eventType: "location_checked",
        eventData: {
          available: true,
          access_requested: false,
          access_granted: false,
        },
      };
    }
    return {
      eventType: "location_checked",
      eventData: {
        available: true,
        access_requested: true,
        access_granted:
          permission.status === "granted" && permission.mode === "native",
      },
    };
  }

  private async requestLocation(): Promise<{
    eventType: string;
    eventData: unknown;
  }> {
    if (this.mode === "mock") return unavailableLocation;
    const permission = await this.effects.request("location");
    if (permission.status !== "granted" || permission.mode !== "native")
      return unavailableLocation;
    const location = await this.effects.readLocation();
    const safeLocation = location ? sanitizeLocation(location) : null;
    if (!safeLocation) return unavailableLocation;
    return { eventType: "location_requested", eventData: safeLocation };
  }

  private phoneReply(
    status: "sent" | "cancelled" | "unsupported",
  ): PermissionEventResult {
    return {
      status:
        status === "sent"
          ? "applied"
          : status === "cancelled"
            ? "denied"
            : "unsupported",
      replies: [
        {
          eventType: "phone_requested",
          eventData: {
            status: status === "unsupported" ? "cancelled" : status,
          },
        },
      ],
    };
  }

  private writeReply(
    status: "allowed" | "cancelled" | "unsupported",
  ): PermissionEventResult {
    return {
      status:
        status === "allowed"
          ? "applied"
          : status === "cancelled"
            ? "denied"
            : "unsupported",
      replies: [
        {
          eventType: "write_access_requested",
          eventData: {
            status: status === "unsupported" ? "cancelled" : status,
          },
        },
      ],
    };
  }
}

const mockLocationCheck = {
  eventType: "location_checked",
  eventData: { available: true, access_requested: true, access_granted: false },
};
const unavailableLocationCheck = {
  eventType: "location_checked",
  eventData: {
    available: false,
    access_requested: false,
    access_granted: false,
  },
};
const unavailableLocation = {
  eventType: "location_requested",
  eventData: { available: false },
};
const phoneCancelled = {
  eventType: "phone_requested",
  eventData: { status: "cancelled" },
};
const writeCancelled = {
  eventType: "write_access_requested",
  eventData: { status: "cancelled" },
};

const unsupportedEffects: PermissionProtocolEffects = {
  request: async () => ({ status: "unsupported" }),
  readLocation: async () => null,
  openLocationSettings: async () => false,
  requestPhone: async () => "unsupported",
  requestWriteAccess: async () => "unsupported",
};

function denyReply(
  eventType: string,
): Array<{ eventType: string; eventData: unknown }> {
  switch (eventType) {
    case "web_app_check_location":
    case "web_app_open_location_settings":
      return [unavailableLocationCheck];
    case "web_app_request_location":
      return [unavailableLocation];
    case "web_app_request_phone":
      return [phoneCancelled];
    case "web_app_request_write_access":
      return [writeCancelled];
    default:
      return [];
  }
}

function sanitizeLocation(value: LocationResult): LocationResult | null {
  if (
    !Number.isFinite(value.latitude) ||
    value.latitude < -90 ||
    value.latitude > 90
  )
    return null;
  if (
    !Number.isFinite(value.longitude) ||
    value.longitude < -180 ||
    value.longitude > 180
  )
    return null;
  const safe: LocationResult = {
    latitude: value.latitude,
    longitude: value.longitude,
  };
  for (const key of [
    "altitude",
    "course",
    "speed",
    "horizontal_accuracy",
    "vertical_accuracy",
    "course_accuracy",
    "speed_accuracy",
  ] as const) {
    const metric = value[key];
    if (metric !== undefined && metric !== null && !Number.isFinite(metric))
      return null;
    if (metric !== undefined && metric !== null) safe[key] = metric;
  }
  if (safe.speed !== undefined && safe.speed !== null && safe.speed < 0)
    return null;
  for (const key of [
    "horizontal_accuracy",
    "vertical_accuracy",
    "course_accuracy",
    "speed_accuracy",
  ] as const) {
    const metric = safe[key];
    if (metric !== undefined && metric !== null && metric < 0) return null;
  }
  return safe;
}

function isEmptyPayload(value: unknown): boolean {
  return value === "";
}

function isVersionAtLeast(left: string, right: string): boolean {
  try {
    return compareVersion(left, right) >= 0;
  } catch {
    return false;
  }
}

function compareVersion(left: string, right: string): number {
  const parse = (version: string) => {
    if (!/^\d+(?:\.\d+)*$/u.test(version))
      throw new TypeError("Invalid client version.");
    return version.split(".").map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
