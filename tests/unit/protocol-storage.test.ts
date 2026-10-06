import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudioStoreProtocolStorage } from "../../apps/studio/bunium/services/protocol-storage-backend";
import {
  ProtocolStorageQuotaError,
  StudioStore,
} from "../../apps/studio/bunium/services/store";
import {
  SECURE_STORAGE_MAX_ITEMS,
  type SecureStorageBackend,
  SecureStorageProtocolService,
} from "../../apps/studio/src/domain/protocol/secure-storage";
import {
  CLOUD_STORAGE_MAX_ITEMS,
  parseCloudStorageRequest,
  type StoragePersistence,
  StorageProtocolService,
  type StorageScope,
} from "../../apps/studio/src/domain/protocol/storage";
import type { ProtocolEvent } from "../../apps/studio/src/domain/protocol/transport";

const scope: StorageScope = {
  projectId: "project-a",
  botId: "bot-123",
  userId: "user-456",
  partitionId: "partition-a",
};
const otherScope: StorageScope = {
  ...scope,
  userId: "user-789",
  partitionId: "partition-b",
};
const folders: string[] = [];
const temporaryFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), "tma-protocol-storage-"));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

function event(
  eventType: string,
  eventData: unknown,
  navigationGeneration = 1,
): ProtocolEvent {
  return { eventType, eventData, navigationGeneration };
}
function requestId(number: number): string {
  return `request${String(number).padStart(9, "0")}`;
}
function deviceRequest(
  eventType: string,
  eventData: unknown,
  storage: StorageProtocolService,
) {
  return storage.handle(event(eventType, eventData));
}

class MockSecureStorage implements SecureStorageBackend {
  readonly items = new Map<string, string>();
  private key(scopeValue: StorageScope, key: string) {
    return `${scopeValue.projectId}/${scopeValue.botId}/${scopeValue.userId}/${scopeValue.partitionId}/${key}`;
  }
  async get(scopeValue: StorageScope, key: string) {
    return { value: this.items.get(this.key(scopeValue, key)) ?? null };
  }
  async set(scopeValue: StorageScope, key: string, value: string | null) {
    const composite = this.key(scopeValue, key);
    if (value === null) this.items.delete(composite);
    else this.items.set(composite, value);
  }
  async restore(scopeValue: StorageScope, key: string) {
    return this.items.get(this.key(scopeValue, key)) ?? null;
  }
  async keys(scopeValue: StorageScope) {
    const prefix = `${scopeValue.projectId}/${scopeValue.botId}/${scopeValue.userId}/${scopeValue.partitionId}/`;
    return [...this.items.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }
  async clear(scopeValue: StorageScope) {
    for (const key of await this.keys(scopeValue))
      this.items.delete(this.key(scopeValue, key));
  }
}

describe("Telegram storage protocols (04f)", () => {
  test("covers all assigned rows while cloud custom-method events stay with 04h", async () => {
    const store = new StudioStore();
    const backend = new StudioStoreProtocolStorage(store);
    const storage = new StorageProtocolService(
      "mock",
      scope,
      1,
      "9.0",
      backend,
      undefined,
      backend,
    );
    const registry = await import(
      "../../apps/studio/src/domain/protocol/registry"
    );
    const assigned = registry.TELEGRAM_PROTOCOL_REGISTRY.events.filter(
      (row) => row.ownerCard === "04f",
    );
    expect(assigned).toHaveLength(16);
    expect(assigned.map((row) => row.event).sort()).toEqual([
      "device_storage_cleared",
      "device_storage_failed",
      "device_storage_key_received",
      "device_storage_key_saved",
      "secure_storage_cleared",
      "secure_storage_failed",
      "secure_storage_key_received",
      "secure_storage_key_restored",
      "secure_storage_key_saved",
      "web_app_device_storage_clear",
      "web_app_device_storage_get_key",
      "web_app_device_storage_save_key",
      "web_app_secure_storage_clear",
      "web_app_secure_storage_get_key",
      "web_app_secure_storage_restore_key",
      "web_app_secure_storage_save_key",
    ]);
    expect(
      (await storage.handle(event("web_app_invoke_custom_method", {}, 1)))
        .status,
    ).toBe("unsupported");
    store.close();
  });

  test("device storage persists on restart but partitions bot, user, project and local cloud namespaces", async () => {
    const file = join(temporaryFolder(), "studio.sqlite");
    let store = new StudioStore(file);
    let backend = new StudioStoreProtocolStorage(store);
    let storage = new StorageProtocolService(
      "mock",
      scope,
      1,
      "9.0",
      backend,
      undefined,
      backend,
    );
    expect(
      (
        await deviceRequest(
          "web_app_device_storage_save_key",
          { req_id: requestId(1), key: "state", value: "saved" },
          storage,
        )
      ).status,
    ).toBe("simulated");
    expect(
      (
        await storage.invokeCloud({
          method: "saveStorageValue",
          params: { key: "state", value: "cloud-mock" },
        })
      ).status,
    ).toBe("simulated");
    const isolatedScopes = [
      { ...scope, projectId: "project-b" },
      { ...scope, botId: "bot-789" },
      { ...scope, userId: "user-789" },
      { ...scope, partitionId: "partition-b" },
    ];
    for (const isolatedScope of isolatedScopes)
      backend.set("device", isolatedScope, "state", "other-partition");
    store.close();

    store = new StudioStore(file);
    backend = new StudioStoreProtocolStorage(store);
    storage = new StorageProtocolService(
      "mock",
      scope,
      2,
      "9.0",
      backend,
      undefined,
      backend,
    );
    expect(
      (
        await storage.handle(
          event(
            "web_app_device_storage_get_key",
            { req_id: requestId(2), key: "state" },
            2,
          ),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(2), value: "saved" });
    expect(
      (
        await storage.invokeCloud({
          method: "getStorageValues",
          params: { keys: ["state"] },
        })
      ).value,
    ).toEqual({ state: "cloud-mock" });
    const isolated = new StorageProtocolService(
      "mock",
      otherScope,
      2,
      "9.0",
      backend,
      undefined,
      backend,
    );
    expect(
      (
        await isolated.handle(
          event(
            "web_app_device_storage_get_key",
            { req_id: requestId(3), key: "state" },
            2,
          ),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(3), value: null });
    expect(
      (
        await isolated.invokeCloud({
          method: "getStorageValues",
          params: { keys: ["state"] },
        })
      ).value,
    ).toEqual({ state: null });
    for (const isolatedScope of isolatedScopes)
      expect(backend.get("device", isolatedScope, "state")).toBe(
        "other-partition",
      );
    await storage.handle(
      event("web_app_device_storage_clear", { req_id: requestId(4) }, 2),
    );
    expect(backend.get("device", scope, "state")).toBeNull();
    expect(backend.get("cloud", scope, "state")).toBe("cloud-mock");
    for (const isolatedScope of isolatedScopes)
      expect(backend.get("device", isolatedScope, "state")).toBe(
        "other-partition",
      );
    store.close();
  });

  test("rejects malformed events and routes real mode only through explicit providers", async () => {
    const store = new StudioStore();
    const backend = new StudioStoreProtocolStorage(store);
    const real = new StorageProtocolService("real", scope, 1, "9.0", backend);
    expect(
      (
        await real.handle(
          event("web_app_device_storage_get_key", {
            req_id: requestId(5),
            key: "x",
          }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(5), error: "UNSUPPORTED" });
    expect(
      (
        await real.handle(
          event("web_app_device_storage_get_key", {
            req_id: requestId(6),
            key: "\u0001x",
          }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ error: "INVALID_INPUT" });
    expect(
      (
        await real.handle(
          event("web_app_device_storage_get_key", {
            req_id: "short",
            key: "x",
          }),
        )
      ).status,
    ).toBe("denied");
    expect(
      (
        await real.handle(
          event("web_app_device_storage_clear", {
            req_id: requestId(7),
            key: "extra",
          }),
        )
      ).status,
    ).toBe("denied");
    expect(
      (
        await real.handle(
          event(
            "web_app_device_storage_get_key",
            { req_id: requestId(8), key: "x" },
            2,
          ),
        )
      ).status,
    ).toBe("stale");
    expect(
      (
        await real.handle(
          event("web_app_device_storage_get_key", {
            req_id: requestId(9),
            key: "x",
          }),
        )
      ).status,
    ).toBe("unsupported");
    expect(
      (
        await new StorageProtocolService(
          "mock",
          scope,
          1,
          "8.9",
          backend,
        ).handle(
          event("web_app_device_storage_get_key", {
            req_id: requestId(10),
            key: "x",
          }),
        )
      ).status,
    ).toBe("unsupported");
    const cloud = await real.invokeCloud({
      method: "saveStorageValue",
      params: { key: "x", value: "not telegram" },
    });
    expect(cloud).toEqual({ status: "unsupported", error: "UNSUPPORTED" });
    expect(
      parseCloudStorageRequest({
        method: "saveStorageValue",
        params: { key: "bad key", value: "x" },
      }),
    ).toBeNull();
    expect(
      parseCloudStorageRequest({
        method: "getStorageValues",
        params: { keys: ["x", "x"] },
      }),
    ).toBeNull();
    expect(
      parseCloudStorageRequest({
        method: "saveStorageValue",
        params: { key: "x", value: "v".repeat(4097) },
      }),
    ).toBeNull();
    expect(
      parseCloudStorageRequest({
        method: "getStorageKeys",
        params: {},
        botId: "guest-controlled",
      }),
    ).toBeNull();
    store.close();
  });

  test("real storage requests use only scoped injected device and Telegram cloud adapters", async () => {
    const store = new StudioStore();
    const backend = new StudioStoreProtocolStorage(store);
    const calls: unknown[] = [];
    const service = new StorageProtocolService(
      "real",
      scope,
      1,
      "9.0",
      undefined,
      backend,
      undefined,
      {
        invoke: async (receivedScope, method, parameters) => {
          calls.push({ receivedScope, method, parameters });
          return { ok: true };
        },
      },
    );
    expect(
      (
        await service.handle(
          event("web_app_device_storage_save_key", {
            req_id: requestId(12),
            key: "real_key",
            value: "real_value",
          }),
        )
      ).status,
    ).toBe("applied");
    expect(backend.get("device", scope, "real_key")).toBe("real_value");
    expect(
      await service.invokeCloud({
        method: "saveStorageValue",
        params: { key: "cloud_key", value: "cloud_value" },
      }),
    ).toEqual({ status: "applied", value: { ok: true } });
    expect(calls).toEqual([
      {
        receivedScope: scope,
        method: "saveStorageValue",
        parameters: { key: "cloud_key", value: "cloud_value" },
      },
    ]);
    const oversizedProvider = new StorageProtocolService(
      "real",
      scope,
      1,
      "9.0",
      undefined,
      undefined,
      undefined,
      { invoke: async () => "x".repeat(61 * 1024) },
    );
    expect(
      await oversizedProvider.invokeCloud({
        method: "getStorageKeys",
        params: {},
      }),
    ).toEqual({ status: "denied", error: "RESPONSE_TOO_LARGE" });
    store.close();
  });

  test("a duplicate request id fails and async work from an old navigation is dropped", async () => {
    let finish: ((value: string | null) => void) | undefined;
    const delayed: StoragePersistence = {
      get: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      keys: () => [],
      set: () => undefined,
      clear: () => 0,
    };
    const storage = new StorageProtocolService(
      "mock",
      scope,
      1,
      "9.0",
      delayed,
    );
    const request = event("web_app_device_storage_get_key", {
      req_id: requestId(11),
      key: "x",
    });
    const first = storage.handle(request);
    const duplicate = await storage.handle(request);
    expect(duplicate.replies[0]?.eventData).toEqual({
      req_id: requestId(11),
      error: "DUPLICATE_REQUEST_ID",
    });
    const secureDuplicate = await new SecureStorageProtocolService(
      "mock",
      scope,
      1,
      "9.0",
    ).handle(
      event("web_app_secure_storage_get_key", {
        req_id: requestId(11),
        key: "x",
      }),
    );
    expect(secureDuplicate.replies[0]?.eventData).toEqual({
      req_id: requestId(11),
      error: "DUPLICATE_REQUEST_ID",
    });
    expect(storage.navigate(2)).toBe(true);
    finish?.("late");
    expect(await first).toEqual({ status: "stale", replies: [] });
  });

  test("cloud mock methods are bot/user local simulations and enforce documented key/value/item limits", async () => {
    const store = new StudioStore();
    const backend = new StudioStoreProtocolStorage(store);
    const storage = new StorageProtocolService(
      "mock",
      scope,
      1,
      "9.0",
      backend,
      undefined,
      backend,
    );
    const keys = Array.from(
      { length: CLOUD_STORAGE_MAX_ITEMS },
      (_, index) => `key_${index}`,
    );
    for (const key of keys)
      expect(
        (
          await storage.invokeCloud({
            method: "saveStorageValue",
            params: { key, value: "x" },
          })
        ).status,
      ).toBe("simulated");
    expect(
      (
        await storage.invokeCloud({
          method: "saveStorageValue",
          params: { key: "overflow", value: "x" },
        })
      ).error,
    ).toBe("QUOTA_EXCEEDED");
    expect(
      (
        await storage.invokeCloud({
          method: "saveStorageValue",
          params: { key: "key_0", value: "y" },
        })
      ).value,
    ).toBe(true);
    expect(
      (await storage.invokeCloud({ method: "getStorageKeys", params: {} }))
        .value,
    ).toHaveLength(CLOUD_STORAGE_MAX_ITEMS);
    store.close();
  });

  test("device storage enforces its persistent five MiB scope quota atomically", () => {
    const store = new StudioStore();
    const value = "x".repeat(60 * 1024);
    for (let index = 0; index < 85; index += 1)
      store.setProtocolStorageValue("device", scope, `k${index}`, value);
    expect(() =>
      store.setProtocolStorageValue("device", scope, "overflow", value),
    ).toThrow(ProtocolStorageQuotaError);
    expect(store.listProtocolStorageKeys("device", scope)).toHaveLength(85);
    store.close();
  });

  test("secure storage isolates scopes, reports restore state, caps item count and never falls back to SQLite in real mode", async () => {
    const secureStore = new MockSecureStorage();
    const secure = new SecureStorageProtocolService(
      "mock",
      scope,
      1,
      "9.0",
      secureStore,
    );
    expect(
      (
        await secure.handle(
          event("web_app_secure_storage_save_key", {
            req_id: requestId(20),
            key: "secret",
            value: "sensitive",
          }),
        )
      ).status,
    ).toBe("simulated");
    expect(
      (
        await secure.handle(
          event("web_app_secure_storage_get_key", {
            req_id: requestId(21),
            key: "secret",
          }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(21), value: "sensitive" });
    expect(
      (
        await secure.handle(
          event("web_app_secure_storage_restore_key", {
            req_id: requestId(22),
            key: "secret",
          }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(22), value: "sensitive" });
    const isolated = new SecureStorageProtocolService(
      "mock",
      otherScope,
      1,
      "9.0",
      secureStore,
    );
    expect(
      (
        await isolated.handle(
          event("web_app_secure_storage_get_key", {
            req_id: requestId(23),
            key: "secret",
          }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(23), value: null });
    for (let index = 0; index < SECURE_STORAGE_MAX_ITEMS - 1; index += 1)
      expect(
        (
          await secure.handle(
            event("web_app_secure_storage_save_key", {
              req_id: requestId(30 + index),
              key: `item_${index}`,
              value: "v",
            }),
          )
        ).status,
      ).toBe("simulated");
    expect(
      (
        await secure.handle(
          event("web_app_secure_storage_save_key", {
            req_id: requestId(49),
            key: "overflow",
            value: "v",
          }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(49), error: "QUOTA_EXCEEDED" });
    expect(
      (
        await new SecureStorageProtocolService("real", scope, 1, "9.0").handle(
          event("web_app_secure_storage_save_key", {
            req_id: requestId(50),
            key: "secret",
            value: "x",
          }),
        )
      ).replies[0]?.eventData,
    ).toEqual({ req_id: requestId(50), error: "UNSUPPORTED" });
    expect(
      (
        await secure.handle(
          event("web_app_secure_storage_clear", { req_id: requestId(51) }),
        )
      ).replies[0]?.eventType,
    ).toBe("secure_storage_cleared");
    await secure.dispose();
    expect(secureStore.items.size).toBe(0);
    const realVault = new MockSecureStorage();
    const realWithVault = new SecureStorageProtocolService(
      "real",
      scope,
      1,
      "9.0",
      new MockSecureStorage(),
      realVault,
    );
    await realWithVault.handle(
      event("web_app_secure_storage_save_key", {
        req_id: requestId(52),
        key: "persistent",
        value: "vault-backed",
      }),
    );
    await realWithVault.dispose();
    expect(await realVault.get(scope, "persistent")).toEqual({
      value: "vault-backed",
    });
  });
});
