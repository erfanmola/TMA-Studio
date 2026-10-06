import {
  type AccountReply,
  parseAccountRequest,
  safeAccountReply,
} from "../../src/contracts/account-rpc";
import type { AccountService } from "../../src/contracts/account-service";

export async function handleAccountRequest(
  payload: unknown,
  service: AccountService,
): Promise<AccountReply | null> {
  const request = parseAccountRequest(payload);
  if (!request) return null;
  const { requestId, command } = request;
  try {
    switch (command.method) {
      case "status":
        return safeAccountReply(requestId, await service.status());
      case "list-accounts":
        return safeAccountReply(requestId, await service.listAccounts());
      case "begin-phone-login":
        return safeAccountReply(
          requestId,
          await service.beginPhoneLogin(command.phone),
        );
      case "submit-code":
        return safeAccountReply(
          requestId,
          await service.submitCode(command.challengeId, command.code),
        );
      case "submit-password":
        return safeAccountReply(
          requestId,
          await service.submitPassword(command.challengeId, command.password),
        );
      case "cancel":
        return safeAccountReply(
          requestId,
          await service.cancel(command.challengeId),
        );
      case "refresh":
        return safeAccountReply(
          requestId,
          await service.refresh(command.identityId),
        );
    }
  } catch {
    return { requestId, ok: false, error: "UNAVAILABLE" };
  }
}
