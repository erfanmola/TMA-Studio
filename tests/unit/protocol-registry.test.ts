import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  INCOMING_EVENTS,
  OUTGOING_EVENTS,
} from "../../apps/studio/src/domain/protocol/events.generated";
import {
  initialProtocolState,
  reduceProtocolEvent,
} from "../../apps/studio/src/domain/protocol/reducer";
import { TELEGRAM_PROTOCOL_REGISTRY } from "../../apps/studio/src/domain/protocol/registry";
import {
  createNativeDocumentStartBridge,
  decodeNativePostEvent,
  encodeNativePostEvent,
  type NativeGuestProtocolChannel,
  NativeProtocolTransport,
  PostMessageProtocolTransport,
  type PostMessageTarget,
} from "../../apps/studio/src/domain/protocol/transport";

const sdkPath = "tests/fixtures/official-telegram-sdk/telegram-web-app.js";

describe("Telegram protocol inventory and transports", () => {
  test("assigns every pinned event once and leaves support unverified", () => {
    const { events, sourceSdkSha256, countsByDirection, countsByOwner } =
      TELEGRAM_PROTOCOL_REGISTRY;
    expect(events).toHaveLength(122);
    expect(countsByDirection).toEqual({ outgoing: 64, incoming: 58 });
    expect(new Set(events.map(({ id }) => id)).size).toBe(122);
    expect(
      new Set(events.map(({ direction, event }) => `${direction}:${event}`))
        .size,
    ).toBe(122);
    expect(
      events.every(
        (event) => event.status === "unverified" && !event.implemented,
      ),
    ).toBe(true);
    expect(
      events.every(
        (event) =>
          event.mockPolicy === "unsupported" &&
          event.realPolicy === "unsupported",
      ),
    ).toBe(true);
    expect(
      events.every(
        (event) =>
          Object.keys(event.profiles).length === 6 &&
          Object.values(event.profiles).every(
            (profile) => profile.status === "unverified",
          ),
      ),
    ).toBe(true);
    expect(
      events.every(
        (event) =>
          event.testIds.length === 7 &&
          event.sourceIds[0]?.startsWith("https://"),
      ),
    ).toBe(true);
    expect(
      Object.values(countsByOwner).reduce((total, count) => total + count, 0),
    ).toBe(122);
    expect(JSON.stringify(TELEGRAM_PROTOCOL_REGISTRY)).not.toContain("/Users/");
    const actualHash = createHash("sha256")
      .update(readFileSync(sdkPath))
      .digest("hex");
    expect(actualHash).toBe(sourceSdkSha256);
  });

  test("generates direction unions from the inventory", () => {
    expect(OUTGOING_EVENTS).toHaveLength(64);
    expect(INCOMING_EVENTS).toHaveLength(58);
    expect(OUTGOING_EVENTS).toContain("web_app_ready");
    expect(INCOMING_EVENTS).toContain("viewport_changed");
  });

  test("decodes only current-generation registered native requests", () => {
    const raw = encodeNativePostEvent("web_app_ready", {});
    expect(JSON.parse(raw)).toEqual({
      eventType: "web_app_ready",
      eventData: {},
    });
    expect(
      JSON.parse(encodeNativePostEvent("web_app_close", undefined)),
    ).toEqual({
      eventType: "web_app_close",
      eventData: null,
    });
    expect(decodeNativePostEvent(raw, 4, 4)).toEqual({
      eventType: "web_app_ready",
      eventData: {},
      navigationGeneration: 4,
    });
    expect(decodeNativePostEvent(raw, 3, 4)).toBeNull();
    expect(() => encodeNativePostEvent("made_up_event", null)).toThrow();
    expect(
      decodeNativePostEvent(
        '{"eventType":"made_up_event","eventData":null}',
        4,
        4,
      ),
    ).toBeNull();
    let deep: unknown = null;
    for (let depth = 0; depth < 40; depth += 1) deep = { child: deep };
    expect(() => encodeNativePostEvent("web_app_ready", deep)).toThrow(
      "bounded JSON",
    );
    expect(
      decodeNativePostEvent(
        JSON.stringify({ eventType: "web_app_ready", eventData: deep }),
        4,
        4,
      ),
    ).toBeNull();
  });

  test("native document-start bridge exposes only the Telegram postEvent contract", () => {
    const bridge = createNativeDocumentStartBridge();
    expect(bridge).toContain("TelegramWebviewProxy");
    expect(bridge).toContain("TelegramGameProxy_receiveEvent");
    expect(bridge).not.toContain("__bunium");
    expect(bridge).not.toContain("window.external");
    expect(bridge).toContain("configurable: false");
  });

  test("document-start bridge sends bounded native envelopes and receives replies", () => {
    const received: Array<[string, unknown]> = [];
    const windowFixture = {
      TelegramGameProxy_receiveEvent(eventType: string, eventData: unknown) {
        received.push([eventType, eventData]);
      },
    };
    const factory = runInNewContext(
      `(function (post) {${createNativeDocumentStartBridge()}})`,
      { window: windowFixture },
    ) as (post: (raw: string) => void) => (raw: string) => boolean;
    const sent: string[] = [];
    const receive = factory((raw) => sent.push(raw));
    const proxy = (
      windowFixture as typeof windowFixture & {
        TelegramWebviewProxy?: {
          postEvent(eventType: string, data: string): boolean;
        };
      }
    ).TelegramWebviewProxy;
    if (!proxy) throw new Error("Native Telegram transport was not installed.");
    expect(proxy.postEvent("web_app_ready", JSON.stringify({}))).toBe(true);
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({
      eventType: "web_app_ready",
      eventData: {},
    });
    expect(proxy.postEvent("web_app_ready", "not-json")).toBe(false);
    let deep: unknown = null;
    for (let depth = 0; depth < 40; depth += 1) deep = { child: deep };
    expect(proxy.postEvent("web_app_ready", JSON.stringify(deep))).toBe(false);
    expect(
      receive(
        JSON.stringify({
          eventType: "viewport_changed",
          eventData: { height: 720 },
        }),
      ),
    ).toBe(true);
    expect(
      receive(
        JSON.stringify({ eventType: "viewport_changed", eventData: deep }),
      ),
    ).toBe(false);
    expect(receive("not-json")).toBe(false);
    expect(received).toEqual([["viewport_changed", { height: 720 }]]);
  });

  test("postMessage transport pins origin, source, and navigation generation", () => {
    const sent: Array<{ message: string; origin: string }> = [];
    const target: PostMessageTarget = {
      postMessage(message, targetOrigin) {
        sent.push({ message, origin: targetOrigin });
      },
    };
    const source = {};
    let generation = 8;
    const transport = new PostMessageProtocolTransport(
      target,
      source,
      "https://mini.example",
      8,
      () => generation,
    );
    expect(transport.postEvent("viewport_changed", { height: 600 })).toBe(true);
    expect(sent[0]?.origin).toBe("https://mini.example");
    const received: string[] = [];
    const event = {
      source,
      origin: "https://mini.example",
      data: encodeNativePostEvent("web_app_ready", {}),
    };
    expect(
      transport.receive(event, (message) => received.push(message.eventType)),
    ).toBe(true);
    expect(transport.receive({ ...event, source: {} }, () => undefined)).toBe(
      false,
    );
    expect(
      transport.receive(
        { ...event, origin: "https://attacker.example" },
        () => undefined,
      ),
    ).toBe(false);
    generation += 1;
    expect(transport.receive(event, () => undefined)).toBe(false);
    expect(transport.postEvent("viewport_changed", {})).toBe(false);
    expect(received).toEqual(["web_app_ready"]);
    expect(
      () =>
        new PostMessageProtocolTransport(
          target,
          source,
          "https://mini.example/path",
          8,
          () => 8,
        ),
    ).toThrow();
  });

  test("native transport drops stale guest messages and sends only registered replies", () => {
    let generation = 5;
    let inbound:
      | ((message: {
          data: string;
          navigationGeneration: number;
          simulatorId: string;
        }) => void)
      | undefined;
    const posted: string[] = [];
    const guest = {
      get navigationGeneration() {
        return generation;
      },
      onInbound(listener: typeof inbound) {
        inbound = listener;
        return () => {
          inbound = undefined;
        };
      },
      postToGuest(targetGeneration: number, data: string) {
        if (targetGeneration !== generation) return false;
        posted.push(data);
        return true;
      },
    } as NativeGuestProtocolChannel;
    const transport = new NativeProtocolTransport(guest);
    const events: string[] = [];
    const unsubscribe = transport.subscribe((event) =>
      events.push(event.eventType),
    );
    inbound?.({
      data: encodeNativePostEvent("web_app_ready", {}),
      navigationGeneration: 5,
      simulatorId: "trusted-host-tag",
    });
    inbound?.({
      data: encodeNativePostEvent("web_app_ready", {}),
      navigationGeneration: 4,
      simulatorId: "guest-forged-tag",
    });
    expect(events).toEqual(["web_app_ready"]);
    expect(transport.postEvent("viewport_changed", { height: 700 })).toBe(true);
    expect(JSON.parse(posted[0] ?? "{}")).toEqual({
      eventType: "viewport_changed",
      eventData: { height: 700 },
    });
    expect(() => transport.postEvent("web_app_ready", {})).toThrow();
    unsubscribe();
    generation += 1;
  });

  test("reducer drops stale rows and never turns inventory into success", () => {
    const state = initialProtocolState(12);
    const current = {
      eventType: "web_app_ready",
      eventData: null,
      navigationGeneration: 12,
    };
    const result = reduceProtocolEvent(state, current, {
      profile: "android",
      clientVersion: "9.0",
    });
    expect(result.decision).toEqual({
      status: "unverified",
      eventId: "TG-OUT-028",
      ownerCard: "04b",
    });
    expect(result.state.lastEventId).toBe("TG-OUT-028");
    expect(
      reduceProtocolEvent(
        state,
        { ...current, navigationGeneration: 11 },
        { profile: "android" },
      ).decision,
    ).toEqual({ status: "stale" });
    expect(
      reduceProtocolEvent(
        state,
        { ...current, eventType: "not_registered" },
        { profile: "android" },
      ).decision,
    ).toEqual({ status: "unknown-event" });
    expect(
      reduceProtocolEvent(
        state,
        { ...current, eventType: "web_app_request_chat" },
        { profile: "ios", clientVersion: "9.5" },
      ).decision,
    ).toEqual({
      status: "unsupported-version",
      eventId: "TG-OUT-029",
      minimumVersion: "9.6",
    });
  });
});
