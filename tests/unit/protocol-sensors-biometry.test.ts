import { describe, expect, test } from "bun:test";
import {
  type BiometryEffect,
  type BiometryInfo,
  BiometryProtocolService,
  type BiometryTokenVault,
} from "../../apps/studio/src/domain/protocol/biometry";
import {
  HapticProtocolService,
  parseHaptic,
} from "../../apps/studio/src/domain/protocol/haptics";
import { OrientationProtocolService } from "../../apps/studio/src/domain/protocol/orientation";
import catalog from "../../apps/studio/src/domain/protocol/registry.generated.json";
import {
  BoundedMockSensorFeed,
  type SensorFeed,
  type SensorKind,
  SensorProtocolService,
  type SensorSample,
} from "../../apps/studio/src/domain/protocol/sensors";
import type { ProtocolEvent } from "../../apps/studio/src/domain/protocol/transport";

const owned = catalog.events.filter((row) => row.ownerCard === "04e");
const event = (
  eventType: string,
  eventData: unknown = "",
  navigationGeneration = 2,
): ProtocolEvent => ({ eventType, eventData, navigationGeneration });
const availableInfo: BiometryInfo = {
  available: true,
  type: "finger",
  deviceId: "device-fixture",
  accessRequested: true,
  accessGranted: true,
};

describe("Telegram sensors, haptics, orientation and biometry (04e)", () => {
  test("covers all assigned registry rows without claiming client support", () => {
    expect(owned).toHaveLength(28);
    expect(owned.map((row) => row.event).sort()).toEqual(
      [
        "web_app_biometry_get_info",
        "web_app_biometry_open_settings",
        "web_app_biometry_request_access",
        "web_app_biometry_request_auth",
        "web_app_biometry_update_token",
        "web_app_start_accelerometer",
        "web_app_stop_accelerometer",
        "accelerometer_started",
        "accelerometer_stopped",
        "accelerometer_changed",
        "accelerometer_failed",
        "web_app_start_gyroscope",
        "web_app_stop_gyroscope",
        "gyroscope_started",
        "gyroscope_stopped",
        "gyroscope_changed",
        "gyroscope_failed",
        "web_app_start_device_orientation",
        "web_app_stop_device_orientation",
        "device_orientation_started",
        "device_orientation_stopped",
        "device_orientation_changed",
        "device_orientation_failed",
        "web_app_toggle_orientation_lock",
        "web_app_trigger_haptic_feedback",
        "biometry_info_received",
        "biometry_auth_requested",
        "biometry_token_updated",
      ].sort(),
    );
    expect(
      owned.every(
        (row) => row.implemented === false && row.status === "unverified",
      ),
    ).toBe(true);
  });

  test("sensor fixture is pull-driven, bounded and tears down without idle loops", () => {
    const service = new SensorProtocolService(
      2,
      "8.0",
      new BoundedMockSensorFeed(),
    );
    expect(
      service.handle(
        event("web_app_start_accelerometer", { refresh_rate: 50 }),
      ),
    ).toEqual({
      status: "applied",
      replies: [{ eventType: "accelerometer_started", eventData: "" }],
    });
    expect(service.getState("accelerometer")).toEqual({
      started: true,
      refreshRate: 50,
      needAbsolute: false,
    });
    expect(service.sampleOnce("accelerometer")).toEqual({
      status: "applied",
      replies: [
        {
          eventType: "accelerometer_changed",
          eventData: { x: 0.25, y: -0.5, z: 9.75 },
        },
      ],
    });
    expect(service.handle(event("web_app_stop_accelerometer"))).toEqual({
      status: "applied",
      replies: [{ eventType: "accelerometer_stopped", eventData: "" }],
    });
    expect(service.sampleOnce("accelerometer").status).toBe("denied");
    expect(service.dispose()).toEqual([]);
  });

  test("orientation and gyro start/stop carry bounded parameters and background cleanup", () => {
    const service = new SensorProtocolService(
      2,
      "8.0",
      new BoundedMockSensorFeed(),
    );
    expect(
      service.handle(
        event("web_app_start_device_orientation", {
          refresh_rate: 20,
          need_absolute: true,
        }),
      ),
    ).toMatchObject({
      status: "applied",
      replies: [{ eventType: "device_orientation_started" }],
    });
    expect(service.sampleOnce("device_orientation")).toMatchObject({
      replies: [
        {
          eventType: "device_orientation_changed",
          eventData: { alpha: 180, beta: 4, gamma: -2, absolute: false },
        },
      ],
    });
    expect(
      service.handle(event("web_app_start_gyroscope", { refresh_rate: 1000 }))
        .status,
    ).toBe("applied");
    expect(service.sampleOnce("gyroscope")).toMatchObject({
      replies: [
        {
          eventType: "gyroscope_changed",
          eventData: { x: 0.01, y: -0.02, z: 0.03 },
        },
      ],
    });
    expect(
      service
        .dispose()
        .map((reply) => reply.eventType)
        .sort(),
    ).toEqual(["device_orientation_stopped", "gyroscope_stopped"]);
    expect(service.getState("gyroscope").started).toBe(false);
  });

  test("sensor denial, unsupported, invalid rates, stale generations and bad samples fail closed", () => {
    const deniedFeed: SensorFeed = {
      start: () => "denied",
      stop: () => undefined,
      sample: () => null,
    };
    const denied = new SensorProtocolService(2, "8.0", deniedFeed);
    expect(
      denied.handle(event("web_app_start_accelerometer", { refresh_rate: 100 }))
        .replies,
    ).toEqual([
      {
        eventType: "accelerometer_failed",
        eventData: { error: "PERMISSION_DENIED" },
      },
    ]);
    expect(
      denied.handle(event("web_app_start_accelerometer", { refresh_rate: 19 }))
        .status,
    ).toBe("invalid");
    expect(
      denied.handle(
        event("web_app_start_accelerometer", { refresh_rate: 40 }, 1),
      ).status,
    ).toBe("stale");
    const old = new SensorProtocolService(
      2,
      "7.9",
      new BoundedMockSensorFeed(),
    );
    expect(
      old.handle(event("web_app_start_gyroscope", { refresh_rate: 80 })).status,
    ).toBe("unsupported");
    const badSample: SensorFeed = {
      start: () => "available",
      stop: () => undefined,
      sample: (_kind: SensorKind) =>
        ({ x: 0, y: 0, z: Number.NaN }) as SensorSample,
    };
    const invalid = new SensorProtocolService(2, "8.0", badSample);
    invalid.handle(event("web_app_start_accelerometer", { refresh_rate: 100 }));
    expect(invalid.sampleOnce("accelerometer").status).toBe("invalid");
    const extraData: SensorFeed = {
      start: () => "available",
      stop: () => undefined,
      sample: () =>
        ({ x: 1, y: 2, z: 3, secret: "must-not-cross" }) as SensorSample,
    };
    const projected = new SensorProtocolService(2, "8.0", extraData);
    projected.handle(
      event("web_app_start_accelerometer", { refresh_rate: 100 }),
    );
    expect(projected.sampleOnce("accelerometer").replies[0]?.eventData).toEqual(
      { x: 1, y: 2, z: 3 },
    );
    expect(
      denied.handle(
        event("web_app_start_device_orientation", {
          refresh_rate: 100,
          need_absolute: false,
        }),
      ).replies,
    ).toEqual([
      {
        eventType: "device_orientation_failed",
        eventData: { error: "PERMISSION_DENIED" },
      },
    ]);
    expect(
      denied.handle(event("web_app_start_gyroscope", { refresh_rate: 100 }))
        .replies,
    ).toEqual([
      {
        eventType: "gyroscope_failed",
        eventData: { error: "PERMISSION_DENIED" },
      },
    ]);
  });

  test("haptics validate exact types and mock mode never invokes a host effect", () => {
    expect(parseHaptic({ type: "impact", impact_style: "soft" })).toEqual({
      type: "impact",
      impact_style: "soft",
    });
    expect(
      parseHaptic({ type: "notification", notification_type: "warning" }),
    ).toEqual({ type: "notification", notification_type: "warning" });
    expect(parseHaptic({ type: "selection_change" })).toEqual({
      type: "selection_change",
    });
    expect(
      parseHaptic({ type: "impact", impact_style: "soft", extra: true }),
    ).toBeNull();
    expect(
      parseHaptic({ type: "notification", notification_type: "maybe" }),
    ).toBeNull();
    let calls = 0;
    const effect = {
      trigger: () => {
        calls += 1;
        return "played" as const;
      },
    };
    const mock = new HapticProtocolService(2, "8.0", "mock", effect);
    expect(mock.handle({ type: "impact", impact_style: "heavy" })).toEqual({
      status: "simulated",
    });
    expect(calls).toBe(0);
    expect(
      new HapticProtocolService(2, "8.0", "real", {
        trigger: () => "denied",
      }).handle({ type: "selection_change" }),
    ).toEqual({ status: "denied" });
    expect(mock.handle({ type: "selection_change" }, 1).status).toBe("stale");
  });

  test("orientation lock is local for mock sessions and denied/unavailable for real adapters", () => {
    let calls = 0;
    const mock = new OrientationProtocolService(2, "8.0", "mock", {
      setLocked: () => {
        calls += 1;
        return "denied";
      },
    });
    expect(mock.handle({ locked: true })).toEqual({
      status: "applied",
      locked: true,
    });
    expect(calls).toBe(0);
    const real = new OrientationProtocolService(2, "8.0", "real", {
      setLocked: () => "denied",
    });
    expect(real.handle({ locked: true })).toEqual({
      status: "denied",
      locked: false,
    });
    expect(
      new OrientationProtocolService(2, "7.9").handle({ locked: true }).status,
    ).toBe("unsupported");
    expect(mock.handle({ locked: "yes" }).status).toBe("invalid");
    expect(mock.handle({ locked: false }, 1).status).toBe("stale");
  });

  test("mock biometry stays unavailable and never invokes effects or vault", async () => {
    let effectCalls = 0;
    let vaultCalls = 0;
    const effect: BiometryEffect = {
      info: async () => {
        effectCalls += 1;
        return availableInfo;
      },
      requestAccess: async () => {
        effectCalls += 1;
        return true;
      },
      authenticate: async () => {
        effectCalls += 1;
        return true;
      },
      openSettings: async () => {
        effectCalls += 1;
        return true;
      },
    };
    const vault: BiometryTokenVault = {
      put: async () => {
        vaultCalls += 1;
      },
      get: async () => {
        vaultCalls += 1;
        return "secret";
      },
      delete: async () => {
        vaultCalls += 1;
      },
    };
    const service = new BiometryProtocolService(
      "trusted-scope",
      2,
      "8.0",
      "mock",
      effect,
      vault,
    );
    expect(
      (await service.handle("web_app_biometry_get_info")).replies[0]?.eventData,
    ).toMatchObject({ available: false, access_granted: false });
    expect(
      (
        await service.handle("web_app_biometry_request_access", {
          reason: "Unlock",
        })
      ).status,
    ).toBe("denied");
    expect(
      (await service.handle("web_app_biometry_request_auth", {})).replies[0]
        ?.eventData,
    ).toEqual({ status: "failed" });
    expect(
      (
        await service.handle("web_app_biometry_update_token", {
          token: "mock-secret",
        })
      ).status,
    ).toBe("denied");
    expect(effectCalls).toBe(0);
    expect(vaultCalls).toBe(0);
  });

  test("real biometry token stays in host vault except the explicit authenticated SDK reply", async () => {
    const values = new Map<string, string>();
    const stored: string[] = [];
    const vault: BiometryTokenVault = {
      put: async (scope, token) => {
        stored.push(scope);
        values.set(scope, token);
      },
      get: async (scope) => values.get(scope) ?? null,
      delete: async (scope) => {
        values.delete(scope);
      },
    };
    const effect: BiometryEffect = {
      info: async () => availableInfo,
      requestAccess: async () => true,
      authenticate: async () => true,
      openSettings: async () => true,
    };
    const service = new BiometryProtocolService(
      "project-7-partition-9",
      2,
      "8.0",
      "real",
      effect,
      vault,
    );
    const info = await service.handle("web_app_biometry_get_info");
    expect(info.status).toBe("applied");
    expect(info.replies).toMatchObject([
      {
        eventType: "biometry_info_received",
        eventData: {
          available: true,
          access_granted: true,
          token_saved: false,
        },
      },
    ]);
    expect(
      (
        await service.handle("web_app_biometry_request_access", {
          reason: "Confirm identity",
        })
      ).status,
    ).toBe("applied");
    expect(
      (await service.handle("web_app_biometry_open_settings")).replies[0]
        ?.eventType,
    ).toBe("biometry_info_received");
    const updated = await service.handle("web_app_biometry_update_token", {
      token: "opaque-biometry-token",
    });
    expect(updated.replies[0]?.eventData).toEqual({ status: "updated" });
    expect(updated.replies[1]?.eventData).toMatchObject({ token_saved: true });
    expect(JSON.stringify(updated.replies)).not.toContain(
      "opaque-biometry-token",
    );
    expect(stored).toEqual(["project-7-partition-9"]);
    const auth = await service.handle("web_app_biometry_request_auth", {
      reason: "Confirm",
    });
    expect(auth.replies[0]?.eventData).toEqual({
      status: "authorized",
      token: "opaque-biometry-token",
    });
    const removed = await service.handle("web_app_biometry_update_token", {
      token: "",
    });
    expect(removed.replies[0]?.eventData).toEqual({ status: "removed" });
    expect(values.size).toBe(0);
  });

  test("biometry stale, old-version, malformed and unqualified flows fail closed", async () => {
    let calls = 0;
    const effect: BiometryEffect = {
      info: async () => {
        calls += 1;
        return null;
      },
      requestAccess: async () => {
        calls += 1;
        return false;
      },
      authenticate: async () => {
        calls += 1;
        return false;
      },
      openSettings: async () => {
        calls += 1;
        return false;
      },
    };
    const old = new BiometryProtocolService(
      "trusted",
      2,
      "7.1",
      "real",
      effect,
    );
    expect((await old.handle("web_app_biometry_get_info")).status).toBe(
      "unsupported",
    );
    const service = new BiometryProtocolService(
      "trusted",
      2,
      "8.0",
      "real",
      effect,
    );
    expect(
      (await service.handle("web_app_biometry_get_info", "", 1)).status,
    ).toBe("stale");
    expect(
      (
        await service.handle("web_app_biometry_request_access", {
          reason: "x".repeat(129),
        })
      ).status,
    ).toBe("invalid");
    expect(
      (
        await service.handle("web_app_biometry_update_token", {
          token: "x".repeat(1025),
        })
      ).status,
    ).toBe("invalid");
    expect(
      (await service.handle("web_app_biometry_request_auth", {})).replies[0]
        ?.eventData,
    ).toEqual({ status: "failed" });
    expect(calls).toBe(0);
  });

  test("biometry drops an in-flight permission reply after navigation", async () => {
    let finishAccess: ((allowed: boolean) => void) | undefined;
    const effect: BiometryEffect = {
      info: async () => ({
        ...availableInfo,
        accessRequested: false,
        accessGranted: false,
      }),
      requestAccess: async () =>
        new Promise<boolean>((resolve) => {
          finishAccess = resolve;
        }),
      authenticate: async () => false,
      openSettings: async () => false,
    };
    const service = new BiometryProtocolService(
      "trusted-partition",
      2,
      "8.0",
      "real",
      effect,
    );
    expect((await service.handle("web_app_biometry_get_info")).status).toBe(
      "applied",
    );
    const pending = service.handle(
      "web_app_biometry_request_access",
      { reason: "Approve" },
      2,
    );
    expect(service.navigate(3).status).toBe("applied");
    finishAccess?.(true);
    expect((await pending).status).toBe("stale");
    expect(
      (await service.handle("web_app_biometry_request_auth", {}, 2)).status,
    ).toBe("stale");
  });
});
