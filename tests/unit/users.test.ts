import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMigrations,
  STUDIO_MIGRATIONS,
} from "../../apps/studio/bunium/services/migrations";
import { StudioStore } from "../../apps/studio/bunium/services/store";
import { HostUsersService } from "../../apps/studio/bunium/services/users-service";
import type {
  Identity,
  Project,
} from "../../apps/studio/src/contracts/entities";
import { ProjectSchema } from "../../apps/studio/src/contracts/schemas";
import { MemoryUsersService } from "../../apps/studio/src/features/users/memory-service";

const tempFolders: string[] = [];
const temporaryFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), "tma-users-test-"));
  tempFolders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of tempFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

const alex: Identity = {
  id: "mock-alex",
  kind: "mock",
  telegramId: "9007199254740993",
  firstName: "Alex",
  lastName: "Morgan",
  languageCode: "en",
  isPremium: true,
  revision: 1,
};
const nima: Identity = {
  id: "mock-nima",
  kind: "mock",
  telegramId: "5000000003",
  firstName: "Nima",
  languageCode: "fa",
  isPremium: false,
  revision: 1,
};
const sara: Identity = {
  id: "telegram-sara",
  kind: "telegram",
  accountRef: "host-only-reference",
  profile: {
    telegramId: "133777000",
    firstName: "Sara",
    languageCode: "de",
    isPremium: false,
  },
  status: "reauthorize",
  revision: 1,
};
const project = (identityId: string): Project => ({
  id: "project-orbit",
  name: "Orbit Store",
  url: "http://localhost:3000",
  avatarColorIndex: 2,
  identityId,
  defaultMode: "overlay",
  launch: { kind: "mock", signing: "unsigned", advanced: {} },
  splash: {
    title: "Orbit Store",
    lightBackground: "#ffffff",
    darkBackground: "#000000",
    presentation: "project",
  },
  createdAt: "2026-09-25T10:00:00Z",
  updatedAt: "2026-09-25T10:00:00Z",
  revision: 0,
});

describe("mock user management service", () => {
  test("creates distinct internal and Telegram IDs, updates revisions, and notifies subscribers", async () => {
    const service = new MemoryUsersService([alex, nima, sara], []);
    let notifications = 0;
    const unsubscribe = service.subscribe(() => notifications++);
    const created = await service.saveMock({
      firstName: "Mina",
      telegramId: "1234567890",
      languageCode: "fa",
      isPremium: false,
    });
    expect(created.id).not.toBe(created.telegramId);
    expect(created.revision).toBe(1);
    const updated = await service.saveMock(
      { ...created, firstName: "Mina Farahani" },
      created.id,
      created.revision,
    );
    expect(updated.revision).toBe(2);
    expect(notifications).toBe(2);
    await expect(
      service.saveMock(
        { ...created, firstName: "Stale name" },
        created.id,
        created.revision,
      ),
    ).rejects.toThrow("This user changed");
    unsubscribe();
    await service.saveMock(
      { ...updated, firstName: "Mina F." },
      updated.id,
      updated.revision,
    );
    expect(notifications).toBe(2);
  });

  test("requires reassignment before deleting a referenced user and preserves each project", async () => {
    const service = new MemoryUsersService(
      [alex, nima, sara],
      [
        { id: "orbit", name: "Orbit Store", identityId: alex.id },
        { id: "paper", name: "Paper Plane", identityId: alex.id },
      ],
    );
    await expect(service.deleteMock(alex.id, alex.revision)).rejects.toThrow(
      "Choose another user",
    );
    await service.deleteMock(alex.id, alex.revision, nima.id);
    expect(await service.getIdentity(alex.id)).toBeNull();
    expect(service.projectReferences()).toEqual([
      { id: "orbit", name: "Orbit Store", identityId: nima.id },
      { id: "paper", name: "Paper Plane", identityId: nima.id },
    ]);
    expect(await service.getIdentity(sara.id)).toEqual(sara);
  });

  test("prevents deleting real identities", async () => {
    const service = new MemoryUsersService([sara], []);
    await expect(service.deleteMock(sara.id, sara.revision)).rejects.toThrow(
      "Only mock users can be deleted",
    );
  });

  test("persists mock CRUD, rejects duplicate Telegram IDs, and atomically reassigns projects", async () => {
    const store = new StudioStore();
    store.createIdentity(alex);
    store.createIdentity(nima);
    store.createIdentity(sara);
    store.createProject(project(alex.id));
    const service = new HostUsersService(store, { newId: () => "mock-new" });
    let notifications = 0;
    const unsubscribe = service.subscribe(() => notifications++);
    const created = await service.saveMock({
      firstName: "Mina",
      telegramId: "1234567890",
      languageCode: "fa",
      isPremium: false,
    });
    expect(created.id).toBe("mock-new");
    expect(created.revision).toBe(1);
    await expect(
      service.saveMock({
        firstName: "Duplicate",
        telegramId: alex.kind === "mock" ? alex.telegramId : "0",
        languageCode: "en",
        isPremium: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const updated = await service.saveMock(
      { ...created, firstName: "Mina Farahani" },
      created.id,
      created.revision,
    );
    expect(updated.revision).toBe(2);
    expect(await service.getIdentity(created.id)).toEqual(updated);
    await expect(
      service.saveMock(
        { ...created, firstName: "Stale name" },
        created.id,
        created.revision,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.deleteMock(alex.id, alex.revision),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(store.getProject("project-orbit").project.identityId).toBe(alex.id);
    await service.deleteMock(alex.id, alex.revision, nima.id);
    expect(store.getProject("project-orbit").project.identityId).toBe(nima.id);
    expect(store.getProject("project-orbit").project.revision).toBe(2);
    expect(await service.getIdentity(alex.id)).toBeNull();
    expect(notifications).toBe(3);
    unsubscribe();
    store.close();
  });

  test("upgrades schema v1 to latest with project preservation and migration backups", () => {
    const folder = temporaryFolder();
    const databaseFile = join(folder, "studio.sqlite");
    const backupDirectory = join(folder, "backups");
    const legacyDb = new Database(databaseFile);
    const versionOne = STUDIO_MIGRATIONS.find(
      (migration) => migration.version === 1,
    );
    if (!versionOne) throw new Error("Initial migration is missing.");
    applyMigrations(legacyDb, [versionOne]);
    const preserved = ProjectSchema.parse({
      ...project("mock-alex"),
      revision: 1,
    });
    legacyDb
      .query("INSERT INTO projects (id, revision, json) VALUES (?, ?, ?)")
      .run(preserved.id, preserved.revision, JSON.stringify(preserved));
    legacyDb.query("UPDATE studio_meta SET revision = 1 WHERE id = 1").run();
    legacyDb.close();

    const migrated = new StudioStore(databaseFile, { backupDirectory });
    expect(migrated.getProject(preserved.id).project).toEqual(preserved);
    expect(migrated.listIdentities()).toEqual([]);
    migrated.createIdentity(alex);
    migrated.close();
    const reopened = new StudioStore(databaseFile, { backupDirectory });
    expect(reopened.getProject(preserved.id).project).toEqual(preserved);
    expect(reopened.listIdentities()).toEqual([alex]);
    reopened.close();
    const backups = readdirSync(backupDirectory)
      .map((name) => /\.before-v(\d+)-/u.exec(name)?.[1])
      .sort();
    expect(backups).toEqual(
      STUDIO_MIGRATIONS.slice(1).map(({ version }) => String(version)),
    );
  });
});
