import { describe, expect, test } from "bun:test";
import type {
  GuestHost,
  RuntimeGuest,
  RuntimeGuestEvent,
} from "../../apps/studio/bunium/runtime/guest";
import {
  type RuntimeSession,
  SessionAdapter,
} from "../../apps/studio/bunium/runtime/session";
import {
  HostSimulatorService,
  type SimulatorOpenOptions,
} from "../../apps/studio/bunium/services/simulator-service";

class FakeGuest implements RuntimeGuest {
  generation = 0;
  geolocationOverrides: Array<{
    latitude: number;
    longitude: number;
    accuracy: number;
  }> = [];
  geolocationClears = 0;
  events = new Set<(event: RuntimeGuestEvent) => void>();
  messages = new Set<(message: { generation: number; data: string }) => void>();
  constructor(private readonly log: string[]) {}
  dispose() {
    this.log.push("guest.dispose");
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
  post() {
    return true;
  }
  reload() {}
  setBounds() {}
  setGeolocationOverride(location: {
    latitude: number;
    longitude: number;
    accuracy: number;
  }) {
    this.geolocationOverrides.push(location);
  }
  clearGeolocationOverride() {
    this.geolocationClears += 1;
  }
}

function setup(guestApiVersion: number | undefined) {
  const log: string[] = [];
  const guests: FakeGuest[] = [];
  const session: RuntimeSession = {
    get released() {
      return log.includes("session.release");
    },
    release() {
      log.push("session.release");
    },
    retain() {
      return session;
    },
  };
  const runtime = {
    guestApiVersion,
    sessionApiVersion: 1,
    BuniumSession: {
      storageRoot: "/tmp/bunium-test",
      clearPartition: () => ({ generation: 1, removedNow: true }),
      ephemeral: () => session,
      fromPartition: () => session,
      isInUse: () => false,
      removePartition: () => ({ removedNow: true }),
    },
  };
  const sessions = new SessionAdapter(runtime, {
    resolve: (id) => (id === "part-1" ? { id, ephemeral: false } : undefined),
  });
  const guestHost: GuestHost = {
    createGuest(options) {
      expect(options.bridgeScript.length).toBeGreaterThan(0);
      expect(options.session).toBe(session);
      const guest = new FakeGuest(log);
      guests.push(guest);
      return guest;
    },
  };
  const service = new HostSimulatorService(runtime, sessions);
  const options: SimulatorOpenOptions = {
    bounds: { height: 600, width: 400, x: 0, y: 50 },
    guestHost,
    launch: {
      url: "https://example.org/app?tgWebAppData=secret",
      close: async () => {
        log.push("launch.close");
      },
    },
    mode: "overlay",
    partitionId: "part-1",
    platform: "android",
    simulatorId: "sim-1",
    toolbarSide: "top",
  };
  return { guests, log, options, service, sessions };
}

describe("host simulator service", () => {
  test("fails closed before acquiring a session on installed Bunium without guest API v1", async () => {
    const { log, options, service, sessions } = setup(undefined);
    await expect(service.open(options)).rejects.toThrow("runtime-unsupported");
    expect(log).toEqual(["launch.close"]);
    expect(sessions.isInUse("part-1")).toBe(false);
  });

  test("owns one guest and closes guest, partition lease, then prepared launch", async () => {
    const { guests, log, options, service, sessions } = setup(1);
    const controller = await service.open(options);
    expect(guests).toHaveLength(1);
    expect(service.get("sim-1")).toBe(controller);
    controller.setMode("expanded");
    controller.setTheme("dark");
    expect(service.get("sim-1")).toBe(controller);
    expect(await service.close("sim-1")).toBe(true);
    expect(log).toEqual(["guest.dispose", "session.release", "launch.close"]);
    expect(sessions.isInUse("part-1")).toBe(false);
    expect(await service.close("sim-1")).toBe(false);
  });

  test("routes location overrides only to the named active simulator guest", async () => {
    const { guests, options, service } = setup(1);
    await service.open(options);
    const location = { latitude: 37.7749, longitude: -122.4194, accuracy: 12 };

    expect(service.setGeolocationOverride("missing", location)).toBe(false);
    expect(service.setGeolocationOverride("sim-1", location)).toBe(true);
    expect(service.clearGeolocationOverride("missing")).toBe(false);
    expect(service.clearGeolocationOverride("sim-1")).toBe(true);
    expect(guests[0]?.geolocationOverrides).toEqual([location]);
    expect(guests[0]?.geolocationClears).toBe(1);

    await service.close("sim-1");
    expect(service.setGeolocationOverride("sim-1", location)).toBe(false);
  });
});
