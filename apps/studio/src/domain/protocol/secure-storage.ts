import { findProtocolEvent } from "./registry";
import {
  parseDeviceRequest,
  type StorageRequestIdCoordinator,
  type StorageResult,
  type StorageScope,
  sharedStorageRequestIds,
  validateStorageScope,
} from "./storage";
import type { ProtocolEvent } from "./transport";

export const SECURE_STORAGE_MAX_ITEMS = 10;
export const SECURE_STORAGE_MAX_VALUE_BYTES = 60 * 1024;

export interface SecureStorageBackend {
  get(
    scope: StorageScope,
    key: string,
  ): Promise<{ value: string | null; canRestore?: boolean }>;
  set(scope: StorageScope, key: string, value: string | null): Promise<void>;
  restore(scope: StorageScope, key: string): Promise<string | null>;
  keys(scope: StorageScope): Promise<string[]>;
  clear(scope: StorageScope): Promise<void>;
  disposeScope?(scope: StorageScope): void | Promise<void>;
}

/**
 * Telegram secure storage is never backed by Studio SQLite. Mock sessions use
 * an explicitly ephemeral memory adapter; real sessions require an injected,
 * platform-qualified secure provider or return `UNSUPPORTED`.
 */
export class SecureStorageProtocolService {
  constructor(
    private readonly mode: "mock" | "real",
    private readonly scope: StorageScope,
    private navigationGeneration: number,
    private readonly clientVersion: string | undefined,
    private readonly mockStorage: SecureStorageBackend = new MemorySecureStorage(),
    private readonly secureStorage?: SecureStorageBackend,
    private readonly requestIds: StorageRequestIdCoordinator = sharedStorageRequestIds,
  ) {
    validateStorageScope(scope);
  }

  async handle(event: ProtocolEvent): Promise<StorageResult> {
    if (event.navigationGeneration !== this.navigationGeneration)
      return { status: "stale", replies: [] };
    const descriptor = findProtocolEvent(event.eventType);
    if (
      descriptor?.ownerCard !== "04f" ||
      descriptor.direction !== "outgoing" ||
      !event.eventType.startsWith("web_app_secure_storage_")
    )
      return { status: "unsupported", replies: [] };
    if (!versionAtLeast(this.clientVersion, descriptor.minimumVersion ?? "0"))
      return this.failure(event.eventType, "UNSUPPORTED");
    const parsed = parseSecureRequest(event.eventType, event.eventData);
    if (!parsed) return this.failure(event.eventType, "INVALID_INPUT");
    if (
      !this.requestIds.claim(
        this.scope,
        event.navigationGeneration,
        parsed.req_id,
      )
    )
      return this.failure(
        event.eventType,
        "DUPLICATE_REQUEST_ID",
        parsed.req_id,
      );
    const backend =
      this.mode === "mock" ? this.mockStorage : this.secureStorage;
    if (!backend)
      return this.failure(event.eventType, "UNSUPPORTED", parsed.req_id);
    try {
      if (parsed.operation === "get") {
        const item = await backend.get(this.scope, parsed.key);
        if (
          (item.value !== null && !validSecretValue(item.value)) ||
          (item.canRestore !== undefined &&
            typeof item.canRestore !== "boolean")
        )
          return this.current(
            event,
            this.failure(
              event.eventType,
              "INVALID_STORAGE_VALUE",
              parsed.req_id,
            ),
          );
        return this.current(
          event,
          this.reply("secure_storage_key_received", {
            req_id: parsed.req_id,
            value: item.value,
            ...(item.canRestore ? { can_restore: true } : {}),
          }),
        );
      }
      if (parsed.operation === "restore") {
        const value = await backend.restore(this.scope, parsed.key);
        if (value === null)
          return this.current(
            event,
            this.failure(
              "web_app_secure_storage_restore_key",
              "NOT_RESTORABLE",
              parsed.req_id,
            ),
          );
        if (!validSecretValue(value))
          return this.current(
            event,
            this.failure(
              event.eventType,
              "INVALID_STORAGE_VALUE",
              parsed.req_id,
            ),
          );
        return this.current(
          event,
          this.reply("secure_storage_key_restored", {
            req_id: parsed.req_id,
            value,
          }),
        );
      }
      if (parsed.operation === "save") {
        if (
          parsed.value !== null &&
          new TextEncoder().encode(parsed.value).byteLength >
            SECURE_STORAGE_MAX_VALUE_BYTES
        )
          return this.current(
            event,
            this.failure(event.eventType, "INVALID_INPUT", parsed.req_id),
          );
        if (
          parsed.value !== null &&
          !(await backend.keys(this.scope)).includes(parsed.key) &&
          (await backend.keys(this.scope)).length >= SECURE_STORAGE_MAX_ITEMS
        )
          return this.current(
            event,
            this.failure(event.eventType, "QUOTA_EXCEEDED", parsed.req_id),
          );
        await backend.set(this.scope, parsed.key, parsed.value);
        return this.current(
          event,
          this.reply("secure_storage_key_saved", { req_id: parsed.req_id }),
        );
      }
      await backend.clear(this.scope);
      return this.current(
        event,
        this.reply("secure_storage_cleared", { req_id: parsed.req_id }),
      );
    } catch {
      return this.current(
        event,
        this.failure(event.eventType, "UNKNOWN_ERROR", parsed.req_id),
      );
    } finally {
      this.requestIds.release(
        this.scope,
        event.navigationGeneration,
        parsed.req_id,
      );
    }
  }

  navigate(nextGeneration: number): boolean {
    if (
      !Number.isSafeInteger(nextGeneration) ||
      nextGeneration <= this.navigationGeneration
    )
      return false;
    this.navigationGeneration = nextGeneration;
    return true;
  }

  async dispose(): Promise<void> {
    this.navigationGeneration += 1;
    if (this.mode === "mock") await this.mockStorage.disposeScope?.(this.scope);
  }

  private current(event: ProtocolEvent, value: StorageResult): StorageResult {
    return event.navigationGeneration === this.navigationGeneration
      ? {
          ...value,
          status:
            this.mode === "mock" && value.status === "applied"
              ? "simulated"
              : value.status,
        }
      : { status: "stale", replies: [] };
  }
  private reply(eventType: string, eventData: unknown): StorageResult {
    return { status: "applied", replies: [{ eventType, eventData }] };
  }
  private failure(
    _eventType: string,
    code: string,
    requestId?: string,
  ): StorageResult {
    const eventName = "secure_storage_failed";
    return {
      status: code === "UNSUPPORTED" ? "unsupported" : "denied",
      replies: [
        {
          eventType: eventName,
          eventData: {
            ...(requestId ? { req_id: requestId } : {}),
            error: code,
          },
        },
      ],
    };
  }
}

class MemorySecureStorage implements SecureStorageBackend {
  private readonly items = new Map<string, string>();
  async get(scope: StorageScope, key: string) {
    return { value: this.items.get(`${scopeKey(scope)}\0${key}`) ?? null };
  }
  async set(scope: StorageScope, key: string, value: string | null) {
    const composite = `${scopeKey(scope)}\0${key}`;
    if (value === null) this.items.delete(composite);
    else this.items.set(composite, value);
  }
  async restore(scope: StorageScope, key: string) {
    return this.items.get(`${scopeKey(scope)}\0${key}`) ?? null;
  }
  async keys(scope: StorageScope) {
    const prefix = `${scopeKey(scope)}\0`;
    return [...this.items.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }
  async clear(scope: StorageScope) {
    for (const key of await this.keys(scope))
      this.items.delete(`${scopeKey(scope)}\0${key}`);
  }
  async disposeScope(scope: StorageScope) {
    await this.clear(scope);
  }
}

function parseSecureRequest(
  eventType: string,
  input: unknown,
):
  | { operation: "get" | "restore"; req_id: string; key: string }
  | { operation: "save"; req_id: string; key: string; value: string | null }
  | { operation: "clear"; req_id: string }
  | null {
  const deviceEvent =
    eventType === "web_app_secure_storage_restore_key"
      ? "web_app_device_storage_get_key"
      : eventType.replace("web_app_secure_storage_", "web_app_device_storage_");
  const parsed = parseDeviceRequest(deviceEvent, input);
  if (!parsed) return null;
  if (
    eventType === "web_app_secure_storage_get_key" &&
    parsed.operation === "get"
  )
    return parsed;
  if (
    eventType === "web_app_secure_storage_restore_key" &&
    parsed.operation === "get"
  )
    return { ...parsed, operation: "restore" };
  if (
    eventType === "web_app_secure_storage_save_key" &&
    parsed.operation === "save"
  )
    return parsed;
  if (
    eventType === "web_app_secure_storage_clear" &&
    parsed.operation === "clear"
  )
    return parsed;
  return null;
}
function versionAtLeast(version: string | undefined, minimum: string): boolean {
  if (!version || !/^\d+(?:\.\d+)*$/u.test(version)) return false;
  const left = version.split(".").map(Number),
    right = minimum.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}
function scopeKey(scope: StorageScope): string {
  return [scope.projectId, scope.botId, scope.userId, scope.partitionId].join(
    "\0",
  );
}
function validSecretValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    new TextEncoder().encode(value).byteLength <= SECURE_STORAGE_MAX_VALUE_BYTES
  );
}
