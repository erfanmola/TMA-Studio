import { expect, openScene, test } from "./fixtures";

test.describe("Home window 05a", () => {
  test("renders loading, error, empty, missing-target, and update states", async ({
    page,
  }) => {
    for (const state of ["loading", "error", "empty", "missing"]) {
      await openScene(page, {
        query: `?scene=home&state=${state}&locale=en&theme=light`,
        ready: ".home-window",
      });
      const scene = page.locator(`[data-scene="home-${state}-light-en"]`);
      if (state === "loading")
        await expect(scene.getByRole("status")).toContainText(
          "Loading recent projects",
        );
      if (state === "error")
        await expect(scene.getByRole("alert")).toContainText(
          "could not be loaded",
        );
      if (state === "empty")
        await expect(
          scene.getByText("Your recent projects will appear here."),
        ).toBeVisible();
      if (state === "missing")
        await expect(
          scene.getByText("Project file is unavailable"),
        ).toBeVisible();
      if (state === "missing")
        await expect(
          scene.getByRole("button", {
            name: "Atlas Wallet — Project file is unavailable",
          }),
        ).toBeDisabled();
    }
    await openScene(page, {
      query: "?scene=home&update=available&locale=en&theme=dark",
      ready: ".home-window",
    });
    await expect(page.getByRole("status")).toContainText("Update available");
    await expect(
      page.getByRole("link", { name: "View release notes" }),
    ).toBeVisible();
  });

  test("keeps recent removal separate from opening and project deletion", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=home&locale=en&theme=light",
      ready: ".home-window",
    });
    const scene = page.locator('[data-scene="home-default-light-en"]');
    await scene
      .getByRole("button", { name: "Orbit Store — localhost:3000" })
      .click();
    await expect(scene).toHaveAttribute(
      "data-home-action",
      "project:orbit-store",
    );
    await scene
      .getByRole("button", { name: "Remove Orbit Store from recent projects" })
      .click();
    await expect(scene).toHaveAttribute(
      "data-home-action",
      "remove:orbit-store",
    );
    await expect(
      scene.getByRole("button", { name: /Orbit Store/ }),
    ).toHaveCount(0);
    await expect(
      scene.getByRole("button", { name: "Create project" }),
    ).toBeVisible();
    await expect(
      scene.getByRole("button", { name: /Delete project/ }),
    ).toHaveCount(0);
  });

  test("fits all five locales and both themes without horizontal overflow", async ({
    page,
  }) => {
    for (const locale of ["en", "ru", "de", "fa", "ar"]) {
      for (const theme of ["light", "dark"]) {
        const state = `home-default-${theme}-${locale}`;
        await openScene(page, {
          query: `?scene=home&locale=${locale}&theme=${theme}`,
          ready: ".home-window",
        });
        const scene = page.locator(`[data-scene="${state}"]`);
        await expect(scene.locator(".home-window__title")).toBeVisible();
        const widths = await scene.evaluate((element) => ({
          client: element.clientWidth,
          scroll: element.scrollWidth,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client);
        expect(await scene.getAttribute("dir")).toBe(
          locale === "fa" || locale === "ar" ? "rtl" : "ltr",
        );
      }
    }
  });
});
