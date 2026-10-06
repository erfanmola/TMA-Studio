import type { Identity } from "../../contracts/entities";
import type {
  SafeIdentity,
  UsersCommand,
  UsersReply,
  UsersResult,
} from "../../contracts/users-rpc";
import {
  type MockUserFields,
  type ProjectReference,
  type UsersService,
  UsersServiceError,
} from "../../contracts/users-service";
import { nextRequestId } from "./request-id";

type Bridge = NonNullable<Window["__bunium"]>;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function safeIdentity(value: unknown): value is SafeIdentity {
  if (!record(value) || typeof value.id !== "string") return false;
  if (value.kind === "mock")
    return (
      typeof value.telegramId === "string" &&
      typeof value.firstName === "string" &&
      typeof value.languageCode === "string" &&
      typeof value.isPremium === "boolean" &&
      typeof value.revision === "number"
    );
  if (value.kind === "telegram")
    return (
      !("accountRef" in value) &&
      record(value.profile) &&
      typeof value.profile.telegramId === "string" &&
      typeof value.profile.firstName === "string" &&
      ["ready", "stale", "reauthorize"].includes(String(value.status)) &&
      typeof value.revision === "number"
    );
  return false;
}
function projectReference(value: unknown): value is ProjectReference {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.identityId === "string"
  );
}
function rendererIdentity(value: SafeIdentity): Identity {
  return value.kind === "mock"
    ? value
    : { ...value, accountRef: "host-managed" };
}

/** Renderer proxy for persistent, host-owned mock and Telegram identities. */
export class BuniumUsersBridgeService implements UsersService {
  private readonly bridge: Bridge;
  private readonly pending = new Map<
    string,
    (reply: UsersReply | null) => void
  >();
  private readonly receive = (payload: unknown) => {
    if (!record(payload) || typeof payload.requestId !== "string") return;
    const resolve = this.pending.get(payload.requestId);
    if (!resolve) return;
    this.pending.delete(payload.requestId);
    if (
      payload.ok === false &&
      ["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "INTERNAL"].includes(
        String(payload.error),
      )
    ) {
      resolve({
        requestId: payload.requestId,
        ok: false,
        error: payload.error as Extract<UsersReply, { ok: false }>["error"],
      });
    } else if (payload.ok === true && this.safeResult(payload.result)) {
      resolve({
        requestId: payload.requestId,
        ok: true,
        result: payload.result,
      });
    } else {
      resolve(null);
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge)
      throw new Error("The trusted Bunium users bridge is unavailable.");
    this.bridge = bridge;
    bridge.on("users.reply", this.receive);
  }

  async listIdentities(): Promise<Identity[]> {
    const result = await this.request({ method: "list-identities" });
    if (!Array.isArray(result) || !result.every(safeIdentity))
      throw new UsersServiceError("INTERNAL");
    return result.map(rendererIdentity);
  }

  async getIdentity(identityId: string): Promise<Identity | null> {
    const result = await this.request({ method: "get-identity", identityId });
    if (result === null) return null;
    if (!safeIdentity(result)) throw new UsersServiceError("INTERNAL");
    return rendererIdentity(result);
  }

  async listProjectReferences(identityId: string): Promise<ProjectReference[]> {
    const result = await this.request({
      method: "list-project-references",
      identityId,
    });
    if (!Array.isArray(result) || !result.every(projectReference))
      throw new UsersServiceError("INTERNAL");
    return result;
  }

  async saveMock(
    fields: MockUserFields,
    identityId?: string,
    expectedRevision?: number,
  ): Promise<Extract<Identity, { kind: "mock" }>> {
    const result = await this.request({
      method: "save-mock",
      fields,
      ...(identityId ? { identityId } : {}),
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    });
    if (!safeIdentity(result) || result.kind !== "mock")
      throw new UsersServiceError("INTERNAL");
    return result;
  }

  async deleteMock(
    identityId: string,
    expectedRevision: number,
    reassignToId?: string,
  ): Promise<void> {
    const result = await this.request({
      method: "delete-mock",
      identityId,
      expectedRevision,
      ...(reassignToId ? { reassignToId } : {}),
    });
    if (result !== null) throw new UsersServiceError("INTERNAL");
  }

  close(): void {
    this.bridge.off?.("users.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "INTERNAL" });
    }
    this.pending.clear();
  }

  private safeResult(value: unknown): value is UsersResult {
    if (Array.isArray(value))
      return value.every(safeIdentity) || value.every(projectReference);
    return value === null || safeIdentity(value);
  }

  private request(command: UsersCommand): Promise<UsersResult> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new UsersServiceError("INTERNAL"));
      }, 30_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (!reply) {
          reject(new UsersServiceError("INTERNAL"));
        } else if (!reply.ok) {
          reject(new UsersServiceError(reply.error));
        } else {
          resolve(reply.result);
        }
      });
      this.bridge.send("users.request", JSON.stringify({ requestId, command }));
    });
  }
}
