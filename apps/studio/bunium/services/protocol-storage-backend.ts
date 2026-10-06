import type {
  StoragePersistence,
  StorageScope,
} from "../../src/domain/protocol/storage";
import type { StudioStore } from "./store";

/** The mock device/cloud backend persists locally and remains scope-isolated. */
export class StudioStoreProtocolStorage implements StoragePersistence {
  constructor(private readonly store: StudioStore) {}

  get(
    kind: "device" | "cloud",
    scope: StorageScope,
    key: string,
  ): string | null {
    return this.store.getProtocolStorageValue(kind, scope, key);
  }

  keys(kind: "device" | "cloud", scope: StorageScope): string[] {
    return this.store.listProtocolStorageKeys(kind, scope);
  }

  set(
    kind: "device" | "cloud",
    scope: StorageScope,
    key: string,
    value: string | null,
  ): void {
    this.store.setProtocolStorageValue(kind, scope, key, value);
  }

  clear(kind: "device" | "cloud", scope: StorageScope): number {
    return this.store.clearProtocolStorage(kind, scope);
  }
}
