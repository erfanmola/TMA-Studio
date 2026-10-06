import type { Platform, Project } from "../../contracts/entities";
import type {
  IdentityOption,
  ProjectFields,
  ProjectService,
  SavedProject,
  TokenEdit,
} from "../../contracts/project-service";
import { ProjectServiceError } from "../../contracts/project-service";
import type {
  ProjectWindowCommand,
  ProjectWindowReply,
  ProjectWindowResult,
} from "../../contracts/project-window-rpc";
import { ProjectSchema } from "../../contracts/schemas";
import { nextRequestId } from "../users/request-id";

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: ProjectWindowReply | null) => void;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function safeProject(value: unknown): value is Project {
  if (!record(value) || "botTokenRef" in value) return false;
  try {
    ProjectSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}
function safeResult(value: unknown): value is ProjectWindowResult {
  if (value === null || typeof value === "string") return true;
  if (Array.isArray(value))
    return value.every(
      (entry) =>
        record(entry) &&
        typeof entry.id === "string" &&
        (entry.kind === "mock" || entry.kind === "telegram") &&
        typeof entry.label === "string",
    );
  return (
    record(value) &&
    typeof value.hasToken === "boolean" &&
    safeProject(value.project)
  );
}

/** Project service adapter over the trusted main-process IPC boundary. */
export class BuniumProjectBridgeService implements ProjectService {
  private readonly bridge: Bridge;
  private readonly pending = new Map<string, Pending>();
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    if (
      value.ok === false &&
      [
        "INVALID_INPUT",
        "NOT_FOUND",
        "CONFLICT",
        "UNAVAILABLE",
        "INTERNAL",
        "VAULT_UNAVAILABLE",
      ].includes(String(value.error))
    ) {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: value.error as Extract<
          ProjectWindowReply,
          { ok: false }
        >["error"],
      });
    } else if (value.ok === true && safeResult(value.result)) {
      resolve({ requestId: value.requestId, ok: true, result: value.result });
    } else {
      resolve({ requestId: value.requestId, ok: false, error: "INTERNAL" });
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new Error("The trusted project bridge is unavailable.");
    this.bridge = bridge;
    bridge.on("project.reply", this.receive);
  }

  create(fields: ProjectFields, token: string | null): Promise<SavedProject> {
    return this.request({
      method: "create",
      fields,
      token,
    }) as Promise<SavedProject>;
  }
  load(projectId: string): Promise<SavedProject> {
    return this.request({ method: "load", projectId }) as Promise<SavedProject>;
  }
  update(
    projectId: string,
    expectedRevision: number,
    patch: Partial<ProjectFields>,
    token: TokenEdit,
  ): Promise<SavedProject> {
    return this.request({
      method: "update",
      projectId,
      expectedRevision,
      patch,
      token,
    }) as Promise<SavedProject>;
  }
  listIdentities(): Promise<IdentityOption[]> {
    return this.request({ method: "list-identities" }) as Promise<
      IdentityOption[]
    >;
  }
  createIdentity(): Promise<string | null> {
    return this.request({ method: "create-identity" }) as Promise<
      string | null
    >;
  }
  async launch(projectId: string, platform: Platform): Promise<void> {
    await this.request({ method: "launch", projectId, platform });
  }

  close(): void {
    this.bridge.off?.("project.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "INTERNAL" });
    }
    this.pending.clear();
  }

  private request(command: ProjectWindowCommand): Promise<unknown> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ProjectServiceError("UNAVAILABLE"));
      }, 30_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (!reply) reject(new ProjectServiceError("INTERNAL"));
        else if (!reply.ok) reject(new ProjectServiceError(reply.error));
        else resolve(reply.result);
      });
      this.bridge.send(
        "project.request",
        JSON.stringify({ requestId, command }),
      );
    });
  }
}
