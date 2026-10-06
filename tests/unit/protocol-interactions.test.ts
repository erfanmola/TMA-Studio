import { describe, expect, test } from "bun:test";
import { ClipboardProtocolService } from "../../apps/studio/src/domain/protocol/clipboard";
import {
  DialogFlowManager,
  PopupProtocolService,
} from "../../apps/studio/src/domain/protocol/dialogs";
import { QrProtocolService } from "../../apps/studio/src/domain/protocol/qr";
import catalog from "../../apps/studio/src/domain/protocol/registry.generated.json";

const owned = catalog.events.filter((entry) => entry.ownerCard === "04c");
const popup = {
  title: "Confirm",
  message: "Continue with this action?",
  buttons: [
    { id: "continue", type: "default", text: "Continue" },
    { id: "cancel", type: "cancel" },
  ],
};

describe("Telegram popup, QR and clipboard flows (04c)", () => {
  test("covers each assigned outgoing and incoming registry row", () => {
    expect(owned.map((row) => row.event).sort()).toEqual(
      [
        "clipboard_text_received",
        "popup_closed",
        "qr_text_received",
        "scan_qr_popup_closed",
        "web_app_close_scan_qr_popup",
        "web_app_open_popup",
        "web_app_open_scan_qr_popup",
        "web_app_read_text_from_clipboard",
      ].sort(),
    );
    expect(
      owned.every(
        (row) => row.implemented === false && row.status === "unverified",
      ),
    ).toBe(true);
  });

  test("popup validates SDK payload, enforces one flow and correlates button outcome", () => {
    const manager = new DialogFlowManager(3);
    const popupService = new PopupProtocolService(manager, {
      present: () => "presented",
      close: () => undefined,
    });
    expect(popupService.open(popup, 3).status).toBe("started");
    expect(manager.active).toBe("popup");
    expect(manager.openScanner({ text: "Scan code" }, 3).status).toBe("busy");
    expect(popupService.select("wrong", 3).status).toBe("invalid");
    expect(popupService.select("continue", 3)).toEqual({
      status: "completed",
      replies: [
        { eventType: "popup_closed", eventData: { button_id: "continue" } },
      ],
    });
    expect(manager.active).toBeNull();
  });

  test("popup cancellation, invalid payload, denial and navigation cleanup are explicit", () => {
    const manager = new DialogFlowManager(1);
    expect(manager.openPopup({ message: "" }, 1).status).toBe("invalid");
    expect(
      manager.openPopup(
        { ...popup, buttons: [popup.buttons[0], popup.buttons[0]] },
        1,
      ).status,
    ).toBe("invalid");
    const service = new PopupProtocolService(manager);
    expect(service.open(popup, 1)).toMatchObject({
      status: "denied",
      replies: [{ eventType: "popup_closed", eventData: {} }],
    });
    expect(manager.active).toBeNull();
    let closes = 0;
    const navigationPopup = new PopupProtocolService(manager, {
      present: () => "presented",
      close: () => {
        closes += 1;
      },
    });
    expect(navigationPopup.open(popup, 1).status).toBe("started");
    expect(navigationPopup.navigate(2)).toEqual({
      status: "cancelled",
      replies: [],
    });
    expect(closes).toBe(1);
    expect(manager.selectPopupButton("continue", 1).status).toBe("stale");
    expect(manager.openPopup(popup, 2).status).toBe("started");
    expect(manager.cancel(2)).toMatchObject({
      status: "cancelled",
      replies: [{ eventType: "popup_closed" }],
    });
  });

  test("scanner opens with instruction, forwards text, and closes on cancel", () => {
    const manager = new DialogFlowManager(4);
    const opened: string[] = [];
    let closed = 0;
    const scanner = new QrProtocolService(manager, {
      open: (instruction) => {
        opened.push(instruction ?? "");
        return "opened";
      },
      close: () => {
        closed += 1;
      },
    });
    expect(scanner.open({ text: "Scan this" }, 4).status).toBe("started");
    expect(opened).toEqual(["Scan this"]);
    expect(scanner.scanned("https://example.test", 4)).toEqual({
      status: "completed",
      replies: [
        {
          eventType: "qr_text_received",
          eventData: { data: "https://example.test" },
        },
      ],
    });
    expect(scanner.close(4)).toEqual({ status: "completed", replies: [] });
    expect(scanner.scanned("late", 4).status).toBe("cancelled");
    expect(closed).toBe(1);
  });

  test("scanner denial and cancellation return the SDK close event", () => {
    const manager = new DialogFlowManager(8);
    const scanner = new QrProtocolService(manager);
    expect(scanner.open({}, 8)).toMatchObject({
      status: "denied",
      replies: [{ eventType: "scan_qr_popup_closed", eventData: null }],
    });
    const available = new QrProtocolService(manager, {
      open: () => "opened",
      close: () => undefined,
    });
    expect(available.open({}, 8).status).toBe("started");
    expect(available.cancel(8)).toMatchObject({
      status: "cancelled",
      replies: [{ eventType: "scan_qr_popup_closed", eventData: null }],
    });
    expect(available.open({ text: "x".repeat(65) }, 8).status).toBe("invalid");
  });

  test("scanner navigation closes its effect and suppresses old-page protocol replies", () => {
    const manager = new DialogFlowManager(20);
    let closes = 0;
    const scanner = new QrProtocolService(manager, {
      open: () => "opened",
      close: () => {
        closes += 1;
      },
    });
    expect(scanner.open({}, 20).status).toBe("started");
    expect(scanner.navigate(21)).toEqual({ status: "cancelled", replies: [] });
    expect(manager.active).toBeNull();
    expect(closes).toBe(1);
    expect(scanner.scanned("stale", 20).status).toBe("stale");
  });

  test("clipboard results retain request correlation and denial returns null", () => {
    const seen: string[] = [];
    const clipboard = new ClipboardProtocolService(5, {
      read: (requestId) => {
        seen.push(requestId);
        return "pending";
      },
      cancel: (requestId) => {
        seen.push(`cancel:${requestId}`);
      },
    });
    expect(clipboard.request({ req_id: "0123456789abcdef" }, 5).status).toBe(
      "pending",
    );
    expect(clipboard.request({ req_id: "0123456789abcdef" }, 5).status).toBe(
      "busy",
    );
    expect(clipboard.resolve("0123456789abcdef", "copied text", 5)).toEqual({
      status: "completed",
      replies: [
        {
          eventType: "clipboard_text_received",
          eventData: { req_id: "0123456789abcdef", data: "copied text" },
        },
      ],
    });
    expect(clipboard.resolve("0123456789abcdef", "late", 5).status).toBe(
      "invalid",
    );
    expect(clipboard.pendingCount).toBe(0);
    expect(seen).toEqual(["0123456789abcdef"]);

    const denied = new ClipboardProtocolService(5);
    expect(denied.request({ req_id: "fedcba9876543210" }, 5)).toEqual({
      status: "denied",
      replies: [
        {
          eventType: "clipboard_text_received",
          eventData: { req_id: "fedcba9876543210", data: null },
        },
      ],
    });
    expect(denied.request({ req_id: "not-an-id" }, 5).status).toBe("invalid");
  });

  test("navigation cancels outstanding clipboard work and stale completion is dropped", () => {
    const cancelled: string[] = [];
    const clipboard = new ClipboardProtocolService(9, {
      read: () => "pending",
      cancel: (requestId) => cancelled.push(requestId),
    });
    clipboard.request({ req_id: "abcdefghijklmnop" }, 9);
    expect(clipboard.navigate(10)).toEqual({
      cancelledRequestIds: ["abcdefghijklmnop"],
    });
    expect(cancelled).toEqual(["abcdefghijklmnop"]);
    expect(clipboard.resolve("abcdefghijklmnop", "old page", 9).status).toBe(
      "stale",
    );
    expect(clipboard.pendingCount).toBe(0);
  });
});
