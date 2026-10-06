import { describe, expect, test } from "bun:test";
import {
  type PermissionProtocolEffects,
  PermissionProtocolService,
} from "../../apps/studio/src/domain/protocol/permissions";
import catalog from "../../apps/studio/src/domain/protocol/registry.generated.json";
import type { ProtocolEvent } from "../../apps/studio/src/domain/protocol/transport";

const events = catalog.events.filter((entry) => entry.ownerCard === "04d");
const event = (
  eventType: string,
  eventData: unknown = "",
  navigationGeneration = 12,
): ProtocolEvent => ({
  eventType,
  eventData,
  navigationGeneration,
});
const expectReply = (
  result: Awaited<ReturnType<PermissionProtocolService["handle"]>>,
  eventType: string,
  eventData: unknown,
) => {
  expect(result.replies).toEqual([{ eventType, eventData }]);
};

describe("Telegram permission protocol (04d)", () => {
  test("covers every assigned permission and location registry row", () => {
    expect(events.map((row) => row.event).sort()).toEqual(
      [
        "web_app_check_location",
        "web_app_open_location_settings",
        "web_app_request_location",
        "web_app_request_phone",
        "web_app_request_write_access",
        "location_checked",
        "location_requested",
        "phone_requested",
        "write_access_requested",
      ].sort(),
    );
    expect(
      events.every(
        (row) => row.status === "unverified" && row.implemented === false,
      ),
    ).toBe(true);
  });

  test("mock flow returns deterministic denied values without calling host or account effects", async () => {
    let hostCalls = 0;
    const effects: PermissionProtocolEffects = {
      request: async () => {
        hostCalls += 1;
        return { status: "granted", mode: "native" };
      },
      readLocation: async () => {
        hostCalls += 1;
        return { latitude: 1, longitude: 2 };
      },
      openLocationSettings: async () => {
        hostCalls += 1;
        return true;
      },
      requestPhone: async () => {
        hostCalls += 1;
        return "sent";
      },
      requestWriteAccess: async () => {
        hostCalls += 1;
        return "allowed";
      },
    };
    const service = new PermissionProtocolService("mock", 12, "8.0", effects);
    expectReply(
      await service.handle(event("web_app_check_location")),
      "location_checked",
      {
        available: true,
        access_requested: true,
        access_granted: false,
      },
    );
    expectReply(
      await service.handle(event("web_app_open_location_settings")),
      "location_checked",
      {
        available: true,
        access_requested: true,
        access_granted: false,
      },
    );
    expectReply(
      await service.handle(event("web_app_request_location")),
      "location_requested",
      { available: false },
    );
    expectReply(
      await service.handle(event("web_app_request_phone")),
      "phone_requested",
      { status: "cancelled" },
    );
    expectReply(
      await service.handle(event("web_app_request_write_access")),
      "write_access_requested",
      { status: "cancelled" },
    );
    expect(hostCalls).toBe(0);
  });

  test("real location requires a native scoped grant before returning validated coordinates", async () => {
    const effects: PermissionProtocolEffects = {
      request: async (capability) =>
        capability === "location"
          ? { status: "granted", mode: "native" }
          : { status: "unsupported" },
      readLocation: async () =>
        ({
          latitude: 37.7,
          longitude: -122.4,
          altitude: 18,
          course: 90,
          speed: 2,
          horizontal_accuracy: 5,
          phone_number: "+15555550123",
        }) as Awaited<ReturnType<PermissionProtocolEffects["readLocation"]>>,
      openLocationSettings: async () => true,
      requestPhone: async () => "cancelled",
      requestWriteAccess: async () => "cancelled",
    };
    const service = new PermissionProtocolService("real", 12, "8.0", effects);
    expectReply(
      await service.handle(event("web_app_check_location")),
      "location_checked",
      {
        available: true,
        access_requested: true,
        access_granted: true,
      },
    );
    expectReply(
      await service.handle(event("web_app_request_location")),
      "location_requested",
      {
        latitude: 37.7,
        longitude: -122.4,
        altitude: 18,
        course: 90,
        speed: 2,
        horizontal_accuracy: 5,
      },
    );
    expect(
      (await service.handle(event("web_app_open_location_settings"))).status,
    ).toBe("applied");
  });

  test("prompt, denial, simulated grants, missing providers and invalid coordinates fail closed", async () => {
    const prompt = new PermissionProtocolService("real", 12, "8.0", {
      request: async () => ({ status: "prompt" }),
      readLocation: async () => ({ latitude: 99, longitude: 0 }),
      openLocationSettings: async () => false,
      requestPhone: async () => "unsupported",
      requestWriteAccess: async () => "unsupported",
    });
    expectReply(
      await prompt.handle(event("web_app_check_location")),
      "location_checked",
      {
        available: true,
        access_requested: false,
        access_granted: false,
      },
    );
    expectReply(
      await prompt.handle(event("web_app_request_location")),
      "location_requested",
      { available: false },
    );
    expectReply(
      await prompt.handle(event("web_app_open_location_settings")),
      "location_checked",
      {
        available: false,
        access_requested: false,
        access_granted: false,
      },
    );

    const simulated = new PermissionProtocolService("real", 12, "8.0", {
      request: async () => ({ status: "granted", mode: "simulated" }),
      readLocation: async () => ({ latitude: 1, longitude: 2 }),
      openLocationSettings: async () => true,
      requestPhone: async () => "unsupported",
      requestWriteAccess: async () => "unsupported",
    });
    expectReply(
      await simulated.handle(event("web_app_check_location")),
      "location_checked",
      {
        available: true,
        access_requested: true,
        access_granted: false,
      },
    );
    expectReply(
      await simulated.handle(event("web_app_request_location")),
      "location_requested",
      { available: false },
    );
  });

  test("phone and write-access responses model grants and denials without echoing account data", async () => {
    const granted = new PermissionProtocolService("real", 12, "8.0", {
      request: async () => ({ status: "unsupported" }),
      readLocation: async () => null,
      openLocationSettings: async () => false,
      requestPhone: async () => "sent",
      requestWriteAccess: async () => "allowed",
    });
    expectReply(
      await granted.handle(event("web_app_request_phone")),
      "phone_requested",
      { status: "sent" },
    );
    expectReply(
      await granted.handle(event("web_app_request_write_access")),
      "write_access_requested",
      { status: "allowed" },
    );
  });

  test("minimum versions, malformed payloads and stale generations never invoke effects", async () => {
    let calls = 0;
    const service = new PermissionProtocolService("real", 12, "7.6", {
      request: async () => {
        calls += 1;
        return { status: "granted", mode: "native" };
      },
      readLocation: async () => {
        calls += 1;
        return null;
      },
      openLocationSettings: async () => {
        calls += 1;
        return true;
      },
      requestPhone: async () => {
        calls += 1;
        return "sent";
      },
      requestWriteAccess: async () => {
        calls += 1;
        return "allowed";
      },
    });
    expect(
      (await service.handle(event("web_app_request_location"))).status,
    ).toBe("unsupported");
    expectReply(
      await service.handle(event("web_app_request_phone")),
      "phone_requested",
      { status: "sent" },
    );
    expect(
      (await service.handle(event("web_app_check_location", {}, 12))).status,
    ).toBe("invalid");
    expect(
      (await service.handle(event("web_app_check_location", "", 11))).status,
    ).toBe("stale");
    expect(calls).toBe(1);
  });
});
