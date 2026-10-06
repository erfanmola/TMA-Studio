import type { SimulatorSession } from "../../src/contracts/entities";
import type { RuntimeSession, SessionAdapter } from "./session";

/** Runtime guest surface this adapter needs (Bunium guest API v1). */
export type RuntimeGuestEvent =
  | { type: "document"; generation: number; url: string }
  | { type: "load"; generation: number; status: number; url: string }
  | { type: "load-error"; generation: number; code: number; url: string }
  | { type: "crashed"; generation: number; status: number; code: number }
  | { type: "disposed"; generation: number };

export interface RuntimeGuest {
  readonly generation: number;
  dispose(): void;
  navigate(url: string): void;
  onEvent(listener: (event: RuntimeGuestEvent) => void): () => void;
  onMessage(
    listener: (message: { generation: number; data: string }) => void,
  ): () => void;
  post(generation: number, data: string): boolean;
  reload(): void;
  setBounds(bounds: GuestBounds): void;
  setGeolocationOverride?(location: GuestGeolocation): void;
  clearGeolocationOverride?(): void;
}

export interface GuestGeolocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GuestHost {
  createGuest(options: {
    bridgeScript: string;
    height: number;
    session: RuntimeSession;
    url: string;
    width: number;
    x: number;
    y: number;
  }): RuntimeGuest;
}

export interface GuestBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface GuestOptions {
  bounds: GuestBounds;
  /** Telegram transport installed before the first page script. */
  documentStartBridge: string;
  entryUrl: string;
  partitionId: string;
  simulatorId: string;
  trust: "telegram-guest";
}

export type GuestLifecycle = SimulatorSession["lifecycle"];

export type GuestLifecycleEvent =
  | { lifecycle: GuestLifecycle; navigationGeneration: number; url?: string }
  | { lifecycle: "crashed"; navigationGeneration: number; reason: number };

/** A message from the guest's current document. */
export interface GuestInbound {
  data: string;
  navigationGeneration: number;
  simulatorId: string;
}

export interface GuestHandle {
  readonly navigationGeneration: number;
  readonly simulatorId: string;
  dispose(): void;
  navigate(url: string): void;
  onInbound(listener: (message: GuestInbound) => void): () => void;
  onLifecycle(listener: (event: GuestLifecycleEvent) => void): () => void;
  /** Delivers only to `navigationGeneration`'s document; false if stale. */
  postToGuest(navigationGeneration: number, data: string): boolean;
  reload(): void;
  setBounds(bounds: GuestBounds): void;
  setGeolocationOverride(location: GuestGeolocation): void;
  clearGeolocationOverride(): void;
}

export class GuestError extends Error {
  constructor(readonly code: "runtime-unsupported" | "invalid-url") {
    super(`guest: ${code}`);
    this.name = "GuestError";
  }
}

export function guestUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GuestError("invalid-url");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new GuestError("invalid-url");
  }
  return url.href;
}

/**
 * Creates one simulator guest in its trusted partition. Routing uses the
 * runtime handle this adapter created; a simulator ID inside guest data is
 * never consulted. Disposal releases the partition lease and every
 * subscription.
 */
export function createGuest(
  runtime: { guestApiVersion?: number },
  host: GuestHost,
  sessions: SessionAdapter,
  options: GuestOptions,
): GuestHandle {
  if (runtime.guestApiVersion !== 1) {
    throw new GuestError("runtime-unsupported");
  }
  const entryUrl = guestUrl(options.entryUrl);
  const lease = sessions.acquire(options.partitionId);
  let guest: RuntimeGuest;
  try {
    guest = host.createGuest({
      bridgeScript: options.documentStartBridge,
      session: lease.session,
      url: entryUrl,
      ...options.bounds,
    });
  } catch (error) {
    lease.release();
    throw error;
  }
  let disposed = false;
  const lifecycle = new Set<(event: GuestLifecycleEvent) => void>();
  const inbound = new Set<(message: GuestInbound) => void>();
  const emit = (event: GuestLifecycleEvent) => {
    for (const listener of lifecycle) listener(event);
  };

  const unsubscribeEvents = guest.onEvent((event) => {
    switch (event.type) {
      case "document":
        emit({
          lifecycle: "loading",
          navigationGeneration: event.generation,
          url: event.url,
        });
        break;
      case "load":
        emit({
          lifecycle: "ready",
          navigationGeneration: event.generation,
          url: event.url,
        });
        break;
      case "crashed":
        emit({
          lifecycle: "crashed",
          navigationGeneration: event.generation,
          reason: event.status,
        });
        break;
      case "disposed":
        emit({
          lifecycle: "closing",
          navigationGeneration: event.generation,
        });
        break;
      case "load-error":
        break;
    }
  });
  const unsubscribeMessages = guest.onMessage((message) => {
    for (const listener of inbound) {
      listener({
        data: message.data,
        navigationGeneration: message.generation,
        simulatorId: options.simulatorId,
      });
    }
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      guest.dispose();
      unsubscribeEvents();
      unsubscribeMessages();
      lifecycle.clear();
      inbound.clear();
      lease.release();
    },
    navigate(url) {
      if (!disposed) guest.navigate(guestUrl(url));
    },
    get navigationGeneration() {
      return guest.generation;
    },
    onInbound(listener) {
      if (disposed) return () => undefined;
      inbound.add(listener);
      return () => inbound.delete(listener);
    },
    onLifecycle(listener) {
      if (disposed) return () => undefined;
      lifecycle.add(listener);
      return () => lifecycle.delete(listener);
    },
    postToGuest(navigationGeneration, data) {
      return !disposed && guest.post(navigationGeneration, data);
    },
    reload() {
      if (!disposed) guest.reload();
    },
    setGeolocationOverride(location) {
      if (disposed || !guest.setGeolocationOverride)
        throw new GuestError("runtime-unsupported");
      guest.setGeolocationOverride(location);
    },
    clearGeolocationOverride() {
      if (disposed || !guest.clearGeolocationOverride)
        throw new GuestError("runtime-unsupported");
      guest.clearGeolocationOverride();
    },
    setBounds(bounds) {
      if (!disposed) guest.setBounds(bounds);
    },
    simulatorId: options.simulatorId,
  };
}
