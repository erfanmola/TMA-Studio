import type {
  Project,
  ProjectSnapshot,
  StudioErrorCode,
  StudioSettings,
} from "./entities";
import {
  assertBoundedSerializable,
  ProjectSchema,
  ProjectSnapshotSchema,
  type Schema,
  StudioSettingsSchema,
  ValidationError,
} from "./schemas";

export const RPC_PROTOCOL_VERSION = 1 as const;
export type RpcCommand =
  | { method: "project.get"; projectId: string }
  | { method: "project.create"; project: Project }
  | {
      method: "project.update";
      projectId: string;
      expectedRevision: number;
      patch: Partial<
        Pick<
          Project,
          | "name"
          | "url"
          | "avatarColorIndex"
          | "botTokenRef"
          | "identityId"
          | "defaultMode"
          | "launch"
          | "splash"
        >
      >;
    }
  | { method: "project.delete"; projectId: string; expectedRevision: number }
  | { method: "settings.get" }
  | {
      method: "settings.update";
      expectedRevision: number;
      settings: StudioSettings;
    };
export type RpcRequest = {
  protocolVersion: typeof RPC_PROTOCOL_VERSION;
  requestId: string;
  command: RpcCommand;
};
export type RpcReply =
  | {
      protocolVersion: typeof RPC_PROTOCOL_VERSION;
      requestId: string;
      ok: true;
      result: ProjectSnapshot | StudioSettings | null;
    }
  | {
      protocolVersion: typeof RPC_PROTOCOL_VERSION;
      requestId: string;
      ok: false;
      error: { code: StudioErrorCode; messageKey: string };
    };

const bad = (path: string): never => {
  throw new ValidationError(`${path}: invalid RPC value`);
};
const obj = (
  v: unknown,
  path: string,
  keys: readonly string[],
): Record<string, unknown> => {
  if (
    v === null ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    return bad(path);
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (!keys.includes(k))
      throw new ValidationError(`${path}.${k}: unknown field`);
  return o;
};
const text = (v: unknown, p: string, max = 128): string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  ![...v].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })
    ? v
    : bad(p);
const revision = (v: unknown, p: string): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : bad(p);
const wrapped = <T>(parse: (v: unknown) => T): Schema<T> => ({
  parse: (input) => {
    assertBoundedSerializable(input);
    return parse(input);
  },
});
const requestId = (v: unknown, p: string) => text(v, p, 128);
const partialProject = (
  v: unknown,
  p: string,
): RpcCommand extends { method: "project.update"; patch: infer P }
  ? P
  : never => {
  const allowed = [
    "name",
    "url",
    "avatarColorIndex",
    "botTokenRef",
    "identityId",
    "defaultMode",
    "launch",
    "splash",
  ] as const;
  const o = obj(v, p, allowed);
  if (Object.keys(o).length === 0) bad(p);
  const full = {
    id: "patch",
    name: "Patch",
    url: "https://localhost",
    avatarColorIndex: 0,
    identityId: "identity",
    defaultMode: "overlay",
    launch: { kind: "mock", signing: "unsigned", advanced: {} },
    splash: {
      title: "Splash",
      lightBackground: "#ffffff",
      darkBackground: "#000000",
      presentation: "project",
    },
    createdAt: "2000-01-01T00:00:00Z",
    updatedAt: "2000-01-01T00:00:00Z",
    revision: 0,
    ...o,
  };
  const parsed = ProjectSchema.parse(full);
  const result: Record<string, unknown> = {};
  for (const k of allowed)
    if (o[k] !== undefined) result[k] = parsed[k as keyof Project];
  return result as never;
};
export const RpcCommandSchema: Schema<RpcCommand> = wrapped((v) => {
  const base = obj(v, "command", [
    "method",
    "projectId",
    "project",
    "expectedRevision",
    "patch",
    "settings",
  ]);
  const method = text(base.method, "command.method", 64);
  switch (method) {
    case "project.get":
    case "project.delete": {
      const o = obj(
        v,
        "command",
        method === "project.get"
          ? ["method", "projectId"]
          : ["method", "projectId", "expectedRevision"],
      );
      return method === "project.get"
        ? { method, projectId: text(o.projectId, "command.projectId") }
        : {
            method,
            projectId: text(o.projectId, "command.projectId"),
            expectedRevision: revision(
              o.expectedRevision,
              "command.expectedRevision",
            ),
          };
    }
    case "project.create": {
      const o = obj(v, "command", ["method", "project"]);
      return { method, project: ProjectSchema.parse(o.project) };
    }
    case "project.update": {
      const o = obj(v, "command", [
        "method",
        "projectId",
        "expectedRevision",
        "patch",
      ]);
      return {
        method,
        projectId: text(o.projectId, "command.projectId"),
        expectedRevision: revision(
          o.expectedRevision,
          "command.expectedRevision",
        ),
        patch: partialProject(o.patch, "command.patch"),
      };
    }
    case "settings.get": {
      obj(v, "command", ["method"]);
      return { method };
    }
    case "settings.update": {
      const o = obj(v, "command", ["method", "expectedRevision", "settings"]);
      return {
        method,
        expectedRevision: revision(
          o.expectedRevision,
          "command.expectedRevision",
        ),
        settings: StudioSettingsSchema.parse(o.settings),
      };
    }
    default:
      throw new ValidationError("command.method: unsupported RPC method");
  }
});
export const RpcRequestSchema: Schema<RpcRequest> = wrapped((v) => {
  const o = obj(v, "request", ["protocolVersion", "requestId", "command"]);
  if (o.protocolVersion !== RPC_PROTOCOL_VERSION)
    bad("request.protocolVersion");
  return {
    protocolVersion: RPC_PROTOCOL_VERSION,
    requestId: requestId(o.requestId, "request.requestId"),
    command: RpcCommandSchema.parse(o.command),
  };
});
export const RpcReplySchema: Schema<RpcReply> = wrapped((v) => {
  const o = obj(v, "reply", [
    "protocolVersion",
    "requestId",
    "ok",
    "result",
    "error",
  ]);
  if (o.protocolVersion !== RPC_PROTOCOL_VERSION) bad("reply.protocolVersion");
  const id = requestId(o.requestId, "reply.requestId");
  if (o.ok === true) {
    if (o.error !== undefined) bad("reply.error");
    const r = o.result;
    if (r === null)
      return {
        protocolVersion: RPC_PROTOCOL_VERSION,
        requestId: id,
        ok: true,
        result: null,
      };
    try {
      return {
        protocolVersion: RPC_PROTOCOL_VERSION,
        requestId: id,
        ok: true,
        result: ProjectSnapshotSchema.parse(r),
      };
    } catch {
      return {
        protocolVersion: RPC_PROTOCOL_VERSION,
        requestId: id,
        ok: true,
        result: StudioSettingsSchema.parse(r),
      };
    }
  }
  if (o.ok === false) {
    if (o.result !== undefined) bad("reply.result");
    const e = obj(o.error, "reply.error", ["code", "messageKey"]);
    const codes = [
      "INVALID_INPUT",
      "NOT_FOUND",
      "CONFLICT",
      "UNAVAILABLE",
      "INTERNAL",
    ] as const;
    if (
      typeof e.code !== "string" ||
      !codes.includes(e.code as (typeof codes)[number])
    )
      bad("reply.error.code");
    return {
      protocolVersion: RPC_PROTOCOL_VERSION,
      requestId: id,
      ok: false,
      error: {
        code: e.code as StudioErrorCode,
        messageKey: text(e.messageKey, "reply.error.messageKey"),
      },
    };
  }
  return bad("reply.ok");
});
