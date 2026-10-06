import { describe, expect, test } from "bun:test";
import {
  type AccountClient,
  HostAccountService,
} from "../../apps/studio/bunium/services/account-service";
import {
  type CredentialApi,
  createSecretVault,
} from "../../apps/studio/bunium/services/vault";
import type {
  Identity,
  ProfileSnapshot,
} from "../../apps/studio/src/contracts/entities";

const profile: ProfileSnapshot = {
  telegramId: "12345678",
  firstName: "Fixture",
  isPremium: false,
};
class FixtureClient implements AccountClient {
  constructor(private readonly scenario: "2fa" | "ok" | "flood" = "2fa") {}
  async sendCode() {
    if (this.scenario === "flood") throw new Error("FLOOD_WAIT_30");
    return {
      phoneCodeHash: "secret-hash",
      expiresAt: "2030-01-01T00:00:00.000Z",
    };
  }
  async signIn(_phone: string, _hash: string, code: string) {
    if (code === "00000") throw new Error("PHONE_CODE_INVALID");
    if (code === "11111") throw new Error("SESSION_PASSWORD_NEEDED");
  }
  async checkPassword(password: string) {
    if (password !== "fixture-password")
      throw new Error("PASSWORD_HASH_INVALID");
  }
  async getMe() {
    return profile;
  }
  async exportSession() {
    return "fixture-session-secret";
  }
  async close() {}
}
class StaleClient extends FixtureClient {
  override async getMe(): Promise<ProfileSnapshot> {
    throw new Error("NETWORK_TIMEOUT");
  }
}
class MemoryCredentials implements CredentialApi {
  readonly data = new Map<string, string>();
  async get({ name }: { service: string; name: string }) {
    return this.data.get(name) ?? null;
  }
  async set({ name, value }: { service: string; name: string; value: string }) {
    this.data.set(name, value);
  }
  async delete({ name }: { service: string; name: string }) {
    return this.data.delete(name);
  }
}

describe("host account state machine", () => {
  test("phone, code, 2FA and success expose no credential material", async () => {
    const credentials = new MemoryCredentials();
    const vault = await createSecretVault({
      platform: "darwin",
      api: credentials,
    });
    const identities: Identity[] = [];
    const service = new HostAccountService(
      { create: () => new FixtureClient() },
      vault,
      {
        get: (id) => identities.find((entry) => entry.id === id) ?? null,
        list: () => identities,
        create: (entry) => identities.push(entry),
        update: (entry) => {
          const i = identities.findIndex((item) => item.id === entry.id);
          identities[i] = entry;
        },
      },
      () => Date.parse("2026-01-01T00:00:00Z"),
      () => `id-${identities.length}`,
    );
    const code = await service.beginPhoneLogin("+15555550123");
    expect(code).toMatchObject({ state: "code", maskedPhone: "+15••••23" });
    expect(JSON.stringify(code)).not.toContain("555550123");
    if (code.state !== "code") throw new Error("expected code stage");
    const twoFactor = await service.submitCode(code.challengeId, "11111");
    expect(twoFactor).toEqual({
      state: "password",
      challengeId: code.challengeId,
    });
    const done = await service.submitPassword(
      code.challengeId,
      "fixture-password",
    );
    expect(done).toMatchObject({ state: "complete", profile });
    expect(JSON.stringify(done)).not.toContain("fixture-session-secret");
    expect(identities).toHaveLength(1);
    expect(identities[0]?.kind).toBe("telegram");
    const accountRef =
      identities[0]?.kind === "telegram" ? identities[0].accountRef : "";
    expect(await vault.get(accountRef)).toBe("fixture-session-secret");
    vault.close();
  });

  test("invalid code, flood wait and cancellation are explicit and do not retry", async () => {
    let calls = 0;
    const factory = {
      create: () => {
        calls++;
        return new FixtureClient(calls === 1 ? "flood" : "ok");
      },
    };
    const vault = await createSecretVault({ platform: "unsupported" });
    const rows: Identity[] = [];
    const service = new HostAccountService(factory, vault, {
      get: () => null,
      list: () => rows,
      create: (row) => rows.push(row),
      update: () => {},
    });
    const flood = await service.beginPhoneLogin("+15555550123");
    expect(flood.state).toBe("flood-wait");
    expect(calls).toBe(1);
    const stage = await service.beginPhoneLogin("+15555550123");
    if (stage.state !== "code") throw new Error("expected code stage");
    expect(await service.submitCode(stage.challengeId, "00000")).toEqual({
      state: "code",
      challengeId: stage.challengeId,
      maskedPhone: "+15••••23",
      expiresAt: "2030-01-01T00:00:00.000Z",
      error: "INVALID_CODE",
    });
    expect(await service.cancel(stage.challengeId)).toEqual({
      state: "cancelled",
    });
    expect(await service.submitCode(stage.challengeId, "12345")).toEqual({
      state: "error",
      code: "EXPIRED",
    });
    vault.close();
  });

  test("refresh returns a read-only profile and records stale credentials", async () => {
    const credentials = new MemoryCredentials();
    const vault = await createSecretVault({
      platform: "darwin",
      api: credentials,
    });
    const accountRef = await vault.set("fixture-session");
    const identity: Identity = {
      id: "saved-account",
      kind: "telegram",
      accountRef,
      profile: { telegramId: "old", firstName: "Cached", isPremium: false },
      status: "ready",
      revision: 1,
    };
    const rows = [identity];
    const service = new HostAccountService(
      { create: () => new StaleClient("ok") },
      vault,
      {
        get: (id) => rows.find((entry) => entry.id === id) ?? null,
        list: () => rows,
        create: (entry) => rows.push(entry),
        update: (entry) => {
          rows[0] = entry;
        },
      },
    );
    expect(await service.refresh(identity.id)).toEqual({
      state: "error",
      code: "REAUTHORIZE",
    });
    expect(rows[0]).toMatchObject({
      status: "stale",
      profile: identity.profile,
      revision: 2,
    });
    vault.close();
  });
});
