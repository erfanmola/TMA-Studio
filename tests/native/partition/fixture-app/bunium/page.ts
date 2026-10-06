// Guest page and service worker served by the fixture. The page has no
// Bunium bridge (its origin is not trusted); it reports over HTTP instead.
export const serviceWorker = `
const token = new URL(self.location.href).searchParams.get("token");
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (new URL(event.request.url).pathname === "/sw-probe") {
    event.respondWith(new Response("sw:" + token));
  }
});
`;

export const page = `<!doctype html><meta charset="utf-8"><title>partition probe</title>
<script>
const params = new URLSearchParams(location.search);
const label = params.get("label");
const token = params.get("token");
const mode = params.get("mode");

function idb(run) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("fixture", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("kv", "readwrite");
      const request = run(tx.objectStore("kv"));
      tx.oncomplete = () => { open.result.close(); resolve(request.result ?? null); };
      tx.onerror = () => reject(tx.error);
    };
  });
}
const cookie = (name) =>
  (document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)")) || [])[1] || null;

async function read() {
  const cached = await caches.match("/fixture-cache");
  const registrations = await navigator.serviceWorker.getRegistrations();
  const probe = await (await fetch("/sw-probe", { cache: "no-store" })).text();
  return {
    cookie: cookie("p"),
    sessionCookie: cookie("s"),
    localStorage: localStorage.getItem("p"),
    indexedDB: await idb((store) => store.get("p")),
    cacheStorage: cached ? await cached.text() : null,
    serviceWorkers: registrations.length,
    serviceWorkerProbe: probe,
  };
}

async function write() {
  document.cookie = "p=" + token + "; Max-Age=86400; path=/";
  document.cookie = "s=" + token + "; path=/";
  localStorage.setItem("p", token);
  await idb((store) => store.put(token, "p"));
  const cache = await caches.open("fixture");
  await cache.put("/fixture-cache", new Response(token));
  await navigator.serviceWorker.register("/sw.js?token=" + token);
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  }
}

async function report(body) {
  await fetch("/report", { method: "POST", body: JSON.stringify({ label, ...body }) });
}

(async () => {
  try {
    const before = await read();
    if (mode === "write") await write();
    const after = mode === "write" ? await read() : before;
    await report({ before, after });
  } catch (error) {
    await report({ error: String(error && error.stack || error) });
  }
})();
</script>`;
