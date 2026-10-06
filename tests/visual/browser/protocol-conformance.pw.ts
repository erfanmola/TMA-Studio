import { expect, test } from "@playwright/test";
import inventory from "../../../apps/studio/src/domain/protocol/inventory.json" with {
  type: "json",
};

const versionBoundaries = [
  ...new Set(
    inventory.events
      .map((event) => event.minimumVersion)
      .filter((version): version is string => version !== null),
  ),
].sort(compareVersion);

test("pinned Telegram SDK version comparison covers every registry boundary", async ({
  page,
}) => {
  for (const minimum of versionBoundaries) {
    const [major = 0, minor = 0] = minimum.split(".").map(Number);
    const below = minor > 0 ? `${major}.${minor - 1}` : `${major - 1}.99`;
    const above = `${major}.${minor + 1}`;
    for (const version of [below, minimum, above]) {
      await page.goto("about:blank");
      await page.evaluate((sdkVersion) => {
        history.replaceState(
          null,
          "",
          `#tgWebAppVersion=${sdkVersion}&tgWebAppPlatform=android&tgWebAppBotInline=1`,
        );
        Object.assign(window, {
          TelegramWebviewProxy: { postEvent() {} },
        });
      }, version);
      await page.addScriptTag({
        path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
      });
      const accepted = await page.evaluate((boundary) => {
        const webApp = (
          window as typeof window & {
            Telegram: {
              WebApp: { isVersionAtLeast(version: string): boolean };
            };
          }
        ).Telegram.WebApp;
        return webApp.isVersionAtLeast(boundary);
      }, minimum);
      expect(accepted, `SDK loaded at version ${version}`).toBe(
        compareVersion(version, minimum) >= 0,
      );
    }
    expect(compareVersion(below, minimum)).toBeLessThan(0);
    expect(compareVersion(above, minimum)).toBeGreaterThan(0);
  }
});

const methodProbes = [
  { version: "6.1", method: "backButton", event: "web_app_setup_back_button" },
  { version: "6.2", method: "popup", event: "web_app_open_popup" },
  { version: "6.4", method: "qr", event: "web_app_open_scan_qr_popup" },
  {
    version: "6.7",
    method: "inlineQuery",
    event: "web_app_switch_inline_query",
    sdkMinimum: "6.6",
  },
  {
    version: "6.9",
    method: "customMethod",
    event: "web_app_invoke_custom_method",
  },
  {
    version: "6.10",
    method: "settingsButton",
    event: "web_app_setup_settings_button",
  },
  { version: "7.2", method: "biometry", event: "web_app_biometry_get_info" },
  { version: "7.7", method: "swipe", event: "web_app_setup_swipe_behavior" },
  {
    version: "7.10",
    method: "bottomBar",
    event: "web_app_set_bottom_bar_color",
  },
  { version: "8.0", method: "fullscreen", event: "web_app_request_fullscreen" },
  {
    version: "9.0",
    method: "deviceStorage",
    event: "web_app_device_storage_get_key",
  },
  { version: "9.6", method: "requestChat", event: "web_app_request_chat" },
] as const;

test("pinned SDK API families exercise representative methods at their version gates", async ({
  page,
}) => {
  for (const probe of methodProbes) {
    const [major = 0, minor = 0] = probe.version.split(".").map(Number);
    const below = `${major}.${minor - 1}`;
    const methodVersion =
      "sdkMinimum" in probe ? probe.sdkMinimum : probe.version;
    const [methodMajor = 0, methodMinor = 0] = methodVersion
      .split(".")
      .map(Number);
    const sdkBelow = `${methodMajor}.${methodMinor - 1}`;
    const belowResult = await invokeSdkProbe(
      page,
      sdkBelow,
      probe.method,
      probe.event,
    );
    const atSdkMinimum = await invokeSdkProbe(
      page,
      methodVersion,
      probe.method,
      probe.event,
    );
    expect(
      belowResult.emitted,
      `${probe.method} below SDK guard ${methodVersion}`,
    ).toBe(false);
    expect(
      atSdkMinimum.emitted,
      `${probe.method} at SDK guard ${methodVersion}`,
    ).toBe(true);
    if ("sdkMinimum" in probe) {
      expect(methodVersion).not.toBe(probe.version);
      const registryPredecessor = await invokeSdkProbe(
        page,
        below,
        probe.method,
        probe.event,
      );
      expect(registryPredecessor.emitted).toBe(true);
    }
  }
});

async function invokeSdkProbe(
  page: import("@playwright/test").Page,
  version: string,
  method: (typeof methodProbes)[number]["method"],
  eventType: string,
): Promise<{ emitted: boolean; error?: string }> {
  await page.goto("about:blank");
  await page.evaluate((sdkVersion) => {
    history.replaceState(
      null,
      "",
      `#tgWebAppVersion=${sdkVersion}&tgWebAppPlatform=android&tgWebAppBotInline=1`,
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
  }, version);
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  return page.evaluate(
    ({ selectedMethod, selectedEvent }) => {
      const state = window as typeof window & {
        __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
        Telegram: { WebApp: Record<string, unknown> };
      };
      const app = state.Telegram.WebApp;
      const method = (
        receiver: Record<string, unknown>,
        name: string,
        args: unknown[] = [],
      ) => {
        const callable = receiver[name];
        if (typeof callable !== "function")
          throw new Error(`Missing SDK method ${name}`);
        Reflect.apply(callable, receiver, args);
      };
      state.__sdkEvents.length = 0;
      try {
        switch (selectedMethod) {
          case "backButton":
            method(app.BackButton as Record<string, unknown>, "show");
            break;
          case "popup":
            method(app, "showPopup", [
              { message: "Conformance", buttons: [{ type: "ok" }] },
            ]);
            break;
          case "qr":
            method(app, "showScanQrPopup", [{ text: "Scan" }]);
            break;
          case "inlineQuery":
            method(app, "switchInlineQuery", ["test", ["users"]]);
            break;
          case "customMethod":
            method(app, "invokeCustomMethod", ["getStorageKeys", {}, () => {}]);
            break;
          case "settingsButton":
            (app.SettingsButton as Record<string, unknown>).isVisible = true;
            break;
          case "biometry":
            method(app.BiometricManager as Record<string, unknown>, "init", [
              () => {},
            ]);
            break;
          case "swipe":
            (app as Record<string, unknown>).isVerticalSwipesEnabled = false;
            break;
          case "bottomBar":
            method(app, "setBottomBarColor", ["bg_color"]);
            break;
          case "fullscreen":
            method(app, "requestFullscreen");
            break;
          case "deviceStorage":
            method(app.DeviceStorage as Record<string, unknown>, "getItem", [
              "key",
              () => {},
            ]);
            break;
          case "requestChat":
            method(app, "requestChat", ["conformance-request", () => {}]);
            break;
        }
      } catch (error) {
        return {
          emitted: state.__sdkEvents.some(
            (item) => item.eventType === selectedEvent,
          ),
          error: error instanceof Error ? error.message : String(error),
        };
      }
      return {
        emitted: state.__sdkEvents.some(
          (item) => item.eventType === selectedEvent,
        ),
      };
    },
    { selectedMethod: method, selectedEvent: eventType },
  );
}

function compareVersion(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
