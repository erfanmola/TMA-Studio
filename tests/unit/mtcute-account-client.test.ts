import { afterAll, describe, expect, mock, test } from "bun:test";
import type { InputWebview } from "@mtcute/bun";
import type { Platform } from "../../apps/studio/src/contracts/entities";

type FakeOptions = { apiId: number; apiHash: string };
type FakeClient = {
  options: FakeOptions;
  starts: Array<{ session: string }>;
  sendCodeCalls: number;
  opened: Array<{ bot: string; platform: Platform; webview: InputWebview }>;
  start(options: { session: string }): Promise<void>;
  sendCode(options: { phone: string }): Promise<{ phoneCodeHash: string }>;
  signIn(options: {
    phone: string;
    phoneCodeHash: string;
    phoneCode: string;
  }): Promise<void>;
  checkPassword(password: string): Promise<void>;
  getMe(): Promise<{
    id: string;
    firstName: string;
    lastName?: string;
    username?: string;
    isPremium: boolean;
  }>;
  getUser(username: string): Promise<{ id: string }>;
  openWebview(options: {
    bot: string;
    platform: Platform;
    webview: InputWebview;
  }): Promise<{ url: string }>;
  exportSession(): string;
  destroy(): Promise<void>;
};

const clients: FakeClient[] = [];

mock.module("@mtcute/bun", () => ({
  TelegramClient: class implements FakeClient {
    starts: Array<{ session: string }> = [];
    sendCodeCalls = 0;
    opened: Array<{ bot: string; platform: Platform; webview: InputWebview }> =
      [];
    constructor(readonly options: FakeOptions) {
      clients.push(this);
    }
    async start(options: { session: string }) {
      this.starts.push(options);
    }
    async sendCode(_options: { phone: string }) {
      this.sendCodeCalls++;
      return { phoneCodeHash: "synthetic-code-hash" };
    }
    async signIn(_options: {
      phone: string;
      phoneCodeHash: string;
      phoneCode: string;
    }) {}
    async checkPassword(_password: string) {}
    async getMe() {
      return {
        id: "123456789",
        firstName: "Offline",
        isPremium: false,
      };
    }
    async getUser(username: string) {
      if (username !== "orbit_bot") throw new Error("Unexpected bot");
      return { id: "987654321" };
    }
    async openWebview(options: {
      bot: string;
      platform: Platform;
      webview: InputWebview;
    }) {
      this.opened.push(options);
      return { url: "https://example.test/mini-app?tgWebAppData=synthetic" };
    }
    exportSession() {
      return "synthetic-exported-session";
    }
    async destroy() {}
  },
}));

const savedApiId = process.env.TMA_TELEGRAM_API_ID;
const savedApiHash = process.env.TMA_TELEGRAM_API_HASH;
afterAll(() => {
  if (savedApiId === undefined) delete process.env.TMA_TELEGRAM_API_ID;
  else process.env.TMA_TELEGRAM_API_ID = savedApiId;
  if (savedApiHash === undefined) delete process.env.TMA_TELEGRAM_API_HASH;
  else process.env.TMA_TELEGRAM_API_HASH = savedApiHash;
});

const { MtcuteAccountClientFactory } = await import(
  "../../apps/studio/bunium/services/mtcute-account-client"
);

describe("mtcute account adapter session seam", () => {
  test("restores a supplied session once and uses only the offline client fixture", async () => {
    process.env.TMA_TELEGRAM_API_ID = "12345";
    process.env.TMA_TELEGRAM_API_HASH = "synthetic-api-hash";
    clients.length = 0;

    const factory = new MtcuteAccountClientFactory();
    expect(factory.configured).toBe(true);
    const client = factory.create("synthetic-existing-session");

    expect(await client.sendCode("+15555550123")).toMatchObject({
      phoneCodeHash: "synthetic-code-hash",
    });
    expect(await client.getMe()).toEqual({
      telegramId: "123456789",
      firstName: "Offline",
      isPremium: false,
    });
    expect(await client.exportSession()).toBe("synthetic-exported-session");
    expect(
      await client.openWebview?.({
        bot: "orbit_bot",
        platform: "macos",
        launch: {
          kind: "telegram",
          bot: "orbit_bot",
          appShortName: "shop",
          context: "direct",
          startParam: "order-42",
        },
      }),
    ).toEqual({
      url: "https://example.test/mini-app?tgWebAppData=synthetic",
      botId: "987654321",
    });

    expect(clients).toHaveLength(1);
    expect(clients[0]?.options).toEqual({
      apiId: 12345,
      apiHash: "synthetic-api-hash",
    });
    expect(clients[0]?.starts).toEqual([
      { session: "synthetic-existing-session" },
    ]);
    expect(clients[0]?.sendCodeCalls).toBe(1);
    expect(clients[0]?.opened).toEqual([
      {
        bot: "orbit_bot",
        platform: "macos",
        webview: {
          type: "from_link",
          shortName: "shop",
          startParam: "order-42",
        },
      },
    ]);
    await client.close();
  });

  test("refuses to construct the adapter without host API credentials", () => {
    delete process.env.TMA_TELEGRAM_API_ID;
    delete process.env.TMA_TELEGRAM_API_HASH;
    clients.length = 0;
    const factory = new MtcuteAccountClientFactory();
    expect(factory.configured).toBe(false);
    expect(() => factory.create()).toThrow("ACCOUNT_PROVIDER_UNAVAILABLE");
    expect(clients).toHaveLength(0);
  });

  test("maps saved launch contexts to mtcute's main, direct-link, and attachment requests", async () => {
    process.env.TMA_TELEGRAM_API_ID = "12345";
    process.env.TMA_TELEGRAM_API_HASH = "synthetic-api-hash";
    clients.length = 0;
    const client = new MtcuteAccountClientFactory().create("session");
    for (const launch of [
      { kind: "telegram", bot: "orbit_bot", context: "main" },
      {
        kind: "telegram",
        bot: "orbit_bot",
        appShortName: "shop",
        context: "direct",
        startParam: "order-42",
      },
      { kind: "telegram", bot: "orbit_bot", context: "attachment" },
    ] as const) {
      await client.openWebview?.({
        bot: "orbit_bot",
        platform: "macos",
        launch,
      });
    }
    expect(clients[0]?.opened.map(({ webview }) => webview)).toEqual([
      { type: "main" },
      { type: "from_link", shortName: "shop", startParam: "order-42" },
      { type: "from_attach_menu" },
    ]);
    await expect(
      client.openWebview?.({
        bot: "orbit_bot",
        platform: "macos",
        launch: { kind: "telegram", bot: "orbit_bot", context: "direct" },
      }),
    ).rejects.toThrow("APP_SHORT_NAME_REQUIRED");
    await expect(
      client.openWebview?.({
        bot: "orbit_bot",
        platform: "macos",
        launch: {
          kind: "telegram",
          bot: "orbit_bot",
          context: "attachment",
          startParam: "unsupported",
        },
      }),
    ).rejects.toThrow("ATTACHMENT_START_PARAM_UNSUPPORTED");
    await client.close();
  });
});
