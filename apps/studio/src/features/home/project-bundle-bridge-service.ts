import type {
  ProjectBundleCommand,
  ProjectBundleOutcome,
  ProjectBundleReply,
} from "../../contracts/project-bundle";
import { nextRequestId } from "../users/request-id";

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: ProjectBundleReply | null) => void;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeOutcome(value: unknown): value is ProjectBundleOutcome {
  if (!record(value) || typeof value.state !== "string") return false;
  if (value.state === "canceled") return true;
  if (value.state === "catalog")
    return (
      Array.isArray(value.projects) &&
      value.projects.length <= 128 &&
      value.projects.every(
        (item) =>
          record(item) &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.identityId === "string" &&
          ["mock", "telegram"].includes(String(item.identityKind)),
      ) &&
      Array.isArray(value.identities) &&
      value.identities.length <= 128 &&
      value.identities.every(
        (item) =>
          record(item) &&
          typeof item.id === "string" &&
          typeof item.name === "string",
      )
    );
  if (value.state === "preview")
    return (
      record(value.preview) &&
      Number.isSafeInteger(value.preview.projectCount) &&
      Number.isSafeInteger(value.preview.identityCount) &&
      Number.isSafeInteger(value.preview.projectIdCollisionCount) &&
      Number.isSafeInteger(value.preview.duplicateIdentityCount) &&
      Array.isArray(value.preview.projects) &&
      value.preview.projects.length <= 128 &&
      value.preview.projects.every(
        (item) =>
          record(item) &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.collision === "boolean",
      )
    );
  if (value.state === "exported" || value.state === "imported")
    return (
      Number.isSafeInteger(value.projectCount) &&
      Number.isSafeInteger(value.identityCount) &&
      (value.state === "exported" ||
        (Number.isSafeInteger(value.remappedProjectCount) &&
          Number.isSafeInteger(value.reusedIdentityCount)))
    );
  return false;
}

/** Trusted renderer proxy; filesystem paths and bundle contents remain host-side. */
export class ProjectBundleBridgeService {
  private readonly pending = new Map<string, Pending>();
  private readonly bridge: Bridge;
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    if (
      value.ok === false &&
      [
        "INVALID_INPUT",
        "UNSUPPORTED_SCHEMA",
        "IMPORT_FAILED",
        "EXPORT_FAILED",
      ].includes(String(value.error))
    ) {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: value.error as Extract<
          ProjectBundleReply,
          { ok: false }
        >["error"],
      });
    } else if (value.ok === true && safeOutcome(value.result)) {
      resolve({ requestId: value.requestId, ok: true, result: value.result });
    } else {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: "IMPORT_FAILED",
      });
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge)
      throw new Error("The trusted project bundle bridge is unavailable.");
    this.bridge = bridge;
    bridge.on("project-bundle.reply", this.receive);
  }

  request(command: ProjectBundleCommand): Promise<ProjectBundleOutcome> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("IMPORT_FAILED"));
      }, 60_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (!reply?.ok) reject(new Error(reply?.error ?? "IMPORT_FAILED"));
        else resolve(reply.result);
      });
      this.bridge.send(
        "project-bundle.request",
        JSON.stringify({ requestId, command }),
      );
    });
  }

  close(): void {
    this.bridge.off?.("project-bundle.reply", this.receive);
    for (const [requestId, resolve] of this.pending)
      resolve({ requestId, ok: false, error: "IMPORT_FAILED" });
    this.pending.clear();
  }
}
