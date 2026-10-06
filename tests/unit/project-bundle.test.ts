import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectBundleService } from "../../apps/studio/bunium/services/project-bundle";
import { StudioStore } from "../../apps/studio/bunium/services/store";
import type {
  Identity,
  Project,
} from "../../apps/studio/src/contracts/entities";
import {
  ProjectBundleValidationError,
  parseProjectBundle,
  parseProjectBundleRequest,
} from "../../apps/studio/src/contracts/project-bundle";

const folders: string[] = [];
const folder = () => {
  const path = mkdtempSync(join(tmpdir(), "tma-project-bundle-"));
  folders.push(path);
  return path;
};
afterEach(() => {
  for (const path of folders.splice(0))
    rmSync(path, { recursive: true, force: true });
});

const identity: Identity = {
  id: "mock-alex",
  kind: "mock",
  telegramId: "5000000123",
  firstName: "Alex",
  photoUrl: "https://images.example.test/alex.png?signature=private",
  languageCode: "en",
  isPremium: false,
  revision: 1,
};
const project = (id = "project-local"): Project => ({
  id,
  name: "Example mini app",
  url: "https://example.test/app?session=do-not-copy#token",
  avatarColorIndex: 2,
  botTokenRef: "vault:v1:00000000-0000-4000-8000-000000000001",
  identityId: identity.id,
  defaultMode: "overlay",
  launch: { kind: "mock", signing: "bot-token", advanced: {} },
  splash: {
    title: "Loading",
    lightBackground: "#ffffff",
    darkBackground: "#000000",
    presentation: "project",
  },
  createdAt: "2026-09-28T10:00:00Z",
  updatedAt: "2026-09-28T10:00:00Z",
  revision: 3,
});

function store(path: string): StudioStore {
  return new StudioStore(join(path, "studio.sqlite"));
}

describe("sanitized project bundles", () => {
  test("round-trips selected mock projects without credentials or account state", async () => {
    const root = folder();
    const source = store(join(root, "source"));
    source.createIdentity(identity);
    source.createProject(project());
    const bundlePath = join(root, "portable.json");
    const service = new ProjectBundleService(
      source,
      () => "00000000-0000-4000-8000-000000000002",
      () => new Date("2026-09-28T12:00:00Z"),
    );
    expect(
      await service.exportFile(bundlePath, ["project-local"], [identity.id]),
    ).toEqual({ projectCount: 1, identityCount: 1 });
    const raw = readFileSync(bundlePath, "utf8");
    expect(raw).not.toContain("vault:v1:");
    expect(raw).not.toContain("do-not-copy");
    expect(raw).not.toContain("signature=private");
    expect(raw).not.toContain("botTokenRef");
    expect(raw).toContain('"signing": "unsigned"');
    expect(raw).toContain("https://example.test/app");

    const destination = store(join(root, "destination"));
    const destinationService = new ProjectBundleService(destination);
    expect(await destinationService.previewFile(bundlePath)).toMatchObject({
      projectCount: 1,
      identityCount: 1,
      projectIdCollisionCount: 0,
      duplicateIdentityCount: 0,
    });
    const unchangedBundle = readFileSync(bundlePath, "utf8");
    writeFileSync(bundlePath, `${unchangedBundle} `);
    await expect(
      destinationService.importFile(bundlePath),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(destination.getSnapshot().projects).toHaveLength(0);
    writeFileSync(bundlePath, unchangedBundle);
    await destinationService.previewFile(bundlePath);
    expect(await destinationService.importFile(bundlePath)).toMatchObject({
      projectCount: 1,
      identityCount: 1,
      remappedProjectCount: 0,
      reusedIdentityCount: 0,
    });
    expect(destination.getSnapshot().projects[0]?.url).toBe(
      "https://example.test/app",
    );
    expect(destination.getSnapshot().projects[0]?.botTokenRef).toBeUndefined();
    expect(destination.getSnapshot().projects[0]?.launch).toMatchObject({
      kind: "mock",
      signing: "unsigned",
      advanced: {},
    });
    expect(destination.listIdentities()).toHaveLength(1);
    source.close();
    destination.close();
  });

  test("previews project ID and mock Telegram ID collisions, then remaps and reuses atomically", async () => {
    const root = folder();
    const database = store(join(root, "database"));
    database.createIdentity(identity);
    database.createProject(project());
    const bundlePath = join(root, "bundle.json");
    const service = new ProjectBundleService(
      database,
      () => "project-remapped",
    );
    await service.exportFile(bundlePath, ["project-local"], [identity.id]);
    expect(await service.previewFile(bundlePath)).toMatchObject({
      projectIdCollisionCount: 1,
      duplicateIdentityCount: 1,
      projects: [{ id: "project-local", collision: true }],
    });
    expect(await service.importFile(bundlePath)).toMatchObject({
      projectCount: 1,
      identityCount: 0,
      remappedProjectCount: 1,
      reusedIdentityCount: 1,
    });
    expect(database.getSnapshot().projects.map(({ id }) => id)).toEqual([
      "project-local",
      "project-remapped",
    ]);
    expect(database.listIdentities()).toHaveLength(1);
    database.close();
  });

  test("rejects malformed and future bundles before store mutation", async () => {
    const root = folder();
    const database = store(root);
    const service = new ProjectBundleService(database);
    const path = join(root, "invalid.json");
    const before = database.getSnapshot().revision;
    writeFileSync(
      path,
      JSON.stringify({
        format: "tma-studio-project-bundle",
        schemaVersion: 99,
        projects: [],
        identities: [],
      }),
    );
    await expect(service.previewFile(path)).rejects.toMatchObject({
      code: "UNSUPPORTED_SCHEMA",
    });
    writeFileSync(
      path,
      JSON.stringify({
        format: "tma-studio-project-bundle",
        schemaVersion: 1,
        exportedAt: "2026-09-28T12:00:00Z",
        projects: [{ ...project(), botTokenRef: "secret" }],
        identities: [identity],
      }),
    );
    await expect(service.previewFile(path)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    writeFileSync(path, " ".repeat(2 * 1024 * 1024 + 1));
    await expect(service.previewFile(path)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(database.getSnapshot().revision).toBe(before);
    expect(database.getSnapshot().projects).toHaveLength(0);
    database.close();
  });

  test("never exports account identities or projects assigned to them", async () => {
    const root = folder();
    const database = store(root);
    const account: Identity = {
      id: "telegram-account",
      kind: "telegram",
      accountRef: "account-session-reference",
      profile: {
        telegramId: "5000000999",
        firstName: "Account",
        languageCode: "en",
        isPremium: false,
      },
      status: "reauthorize",
      revision: 1,
    };
    database.createIdentity(account);
    const { botTokenRef: _tokenRef, ...accountProject } =
      project("account-project");
    database.createProject({
      ...accountProject,
      identityId: account.id,
      launch: { kind: "mock", signing: "unsigned", advanced: {} },
    });
    const service = new ProjectBundleService(database);
    expect(service.catalog().identities).toEqual([]);
    expect(service.catalog().projects[0]?.identityKind).toBe("telegram");
    await expect(
      service.exportFile(join(root, "account.json"), ["account-project"], []),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    database.close();
  });

  test("rolls back identities if a later project reference fails during the batch", () => {
    const database = store(folder());
    const before = database.getSnapshot().revision;
    expect(() =>
      database.importProjectBundle(
        {
          identities: [identity as Extract<Identity, { kind: "mock" }>],
          projects: [{ ...project(), identityId: "not-in-bundle" }],
        },
        () => "new-id",
      ),
    ).toThrow();
    expect(database.listIdentities()).toHaveLength(0);
    expect(database.getSnapshot().revision).toBe(before);
    database.close();
  });

  test("bounds the IPC request to exact supported methods and IDs", () => {
    expect(
      parseProjectBundleRequest({
        requestId: "bundle-1",
        command: { method: "catalog" },
      })?.command.method,
    ).toBe("catalog");
    expect(
      parseProjectBundleRequest({
        requestId: "bundle-1",
        command: {
          method: "export",
          projectIds: ["project-local"],
          identityIds: ["mock-alex"],
        },
      })?.command.method,
    ).toBe("export");
    expect(
      parseProjectBundleRequest({
        requestId: "bundle-1",
        command: { method: "import", path: "/private/path" },
      }),
    ).toBeNull();
    expect(() =>
      parseProjectBundle({
        format: "tma-studio-project-bundle",
        schemaVersion: 99,
      }),
    ).toThrow(ProjectBundleValidationError);
    expect(() =>
      parseProjectBundle({
        format: "tma-studio-project-bundle",
        schemaVersion: 1,
        exportedAt: "2026-09-28T12:00:00Z",
        projects: [],
        identities: [
          {
            id: "mock-a",
            kind: "mock",
            telegramId: "5000000123",
            firstName: "Alex",
            languageCode: "en",
            isPremium: false,
          },
          {
            id: "mock-b",
            kind: "mock",
            telegramId: "5000000123",
            firstName: "Alex Copy",
            languageCode: "en",
            isPremium: false,
          },
        ],
      }),
    ).toThrow(ProjectBundleValidationError);
  });
});
