type GuestMessage = { generation: number; data: string };
type Guest = {
  readonly renderedSize: { width: number; height: number };
  onMessage(listener: (message: GuestMessage) => void): () => void;
  setBounds(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void;
  setClip(
    clip: {
      x: number;
      y: number;
      width: number;
      height: number;
      cornerRadius: number;
    } | null,
  ): void;
  dispose(): void;
};
type Host = {
  readonly windowHandle: unknown;
  createGuest(options: Record<string, unknown>): Guest;
  createOverlay(options: Record<string, unknown>): Overlay;
  on(name: string, listener: (payload: unknown) => void): void;
  close(): void;
};
type Overlay = {
  on(name: string, listener: (payload: unknown) => void): void;
  dispose(): void;
};
type Runtime = {
  app: { shutdown(): void };
  BuniumWindow: new (options: Record<string, unknown>) => Host;
};
type NativeCall = (...args: unknown[]) => unknown;

const runtime = (await import(
  process.env.BUNIUM_MODULE ?? "bunium"
)) as unknown as Runtime;
const repo = process.env.BUNIUM_REPO;
if (!repo) throw new Error("Set BUNIUM_REPO to a Bunium checkout");
const native = (await import(`${repo}/src/native.ts`)) as {
  lib: { symbols: Record<string, NativeCall> };
};

const evidence: Record<string, unknown> = {};
let hostReady = false;
let decoy: Host | undefined;
let menuOverlay: Overlay | undefined;
let a: Guest | undefined;
let b: Guest | undefined;
let nativeMenuReady = false;
const nativeMenuClicks: Array<{ x: number; y: number }> = [];
const hostBodyClicks: Array<{ x: number; y: number }> = [];
const guestClicks = {
  a: [] as Array<{ x: number; y: number }>,
  b: [] as Array<{ x: number; y: number }>,
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/host") {
      return new Response(
        `<!doctype html><meta charset="utf-8"><style>
          html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}
          #host-frame{position:absolute;left:72px;top:52px;width:320px;height:320px;
            box-sizing:border-box;border:8px solid #e040fb;border-radius:24px;z-index:999}
        </style><div id="host-frame"></div><script>
          document.addEventListener('click',event=>{
            window.__bunium.send('host-body-click',JSON.stringify({x:event.clientX,y:event.clientY}));
          });
          window.__bunium.send('host-ready',JSON.stringify({ready:true}));
        </script>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    if (url.pathname === "/menu") {
      return new Response(
        `<!doctype html><meta charset="utf-8"><style>
          html,body{width:100%;height:100%;margin:0;overflow:hidden}
          body{box-sizing:border-box;padding:22px;background:#dce7f5;color:#152033;
            border:2px solid #415b7a;border-radius:12px;font:16px sans-serif}
          button{border:0;padding:0;background:transparent;color:inherit;font:inherit}
        </style><button type="button">Host menu / frame overlay</button><script>
          requestAnimationFrame(()=>requestAnimationFrame(()=>window.__bunium.send('menu-ready',JSON.stringify({ready:true}))));
          document.addEventListener('click',event=>window.__bunium.send('menu-click',
            JSON.stringify({x:event.clientX,y:event.clientY})));
        </script>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    const label = url.pathname.slice(7);
    if (label === "a" || label === "b") {
      const color = label === "a" ? "#1976d2" : "#ffca28";
      return new Response(
        `<!doctype html><meta charset="utf-8"><style>
          html,body{width:100%;height:100%;margin:0;background:${color}}
          ${label === "a" ? "body{background-color:#f7f7f7;background-image:linear-gradient(45deg,#16457a 25%,transparent 25%),linear-gradient(-45deg,#16457a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#16457a 75%),linear-gradient(-45deg,transparent 75%,#16457a 75%);background-size:32px 32px;background-position:0 0,0 16px,16px -16px,-16px 0}" : ""}
          body{font:20px sans-serif;color:#111;padding:20px;box-sizing:border-box}
        </style>Guest ${label.toUpperCase()}`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return new Response("not found", { status: 404 });
  },
});

// The primary host CEF surface is intentionally still a single flattened
// paint surface. Render this host-authored menu in a trusted transparent
// CEF view so native composition can place it above the guest layers.

const origin = `http://127.0.0.1:${server.port}`;
const host = new runtime.BuniumWindow({
  url: `${origin}/host`,
  width: 640,
  height: 480,
  title: "01e trusted overlay composition fixture",
  transparent: true,
  trustedOrigins: [origin],
});
let untrustedOverlayRejected = false;
try {
  host.createOverlay({
    url: "https://untrusted.invalid/menu",
    x: 0,
    y: 0,
    width: 8,
    height: 8,
  });
} catch (error) {
  untrustedOverlayRejected = error instanceof TypeError;
}
if (!untrustedOverlayRejected) {
  await failEarly("overlay accepted a URL outside the host trustedOrigins set");
}
host.on("host-ready", () => {
  hostReady = true;
});
host.on("host-body-click", (payload) => {
  const value = payload as { x: number; y: number };
  hostBodyClicks.push({ x: value.x, y: value.y });
});
menuOverlay = host.createOverlay({
  url: `${origin}/menu`,
  x: 150,
  y: 90,
  width: 280,
  height: 100,
});
let untrustedNavigationRejected = false;
try {
  menuOverlay.navigate("https://untrusted.invalid/menu");
} catch (error) {
  untrustedNavigationRejected = error instanceof TypeError;
}
if (!untrustedNavigationRejected) {
  await failEarly("overlay navigation left the host trustedOrigins set");
}
menuOverlay.on("menu-ready", () => {
  nativeMenuReady = true;
});
menuOverlay.on("menu-click", (payload) => {
  const value = payload as { x: number; y: number };
  nativeMenuClicks.push({ x: value.x, y: value.y });
});

const bridgeScript = `
  document.addEventListener('click',event=>{
    post(JSON.stringify({type:'click',x:event.clientX,y:event.clientY}));
  },true);
  return function () {};
`;
a = host.createGuest({
  x: 80,
  y: 60,
  width: 300,
  height: 300,
  url: `${origin}/guest/a`,
  bridgeScript,
});
b = host.createGuest({
  x: 210,
  y: 160,
  width: 220,
  height: 180,
  url: `${origin}/guest/b`,
  bridgeScript,
});
a.setClip({ x: 80, y: 60, width: 300, height: 300, cornerRadius: 64 });
for (const [label, guest] of [
  ["a", a],
  ["b", b],
] as const) {
  guest.onMessage(({ data }) => {
    try {
      const message = JSON.parse(data) as {
        type?: string;
        x?: number;
        y?: number;
      };
      const { x, y } = message;
      if (
        message.type === "click" &&
        typeof x === "number" &&
        Number.isFinite(x) &&
        typeof y === "number" &&
        Number.isFinite(y)
      ) {
        guestClicks[label].push({ x, y });
      }
    } catch {
      // Ignore non-click guest messages.
    }
  });
}

const sleep = (ms: number) => Bun.sleep(ms);
async function until(
  label: string,
  predicate: () => boolean,
  timeoutMs = 8_000,
) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function click(x: number, y: number) {
  const dispatch = native.lib.symbols.bunium_dispatch_mouse_click;
  (dispatch as NativeCall)(host.windowHandle, x, y, 0, 0, 1);
  (dispatch as NativeCall)(host.windowHandle, x, y, 0, 1, 1);
}

// Early setup failures (e.g. the overlay platform guard below) happen before
// the main try block, so they need their own reporting + hold path instead
// of dying uncaught with no gate line.
async function failEarly(message: string): Promise<never> {
  console.error(`NATIVE_COMPOSITION_GATE:FAIL ${message}`);
  console.error(`COMPOSITION_EVIDENCE:${JSON.stringify(evidence)}`);
  if (process.env.HOLD_OPEN === "1") {
    const holdMs = Number(process.env.HOLD_OPEN_MS ?? 30_000);
    console.log("COMPOSITION_HOLD_ON_FAILURE");
    // Bun.sleep directly: the `sleep` helper below is still in TDZ when
    // early setup fails.
    await Bun.sleep(Number.isFinite(holdMs) ? Math.max(1_000, holdMs) : 30_000);
  }
  host.close();
  server.stop(true);
  runtime.app.shutdown();
  process.exit(1);
}

try {
  await until("host page ready", () => hostReady);
  await until(
    "guest first paints",
    () => a.renderedSize.width > 0 && b.renderedSize.width > 0,
  );
  await until("native host menu first paints", () => nativeMenuReady);

  // This menu is a host-authored, independent CEF view backed by a native
  // sublayer. It occupies the same pixels as guest A and must win both paint
  // ordering and pointer routing while the surrounding guest stays visible.
  const guestAClicksBeforeMenu = guestClicks.a.length;
  const hostClicksBeforeMenu = hostBodyClicks.length;
  click(180, 120);
  await until(
    "native host menu receives click",
    () => nativeMenuClicks.length === 1,
  );
  if (
    guestClicks.a.length !== guestAClicksBeforeMenu ||
    hostBodyClicks.length !== hostClicksBeforeMenu ||
    nativeMenuClicks[0]?.x !== 30 ||
    nativeMenuClicks[0]?.y !== 30
  ) {
    throw new Error(
      `native host menu input mismatch: ${JSON.stringify({
        menu: nativeMenuClicks,
        guestA: guestClicks.a,
        host: hostBodyClicks,
      })}`,
    );
  }
  evidence.hostMenu = {
    target: "trusted transparent CEF overlay",
    targetLocal: nativeMenuClicks[0],
    guestFallthrough: false,
  };
  evidence.trust = {
    foreignInitialURLRejected: untrustedOverlayRejected,
    foreignNavigationRejected: untrustedNavigationRejected,
  };

  // Topmost guest wins the overlap; reported coordinates must be guest-local.
  click(330, 270);
  await until("top guest hit", () => guestClicks.b.length === 1);
  if (
    guestClicks.a.length !== 0 ||
    guestClicks.b[0]?.x !== 120 ||
    guestClicks.b[0]?.y !== 110
  ) {
    throw new Error(
      `top guest received wrong target coordinates: ${JSON.stringify(guestClicks)}`,
    );
  }
  evidence.overlap = { guest: "b", targetLocal: guestClicks.b[0] };

  // A-only point remains interactive; a point inside its square but outside
  // the rounded clip must fall through to the transparent host renderer.
  click(140, 120);
  await until("lower guest hit", () => guestClicks.a.length === 1);
  const beforeCorner = guestClicks.a.length;
  const beforeHost = hostBodyClicks.length;
  click(82, 62);
  await until(
    "rounded-corner fallthrough",
    () => hostBodyClicks.length === beforeHost + 1,
  );
  if (guestClicks.a.length !== beforeCorner) {
    throw new Error("rounded-away guest corner still received input");
  }
  evidence.roundedClip = {
    interiorTargetLocal: guestClicks.a[0],
    cornerFellThrough: hostBodyClicks.at(-1),
  };

  // Resize/fit changes both native layer geometry and CEF viewport; re-hit
  // testing must use the new top-left and report coordinates in that view.
  b.setBounds({ x: 350, y: 180, width: 200, height: 170 });
  await until(
    "resized guest raster",
    () => b.renderedSize.width >= 200 * host.devicePixelRatio,
  );
  click(400, 230);
  await until("resized guest hit", () => guestClicks.b.length === 2);
  const resizedLocal = guestClicks.b[1];
  if (resizedLocal?.x !== 50 || resizedLocal?.y !== 50) {
    throw new Error(
      `resized guest coordinates mismatch: ${JSON.stringify(resizedLocal)}`,
    );
  }
  evidence.resize = { raster: b.renderedSize, targetLocal: resizedLocal };

  console.log(`COMPOSITION_EVIDENCE:${JSON.stringify(evidence)}`);
  console.log("NATIVE_COMPOSITION_GATE:PASS");
  if (process.env.HOLD_OPEN === "1") {
    const holdMs = Number(process.env.HOLD_OPEN_MS ?? 30_000);
    console.log(
      `COMPOSITION_WINDOW_ID:${String((native.lib.symbols.bunium_window_get_id as NativeCall)(host.windowHandle))}`,
    );
    decoy = new runtime.BuniumWindow({
      url: `${origin}/host`,
      width: 640,
      height: 480,
      title: "01e decoy composition fixture",
      transparent: true,
      trustedOrigins: [origin],
    });
    console.log("COMPOSITION_DECOY_READY");
    await sleep(Number.isFinite(holdMs) ? Math.max(1_000, holdMs) : 30_000);
  }
} catch (error) {
  console.error(`NATIVE_COMPOSITION_GATE:FAIL ${String(error)}`);
  console.error(`COMPOSITION_EVIDENCE:${JSON.stringify(evidence)}`);
  process.exitCode = 1;
  if (process.env.HOLD_OPEN === "1") {
    // Hold the (partially composed) native window open for actual-window
    // capture even when the gate fails -- e.g. transparent host without
    // overlays on Windows, where the overlay API is macOS-only.
    const holdMs = Number(process.env.HOLD_OPEN_MS ?? 30_000);
    console.log("COMPOSITION_HOLD_ON_FAILURE");
    await sleep(Number.isFinite(holdMs) ? Math.max(1_000, holdMs) : 30_000);
  }
} finally {
  a?.dispose();
  b?.dispose();
  menuOverlay?.dispose();
  decoy?.close();
  host.close();
  runtime.app.shutdown();
  server.stop(true);
}
