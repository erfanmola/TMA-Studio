import { TelegramClient } from "@mtcute/bun";
import type { ProfileSnapshot } from "../../src/contracts/entities";
import type { AccountClient, AccountClientFactory } from "./account-service";

/** mtcute adapter; API credentials are supplied only through the host environment. */
export class MtcuteAccountClientFactory implements AccountClientFactory {
  private readonly apiId = Number(process.env.TMA_TELEGRAM_API_ID);
  private readonly apiHash = process.env.TMA_TELEGRAM_API_HASH ?? "";
  get configured(): boolean {
    return (
      Number.isSafeInteger(this.apiId) &&
      this.apiId > 0 &&
      this.apiHash.length > 0
    );
  }
  create(session?: string): AccountClient {
    if (!this.configured) throw new Error("ACCOUNT_PROVIDER_UNAVAILABLE");
    const client = new TelegramClient({
      apiId: this.apiId,
      apiHash: this.apiHash,
    });
    let restored: Promise<unknown> | undefined;
    const restore = () => {
      if (!session) return Promise.resolve();
      restored ??= client.start({ session });
      return restored;
    };
    return {
      async sendCode(phone) {
        await restore();
        const sent = await client.sendCode({ phone });
        if (!("phoneCodeHash" in sent)) throw new Error("AUTH_UNAVAILABLE");
        return {
          phoneCodeHash: sent.phoneCodeHash,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        };
      },
      async signIn(phone, hash, code) {
        await restore();
        await client.signIn({ phone, phoneCodeHash: hash, phoneCode: code });
      },
      async checkPassword(password) {
        await restore();
        await client.checkPassword(password);
      },
      async getMe() {
        await restore();
        const user = await client.getMe();
        const profile: ProfileSnapshot = {
          telegramId: String(user.id),
          firstName: user.firstName || "",
          ...(user.lastName ? { lastName: user.lastName } : {}),
          ...(user.username ? { username: user.username } : {}),
          isPremium: Boolean(user.isPremium),
        };
        return profile;
      },
      async exportSession() {
        return client.exportSession();
      },
      async openWebview({ bot, platform, launch }) {
        await restore();
        const resolvedBot = await client.getUser(bot);
        const webview = (() => {
          switch (launch.context) {
            case "main":
              return {
                type: "main" as const,
                ...(launch.startParam ? { startParam: launch.startParam } : {}),
              };
            case "direct":
              if (!launch.appShortName)
                throw new Error("APP_SHORT_NAME_REQUIRED");
              return {
                type: "from_link" as const,
                shortName: launch.appShortName,
                ...(launch.startParam ? { startParam: launch.startParam } : {}),
              };
            case "attachment":
              if (launch.startParam)
                throw new Error("ATTACHMENT_START_PARAM_UNSUPPORTED");
              return { type: "from_attach_menu" as const };
          }
        })();
        const opened = await client.openWebview({
          bot,
          platform,
          webview,
        });
        return { url: opened.url, botId: String(resolvedBot.id) };
      },
      async close() {
        await client.destroy();
      },
    };
  }
}
