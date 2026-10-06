import type { Identity } from "../../src/contracts/entities";
import {
  parseUsersRequest,
  type SafeIdentity,
  safeUsersReply,
  type UsersReply,
} from "../../src/contracts/users-rpc";
import { UsersServiceError } from "../../src/contracts/users-service";
import type { HostUsersService } from "./users-service";

function safeIdentity(identity: Identity | null): SafeIdentity | null {
  if (!identity) return null;
  if (identity.kind === "mock") return identity;
  const { accountRef: _accountRef, ...safe } = identity;
  return safe;
}

export async function handleUsersRequest(
  payload: unknown,
  service: HostUsersService,
): Promise<UsersReply | null> {
  const request = parseUsersRequest(payload);
  if (!request) return null;
  const { requestId, command } = request;
  try {
    switch (command.method) {
      case "list-identities": {
        const identities = await service.listIdentities();
        return safeUsersReply(
          requestId,
          identities.map((identity) => safeIdentity(identity) as SafeIdentity),
        );
      }
      case "get-identity":
        return safeUsersReply(
          requestId,
          safeIdentity(await service.getIdentity(command.identityId)),
        );
      case "list-project-references":
        return safeUsersReply(
          requestId,
          await service.listProjectReferences(command.identityId),
        );
      case "save-mock":
        return safeUsersReply(
          requestId,
          await service.saveMock(
            command.fields,
            command.identityId,
            command.expectedRevision,
          ),
        );
      case "delete-mock":
        await service.deleteMock(
          command.identityId,
          command.expectedRevision,
          command.reassignToId,
        );
        return safeUsersReply(requestId, null);
    }
  } catch (error) {
    return {
      requestId,
      ok: false,
      error: error instanceof UsersServiceError ? error.code : "INTERNAL",
    };
  }
}
