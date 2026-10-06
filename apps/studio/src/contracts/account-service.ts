import type { Identity, ProfileSnapshot } from "./entities";

export type AccountIdentityView = Pick<
  Extract<Identity, { kind: "telegram" }>,
  "id" | "profile" | "refreshedAt" | "status" | "revision"
>;

export interface AccountVaultStatus {
  mode: "system" | "session-only";
  backend:
    | "macos-keychain"
    | "windows-credential-manager"
    | "linux-secret-service"
    | "memory";
  fallbackReason?:
    | "native-api-unavailable"
    | "system-store-unavailable"
    | "unsupported-platform";
}

export interface AccountStatus {
  providerConfigured: boolean;
  vault: AccountVaultStatus;
}

export type LoginState =
  | { state: "phone" }
  | {
      state: "code";
      challengeId: string;
      maskedPhone: string;
      expiresAt: string;
      error?: "INVALID_CODE" | "UNAVAILABLE";
    }
  | {
      state: "password";
      challengeId: string;
      hint?: string;
      error?: "INVALID_PASSWORD" | "UNAVAILABLE";
    }
  | {
      state: "flood-wait";
      retryAt: string;
      resume: "phone" | "code" | "password";
      challengeId?: string;
      maskedPhone?: string;
    }
  | { state: "complete"; identityId: string; profile: ProfileSnapshot }
  | { state: "cancelled" }
  | {
      state: "error";
      code: "INVALID_CODE" | "EXPIRED" | "UNAVAILABLE" | "REAUTHORIZE";
    };

/** Renderer-facing, one-shot login commands. Session and provider tokens are never returned. */
export interface AccountService {
  status(): Promise<AccountStatus>;
  listAccounts(): Promise<AccountIdentityView[]>;
  beginPhoneLogin(phone: string): Promise<LoginState>;
  submitCode(challengeId: string, code: string): Promise<LoginState>;
  submitPassword(challengeId: string, password: string): Promise<LoginState>;
  cancel(challengeId?: string): Promise<LoginState>;
  refresh(identityId: string): Promise<LoginState>;
}
