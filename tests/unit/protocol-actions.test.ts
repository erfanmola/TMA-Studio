import { describe, expect, test } from "bun:test";
import {
  LinkProtocolService,
  type UserGestureGate,
} from "../../apps/studio/src/domain/protocol/links";
import { MediaProtocolService } from "../../apps/studio/src/domain/protocol/media";
import { PaymentProtocolService } from "../../apps/studio/src/domain/protocol/payments";
import catalog from "../../apps/studio/src/domain/protocol/registry.generated.json";
import { SharingProtocolService } from "../../apps/studio/src/domain/protocol/sharing";
import type { ProtocolEvent } from "../../apps/studio/src/domain/protocol/transport";

const owned = catalog.events.filter((row) => row.ownerCard === "04g");
const evt = (
  eventType: string,
  eventData: unknown,
  generation = 1,
): ProtocolEvent => ({
  eventType,
  eventData,
  navigationGeneration: generation,
});

describe("Telegram link, media, payment and sharing protocol (04g)", () => {
  test("owns exactly the 11 assigned registry rows and leaves support unverified", () => {
    expect(owned.map((row) => row.event).sort()).toEqual(
      [
        "web_app_data_send",
        "web_app_open_invoice",
        "web_app_open_link",
        "web_app_open_tg_link",
        "web_app_request_file_download",
        "web_app_send_prepared_message",
        "web_app_share_to_story",
        "file_download_requested",
        "invoice_closed",
        "prepared_message_failed",
        "prepared_message_sent",
      ].sort(),
    );
    expect(
      owned.every(
        (row) => row.implemented === false && row.status === "unverified",
      ),
    ).toBe(true);
  });

  test("links reject unsafe input and require a recent trusted gesture", async () => {
    let calls = 0;
    let recent = false;
    const gesture: UserGestureGate = {
      consumeRecentGesture: (ttl) => {
        expect(ttl).toBe(1000);
        return recent;
      },
    };
    const links = new LinkProtocolService("real", 1, "8.0", gesture, {
      openExternal: async () => {
        calls += 1;
        return "opened";
      },
      openTelegramPath: async () => {
        calls += 1;
        return "opened";
      },
    });
    expect(
      (
        await links.handle(
          evt("web_app_open_link", { url: "javascript:alert(1)" }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await links.handle(
          evt("web_app_open_link", { url: "https://user:pass@example.com" }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await links.handle(
          evt("web_app_open_link", {
            url: "https://example.com",
            try_browser: "not-a-browser",
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await links.handle(
          evt("web_app_open_link", { url: "https://example.com" }),
        )
      ).status,
    ).toBe("denied");
    expect(
      (
        await links.handle(
          evt("web_app_open_tg_link", { path_full: "//evil.example/path" }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await links.handle(
          evt("web_app_open_tg_link", { path_full: "/\\evil" }),
        )
      ).status,
    ).toBe("invalid");
    recent = true;
    expect(
      (
        await links.handle(
          evt("web_app_open_link", { url: "https://example.com" }),
        )
      ).status,
    ).toBe("applied");
    expect(calls).toBe(1);
    expect(
      await new LinkProtocolService("real", 1, "6.3", gesture).handle(
        evt("web_app_open_link", { url: "https://example.com" }),
      ),
    ).toMatchObject({ status: "unsupported" });
  });

  test("link completion from a prior navigation is discarded", async () => {
    let resolve!: (result: "opened") => void;
    const service = new LinkProtocolService(
      "real",
      1,
      "8.0",
      { consumeRecentGesture: () => true },
      {
        openExternal: () =>
          new Promise((done) => {
            resolve = done;
          }),
        openTelegramPath: async () => "opened",
      },
    );
    const result = service.handle(
      evt("web_app_open_link", { url: "https://example.com" }),
    );
    service.navigate(2);
    resolve("opened");
    expect((await result).status).toBe("stale");
  });

  test("download reports started only after provider confirms it and validates filename", async () => {
    let calls = 0;
    const service = new MediaProtocolService("real", 1, "8.0", {
      download: async () => {
        calls += 1;
        return "started";
      },
      openStory: async () => "opened",
    });
    expect(
      (
        await service.handle(
          evt("web_app_request_file_download", {
            url: "https://example.com/a",
            file_name: "../secret",
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await service.handle(
          evt("web_app_request_file_download", {
            url: "http://example.com/a",
            file_name: "a.txt",
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      await service.handle(
        evt("web_app_request_file_download", {
          url: "https://example.com/a",
          file_name: "a.txt",
        }),
      ),
    ).toMatchObject({
      status: "applied",
      replies: [
        {
          eventType: "file_download_requested",
          eventData: { status: "downloading" },
        },
      ],
    });
    expect(calls).toBe(1);
    expect(
      await new MediaProtocolService("mock", 1, "8.0").handle(
        evt("web_app_request_file_download", {
          url: "https://example.com/a",
          file_name: "a.txt",
        }),
      ),
    ).toMatchObject({
      status: "unsupported",
      replies: [{ eventData: { status: "cancelled" } }],
    });
  });

  test("story inputs are bounded; opening an editor does not claim publication", async () => {
    let story: unknown;
    const service = new MediaProtocolService("real", 1, "8.0", {
      download: async () => "unsupported",
      openStory: async (value) => {
        story = value;
        return "opened";
      },
    });
    expect(
      (
        await service.handle(
          evt("web_app_share_to_story", {
            media_url: "http://example.com/image",
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await service.handle(
          evt("web_app_share_to_story", {
            media_url: "https://example.com/image",
            text: "x".repeat(2049),
          }),
        )
      ).status,
    ).toBe("invalid");
    expect(
      (
        await service.handle(
          evt("web_app_share_to_story", {
            media_url: "https://example.com/image",
            text: " caption ",
          }),
        )
      ).status,
    ).toBe("applied");
    expect(story).toEqual({
      mediaUrl: "https://example.com/image",
      text: "caption",
    });
  });

  test("invoice slug and paid result are correlated to the injected provider", async () => {
    const mock = new PaymentProtocolService("mock", 1, "8.0");
    expect(
      await mock.handle(evt("web_app_open_invoice", { slug: "../x" })),
    ).toMatchObject({ status: "invalid" });
    expect(
      await mock.handle(evt("web_app_open_invoice", { slug: "x" })),
    ).toMatchObject({
      status: "unsupported",
      replies: [
        {
          eventType: "invoice_closed",
          eventData: { slug: "x", status: "cancelled" },
        },
      ],
    });
    const real = new PaymentProtocolService("real", 1, "8.0", {
      openInvoice: async (slug) => (slug === "paid" ? "paid" : "cancelled"),
    });
    expect(
      await real.handle(evt("web_app_open_invoice", { slug: "paid" })),
    ).toMatchObject({
      status: "applied",
      replies: [{ eventData: { slug: "paid", status: "paid" } }],
    });
    expect(
      (await real.handle(evt("web_app_open_invoice", { slug: "x" }))).replies[0]
        ?.eventData,
    ).toEqual({ slug: "x", status: "cancelled" });
  });

  test("prepared share and sendData require eligible real context, preserving failure outcomes", async () => {
    const mock = new SharingProtocolService("mock", 1, "8.0", true);
    expect(
      await mock.handle(
        evt("web_app_send_prepared_message", { id: "opaque-id" }),
      ),
    ).toMatchObject({
      status: "unsupported",
      replies: [
        {
          eventType: "prepared_message_failed",
          eventData: { error: "UNSUPPORTED" },
        },
      ],
    });
    expect(
      (await mock.handle(evt("web_app_send_prepared_message", { id: " " })))
        .status,
    ).toBe("invalid");
    expect(
      (await mock.handle(evt("web_app_data_send", { data: "x" }))).status,
    ).toBe("unsupported");
    let dataSent = "";
    const real = new SharingProtocolService("real", 1, "8.0", true, {
      sendPreparedMessage: async () => "declined",
      sendDataAndClose: async (data) => {
        dataSent = data;
        return "sent";
      },
    });
    expect(
      await real.handle(evt("web_app_send_prepared_message", { id: "ok_1" })),
    ).toMatchObject({
      status: "denied",
      replies: [
        {
          eventType: "prepared_message_failed",
          eventData: { error: "USER_DECLINED" },
        },
      ],
    });
    expect(
      (await real.handle(evt("web_app_data_send", { data: "hello" }))).status,
    ).toBe("applied");
    expect(dataSent).toBe("hello");
    expect(
      (
        await new SharingProtocolService("real", 1, "8.0", false, {
          sendPreparedMessage: async () => "sent",
          sendDataAndClose: async () => "sent",
        }).handle(evt("web_app_data_send", { data: "x" }))
      ).status,
    ).toBe("unsupported");
  });
});
