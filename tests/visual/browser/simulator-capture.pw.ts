import { expect, openScene, test } from "./fixtures";

type CaptureOutcome =
  | { ok: true; fileName: string }
  | { ok: false; error: "CANCELED" | "UNAVAILABLE" | "FAILED" };

async function installCaptureBridge(
  page: Parameters<typeof openScene>[0],
  outcome: CaptureOutcome,
) {
  await page.addInitScript((reply) => {
    const handlers = new Map<string, Set<(value: unknown) => void>>();
    const requests: Array<{ channel: string; payload: string }> = [];
    Object.defineProperty(window, "__captureRequests", {
      configurable: false,
      value: requests,
    });
    Object.defineProperty(window, "__bunium", {
      configurable: false,
      value: {
        on(channel: string, handler: (value: unknown) => void) {
          const listeners = handlers.get(channel) ?? new Set();
          listeners.add(handler);
          handlers.set(channel, listeners);
        },
        off(channel: string, handler: (value: unknown) => void) {
          handlers.get(channel)?.delete(handler);
        },
        send(channel: string, payload: string) {
          requests.push({ channel, payload });
          if (channel !== "capture.request") return;
          const request = JSON.parse(payload) as { requestId: string };
          setTimeout(() => {
            for (const handler of handlers.get("capture.reply") ?? []) {
              handler({ requestId: request.requestId, ...reply });
            }
          }, 0);
        },
      },
    });
  }, outcome);
}

test.describe("Simulator screenshot UI 09a", () => {
  test("sends the selected scope and reports a saved file", async ({
    page,
  }) => {
    await installCaptureBridge(page, {
      ok: true,
      fileName: "tma-studio-example-viewport.png",
    });
    await openScene(page, {
      query: "?scene=simulator&locale=fa&platform=android",
      ready: ".tma-view",
    });

    const scope = page.getByRole("group", { name: "محدودهٔ عکس" });
    await expect(
      scope.getByRole("button", { name: "نمای مینی‌اپ" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(scope.getByRole("button")).toHaveText([
      "نمای مینی‌اپ",
      "سطح تلگرام",
      "کل پنجره",
    ]);
    await scope.getByRole("button", { name: "سطح تلگرام" }).click();
    await page.getByRole("button", { name: "عکس از صفحه" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "tma-studio-example-viewport.png ذخیره شد",
    );
    const sent = await page.evaluate(() => {
      const requests = (
        window as unknown as Window & {
          __captureRequests: Array<{ channel: string; payload: string }>;
        }
      ).__captureRequests;
      return requests
        .filter((request) => request.channel === "capture.request")
        .map((request) => JSON.parse(request.payload));
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      scope: "telegram",
      side: "top",
      host: { width: expect.any(Number), height: expect.any(Number) },
      guest: {
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      },
    });
    expect(sent[0].requestId).toMatch(/^capture-\d+$/u);
    expect(sent[0].host.width).toBeGreaterThan(0);
    expect(sent[0].host.height).toBeGreaterThan(0);
    expect(sent[0].guest.width).toBeGreaterThan(0);
    expect(sent[0].guest.height).toBeGreaterThan(0);
    expect(sent[0].guest.x + sent[0].guest.width).toBeLessThanOrEqual(
      sent[0].host.width,
    );
    expect(sent[0].guest.y + sent[0].guest.height).toBeLessThanOrEqual(
      sent[0].host.height,
    );
  });

  test("sends the full-window scope when selected", async ({ page }) => {
    await installCaptureBridge(page, {
      ok: true,
      fileName: "tma-studio-example-window.png",
    });
    await openScene(page, {
      query: "?scene=simulator&locale=fa&platform=android",
      ready: ".tma-view",
    });

    const scope = page.getByRole("group", { name: "محدودهٔ عکس" });
    const fullWindow = scope.getByRole("button", { name: "کل پنجره" });
    await fullWindow.click();
    await expect(fullWindow).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "عکس از صفحه" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "tma-studio-example-window.png ذخیره شد",
    );

    const sent = await page.evaluate(() => {
      const requests = (
        window as unknown as Window & {
          __captureRequests: Array<{ channel: string; payload: string }>;
        }
      ).__captureRequests;
      return requests
        .filter((request) => request.channel === "capture.request")
        .map((request) => JSON.parse(request.payload));
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ scope: "window" });
  });

  for (const [error, message] of [
    ["CANCELED", "عکس‌برداری لغو شد."],
    ["UNAVAILABLE", "عکس ترکیبی در این سیستم در دسترس نیست."],
    ["FAILED", "عکس ذخیره نشد. پوشه را بررسی و دوباره تلاش کنید."],
  ] as const) {
    test(`reports ${error.toLowerCase()} from the host`, async ({ page }) => {
      await installCaptureBridge(page, { ok: false, error });
      await openScene(page, {
        query: "?scene=simulator&locale=fa&platform=android",
        ready: ".tma-view",
      });
      await page.getByRole("button", { name: "عکس از صفحه" }).click();
      await expect(page.getByRole("status")).toHaveText(message);
    });
  }
});
