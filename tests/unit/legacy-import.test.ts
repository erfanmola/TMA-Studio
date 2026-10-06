import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LegacyImportService,
  legacyConfigCandidate,
} from "../../apps/studio/bunium/services/legacy-import";
import { StudioStore } from "../../apps/studio/bunium/services/store";
import type { CredentialApi } from "../../apps/studio/bunium/services/vault";
import { createSecretVault } from "../../apps/studio/bunium/services/vault";

const BOT_TOKEN = "12345:abcdefghijklmnopqrstuvwxyz123456";
const fixture = () => ({
  preferences: {
    theme_mode: "dark",
    ui: { scale: 1.25, sidebar: { collapsed: true } },
    project: {
      floating_window_on_top: true,
      floating_window_size: 420,
      shake_on_haptic: false,
      macos_vibrate_on_haptic: true,
    },
    intro: { skip: true },
    tabbar: { active: "project-legacy-one", tabs: [] },
    projects: [
      {
        id: "legacy-one",
        name: "Fixture mini app",
        url: "https://example.test/app",
        token: BOT_TOKEN,
        platforms: ["web", "weba", "macos"],
        settings: {
          web: { open: true, expanded: true, mode: "dark", floating: false },
        },
      },
    ],
    users: {
      active: 42,
      users: [
        {
          id: 42,
          first_name: "Mock User",
          last_name: "Fixture",
          username: "fixture_user",
          photo_url: "https://example.test/avatar.png",
          language_code: "en",
          is_premium: true,
          allows_write_to_pm: false,
        },
      ],
    },
    viewport: {},
  },
});

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "tma-legacy-import-"));
}

function credentialApi(): {
  api: CredentialApi;
  entries: Map<string, string>;
  failNextSet(): void;
} {
  const entries = new Map<string, string>();
  let shouldFailNextSet = false;
  return {
    entries,
    failNextSet() {
      shouldFailNextSet = true;
    },
    api: {
      async get({ name }) {
        return entries.get(name) ?? null;
      },
      async set({ name, value }) {
        if (shouldFailNextSet) {
          shouldFailNextSet = false;
          throw new Error("credential backend failure");
        }
        entries.set(name, value);
      },
      async delete({ name }) {
        return entries.delete(name);
      },
    },
  };
}

function setup(folder: string) {
  const sourcePath = join(folder, "config.json");
  const backupDirectory = join(folder, "new-studio", "legacy-import-backups");
  writeFileSync(sourcePath, JSON.stringify(fixture()));
  const store = new StudioStore();
  const credentials = credentialApi();
  const vault = createSecretVault({ platform: "darwin", api: credentials.api });
  const service = async () =>
    new LegacyImportService(store, await vault, {
      backupDirectory,
      platform: "darwin",
      homeDirectory: folder,
      environment: {},
    });
  return { sourcePath, backupDirectory, store, credentials, vault, service };
}

describe("legacy TMA Studio import", () => {
  test("detects only the platform userData JSON and maps Web K from verified legacy names", () => {
    expect(
      legacyConfigCandidate({
        platform: "darwin",
        homeDirectory: "/Users/tester",
        environment: {},
      }),
    ).toBe("/Users/tester/Library/Application Support/tma-studio/config.json");
    expect(
      legacyConfigCandidate({
        platform: "win32",
        homeDirectory: "C:/Users/tester",
        environment: { APPDATA: "C:/Users/tester/AppData/Roaming" },
      }),
    ).toBe("C:/Users/tester/AppData/Roaming/tma-studio/config.json");
    expect(
      legacyConfigCandidate({
        platform: "linux",
        homeDirectory: "/home/tester",
        environment: { XDG_CONFIG_HOME: "/home/tester/.config-alt" },
      }),
    ).toBe("/home/tester/.config-alt/tma-studio/config.json");
    expect(
      legacyConfigCandidate({
        platform: "freebsd",
        homeDirectory: "/home/tester",
        environment: {},
      }),
    ).toBeNull();
  });

  test("previews without exposing project names, URLs, or bot tokens", async () => {
    const folder = temporaryDirectory();
    const context = setup(folder);
    try {
      const service = await context.service();
      const preview = await service.previewFile(context.sourcePath);
      expect(preview.projectCount).toBe(1);
      expect(preview.mockUserCount).toBe(1);
      expect(preview.importableTokenCount).toBe(1);
      expect(preview.platformMappings.web).toBe("webk");
      expect(preview.platformMappings.weba).toBe("weba");
      const serialized = JSON.stringify(preview);
      expect(serialized).not.toContain(BOT_TOKEN);
      expect(serialized).not.toContain("Fixture mini app");
      expect(serialized).not.toContain("example.test");
    } finally {
      context.store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("backs up the original unchanged, moves tokens to the vault, and imports once", async () => {
    const folder = temporaryDirectory();
    const context = setup(folder);
    try {
      const sourceBefore = readFileSync(context.sourcePath);
      const result = await (await context.service()).importFile(
        context.sourcePath,
      );
      expect(result.status).toBe("imported");
      expect(result.importedProjectCount).toBe(1);
      expect(result.importedIdentityCount).toBe(1);
      expect(result.preferencesImported).toBe(true);
      expect(readFileSync(context.sourcePath)).toEqual(sourceBefore);
      const backup = join(
        context.backupDirectory,
        `legacy-${result.sourceSha256}.config.json`,
      );
      expect(readFileSync(backup)).toEqual(sourceBefore);
      expect(statSync(backup).mode & 0o777).toBe(0o600);
      expect(context.credentials.entries.size).toBe(1);
      expect([...context.credentials.entries.values()]).toEqual([BOT_TOKEN]);

      const snapshot = context.store.getSnapshot();
      expect(snapshot.projects).toHaveLength(1);
      expect(snapshot.projects[0]?.launch).toEqual({
        kind: "mock",
        signing: "bot-token",
        advanced: {},
      });
      expect(snapshot.projects[0]?.botTokenRef).toMatch(/^vault:v1:/u);
      expect(snapshot.settings?.theme).toBe("dark");
      expect(snapshot.settings?.uiScale).toBe(1.25);
      expect(snapshot.settings?.alwaysOnTop).toBe(true);
      expect(snapshot.settings?.hapticFrameShake).toBe(false);
      expect(JSON.stringify(snapshot)).not.toContain(BOT_TOKEN);

      const repeated = await (await context.service()).importFile(
        context.sourcePath,
      );
      expect(repeated.status).toBe("already-imported");
      expect(context.store.getSnapshot().projects).toHaveLength(1);
      expect(context.credentials.entries.size).toBe(1);
    } finally {
      context.store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("recovers an interrupted vault write using its staged reference", async () => {
    const folder = temporaryDirectory();
    const context = setup(folder);
    try {
      const interruptedService = await context.service();
      context.credentials.failNextSet();
      await expect(
        interruptedService.importFile(context.sourcePath),
      ).rejects.toMatchObject({ code: "VAULT_UNAVAILABLE" });
      expect(context.store.getSnapshot().projects).toHaveLength(0);
      const digest = (
        await (await context.service()).previewFile(context.sourcePath)
      ).sourceSha256;
      expect(context.store.getLegacyImport(digest)?.status).toBe("staged");

      const result = await (await context.service()).importFile(
        context.sourcePath,
      );
      expect(result.status).toBe("imported");
      expect(context.store.getSnapshot().projects).toHaveLength(1);
      expect(context.credentials.entries.size).toBe(1);
    } finally {
      context.store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("remaps a colliding project ID and reuses a matching mock identity", async () => {
    const folder = temporaryDirectory();
    const context = setup(folder);
    try {
      context.store.createIdentity({
        id: "existing-mock",
        kind: "mock",
        telegramId: "42",
        firstName: "Existing Mock",
        languageCode: "en",
        isPremium: false,
        revision: 1,
      });
      context.store.createProject({
        id: "legacy-one",
        name: "Existing project",
        url: "https://existing.test",
        avatarColorIndex: 0,
        identityId: "existing-mock",
        defaultMode: "expanded",
        launch: { kind: "mock", signing: "unsigned", advanced: {} },
        splash: {
          title: "Existing project",
          lightBackground: "#FFFFFF",
          darkBackground: "#19191B",
          presentation: "telegram",
        },
        createdAt: "2026-09-28T00:00:00Z",
        updatedAt: "2026-09-28T00:00:00Z",
        revision: 1,
      });
      const result = await (await context.service()).importFile(
        context.sourcePath,
      );
      expect(result.status).toBe("imported");
      expect(result.importedIdentityCount).toBe(0);
      expect(context.store.getSnapshot().projects).toHaveLength(2);
      expect(
        context.store
          .getSnapshot()
          .projects.find((project) => project.id !== "legacy-one")?.identityId,
      ).toBe("existing-mock");
      expect(
        result.warnings.some(
          (warning) => warning.code === "colliding-project-ids-remapped",
        ),
      ).toBe(true);
    } finally {
      context.store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("retains existing Studio preferences and refuses future or malformed files", async () => {
    const folder = temporaryDirectory();
    const context = setup(folder);
    try {
      const settings = {
        schemaVersion: 1 as const,
        revision: 0,
        locale: "fa" as const,
        theme: "system" as const,
        uiScale: 1 as const,
        alwaysOnTop: false,
        restoreWindows: true,
        closeToTray: false,
        hapticFrameShake: true,
        defaultDeviceId: "iphone",
        toolbarSide: "top" as const,
        update: {
          checkAutomatically: true,
          downloadAutomatically: false,
          channel: "stable" as const,
        },
      };
      context.store.updateSettings(settings, 0);
      const result = await (await context.service()).importFile(
        context.sourcePath,
      );
      expect(result.preferencesImported).toBe(false);
      expect(context.store.getSnapshot().settings?.locale).toBe("fa");
      expect(
        result.warnings.some(
          (warning) => warning.code === "existing-preferences-retained",
        ),
      ).toBe(true);

      const futurePath = join(folder, "future.json");
      writeFileSync(
        futurePath,
        JSON.stringify({ schemaVersion: 2, preferences: {} }),
      );
      await expect(
        (await context.service()).previewFile(futurePath),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_SCHEMA" });
      const malformedPath = join(folder, "malformed.json");
      writeFileSync(malformedPath, "{broken");
      await expect(
        (await context.service()).previewFile(malformedPath),
      ).rejects.toMatchObject({ code: "INVALID_FILE" });
    } finally {
      context.store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("uses a synthetic Guest and never imports a token into session-only storage", async () => {
    const folder = temporaryDirectory();
    const context = setup(folder);
    try {
      const unavailableVault = await createSecretVault({
        platform: "darwin",
        api: {
          async get() {
            throw new Error("unavailable");
          },
          async set() {
            throw new Error("unavailable");
          },
          async delete() {
            throw new Error("unavailable");
          },
        },
      });
      const service = new LegacyImportService(context.store, unavailableVault, {
        backupDirectory: context.backupDirectory,
      });
      await expect(
        service.importFile(context.sourcePath),
      ).rejects.toMatchObject({
        code: "VAULT_UNAVAILABLE",
      });
      expect(context.store.getSnapshot().projects).toHaveLength(0);
      expect(context.credentials.entries.size).toBe(0);
    } finally {
      context.store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
