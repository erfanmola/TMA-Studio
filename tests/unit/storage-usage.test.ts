import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostStorageService } from "../../apps/studio/bunium/services/storage-usage";
import { StudioStore } from "../../apps/studio/bunium/services/store";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "studio-storage-09c-"));
  const dirs = new Map<string, string>();
  const store = new StudioStore(":memory:");
  const project = {
    id: "project-a",
    name: "Project A",
    url: "https://example.test/a",
    avatarColorIndex: 0 as const,
    identityId: "identity-a",
    defaultMode: "overlay" as const,
    launch: {
      kind: "mock" as const,
      signing: "unsigned" as const,
      advanced: {},
    },
    splash: {
      title: "A",
      lightBackground: "#ffffff",
      darkBackground: "#000000",
      presentation: "project" as const,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    revision: 0,
  };
  const projectB = {
    ...project,
    id: "project-b",
    name: "Project B",
    identityId: "identity-b",
  };
  store.createProject(project);
  store.createProject(projectB);
  for (const identity of [
    {
      id: "identity-a",
      kind: "mock",
      telegramId: "1001",
      firstName: "A",
      languageCode: "en",
      isPremium: false,
      revision: 0,
    },
    {
      id: "identity-b",
      kind: "mock",
      telegramId: "1002",
      firstName: "B",
      languageCode: "en",
      isPremium: false,
      revision: 0,
    },
  ] as const) {
    store.createIdentity(identity);
  }
  const partA = store.putPartition({
    id: "part-a",
    projectId: "project-a",
    identityId: "identity-a",
    platform: "android",
    isolationProfile: "default",
    ephemeral: false,
    schemaVersion: 1,
  });
  const partB = store.putPartition({
    id: "part-b",
    projectId: "project-b",
    identityId: "identity-b",
    platform: "ios",
    isolationProfile: "default",
    ephemeral: false,
    schemaVersion: 1,
  });
  const dirA = join(root, "part-a");
  const dirB = join(root, "part-b");
  mkdirSync(dirA, { recursive: true });
  mkdirSync(dirB, { recursive: true });
  mkdirSync(join(dirA, "Cache"), { recursive: true });
  mkdirSync(join(dirA, "Local Storage"), { recursive: true });
  writeFileSync(join(dirA, "Cache", "data.bin"), Buffer.alloc(1024));
  writeFileSync(join(dirA, "Local Storage", "leveldb.bin"), Buffer.alloc(2048));
  writeFileSync(join(dirB, "data.bin"), Buffer.alloc(512));
  dirs.set(partA.id, dirA);
  dirs.set(partB.id, dirB);
  const inUse = new Set<string>();
  const runtime = {
    canonicalDirectory: (id: string) => {
      const dir = dirs.get(id);
      if (!dir) throw new Error("missing");
      return dir;
    },
    isInUse: (id: string) => inUse.has(id),
    clearSiteData: (_id: string) => {},
  };
  const service = new HostStorageService(store, runtime);
  return { store, service, dirA, dirB, inUse, partA, partB, root };
}

describe("HostStorageService (09c)", () => {
  test("scans both partitions with byte/file truth", async () => {
    const { store, service } = setup();
    try {
      const result = await service.scan();
      expect(result.rows).toHaveLength(2);
      const rowA = result.rows.find((row) => row.partitionId === "part-a");
      expect(rowA?.status).toBe("ready");
      expect(rowA?.bytes).toBe(3072);
      expect(rowA?.fileCount).toBe(2);
      expect(result.errors).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("reports unknown for never-written partitions, never zero", async () => {
    const { store, service, dirA } = setup();
    try {
      const { rmSync } = await import("node:fs");
      rmSync(dirA, { force: true, recursive: true });
      const result = await service.scan();
      const rowA = result.rows.find((row) => row.partitionId === "part-a");
      expect(rowA?.status).toBe("unknown");
      expect(rowA?.bytes).toBeNull();
    } finally {
      store.close();
    }
  });

  test("clear cache keeps site data; clear A leaves B/vault/metadata intact", async () => {
    const { store, service, dirA, dirB } = setup();
    try {
      const afterCache = service.clearCache("part-a");
      expect(afterCache.bytes).toBe(2048);
      expect(existsSync(join(dirA, "Local Storage", "leveldb.bin"))).toBe(true);
      expect(existsSync(join(dirB, "data.bin"))).toBe(true);
      // Protocol + project metadata preserved.
      expect(store.getProject("project-a").project.name).toBe("Project A");
      expect(store.getProject("project-b").project.name).toBe("Project B");
      expect(store.getIdentity("identity-b").id).toBe("identity-b");

      const afterSite = service.clearSiteData("part-a");
      expect(afterSite.bytes).toBe(0);
      expect(existsSync(join(dirB, "data.bin"))).toBe(true);
      const rescan = await service.scan();
      const rowB = rescan.rows.find((row) => row.partitionId === "part-b");
      expect(rowB?.bytes).toBe(512);
      // B's vault-adjacent metadata untouched (readback still works).
      expect(readFileSync(join(dirB, "data.bin")).byteLength).toBe(512);
    } finally {
      store.close();
    }
  });

  test("refuses active partitions and aborts scans", async () => {
    const { store, service, inUse } = setup();
    try {
      inUse.add("part-a");
      expect(() => service.clearCache("part-a")).toThrow("IN_USE");
      expect(() => service.clearSiteData("part-a")).toThrow("IN_USE");
      const controller = new AbortController();
      controller.abort();
      await expect(service.scan(controller.signal)).rejects.toThrow("ABORTED");
    } finally {
      store.close();
    }
  });

  test("rejects unknown partitions", () => {
    const { store, service } = setup();
    try {
      expect(() => service.clearCache("missing")).toThrow("NOT_FOUND");
    } finally {
      store.close();
    }
  });
});
