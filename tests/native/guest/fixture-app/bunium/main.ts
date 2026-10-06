// Native guest-view fixture: document-start Telegram-style transport, instance
// routing, generation rotation on navigation/redirect/reload/crash, stale
// reply dropping and twenty create/dispose cycles without retained handles.

type GuestEvent = { type: string; generation: number; [key: string]: unknown };
type Guest = {
  readonly generation: number;
  readonly disposed: boolean;
  readonly staleDropped: number;
  onEvent(listener: (event: GuestEvent) => void): () => void;
  onMessage(
    listener: (message: { generation: number; data: string }) => void,
  ): () => void;
  navigate(url: string): void;
  reload(): void;
  post(generation: number, data: string): boolean;
  dispose(): void;
};
type Runtime = {
  app: { shutdown(): void };
  BuniumWindow: new (
    options: Record<string, unknown>,
  ) => {
    createGuest(options: Record<string, unknown>): Guest;
    close(): void;
  };
  BuniumSession: {
    fromPartition(key: string): { release(): void };
    ephemeral(): { release(): void };
  };
  debugLiveCounts(): { views: number; clients: number };
  guestApiVersion?: number;
};

const evidence: Record<string, unknown> = {};
const runtime = (await import(
  process.env.BUNIUM_MODULE ?? "bunium"
)) as unknown as Runtime;
if (runtime.guestApiVersion !== 1) fail("runtime lacks guest API v1");

// Telegram-style native transport (Android/iOS clients expose
// TelegramWebviewProxy.postEvent and call Telegram.WebView.receiveEvent).
const bridgeScript = `
  const proxy = Object.freeze({
    postEvent(eventType, eventData) { post(JSON.stringify([String(eventType), eventData ?? null])); },
  });
  Object.defineProperty(window, "TelegramWebviewProxy", { value: proxy });
  return (data) => {
    const [eventType, eventData] = JSON.parse(data);
    window.dispatchEvent(new CustomEvent("fixture-inbound", { detail: { eventType, eventData } }));
  };
`;

const guestPage = (label: string) => `<!doctype html><meta charset="utf-8">
<script>
  const docToken = Math.random().toString(36).slice(2);
  const seen = {
    proxy: typeof window.TelegramWebviewProxy,
    hostBridge: typeof window.__bunium,
    postGlobal: typeof post,
  };
  window.TelegramWebviewProxy?.postEvent("first_script", { label: ${JSON.stringify(label)}, docToken, seen, origin: location.origin });
  addEventListener("fixture-inbound", (event) => {
    const { eventType, eventData } = event.detail;
    if (eventType === "echo") TelegramWebviewProxy.postEvent("echo_reply", { docToken, eventData });
    if (eventType === "tick") setInterval(() => TelegramWebviewProxy.postEvent("tick", { docToken }), 5);
  });
  addEventListener("message", (event) => {
    if (event.data?.type === "child") TelegramWebviewProxy.postEvent("child_report", event.data);
  });
</script>
<iframe src="/child"></iframe>`;

const childPage = `<script>
  parent.postMessage({ type: "child", childProxy: typeof window.TelegramWebviewProxy, childHostBridge: typeof window.__bunium }, "*");
</script>`;

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/child") return html(childPage);
      if (url.pathname === "/redirect") {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `http://localhost:${url.port}/landing?label=redirected`,
          },
        });
      }
      return html(guestPage(url.searchParams.get("label") ?? "unknown"));
    },
  });
}
const html = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/html" } });

const server = serve();
const base = `http://127.0.0.1:${server.port}`;
const check = (label: string, condition: boolean, detail?: unknown) => {
  evidence[label] = condition;
  if (!condition) fail(`${label} ${JSON.stringify(detail)}`);
};

type Parsed = {
  generation: number;
  type: string;
  data: Record<string, unknown>;
};
function record(guest: Guest) {
  const messages: Parsed[] = [];
  const events: GuestEvent[] = [];
  guest.onMessage(({ generation, data }) => {
    const [type, payload] = JSON.parse(data) as [
      string,
      Record<string, unknown>,
    ];
    messages.push({ data: payload, generation, type });
  });
  guest.onEvent((event) => events.push(event));
  return { events, messages };
}
async function until<T>(
  label: string,
  read: () => T | undefined,
  ms = 15_000,
): Promise<T> {
  const start = performance.now();
  while (performance.now() - start < ms) {
    const value = read();
    if (value !== undefined) return value;
    await Bun.sleep(10);
  }
  return fail(`timeout waiting for ${label}`);
}

const host = new runtime.BuniumWindow({
  url: "data:text/html,<body style='background:%23333'></body>",
  width: 900,
  height: 420,
  title: "Bunium guest fixture",
});

try {
  // 1. Document-start transport, no host bridge, subframe without injection.
  const sessionA = runtime.BuniumSession.ephemeral();
  const sessionB = runtime.BuniumSession.ephemeral();
  const a = host.createGuest({
    bridgeScript,
    height: 400,
    session: sessionA,
    url: `${base}/?label=a`,
    width: 280,
    x: 10,
    y: 10,
  });
  const b = host.createGuest({
    bridgeScript,
    height: 400,
    session: sessionB,
    url: `${base}/?label=b`,
    width: 280,
    x: 310,
    y: 10,
  });
  sessionA.release();
  sessionB.release();
  const logA = record(a);
  const logB = record(b);
  const firstA = await until("A first script", () =>
    logA.messages.find((m) => m.type === "first_script"),
  );
  const firstB = await until("B first script", () =>
    logB.messages.find((m) => m.type === "first_script"),
  );
  const seenA = firstA.data.seen as Record<string, string>;
  check(
    "first inline script sees Telegram transport",
    seenA.proxy === "object",
    seenA,
  );
  check(
    "guest has no host __bunium bridge",
    seenA.hostBridge === "undefined",
    seenA,
  );
  check(
    "native post is not a page global",
    seenA.postGlobal === "undefined",
    seenA,
  );
  check(
    "document event precedes first message",
    logA.events.some(
      (e) => e.type === "document" && e.generation === firstA.generation,
    ),
  );
  check(
    "instances route to their own handle",
    firstA.data.label === "a" &&
      firstB.data.label === "b" &&
      !logA.messages.some((m) => m.data.label === "b") &&
      !logB.messages.some((m) => m.data.label === "a"),
  );
  const child = await until("child report", () =>
    logA.messages.find((m) => m.type === "child_report"),
  );
  check(
    "subframe gets no transport or host bridge",
    child.data.childProxy === "undefined" &&
      child.data.childHostBridge === "undefined",
    child.data,
  );

  // 2. Host -> guest delivery targets one instance and one generation.
  check(
    "post to current generation accepted",
    a.post(a.generation, JSON.stringify(["echo", "to-a"])),
  );
  const echo = await until("A echo", () =>
    logA.messages.find((m) => m.type === "echo_reply"),
  );
  check(
    "echo came from A's current document",
    echo.data.eventData === "to-a" &&
      echo.data.docToken === firstA.data.docToken,
  );
  await Bun.sleep(200);
  check(
    "B never saw A's delivery",
    !logB.messages.some((m) => m.type === "echo_reply"),
  );

  // 3. Redirect to another origin rotates generation; bridge present again.
  const oldGeneration = a.generation;
  a.post(oldGeneration, JSON.stringify(["tick", null]));
  await until("ticks", () =>
    logA.messages.filter((m) => m.type === "tick").length > 5
      ? true
      : undefined,
  );
  a.navigate(`${base}/redirect`);
  const redirected = await until("redirected first script", () =>
    logA.messages.find(
      (m) => m.type === "first_script" && m.data.label === "redirected",
    ),
  );
  check(
    "redirect committed a new generation",
    redirected.generation === oldGeneration + 1,
    { oldGeneration, redirected: redirected.generation },
  );
  check(
    "redirected document is on the final origin",
    String(redirected.data.origin).startsWith("http://localhost:"),
    redirected.data,
  );
  check(
    "redirected document has the transport",
    (redirected.data.seen as Record<string, string>).proxy === "object",
  );
  const tokenGeneration = new Map<unknown, number>([
    [firstA.data.docToken, oldGeneration],
    [redirected.data.docToken, redirected.generation],
  ]);
  const ticks = logA.messages.filter((m) => m.type === "tick");
  check(
    "every tick is tagged with its own document's generation",
    ticks.every((m) => tokenGeneration.get(m.data.docToken) === m.generation),
    ticks.slice(-3),
  );

  // 4. Stale reply is refused; fresh reply reaches the new document only.
  check(
    "stale reply refused",
    a.post(oldGeneration, JSON.stringify(["echo", "stale"])) === false,
  );
  check(
    "fresh reply accepted",
    a.post(a.generation, JSON.stringify(["echo", "fresh"])),
  );
  const fresh = await until("fresh echo", () =>
    logA.messages.find(
      (m) => m.type === "echo_reply" && m.data.eventData === "fresh",
    ),
  );
  await Bun.sleep(200);
  check(
    "stale reply never delivered",
    !logA.messages.some(
      (m) => m.type === "echo_reply" && m.data.eventData === "stale",
    ),
  );
  check(
    "fresh reply answered by redirected document",
    fresh.data.docToken === redirected.data.docToken,
  );
  evidence.staleDroppedByNative = a.staleDropped;

  // 5. Reload rotates generation.
  const beforeReload = a.generation;
  a.reload();
  const reloaded = await until("reload first script", () =>
    logA.messages.find(
      (m) => m.type === "first_script" && m.generation === beforeReload + 1,
    ),
  );
  check(
    "reload rotates generation and re-injects",
    (reloaded.data.seen as Record<string, string>).proxy === "object",
  );

  // 6. Crash one guest; the other keeps working; reload recovers.
  const crashGeneration = b.generation;
  b.navigate("chrome://crash");
  const crashed = await until("B crash event", () =>
    logB.events.find((e) => e.type === "crashed"),
  );
  evidence.crashStatus = crashed.status;
  check(
    "reply to crashed document refused",
    b.post(crashGeneration, JSON.stringify(["echo", "dead"])) === false,
  );
  check(
    "A unaffected by B crash",
    a.post(a.generation, JSON.stringify(["echo", "after-crash"])),
  );
  await until("A echo after crash", () =>
    logA.messages.find(
      (m) => m.type === "echo_reply" && m.data.eventData === "after-crash",
    ),
  );
  b.navigate(`${base}/?label=b-recovered`);
  const recovered = await until("B recovered", () =>
    logB.messages.find(
      (m) => m.type === "first_script" && m.data.label === "b-recovered",
    ),
  );
  check(
    "crashed guest recovers with a new generation",
    recovered.generation > crashGeneration,
  );

  // 7. Dispose drops subscriptions and fires one disposed event.
  let disposedEvents = 0;
  a.onEvent((e) => {
    if (e.type === "disposed") disposedEvents += 1;
  });
  a.dispose();
  a.dispose();
  check(
    "dispose idempotent with one disposed event",
    disposedEvents === 1 && a.disposed,
  );
  check("post after dispose refused", a.post(1, "[]") === false);
  b.dispose();

  // 8. Twenty create/dispose cycles return native objects to baseline.
  const settle = async () => {
    const start = performance.now();
    let counts = runtime.debugLiveCounts();
    while (performance.now() - start < 10_000) {
      counts = runtime.debugLiveCounts();
      if (
        counts.clients === baseline.clients &&
        counts.views === baseline.views
      )
        break;
      await Bun.sleep(50);
    }
    return counts;
  };
  const baseline = { clients: 1, views: 1 }; // the host window's own view
  const initial = await settle();
  check(
    "baseline after first dispose",
    initial.views === 1 && initial.clients === 1,
    initial,
  );
  const rss: number[] = [];
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const session = runtime.BuniumSession.ephemeral();
    const guest = host.createGuest({
      bridgeScript,
      height: 200,
      session,
      url: `${base}/?label=cycle${cycle}`,
      width: 200,
      x: 10,
      y: 10,
    });
    session.release();
    if (cycle % 5 === 4) {
      guest.dispose(); // dispose before the browser finished creating
    } else {
      const log = record(guest);
      await until(`cycle ${cycle}`, () =>
        log.messages.find((m) => m.type === "first_script"),
      );
      guest.dispose();
    }
    if (cycle % 5 === 0) rss.push(process.memoryUsage().rss);
  }
  const after = await settle();
  evidence.cycleCounts = after;
  evidence.rssMiB = rss.map((value) => Math.round(value / 1048576));
  check(
    "twenty cycles leave no views or clients behind",
    after.views === 1 && after.clients === 1,
    after,
  );
} catch (error) {
  fail(String(error instanceof Error ? error.stack : error));
}

console.log(`GUEST_EVIDENCE ${JSON.stringify(evidence)}`);
console.log("NATIVE_GUEST_GATE:PASS");
host.close();
server.stop(true);
runtime.app.shutdown();
process.exit(0);

function fail(message: string): never {
  console.log(`GUEST_EVIDENCE ${JSON.stringify(evidence)}`);
  console.error(`GUEST_FAIL ${message}`);
  console.log("NATIVE_GUEST_GATE:FAIL");
  process.exit(1);
}
