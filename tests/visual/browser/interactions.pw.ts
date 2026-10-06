import type { Page } from "@playwright/test";
import { expect, openScene, test } from "./fixtures";

const activeId = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return (
      element?.id ||
      element?.getAttribute("aria-label") ||
      element?.textContent?.trim() ||
      ""
    );
  });

const locales = [
  { locale: "en", rtl: false },
  { locale: "fa", rtl: true },
] as const;

test.describe("primitives keyboard and state", () => {
  test("tab order, ARIA wiring, secret reveal reset and IME", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=primitives",
      ready: ".primitive-state-scene",
    });
    const scene = page.locator(".primitive-state-scene").first();
    const order: string[] = [];
    await page.keyboard.press("Tab");
    for (let step = 0; step < 7; step += 1) {
      order.push(await activeId(page));
      await page.keyboard.press("Tab");
    }
    expect(order).toEqual([
      "Continue",
      "Cancel",
      "Delete",
      "More actions",
      "project-light-en",
      "secret-light-en",
      "Show password",
    ]);
    const field = page.locator("#project-light-en");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAttribute(
      "aria-describedby",
      "project-light-en-description project-light-en-error",
    );
    const saving = scene.getByRole("button", { name: "Saving…" });
    await expect(saving).toHaveAttribute("aria-busy", "true");
    await expect(saving).toBeDisabled();

    const secret = page.locator("#secret-light-en");
    const reveal = scene.locator("button[aria-pressed]");
    await reveal.click();
    await expect(secret).toHaveAttribute("type", "text");
    await expect(reveal).toHaveAttribute("aria-label", "Hide password");
    await secret.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(secret).toHaveAttribute("type", "password");
    await expect(reveal).toHaveAttribute("aria-pressed", "false");

    const persian = page.locator("#project-light-fa");
    await persian.click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", {
      selectionEnd: 3,
      selectionStart: 3,
      text: "پرو",
    });
    await expect(persian).toHaveValue("پرو");
    await cdp.send("Input.insertText", { text: "پروژه" });
    await expect(persian).toHaveValue("پروژه");
  });
});

test.describe("selection and navigation controls", () => {
  for (const { locale, rtl } of locales) {
    const S = `light-${locale}`;
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";

    test(`${locale}: tabs, segmented control and switch`, async ({ page }) => {
      await openScene(page, {
        query: "?scene=controls",
        ready: ".control-state-scene",
      });
      await page.focus(`#tabs-${S}-tab-appearance`);
      await page.keyboard.press(forward);
      expect(await activeId(page)).toBe(`tabs-${S}-tab-simulators`);
      await expect(page.locator(`#tabs-${S}-panel`)).toHaveAttribute(
        "aria-labelledby",
        `tabs-${S}-tab-simulators`,
      );
      await expect(page.locator(`#tabs-${S}-tab-appearance`)).toHaveAttribute(
        "tabindex",
        "-1",
      );
      await page.keyboard.press("End");
      expect(await activeId(page)).toBe(`tabs-${S}-tab-storage`);
      await page.keyboard.press(forward);
      expect(await activeId(page)).toBe(`tabs-${S}-tab-general`);

      await page.focus(`#mode-${S}-expanded`);
      await page.keyboard.press(forward);
      expect(await activeId(page)).toBe(`mode-${S}-compact`);
      await expect(page.locator(`#mode-${S}-compact`)).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.locator(`#mode-${S}-fullscreen`)).toBeDisabled();
      await expect(page.locator(`#mode-${S} [tabindex="0"]`)).toHaveCount(1);
      await page.focus(`#position-${S}-top`);
      await page.keyboard.press(backward);
      expect(await activeId(page)).toBe(`position-${S}-right`);

      const toggle = page.locator(`#on-top-${S}`);
      await toggle.focus();
      await page.keyboard.press("Space");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await page.locator(`label[for="on-top-${S}"]`).click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await expect(page.locator(`#acceleration-${S}`)).toBeDisabled();
    });

    test(`${locale}: select and combobox never lose value on Escape`, async ({
      page,
    }) => {
      await openScene(page, {
        query: "?scene=controls",
        ready: ".control-state-scene",
      });
      const select = page.locator(`#scheme-${S}`);
      await select.selectOption("dark");
      await select.focus();
      await page.keyboard.press("Escape");
      await expect(select).toHaveValue("dark");
      await expect(select.locator("option[value=contrast]")).toBeDisabled();

      const combo = page.locator(`#profile-${S}`);
      const listbox = page.locator(`#profile-${S}-listbox`);
      await combo.focus();
      await page.keyboard.press("ArrowDown");
      await expect(combo).toHaveAttribute("aria-expanded", "true");
      await expect(combo).toHaveAttribute(
        "aria-activedescendant",
        `profile-${S}-option-0`,
      );
      const box = await listbox.boundingBox();
      expect(box && box.y + box.height <= 1000 && box.x >= 0).toBe(true);
      await page.keyboard.press("ArrowUp");
      await expect(combo).toHaveAttribute(
        "aria-activedescendant",
        `profile-${S}-option-9`,
      );
      await page.keyboard.press("Escape");
      await expect(combo).toHaveAttribute("aria-expanded", "false");
      await expect(combo).toHaveValue("Android · Pixel 9");
      await page.keyboard.press("Escape");
      await expect(combo).toHaveValue("Android · Pixel 9");

      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("ios");
      await expect(listbox.locator("[role=option]")).toHaveCount(2);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(combo).toHaveValue("iOS · iPhone SE");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(combo).toHaveAttribute(
        "aria-activedescendant",
        `profile-${S}-option-6`,
      );
      await page.keyboard.press("Escape");
      await expect(combo).toHaveValue("iOS · iPhone SE");
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("zzz");
      await expect(listbox.locator(".studio-listbox__empty")).toHaveCount(1);
      await page.keyboard.press("Tab");
      await expect(combo).toHaveValue("iOS · iPhone SE");
    });

    test(`${locale}: menu button keyboard contract`, async ({ page }) => {
      await openScene(page, {
        query: "?scene=controls",
        ready: ".control-state-scene",
      });
      const trigger = page.locator(`#actions-${S}-button`);
      const menu = page.locator(`#actions-${S}-menu`);
      await trigger.focus();
      await page.keyboard.press("ArrowDown");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(await activeId(page)).toBe(`actions-${S}-item-reload`);
      await page.keyboard.press("ArrowUp");
      expect(await activeId(page)).toBe(`actions-${S}-item-delete`);
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      expect(await activeId(page)).toBe(`actions-${S}-item-reset`);
      await page.keyboard.press("Escape");
      expect(await activeId(page)).toBe(`actions-${S}-button`);
      await expect(menu).toHaveCount(0);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Home");
      await page.keyboard.press("Enter");
      expect(await activeId(page)).toBe(`actions-${S}-button`);
      await page.keyboard.press("ArrowDown");
      await page.mouse.click(2, 2);
      await expect(menu).toHaveCount(0);
    });
  }

  test("menu flips above the anchor near the viewport bottom", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 520, width: 400 });
    await openScene(page, {
      query: "?scene=controls",
      ready: ".control-state-scene",
    });
    await page.evaluate(() => {
      const button = document.getElementById("actions-light-en-button");
      const board = document.querySelector(".primitive-state-board");
      if (!button || !board) return;
      board.scrollBy(
        0,
        button.getBoundingClientRect().bottom - innerHeight + 20,
      );
    });
    await page.focus("#actions-light-en-button");
    await page.keyboard.press("ArrowDown");
    const menu = await page.locator("#actions-light-en-menu").boundingBox();
    const trigger = await page
      .locator("#actions-light-en-button")
      .boundingBox();
    expect(menu && trigger && menu.y + menu.height <= trigger.y + 1).toBe(true);
    expect(menu && menu.y >= 0 && menu.x + menu.width <= 400).toBe(true);
  });
});

test.describe("surface primitives", () => {
  for (const { locale } of locales) {
    const S = `light-${locale}`;
    const scope = `.catalog-state-scene[lang="${locale}"][data-theme="light"]`;

    test(`${locale}: avatars, sidebar and dialogs`, async ({ page }) => {
      await openScene(page, {
        query: "?scene=catalog",
        ready: ".catalog-state-scene",
      });
      const scene = page.locator(scope);
      const colors = await scene
        .locator(".studio-sidebar-list .studio-avatar")
        .evaluateAll((items) =>
          items.map((item) => (item as HTMLElement).dataset.color),
        );
      expect(colors).toEqual([
        String(9007199254740993n % 7n),
        String(5000000003n % 7n),
        String(1001234567890n % 7n),
      ]);
      await expect(
        scene.locator(".studio-sidebar-list__item").nth(1).locator("img"),
      ).toHaveCount(0);
      await expect(
        scene.locator(".studio-sidebar-list__item").nth(2).locator("img"),
      ).toHaveCount(1);

      await page.focus(`#users-${S}-alex`);
      await page.keyboard.press("End");
      expect(await activeId(page)).toBe(`users-${S}-nima`);
      await page.keyboard.press("ArrowDown");
      expect(await activeId(page)).toBe(`users-${S}-nima`);
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(page.locator(`#users-${S}-sara`)).toHaveAttribute(
        "aria-current",
        "true",
      );

      const rename = page.locator(`#rename-${S}`);
      const opener = scene
        .locator(".catalog-state-scene__actions button")
        .first();
      await opener.focus();
      await page.keyboard.press("Enter");
      expect(await rename.evaluate((d) => (d as HTMLDialogElement).open)).toBe(
        true,
      );
      for (let step = 0; step < 5; step += 1) await page.keyboard.press("Tab");
      expect(
        await rename.evaluate((d) => d.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Escape");
      expect(await rename.evaluate((d) => (d as HTMLDialogElement).open)).toBe(
        false,
      );
      await expect(opener).toBeFocused();

      const remove = scene
        .locator(".catalog-state-scene__actions button")
        .nth(1);
      const confirm = page.locator(`#delete-${S}`);
      await remove.focus();
      await page.keyboard.press("Enter");
      await expect(confirm.locator("button").first()).toBeFocused();
      await page.mouse.click(3, 3);
      expect(await confirm.evaluate((d) => (d as HTMLDialogElement).open)).toBe(
        true,
      );
      await page.keyboard.press("Escape");
      await expect(remove).toBeFocused();
      await expect(scene.locator(".studio-sidebar-list__row")).toHaveCount(3);
    });

    test(`${locale}: storage states`, async ({ page }) => {
      await openScene(page, {
        query: "?scene=catalog",
        ready: ".catalog-state-scene",
      });
      const scene = page.locator(scope);
      const rows = scene.locator(".studio-storage__table tbody tr");
      const unknown = locale === "en" ? "Unknown" : "نامشخص";
      await expect(rows.nth(0).locator("td").first()).toHaveText(
        locale === "en" ? "128 MB" : /۱۲۸/,
      );
      await expect(rows.nth(3).locator("td").first()).toHaveText(unknown);
      await page.locator(`#storage-state-control-${S}-estimating`).click();
      await expect(scene.locator(".studio-storage")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(rows.nth(0).locator("td").first()).toHaveText(unknown);
      await page.locator(`#storage-state-control-${S}-error`).click();
      await expect(scene.locator(".studio-storage")).toHaveAttribute(
        "data-status",
        "error",
      );
    });
  }

  test("window drag regions never contain controls", async ({ page }) => {
    await openScene(page, {
      query: "?scene=catalog",
      ready: ".catalog-state-scene",
    });
    const drag = await page.evaluate(() => {
      const interactive =
        "a[href],button,input,select,textarea,summary,[tabindex],[contenteditable='true']";
      const regions = [...document.querySelectorAll("*")].filter(
        (element) =>
          getComputedStyle(element)
            .getPropertyValue("-webkit-app-region")
            .trim() === "drag",
      );
      return {
        conflicts: regions.filter(
          (region) =>
            region.matches(interactive) || region.querySelector(interactive),
        ).length,
        count: regions.length,
      };
    });
    expect(drag.count).toBeGreaterThanOrEqual(4);
    expect(drag.conflicts).toBe(0);
  });

  test("controls are not clipped at 200% scale", async ({ page }) => {
    await openScene(page, {
      query: "?scene=catalog",
      ready: ".catalog-state-scene",
      scale: 2,
    });
    const clipped = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".studio-segmented,button,.studio-sidebar-list__row,.studio-storage__table",
        ),
      ]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.textContent?.slice(0, 30)),
    );
    expect(clipped).toEqual([]);
  });
});

test.describe("toast timing", () => {
  test.use({ clockMode: "fake" });

  test("auto-dismiss pauses on hover and errors persist", async ({ page }) => {
    await openScene(page, {
      query: "?scene=catalog",
      ready: ".catalog-state-scene",
    });
    // Installed fake time still flows in real time; freeze it so only
    // runFor() advances timers and Date.now().
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    const scene = page.locator(
      '.catalog-state-scene[lang="en"][data-theme="light"]',
    );
    await scene.getByRole("button", { name: "Show error" }).click();
    await scene.getByRole("button", { name: "Show notification" }).click();
    const status = scene.locator(".studio-toast[role=status]");
    const alert = scene.locator(".studio-toast[role=alert]");
    await expect(status).toHaveCount(1);
    await expect(alert).toHaveCount(1);
    await status.hover();
    await page.clock.runFor(6000);
    await expect(status).toHaveCount(1);
    await page.mouse.move(2, 2);
    await page.clock.runFor(4900);
    await expect(status).toHaveCount(1);
    await page.clock.runFor(200);
    await expect(status).toHaveCount(0);
    await page.clock.runFor(60_000);
    await expect(alert).toHaveCount(1);
    await alert.locator(".studio-toast__close").click();
    await expect(scene.locator(".studio-toast")).toHaveCount(0);
  });
});
