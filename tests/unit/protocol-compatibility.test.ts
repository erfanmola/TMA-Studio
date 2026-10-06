import { describe, expect, test } from "bun:test";
import {
  CompatibilityProtocolService,
  isOAuthDeepLink,
  OAuthBroker,
  type OAuthResultContext,
  validate04hIncoming,
} from "../../apps/studio/src/domain/protocol/compatibility";
import { HomeScreenProtocolService } from "../../apps/studio/src/domain/protocol/home-screen";
import {
  type ProfileActionEffects,
  ProfileActionProtocolService,
} from "../../apps/studio/src/domain/protocol/profile-actions";
import catalog from "../../apps/studio/src/domain/protocol/registry.generated.json";
import type { ProtocolEvent } from "../../apps/studio/src/domain/protocol/transport";

const expected = [
  "web_app_add_to_home_screen",
  "web_app_check_home_screen",
  "web_app_invoke_custom_method",
  "web_app_request_chat",
  "web_app_request_emoji_status_access",
  "web_app_set_emoji_status",
  "web_app_setup_closing_behavior",
  "web_app_setup_swipe_behavior",
  "web_app_switch_inline_query",
  "custom_method_invoked",
  "emoji_status_access_requested",
  "emoji_status_failed",
  "emoji_status_set",
  "home_screen_added",
  "home_screen_checked",
  "home_screen_failed",
  "reload_iframe",
  "requested_chat_failed",
  "requested_chat_sent",
  "set_custom_style",
].sort();
const rows = catalog.events.filter((row) => row.ownerCard === "04h");
const event = (
  eventType: string,
  eventData: unknown,
  generation = 4,
): ProtocolEvent => ({
  eventType,
  eventData,
  navigationGeneration: generation,
});

describe("Telegram profile and compatibility protocols (04h)", () => {
  test("covers all 20 assigned rows without changing unverified profile claims", () => {
    expect(rows.map((row) => row.event).sort()).toEqual(expected);
    expect(
      rows.every(
        (row) => row.status === "unverified" && row.implemented === false,
      ),
    ).toBe(true);
  });

  test("closing and swipe settings validate exact payloads and persist only session state", async () => {
    const profile = new ProfileActionProtocolService("mock", 4, "9.6");
    expect(
      await profile.handle(
        event("web_app_setup_closing_behavior", { need_confirmation: true }),
      ),
    ).toMatchObject({ status: "simulated" });
    expect(profile.closeConfirmationRequired).toBe(true);
    expect(
      (
        await profile.handle(
          event("web_app_setup_closing_behavior", {
            need_confirmation: true,
            other: false,
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      await profile.handle(
        event("web_app_setup_swipe_behavior", { allow_vertical_swipe: false }),
      ),
    ).toMatchObject({ status: "simulated" });
    expect(profile.allowVerticalSwipes).toBe(false);
  });

  test("inline query checks allowed chat types and does not claim an unsupported navigation", async () => {
    let forwarded: unknown;
    const effects: ProfileActionEffects = {
      requestChat: async () => ({ status: "cancelled" }),
      requestEmojiStatusAccess: async () => "cancelled",
      setEmojiStatus: async () => "cancelled",
      switchInlineQuery: async (input) => {
        forwarded = input;
        return "opened";
      },
    };
    const profile = new ProfileActionProtocolService(
      "real",
      4,
      "9.6",
      undefined,
      effects,
    );
    expect(
      (
        await profile.handle(
          event("web_app_switch_inline_query", {
            query: "cats",
            chat_types: ["users", "bad"],
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await profile.handle(
          event("web_app_switch_inline_query", {
            query: "x".repeat(257),
            chat_types: [],
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      await profile.handle(
        event("web_app_switch_inline_query", {
          query: "cats",
          chat_types: ["users", "channels"],
        }),
      ),
    ).toMatchObject({ status: "applied" });
    expect(forwarded).toEqual({
      query: "cats",
      chatTypes: ["users", "channels"],
    });
    expect(
      (
        await new ProfileActionProtocolService("mock", 4, "9.6").handle(
          event("web_app_switch_inline_query", { query: "", chat_types: [] }),
        )
      ).status,
    ).toBe("unsupported");
  });

  test("emoji permissions/status require recent gestures and preserve Telegram outcomes", async () => {
    let recent = false;
    const effects: ProfileActionEffects = {
      requestChat: async () => ({ status: "cancelled" }),
      requestEmojiStatusAccess: async () => "allowed",
      setEmojiStatus: async () => "set",
      switchInlineQuery: async () => "unsupported",
    };
    const profile = new ProfileActionProtocolService(
      "real",
      4,
      "9.6",
      {
        consumeRecentGesture: (ttl) => {
          expect(ttl).toBe(10_000);
          return recent;
        },
      },
      effects,
    );
    expect(
      (await profile.handle(event("web_app_request_emoji_status_access", "")))
        .replies,
    ).toEqual([
      {
        eventType: "emoji_status_access_requested",
        eventData: { status: "cancelled" },
      },
    ]);
    expect(
      (
        await profile.handle(
          event("web_app_set_emoji_status", { custom_emoji_id: "123" }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ error: "USER_DECLINED" });
    expect(
      (
        await profile.handle(
          event("web_app_set_emoji_status", {
            custom_emoji_id: "bad",
            duration: -1,
          }),
        )
      ).status,
    ).toBe("invalid");
    recent = true;
    expect(
      await profile.handle(event("web_app_request_emoji_status_access", null)),
    ).toMatchObject({
      status: "applied",
      replies: [{ eventData: { status: "allowed" } }],
    });
    expect(
      await profile.handle(
        event("web_app_set_emoji_status", {
          custom_emoji_id: "12345678901234567890",
          duration: 0,
        }),
      ),
    ).toMatchObject({
      status: "applied",
      replies: [{ eventType: "emoji_status_set", eventData: null }],
    });
    expect(
      (
        await new ProfileActionProtocolService("mock", 4, "9.6").handle(
          event("web_app_set_emoji_status", { custom_emoji_id: "123" }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ error: "UNSUPPORTED" });
  });

  test("requestChat matches opaque bot request IDs, denies duplicate active work and drops stale replies", async () => {
    let finish!: (value: { status: "sent" }) => void;
    let aborted = false;
    const effects: ProfileActionEffects = {
      requestChat: (_id, signal) => {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      requestEmojiStatusAccess: async () => "cancelled",
      setEmojiStatus: async () => "cancelled",
      switchInlineQuery: async () => "unsupported",
    };
    const profile = new ProfileActionProtocolService(
      "real",
      4,
      "9.6",
      { consumeRecentGesture: () => true },
      effects,
    );
    const pending = profile.handle(
      event("web_app_request_chat", { req_id: "prepared-request-1" }),
    );
    expect(
      (
        await profile.handle(
          event("web_app_request_chat", { req_id: "prepared-request-2" }),
        )
      ).status,
    ).toBe("denied");
    profile.navigate(5);
    expect(aborted).toBe(true);
    finish({ status: "sent" });
    expect((await pending).status).toBe("denied");
    expect(
      (await profile.handle(event("web_app_request_chat", { req_id: "" }, 5)))
        .status,
    ).toBe("invalid");
  });

  test("home-screen status always answers with a real known status, add is gesture-gated", async () => {
    let recent = false;
    let adds = 0;
    const home = new HomeScreenProtocolService(
      "real",
      4,
      "9.6",
      {
        consumeRecentGesture: (ttl) => {
          expect(ttl).toBe(10_000);
          return recent;
        },
      },
      {
        add: async () => {
          adds += 1;
          return "added";
        },
        status: async () => "missed",
      },
    );
    expect(
      await home.handle(event("web_app_check_home_screen", "")),
    ).toMatchObject({
      replies: [
        { eventType: "home_screen_checked", eventData: { status: "missed" } },
      ],
    });
    expect(
      (await home.handle(event("web_app_add_to_home_screen", ""))).status,
    ).toBe("denied");
    expect(adds).toBe(0);
    recent = true;
    expect(
      await home.handle(event("web_app_add_to_home_screen", "")),
    ).toMatchObject({
      replies: [{ eventType: "home_screen_added", eventData: null }],
    });
    expect(
      await new HomeScreenProtocolService("mock", 4, "9.6").handle(
        event("web_app_check_home_screen", null),
      ),
    ).toMatchObject({
      status: "unsupported",
      replies: [{ eventData: { status: "unsupported" } }],
    });
    expect(
      (await home.handle(event("web_app_check_home_screen", { extra: true })))
        .status,
    ).toBe("invalid");
  });

  test("home-screen add aborts its provider when navigation changes", async () => {
    let aborted = false;
    let finish!: (value: "added") => void;
    const home = new HomeScreenProtocolService(
      "real",
      4,
      "9.6",
      { consumeRecentGesture: () => true },
      {
        add: (_signal) =>
          new Promise((resolve) => {
            finish = resolve;
            _signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
        status: async () => "unknown",
      },
    );
    const pending = home.handle(event("web_app_add_to_home_screen", ""));
    home.navigate(5);
    expect(aborted).toBe(true);
    finish("added");
    expect((await pending).status).toBe("stale");
  });

  test("custom methods delegate only to injected providers and retain request correlation", async () => {
    let invoked: unknown;
    const compatibility = new CompatibilityProtocolService("real", 4, "9.6", {
      invoke: async ({ method, params }) => {
        invoked = { method, params };
        return { status: "ok", result: { ok: true } };
      },
    });
    expect(
      await compatibility.handle(
        event("web_app_invoke_custom_method", {
          req_id: "abcdefghijklmnop",
          method: "account.test",
          params: { value: 1 },
        }),
      ),
    ).toMatchObject({
      status: "applied",
      replies: [
        {
          eventType: "custom_method_invoked",
          eventData: { req_id: "abcdefghijklmnop", result: { ok: true } },
        },
      ],
    });
    expect(invoked).toEqual({ method: "account.test", params: { value: 1 } });
    expect(
      (
        await compatibility.handle(
          event("web_app_invoke_custom_method", {
            req_id: "bad",
            method: "account.test",
            params: {},
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      await new CompatibilityProtocolService("real", 4, "9.6").handle(
        event("web_app_invoke_custom_method", {
          req_id: "abcdefghijklmnop",
          method: "account.test",
          params: {},
        }),
      ),
    ).toMatchObject({
      status: "unsupported",
      replies: [
        { eventData: { req_id: "abcdefghijklmnop", error: "UNSUPPORTED" } },
      ],
    });
    const cloud = new CompatibilityProtocolService(
      "mock",
      4,
      "9.6",
      undefined,
      {
        invokeCloud: async (request) => {
          expect(request).toEqual({ method: "getStorageKeys", params: {} });
          return { status: "simulated", value: ["key"] };
        },
      },
    );
    expect(
      await cloud.handle(
        event("web_app_invoke_custom_method", {
          req_id: "fedcba9876543210",
          method: "getStorageKeys",
          params: {},
        }),
      ),
    ).toMatchObject({
      status: "simulated",
      replies: [{ eventData: { result: ["key"] } }],
    });
  });

  test("compatibility adapter rejects unsafe legacy styling/reload and stale generations", async () => {
    const service = new CompatibilityProtocolService("real", 4, "9.6");
    expect((await service.handle(event("reload_iframe", "", 4))).status).toBe(
      "unsupported",
    );
    expect(
      (await service.handle(event("reload_iframe", { url: "https://evil" }, 4)))
        .status,
    ).toBe("invalid");
    expect(
      (await service.handle(event("set_custom_style", "body{color:red}", 4)))
        .status,
    ).toBe("unsupported");
    expect(
      (await service.handle(event("set_custom_style", "x".repeat(16_385), 4)))
        .status,
    ).toBe("invalid");
    service.navigate(5);
    expect((await service.handle(event("reload_iframe", "", 4))).status).toBe(
      "stale",
    );
  });

  test("incoming contracts validate every assigned reply and reject malformed shapes", () => {
    const valid: Record<string, unknown> = {
      custom_method_invoked: { req_id: "abcdefghijklmnop", result: null },
      emoji_status_access_requested: { status: "cancelled" },
      emoji_status_failed: { error: "USER_DECLINED" },
      emoji_status_set: null,
      home_screen_added: null,
      home_screen_checked: { status: "unknown" },
      home_screen_failed: { error: "UNSUPPORTED" },
      reload_iframe: "",
      requested_chat_failed: { req_id: "opaque", error: "USER_DECLINED" },
      requested_chat_sent: { req_id: "opaque" },
      set_custom_style: "",
    };
    for (const name of [
      "custom_method_invoked",
      "emoji_status_access_requested",
      "emoji_status_failed",
      "emoji_status_set",
      "home_screen_added",
      "home_screen_checked",
      "home_screen_failed",
      "reload_iframe",
      "requested_chat_failed",
      "requested_chat_sent",
      "set_custom_style",
    ])
      expect(validate04hIncoming(name, valid[name])).toBe(true);
    expect(
      validate04hIncoming("home_screen_checked", { status: "maybe" }),
    ).toBe(false);
    expect(
      validate04hIncoming("emoji_status_failed", { error: "SECRET_VALUE" }),
    ).toBe(false);
    expect(
      validate04hIncoming("custom_method_invoked", {
        req_id: "wrong",
        result: {},
      }),
    ).toBe(false);
  });

  test("OAuth stays unadvertised without a provider and deep links are narrowly validated", async () => {
    const secretLink = "tg://oauth?token=private-secret";
    expect(isOAuthDeepLink(secretLink)).toBe(true);
    expect(isOAuthDeepLink("https://evil.example/oauth?startapp=token")).toBe(
      false,
    );
    expect(isOAuthDeepLink("https://t.me/oauth?startapp=")).toBe(false);
    expect(isOAuthDeepLink("https://t.me:9443/oauth?startapp=token")).toBe(
      false,
    );
    const context = oauthContext();
    const unsupported = await new OAuthBroker().handle(
      { url: secretLink },
      context,
    );
    expect(unsupported).toEqual({ status: "unsupported", replies: [] });
    expect(JSON.stringify(unsupported)).not.toContain("private-secret");
    expect(
      (
        await new OAuthBroker({
          request: async () => ({ status: "cancelled" }),
        }).handle(
          { url: secretLink },
          { ...context, origin: "http://mini.example" },
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await new OAuthBroker({
          request: async () => ({ status: "cancelled" }),
        }).handle(
          { url: secretLink },
          {
            ...context,
            origin: "http://localhost",
            currentOriginValue: "http://localhost",
          },
        )
      ).status,
    ).toBe("denied");
    expect(
      (
        await new OAuthBroker({
          request: async () => ({ status: "confirmed", resultUrl: null }),
        }).handle(
          { url: secretLink },
          { ...context, origin: "https://evil.example" },
        )
      ).status,
    ).toBe("invalid");
  });

  test("OAuth correlation is origin-bound; cancellation and changed origins suppress result secrets", async () => {
    const context = oauthContext();
    let signal: AbortSignal | undefined;
    const broker = new OAuthBroker({
      request: async (_deepLink, origin, passedSignal) => {
        expect(origin).toBe("https://mini.example");
        signal = passedSignal;
        return {
          status: "confirmed",
          resultUrl: "tg://authorize?token=returned-only-to-guest",
        };
      },
    });
    const result = await broker.handle(
      { url: "https://t.me/oauth?startapp=private-token" },
      context,
    );
    expect(result).toMatchObject({
      status: "applied",
      replies: [
        { eventType: "oauth_supported", eventData: { version: 1 } },
        {
          eventType: "oauth_result_confirmed",
          eventData: {
            result_url: "tg://authorize?token=returned-only-to-guest",
          },
        },
      ],
    });
    expect(signal?.aborted).toBe(false);

    let release!: (value: {
      status: "confirmed";
      resultUrl: string | null;
    }) => void;
    const changed = oauthContext();
    const changedBroker = new OAuthBroker({
      request: async () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const started = changedBroker.begin(
      { url: "tg://oauth?token=secret" },
      changed,
    );
    expect(started.replies).toEqual([
      { eventType: "oauth_supported", eventData: { version: 1 } },
    ]);
    await Promise.resolve();
    changed.currentOriginValue = "https://other.example";
    release({ status: "confirmed", resultUrl: "secret-result" });
    expect((await started.completion).status).toBe("stale");

    let cancellationObserved = false;
    const cancelledContext = oauthContext();
    const cancelBroker = new OAuthBroker({
      request: (_url, _origin, cancelSignal) =>
        new Promise((resolve) => {
          if (cancelSignal.aborted) {
            cancellationObserved = true;
            resolve({ status: "cancelled" });
            return;
          }
          cancelSignal.addEventListener("abort", () => {
            cancellationObserved = true;
            resolve({ status: "cancelled" });
          });
        }),
    });
    const cancelStarted = cancelBroker.begin(
      { url: "tg://oauth?token=private" },
      cancelledContext,
    );
    expect(cancelBroker.cancel(cancelledContext.requestId)).toBe(true);
    await Promise.resolve();
    expect(
      (await cancelStarted.completion).replies.some((reply) =>
        JSON.stringify(reply.eventData).includes("private"),
      ),
    ).toBe(false);
    expect(cancellationObserved).toBe(true);
  });
});

function oauthContext(): OAuthResultContext & { currentOriginValue: string } {
  const context: OAuthResultContext & { currentOriginValue: string } = {
    requestId: "oauth-internal-1",
    navigationGeneration: 4,
    origin: "https://mini.example",
    currentOriginValue: "https://mini.example",
    currentOrigin() {
      return this.currentOriginValue;
    },
    currentNavigationGeneration() {
      return this.navigationGeneration;
    },
  };
  return context;
}
