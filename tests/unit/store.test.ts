import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMigrations,
  currentSchemaVersion,
  type Migration,
  UnsupportedSchemaError,
} from "../../apps/studio/bunium/services/migrations";
import {
  StoreConflictError,
  StudioStore,
} from "../../apps/studio/bunium/services/store";
import type { Project } from "../../apps/studio/src/contracts/entities";

const folders: string[] = [];
const temporaryFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), "tma-store-test-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

const project = (id = "project-1"): Project => ({
  id,
  name: "Local app",
  url: "http://localhost:3000",
  avatarColorIndex: 2,
  identityId: "mock-1",
  defaultMode: "overlay",
  launch: { kind: "mock", signing: "unsigned", advanced: {} },
  splash: {
    title: "Loading",
    lightBackground: "#ffffff",
    darkBackground: "#000000",
    presentation: "project",
  },
  createdAt: "2026-09-25T10:00:00Z",
  updatedAt: "2026-09-25T10:00:00Z",
  revision: 0,
});
const settings = {
  schemaVersion: 1 as const,
  revision: 0,
  locale: "en" as const,
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

describe("SQLite studio store", () => {
  test("persists validated DTOs across restart without storing secret material", () => {
    const file = join(temporaryFolder(), "studio.sqlite");
    const first = new StudioStore(file);
    first.createProject(project());
    expect(first.getSnapshot().revision).toBe(1);
    first.close();

    const reopened = new StudioStore(file);
    expect(reopened.getSnapshot().projects[0]?.name).toBe("Local app");
    expect(reopened.getSnapshot().revision).toBe(1);
    reopened.close();
    const raw = readFileSync(file).toString("latin1");
    expect(raw.includes("botToken")).toBe(false);
    expect(raw.includes("sessionString")).toBe(false);
  });

  test("serializes competing editors and rejects stale optimistic revisions", () => {
    const file = join(temporaryFolder(), "studio.sqlite");
    const left = new StudioStore(file);
    const right = new StudioStore(file);
    left.createProject(project());
    const oldRevision = right.getProject("project-1").project.revision;
    left.updateProject("project-1", oldRevision, { name: "First editor" });
    expect(() =>
      right.updateProject("project-1", oldRevision, { name: "Stale editor" }),
    ).toThrow(StoreConflictError);
    expect(right.getProject("project-1").project.name).toBe("First editor");
    expect(right.getSnapshot().revision).toBe(2);
    left.close();
    right.close();
  });

  test("persists settings with an optimistic revision and rejects a stale settings editor", () => {
    const file = join(temporaryFolder(), "settings.sqlite");
    const first = new StudioStore(file);
    const saved = first.updateSettings(settings, 0);
    expect(saved.alwaysOnTop).toBe(false);
    expect(saved.revision).toBe(1);
    expect(() =>
      first.updateSettings({ ...settings, alwaysOnTop: true }, 0),
    ).toThrow(StoreConflictError);
    first.close();
    const reopened = new StudioStore(file);
    expect(reopened.getSnapshot().settings?.alwaysOnTop).toBe(false);
    expect(reopened.getSnapshot().settings?.revision).toBe(1);
    reopened.close();
  });

  test("snapshot subscription is atomic and revision gaps return a fresh snapshot", () => {
    const store = new StudioStore();
    const revisions: number[] = [];
    const subscription = store.snapshotAndSubscribe((change) =>
      revisions.push(change.revision),
    );
    expect(subscription.snapshot.revision).toBe(0);
    store.createProject(project());
    store.updateProject("project-1", 1, { name: "Updated" });
    expect(revisions).toEqual([1, 2]);
    const recovered = store.subscribeFrom(0, () => undefined);
    expect(recovered.gap).toBe(true);
    expect(recovered.snapshot.revision).toBe(2);
    const current = store.subscribeFrom(2, () => undefined);
    expect(current.gap).toBe(false);
    subscription.unsubscribe();
    recovered.unsubscribe();
    current.unsubscribe();
    store.close();
  });

  test("recent projects persist, removal is not deletion, and stale targets remain visible", () => {
    const file = join(temporaryFolder(), "recents.sqlite");
    const store = new StudioStore(file);
    store.createProject(project("recent-one"));
    store.createProject(project("recent-two"));
    store.markRecentProject("recent-one", "2026-09-25T10:00:00Z");
    store.markRecentProject("recent-two", "2026-09-25T11:00:00Z");
    expect(store.listRecentProjects().map((entry) => entry.id)).toEqual([
      "recent-two",
      "recent-one",
    ]);

    expect(store.removeRecentProject("recent-one")).toBe(true);
    expect(store.getProject("recent-one").project.name).toBe("Local app");
    expect(store.listRecentProjects().map((entry) => entry.id)).toEqual([
      "recent-two",
    ]);

    store.deleteProject("recent-two", 1);
    expect(store.listRecentProjects()).toEqual([
      {
        id: "recent-two",
        lastOpenedAt: "2026-09-25T11:00:00Z",
        status: "missing",
      },
    ]);
    store.close();

    const reopened = new StudioStore(file);
    expect(reopened.listRecentProjects()[0]?.status).toBe("missing");
    reopened.close();
  });

  test("failed writes roll back records and global revision", () => {
    const store = new StudioStore();
    expect(() =>
      store.createProject({ ...project(), url: "javascript:alert(1)" }),
    ).toThrow();
    expect(store.getSnapshot()).toEqual({
      revision: 0,
      projects: [],
      settings: null,
    });
    store.close();
  });

  test("failed migration rolls back schema changes and retry journals one applied migration", () => {
    const folder = temporaryFolder();
    const file = join(folder, "studio.sqlite");
    const backups = join(folder, "backups");
    const store = new StudioStore(file);
    store.close();
    const database = new Database(file);
    const failing: Migration = {
      version: 8,
      name: "test-failing-change",
      up(db) {
        db.exec("CREATE TABLE retry_probe (id INTEGER)");
        throw new Error("injected migration failure");
      },
    };
    expect(() =>
      applyMigrations(
        database,
        [
          { version: 1, name: "initial", up() {} },
          { version: 2, name: "identities", up() {} },
          { version: 3, name: "partitions", up() {} },
          { version: 4, name: "protocol-storage", up() {} },
          { version: 5, name: "recent-projects", up() {} },
          { version: 6, name: "legacy-imports", up() {} },
          { ...failing, version: 8 },
        ],
        { databaseFile: file, backupDirectory: backups },
      ),
    ).toThrow("injected migration failure");
    expect(currentSchemaVersion(database)).toBe(7);
    expect(
      database
        .query("SELECT 1 FROM sqlite_master WHERE name = 'retry_probe'")
        .get(),
    ).toBeNull();
    const succeeded: Migration = {
      version: 8,
      name: "test-retry",
      up(db) {
        db.exec("CREATE TABLE retry_probe (id INTEGER)");
      },
    };
    applyMigrations(
      database,
      [
        { version: 1, name: "initial", up() {} },
        { version: 2, name: "identities", up() {} },
        { version: 3, name: "partitions", up() {} },
        { version: 4, name: "protocol-storage", up() {} },
        { version: 5, name: "recent-projects", up() {} },
        { version: 6, name: "legacy-imports", up() {} },
        { ...succeeded, version: 8 },
      ],
      { databaseFile: file, backupDirectory: backups },
    );
    applyMigrations(
      database,
      [
        { version: 1, name: "initial", up() {} },
        { version: 2, name: "identities", up() {} },
        { version: 3, name: "partitions", up() {} },
        { version: 4, name: "protocol-storage", up() {} },
        { version: 5, name: "recent-projects", up() {} },
        { version: 6, name: "legacy-imports", up() {} },
        { ...succeeded, version: 8 },
      ],
      { databaseFile: file, backupDirectory: backups },
    );
    expect(currentSchemaVersion(database)).toBe(8);
    const journal = database
      .query(
        "SELECT status FROM migration_journal WHERE version = 8 ORDER BY id",
      )
      .all() as { status: string }[];
    expect(journal.map((entry) => entry.status)).toEqual(["failed", "applied"]);
    expect(readdirSync(backups).length).toBeGreaterThan(0);
    expect(
      readdirSync(backups).some((name) => existsSync(join(backups, name))),
    ).toBe(true);
    database.close();
  });

  test("future schema is rejected before adding migration metadata", () => {
    const file = join(temporaryFolder(), "future.sqlite");
    const database = new Database(file);
    database.exec(
      "CREATE TABLE studio_meta (id INTEGER PRIMARY KEY, schema_version INTEGER, revision INTEGER); INSERT INTO studio_meta VALUES (1, 99, 0)",
    );
    const journalMode = (
      database.query("PRAGMA journal_mode").get() as { journal_mode: string }
    ).journal_mode;
    database.close();
    expect(() => new StudioStore(file)).toThrow(UnsupportedSchemaError);
    const unchanged = new Database(file, { readonly: true });
    expect(
      (unchanged.query("PRAGMA journal_mode").get() as { journal_mode: string })
        .journal_mode,
    ).toBe(journalMode);
    expect(
      unchanged
        .query("SELECT 1 FROM sqlite_master WHERE name = 'migration_journal'")
        .get(),
    ).toBeNull();
    unchanged.close();
  });
});
