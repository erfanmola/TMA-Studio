import { app, BuniumWindow, trustedOriginsApiVersion } from "bunium";
import { handleAccountRequest } from "../../../apps/studio/bunium/services/account-rpc";
import {
  type AccountClient,
  type AccountClientFactory,
  HostAccountService,
} from "../../../apps/studio/bunium/services/account-service";
import { createSecretVault } from "../../../apps/studio/bunium/services/vault";
import type { AccountReply } from "../../../apps/studio/src/contracts/account-rpc";
import type {
  Identity,
  ProfileSnapshot,
} from "../../../apps/studio/src/contracts/entities";

if (trustedOriginsApiVersion !== 1) {
  throw new Error("Account IPC fixture requires trusted-origin API v1.");
}

type Messages = {
  "account.request": unknown;
  "account.reply": AccountReply;
  "account.fixture-result": { passed: boolean; reason?: string };
};

const profile: ProfileSnapshot = {
  telegramId: "765432109",
  firstName: "Synthetic Account",
  isPremium: false,
};
class SyntheticClient implements AccountClient {
  constructor(private readonly failProfile: boolean) {}
  async sendCode() {
    return {
      phoneCodeHash: "fixture-phone-code-hash",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  }
  async signIn(_phone: string, _hash: string, code: string) {
    if (code !== "11111") throw new Error("PHONE_CODE_INVALID");
    throw new Error("SESSION_PASSWORD_NEEDED");
  }
  async checkPassword(password: string) {
    if (password !== "fixture-2fa") throw new Error("PASSWORD_HASH_INVALID");
  }
  async getMe(): Promise<ProfileSnapshot> {
    if (this.failProfile) throw new Error("NETWORK_TIMEOUT");
    return profile;
  }
  async exportSession() {
    return "fixture-session-secret";
  }
  async close() {}
}
let clientCount = 0;
const factory: AccountClientFactory = {
  configured: true,
  create: () => new SyntheticClient(clientCount++ > 0),
};
const vault = await createSecretVault({ platform: "unsupported" });
const identities: Identity[] = [];
let idCount = 0;
const accountService = new HostAccountService(
  factory,
  vault,
  {
    get: (id) => identities.find((identity) => identity.id === id) ?? null,
    list: () => identities,
    create: (identity) => identities.push(identity),
    update: (identity) => {
      const index = identities.findIndex((row) => row.id === identity.id);
      identities[index] = identity;
    },
  },
  Date.now,
  () => (idCount++ === 0 ? "synthetic-challenge" : "synthetic-account"),
);

const page = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch() {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>06a account IPC fixture</title>
       <main><h1>Native account IPC fixture</h1><output id="result">RUNNING</output></main>
       <script>
         const result = document.querySelector('#result');
         let sequence = 0;
         const pending = new Map();
         window.__bunium.on('account.reply', reply => {
           const resolve = pending.get(reply.requestId);
           if (!resolve) return;
           pending.delete(reply.requestId);
           resolve(reply);
         });
         function request(command) {
           const requestId = 'fixture-' + (++sequence);
           return new Promise((resolve, reject) => {
             const timer = setTimeout(() => reject(new Error('IPC timeout')), 5000);
             pending.set(requestId, reply => { clearTimeout(timer); resolve(reply); });
             window.__bunium.send('account.request', JSON.stringify({ requestId, command }));
           });
         }
         (async () => {
           try {
             const status = await request({method:'status'});
             if (!status.ok || !status.result.providerConfigured || status.result.vault.mode !== 'session-only')
               throw new Error('status RPC mismatch');
             const phone = await request({method:'begin-phone-login', phone:'+15555550123'});
             if (!phone.ok || phone.result.state !== 'code' || phone.result.maskedPhone !== '+15••••23')
               throw new Error('phone RPC mismatch');
             const code = await request({method:'submit-code', challengeId:'synthetic-challenge', code:'11111'});
             if (!code.ok || code.result.state !== 'password') throw new Error('code RPC mismatch');
             const auth = await request({method:'submit-password', challengeId:'synthetic-challenge', password:'fixture-2fa'});
             if (!auth.ok || auth.result.state !== 'complete') throw new Error('2FA RPC mismatch');
             const accounts = await request({method:'list-accounts'});
             if (!accounts.ok || accounts.result[0]?.id !== 'synthetic-account') throw new Error('list RPC mismatch');
             const refresh = await request({method:'refresh', identityId:'synthetic-account'});
             if (!refresh.ok || refresh.result.code !== 'REAUTHORIZE') throw new Error('reauthorize RPC mismatch');
             const staleAccounts = await request({method:'list-accounts'});
             if (!staleAccounts.ok || staleAccounts.result[0]?.status !== 'stale') throw new Error('stale list RPC mismatch');
             const safe = JSON.stringify([status, phone, code, auth, accounts, refresh, staleAccounts]);
             if (safe.includes('+15555550123') || safe.includes('11111') || safe.includes('fixture-2fa') || safe.includes('fixture-session-secret') || safe.includes('accountRef'))
               throw new Error('credential material crossed the reply boundary');
             result.value = 'PASS';
             window.__bunium.send('account.fixture-result', JSON.stringify({passed:true}));
           } catch (error) {
             result.value = 'FAIL';
             window.__bunium.send('account.fixture-result', JSON.stringify({passed:false, reason:String(error)}));
           }
         })();
       </script>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  },
});

const origin = `http://127.0.0.1:${page.port}`;
const host = new BuniumWindow<Messages>({
  url: `${origin}/`,
  trustedOrigins: [origin],
  width: 520,
  height: 320,
  title: "06a Native Account IPC Fixture",
});
let done = false;
function finish(passed: boolean, reason?: string) {
  if (done) return;
  done = true;
  console.log(`NATIVE_ACCOUNT_IPC_GATE:${passed ? "PASS" : "FAIL"}`);
  if (reason) console.error(reason);
  host.close();
  page.stop(true);
  vault.close();
  app.shutdown();
  process.exit(passed ? 0 : 1);
}

host.on("account.request", (payload) => {
  void handleAccountRequest(payload, accountService).then((reply) => {
    if (reply) host.emit("account.reply", reply);
  });
});
host.on("account.fixture-result", ({ passed, reason }) =>
  finish(passed, reason),
);
setTimeout(
  () => finish(false, "Fixture did not complete within 15 seconds."),
  15_000,
);
