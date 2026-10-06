import type { GuestRect, ToolbarSide } from "./simulator";

export const CAPTURE_SCOPES = ["viewport", "telegram", "window"] as const;
export type CaptureScope = (typeof CAPTURE_SCOPES)[number];

export interface CaptureRequest {
  requestId: string;
  scope: CaptureScope;
  side: ToolbarSide;
  host: { width: number; height: number };
  guest: GuestRect;
}

export type CaptureReply =
  | { requestId: string; ok: true; fileName: string }
  | {
      requestId: string;
      ok: false;
      error: "CANCELED" | "UNAVAILABLE" | "FAILED";
    };

export function parseCaptureRequest(value: unknown): CaptureRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 4096) return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return null;
  const record = candidate as Record<string, unknown>;
  if (
    Object.keys(record).length !== 5 ||
    typeof record.requestId !== "string" ||
    !/^[\w-]{1,64}$/u.test(record.requestId) ||
    !CAPTURE_SCOPES.includes(record.scope as CaptureScope) ||
    !["top", "bottom", "left", "right"].includes(String(record.side)) ||
    !record.host ||
    typeof record.host !== "object" ||
    !record.guest ||
    typeof record.guest !== "object"
  )
    return null;
  const host = record.host as Record<string, unknown>;
  const guest = record.guest as Record<string, unknown>;
  const bounded = (number: unknown, min: number, max: number) =>
    Number.isSafeInteger(number) &&
    Number(number) >= min &&
    Number(number) <= max;
  if (
    Object.keys(host).length !== 2 ||
    Object.keys(guest).length !== 4 ||
    !bounded(host.width, 1, 8192) ||
    !bounded(host.height, 1, 8192) ||
    !bounded(guest.x, 0, 8192) ||
    !bounded(guest.y, 0, 8192) ||
    !bounded(guest.width, 1, 8192) ||
    !bounded(guest.height, 1, 8192) ||
    Number(guest.x) + Number(guest.width) > Number(host.width) ||
    Number(guest.y) + Number(guest.height) > Number(host.height)
  )
    return null;
  return {
    requestId: record.requestId,
    scope: record.scope as CaptureScope,
    side: record.side as ToolbarSide,
    host: { width: host.width as number, height: host.height as number },
    guest: {
      x: guest.x as number,
      y: guest.y as number,
      width: guest.width as number,
      height: guest.height as number,
    },
  };
}

export function safeCaptureFileName(
  scope: CaptureScope,
  date = new Date(),
): string {
  const stamp = date.toISOString().replace(/[:.]/gu, "-");
  return `tma-studio-${stamp}-${crypto.randomUUID().slice(0, 8)}-${scope}.png`;
}
