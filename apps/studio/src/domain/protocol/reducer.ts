import type { Platform } from "../../contracts/entities";
import { findProtocolEvent, isRegisteredEvent } from "./registry";
import type { ProtocolEvent } from "./transport";

export interface ProtocolState {
  navigationGeneration: number;
  lastEventId: string | null;
}

export type ProtocolDecision =
  | { status: "stale" }
  | { status: "unknown-event" }
  | { status: "unverified"; eventId: string; ownerCard: string }
  | { status: "unsupported-version"; eventId: string; minimumVersion: string };

export function initialProtocolState(
  navigationGeneration: number,
): ProtocolState {
  if (!Number.isSafeInteger(navigationGeneration) || navigationGeneration < 0) {
    throw new TypeError("Invalid navigation generation.");
  }
  return { navigationGeneration, lastEventId: null };
}

/** Fails closed while preserving the state/effect seam for later protocol cards. */
export function reduceProtocolEvent(
  state: ProtocolState,
  event: ProtocolEvent,
  context: { profile: Platform; clientVersion?: string },
): { state: ProtocolState; decision: ProtocolDecision } {
  if (event.navigationGeneration !== state.navigationGeneration) {
    return { state, decision: { status: "stale" } };
  }
  if (!isRegisteredEvent("outgoing", event.eventType)) {
    return { state, decision: { status: "unknown-event" } };
  }
  const descriptor = findProtocolEvent(event.eventType);
  if (!descriptor) return { state, decision: { status: "unknown-event" } };
  const nextState = { ...state, lastEventId: descriptor.id };
  if (
    descriptor.minimumVersion &&
    context.clientVersion &&
    compareVersion(context.clientVersion, descriptor.minimumVersion) < 0
  ) {
    return {
      state: nextState,
      decision: {
        status: "unsupported-version",
        eventId: descriptor.id,
        minimumVersion: descriptor.minimumVersion,
      },
    };
  }
  // Inventory membership and SDK presence are not evidence that a client
  // profile supports an event. Later cards can add a handler after proof.
  return {
    state: nextState,
    decision: {
      status: "unverified",
      eventId: descriptor.id,
      ownerCard: descriptor.ownerCard,
    },
  };
}

function compareVersion(left: string, right: string): number {
  const parse = (value: string) =>
    value.split(".").map((part) => {
      if (!/^\d+$/u.test(part)) throw new TypeError("Invalid client version.");
      return Number(part);
    });
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}
