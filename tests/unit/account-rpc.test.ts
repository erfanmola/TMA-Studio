import { describe, expect, test } from "bun:test";
import { handleAccountRequest } from "../../apps/studio/bunium/services/account-rpc";
import {
  type AccountResult,
  parseAccountRequest,
  safeAccountReply,
} from "../../apps/studio/src/contracts/account-rpc";
import type { AccountService } from "../../apps/studio/src/contracts/account-service";

const fixture: AccountService = {
  async status() {
    return {
      providerConfigured: false,
      vault: {
        mode: "session-only",
        backend: "memory",
        fallbackReason: "native-api-unavailable",
      },
    };
  },
  async listAccounts() {
    return [];
  },
  async beginPhoneLogin() {
    return {
      state: "code",
      challengeId: "opaque-challenge",
      maskedPhone: "+15••••23",
      expiresAt: "2030-01-01T00:00:00Z",
    };
  },
  async submitCode() {
    return { state: "phone" };
  },
  async submitPassword() {
    return { state: "phone" };
  },
  async cancel() {
    return { state: "cancelled" };
  },
  async refresh() {
    return { state: "phone" };
  },
};

describe("trusted account IPC boundary", () => {
  test("accepts only bounded, exact commands", () => {
    expect(
      parseAccountRequest({
        requestId: "req-1",
        command: {
          method: "submit-code",
          challengeId: "opaque-id",
          code: "12345",
        },
      }),
    ).not.toBeNull();
    expect(
      parseAccountRequest({
        requestId: "req-1",
        command: {
          method: "submit-code",
          challengeId: "opaque-id",
          code: "12345",
          session: "leak",
        },
      }),
    ).toBeNull();
    expect(
      parseAccountRequest({
        requestId: "bad id",
        command: { method: "status" },
      }),
    ).toBeNull();
    expect(
      parseAccountRequest({
        requestId: "req-1",
        command: {
          method: "submit-password",
          challengeId: "opaque-id",
          password: "x".repeat(257),
        },
      }),
    ).toBeNull();
  });

  test("returns masked login state without reflecting phone or submitted code", async () => {
    const reply = await handleAccountRequest(
      {
        requestId: "req-2",
        command: { method: "begin-phone-login", phone: "+15555550123" },
      },
      fixture,
    );
    expect(reply).toMatchObject({
      requestId: "req-2",
      ok: true,
      result: { state: "code", maskedPhone: "+15••••23" },
    });
    expect(JSON.stringify(reply)).not.toContain("555550123");
    expect(JSON.stringify(reply)).not.toContain("phoneCodeHash");
  });

  test("refuses credential-bearing host results", () => {
    const unsafe = {
      state: "complete",
      identityId: "x",
      profile: {},
      accountRef: "vault:v1:abc",
    } as unknown as AccountResult;
    expect(safeAccountReply("req-3", unsafe)).toEqual({
      requestId: "req-3",
      ok: false,
      error: "UNAVAILABLE",
    });
  });
});
