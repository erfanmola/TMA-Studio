import { expect, test } from "./fixtures";

test("wallpaper transfers independent canvases and stays static for reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?scene=wallpaper-review");
  const instances = page.locator(".studio-wallpaper");
  await expect(instances).toHaveCount(2);
  await expect(instances.nth(0)).toHaveAttribute("data-state", "ready");
  await expect(instances.nth(1)).toHaveAttribute("data-state", "ready");
  await expect(instances.nth(0)).toHaveAttribute("data-motion", "reduced");
  await expect(instances.nth(1)).toHaveAttribute("data-motion", "reduced");
  await expect(instances.nth(0)).toHaveAttribute("data-animated", "false");
  await expect(instances.nth(1)).toHaveAttribute("data-animated", "false");

  const canvases = await instances.evaluateAll((elements) =>
    elements.map((element) => {
      const canvas = element.querySelector("canvas");
      return {
        instance: element.getAttribute("data-instance"),
        transferred:
          canvas instanceof HTMLCanvasElement &&
          canvas.width > 0 &&
          canvas.height > 0,
        placeholderHidden: element
          .querySelector(".studio-wallpaper__placeholder")
          ?.hasAttribute("hidden"),
      };
    }),
  );
  expect(canvases).toEqual([
    { instance: "light", transferred: true, placeholderHidden: true },
    { instance: "dark", transferred: true, placeholderHidden: true },
  ]);
});
