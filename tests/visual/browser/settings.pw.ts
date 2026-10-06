import { expect, openScene, test } from "./fixtures";

test.describe("Settings window 05d", () => {
  test("renders five tabs with guest-dimension independence note", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=settings",
      ready: ".settings-window",
    });
    await expect(page.locator(".settings-window")).toHaveCount(4);
    const scene = page.locator('[data-scene="settings-light-en"]');
    await expect(scene.getByRole("tab")).toHaveCount(5);
    await expect(scene.getByLabel("Language")).toBeVisible();
    await expect(
      scene.getByRole("switch", { name: "Always on top" }),
    ).toBeVisible();
    await scene.getByRole("tab", { name: "Simulators" }).click();
    await expect(scene.getByLabel("Default device")).toBeVisible();
    await expect(
      scene.getByText(/Guest viewport 412×915 at 2.5x/),
    ).toBeVisible();
    await expect(
      scene.getByText(/independent of host display scale/),
    ).toBeVisible();
    await scene.getByRole("tab", { name: "Captures" }).click();
    await expect(scene.getByText(/not editable in this step/)).toBeVisible();
  });

  test("edits locale and persists dirty state across five locales", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=settings",
      ready: ".settings-window",
    });
    const scene = page.locator('[data-scene="settings-dark-en"]');
    await expect(scene.locator(".settings-window__badge")).toHaveText("Saved");
    await scene.getByLabel("Language").selectOption("fa");
    await expect(scene.locator(".settings-window__badge")).toHaveText(
      "Unsaved changes",
    );
    await scene.getByRole("button", { name: /Save settings/ }).click();
    await expect(scene.locator(".settings-window__badge")).toHaveText("Saved");
    const faScene = page.locator('[data-scene="settings-light-fa"]');
    await expect(faScene.getByRole("tab").first()).toBeVisible();
  });

  test("measures storage with unknown-never-zero and clears cache", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=settings",
      ready: ".settings-window",
    });
    const scene = page.locator('[data-scene="settings-light-en"]');
    await scene.getByRole("tab", { name: "Storage" }).click();
    await scene.getByRole("button", { name: "Measure usage" }).click();
    await expect(
      scene.getByRole("row", { name: /project-orbit/ }).first(),
    ).toBeVisible();
    await expect(scene.getByText("Unknown").first()).toBeVisible();
    const cacheButton = scene
      .getByRole("button", { name: "Clear cache" })
      .first();
    await cacheButton.click();
    await expect(
      scene.getByText("Cleared. Usage was remeasured."),
    ).toBeVisible();
  });
});
