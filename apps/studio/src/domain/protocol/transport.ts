import { isIncomingEvent, isOutgoingEvent } from "./events.generated";

const MAX_ENVELOPE_BYTES = 65_536;
const MAX_VALUE_DEPTH = 32;
const MAX_VALUE_NODES = 8192;

export interface TelegramEnvelope {
  eventType: string;
  eventData: unknown;
}

export interface ProtocolEvent extends TelegramEnvelope {
  navigationGeneration: number;
}

export interface NativeGuestProtocolChannel {
  readonly navigationGeneration: number;
  onInbound(
    listener: (message: {
      data: string;
      navigationGeneration: number;
      simulatorId: string;
    }) => void,
  ): () => void;
  postToGuest(navigationGeneration: number, data: string): boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedJsonValue(root: unknown): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: root, depth: 0 },
  ];
  const seen = new WeakSet<object>();
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (
      !current ||
      current.depth > MAX_VALUE_DEPTH ||
      ++nodes > MAX_VALUE_NODES
    ) {
      return false;
    }
    const { value, depth } = current;
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "string") {
      if (value.length > MAX_ENVELOPE_BYTES) return false;
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return false;
      continue;
    }
    if (!record(value) && !Array.isArray(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children)
      pending.push({ value: child, depth: depth + 1 });
  }
  return true;
}

function serialize(eventType: string, eventData: unknown): string {
  const normalizedData = eventData === undefined ? null : eventData;
  if (!boundedJsonValue(normalizedData)) {
    throw new TypeError("Telegram protocol payload is not bounded JSON.");
  }
  const result = JSON.stringify({ eventType, eventData: normalizedData });
  if (
    typeof result !== "string" ||
    new TextEncoder().encode(result).length > MAX_ENVELOPE_BYTES
  ) {
    throw new RangeError("Telegram protocol envelope is too large.");
  }
  return result;
}

function parse(raw: unknown): TelegramEnvelope | null {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_ENVELOPE_BYTES
  )
    return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !record(value) ||
    Object.keys(value).some((key) => key !== "eventType" && key !== "eventData")
  )
    return null;
  if (
    typeof value.eventType !== "string" ||
    value.eventType.length > 128 ||
    !("eventData" in value)
  )
    return null;
  if (!boundedJsonValue(value.eventData)) return null;
  return { eventType: value.eventType, eventData: value.eventData };
}

export function encodeNativePostEvent(
  eventType: string,
  eventData: unknown,
): string {
  if (!isOutgoingEvent(eventType))
    throw new TypeError("Unknown Telegram outgoing event.");
  return serialize(eventType, eventData);
}

export function decodeNativePostEvent(
  raw: string,
  navigationGeneration: number,
  currentGeneration: number,
): ProtocolEvent | null {
  if (navigationGeneration !== currentGeneration) return null;
  const message = parse(raw);
  if (!message || !isOutgoingEvent(message.eventType)) return null;
  return { ...message, navigationGeneration };
}

/** Function body consumed by Bunium's untrusted, main-frame-only bridge hook. */
export function createNativeDocumentStartBridge(): string {
  return `var maxBytes = 65536;
var byteLength = function (value) { return unescape(encodeURIComponent(value)).length; };
var bounded = function (root) {
  var pending = [[root, 0]], nodes = 0;
  while (pending.length) {
    var entry = pending.pop(), value = entry[0], depth = entry[1];
    if (depth > 32 || ++nodes > 8192) return false;
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'string') { if (value.length > maxBytes) return false; continue; }
    if (typeof value === 'number') { if (!isFinite(value)) return false; continue; }
    if (!value || typeof value !== 'object') return false;
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) pending.push([value[keys[i]], depth + 1]);
  }
  return true;
};
var parse = function (raw) {
  if (typeof raw !== 'string' || byteLength(raw) > maxBytes) return null;
  try {
    var value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.eventType !== 'string' || value.eventType.length > 128 ||
        !Object.prototype.hasOwnProperty.call(value, 'eventData') ||
        Object.keys(value).some(function (key) { return key !== 'eventType' && key !== 'eventData'; })) return null;
    if (!bounded(value.eventData)) return null;
    return value;
  } catch (_) { return null; }
};
Object.defineProperty(window, 'TelegramWebviewProxy', {
  configurable: false, enumerable: false, writable: false,
  value: Object.freeze({
    postEvent: function (eventType, eventDataJson) {
      if (typeof eventType !== 'string' || eventType.length > 128 ||
          typeof eventDataJson !== 'string' || byteLength(eventDataJson) > maxBytes) return false;
      var eventData;
      try { eventData = JSON.parse(eventDataJson); } catch (_) { return false; }
      if (!bounded(eventData)) return false;
      post(JSON.stringify({ eventType: eventType, eventData: eventData }));
      return true;
    }
  })
});
return function (raw) {
  var message = parse(raw);
  if (!message || typeof window.TelegramGameProxy_receiveEvent !== 'function') return false;
  window.TelegramGameProxy_receiveEvent(message.eventType, message.eventData);
  return true;
};`;
}

export class NativeProtocolTransport {
  constructor(private readonly guest: NativeGuestProtocolChannel) {}

  subscribe(listener: (event: ProtocolEvent) => void): () => void {
    return this.guest.onInbound((message) => {
      const event = decodeInbound(message, this.guest.navigationGeneration);
      if (event) listener(event);
    });
  }

  postEvent(eventType: string, eventData: unknown): boolean {
    if (!isIncomingEvent(eventType))
      throw new TypeError("Unknown Telegram incoming event.");
    const generation = this.guest.navigationGeneration;
    return this.guest.postToGuest(generation, serialize(eventType, eventData));
  }
}

function decodeInbound(
  message: { data: string; navigationGeneration: number; simulatorId: string },
  currentGeneration: number,
): ProtocolEvent | null {
  return decodeNativePostEvent(
    message.data,
    message.navigationGeneration,
    currentGeneration,
  );
}

export interface PostMessageEventLike {
  source: unknown;
  origin: string;
  data: unknown;
}

export interface PostMessageTarget {
  postMessage(message: string, targetOrigin: string): void;
}

export class PostMessageProtocolTransport {
  private readonly origin: string;

  constructor(
    private readonly target: PostMessageTarget,
    private readonly source: unknown,
    expectedOrigin: string,
    private readonly generation: number,
    private readonly currentGeneration: () => number,
  ) {
    const url = new URL(expectedOrigin);
    if (
      url.origin !== expectedOrigin ||
      url.username ||
      url.password ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" && isLoopback(url.hostname))
      )
    )
      throw new TypeError(
        "PostMessage target must be a canonical HTTPS or loopback origin.",
      );
    this.origin = url.origin;
  }

  postEvent(eventType: string, eventData: unknown): boolean {
    if (!isIncomingEvent(eventType))
      throw new TypeError("Unknown Telegram incoming event.");
    if (this.currentGeneration() !== this.generation) return false;
    this.target.postMessage(serialize(eventType, eventData), this.origin);
    return true;
  }

  receive(
    event: PostMessageEventLike,
    listener: (message: ProtocolEvent) => void,
  ): boolean {
    if (
      this.currentGeneration() !== this.generation ||
      event.source !== this.source ||
      event.origin !== this.origin
    )
      return false;
    const message = parse(event.data);
    if (!message || !isOutgoingEvent(message.eventType)) return false;
    listener({ ...message, navigationGeneration: this.generation });
    return true;
  }
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}
