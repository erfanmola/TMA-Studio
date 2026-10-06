import { expect, test } from "./fixtures";

test("iOS profile presents a labeled CEF preview sheet with illustrative safe areas", async ({
  page,
}) => {
  await page.goto("/?scene=ios-profile-review");
  const chrome = page.locator(".ios-chrome");
  await expect(chrome).toHaveAttribute("data-mode", "overlay");
  await expect(chrome).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByText("Illustrative safe areas · not device measurements"),
  ).toBeVisible();
  await expect(
    page.getByText("CEF preview · not WebKit").first(),
  ).toBeVisible();

  const menu = page.getByRole("button", { name: "Open iOS preview sheet" });
  await menu.click();
  const sheet = page.getByRole("dialog", { name: "iOS profile preview" });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByText(
      /CEF does not provide iOS presentation or WebKit behavior/u,
    ),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Close preview sheet" }).click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(sheet).toBeHidden();
  await expect(menu).toBeFocused();

  await page
    .getByRole("combobox", { name: "Launch mode" })
    .selectOption("expanded");
  await expect(chrome).toHaveAttribute("data-mode", "expanded");
  await page.getByRole("button", { name: "Change Mini App theme" }).click();
  await expect(chrome).toHaveAttribute("data-theme", "dark");
});
