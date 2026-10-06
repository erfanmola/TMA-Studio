import { findProtocolEvent } from "./registry";
import type { ProtocolEvent } from "./transport";

export type ActionStatus =
  | "applied"
  | "simulated"
  | "denied"
  | "unsupported"
  | "invalid"
  | "stale";
export interface ActionResult {
  status: ActionStatus;
  replies: Array<{ eventType: string; eventData: unknown }>;
}

export function action(
  status: ActionStatus,
  replies: ActionResult["replies"] = [],
): ActionResult {
  return { status, replies };
}

export function checkAction(
  event: ProtocolEvent,
  generation: number,
  clientVersion: string | undefined,
  owner: string,
  direction: "outgoing" | "incoming",
): ActionResult | null {
  if (event.navigationGeneration !== generation) return action("stale");
  const descriptor = findProtocolEvent(event.eventType);
  if (descriptor?.ownerCard !== owner || descriptor.direction !== direction)
    return action("unsupported");
  if (
    descriptor.minimumVersion &&
    !versionAtLeast(clientVersion, descriptor.minimumVersion)
  )
    return action("unsupported");
  return null;
}

export function exactRecord(
  input: unknown,
  keys: readonly string[],
): input is Record<string, unknown> {
  return (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.getPrototypeOf(input) === Object.prototype &&
    Object.keys(input).length === keys.length &&
    keys.every((key) => Object.hasOwn(input, key))
  );
}

export function safeHttpUrl(value: unknown, requireHttps = false): URL | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  )
    return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" &&
        (requireHttps || url.protocol !== "http:")) ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== ""
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function isTelegramHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "t.me" || host === "telegram.me";
}

export function versionAtLeast(
  version: string | undefined,
  minimum: string,
): boolean {
  if (!version) return false;
  const parse = (value: string) =>
    /^\d+(?:\.\d+)*$/u.test(value) ? value.split(".").map(Number) : null;
  const left = parse(version);
  const right = parse(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}
