import { describe, expect, test } from "bun:test";
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import type {
  AccountClient,
  AccountClientFactory,
} from "../../apps/studio/bunium/services/account-service";
import {
  HostLaunchService,
  LaunchValidationError,
  resolveTelegramTarget,
  validateTelegramWebViewUrl,
  verifyMockLaunch,
  verifyTelegramLaunch,
} from "../../apps/studio/bunium/services/launch-service";
import type { StudioStore } from "../../apps/studio/bunium/services/store";
import type { SecretVault } from "../../apps/studio/bunium/services/vault";
import type {
  Identity,
  Project,
} from "../../apps/studio/src/contracts/entities";

const now = 1_790_000_000;
const realIdentity: Identity = {
  id: "tg-sara",
  kind: "telegram",
  accountRef: "vault:v1:private",
  profile: { telegramId: "1357902468", firstName: "Sara", isPremium: false },
  status: "ready",
  revision: 1,
};
const mockIdentity: Identity = {
  id: "mock-sara",
  kind: "mock",
  telegramId: "1357902468",
  firstName: "Sara",
  languageCode: "en",
  isPremium: false,
  revision: 1,
};

function fields(startParam = "order-42"): Map<string, string> {
  return new Map([
    ["auth_date", String(now)],
    ["query_id", "AAE-test"],
    ["start_param", startParam],
    ["user", JSON.stringify({ id: 1357902468, first_name: "Sara" })],
  ]);
}
function checkString(values: Map<string, string>, excluded: string[]): string {
  return [...values]
    .filter(([key]) => !excluded.includes(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
function signedTelegramData(values = fields()): {
  initData: string;
  publicKeyHex: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyHex = publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("hex");
  const check = `123456789:WebAppData\n${checkString(values, ["hash", "signature"])}`;
  const signature = sign(null, Buffer.from(check), privateKey).toString(
    "base64url",
  );
  return {
    initData: new URLSearchParams([
      ...values,
      ["signature", signature],
    ]).toString(),
    publicKeyHex,
  };
}
function signedMockData(botToken: string, values = fields()): string {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret)
    .update(checkString(values, ["hash"]))
    .digest("hex");
  return new URLSearchParams([...values, ["hash", hash]]).toString();
}

describe("launch verification modes", () => {
  test("accepts Telegram Ed25519 data only for the matching ready Telegram identity and launch context", () => {
    const data = signedTelegramData();
    const verified = verifyTelegramLaunch({
      initData: data.initData,
      botId: "123456789",
      identity: realIdentity,
      context: "direct",
      expectedContext: "direct",
      expectedStartParam: "order-42",
      nowSeconds: now,
      publicKeyHex: data.publicKeyHex,
    });
    expect(verified).toMatchObject({
      mode: "telegram",
      telegramId: "1357902468",
      botId: "123456789",
      context: "direct",
      startParam: "order-42",
      authDate: now,
    });
    expect(JSON.stringify(verified)).not.toContain("vault:v1");
  });

  test("rejects tampering, stale data, wrong context and an unrelated Telegram account", () => {
    const signed = signedTelegramData();
    const call = (
      overrides: Partial<Parameters<typeof verifyTelegramLaunch>[0]> = {},
    ) =>
      verifyTelegramLaunch({
        initData: signed.initData,
        botId: "123456789",
        identity: realIdentity,
        context: "direct",
        expectedContext: "direct",
        expectedStartParam: "order-42",
        nowSeconds: now,
        publicKeyHex: signed.publicKeyHex,
        ...overrides,
      });
    expect(() =>
      call({ initData: signed.initData.replace("order-42", "order-43") }),
    ).toThrow(LaunchValidationError);
    expect(() => call({ nowSeconds: now + 86_401 })).toThrow("EXPIRED");
    expect(() => call({ nowSeconds: now - 31 })).toThrow("EXPIRED");
    expect(() => call({ context: "main" })).toThrow("CONTEXT_MISMATCH");
    expect(() => call({ botId: "123456788" })).toThrow("INVALID_DATA");
    expect(() =>
      call({
        identity: {
          ...realIdentity,
          profile: { ...realIdentity.profile, telegramId: "999" },
        },
      }),
    ).toThrow("IDENTITY_MISMATCH");
  });

  test("keeps unsigned and bot-token-HMAC launch fixtures in the mock identity domain", () => {
    const token =
      "123456:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_123";
    const mockLaunch = {
      kind: "mock",
      signing: "bot-token",
      startParam: "order-42",
      advanced: {},
    } as const;
    const verified = verifyMockLaunch({
      launch: mockLaunch,
      identity: mockIdentity,
      initData: signedMockData(token),
      botToken: token,
      nowSeconds: now,
    });
    expect(verified).toMatchObject({
      mode: "mock",
      signing: "bot-token",
      telegramId: "1357902468",
    });
    expect(() =>
      verifyMockLaunch({
        launch: mockLaunch,
        identity: realIdentity,
        initData: signedMockData(token),
        botToken: token,
        nowSeconds: now,
      }),
    ).toThrow("IDENTITY_MISMATCH");
    const corrupt = new URLSearchParams(signedMockData(token));
    corrupt.set("hash", "0".repeat(64));
    expect(() =>
      verifyMockLaunch({
        launch: mockLaunch,
        identity: mockIdentity,
        initData: corrupt.toString(),
        botToken: token,
        nowSeconds: now,
      }),
    ).toThrow("INVALID_DATA");
    expect(
      verifyMockLaunch({
        launch: { kind: "mock", signing: "unsigned", advanced: {} },
        identity: mockIdentity,
      }),
    ).toMatchObject({ mode: "mock", signing: "unsigned" });
    expect(() =>
      verifyMockLaunch({
        launch: { kind: "mock", signing: "unsigned", advanced: {} },
        identity: realIdentity,
      }),
    ).toThrow("IDENTITY_MISMATCH");
  });

  test("resolves saved bot/app settings without treating a mock project as Telegram", () => {
    const project: Project = {
      id: "orbit",
      name: "Orbit",
      url: "https://example.test/mini-app",
      avatarColorIndex: 1,
      identityId: "tg-sara",
      defaultMode: "overlay",
      launch: {
        kind: "telegram",
        bot: "orbit_bot",
        appShortName: "shop",
        context: "direct",
        startParam: "item-1",
      },
      splash: {
        title: "Orbit",
        lightBackground: "#fff",
        darkBackground: "#000",
        presentation: "project",
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      revision: 1,
    };
    expect(resolveTelegramTarget(project)).toEqual({
      bot: "orbit_bot",
      appShortName: "shop",
      url: "https://example.test/mini-app",
      context: "direct",
      startParam: "item-1",
    });
    expect(() =>
      resolveTelegramTarget({
        ...project,
        launch: { kind: "mock", signing: "unsigned", advanced: {} },
      }),
    ).toThrow("INVALID_DATA");
    expect(() =>
      resolveTelegramTarget({
        ...project,
        launch: {
          kind: "telegram",
          bot: "orbit_bot",
          context: "attachment",
          startParam: "item-1",
        },
      }),
    ).toThrow("INVALID_DATA");
    expect(() =>
      resolveTelegramTarget({ ...project, url: "javascript:alert(1)" }),
    ).toThrow("INVALID_DATA");
  });

  test("keeps Telegram-signed initData on the configured app path and query", () => {
    const configured = "https://example.test/mini-app?tenant=orbit";
    const returned =
      "https://example.test/mini-app?tenant=orbit&tgWebAppData=signed";
    expect(validateTelegramWebViewUrl(configured, returned).pathname).toBe(
      "/mini-app",
    );
    expect(() =>
      validateTelegramWebViewUrl(
        configured,
        "https://example.test/other?tenant=orbit&tgWebAppData=signed",
      ),
    ).toThrow("INVALID_DATA");
    expect(() =>
      validateTelegramWebViewUrl(
        configured,
        "https://example.test/mini-app?tenant=other&tgWebAppData=signed",
      ),
    ).toThrow("INVALID_DATA");
  });

  test("prepares a signed Telegram WebView using only the selected host account session", async () => {
    const signed = signedTelegramData();
    const project: Project = {
      id: "orbit",
      name: "Orbit",
      url: "https://example.test/mini-app",
      avatarColorIndex: 1,
      identityId: realIdentity.id,
      defaultMode: "overlay",
      launch: {
        kind: "telegram",
        bot: "orbit_bot",
        appShortName: "shop",
        context: "direct",
        startParam: "order-42",
      },
      splash: {
        title: "Orbit",
        lightBackground: "#fff",
        darkBackground: "#000",
        presentation: "project",
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      revision: 1,
    };
    let closed = false;
    let observedSession = "";
    const store = {
      getProject: () => ({ project }),
      getIdentity: () => realIdentity,
    } as unknown as StudioStore;
    const vault = {
      get: async (reference: string) => {
        expect(reference).toBe(realIdentity.accountRef);
        return "host-session";
      },
    } as SecretVault;
    const account: AccountClient = {
      sendCode: async () => ({ phoneCodeHash: "unused", expiresAt: "unused" }),
      signIn: async () => {},
      checkPassword: async () => {},
      getMe: async () => realIdentity.profile,
      exportSession: async () => "unused",
      openWebview: async (request) => {
        expect(request).toMatchObject({
          bot: "orbit_bot",
          platform: "macos",
          launch: project.launch,
        });
        const result = new URL("https://example.test/mini-app");
        result.searchParams.set("tgWebAppData", signed.initData);
        result.searchParams.set("tgWebAppVersion", "9.0");
        return { url: result.toString(), botId: "123456789" };
      },
      close: async () => {
        closed = true;
      },
    };
    const accounts: AccountClientFactory = {
      create(session) {
        observedSession = session ?? "";
        return account;
      },
    };
    const service = new HostLaunchService(store, vault, accounts, () => now, {
      publicKeyHex: signed.publicKeyHex,
    });
    const prepared = await service.prepareTelegram(project.id, "macos");
    expect(prepared.mode).toBe("telegram");
    expect(prepared.verification).toMatchObject({
      mode: "telegram",
      telegramId: realIdentity.profile.telegramId,
      context: "direct",
      startParam: "order-42",
    });
    expect(observedSession).toBe("host-session");
    expect(closed).toBe(false);
    await prepared.close();
    expect(closed).toBe(true);
  });

  test("rejects account-session mismatch before asking Telegram to open the bot", async () => {
    const project: Project = {
      id: "orbit",
      name: "Orbit",
      url: "https://example.test/mini-app",
      avatarColorIndex: 1,
      identityId: realIdentity.id,
      defaultMode: "overlay",
      launch: { kind: "telegram", bot: "orbit_bot", context: "main" },
      splash: {
        title: "Orbit",
        lightBackground: "#fff",
        darkBackground: "#000",
        presentation: "project",
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      revision: 1,
    };
    const store = {
      getProject: () => ({ project }),
      getIdentity: () => realIdentity,
    } as unknown as StudioStore;
    const vault = { get: async () => "host-session" } as SecretVault;
    let opened = false;
    const account: AccountClient = {
      sendCode: async () => ({ phoneCodeHash: "unused", expiresAt: "unused" }),
      signIn: async () => {},
      checkPassword: async () => {},
      getMe: async () => ({ ...realIdentity.profile, telegramId: "999" }),
      exportSession: async () => "unused",
      openWebview: async () => {
        opened = true;
        return { url: "", botId: "" };
      },
      close: async () => {},
    };
    const service = new HostLaunchService(
      store,
      vault,
      { create: () => account },
      () => now,
    );
    await expect(service.prepareTelegram(project.id, "macos")).rejects.toThrow(
      "IDENTITY_MISMATCH",
    );
    expect(opened).toBe(false);
  });
});
