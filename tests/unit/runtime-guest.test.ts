import { describe, expect, test } from "bun:test";
import {
  createGuest,
  GuestError,
  type GuestHost,
  type GuestLifecycleEvent,
  type RuntimeGuest,
  type RuntimeGuestEvent,
} from "../../apps/studio/bunium/runtime/guest";
import {
  type RuntimeSession,
  SessionAdapter,
} from "../../apps/studio/bunium/runtime/session";

function fakes() {
  const sessions: RuntimeSession[] = [];
  const guests: FakeGuest[] = [];
  const makeSession = (): RuntimeSession => {
    let released = false;
    const session: RuntimeSession = {
      get released() {
        return released;
      },
      release: () => {
        released = true;
      },
      retain: () => session,
    };
    sessions.push(session);
    return session;
  };
  const adapter = new SessionAdapter(
    {
      BuniumSession: {
        clearPartition: () => ({ generation: 1, removedNow: true }),
        ephemeral: makeSession,
        fromPartition: makeSession,
        isInUse: () => false,
        removePartition: () => ({ removedNow: true }),
      },
      sessionApiVersion: 1,
    },
    {
      resolve: (id) => (id === "part-1" ? { ephemeral: false, id } : undefined),
    },
  );
  let failNext = false;
  const host: GuestHost = {
    createGuest(options) {
      if (failNext) {
        failNext = false;
        throw new Error("native failure");
      }
      const guest = new FakeGuest(options.url);
      guests.push(guest);
      return guest;
    },
  };
  return {
    adapter,
    failNextCreate: () => {
      failNext = true;
    },
    guests,
    host,
    sessions,
  };
}

class FakeGuest implements RuntimeGuest {
  generation = 0;
  disposed = false;
  posts: Array<[number, string]> = [];
  events = new Set<(event: RuntimeGuestEvent) => void>();
  messages = new Set<(message: { generation: number; data: string }) => void>();
  constructor(readonly url: string) {}
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const listener of this.events)
      listener({ generation: this.generation, type: "disposed" });
  }
  navigate() {}
  onEvent(listener: (event: RuntimeGuestEvent) => void) {
    this.events.add(listener);
    return () => this.events.delete(listener);
  }
  onMessage(listener: (message: { generation: number; data: string }) => void) {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }
  post(generation: number, data: string) {
    if (this.disposed || generation !== this.generation) return false;
    this.posts.push([generation, data]);
    return true;
  }
  reload() {}
  setBounds() {}
  fire(event: RuntimeGuestEvent) {
    if (event.type === "document") this.generation = event.generation;
    for (const listener of this.events) listener(event);
  }
  send(data: string) {
    for (const listener of this.messages)
      listener({ data, generation: this.generation });
  }
}

const options = {
  bounds: { height: 600, width: 400, x: 0, y: 0 },
  documentStartBridge: "return () => {}",
  entryUrl: "https://example.org/app",
  partitionId: "part-1",
  simulatorId: "sim-1",
  trust: "telegram-guest" as const,
};

describe("runtime guest adapter", () => {
  test("requires guest API v1 and HTTP(S) URLs without credentials", () => {
    const { adapter, host } = fakes();
    expect(() => createGuest({}, host, adapter, options)).toThrow(GuestError);
    for (const entryUrl of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "bunium://app/",
      "https://user:pass@example.org/",
      "not a url",
    ]) {
      expect(() =>
        createGuest({ guestApiVersion: 1 }, host, adapter, {
          ...options,
          entryUrl,
        }),
      ).toThrow("invalid-url");
    }
  });

  test("only trusted partitions can host a guest", () => {
    const { adapter, host } = fakes();
    expect(() =>
      createGuest({ guestApiVersion: 1 }, host, adapter, {
        ...options,
        partitionId: "guest-chosen",
      }),
    ).toThrow("unknown-partition");
  });

  test("maps lifecycle and tags inbound messages with the adapter's own simulator ID", () => {
    const { adapter, guests, host } = fakes();
    const handle = createGuest({ guestApiVersion: 1 }, host, adapter, options);
    const events: GuestLifecycleEvent[] = [];
    const inbound: unknown[] = [];
    handle.onLifecycle((event) => events.push(event));
    handle.onInbound((message) => inbound.push(message));
    const guest = guests[0] as FakeGuest;
    guest.fire({ generation: 1, type: "document", url: options.entryUrl });
    guest.fire({
      generation: 1,
      status: 200,
      type: "load",
      url: options.entryUrl,
    });
    guest.send(JSON.stringify({ simulatorId: "sim-other" }));
    guest.fire({ code: 0, generation: 1, status: 2, type: "crashed" });
    expect(events.map((event) => event.lifecycle)).toEqual([
      "loading",
      "ready",
      "crashed",
    ]);
    expect(inbound).toEqual([
      {
        data: JSON.stringify({ simulatorId: "sim-other" }),
        navigationGeneration: 1,
        simulatorId: "sim-1",
      },
    ]);
    expect(handle.navigationGeneration).toBe(1);
  });

  test("posts only to the named generation", () => {
    const { adapter, guests, host } = fakes();
    const handle = createGuest({ guestApiVersion: 1 }, host, adapter, options);
    const guest = guests[0] as FakeGuest;
    guest.fire({ generation: 1, type: "document", url: options.entryUrl });
    guest.fire({ generation: 2, type: "document", url: options.entryUrl });
    expect(handle.postToGuest(1, "stale")).toBe(false);
    expect(handle.postToGuest(2, "fresh")).toBe(true);
    expect(guest.posts).toEqual([[2, "fresh"]]);
  });

  test("fails closed when geolocation methods are absent or the guest is disposed", () => {
    const { adapter, host } = fakes();
    const handle = createGuest({ guestApiVersion: 1 }, host, adapter, options);
    const location = { latitude: 37.7749, longitude: -122.4194, accuracy: 12 };

    expect(() => handle.setGeolocationOverride(location)).toThrow(
      "runtime-unsupported",
    );
    expect(() => handle.clearGeolocationOverride()).toThrow(
      "runtime-unsupported",
    );
    handle.dispose();
    expect(() => handle.setGeolocationOverride(location)).toThrow(
      "runtime-unsupported",
    );
  });

  test("dispose is idempotent, emits closing once and releases the partition", () => {
    const { adapter, guests, host, sessions } = fakes();
    const handle = createGuest({ guestApiVersion: 1 }, host, adapter, options);
    const events: string[] = [];
    handle.onLifecycle((event) => events.push(event.lifecycle));
    handle.dispose();
    handle.dispose();
    expect(events).toEqual(["closing"]);
    expect((guests[0] as FakeGuest).disposed).toBe(true);
    expect(sessions[0]?.released).toBe(true);
    expect(handle.postToGuest(0, "x")).toBe(false);
    const guest = guests[0] as FakeGuest;
    expect(guest.events.size).toBe(0);
    expect(guest.messages.size).toBe(0);
  });

  test("a native creation failure releases the partition lease", () => {
    const { adapter, failNextCreate, host, sessions } = fakes();
    failNextCreate();
    expect(() =>
      createGuest({ guestApiVersion: 1 }, host, adapter, options),
    ).toThrow("native failure");
    expect(sessions[0]?.released).toBe(true);
    expect(adapter.isInUse("part-1")).toBe(false);
  });
});
