import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { partitionKey } from "../../apps/studio/bunium/runtime/session";
import { PartitionRegistryService } from "../../apps/studio/bunium/services/partition-registry";
import { PermissionBroker } from "../../apps/studio/bunium/services/permission-broker";
import {
  StoreConflictError,
  StudioStore,
} from "../../apps/studio/bunium/services/store";
import type {
  Identity,
  Project,
} from "../../apps/studio/src/contracts/entities";

const folders: string[] = [];
const folder = () => {
  const value = mkdtempSync(join(tmpdir(), "tma-partition-test-"));
  folders.push(value);
  return value;
};
afterEach(() => {
  for (const value of folders.splice(0))
    rmSync(value, { recursive: true, force: true });
});

const identity = (id: string): Identity => ({
  id,
  kind: "mock",
  telegramId: id === "alice" ? "1000001" : "1000002",
  firstName: id,
  languageCode: "en",
  isPremium: false,
  revision: 1,
});
const project = (identityId: string): Project => ({
  id: "project-1",
  name: "Test",
  url: "http://localhost:3000/app",
  avatarColorIndex: 1,
  identityId,
  defaultMode: "overlay",
  launch: { kind: "mock", signing: "unsigned", advanced: {} },
  splash: {
    title: "Test",
    lightBackground: "#ffffff",
    darkBackground: "#000000",
    presentation: "project",
  },
  createdAt: "2026-09-27T00:00:00Z",
  updatedAt: "2026-09-27T00:00:00Z",
  revision: 0,
});

function setup() {
  const base = folder();
  const root = join(base, "profiles");
  mkdirSync(root);
  let inUse = false;
  const runtimeCalls: string[] = [];
  const runtime = {
    storageRoot: root,
    partitionPath: (key: string) => join(root, `bp.${key}.g1`),
    isInUse: () => inUse,
    clearPartition: (key: string) => {
      runtimeCalls.push(`clear:${key}`);
      return { generation: 2, removedNow: true };
    },
    removePartition: (key: string) => {
      runtimeCalls.push(`remove:${key}`);
      return { removedNow: true };
    },
  };
  const store = new StudioStore();
  store.createIdentity(identity("alice"));
  store.createIdentity(identity("bob"));
  store.createProject(project("alice"));
  const partitions = new PartitionRegistryService(store, runtime);
  const partition = partitions.register({
    projectId: "project-1",
    identityId: "alice",
    platform: "android",
    isolationProfile: "mobile",
  });
  return {
    base,
    root,
    runtime,
    setInUse(value: boolean) {
      inUse = value;
    },
    runtimeCalls,
    store,
    partitions,
    partition,
  };
}

describe("trusted partition registry and permission broker", () => {
  test("derives canonical storage from trusted IDs and rejects forged paths and symlinks", () => {
    const { base, root, store, partitions, partition } = setup();
    const canonical = partitions.canonicalDirectory(partition.id);
    expect(canonical.startsWith(`${realpathSync(root)}${sep}`)).toBe(true);
    expect(() => partitions.canonicalDirectory("../../outside")).toThrow();
    expect(partitions.resolve("../../outside")).toBeUndefined();
    const outside = join(base, "outside");
    mkdirSync(outside);
    const directory = join(root, `bp.${partitionKey(partition.id)}.g1`);
    // Symlink creation needs Developer Mode / SeCreateSymbolicLinkPrivilege
    // on Windows, which locked-down runners may lack. Junctions need no
    // privilege, still resolve outside the root, and report as symlinks to
    // lstat — so the exact same rejection fires either way.
    try {
      symlinkSync(outside, directory);
    } catch (error) {
      if (
        process.platform !== "win32" ||
        (error as NodeJS.ErrnoException).code !== "EPERM"
      )
        throw error;
      symlinkSync(outside, directory, "junction");
    }
    expect(() => partitions.canonicalDirectory(partition.id)).toThrow(
      "symlink",
    );
    store.close();
  });

  test("identity changes produce a new partition and stale the old registry owner", () => {
    const { store, partitions, partition } = setup();
    store.updateProject("project-1", 1, { identityId: "bob" });
    const second = partitions.register({
      projectId: "project-1",
      identityId: "bob",
      platform: "android",
      isolationProfile: "mobile",
    });
    expect(second.id).not.toBe(partition.id);
    expect(partitions.resolve(partition.id)).toBeUndefined();
    expect(() =>
      partitions.register({
        projectId: "project-1",
        identityId: "alice",
        platform: "android",
        isolationProfile: "mobile",
      }),
    ).toThrow(StoreConflictError);
    store.close();
  });

  test("delegates clear/remove to Bunium and refuses active profiles", () => {
    const { runtimeCalls, setInUse, store, partitions, partition } = setup();
    setInUse(true);
    expect(() => partitions.clear(partition.id)).toThrow("in use");
    setInUse(false);
    expect(partitions.clear(partition.id)).toEqual({
      generation: 2,
      removedNow: true,
    });
    expect(runtimeCalls).toContain(`clear:${partitionKey(partition.id)}`);
    expect(partitions.remove(partition.id)).toBe(true);
    expect(runtimeCalls).toContain(`remove:${partitionKey(partition.id)}`);
    expect(store.getPartition(partition.id)).toBeNull();
    store.close();
  });

  test("isolates grants by origin, identity, navigation, and mode; simulated grants never call OS", async () => {
    const { store, partitions, partition } = setup();
    let nativeCalls = 0;
    let currentGeneration = 3;
    const broker = new PermissionBroker(
      store,
      partitions,
      {
        async request() {
          nativeCalls += 1;
          return true;
        },
      },
      {
        current(id) {
          return id === partition.id
            ? { origin: "http://localhost:3000", generation: currentGeneration }
            : undefined;
        },
      },
    );
    const base = {
      partitionId: partition.id,
      origin: "http://localhost:3000",
      navigationGeneration: 3,
      capability: "location" as const,
    };
    expect(await broker.request({ ...base, mode: "simulated" })).toEqual({
      status: "prompt",
    });
    broker.decide({ ...base, mode: "simulated", decision: "allow" });
    expect(await broker.request({ ...base, mode: "simulated" })).toEqual({
      status: "granted",
      mode: "simulated",
    });
    expect(nativeCalls).toBe(0);
    expect(await broker.request({ ...base, mode: "native" })).toEqual({
      status: "prompt",
    });
    broker.decide({ ...base, mode: "native", decision: "allow" });
    expect(await broker.request({ ...base, mode: "native" })).toEqual({
      status: "granted",
      mode: "native",
    });
    expect(nativeCalls).toBe(1);
    currentGeneration = 4;
    await expect(broker.request({ ...base, mode: "native" })).rejects.toThrow(
      StoreConflictError,
    );
    expect(
      await broker.request({
        ...base,
        mode: "native",
        navigationGeneration: 4,
      }),
    ).toEqual({ status: "prompt" });
    await expect(
      broker.request({
        ...base,
        origin: "https://attacker.example",
        mode: "native",
      }),
    ).rejects.toThrow(StoreConflictError);
    currentGeneration = 3;
    store.updateProject("project-1", 1, { identityId: "bob" });
    store.updateProject("project-1", 2, { identityId: "alice" });
    expect(await broker.request({ ...base, mode: "simulated" })).toEqual({
      status: "prompt",
    });
    store.close();
  });

  test("ephemeral registry records are removed at startup cleanup", () => {
    const base = folder();
    const store = new StudioStore();
    store.createIdentity(identity("alice"));
    store.createProject(project("alice"));
    const root = join(base, "profiles");
    mkdirSync(root);
    const runtime = {
      storageRoot: root,
      partitionPath: (key: string) => join(root, `bp.${key}.g1`),
      isInUse: () => false,
      clearPartition: () => ({ generation: 2, removedNow: true }),
      removePartition: () => ({ removedNow: true }),
    };
    const partitions = new PartitionRegistryService(store, runtime);
    const ephemeral = partitions.register({
      projectId: "project-1",
      identityId: "alice",
      platform: "android",
      isolationProfile: "temporary",
      ephemeral: true,
    });
    expect(partitions.cleanupEphemeral()).toBe(1);
    expect(store.getPartition(ephemeral.id)).toBeNull();
    store.close();
  });
});
