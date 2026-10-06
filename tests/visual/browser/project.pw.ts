import { expect, openScene, test } from "./fixtures";

const projectScene = (key: string) => `[data-scene="${key}"]`;

test.describe("Project window 05b", () => {
  test("renders create and manage variants with six disabled create actions", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=project",
      ready: ".project-window",
    });
    await expect(page.locator(".project-window")).toHaveCount(4);
    const create = page.locator(projectScene("create-light-en"));
    const manage = page.locator(projectScene("manage-dark-en"));
    await expect(
      create.locator(".project-launch__action:disabled"),
    ).toHaveCount(6);
    await expect(
      manage.locator(".project-launch__action:disabled"),
    ).toHaveCount(0);
    await expect(manage.getByText(/bot token is saved/i)).toBeVisible();
    await expect(manage.getByLabel("Bot token · Optional")).toHaveCount(0);
  });

  test("validates and saves identity, mode, typed parameters and splash without exposing token", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=project",
      ready: ".project-window",
    });
    const scene = page.locator(projectScene("create-light-en"));
    await scene.getByRole("button", { name: "Save project" }).click();
    await expect(scene.locator('[aria-invalid="true"]')).toHaveCount(2);
    await scene.getByLabel("Project name").fill("Orbit Draft");
    await scene
      .getByLabel("Mini App URL")
      .fill("https://user:pass@example.test/");
    await scene.getByRole("button", { name: "Save project" }).click();
    await expect(scene.locator('[aria-invalid="true"]')).toHaveCount(1);
    await scene
      .getByLabel("Mini App URL")
      .fill("https://orbit.example/miniapp");
    const secret = `543210:${"Z".repeat(35)}`;
    await scene.getByLabel("Bot token · Optional").fill(secret);
    await scene.getByRole("radio", { name: "Fullscreen" }).click();
    await scene.getByLabel("User").selectOption("__create-user__");
    const newUser = page.locator("#create-light-en-create-user");
    await newUser.getByLabel("First name").fill("Project User");
    await newUser.getByLabel("Telegram ID").fill("123456789012345");
    await newUser.getByRole("button", { name: "Save user" }).click();
    await expect(scene.getByRole("combobox", { name: "User" })).toHaveValue(
      "mock-user-1",
    );

    await scene.getByRole("button", { name: "Configure" }).click();
    await scene.getByLabel("Start parameter").fill("start_42");
    await scene.getByRole("switch", { name: "Launch from a chat" }).click();
    await scene.getByLabel("Chat type").selectOption("channel");
    await scene.getByLabel("Chat ID").fill("-1001234567890");
    await scene.getByLabel("Chat title").fill("Orbit News");
    await scene.getByRole("switch", { name: "Include a receiver" }).click();
    await scene.getByLabel("Receiver ID").fill("4242");
    await scene.getByLabel("Receiver first name").fill("Lin");
    await scene.screenshot({ path: "/tmp/05b-project-launch.png" });
    await scene.getByRole("button", { name: "Back to project" }).click();
    await scene.getByRole("button", { name: "Customize" }).click();
    await scene.getByLabel("Title").fill("Orbit Launch");
    await scene
      .locator("#create-light-en-splash-lightBackground")
      .fill("#F0F0FF");
    await expect(
      scene.locator(".project-splash-preview__title").first(),
    ).toHaveText("Orbit Launch");
    await scene.screenshot({ path: "/tmp/05b-project-splash.png" });
    await scene.getByRole("button", { name: "Back to project" }).click();
    await scene.getByRole("button", { name: "Save project" }).click();

    await expect(scene.locator(".project-launch__action:disabled")).toHaveCount(
      0,
    );
    await expect(scene.getByLabel("Bot token · Optional")).toHaveCount(0);
    await expect(scene).not.toContainText(secret);
    await expect(
      scene.getByText(/bot token is saved in the credential store/i),
    ).toBeVisible();
  });

  test("retains failed saves and handles dirty close cancel, discard and save", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=project",
      ready: ".project-window",
    });
    const scene = page.locator(projectScene("create-dark-fa"));
    await scene.getByLabel("نام پروژه").fill("Save From Close");
    await scene.getByLabel("نشانی مینی‌اپ").fill("http://localhost:5173");
    await scene.getByRole("button", { name: "بستن پنجره" }).click();
    await expect(scene.getByRole("dialog")).toBeVisible();
    await scene.getByRole("button", { name: "ذخیره", exact: true }).click();
    await expect(scene.locator("[data-closed]")).toHaveAttribute(
      "data-closed",
      "1",
    );

    const other = page.locator(projectScene("create-light-en"));
    await other.getByLabel("Project name").fill("Draft retained");
    await other.getByLabel("Mini App URL").fill("http://localhost:5173");
    await other.getByRole("button", { name: "Fail next save" }).click();
    await other.getByRole("button", { name: "Save project" }).click();
    await expect(other.getByLabel("Project name")).toHaveValue(
      "Draft retained",
    );
    await expect(other.locator("[role=alert]")).toBeVisible();
    await other.getByRole("button", { name: "Save project" }).click();
    await expect(other.locator(".project-launch__action:disabled")).toHaveCount(
      0,
    );
    await other.getByLabel("Project name").fill("Unsaved change");
    await other.getByRole("button", { name: "Close window" }).click();
    const prompt = other.getByRole("dialog");
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(other.locator("[data-closed]")).toHaveAttribute(
      "data-closed",
      "0",
    );
    await other.getByRole("button", { name: "Close window" }).click();
    await other
      .getByRole("dialog")
      .getByRole("button", { name: "Don't save" })
      .click();
    await expect(other.locator("[data-closed]")).toHaveAttribute(
      "data-closed",
      "1",
    );
  });

  test("resolves conflicts by preserving changed draft fields or reloading explicitly", async ({
    page,
  }) => {
    await openScene(page, {
      query: "?scene=project",
      ready: ".project-window",
    });
    const overwrite = page.locator(projectScene("manage-dark-en"));
    await overwrite.getByLabel("Project name").fill("Local Rename");
    await overwrite.getByRole("button", { name: "Remote edit" }).click();
    await overwrite.getByRole("button", { name: "Save project" }).click();
    await expect(overwrite.getByRole("dialog")).toBeVisible();
    await overwrite.getByRole("button", { name: "Keep my changes" }).click();
    await expect(overwrite.getByLabel("Project name")).toHaveValue(
      "Local Rename",
    );
    await expect(overwrite.getByLabel("Mini App URL")).toHaveValue(
      "https://orbit.example",
    );

    await overwrite.getByRole("button", { name: "Remove token" }).click();
    await overwrite.getByLabel("Project name").fill("Token Removed");
    await overwrite.getByRole("button", { name: "Remote edit" }).click();
    await overwrite.getByRole("button", { name: "Save project" }).click();
    await overwrite.getByRole("button", { name: "Keep my changes" }).click();
    await expect(overwrite.getByLabel("Bot token · Optional")).toHaveValue("");
    await expect(overwrite).not.toContainText(/\d{5,16}:[A-Za-z0-9_-]{30,64}/);

    const reload = page.locator(projectScene("manage-light-fa"));
    await reload.getByLabel("نام پروژه").fill("Discard This Draft");
    await reload.getByRole("button", { name: "Remote edit" }).click();
    await reload.getByRole("button", { name: "ذخیره پروژه" }).click();
    await expect(reload.getByRole("dialog")).toBeVisible();
    await reload.getByRole("button", { name: "بارگذاری تازه‌ترین" }).click();
    await expect(reload.getByLabel("نام پروژه")).toHaveValue("Orbit Store");
    await expect(reload.getByLabel("نشانی مینی‌اپ")).toHaveValue(
      "https://orbit.example",
    );
  });
});
