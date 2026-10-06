import { expect, fingerprint, openScene, test } from "./fixtures";
import { scenes } from "./scenes";

for (const scene of scenes) {
  for (const scale of scene.scales) {
    for (const theme of scene.documentThemes ?? [undefined]) {
      const tags = scene.dpr2 && scale === 1 ? " @dpr2" : "";
      const title = `${scene.id} scale ${scale * 100}%${theme ? ` ${theme}` : ""}`;
      test(`@snapshot ${title}${tags}`, async ({ page }, info) => {
        await openScene(page, {
          fullCapture: true,
          query: scene.query,
          ready: scene.panel,
          scale,
          sceneId: scene.id,
          theme,
        });
        const panels = page.locator(scene.panel);
        const count = await panels.count();
        expect(count, "scene panels").toBeGreaterThan(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          "no horizontal page overflow",
        ).toBe(true);
        await info.attach("environment.json", {
          body: JSON.stringify(
            await fingerprint(page, { count, scale, scene: scene.id, theme }),
            null,
            2,
          ),
          contentType: "application/json",
        });
        for (let index = 0; index < count; index += 1) {
          const panel = panels.nth(index);
          const panelTheme =
            theme ?? (await panel.getAttribute("data-theme")) ?? "light";
          const locale =
            (await panel.getAttribute("data-locale")) ??
            (await panel.getAttribute("lang")) ??
            "en";
          const name = `${scene.id}-${panelTheme}-${locale}-s${scale * 100}`;
          await expect(panel).toHaveScreenshot(`${name}.png`);
        }
      });
    }
  }
}

for (const locale of ["en", "fa"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`@snapshot home 05a ${theme} ${locale}`, async ({ page }) => {
      await openScene(page, {
        query: `?scene=home&locale=${locale}&theme=${theme}&update=available`,
        ready: ".home-window",
        sceneId: "home",
      });
      const home = page.locator(".home-window");
      await expect(home).toHaveScreenshot(`home-${theme}-${locale}.png`);
    });
  }
}

test.describe("interaction states", () => {
  test("@snapshot controls combobox open", async ({ page }) => {
    await openScene(page, {
      fullCapture: true,
      query: "?scene=controls",
      ready: ".control-state-scene",
      sceneId: "controls",
    });
    await page.focus("#profile-light-en");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#profile-light-en-listbox")).toHaveScreenshot(
      "controls-listbox-light-en.png",
    );
  });

  test("@snapshot controls menu open rtl", async ({ page }) => {
    await openScene(page, {
      fullCapture: true,
      query: "?scene=controls",
      ready: ".control-state-scene",
      sceneId: "controls",
    });
    await page.focus("#actions-dark-fa-button");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#actions-dark-fa-menu")).toHaveScreenshot(
      "controls-menu-dark-fa.png",
    );
  });

  test("@snapshot catalog destructive dialog rtl", async ({ page }) => {
    await openScene(page, {
      fullCapture: true,
      query: "?scene=catalog",
      ready: ".catalog-state-scene",
      sceneId: "catalog",
    });
    await page
      .locator('.catalog-state-scene[lang="fa"][data-theme="light"]')
      .getByRole("button", { name: "حذف کاربر" })
      .click();
    await expect(page.locator("#delete-light-fa")).toHaveScreenshot(
      "catalog-dialog-light-fa.png",
    );
  });
});
