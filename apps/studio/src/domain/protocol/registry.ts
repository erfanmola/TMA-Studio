import type { Platform } from "../../contracts/entities";
import { isIncomingEvent, isOutgoingEvent } from "./events.generated";
import catalog from "./registry.generated.json";

const TELEGRAM_PROTOCOL_REGISTRY = catalog;

export { TELEGRAM_PROTOCOL_REGISTRY };

export type RegisteredEvent =
  (typeof TELEGRAM_PROTOCOL_REGISTRY.events)[number];

export function findProtocolEvent(
  eventType: string,
): RegisteredEvent | undefined {
  return TELEGRAM_PROTOCOL_REGISTRY.events.find(
    (event) => event.event === eventType,
  );
}

export function isRegisteredEvent(
  direction: "outgoing" | "incoming",
  eventType: string,
): boolean {
  return direction === "outgoing"
    ? isOutgoingEvent(eventType)
    : isIncomingEvent(eventType);
}

export function profileStatus(
  eventType: string,
  profile: Platform,
): "unverified" | "unknown" {
  const event = findProtocolEvent(eventType);
  if (!event) return "unknown";
  return event.profiles[profile].status === "unverified"
    ? "unverified"
    : "unknown";
}
