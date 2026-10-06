import type { ProjectService } from "../../src/contracts/project-service";
import { ProjectServiceError } from "../../src/contracts/project-service";
import {
  type ProjectWindowReply,
  parseProjectWindowRequest,
  safeProjectWindowReply,
} from "../../src/contracts/project-window-rpc";

export async function handleProjectWindowRequest(
  payload: unknown,
  service: ProjectService,
): Promise<ProjectWindowReply | null> {
  const request = parseProjectWindowRequest(payload);
  if (!request) return null;
  try {
    const { command } = request;
    switch (command.method) {
      case "create":
        return safeProjectWindowReply(
          request.requestId,
          await service.create(command.fields, command.token),
        );
      case "load":
        return safeProjectWindowReply(
          request.requestId,
          await service.load(command.projectId),
        );
      case "update":
        return safeProjectWindowReply(
          request.requestId,
          await service.update(
            command.projectId,
            command.expectedRevision,
            command.patch,
            command.token,
          ),
        );
      case "list-identities":
        return safeProjectWindowReply(
          request.requestId,
          await service.listIdentities(),
        );
      case "launch":
        await service.launch(command.projectId, command.platform);
        return safeProjectWindowReply(request.requestId, null);
      case "create-identity":
        return safeProjectWindowReply(
          request.requestId,
          await service.createIdentity(),
        );
    }
  } catch (error) {
    return {
      requestId: request.requestId,
      ok: false,
      error: error instanceof ProjectServiceError ? error.code : "INTERNAL",
    };
  }
}
