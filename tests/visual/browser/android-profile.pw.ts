import { expect, test } from "./fixtures";

test("Android profile chrome labels simulated navigation and resumes its surface", async ({
  page,
}) => {
  await page.goto("/?scene=android-profile-review");
  await expect(
    page.getByRole("status", { name: "Android status bar approximation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Left" }).click();
  await expect(page.locator(".tma-view")).toHaveAttribute("data-side", "left");
  await page.getByRole("button", { name: "Expanded" }).click();
  await expect(page.locator(".android-chrome__mode")).toHaveText("expanded");
  await page.getByRole("button", { name: "Change Mini App theme" }).click();
  await expect(page.locator(".tma-view")).toHaveAttribute("data-theme", "dark");
  const nav = page.getByRole("navigation", {
    name: "Android navigation (simulated)",
  });
  await nav.getByRole("button", { name: "Android Home (simulated)" }).click();
  await expect(page.locator(".android-chrome")).toHaveAttribute(
    "data-surface",
    "telegram",
  );
  await expect(
    page.getByText(
      "Simulated Android surface; host and guest remain active in this preview.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume Mini App" }).click();
  await expect(page.locator(".android-chrome")).toHaveAttribute(
    "data-surface",
    "mini-app",
  );
  await nav
    .getByRole("button", { name: "Android recent tasks (simulated)" })
    .click();
  await expect(page.locator(".android-chrome")).toHaveAttribute(
    "data-surface",
    "tasks",
  );
});
