import { expect, test } from "@playwright/test";

test("official Telegram SDK applies core theme, viewport and safe-area CSS", async ({
  page,
}) => {
  await page.setContent(
    "<!doctype html><html><head></head><body></body></html>",
  );
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    Object.assign(window, {
      __sdkEvents: [] as Array<{ eventType: string; eventData: unknown }>,
      TelegramWebviewProxy: {
        postEvent(eventType: string, eventDataJson: string) {
          (
            window as typeof window & {
              __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
            }
          ).__sdkEvents.push({
            eventType,
            eventData: JSON.parse(eventDataJson),
          });
        },
      },
    });
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  await page.evaluate(() => {
    const receive = (
      window as typeof window & {
        TelegramGameProxy_receiveEvent: (
          eventType: string,
          eventData: unknown,
        ) => void;
      }
    ).TelegramGameProxy_receiveEvent;
    receive("theme_changed", {
      theme_params: { bg_color: "#121212", text_color: "#eeeeee" },
    });
    receive("viewport_changed", {
      height: 700,
      is_expanded: true,
      is_state_stable: false,
    });
    receive("safe_area_changed", { top: 24, right: 4, bottom: 12, left: 4 });
    receive("content_safe_area_changed", {
      top: 26,
      right: 4,
      bottom: 14,
      left: 4,
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          scheme: style.getPropertyValue("--tg-color-scheme").trim(),
          background: style.getPropertyValue("--tg-theme-bg-color").trim(),
          text: style.getPropertyValue("--tg-theme-text-color").trim(),
          viewport: style.getPropertyValue("--tg-viewport-height").trim(),
          stableViewport: style
            .getPropertyValue("--tg-viewport-stable-height")
            .trim(),
          safeTop: style.getPropertyValue("--tg-safe-area-inset-top").trim(),
          contentTop: style
            .getPropertyValue("--tg-content-safe-area-inset-top")
            .trim(),
        };
      }),
    )
    .toEqual({
      scheme: "dark",
      background: "#121212",
      text: "#eeeeee",
      viewport: "700px",
      stableViewport: "100vh",
      safeTop: "24px",
      contentTop: "26px",
    });
});

test("official Telegram SDK link, download, invoice and sharing payloads match the assigned protocol", async ({
  page,
}) => {
  await page.setContent(
    "<!doctype html><html><head></head><body></body></html>",
  );
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    Object.assign(window, {
      __sdkEvents: [] as Array<{ eventType: string; eventData: unknown }>,
      TelegramWebviewProxy: {
        postEvent(eventType: string, eventDataJson: string) {
          (
            window as typeof window & {
              __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
            }
          ).__sdkEvents.push({
            eventType,
            eventData: JSON.parse(eventDataJson),
          });
        },
      },
    });
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  const observed = await page.evaluate(() => {
    const webApp = (
      window as typeof window & {
        Telegram: {
          WebApp: {
            openLink(
              url: string,
              options: { try_instant_view: boolean; try_browser: string },
            ): void;
            openTelegramLink(
              url: string,
              options: { force_request: boolean },
            ): void;
            openInvoice(url: string, callback: (status: string) => void): void;
            downloadFile(
              params: { url: string; file_name: string },
              callback: (downloading: boolean) => void,
            ): void;
            shareToStory(
              url: string,
              params: { text: string; widget_link: { url: string } },
            ): void;
            shareMessage(id: string, callback: (sent: boolean) => void): void;
            sendData(data: string): void;
          };
        };
      }
    ).Telegram.WebApp;
    const state = window as typeof window & {
      __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
      invoiceStatus?: string;
      downloadStatus?: boolean;
      shareStatus?: boolean;
      TelegramGameProxy_receiveEvent(eventType: string, data: unknown): void;
    };
    webApp.openLink("https://example.com/article", {
      try_instant_view: true,
      try_browser: "chrome",
    });
    webApp.openTelegramLink("https://t.me/example/path?q=1", {
      force_request: true,
    });
    webApp.openInvoice("https://t.me/$invoice_1", (status: string) => {
      state.invoiceStatus = status;
    });
    webApp.downloadFile(
      { url: "https://example.com/file.zip", file_name: "file.zip" },
      (downloading: boolean) => {
        state.downloadStatus = downloading;
      },
    );
    webApp.shareToStory("https://example.com/story.jpg", {
      text: "Caption",
      widget_link: { url: "https://example.com" },
    });
    webApp.shareMessage("prepared.id_1", (sent: boolean) => {
      state.shareStatus = sent;
    });
    webApp.sendData("payload");
    const receive = state.TelegramGameProxy_receiveEvent;
    receive("invoice_closed", { slug: "invoice_1", status: "paid" });
    receive("file_download_requested", { status: "cancelled" });
    receive("prepared_message_failed", { error: "USER_DECLINED" });
    return {
      events: state.__sdkEvents.filter((event) =>
        [
          "web_app_open_link",
          "web_app_open_tg_link",
          "web_app_open_invoice",
          "web_app_request_file_download",
          "web_app_share_to_story",
          "web_app_send_prepared_message",
          "web_app_data_send",
        ].includes(event.eventType),
      ),
      invoiceStatus: state.invoiceStatus,
      downloadStatus: state.downloadStatus,
      shareStatus: state.shareStatus,
    };
  });
  expect(observed.events).toEqual([
    {
      eventType: "web_app_open_link",
      eventData: {
        url: "https://example.com/article",
        try_instant_view: true,
        try_browser: "chrome",
      },
    },
    {
      eventType: "web_app_open_tg_link",
      eventData: { path_full: "/example/path?q=1", force_request: true },
    },
    { eventType: "web_app_open_invoice", eventData: { slug: "invoice_1" } },
    {
      eventType: "web_app_request_file_download",
      eventData: { url: "https://example.com/file.zip", file_name: "file.zip" },
    },
    {
      eventType: "web_app_share_to_story",
      eventData: {
        media_url: "https://example.com/story.jpg",
        text: "Caption",
        widget_link: { url: "https://example.com/" },
      },
    },
    {
      eventType: "web_app_send_prepared_message",
      eventData: { id: "prepared.id_1" },
    },
    { eventType: "web_app_data_send", eventData: { data: "payload" } },
  ]);
  expect(observed.invoiceStatus).toBe("paid");
  expect(observed.downloadStatus).toBe(false);
  expect(observed.shareStatus).toBe(false);
});

test("official Telegram SDK profile and compatibility events keep their wire shapes", async ({
  page,
}) => {
  await page.setContent(
    "<!doctype html><html><head></head><body></body></html>",
  );
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=9.6&tgWebAppPlatform=android&tgWebAppBotInline=1",
    );
    Object.assign(window, {
      __sdkEvents: [] as Array<{ eventType: string; eventData: unknown }>,
      callbacks: {} as Record<string, unknown>,
      TelegramWebviewProxy: {
        postEvent(eventType: string, eventDataJson: string) {
          (
            window as typeof window & {
              __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
            }
          ).__sdkEvents.push({
            eventType,
            eventData: eventDataJson ? JSON.parse(eventDataJson) : null,
          });
        },
      },
    });
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  const observed = await page.evaluate(() => {
    type Event = { eventType: string; eventData: unknown };
    type WebApp = {
      enableClosingConfirmation(): void;
      disableClosingConfirmation(): void;
      disableVerticalSwipes(): void;
      enableVerticalSwipes(): void;
      switchInlineQuery(query: string, types: string[]): void;
      addToHomeScreen(): void;
      checkHomeScreenStatus(callback: (status: string) => void): void;
      requestEmojiStatusAccess(callback: (allowed: boolean) => void): void;
      setEmojiStatus(
        id: string,
        params: { duration: number },
        callback: (set: boolean) => void,
      ): void;
      requestChat(id: string, callback: (sent: boolean) => void): void;
      invokeCustomMethod(
        method: string,
        params: Record<string, never>,
        callback: (error: unknown, result: unknown) => void,
      ): void;
    };
    const state = window as typeof window & {
      Telegram: { WebApp: WebApp };
      __sdkEvents: Event[];
      callbacks: Record<string, unknown>;
      TelegramGameProxy_receiveEvent(eventType: string, data: unknown): void;
    };
    const app = state.Telegram.WebApp;
    app.enableClosingConfirmation();
    app.disableClosingConfirmation();
    app.disableVerticalSwipes();
    app.enableVerticalSwipes();
    app.switchInlineQuery("cats", ["users", "channels"]);
    app.addToHomeScreen();
    app.checkHomeScreenStatus((status: string) => {
      state.callbacks.home = status;
    });
    app.requestEmojiStatusAccess((allowed: boolean) => {
      state.callbacks.emojiAccess = allowed;
    });
    app.setEmojiStatus("123456789", { duration: 60 }, (set: boolean) => {
      state.callbacks.emojiSet = set;
    });
    app.requestChat("opaque-request-id", (sent: boolean) => {
      state.callbacks.chat = sent;
    });
    app.invokeCustomMethod(
      "getStorageKeys",
      {},
      (error: unknown, result: unknown) => {
        state.callbacks.custom = { error, result };
      },
    );
    const custom = state.__sdkEvents.find(
      (item) => item.eventType === "web_app_invoke_custom_method",
    )?.eventData as { req_id: string };
    const receive = state.TelegramGameProxy_receiveEvent;
    receive("home_screen_checked", { status: "added" });
    receive("emoji_status_access_requested", { status: "allowed" });
    receive("emoji_status_set", null);
    receive("requested_chat_sent", { req_id: "opaque-request-id" });
    receive("custom_method_invoked", {
      req_id: custom.req_id,
      result: ["key"],
    });
    return {
      events: state.__sdkEvents.filter((item) =>
        [
          "web_app_setup_closing_behavior",
          "web_app_setup_swipe_behavior",
          "web_app_switch_inline_query",
          "web_app_add_to_home_screen",
          "web_app_check_home_screen",
          "web_app_request_emoji_status_access",
          "web_app_set_emoji_status",
          "web_app_request_chat",
          "web_app_invoke_custom_method",
        ].includes(item.eventType),
      ),
      callbacks: state.callbacks,
    };
  });
  expect(observed.events).toEqual([
    {
      eventType: "web_app_setup_closing_behavior",
      eventData: { need_confirmation: true },
    },
    {
      eventType: "web_app_setup_closing_behavior",
      eventData: { need_confirmation: false },
    },
    {
      eventType: "web_app_setup_swipe_behavior",
      eventData: { allow_vertical_swipe: false },
    },
    {
      eventType: "web_app_setup_swipe_behavior",
      eventData: { allow_vertical_swipe: true },
    },
    {
      eventType: "web_app_switch_inline_query",
      eventData: { query: "cats", chat_types: ["users", "channels"] },
    },
    { eventType: "web_app_add_to_home_screen", eventData: "" },
    { eventType: "web_app_check_home_screen", eventData: "" },
    { eventType: "web_app_request_emoji_status_access", eventData: "" },
    {
      eventType: "web_app_set_emoji_status",
      eventData: { custom_emoji_id: "123456789", duration: 60 },
    },
    {
      eventType: "web_app_request_chat",
      eventData: { req_id: "opaque-request-id" },
    },
    expect.objectContaining({
      eventType: "web_app_invoke_custom_method",
      eventData: expect.objectContaining({
        method: "getStorageKeys",
        params: {},
      }),
    }),
  ]);
  expect(observed.callbacks).toMatchObject({
    home: "added",
    emojiAccess: true,
    emojiSet: true,
    chat: true,
    custom: { result: ["key"] },
  });
});

test("official Telegram SDK popup, QR and clipboard flows preserve replies", async ({
  page,
}) => {
  await page.setContent(
    "<!doctype html><html><head></head><body></body></html>",
  );
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    Object.assign(window, {
      __sdkEvents: [] as Array<{ eventType: string; eventData: unknown }>,
      TelegramWebviewProxy: {
        postEvent(eventType: string, eventDataJson: string) {
          (
            window as typeof window & {
              __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
            }
          ).__sdkEvents.push({
            eventType,
            eventData: JSON.parse(eventDataJson),
          });
        },
      },
    });
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  await page.evaluate(() => {
    const webApp = (
      window as typeof window & {
        Telegram: {
          WebApp: {
            showPopup: (
              params: unknown,
              callback: (buttonId: string | null) => void,
            ) => void;
            showScanQrPopup: (
              params: unknown,
              callback: (text: string | null) => boolean,
            ) => void;
            readTextFromClipboard: (
              callback: (text: string | null) => void,
            ) => void;
          };
        };
      }
    ).Telegram.WebApp;
    webApp.showPopup(
      {
        message: "Continue?",
        buttons: [
          { id: "go", type: "default", text: "Go" },
          { id: "cancel", type: "cancel" },
        ],
      },
      (buttonId: string | null) => {
        (
          window as typeof window & { popupResult?: string | null }
        ).popupResult = buttonId;
      },
    );
    (
      window as typeof window & {
        TelegramGameProxy_receiveEvent: (
          eventType: string,
          data: unknown,
        ) => void;
      }
    ).TelegramGameProxy_receiveEvent("popup_closed", { button_id: "go" });

    webApp.showScanQrPopup({ text: "Scan a code" }, (text) => text === "done");
    (
      window as typeof window & {
        TelegramGameProxy_receiveEvent: (
          eventType: string,
          data: unknown,
        ) => void;
      }
    ).TelegramGameProxy_receiveEvent("qr_text_received", { data: "done" });
    (
      window as typeof window & {
        TelegramGameProxy_receiveEvent: (
          eventType: string,
          data: unknown,
        ) => void;
      }
    ).TelegramGameProxy_receiveEvent("scan_qr_popup_closed", {});

    webApp.readTextFromClipboard((text: string | null) => {
      (
        window as typeof window & { clipboardResult?: string | null }
      ).clipboardResult = text;
    });
  });
  const state = await page.evaluate(() => {
    const global = window as typeof window & {
      __sdkEvents: Array<{
        eventType: string;
        eventData: Record<string, unknown>;
      }>;
      popupResult?: string | null;
      clipboardResult?: string | null;
    };
    const popup = global.__sdkEvents.find(
      (event) => event.eventType === "web_app_open_popup",
    );
    const scanner = global.__sdkEvents.find(
      (event) => event.eventType === "web_app_open_scan_qr_popup",
    );
    const closeScanner = global.__sdkEvents.find(
      (event) => event.eventType === "web_app_close_scan_qr_popup",
    );
    const clipboard = global.__sdkEvents.find(
      (event) => event.eventType === "web_app_read_text_from_clipboard",
    );
    return {
      popup: popup?.eventData,
      popupResult: global.popupResult,
      scanner: scanner?.eventData,
      closeScanner: closeScanner?.eventData,
      clipboardId: clipboard?.eventData.req_id,
      clipboardResult: global.clipboardResult,
    };
  });
  expect(state.popup).toMatchObject({
    message: "Continue?",
    buttons: [
      { id: "go", type: "default", text: "Go" },
      { id: "cancel", type: "cancel" },
    ],
  });
  expect(state.popupResult).toBe("go");
  expect(state.scanner).toEqual({ text: "Scan a code" });
  expect(state.closeScanner).toBe("");
  expect(state.clipboardId).toMatch(/^[A-Za-z0-9]{16}$/u);
  await page.evaluate((requestId) => {
    (
      window as typeof window & {
        TelegramGameProxy_receiveEvent: (
          eventType: string,
          data: unknown,
        ) => void;
      }
    ).TelegramGameProxy_receiveEvent("clipboard_text_received", {
      req_id: requestId,
      data: "clipboard value",
    });
  }, state.clipboardId);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { clipboardResult?: string | null })
            .clipboardResult,
      ),
    )
    .toBe("clipboard value");
});

test("official Telegram SDK consumes denied location, phone and write-access replies", async ({
  page,
}) => {
  await page.setContent(
    "<!doctype html><html><head></head><body></body></html>",
  );
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    Object.assign(window, {
      __sdkEvents: [] as Array<{ eventType: string; eventData: unknown }>,
      TelegramWebviewProxy: {
        postEvent(eventType: string, eventDataJson: string) {
          (
            window as typeof window & {
              __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
            }
          ).__sdkEvents.push({
            eventType,
            eventData: JSON.parse(eventDataJson),
          });
        },
      },
    });
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  await page.evaluate(() => {
    const receive = (
      window as typeof window & {
        TelegramGameProxy_receiveEvent: (
          eventType: string,
          data: unknown,
        ) => void;
      }
    ).TelegramGameProxy_receiveEvent;
    const webApp = (
      window as typeof window & {
        Telegram: {
          WebApp: {
            LocationManager: {
              init: (callback: () => void) => void;
              getLocation: (callback: (location: unknown) => void) => void;
            };
            requestContact: (
              callback: (sent: boolean, event: unknown) => void,
            ) => void;
            requestWriteAccess: (callback: (allowed: boolean) => void) => void;
          };
        };
      }
    ).Telegram.WebApp;
    webApp.LocationManager.init(() => {
      (window as typeof window & { locationReady?: boolean }).locationReady =
        true;
    });
    receive("location_checked", {
      available: true,
      access_requested: true,
      access_granted: false,
    });
    webApp.LocationManager.getLocation((location) => {
      (window as typeof window & { locationResult?: unknown }).locationResult =
        location;
    });
    receive("location_requested", { available: false });
    receive("location_checked", {
      available: true,
      access_requested: true,
      access_granted: false,
    });
    webApp.requestContact((sent, response) => {
      (window as typeof window & { contactResult?: unknown }).contactResult = {
        sent,
        response,
      };
    });
    receive("phone_requested", { status: "cancelled" });
    webApp.requestWriteAccess((allowed) => {
      (window as typeof window & { writeResult?: boolean }).writeResult =
        allowed;
    });
    receive("write_access_requested", { status: "cancelled" });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const global = window as typeof window & {
          locationReady?: boolean;
          locationResult?: unknown;
          contactResult?: { sent: boolean; response: { status: string } };
          writeResult?: boolean;
        };
        return {
          locationReady: global.locationReady,
          locationResult: global.locationResult,
          contactResult: global.contactResult,
          writeResult: global.writeResult,
        };
      }),
    )
    .toEqual({
      locationReady: true,
      locationResult: null,
      contactResult: { sent: false, response: { status: "cancelled" } },
      writeResult: false,
    });
});

test("official Telegram SDK sensor, haptic, orientation and biometry flows preserve their event shapes", async ({
  page,
}) => {
  await page.setContent(
    "<!doctype html><html><head></head><body></body></html>",
  );
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    Object.assign(window, {
      __sdkEvents: [] as Array<{ eventType: string; eventData: unknown }>,
      TelegramWebviewProxy: {
        postEvent(eventType: string, eventDataJson: string) {
          (
            window as typeof window & {
              __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
            }
          ).__sdkEvents.push({
            eventType,
            eventData: JSON.parse(eventDataJson),
          });
        },
      },
    });
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  await page.evaluate(() => {
    const win = window as typeof window & {
      TelegramGameProxy_receiveEvent: (
        eventType: string,
        data: unknown,
      ) => void;
      Telegram: {
        WebApp: {
          Accelerometer: {
            start: (
              params: unknown,
              callback: (started: boolean) => void,
            ) => void;
            stop: (callback: (stopped: boolean) => void) => void;
            x: number | null;
          };
          Gyroscope: {
            start: (
              params: unknown,
              callback: (started: boolean) => void,
            ) => void;
            stop: (callback: (stopped: boolean) => void) => void;
            z: number | null;
          };
          DeviceOrientation: {
            start: (
              params: unknown,
              callback: (started: boolean) => void,
            ) => void;
            alpha: number | null;
          };
          HapticFeedback: { impactOccurred: (style: string) => void };
          BiometricManager: {
            init: (callback: () => void) => void;
            requestAccess: (
              params: unknown,
              callback: (granted: boolean) => void,
            ) => void;
            openSettings: () => void;
            authenticate: (
              params: unknown,
              callback: (authenticated: boolean, token: string | null) => void,
            ) => void;
            updateBiometricToken: (
              token: string,
              callback: (updated: boolean) => void,
            ) => void;
          };
          lockOrientation: () => void;
        };
      };
      sensorResults?: Record<string, unknown>;
      biometryResults?: Record<string, unknown>;
    };
    const app = win.Telegram.WebApp;
    const sensorResults: Record<string, unknown> = {};
    const biometryResults: Record<string, unknown> = {};
    win.sensorResults = sensorResults;
    win.biometryResults = biometryResults;
    app.Accelerometer.start({ refresh_rate: 50 }, (started) => {
      sensorResults.accelerometerStarted = started;
    });
    win.TelegramGameProxy_receiveEvent("accelerometer_started", {});
    win.TelegramGameProxy_receiveEvent("accelerometer_changed", {
      x: 0.25,
      y: -0.5,
      z: 9.75,
    });
    app.Accelerometer.stop((stopped) => {
      sensorResults.accelerometerStopped = stopped;
    });
    win.TelegramGameProxy_receiveEvent("accelerometer_stopped", {});
    app.Gyroscope.start({ refresh_rate: 40 }, (started) => {
      sensorResults.gyroscopeStarted = started;
    });
    win.TelegramGameProxy_receiveEvent("gyroscope_started", {});
    win.TelegramGameProxy_receiveEvent("gyroscope_changed", {
      x: 0.01,
      y: -0.02,
      z: 0.03,
    });
    app.Gyroscope.stop(() => undefined);
    win.TelegramGameProxy_receiveEvent("gyroscope_stopped", {});
    app.DeviceOrientation.start(
      { refresh_rate: 20, need_absolute: true },
      () => undefined,
    );
    win.TelegramGameProxy_receiveEvent("device_orientation_started", {});
    win.TelegramGameProxy_receiveEvent("device_orientation_changed", {
      alpha: 180,
      beta: 4,
      gamma: -2,
      absolute: true,
    });
    win.TelegramGameProxy_receiveEvent("device_orientation_failed", {
      error: "UNAVAILABLE",
    });
    app.HapticFeedback.impactOccurred("light");
    app.lockOrientation();

    app.BiometricManager.init(() => {
      biometryResults.initialized = true;
    });
    win.TelegramGameProxy_receiveEvent("biometry_info_received", {
      available: true,
      type: "finger",
      device_id: "fixture-device",
      access_requested: false,
      access_granted: false,
      token_saved: false,
    });
    app.BiometricManager.requestAccess({ reason: "Confirm" }, (granted) => {
      biometryResults.accessGranted = granted;
    });
    win.TelegramGameProxy_receiveEvent("biometry_info_received", {
      available: true,
      type: "finger",
      device_id: "fixture-device",
      access_requested: true,
      access_granted: false,
      token_saved: false,
    });
    app.BiometricManager.openSettings();
    win.TelegramGameProxy_receiveEvent("biometry_info_received", {
      available: true,
      type: "finger",
      device_id: "fixture-device",
      access_requested: true,
      access_granted: true,
      token_saved: false,
    });
    app.BiometricManager.authenticate(
      { reason: "Unlock" },
      (authenticated, token) => {
        biometryResults.auth = { authenticated, token };
      },
    );
    win.TelegramGameProxy_receiveEvent("biometry_auth_requested", {
      status: "authorized",
      token: "fixture-biometry-token",
    });
    app.BiometricManager.updateBiometricToken(
      "fixture-biometry-token",
      (updated) => {
        biometryResults.tokenUpdated = updated;
      },
    );
    win.TelegramGameProxy_receiveEvent("biometry_token_updated", {
      status: "updated",
    });
    win.TelegramGameProxy_receiveEvent("biometry_info_received", {
      available: true,
      type: "finger",
      device_id: "fixture-device",
      access_requested: true,
      access_granted: true,
      token_saved: true,
    });
  });
  const result = await page.evaluate(() => {
    const win = window as typeof window & {
      __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
      Telegram: {
        WebApp: {
          Accelerometer: { x: number | null };
          Gyroscope: { z: number | null };
          DeviceOrientation: { alpha: number | null };
          BiometricManager: {
            isBiometricTokenSaved: boolean;
            deviceId: string;
          };
        };
      };
      sensorResults: Record<string, unknown>;
      biometryResults: Record<string, unknown>;
    };
    return {
      outgoing: win.__sdkEvents,
      sensorResults: win.sensorResults,
      x: win.Telegram.WebApp.Accelerometer.x,
      z: win.Telegram.WebApp.Gyroscope.z,
      alpha: win.Telegram.WebApp.DeviceOrientation.alpha,
      biometryResults: win.biometryResults,
      tokenSaved: win.Telegram.WebApp.BiometricManager.isBiometricTokenSaved,
      deviceId: win.Telegram.WebApp.BiometricManager.deviceId,
    };
  });
  expect(result.outgoing).toContainEqual({
    eventType: "web_app_start_accelerometer",
    eventData: { refresh_rate: 50 },
  });
  expect(result.outgoing).toContainEqual({
    eventType: "web_app_start_gyroscope",
    eventData: { refresh_rate: 40 },
  });
  expect(result.outgoing).toContainEqual({
    eventType: "web_app_start_device_orientation",
    eventData: { refresh_rate: 20, need_absolute: true },
  });
  expect(result.outgoing).toContainEqual({
    eventType: "web_app_trigger_haptic_feedback",
    eventData: { type: "impact", impact_style: "light" },
  });
  expect(result.outgoing).toContainEqual({
    eventType: "web_app_toggle_orientation_lock",
    eventData: { locked: true },
  });
  expect(result.sensorResults).toMatchObject({
    accelerometerStarted: true,
    accelerometerStopped: true,
    gyroscopeStarted: true,
  });
  expect({ x: result.x, z: result.z, alpha: result.alpha }).toEqual({
    x: 0.25,
    z: 0.03,
    alpha: 180,
  });
  expect(result.biometryResults).toMatchObject({
    initialized: true,
    accessGranted: false,
    auth: { authenticated: true, token: "fixture-biometry-token" },
    tokenUpdated: true,
  });
  expect(result.tokenSaved).toBe(true);
  expect(result.deviceId).toBe("fixture-device");
});

test("official Telegram SDK storage APIs preserve request IDs and callback results", async ({
  page,
}) => {
  await page.setContent(
    "<!doctype html><html><head></head><body></body></html>",
  );
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=9.0&tgWebAppPlatform=android",
    );
    Object.assign(window, {
      __sdkEvents: [] as Array<{ eventType: string; eventData: unknown }>,
      TelegramWebviewProxy: {
        postEvent(eventType: string, eventDataJson: string) {
          (
            window as typeof window & {
              __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
            }
          ).__sdkEvents.push({
            eventType,
            eventData: JSON.parse(eventDataJson),
          });
        },
      },
    });
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  await page.evaluate(() => {
    const win = window as typeof window & {
      TelegramGameProxy_receiveEvent: (
        eventType: string,
        data: unknown,
      ) => void;
      __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
      Telegram: {
        WebApp: {
          DeviceStorage: {
            setItem(
              key: string,
              value: string,
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            getItem(
              key: string,
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            removeItem(
              key: string,
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            clear(
              callback?: (error: string | null, value: unknown) => void,
            ): void;
          };
          SecureStorage: {
            setItem(
              key: string,
              value: string,
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            getItem(
              key: string,
              callback?: (
                error: string | null,
                value: unknown,
                canRestore?: boolean,
              ) => void,
            ): void;
            restoreItem(
              key: string,
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            removeItem(
              key: string,
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            clear(
              callback?: (error: string | null, value: unknown) => void,
            ): void;
          };
          CloudStorage: {
            setItem(
              key: string,
              value: string,
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            getItems(
              keys: string[],
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            removeItems(
              keys: string[],
              callback?: (error: string | null, value: unknown) => void,
            ): void;
            getKeys(
              callback?: (error: string | null, value: unknown) => void,
            ): void;
          };
          storageResults: Record<string, unknown>;
        };
      };
    };
    const app = win.Telegram.WebApp;
    app.storageResults = {};
    app.DeviceStorage.setItem("device_key", "device_value", (error, value) => {
      app.storageResults.deviceSaved = { error, value };
    });
    app.DeviceStorage.getItem("device_key", (error, value) => {
      app.storageResults.deviceRead = { error, value };
    });
    app.DeviceStorage.removeItem("device_key", (error, value) => {
      app.storageResults.deviceRemoved = { error, value };
    });
    app.DeviceStorage.clear((error, value) => {
      app.storageResults.deviceCleared = { error, value };
    });
    app.SecureStorage.setItem("secret_key", "secret_value", (error, value) => {
      app.storageResults.secureSaved = { error, value };
    });
    app.SecureStorage.getItem("secret_key", (error, value, canRestore) => {
      app.storageResults.secureRead = { error, value, canRestore };
    });
    app.SecureStorage.restoreItem("secret_key", (error, value) => {
      app.storageResults.secureRestored = { error, value };
    });
    app.SecureStorage.removeItem("secret_key", (error, value) => {
      app.storageResults.secureRemoved = { error, value };
    });
    app.SecureStorage.clear((error, value) => {
      app.storageResults.secureCleared = { error, value };
    });
    app.CloudStorage.setItem("cloud_key", "cloud_value", (error, value) => {
      app.storageResults.cloudSaved = { error, value };
    });
    app.CloudStorage.getItems(["cloud_key"], (error, value) => {
      app.storageResults.cloudRead = { error, value };
    });
    app.CloudStorage.removeItems(["cloud_key"], (error, value) => {
      app.storageResults.cloudRemoved = { error, value };
    });
    app.CloudStorage.getKeys((error, value) => {
      app.storageResults.cloudKeys = { error, value };
    });
    const responses: Record<string, { eventType: string; eventData: unknown }> =
      {
        web_app_device_storage_save_key: {
          eventType: "device_storage_key_saved",
          eventData: {},
        },
        web_app_device_storage_get_key: {
          eventType: "device_storage_key_received",
          eventData: { value: "device_value" },
        },
        web_app_device_storage_clear: {
          eventType: "device_storage_cleared",
          eventData: {},
        },
        web_app_secure_storage_save_key: {
          eventType: "secure_storage_key_saved",
          eventData: {},
        },
        web_app_secure_storage_get_key: {
          eventType: "secure_storage_key_received",
          eventData: { value: null, can_restore: true },
        },
        web_app_secure_storage_restore_key: {
          eventType: "secure_storage_key_restored",
          eventData: { value: "secret_value" },
        },
        web_app_secure_storage_clear: {
          eventType: "secure_storage_cleared",
          eventData: {},
        },
      };
    for (const request of win.__sdkEvents) {
      if (request.eventType === "web_app_invoke_custom_method") {
        const customMethod = request.eventData as {
          req_id: string;
          method: string;
        };
        const resultByMethod: Record<string, unknown> = {
          saveStorageValue: true,
          getStorageValues: { cloud_key: "cloud_value" },
          deleteStorageValues: true,
          getStorageKeys: ["cloud_key"],
        };
        win.TelegramGameProxy_receiveEvent("custom_method_invoked", {
          req_id: customMethod.req_id,
          result: resultByMethod[customMethod.method],
        });
        continue;
      }
      const data = request.eventData as {
        req_id: string;
        value?: string | null;
      };
      const response = responses[request.eventType];
      if (!response) continue;
      win.TelegramGameProxy_receiveEvent(response.eventType, {
        req_id: data.req_id,
        ...(response.eventData as Record<string, unknown>),
      });
    }
  });
  const result = await page.evaluate(() => {
    const win = window as typeof window & {
      __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
      Telegram: { WebApp: { storageResults: Record<string, unknown> } };
    };
    return {
      outgoing: win.__sdkEvents,
      callbacks: win.Telegram.WebApp.storageResults,
    };
  });
  const storageEvents = result.outgoing.filter((entry) =>
    entry.eventType.includes("storage"),
  );
  const customStorageEvents = result.outgoing.filter((entry) => {
    if (entry.eventType !== "web_app_invoke_custom_method") return false;
    const method = (entry.eventData as { method?: string }).method;
    return [
      "saveStorageValue",
      "getStorageValues",
      "deleteStorageValues",
      "getStorageKeys",
    ].includes(method ?? "");
  });
  expect(storageEvents.map((entry) => entry.eventType)).toEqual([
    "web_app_device_storage_save_key",
    "web_app_device_storage_get_key",
    "web_app_device_storage_save_key",
    "web_app_device_storage_clear",
    "web_app_secure_storage_save_key",
    "web_app_secure_storage_get_key",
    "web_app_secure_storage_restore_key",
    "web_app_secure_storage_save_key",
    "web_app_secure_storage_clear",
  ]);
  expect(storageEvents[0]?.eventData).toMatchObject({
    key: "device_key",
    value: "device_value",
  });
  expect(storageEvents[2]?.eventData).toMatchObject({
    key: "device_key",
    value: null,
  });
  expect(storageEvents[4]?.eventData).toMatchObject({
    key: "secret_key",
    value: "secret_value",
  });
  expect(
    storageEvents.every((entry) =>
      /^[A-Za-z0-9]{16}$/u.test(
        (entry.eventData as { req_id?: string }).req_id ?? "",
      ),
    ),
  ).toBe(true);
  expect(
    customStorageEvents.map(
      (entry) => (entry.eventData as { method: string }).method,
    ),
  ).toEqual([
    "saveStorageValue",
    "getStorageValues",
    "deleteStorageValues",
    "getStorageKeys",
  ]);
  expect(customStorageEvents[0]?.eventData).toMatchObject({
    method: "saveStorageValue",
    params: { key: "cloud_key", value: "cloud_value" },
  });
  expect(result.callbacks).toEqual({
    deviceSaved: { error: null, value: true },
    deviceRead: { error: null, value: "device_value" },
    deviceRemoved: { error: null, value: true },
    deviceCleared: { error: null, value: true },
    secureSaved: { error: null, value: true },
    secureRead: { error: null, value: null, canRestore: true },
    secureRestored: { error: null, value: "secret_value" },
    secureRemoved: { error: null, value: true },
    secureCleared: { error: null, value: true },
    cloudSaved: { error: null, value: true },
    cloudRead: { error: null, value: { cloud_key: "cloud_value" } },
    cloudRemoved: { error: null, value: true },
    cloudKeys: { error: null, value: ["cloud_key"] },
  });
});
