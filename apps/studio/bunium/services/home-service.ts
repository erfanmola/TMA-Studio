import { parseHomeRequest, safeHomeReply } from "../../src/contracts/home-rpc";
import type { HomeService as HomePort } from "../../src/contracts/home-service";
import { HomeServiceError } from "../../src/contracts/home-service";
import { StoreNotFoundError, type StudioStore } from "./store";

/** Host-owned recent-project index; removing a row never deletes its project. */
export class HostHomeService implements HomePort {
  constructor(private readonly store: StudioStore) {}

  async listRecent() {
    try {
      return this.store.listRecentProjects();
    } catch {
      throw new HomeServiceError("INTERNAL");
    }
  }

  async removeRecent(projectId: string): Promise<void> {
    if (
      typeof projectId !== "string" ||
      projectId.length === 0 ||
      projectId.length > 128
    ) {
      throw new HomeServiceError("INVALID_INPUT");
    }
    try {
      this.store.removeRecentProject(projectId);
    } catch (error) {
      if (error instanceof StoreNotFoundError) return;
      throw new HomeServiceError("INTERNAL");
    }
  }
}

export async function handleHomeRequest(
  payload: unknown,
  service: HostHomeService,
) {
  const request = parseHomeRequest(payload);
  if (!request) return null;
  try {
    if (request.command.method === "list-recent")
      return safeHomeReply(request.requestId, await service.listRecent());
    await service.removeRecent(request.command.projectId);
    return safeHomeReply(request.requestId, null);
  } catch (error) {
    return {
      requestId: request.requestId,
      ok: false as const,
      error:
        error instanceof HomeServiceError ? error.code : ("INTERNAL" as const),
    };
  }
}
