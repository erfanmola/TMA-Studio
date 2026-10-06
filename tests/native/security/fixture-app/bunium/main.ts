import { app, BuniumWindow } from "bunium";

type Messages = {
  "security-result": {
    topBridge: boolean;
    childBridge: boolean;
    attackerBridge: boolean;
  };
  "security-forged": { browserId?: number; vector: string };
};

const attacker = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/redirect") {
      return new Response(null, {
        status: 302,
        headers: { Location: `http://127.0.0.1:${attacker.port}/attacker` },
      });
    }
    return new Response(
      `<!doctype html><script>
        parent.postMessage({type:'attacker-loaded', bridge:typeof window.__bunium,
          reservedChannelAttempted:true}, '*');
        window.__bunium?.send('security-forged', JSON.stringify({vector:'attacker-origin',browserId:1}));
        window.__bunium?.send('__bunium_webview_create', JSON.stringify({
          id:'forged',src:'https://attacker.invalid',x:0,y:0,width:900,height:900
        }));
        parent.postMessage({type:'bunium-send',name:'__bunium_webview_create',browserId:999}, '*');
      </script>`,
      { headers: { "Content-Type": "text/html" } },
    );
  },
});

const trusted = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const evilUrl = `http://localhost:${attacker.port}/attacker`;
    const sameOriginChild = `http://127.0.0.1:${trusted.port}/child`;
    if (url.pathname === "/child") {
      return new Response(
        `<script>
          parent.postMessage({type:'child-bridge',bridge:typeof window.__bunium}, '*');
          try { parent.__bunium.send('security-forged', JSON.stringify({vector:'iframe-parent-call',browserId:999})); } catch {}
        </script>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }
    return new Response(
      `<!doctype html><title>Native security gate</title>
       <iframe src="${sameOriginChild}"></iframe>
       <iframe src="${evilUrl}"></iframe>
       <iframe src="bunium://spoof/attacker"></iframe>
       <script>
         const child = new Promise(resolve => {
           const timer = setTimeout(() => resolve(true), 1200);
           addEventListener('message', event => {
             if (event.data?.type === 'child-bridge') { clearTimeout(timer); resolve(false); }
           });
         });
         const attacker = new Promise(resolve => {
           const timer = setTimeout(() => resolve(false), 1200);
           addEventListener('message', event => {
             if (event.data?.type === 'attacker-loaded') {
               clearTimeout(timer);
               resolve(
                 event.data.bridge === 'undefined' &&
                 event.data.reservedChannelAttempted === true
               );
             }
           });
         });
         Promise.all([child, attacker]).then(([childFrameBlocked, attackerBridge]) =>
           window.__bunium.send('security-result', JSON.stringify({
             topBridge: typeof window.__bunium === 'object',
             childBridge: childFrameBlocked,
             attackerBridge
           }))
         );
       </script>`,
      { headers: { "Content-Type": "text/html" } },
    );
  },
});

const baseUrl = `http://127.0.0.1:${trusted.port}/`;
const trustedOrigins = [new URL(baseUrl).origin];
const views: BuniumWindow<Messages>[] = [];
let trustedResult = false;
let forgedMessage = false;

const host = new BuniumWindow<Messages>({
  url: baseUrl,
  trustedOrigins,
  width: 640,
  height: 480,
  title: "Bunium native security fixture",
});
views.push(host);
host.on("security-result", (result) => {
  trustedResult =
    result.topBridge && result.childBridge && result.attackerBridge;
  console.log(`TRUSTED_TOP_AND_IFRAME:${trustedResult ? "PASS" : "FAIL"}`);
});
host.on("security-forged", () => {
  forgedMessage = true;
});

for (const [label, url] of [
  ["redirect", `http://127.0.0.1:${attacker.port}/redirect`],
  ["app-scheme-spoof", "bunium://spoof/attacker"],
] as const) {
  const view = new BuniumWindow<Messages>({
    url,
    trustedOrigins: label === "redirect" ? trustedOrigins : ["bunium://app"],
    width: 320,
    height: 240,
    title: `Bunium ${label} fixture`,
  });
  view.on("security-forged", () => {
    forgedMessage = true;
  });
  views.push(view);
}

setTimeout(() => {
  const passed = trustedResult && !forgedMessage;
  console.log(`NATIVE_SECURITY_GATE:${passed ? "PASS" : "FAIL"}`);
  for (const view of views) view.close();
  trusted.stop(true);
  attacker.stop(true);
  app.shutdown();
  process.exit(passed ? 0 : 1);
}, 3000);
