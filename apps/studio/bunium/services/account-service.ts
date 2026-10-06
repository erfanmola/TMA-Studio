import { randomUUID } from "node:crypto";
import type {
  AccountIdentityView,
  AccountStatus,
  LoginState,
} from "../../src/contracts/account-service";
import type { Identity, ProfileSnapshot } from "../../src/contracts/entities";
import { StoreNotFoundError, type StudioStore } from "./store";
import { type SecretVault, toRendererVaultStatus } from "./vault";

export interface AccountClient {
  sendCode(
    phone: string,
  ): Promise<{ phoneCodeHash: string; expiresAt: string }>;
  signIn(phone: string, hash: string, code: string): Promise<void>;
  checkPassword(password: string): Promise<void>;
  getMe(): Promise<ProfileSnapshot>;
  exportSession(): Promise<string>;
  openWebview?(options: {
    bot: string;
    platform: import("../../src/contracts/entities").Platform;
    launch: Extract<
      import("../../src/contracts/entities").LaunchConfiguration,
      { kind: "telegram" }
    >;
  }): Promise<{ url: string; botId: string }>;
  close(): Promise<void>;
}
export interface AccountClientFactory {
  readonly configured?: boolean;
  create(session?: string): AccountClient;
}
export interface AccountIdentityStore {
  get(identityId: string): Identity | null;
  list(): Identity[];
  create(identity: Extract<Identity, { kind: "telegram" }>): void;
  update(identity: Extract<Identity, { kind: "telegram" }>): void;
}

export class StoreAccountIdentityStore implements AccountIdentityStore {
  constructor(private readonly store: StudioStore) {}
  get(identityId: string): Identity | null {
    try {
      return this.store.getIdentity(identityId);
    } catch (error) {
      if (error instanceof StoreNotFoundError) return null;
      throw error;
    }
  }
  list(): Identity[] {
    return this.store.listIdentities();
  }
  create(identity: Extract<Identity, { kind: "telegram" }>): void {
    this.store.createIdentity(identity);
  }
  update(identity: Extract<Identity, { kind: "telegram" }>): void {
    this.store.updateTelegramIdentity(identity.id, identity.revision - 1, {
      profile: identity.profile,
      refreshedAt: identity.refreshedAt,
      status: identity.status,
    });
  }
}

type Challenge = {
  id: string;
  phone: string;
  phoneCodeHash: string;
  expiresAt: string;
  client: AccountClient;
  retryAt?: number;
};
const masked = (phone: string) => `${phone.slice(0, 3)}••••${phone.slice(-2)}`;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message.toUpperCase() : "";

/** Host-only auth coordinator. Renderer receives opaque challenge IDs and safe profiles only. */
export class HostAccountService {
  private readonly challenges = new Map<string, Challenge>();
  constructor(
    private readonly factory: AccountClientFactory,
    private readonly vault: SecretVault,
    private readonly identities: AccountIdentityStore,
    private readonly now: () => number = Date.now,
    private readonly id: () => string = randomUUID,
  ) {}

  async status(): Promise<AccountStatus> {
    return {
      providerConfigured: this.factory.configured ?? true,
      vault: toRendererVaultStatus(this.vault.status),
    };
  }

  async listAccounts(): Promise<AccountIdentityView[]> {
    return this.identities
      .list()
      .filter(
        (identity): identity is Extract<Identity, { kind: "telegram" }> =>
          identity.kind === "telegram",
      )
      .map(({ id, profile, refreshedAt, status, revision }) => ({
        id,
        profile,
        refreshedAt,
        status,
        revision,
      }));
  }

  async close(): Promise<void> {
    const challenges = [...this.challenges.values()];
    this.challenges.clear();
    await Promise.allSettled(challenges.map(({ client }) => client.close()));
  }

  async beginPhoneLogin(phone: string): Promise<LoginState> {
    if (!/^\+[1-9]\d{7,14}$/u.test(phone))
      return { state: "error", code: "UNAVAILABLE" };
    let client: AccountClient | undefined;
    try {
      client = this.factory.create();
      const sent = await client.sendCode(phone);
      const challengeId = this.id();
      this.challenges.set(challengeId, {
        id: challengeId,
        phone,
        phoneCodeHash: sent.phoneCodeHash,
        expiresAt: sent.expiresAt,
        client,
      });
      return {
        state: "code",
        challengeId,
        maskedPhone: masked(phone),
        expiresAt: sent.expiresAt,
      };
    } catch (error) {
      const seconds = Number(/FLOOD_WAIT_(\d+)/u.exec(errorText(error))?.[1]);
      if (seconds > 0)
        return {
          state: "flood-wait",
          retryAt: new Date(this.now() + seconds * 1000).toISOString(),
          resume: "phone",
        };
      await client?.close();
      return { state: "error", code: "UNAVAILABLE" };
    }
  }

  async submitCode(challengeId: string, code: string): Promise<LoginState> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return { state: "error", code: "EXPIRED" };
    if (challenge.retryAt && this.now() < challenge.retryAt)
      return {
        state: "flood-wait",
        retryAt: new Date(challenge.retryAt).toISOString(),
        resume: "code",
        challengeId,
        maskedPhone: masked(challenge.phone),
      };
    if (!/^\d{4,8}$/u.test(code))
      return {
        state: "code",
        challengeId,
        maskedPhone: masked(challenge.phone),
        expiresAt: challenge.expiresAt,
        error: "INVALID_CODE",
      };
    try {
      await challenge.client.signIn(
        challenge.phone,
        challenge.phoneCodeHash,
        code,
      );
      return this.finish(challengeId, challenge);
    } catch (error) {
      const message = errorText(error);
      if (message.includes("SESSION_PASSWORD_NEEDED"))
        return { state: "password", challengeId };
      if (message.includes("PHONE_CODE_INVALID"))
        return {
          state: "code",
          challengeId,
          maskedPhone: masked(challenge.phone),
          expiresAt: challenge.expiresAt,
          error: "INVALID_CODE",
        };
      if (message.includes("PHONE_CODE_EXPIRED"))
        return this.expire(challengeId, challenge);
      const seconds = Number(/FLOOD_WAIT_(\d+)/u.exec(message)?.[1]);
      if (seconds > 0) {
        challenge.retryAt = this.now() + seconds * 1000;
        return {
          state: "flood-wait",
          retryAt: new Date(challenge.retryAt).toISOString(),
          resume: "code",
          challengeId,
          maskedPhone: masked(challenge.phone),
        };
      }
      return {
        state: "code",
        challengeId,
        maskedPhone: masked(challenge.phone),
        expiresAt: challenge.expiresAt,
        error: "UNAVAILABLE",
      };
    }
  }

  async submitPassword(
    challengeId: string,
    password: string,
  ): Promise<LoginState> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return { state: "error", code: "EXPIRED" };
    if (challenge.retryAt && this.now() < challenge.retryAt)
      return {
        state: "flood-wait",
        retryAt: new Date(challenge.retryAt).toISOString(),
        resume: "password",
        challengeId,
        maskedPhone: masked(challenge.phone),
      };
    try {
      await challenge.client.checkPassword(password);
      return this.finish(challengeId, challenge);
    } catch (error) {
      const seconds = Number(/FLOOD_WAIT_(\d+)/u.exec(errorText(error))?.[1]);
      if (seconds > 0) {
        challenge.retryAt = this.now() + seconds * 1000;
        return {
          state: "flood-wait",
          retryAt: new Date(challenge.retryAt).toISOString(),
          resume: "password",
          challengeId,
          maskedPhone: masked(challenge.phone),
        };
      }
      return {
        state: "password",
        challengeId,
        error: errorText(error).includes("PASSWORD_HASH_INVALID")
          ? "INVALID_PASSWORD"
          : "UNAVAILABLE",
      };
    }
  }

  async cancel(challengeId?: string): Promise<LoginState> {
    if (challengeId) {
      const challenge = this.challenges.get(challengeId);
      this.challenges.delete(challengeId);
      await challenge?.client.close();
    }
    return { state: "cancelled" };
  }

  async refresh(identityId: string): Promise<LoginState> {
    const identity = this.identities.get(identityId);
    if (identity?.kind !== "telegram")
      return { state: "error", code: "REAUTHORIZE" };
    const session = await this.vault.get(identity.accountRef);
    if (!session) {
      this.identities.update({
        ...identity,
        status: "reauthorize",
        revision: identity.revision + 1,
      });
      return { state: "error", code: "REAUTHORIZE" };
    }
    const client = this.factory.create(session);
    try {
      const profile = await client.getMe();
      const updated = {
        ...identity,
        profile,
        refreshedAt: new Date(this.now()).toISOString(),
        status: "ready" as const,
        revision: identity.revision + 1,
      };
      this.identities.update(updated);
      await client.close();
      return { state: "complete", identityId, profile };
    } catch (error) {
      await client.close();
      const updated = {
        ...identity,
        status:
          /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|AUTH_KEY_DUPLICATED/u.test(
            errorText(error),
          )
            ? ("reauthorize" as const)
            : ("stale" as const),
        revision: identity.revision + 1,
      };
      this.identities.update(updated);
      return { state: "error", code: "REAUTHORIZE" };
    }
  }

  private async expire(id: string, challenge: Challenge): Promise<LoginState> {
    this.challenges.delete(id);
    await challenge.client.close();
    return { state: "error", code: "EXPIRED" };
  }

  private async finish(id: string, challenge: Challenge): Promise<LoginState> {
    let accountRef: string | undefined;
    try {
      const profile = await challenge.client.getMe();
      const session = await challenge.client.exportSession();
      accountRef = await this.vault.set(session);
      const identityId = this.id();
      const identity: Extract<Identity, { kind: "telegram" }> = {
        id: identityId,
        kind: "telegram",
        accountRef,
        profile,
        refreshedAt: new Date(this.now()).toISOString(),
        status: "ready",
        revision: 1,
      };
      this.identities.create(identity);
      this.challenges.delete(id);
      await challenge.client.close().catch(() => {});
      return { state: "complete", identityId, profile };
    } catch {
      if (accountRef) await this.vault.delete(accountRef).catch(() => false);
      this.challenges.delete(id);
      await challenge.client.close().catch(() => {});
      return { state: "error", code: "UNAVAILABLE" };
    }
  }
}
