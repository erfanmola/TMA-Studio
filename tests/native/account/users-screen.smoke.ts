import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { app, BuniumWindow, trustedOriginsApiVersion } from "bunium";
import { handleAccountRequest } from "../../../apps/studio/bunium/services/account-rpc";
import {
  type AccountClient,
  type AccountClientFactory,
  HostAccountService,
} from "../../../apps/studio/bunium/services/account-service";
import { StudioStore } from "../../../apps/studio/bunium/services/store";
import { handleUsersRequest } from "../../../apps/studio/bunium/services/users-rpc";
import { HostUsersService } from "../../../apps/studio/bunium/services/users-service";
import { createSecretVault } from "../../../apps/studio/bunium/services/vault";
import type { AccountReply } from "../../../apps/studio/src/contracts/account-rpc";
import type {
  Identity,
  ProfileSnapshot,
} from "../../../apps/studio/src/contracts/entities";
import type { UsersReply } from "../../../apps/studio/src/contracts/users-rpc";
import { parseUsersRequest } from "../../../apps/studio/src/contracts/users-rpc";

if (trustedOriginsApiVersion !== 1) {
  throw new Error("Users CEF fixture requires trusted-origin API v1.");
}

type Messages = {
  "account.request": unknown;
  "account.reply": AccountReply;
  "users.request": unknown;
  "users.reply": UsersReply;
};

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = Buffer.from(name);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  nameBytes.copy(chunk, 4);
  Buffer.from(data).copy(chunk, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  let crc = 0xffffffff;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return chunk;
}

function encodePng(width: number, height: number, bgra: Uint8Array): Buffer {
  const stride = width * 4;
  const rgba = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    rgba[row] = 0;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = row + 1 + x * 4;
      rgba[target] = bgra[source + 2] ?? 0;
      rgba[target + 1] = bgra[source + 1] ?? 0;
      rgba[target + 2] = bgra[source] ?? 0;
      rgba[target + 3] = bgra[source + 3] ?? 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rgba)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const origin = "http://localhost:5173";
const response = await fetch(`${origin}/?scene=users&locale=en&theme=light`);
if (!response.ok) throw new Error(`Vite returned HTTP ${response.status}.`);

const profile: ProfileSnapshot = {
  telegramId: "765432109",
  firstName: "Fixture Account",
  username: "fixture_account",
  languageCode: "en",
  isPremium: false,
};
const identity: Identity = {
  id: "native-fixture-account",
  kind: "telegram",
  accountRef: "vault:v1:00000000-0000-4000-8000-000000000001",
  profile,
  refreshedAt: "2026-01-15T09:30:00.000Z",
  status: "ready",
  revision: 1,
};
class SyntheticClient implements AccountClient {
  async sendCode() {
    return {
      phoneCodeHash: "synthetic-hash",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
  async signIn() {}
  async checkPassword() {}
  async getMe() {
    return profile;
  }
  async exportSession() {
    return "synthetic-session";
  }
  async close() {}
}
const vault = await createSecretVault({ platform: "unsupported" });
const store = new StudioStore(":memory:");
store.createIdentity(identity);
const factory: AccountClientFactory = {
  configured: true,
  create: () => new SyntheticClient(),
};
const service = new HostAccountService(factory, vault, {
  get: (id) => store.getIdentity(id),
  list: () => store.listIdentities(),
  create: (account) => store.createIdentity(account),
  update: (account) =>
    store.updateTelegramIdentity(account.id, account.revision - 1, {
      profile: account.profile,
      status: account.status,
      refreshedAt: account.refreshedAt,
    }),
});
const usersService = new HostUsersService(store);
let listRequests = 0;
let usersRequests = 0;
let listRequestId: string | undefined;
let listReplyVerified = false;
const window = new BuniumWindow<Messages>({
  url: `${origin}/?scene=users&locale=en&theme=light`,
  trustedOrigins: [origin],
  width: 1000,
  height: 700,
  title: "TMA Studio 06a Users CEF Review",
});
window.on("account.request", (payload) => {
  void handleAccountRequest(payload, service).then((reply) => {
    if (reply) {
      window.emit("account.reply", reply);
    }
  });
});
window.on("users.request", (payload) => {
  usersRequests++;
  const request = parseUsersRequest(payload);
  if (request?.command.method === "list-identities") {
    listRequests++;
    listRequestId = request.requestId;
  }
  void handleUsersRequest(payload, usersService).then((reply) => {
    if (reply) {
      if (
        reply.requestId === listRequestId &&
        reply.ok &&
        Array.isArray(reply.result) &&
        reply.result.some(
          (identity) =>
            identity.id === "native-fixture-account" &&
            !("accountRef" in identity),
        ) &&
        !JSON.stringify(reply).includes("accountRef")
      )
        listReplyVerified = true;
      window.emit("users.reply", reply);
    }
  });
});

async function finish(passed: boolean, reason?: string) {
  if (passed) {
    const shot = window.captureScreenshot();
    if (shot.width === 0 || shot.height === 0)
      return finish(false, "CEF produced no screenshot frame.");
    const output =
      process.env.TMA_STUDIO_NATIVE_SCREENSHOT ?? "/tmp/06a-users-cef.png";
    writeFileSync(output, encodePng(shot.width, shot.height, shot.data));
    console.log(
      `NATIVE_USERS_SCREEN_GATE:PASS ${output} ${shot.width}x${shot.height}`,
    );
  } else {
    console.error(`NATIVE_USERS_SCREEN_GATE:FAIL ${reason ?? "unknown"}`);
  }
  window.close();
  vault.close();
  store.close();
  app.shutdown();
  process.exit(passed ? 0 : 1);
}

const deadline = Date.now() + 15_000;
while (Date.now() < deadline) {
  if (listReplyVerified) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await finish(true);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
await finish(
  false,
  `Users scene did not complete its native account-list RPC (requests=${usersRequests}, lists=${listRequests}, listReplyVerified=${listReplyVerified}, frames=${window.frameCount}).`,
);
