import type { HomeReply } from "../../contracts/home-rpc";
import type { HomeService, RecentProject } from "../../contracts/home-service";
import { HomeServiceError } from "../../contracts/home-service";
import { nextRequestId } from "../users/request-id";

type Bridge = NonNullable<Window["__bunium"]>;
type Pending = (reply: HomeReply | null) => void;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function safeRecent(value: unknown): value is RecentProject {
  if (!record(value) || typeof value.id !== "string") return false;
  if (typeof value.lastOpenedAt !== "string") return false;
  if (value.status === "missing") return true;
  return (
    value.status === "available" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    Number.isInteger(value.avatarColorIndex) &&
    Number(value.avatarColorIndex) >= 0 &&
    Number(value.avatarColorIndex) <= 6
  );
}

/** Renderer proxy for the host-persisted recent-project index. */
export class BuniumHomeBridgeService implements HomeService {
  private readonly pending = new Map<string, Pending>();
  private readonly bridge: Bridge;
  private readonly receive = (value: unknown) => {
    if (!record(value) || typeof value.requestId !== "string") return;
    const resolve = this.pending.get(value.requestId);
    if (!resolve) return;
    this.pending.delete(value.requestId);
    if (
      value.ok === false &&
      ["INVALID_INPUT", "INTERNAL"].includes(String(value.error))
    ) {
      resolve({
        requestId: value.requestId,
        ok: false,
        error: value.error as "INVALID_INPUT" | "INTERNAL",
      });
    } else if (
      value.ok === true &&
      (value.result === null ||
        (Array.isArray(value.result) && value.result.every(safeRecent)))
    ) {
      resolve({
        requestId: value.requestId,
        ok: true,
        result: value.result as RecentProject[] | null,
      });
    } else {
      resolve({ requestId: value.requestId, ok: false, error: "INTERNAL" });
    }
  };

  constructor(bridge: Bridge | undefined = window.__bunium) {
    if (!bridge) throw new Error("The trusted Home bridge is unavailable.");
    this.bridge = bridge;
    bridge.on("home.reply", this.receive);
  }

  async listRecent(): Promise<RecentProject[]> {
    const result = await this.request({ method: "list-recent" });
    if (!Array.isArray(result)) throw new HomeServiceError("INTERNAL");
    return result;
  }

  async removeRecent(projectId: string): Promise<void> {
    const result = await this.request({ method: "remove-recent", projectId });
    if (result !== null) throw new HomeServiceError("INTERNAL");
  }

  close(): void {
    this.bridge.off?.("home.reply", this.receive);
    for (const [requestId, resolve] of this.pending) {
      resolve({ requestId, ok: false, error: "INTERNAL" });
    }
    this.pending.clear();
  }

  private request(
    command:
      | { method: "list-recent" }
      | { method: "remove-recent"; projectId: string },
  ): Promise<RecentProject[] | null> {
    const requestId = nextRequestId();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new HomeServiceError("INTERNAL"));
      }, 15_000);
      this.pending.set(requestId, (reply) => {
        window.clearTimeout(timer);
        if (!reply) reject(new HomeServiceError("INTERNAL"));
        else if (!reply.ok) reject(new HomeServiceError(reply.error));
        else resolve(reply.result);
      });
      this.bridge.send("home.request", JSON.stringify({ requestId, command }));
    });
  }
}
