import { findProtocolEvent } from "./registry";
import type { ProtocolEvent } from "./transport";

export const CLOUD_STORAGE_MAX_ITEMS = 1024;
export const CLOUD_STORAGE_MAX_VALUE_CHARACTERS = 4096;
export const DEVICE_STORAGE_MAX_BYTES = 5 * 1024 * 1024;
export const DEVICE_STORAGE_MAX_VALUE_BYTES = 60 * 1024;
const REQUEST_ID = /^[A-Za-z0-9]{16}$/u;
const CLOUD_STORAGE_KEY = /^[A-Za-z0-9_-]{1,128}$/u;

export interface StorageScope {
  projectId: string;
  botId: string;
  userId: string;
  partitionId: string;
}

export interface StoragePersistence {
  get(
    kind: "device" | "cloud",
    scope: StorageScope,
    key: string,
  ): string | null | Promise<string | null>;
  keys(
    kind: "device" | "cloud",
    scope: StorageScope,
  ): string[] | Promise<string[]>;
  set(
    kind: "device" | "cloud",
    scope: StorageScope,
    key: string,
    value: string | null,
  ): void | Promise<void>;
  clear(
    kind: "device" | "cloud",
    scope: StorageScope,
  ): number | Promise<number>;
}

export interface CloudStorageProvider {
  invoke(
    scope: StorageScope,
    method: CloudStorageMethod,
    parameters: CloudStorageParameters,
  ): Promise<unknown>;
}

export type CloudStorageMethod =
  | "saveStorageValue"
  | "getStorageValues"
  | "deleteStorageValues"
  | "getStorageKeys";
export type CloudStorageParameters =
  | { key: string; value: string }
  | { keys: string[] }
  | Record<string, never>;
export interface CloudStorageRequest {
  method: CloudStorageMethod;
  parameters: CloudStorageParameters;
}
export interface StorageResult {
  status:
    | "applied"
    | "simulated"
    | "denied"
    | "unsupported"
    | "stale"
    | "invalid";
  replies: Array<{ eventType: string; eventData: unknown }>;
}

/** Shares SDK callback ID uniqueness across DeviceStorage and SecureStorage. */
export class StorageRequestIdCoordinator {
  private readonly active = new Set<string>();

  claim(scope: StorageScope, generation: number, requestId: string): boolean {
    const key = this.key(scope, generation, requestId);
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }

  release(scope: StorageScope, generation: number, requestId: string): void {
    this.active.delete(this.key(scope, generation, requestId));
  }

  private key(
    scope: StorageScope,
    generation: number,
    requestId: string,
  ): string {
    return JSON.stringify([
      scope.projectId,
      scope.botId,
      scope.userId,
      scope.partitionId,
      generation,
      requestId,
    ]);
  }
}

export const sharedStorageRequestIds = new StorageRequestIdCoordinator();

/**
 * Device storage is backed by host persistence only when explicitly injected.
 * A real-mode Telegram device-storage adapter must be qualified separately.
 */
export class StorageProtocolService {
  constructor(
    private readonly mode: "mock" | "real",
    private readonly scope: StorageScope,
    private navigationGeneration: number,
    private readonly clientVersion: string | undefined,
    private readonly simulatedStorage?: StoragePersistence,
    private readonly deviceStorage?: StoragePersistence,
    private readonly cloudStorage?: StoragePersistence,
    private readonly cloudProvider?: CloudStorageProvider,
    private readonly requestIds: StorageRequestIdCoordinator = sharedStorageRequestIds,
  ) {
    validateStorageScope(scope);
  }

  async handle(event: ProtocolEvent): Promise<StorageResult> {
    if (event.navigationGeneration !== this.navigationGeneration)
      return result("stale");
    const descriptor = findProtocolEvent(event.eventType);
    if (descriptor?.ownerCard !== "04f" || descriptor.direction !== "outgoing")
      return result("unsupported");
    if (!isVersionAtLeast(this.clientVersion, descriptor.minimumVersion ?? "0"))
      return deviceFailure(event.eventType, "UNSUPPORTED");
    const payload = parseDeviceRequest(event.eventType, event.eventData);
    if (!payload) return deviceFailure(event.eventType, "INVALID_INPUT");
    if (
      !this.requestIds.claim(
        this.scope,
        event.navigationGeneration,
        payload.req_id,
      )
    )
      return deviceFailure(
        event.eventType,
        "DUPLICATE_REQUEST_ID",
        payload.req_id,
      );
    const backend = this.deviceBackend();
    if (!backend)
      return deviceFailure(event.eventType, "UNSUPPORTED", payload.req_id);
    try {
      if (payload.operation === "get") {
        const value = await backend.get("device", this.scope, payload.key);
        if (event.navigationGeneration !== this.navigationGeneration)
          return result("stale");
        if (value !== null && !validDeviceValue(value))
          return deviceFailure(
            event.eventType,
            "INVALID_STORAGE_VALUE",
            payload.req_id,
          );
        return result(this.mode === "mock" ? "simulated" : "applied", [
          {
            eventType: "device_storage_key_received",
            eventData: { req_id: payload.req_id, value },
          },
        ]);
      }
      if (payload.operation === "save") {
        await backend.set("device", this.scope, payload.key, payload.value);
        if (event.navigationGeneration !== this.navigationGeneration)
          return result("stale");
        return result(this.mode === "mock" ? "simulated" : "applied", [
          {
            eventType: "device_storage_key_saved",
            eventData: { req_id: payload.req_id },
          },
        ]);
      }
      await backend.clear("device", this.scope);
      if (event.navigationGeneration !== this.navigationGeneration)
        return result("stale");
      return result(this.mode === "mock" ? "simulated" : "applied", [
        {
          eventType: "device_storage_cleared",
          eventData: { req_id: payload.req_id },
        },
      ]);
    } catch (error) {
      if (event.navigationGeneration !== this.navigationGeneration)
        return result("stale");
      return deviceFailure(event.eventType, errorCode(error), payload.req_id);
    } finally {
      this.requestIds.release(
        this.scope,
        event.navigationGeneration,
        payload.req_id,
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

  /** Called by the separately owned custom-method flow; this never claims Telegram cloud data in mock mode. */
  async invokeCloud(request: unknown): Promise<{
    status: StorageResult["status"];
    value?: unknown;
    error?: string;
  }> {
    if (!isVersionAtLeast(this.clientVersion, "6.9"))
      return { status: "unsupported", error: "UNSUPPORTED" };
    const parsed = parseCloudStorageRequest(request);
    if (!parsed) return { status: "invalid", error: "INVALID_INPUT" };
    try {
      if (this.mode === "mock") {
        if (!this.cloudStorage)
          return { status: "unsupported", error: "UNSUPPORTED" };
        const value = await invokeLocalCloud(
          this.cloudStorage,
          this.scope,
          parsed,
        );
        return withinProtocolReplyLimit(value)
          ? { status: "simulated", value }
          : { status: "denied", error: "RESPONSE_TOO_LARGE" };
      }
      if (!this.cloudProvider)
        return { status: "unsupported", error: "UNSUPPORTED" };
      const value = await this.cloudProvider.invoke(
        this.scope,
        parsed.method,
        parsed.parameters,
      );
      if (!withinProtocolReplyLimit(value))
        return { status: "denied", error: "RESPONSE_TOO_LARGE" };
      return {
        status: "applied",
        value,
      };
    } catch (error) {
      return { status: "denied", error: errorCode(error) };
    }
  }

  private deviceBackend(): StoragePersistence | undefined {
    return this.mode === "mock" ? this.simulatedStorage : this.deviceStorage;
  }
}

export function parseCloudStorageRequest(
  input: unknown,
): CloudStorageRequest | null {
  if (
    !isRecord(input) ||
    !exactKeys(input, ["method", "params"]) ||
    typeof input.method !== "string" ||
    !isRecord(input.params)
  )
    return null;
  const params = input.params;
  switch (input.method) {
    case "saveStorageValue":
      if (
        !exactKeys(params, ["key", "value"]) ||
        !validStorageKey(params.key) ||
        typeof params.value !== "string" ||
        params.value.length > CLOUD_STORAGE_MAX_VALUE_CHARACTERS
      )
        return null;
      return {
        method: input.method,
        parameters: { key: params.key, value: params.value },
      };
    case "getStorageValues":
    case "deleteStorageValues": {
      if (
        !exactKeys(params, ["keys"]) ||
        !Array.isArray(params.keys) ||
        params.keys.length < 1 ||
        params.keys.length > CLOUD_STORAGE_MAX_ITEMS ||
        !params.keys.every(validStorageKey) ||
        new Set(params.keys).size !== params.keys.length
      )
        return null;
      return { method: input.method, parameters: { keys: [...params.keys] } };
    }
    case "getStorageKeys":
      if (Object.keys(params).length !== 0) return null;
      return { method: input.method, parameters: {} };
    default:
      return null;
  }
}

export function parseDeviceRequest(
  eventType: string,
  input: unknown,
):
  | { operation: "get"; req_id: string; key: string }
  | { operation: "save"; req_id: string; key: string; value: string | null }
  | { operation: "clear"; req_id: string }
  | null {
  if (!isRecord(input)) return null;
  if (eventType === "web_app_device_storage_clear")
    return exactKeys(input, ["req_id"]) && validRequestId(input.req_id)
      ? { operation: "clear", req_id: input.req_id }
      : null;
  if (eventType === "web_app_device_storage_get_key")
    return exactKeys(input, ["req_id", "key"]) &&
      validRequestId(input.req_id) &&
      validDeviceStorageKey(input.key)
      ? { operation: "get", req_id: input.req_id, key: input.key }
      : null;
  if (eventType === "web_app_device_storage_save_key")
    return exactKeys(input, ["req_id", "key", "value"]) &&
      validRequestId(input.req_id) &&
      validDeviceStorageKey(input.key) &&
      (input.value === null || validDeviceValue(input.value))
      ? {
          operation: "save",
          req_id: input.req_id,
          key: input.key,
          value: input.value as string | null,
        }
      : null;
  return null;
}

export function validateStorageScope(scope: StorageScope): void {
  if (
    !isRecord(scope) ||
    ![scope.projectId, scope.botId, scope.userId, scope.partitionId].every(
      validScopeId,
    )
  )
    throw new TypeError("Trusted protocol storage scope is invalid.");
}

function validScopeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  );
}
function validStorageKey(value: unknown): value is string {
  return typeof value === "string" && CLOUD_STORAGE_KEY.test(value);
}
function validDeviceStorageKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  );
}
function validRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}
function validDeviceValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    new TextEncoder().encode(value).byteLength <= DEVICE_STORAGE_MAX_VALUE_BYTES
  );
}
function withinProtocolReplyLimit(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    return (
      typeof serialized === "string" &&
      new TextEncoder().encode(serialized).byteLength <= 60 * 1024
    );
  } catch {
    return false;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function result(
  status: StorageResult["status"],
  replies: StorageResult["replies"] = [],
): StorageResult {
  return { status, replies };
}
function deviceFailure(
  eventType: string,
  code: string,
  requestId?: string,
): StorageResult {
  const replyByEvent: Record<string, string> = {
    web_app_device_storage_clear: "device_storage_failed",
    web_app_device_storage_get_key: "device_storage_failed",
    web_app_device_storage_save_key: "device_storage_failed",
  };
  return result(code === "UNSUPPORTED" ? "unsupported" : "denied", [
    {
      eventType: replyByEvent[eventType] ?? "device_storage_failed",
      eventData: { ...(requestId ? { req_id: requestId } : {}), error: code },
    },
  ]);
}
function errorCode(error: unknown): string {
  if (error instanceof Error && error.name === "ProtocolStorageQuotaError")
    return "QUOTA_EXCEEDED";
  if (error instanceof Error && error.name === "ProtocolStorageInputError")
    return "INVALID_INPUT";
  if (
    error instanceof Error &&
    error.name === "ProtocolStorageUnavailableError"
  )
    return "UNSUPPORTED";
  return "UNKNOWN_ERROR";
}
function isVersionAtLeast(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const parse = (version: string) =>
    /^\d+(?:\.\d+)*$/u.test(version) ? version.split(".").map(Number) : null;
  const a = parse(left),
    b = parse(right);
  if (!a || !b) return false;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}
async function invokeLocalCloud(
  backend: StoragePersistence,
  scope: StorageScope,
  request: CloudStorageRequest,
): Promise<unknown> {
  const { method, parameters } = request;
  if (method === "saveStorageValue") {
    const { key, value } = parameters as { key: string; value: string };
    const existing = await backend.get("cloud", scope, key);
    if (
      existing === null &&
      (await backend.keys("cloud", scope)).length >= CLOUD_STORAGE_MAX_ITEMS
    )
      throw new ProtocolStorageQuotaError();
    await backend.set("cloud", scope, key, value);
    return true;
  }
  if (method === "getStorageValues") {
    const result: Record<string, string | null> = Object.create(null) as Record<
      string,
      string | null
    >;
    for (const key of (parameters as { keys: string[] }).keys)
      result[key] = await backend.get("cloud", scope, key);
    return result;
  }
  if (method === "deleteStorageValues") {
    for (const key of (parameters as { keys: string[] }).keys)
      await backend.set("cloud", scope, key, null);
    return true;
  }
  return backend.keys("cloud", scope);
}

export class ProtocolStorageQuotaError extends Error {
  constructor() {
    super("Storage quota exceeded.");
    this.name = "ProtocolStorageQuotaError";
  }
}
