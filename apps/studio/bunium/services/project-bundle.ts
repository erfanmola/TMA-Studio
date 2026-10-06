import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Identity, Project } from "../../src/contracts/entities";
import {
  MAX_PROJECT_BUNDLE_BYTES,
  type PortableProject,
  PROJECT_BUNDLE_FORMAT,
  PROJECT_BUNDLE_VERSION,
  type ProjectBundle,
  type ProjectBundlePreview,
  parseProjectBundle,
} from "../../src/contracts/project-bundle";
import { assertBoundedSerializable } from "../../src/contracts/schemas";
import type { StudioStore } from "./store";

const BOT_TOKEN = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/u;
const SENSITIVE_KEY =
  /(?:token|secret|password|cookie|session|auth|credential|signature|init.?data|api.?key)/iu;

export class ProjectBundleServiceError extends Error {
  constructor(
    readonly code:
      | "INVALID_INPUT"
      | "UNSUPPORTED_SCHEMA"
      | "IMPORT_FAILED"
      | "EXPORT_FAILED",
  ) {
    super(code);
    this.name = "ProjectBundleServiceError";
  }
}

function safeProject(project: Project): PortableProject {
  const { botTokenRef: _botTokenRef, revision: _revision, ...base } = project;
  let launch = base.launch;
  if (launch.kind === "mock") {
    const advanced = Object.fromEntries(
      Object.entries(launch.advanced).filter(
        ([key, value]) => !SENSITIVE_KEY.test(key) && !BOT_TOKEN.test(value),
      ),
    );
    launch = { ...launch, signing: "unsigned", advanced };
  }
  let url = base.url;
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    url = parsed.toString();
  } catch {
    throw new ProjectBundleServiceError("INVALID_INPUT");
  }
  return { ...base, url, launch };
}

function sanitizeBundle(bundle: ProjectBundle): ProjectBundle {
  return {
    ...bundle,
    identities: bundle.identities.map((identity) => {
      if (!identity.photoUrl) return identity;
      try {
        const photo = new URL(identity.photoUrl);
        photo.search = "";
        photo.hash = "";
        return { ...identity, photoUrl: photo.toString() };
      } catch {
        const { photoUrl: _photoUrl, ...safeIdentity } = identity;
        return safeIdentity;
      }
    }),
    projects: bundle.projects.map((project) =>
      safeProject({ ...project, revision: 1 } as Project),
    ),
  };
}

async function readBundleFile(
  path: string,
): Promise<{ bundle: ProjectBundle; digest: string }> {
  try {
    const before = await lstat(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size > MAX_PROJECT_BUNDLE_BYTES
    )
      throw new ProjectBundleServiceError("INVALID_INPUT");
    const bytes = await readFile(path);
    if (bytes.byteLength > MAX_PROJECT_BUNDLE_BYTES)
      throw new ProjectBundleServiceError("INVALID_INPUT");
    const after = await lstat(path);
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      after.size !== before.size ||
      createHash("sha256").update(bytes).digest("hex") !==
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex")
    )
      throw new ProjectBundleServiceError("INVALID_INPUT");
    return {
      bundle: sanitizeBundle(
        parseProjectBundle(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          ) as unknown,
        ),
      ),
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof ProjectBundleServiceError) throw error;
    if (error instanceof Error && error.message === "UNSUPPORTED_SCHEMA")
      throw new ProjectBundleServiceError("UNSUPPORTED_SCHEMA");
    throw new ProjectBundleServiceError("INVALID_INPUT");
  }
}

export class ProjectBundleService {
  private readonly previews = new Map<string, string>();

  constructor(
    private readonly store: StudioStore,
    private readonly newId: () => string = randomUUID,
    private readonly now: () => Date = () => new Date(),
  ) {}

  catalog(): {
    projects: {
      id: string;
      name: string;
      identityId: string;
      identityKind: "mock" | "telegram";
    }[];
    identities: { id: string; name: string }[];
  } {
    const identities = this.store.listIdentities();
    const identityById = new Map(
      identities.map((identity) => [identity.id, identity]),
    );
    return {
      projects: this.store.getSnapshot().projects.map((project) => ({
        id: project.id,
        name: project.name,
        identityId: project.identityId,
        identityKind: identityById.get(project.identityId)?.kind ?? "telegram",
      })),
      identities: identities.flatMap((identity) =>
        identity.kind === "mock"
          ? [
              {
                id: identity.id,
                name:
                  [identity.firstName, identity.lastName]
                    .filter(Boolean)
                    .join(" ") || "Mock user",
              },
            ]
          : [],
      ),
    };
  }

  async exportFile(
    path: string,
    projectIds: readonly string[],
    identityIds: readonly string[],
  ): Promise<{ projectCount: number; identityCount: number }> {
    try {
      if (
        projectIds.length === 0 ||
        identityIds.length === 0 ||
        new Set(projectIds).size !== projectIds.length ||
        new Set(identityIds).size !== identityIds.length
      )
        throw new ProjectBundleServiceError("INVALID_INPUT");
      const catalog = this.catalog();
      const selectedProjects = this.store
        .getSnapshot()
        .projects.filter((project) => projectIds.includes(project.id));
      const selectedIdentityIds = new Set(identityIds);
      const selectedIdentities = this.store
        .listIdentities()
        .filter(
          (identity): identity is Extract<Identity, { kind: "mock" }> =>
            identity.kind === "mock" && selectedIdentityIds.has(identity.id),
        );
      if (
        selectedProjects.length !== projectIds.length ||
        selectedIdentities.length !== identityIds.length ||
        selectedProjects.some(
          (project) =>
            !selectedIdentityIds.has(project.identityId) ||
            catalog.projects.find((item) => item.id === project.id)
              ?.identityKind !== "mock",
        )
      )
        throw new ProjectBundleServiceError("INVALID_INPUT");
      const bundle = parseProjectBundle({
        format: PROJECT_BUNDLE_FORMAT,
        schemaVersion: PROJECT_BUNDLE_VERSION,
        exportedAt: this.now().toISOString(),
        identities: selectedIdentities.map((identity) => {
          const { revision: _revision, ...portable } = identity;
          if (!portable.photoUrl) return portable;
          const photo = new URL(portable.photoUrl);
          photo.search = "";
          photo.hash = "";
          return { ...portable, photoUrl: photo.toString() };
        }),
        projects: selectedProjects.map(safeProject),
      });
      const serialized = JSON.stringify(bundle, null, 2);
      assertBoundedSerializable(bundle);
      const bytes = new TextEncoder().encode(serialized);
      if (bytes.byteLength > MAX_PROJECT_BUNDLE_BYTES)
        throw new ProjectBundleServiceError("EXPORT_FAILED");
      const destination = resolve(path);
      const temporary = `${destination}.${this.newId()}.tmp`;
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      try {
        const handle = await open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await chmod(temporary, 0o600).catch(() => {});
        await rename(temporary, destination);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        throw error;
      }
      return {
        projectCount: bundle.projects.length,
        identityCount: bundle.identities.length,
      };
    } catch (error) {
      if (error instanceof ProjectBundleServiceError) throw error;
      throw new ProjectBundleServiceError("EXPORT_FAILED");
    }
  }

  async previewFile(path: string): Promise<ProjectBundlePreview> {
    const { bundle, digest } = await readBundleFile(path);
    const key = resolve(path);
    this.previews.delete(key);
    this.previews.set(key, digest);
    while (this.previews.size > 128) {
      const oldest = this.previews.keys().next().value;
      if (!oldest) break;
      this.previews.delete(oldest);
    }
    const projects = this.store.getSnapshot().projects;
    const identities = this.store.listIdentities();
    const projectIds = new Set(projects.map((project) => project.id));
    const mockTelegramIds = new Set(
      identities
        .filter((identity) => identity.kind === "mock")
        .map((identity) => identity.telegramId),
    );
    return {
      projectCount: bundle.projects.length,
      identityCount: bundle.identities.length,
      projectIdCollisionCount: bundle.projects.filter((project) =>
        projectIds.has(project.id),
      ).length,
      duplicateIdentityCount: bundle.identities.filter((identity) =>
        mockTelegramIds.has(identity.telegramId),
      ).length,
      projects: bundle.projects.map(({ id, name }) => ({
        id,
        name,
        collision: projectIds.has(id),
      })),
    };
  }

  async importFile(path: string): Promise<{
    projectCount: number;
    identityCount: number;
    remappedProjectCount: number;
    reusedIdentityCount: number;
  }> {
    const key = resolve(path);
    const expectedDigest = this.previews.get(key);
    const { bundle, digest } = await readBundleFile(path);
    if (!expectedDigest || expectedDigest !== digest) {
      this.previews.delete(key);
      throw new ProjectBundleServiceError("INVALID_INPUT");
    }
    const projects = bundle.projects.map((project) => ({
      ...project,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
      revision: 1,
    })) as Project[];
    const identities = bundle.identities.map((identity) => ({
      ...identity,
      revision: 1,
    })) as Extract<Identity, { kind: "mock" }>[];
    const result = this.store.importProjectBundle(
      { identities, projects },
      this.newId,
    );
    this.previews.delete(key);
    return result;
  }
}
