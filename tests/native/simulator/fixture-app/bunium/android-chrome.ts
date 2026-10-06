import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { RuntimeGuest } from "../../../../../apps/studio/bunium/runtime/guest.ts";
import { SessionAdapter } from "../../../../../apps/studio/bunium/runtime/session.ts";
import { AndroidChromeOverlays } from "../../../../../apps/studio/bunium/services/android-chrome-overlays.ts";
import { HostSimulatorService } from "../../../../../apps/studio/bunium/services/simulator-service.ts";
import { guestRect } from "../../../../../apps/studio/src/contracts/simulator.ts";
import { parseSimulatorRequest } from "../../../../../apps/studio/src/contracts/simulator-rpc.ts";

type Pointer = import("bun:ffi").Pointer;
type Runtime = {
  app: { init(): void; shutdown(): void };
  guestApiVersion: number;
  sessionApiVersion: number;
  BuniumWindow: new (
    options: Record<string, unknown>,
  ) => {
    close(): void;
    createGuest(options: Record<string, unknown>): unknown;
    createOverlay(options: Record<string, unknown>): {
      dispose(): void;
      emit(name: string, payload: unknown): void;
      on(name: string, listener: (payload: unknown) => void): void;
      setBounds(bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
      }): void;
    };
    readonly windowHandle: Pointer;
    on(name: string, listener: (payload: unknown) => void): void;
  };
};
type Native = {
  lib: {
    symbols: {
      bunium_dispatch_mouse_click(
        handle: Pointer,
        x: number,
        y: number,
        modifiers: number,
        button: number,
        state: number,
      ): void;
    };
  };
};

const repo = process.env.BUNIUM_REPO;
if (!repo) fail("BUNIUM_REPO is required");
const runtime = (await import(
  process.env.BUNIUM_MODULE ?? resolve(repo, "src/index.ts")
)) as Runtime;
const native = (await import(resolve(repo, "src/native.ts"))) as Native;
const dist = resolve(import.meta.dirname, "../../../../../apps/studio/dist");
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/guest") {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Android overlay guest</title>
        <style>html,body{margin:0;width:100%;height:100%;background:#ce2020}</style>
        <script>
          var send=(eventType,eventData)=>TelegramWebviewProxy.postEvent(eventType,JSON.stringify(eventData));
          var report=(value)=>send('web_app_data_send',{data:JSON.stringify(value)});
          window.TelegramGameProxy_receiveEvent=(eventType,eventData)=>report({kind:'incoming',eventType,eventData});
          addEventListener('click',event=>report({kind:'pointer',x:event.clientX,y:event.clientY}),true);
          setTimeout(()=>{send('web_app_setup_back_button',{is_visible:true});report({kind:'loaded'});},250);
        </script>Mini App guest`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    const pathname = decodeURIComponent(url.pathname);
    const filename = resolve(
      dist,
      pathname === "/" ? "index.html" : `.${pathname}`,
    );
    if (filename !== dist && !filename.startsWith(`${dist}${sep}`)) {
      return new Response("Not found", { status: 404 });
    }
    const file = Bun.file(filename);
    if (!(await file.exists()))
      return new Response("Not found", { status: 404 });
    return new Response(await readFile(filename), {
      headers: {
        "content-type":
          mimeTypes[extname(filename)] ?? "application/octet-stream",
      },
    });
  },
});

runtime.app.init();
const origin = `http://127.0.0.1:${server.port}`;
const host = new runtime.BuniumWindow({
  url: `${origin}/?scene=simulator&platform=android&mode=overlay&side=top&theme=light&locale=en`,
  width: 1100,
  height: 760,
  title: "Studio Android chrome native gate",
  trustedOrigins: [origin],
});
const nativeOverlays: Array<{
  bounds: { x: number; y: number; width: number; height: number };
  disposed: boolean;
  region: string;
  ready: boolean;
  states: unknown[];
}> = [];
const overlayHost = {
  createOverlay(options: {
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const overlay = host.createOverlay(options);
    const entry = {
      bounds: {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
      },
      disposed: false,
      region: new URL(options.url).searchParams.get("region") ?? "unknown",
      ready: false,
      states: [] as unknown[],
    };
    nativeOverlays.push(entry);
    overlay.on("simulator.chrome.ready", () => {
      entry.ready = true;
    });
    return {
      on: overlay.on.bind(overlay),
      emit(name: string, payload: unknown) {
        if (name === "simulator.chrome.state") entry.states.push(payload);
        overlay.emit(name, payload);
      },
      setBounds(bounds: typeof entry.bounds) {
        entry.bounds = bounds;
        overlay.setBounds(bounds);
      },
      dispose() {
        entry.disposed = true;
        overlay.dispose();
      },
    };
  },
};

const bounds = guestRect({ width: 1100, height: 760 }, "top");
const overlays = new AndroidChromeOverlays(overlayHost, {
  origin,
  guestBounds: bounds,
  locale: "en",
  mode: "overlay",
  side: "top",
  theme: "light",
  onCommand: (command) => dispatch(command.method),
});
const sessionAdapter = new SessionAdapter(
  runtime as unknown as ConstructorParameters<typeof SessionAdapter>[0],
  {
    resolve(id) {
      return id === "android-chrome-native"
        ? { id, ephemeral: true }
        : undefined;
    },
  },
);
const simulator = new HostSimulatorService(
  runtime as unknown as ConstructorParameters<typeof HostSimulatorService>[0],
  sessionAdapter,
);
const messages: Array<Record<string, unknown>> = [];
let controller: Awaited<ReturnType<typeof simulator.open>> | undefined;
let originalGuest: unknown;

host.on("simulator.request", (payload) => {
  const request = parseSimulatorRequest(payload);
  if (!request || !controller) return;
  switch (request.command.method) {
    case "set-bounds":
      controller.setBounds(request.command.bounds);
      overlays.setGuestBounds(request.command.bounds);
      break;
    case "set-mode":
      controller.setMode(request.command.mode);
      overlays.setMode(request.command.mode);
      break;
    case "set-side":
      controller.setToolbarSide(request.command.side);
      overlays.setSide(request.command.side);
      break;
    case "set-theme":
      controller.setTheme(request.command.theme);
      overlays.setTheme(request.command.theme);
      break;
    case "android-back":
      if (!controller.pressBackButton()) {
        controller.setVisibility(false);
        overlays.setSurface("telegram");
      }
      break;
    case "android-home":
      controller.setVisibility(false);
      overlays.setSurface("telegram");
      break;
    case "android-tasks":
      controller.setVisibility(false);
      overlays.setSurface("tasks");
      break;
    case "android-resume":
      controller.setVisibility(true);
      overlays.setSurface("mini-app");
      break;
    case "close":
    case "reload":
      break;
  }
});

try {
  controller = await simulator.open({
    bounds,
    guestHost: {
      createGuest(options) {
        return host.createGuest(options) as RuntimeGuest;
      },
    },
    launch: {
      url: `${origin}/guest`,
      async close() {},
    },
    mode: "overlay",
    partitionId: "android-chrome-native",
    platform: "android",
    simulatorId: `android-chrome-${crypto.randomUUID()}`,
    toolbarSide: "top",
    theme: "light",
  });
  originalGuest = controller.guest;
  controller.guest.onInbound(({ data }) => {
    try {
      const event = JSON.parse(data) as {
        eventType?: string;
        eventData?: unknown;
      };
      if (event.eventType !== "web_app_data_send") return;
      const envelope = JSON.parse(
        String((event.eventData as { data?: unknown }).data),
      );
      messages.push(envelope);
    } catch {
      // The assertions require valid JSON envelopes for relevant events.
    }
  });
  await until(
    "two trusted chrome surfaces ready",
    () => nativeOverlays.filter((overlay) => overlay.ready).length === 2,
  );
  await until(
    "guest ready and Back button visible",
    () =>
      messages.some((message) => message.kind === "loaded") &&
      controller?.state.buttons.back.visible === true,
  );

  click(bounds.x + 80, bounds.y + 10);
  await Bun.sleep(150);
  if (messages.some((message) => message.kind === "pointer")) {
    fail("status overlay click fell through into the guest");
  }

  click(bounds.x + Math.floor(bounds.width / 6), bounds.y + bounds.height - 20);
  await until("Back action delivered to the current guest", () =>
    messages.some(
      (message) =>
        message.kind === "incoming" &&
        message.eventType === "back_button_pressed",
    ),
  );
  if (nativeOverlays.length !== 2)
    fail("Back with a visible button left the app surface");

  click(bounds.x + Math.floor(bounds.width / 2), bounds.y + bounds.height - 20);
  await until(
    "Home hides the app and creates Telegram surface",
    () =>
      nativeOverlays.some(
        (overlay) => overlay.region === "background" && !overlay.disposed,
      ) &&
      messages.some(
        (message) =>
          message.kind === "incoming" &&
          message.eventType === "visibility_changed" &&
          (message.eventData as { is_visible?: unknown })?.is_visible === false,
      ),
  );

  click(
    bounds.x + Math.floor((bounds.width * 5) / 6),
    bounds.y + bounds.height - 20,
  );
  await until("Tasks surface state published", () =>
    nativeOverlays.some(
      (overlay) =>
        overlay.region === "background" &&
        !overlay.disposed &&
        overlay.states.some(
          (state) => (state as { surface?: string }).surface === "tasks",
        ),
    ),
  );
  const background = nativeOverlays.find(
    (overlay) => overlay.region === "background" && !overlay.disposed,
  );
  if (!background) fail("Tasks background overlay missing");
  const resumeX = background.bounds.x + Math.floor(background.bounds.width / 2);
  const resumeY =
    background.bounds.y + Math.round(background.bounds.height * 0.57);
  await Bun.sleep(100);
  click(resumeX, resumeY);
  await until(
    "Resume returns to the same live guest",
    () => background.disposed && controller?.state.visible === true,
  );
  if (controller.guest !== originalGuest)
    fail("guest handle changed unexpectedly");

  click(
    bounds.x + Math.floor(bounds.width / 2),
    bounds.y + Math.floor(bounds.height / 2),
  );
  await until("resumed guest receives aligned native input", () =>
    messages.some((message) => message.kind === "pointer"),
  );
  const pointer = messages.find((message) => message.kind === "pointer");
  if (
    pointer?.x !== Math.floor(bounds.width / 2) ||
    pointer?.y !== Math.floor(bounds.height / 2)
  ) {
    fail(`guest pointer alignment mismatch: ${JSON.stringify(pointer)}`);
  }
  console.log(
    JSON.stringify(
      {
        gate: "STUDIO_ANDROID_OVERLAY_NATIVE_GATE:PASS",
        guestBounds: bounds,
        nativeRegions: nativeOverlays.map((overlay) => ({
          region: overlay.region,
          disposed: overlay.disposed,
          bounds: overlay.bounds,
        })),
        backButtonEvent: "back_button_pressed",
        visibilityEvents: messages.filter(
          (message) =>
            message.kind === "incoming" &&
            message.eventType === "visibility_changed",
        ).length,
        pointer,
        resumePoint: { x: resumeX, y: resumeY },
        guestRetained: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fail(String(error instanceof Error ? error.stack : error));
} finally {
  overlays.dispose();
  await simulator.closeAll();
  host.close();
  server.stop(true);
  runtime.app.shutdown();
}

function dispatch(method: string): void {
  if (!controller) return;
  switch (method) {
    case "android-back":
      if (!controller.pressBackButton()) {
        controller.setVisibility(false);
        overlays.setSurface("telegram");
      }
      break;
    case "android-home":
      controller.setVisibility(false);
      overlays.setSurface("telegram");
      break;
    case "android-tasks":
      controller.setVisibility(false);
      overlays.setSurface("tasks");
      break;
    case "android-resume":
      controller.setVisibility(true);
      overlays.setSurface("mini-app");
      break;
  }
}

function click(x: number, y: number): void {
  native.lib.symbols.bunium_dispatch_mouse_click(
    host.windowHandle,
    x,
    y,
    0,
    0,
    1,
  );
  native.lib.symbols.bunium_dispatch_mouse_click(
    host.windowHandle,
    x,
    y,
    0,
    1,
    1,
  );
}

async function until(label: string, predicate: () => boolean): Promise<void> {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    if (predicate()) return;
    await Bun.sleep(20);
  }
  fail(
    `timed out waiting for ${label}; messages=${JSON.stringify(messages)}; overlays=${JSON.stringify(nativeOverlays)}; visible=${controller?.state.visible}`,
  );
}

function fail(message: string): never {
  console.error(`STUDIO_ANDROID_OVERLAY_NATIVE_GATE:FAIL ${message}`);
  process.exit(1);
}
