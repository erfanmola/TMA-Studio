import { expect, openScene, test } from "./fixtures";

test.describe("Users and Mock User windows 05c", () => {
  test("signs in with a synthetic fixture, lists the account, selects it, and refreshes read-only profile", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=users&locale=en&theme=light",
      ready: ".users-feature .studio-window",
    });
    const scene = page.locator('[data-scene="users-light-en"]');
    await scene.getByRole("button", { name: "Log in to Telegram" }).click();
    const login = scene.locator(".account-login");
    await expect(
      login.getByText(/Session-only storage is active/),
    ).toBeVisible();
    await login.getByLabel("Phone number").fill("+15555550123");
    await login.getByRole("button", { name: "Continue" }).click();
    await expect(login.getByText("+15••••23")).toBeVisible();
    await login.getByLabel("Code").fill("11111");
    await login.getByRole("button", { name: "Continue" }).click();
    await login
      .getByLabel("Two-step verification password")
      .fill("fixture-2fa");
    await login.getByRole("button", { name: "Continue" }).click();
    await expect(login).toBeHidden();
    await expect(
      scene.locator('[data-returned-identity="fixture-identity"]'),
    ).toHaveAttribute("data-returned-identity", "fixture-identity");
    const account = scene.locator(
      "#users-light-en-window-list-fixture-identity",
    );
    await expect(account).toBeVisible();
    await account.click();
    await expect(
      scene.locator("#users-light-en-detail-telegram-id"),
    ).toBeDisabled();
    await scene.locator("#users-light-en-detail-refresh-profile").click();
    await expect(scene.getByText("Profile is up to date.")).toBeVisible();
    const pageText = await scene.innerText();
    expect(pageText).not.toContain("+15555550123");
    expect(pageText).not.toContain("fixture-2fa");
  });

  test("keeps an invalid code challenge active for correction", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=users&locale=en&theme=light",
      ready: ".users-feature .studio-window",
    });
    const scene = page.locator('[data-scene="users-light-en"]');
    await scene.getByRole("button", { name: "Log in to Telegram" }).click();
    const login = scene.locator(".account-login");
    await login.getByLabel("Phone number").fill("+15555550123");
    await login.getByRole("button", { name: "Continue" }).click();
    await login.getByLabel("Code").fill("00000");
    await login.getByRole("button", { name: "Continue" }).click();
    await expect(login.getByRole("alert")).toBeVisible();
    await expect(login.getByLabel("Code")).toBeVisible();
    await login.getByLabel("Code").fill("12345");
    await login.getByRole("button", { name: "Continue" }).click();
    await expect(login).toBeHidden();
  });

  test.describe("flood wait", () => {
    test.use({ clockMode: "fake" });
    test("counts down and resumes phone entry without retrying automatically", async ({
      page,
    }) => {
      await openScene(page, {
        query: "?scene=users&locale=en&theme=light",
        ready: ".users-feature .studio-window",
      });
      const scene = page.locator('[data-scene="users-light-en"]');
      await scene.getByRole("button", { name: "Log in to Telegram" }).click();
      const login = scene.locator(".account-login");
      await login.getByLabel("Phone number").fill("+15555550124");
      await login.getByRole("button", { name: "Continue" }).click();
      await expect(
        login.getByText("Wait 1 seconds before trying again."),
      ).toBeVisible();
      await page.clock.fastForward(1100);
      await expect(login.getByLabel("Phone number")).toBeVisible();
      await expect(
        login.getByRole("button", { name: "Continue" }),
      ).toBeEnabled();
    });
  });

  test("creates mock users in every locale without horizontal overflow", async ({
    page,
  }) => {
    for (const locale of ["en", "ru", "de", "fa", "ar"]) {
      await openScene(page, {
        query: `?scene=users&locale=${locale}&theme=light`,
        ready: `[data-scene="users-light-${locale}"] .studio-window`,
      });
      const sceneId = `users-light-${locale}`;
      const scene = page.locator(`[data-scene="${sceneId}"]`);
      await scene.locator(`#${sceneId}-window-create`).click();
      await scene.locator(`#${sceneId}-detail-first`).fill(`Test ${locale}`);
      await scene
        .locator(`#${sceneId}-detail-telegram-id`)
        .fill(`7654321${locale.length}`);
      await scene.locator(`#${sceneId}-detail-save`).click();
      await expect(
        scene.locator(`#${sceneId}-window-list-mock-user-1`),
      ).toBeVisible();
      const widths = await scene.evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    }
  });

  test("shows the real profile as read-only across all five locales", async ({
    page,
  }) => {
    for (const locale of ["en", "ru", "de", "fa", "ar"]) {
      await openScene(page, {
        query: `?scene=users&locale=${locale}&theme=${locale === "ar" || locale === "fa" ? "dark" : "light"}`,
        ready: `[data-scene="users-${locale === "ar" || locale === "fa" ? "dark" : "light"}-${locale}"] .studio-window`,
      });
      const scene = page.locator(
        `[data-scene="users-${locale === "ar" || locale === "fa" ? "dark" : "light"}-${locale}"]`,
      );
      await expect(
        scene.getByText(
          /read-only|فقط‌خواندنی|للقراءة فقط|только чтение|nur lesen/i,
        ),
      ).toBeVisible();
      await scene
        .locator(
          `#users-${locale === "ar" || locale === "fa" ? "dark" : "light"}-${locale}-window-list-telegram-sara`,
        )
        .click();
      await expect(scene.locator(".users-feature__placeholder")).toBeVisible();
      await expect(
        scene.getByLabel(
          /Telegram ID|شناسه تلگرام|ID Telegram|Telegram-ID|معرّف تيليجرام/i,
        ),
      ).toBeDisabled();
      await expect(
        scene.getByRole("button", {
          name: /Delete mock user|حذف کاربر ساختگی|Удалить тестового пользователя|Mock-Benutzer löschen|حذف المستخدم الوهمي/i,
        }),
      ).toHaveCount(0);
    }
  });

  test("creates and edits a mock profile, rejects bad values, and falls back from a broken photo", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=users&locale=en&theme=light",
      ready: ".users-feature .studio-window",
    });
    const scene = page.locator('[data-scene="users-light-en"]');
    await expect(
      scene.locator(".studio-avatar__initials").filter({ hasText: "NR" }),
    ).toBeVisible();
    await scene.getByRole("button", { name: "Create mock user" }).click();
    await scene.getByLabel("First name").fill("Mina");
    await scene.getByLabel("Telegram ID").fill("not-a-number");
    await scene.getByLabel("Avatar image URL").fill("javascript:alert(1)");
    await scene.getByRole("button", { name: "Save user" }).click();
    await expect(scene.getByText("Enter a decimal numeric ID.")).toBeVisible();
    await expect(
      scene.getByText("Use a valid HTTP or HTTPS image URL."),
    ).toBeVisible();
    await scene.getByLabel("Telegram ID").fill("123456789012345");
    await scene.getByLabel("Avatar image URL").fill("");
    await scene.getByRole("button", { name: "Save user" }).click();
    await expect(scene.getByRole("button", { name: /Mina/ })).toBeVisible();
    await expect(
      scene.locator('[data-returned-identity="mock-user-1"]'),
    ).toHaveAttribute("data-returned-identity", "mock-user-1");
    await scene.getByLabel("First name").fill("Mina Renamed");
    await scene.getByRole("button", { name: "Save user" }).click();
    await expect(
      scene.getByRole("button", { name: /Mina Renamed/ }),
    ).toBeVisible();
  });

  test("reassigns referenced projects before deleting a mock user", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=users&locale=en&theme=dark",
      ready: ".users-feature .studio-window",
    });
    const scene = page.locator('[data-scene="users-dark-en"]');
    await scene.getByRole("button", { name: "Delete mock user" }).click();
    const dialog = scene.getByRole("dialog");
    await expect(dialog.getByText("Orbit Store")).toBeVisible();
    await expect(dialog.getByText("Paper Plane")).toBeVisible();
    await dialog.getByLabel("Reassign projects to").selectOption("mock-nima");
    await dialog.getByRole("button", { name: "Delete mock user" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      scene.getByRole("button", { name: /Alex Morgan/ }),
    ).toHaveCount(0);
  });

  test("returns the newly saved mock identity to the Project draft", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=project",
      ready: ".project-window",
    });
    const scene = page.locator('[data-scene="create-light-en"]');
    await scene.getByLabel("User").selectOption("__create-user__");
    const user = page.locator("#create-light-en-create-user");
    await expect(user).toBeVisible();
    await user.getByLabel("First name").fill("Mina");
    await user.getByLabel("Telegram ID").fill("123456789012345");
    await user.getByRole("button", { name: "Save user" }).click();
    await expect(scene.getByLabel("User")).toHaveValue("mock-user-1");
    await expect(scene.getByLabel("Project name")).toHaveValue("");
  });
});
