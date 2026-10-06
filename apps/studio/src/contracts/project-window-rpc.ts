import type { Platform } from "./entities";
import { PLATFORMS, type Project } from "./entities";
import type {
  IdentityOption,
  ProjectFields,
  SavedProject,
  TokenEdit,
} from "./project-service";
import { ProjectSchema } from "./schemas";

export type ProjectWindowCommand =
  | { method: "create"; fields: ProjectFields; token: string | null }
  | {
      method: "load";
      projectId: string;
    }
  | {
      method: "update";
      projectId: string;
      expectedRevision: number;
      patch: Partial<ProjectFields>;
      token: TokenEdit;
    }
  | { method: "list-identities" }
  | { method: "launch"; projectId: string; platform: Platform }
  | { method: "create-identity" };
export type ProjectWindowRequest = {
  requestId: string;
  command: ProjectWindowCommand;
};
export type ProjectWindowResult =
  | SavedProject
  | IdentityOption[]
  | string
  | null;
export type ProjectWindowReply =
  | { requestId: string; ok: true; result: ProjectWindowResult }
  | {
      requestId: string;
      ok: false;
      error:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFLICT"
        | "UNAVAILABLE"
        | "INTERNAL"
        | "VAULT_UNAVAILABLE";
    };

type RecordValue = Record<string, unknown>;
const fieldKeys = [
  "name",
  "url",
  "avatarColorIndex",
  "identityId",
  "defaultMode",
  "launch",
  "splash",
] as const;
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    ![...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  );
}
function fields(value: unknown, partial: boolean): ProjectFields | null {
  if (
    !record(value) ||
    !exactKeys(value, fieldKeys) ||
    (partial && Object.keys(value).length === 0) ||
    (!partial && fieldKeys.some((key) => !(key in value)))
  )
    return null;
  const defaults = {
    name: "Project",
    url: "https://localhost",
    avatarColorIndex: 0,
    identityId: "identity",
    defaultMode: "overlay",
    launch: { kind: "mock", signing: "unsigned", advanced: {} },
    splash: {
      title: "Project",
      lightBackground: "#ffffff",
      darkBackground: "#000000",
      presentation: "project",
    },
  };
  try {
    const input = { ...defaults, ...value };
    const validated = ProjectSchema.parse({
      ...input,
      id: "project-window-input",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      revision: 1,
    });
    const result = Object.fromEntries(
      fieldKeys
        .filter((key) => key in value)
        .map((key) => [key, validated[key as keyof Project]]),
    );
    return result as ProjectFields;
  } catch {
    return null;
  }
}
function tokenEdit(value: unknown): TokenEdit | null {
  if (!record(value) || typeof value.kind !== "string") return null;
  if (value.kind === "keep" && exactKeys(value, ["kind"]))
    return { kind: "keep" };
  if (value.kind === "remove" && exactKeys(value, ["kind"]))
    return { kind: "remove" };
  if (
    value.kind === "set" &&
    exactKeys(value, ["kind", "value"]) &&
    typeof value.value === "string" &&
    value.value.length <= 128
  )
    return { kind: "set", value: value.value };
  return null;
}

/** Strictly bounds project commands before routing them to the host service. */
export function parseProjectWindowRequest(
  value: unknown,
): ProjectWindowRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 32_768) return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (
    !record(candidate) ||
    !exactKeys(candidate, ["requestId", "command"]) ||
    typeof candidate.requestId !== "string" ||
    !/^[\w-]{1,64}$/u.test(candidate.requestId) ||
    !record(candidate.command) ||
    typeof candidate.command.method !== "string"
  )
    return null;
  const command = candidate.command;
  switch (command.method) {
    case "create": {
      const parsedFields = fields(command.fields, false);
      return exactKeys(command, ["method", "fields", "token"]) &&
        parsedFields &&
        (command.token === null ||
          (typeof command.token === "string" && command.token.length <= 128))
        ? {
            requestId: candidate.requestId,
            command: {
              method: command.method,
              fields: parsedFields,
              token: command.token as string | null,
            },
          }
        : null;
    }
    case "load":
      return exactKeys(command, ["method", "projectId"]) &&
        validId(command.projectId)
        ? {
            requestId: candidate.requestId,
            command: { method: command.method, projectId: command.projectId },
          }
        : null;
    case "update": {
      const patch = fields(command.patch, true);
      const edit = tokenEdit(command.token);
      return exactKeys(command, [
        "method",
        "projectId",
        "expectedRevision",
        "patch",
        "token",
      ]) &&
        validId(command.projectId) &&
        Number.isSafeInteger(command.expectedRevision) &&
        Number(command.expectedRevision) >= 1 &&
        patch &&
        edit
        ? {
            requestId: candidate.requestId,
            command: {
              method: command.method,
              projectId: command.projectId,
              expectedRevision: Number(command.expectedRevision),
              patch,
              token: edit,
            },
          }
        : null;
    }
    case "list-identities":
    case "create-identity":
      return exactKeys(command, ["method"])
        ? {
            requestId: candidate.requestId,
            command: { method: command.method },
          }
        : null;
    case "launch":
      return exactKeys(command, ["method", "projectId", "platform"]) &&
        validId(command.projectId) &&
        typeof command.platform === "string" &&
        (PLATFORMS as readonly string[]).includes(command.platform)
        ? {
            requestId: candidate.requestId,
            command: {
              method: command.method,
              projectId: command.projectId,
              platform: command.platform as Platform,
            },
          }
        : null;
    default:
      return null;
  }
}

export function safeProjectSaved(saved: SavedProject): SavedProject {
  const { botTokenRef: _hostOnlyReference, ...project } = saved.project;
  return { hasToken: saved.hasToken, project };
}

export function safeProjectWindowReply(
  requestId: string,
  result: ProjectWindowResult,
): ProjectWindowReply {
  const encoded = JSON.stringify(result);
  if (encoded.length > 16_384)
    return { requestId, ok: false, error: "INTERNAL" };
  return {
    requestId,
    ok: true,
    result:
      record(result) && "project" in result && "hasToken" in result
        ? safeProjectSaved(result as SavedProject)
        : result,
  };
}
