import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const tutorialHtml = readFileSync(
  "tests/fixtures/tutorial-mini-app/index.html",
  "utf8",
).replace(
  /\s*<link rel="stylesheet" href="\.\/style\.css" \/>|\s*<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js\?63"><\/script>|\s*<script src="\.\/app\.js" defer><\/script>/gu,
  "",
);

test("tutorial Mini App uses the pinned SDK without exposing initData", async ({
  page,
}) => {
  await page.goto("about:blank");
  await page.evaluate(() => {
    history.replaceState(
      null,
      "",
      "#tgWebAppVersion=9.6&tgWebAppPlatform=android&tgWebAppData=auth_date%3D1%26hash%3Dprivate-fixture-secret",
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
  await page.setContent(tutorialHtml);
  await page.addStyleTag({
    path: "tests/fixtures/tutorial-mini-app/style.css",
  });
  await page.addScriptTag({
    path: "tests/fixtures/official-telegram-sdk/telegram-web-app.js",
  });
  await page.addScriptTag({ path: "tests/fixtures/tutorial-mini-app/app.js" });

  await expect(page.locator("#ready-status")).toHaveText("Ready signalled");
  await expect(page.locator("#initdata-status")).toHaveText(
    "Present (value hidden)",
  );
  await expect(page.locator("body")).not.toContainText(
    "private-fixture-secret",
  );

  await page.evaluate(() => {
    const state = window as typeof window & {
      TelegramGameProxy_receiveEvent(
        eventType: string,
        eventData: unknown,
      ): void;
    };
    state.TelegramGameProxy_receiveEvent("theme_changed", {
      theme_params: { bg_color: "#111111", text_color: "#eeeeee" },
    });
    state.TelegramGameProxy_receiveEvent("viewport_changed", {
      height: 640,
      is_expanded: true,
      is_state_stable: true,
    });
  });
  await expect(page.locator("#theme-status")).toHaveText(
    "Dark theme from host",
  );
  await expect(page.locator("#viewport-status")).toHaveText(
    "height 640px · stable 640px",
  );

  await page.getByRole("button", { name: "Show main button" }).click();
  await page.getByRole("button", { name: "Show back button" }).click();
  await page.getByRole("button", { name: "Open host popup" }).click();
  const emitted = await page.evaluate(() => {
    const state = window as typeof window & {
      __sdkEvents: Array<{ eventType: string; eventData: unknown }>;
      TelegramGameProxy_receiveEvent(
        eventType: string,
        eventData: unknown,
      ): void;
    };
    const events = state.__sdkEvents;
    const popup = events.find(
      (event) => event.eventType === "web_app_open_popup",
    );
    state.TelegramGameProxy_receiveEvent("popup_closed", { button_id: "ok" });
    return {
      main: events.some(
        (event) =>
          event.eventType === "web_app_setup_main_button" &&
          (event.eventData as { is_visible?: boolean }).is_visible,
      ),
      back: events.some(
        (event) =>
          event.eventType === "web_app_setup_back_button" &&
          (event.eventData as { is_visible?: boolean }).is_visible,
      ),
      popup: popup?.eventData,
    };
  });
  expect(emitted).toMatchObject({
    main: true,
    back: true,
    popup: {
      title: "Tutorial popup",
      message: "This popup is provided by the Telegram host.",
    },
  });
  await expect(page.locator("#controls-status")).toHaveText("Popup dismissed.");
});
