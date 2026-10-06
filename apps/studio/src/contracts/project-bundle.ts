import type { Identity, Project } from "./entities";
import {
  assertBoundedSerializable,
  IdentitySchema,
  ProjectSchema,
} from "./schemas";

export const PROJECT_BUNDLE_FORMAT = "tma-studio-project-bundle" as const;
export const PROJECT_BUNDLE_VERSION = 1 as const;
export const MAX_PROJECT_BUNDLE_BYTES = 2 * 1024 * 1024;

export type PortableMockIdentity = Omit<
  Extract<Identity, { kind: "mock" }>,
  "revision"
>;
export type PortableProject = Omit<Project, "botTokenRef" | "revision">;

export interface ProjectBundle {
  format: typeof PROJECT_BUNDLE_FORMAT;
  schemaVersion: typeof PROJECT_BUNDLE_VERSION;
  exportedAt: string;
  identities: PortableMockIdentity[];
  projects: PortableProject[];
}

export interface ProjectBundlePreview {
  projectCount: number;
  identityCount: number;
  projectIdCollisionCount: number;
  duplicateIdentityCount: number;
  projects: { id: string; name: string; collision: boolean }[];
}

export class ProjectBundleValidationError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNSUPPORTED_SCHEMA") {
    super(code);
    this.name = "ProjectBundleValidationError";
  }
}

export function parseProjectBundle(input: unknown): ProjectBundle {
  try {
    assertBoundedSerializable(input);
  } catch {
    throw new ProjectBundleValidationError("INVALID_INPUT");
  }
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new ProjectBundleValidationError("INVALID_INPUT");
  const value = input as Record<string, unknown>;
  if (
    value.format !== PROJECT_BUNDLE_FORMAT ||
    value.schemaVersion !== PROJECT_BUNDLE_VERSION
  )
    throw new ProjectBundleValidationError("UNSUPPORTED_SCHEMA");
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "format",
          "schemaVersion",
          "exportedAt",
          "identities",
          "projects",
        ].includes(key),
    ) ||
    typeof value.exportedAt !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(
      value.exportedAt,
    ) ||
    !Array.isArray(value.identities) ||
    value.identities.length > 128 ||
    !Array.isArray(value.projects) ||
    value.projects.length > 128
  )
    throw new ProjectBundleValidationError("INVALID_INPUT");

  try {
    const identities = value.identities.map((item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item))
        throw new Error();
      const raw = item as Record<string, unknown>;
      if ("revision" in raw || raw.kind !== "mock") throw new Error();
      const parsed = IdentitySchema.parse({ ...raw, revision: 1 });
      if (parsed.kind !== "mock") throw new Error();
      return parsed;
    });
    const projects = value.projects.map((item) => {
      if (item === null || typeof item !== "object" || Array.isArray(item))
        throw new Error();
      const raw = item as Record<string, unknown>;
      if ("revision" in raw || "botTokenRef" in raw) throw new Error();
      const parsed = ProjectSchema.parse({ ...raw, revision: 1 });
      if (parsed.botTokenRef !== undefined) throw new Error();
      if (parsed.launch.kind === "mock" && parsed.launch.signing !== "unsigned")
        throw new Error();
      return parsed;
    });
    const identityIds = new Set(identities.map((identity) => identity.id));
    if (identityIds.size !== identities.length) throw new Error();
    const telegramIds = new Set(
      identities.map((identity) => identity.telegramId),
    );
    if (telegramIds.size !== identities.length) throw new Error();
    const projectIds = new Set(projects.map((project) => project.id));
    if (projectIds.size !== projects.length) throw new Error();
    if (projects.some((project) => !identityIds.has(project.identityId)))
      throw new Error();
    return {
      format: PROJECT_BUNDLE_FORMAT,
      schemaVersion: PROJECT_BUNDLE_VERSION,
      exportedAt: value.exportedAt,
      identities: identities.map(
        ({ revision: _revision, ...identity }) => identity,
      ),
      projects: projects.map(
        ({ revision: _revision, botTokenRef: _token, ...project }) => project,
      ),
    };
  } catch {
    throw new ProjectBundleValidationError("INVALID_INPUT");
  }
}

export interface ProjectBundleCommand {
  method: "catalog" | "export" | "choose-import" | "import";
  projectIds?: string[];
  identityIds?: string[];
}

export interface ProjectBundleRequest {
  requestId: string;
  command: ProjectBundleCommand;
}

export type ProjectBundleOutcome =
  | {
      state: "catalog";
      projects: {
        id: string;
        name: string;
        identityId: string;
        identityKind: "mock" | "telegram";
      }[];
      identities: { id: string; name: string }[];
    }
  | { state: "canceled" }
  | { state: "preview"; preview: ProjectBundlePreview }
  | { state: "exported"; projectCount: number; identityCount: number }
  | {
      state: "imported";
      projectCount: number;
      identityCount: number;
      remappedProjectCount: number;
      reusedIdentityCount: number;
    };

export type ProjectBundleReply =
  | { requestId: string; ok: true; result: ProjectBundleOutcome }
  | {
      requestId: string;
      ok: false;
      error:
        | "INVALID_INPUT"
        | "UNSUPPORTED_SCHEMA"
        | "IMPORT_FAILED"
        | "EXPORT_FAILED";
    };

export function parseProjectBundleRequest(
  value: unknown,
): ProjectBundleRequest | null {
  let candidate = value;
  if (typeof candidate === "string") {
    if (candidate.length > 4096) return null;
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  )
    return null;
  const row = candidate as Record<string, unknown>;
  if (
    Object.keys(row).some((key) => !["requestId", "command"].includes(key)) ||
    typeof row.requestId !== "string" ||
    !/^[\w-]{1,64}$/u.test(row.requestId) ||
    row.command === null ||
    typeof row.command !== "object" ||
    Array.isArray(row.command)
  )
    return null;
  const command = row.command as Record<string, unknown>;
  const method = command.method;
  const expected =
    method === "export" ? ["method", "projectIds", "identityIds"] : ["method"];
  if (
    Object.keys(command).some((key) => !expected.includes(key)) ||
    !["catalog", "export", "choose-import", "import"].includes(String(method))
  )
    return null;
  if (method === "export") {
    const validIds = (ids: unknown): ids is string[] =>
      Array.isArray(ids) &&
      ids.length <= 128 &&
      ids.every((id) => typeof id === "string" && /^[\w-]{1,128}$/u.test(id)) &&
      new Set(ids).size === ids.length;
    if (!validIds(command.projectIds) || !validIds(command.identityIds))
      return null;
  }
  const acceptedMethod = method as ProjectBundleCommand["method"];
  return {
    requestId: row.requestId,
    command:
      acceptedMethod === "export"
        ? {
            method: acceptedMethod,
            projectIds: command.projectIds as string[],
            identityIds: command.identityIds as string[],
          }
        : { method: acceptedMethod },
  };
}

export function safeProjectBundleReply(
  requestId: string,
  result: ProjectBundleOutcome,
): ProjectBundleReply {
  return { requestId, ok: true, result };
}
