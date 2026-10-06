import type { Pointer } from "bun:ffi";
import { resolve } from "node:path";
import type {
  GuestHost,
  RuntimeGuest,
} from "../../../../../apps/studio/bunium/runtime/guest.ts";
import type { SessionRuntime } from "../../../../../apps/studio/bunium/runtime/session.ts";
import { SessionAdapter } from "../../../../../apps/studio/bunium/runtime/session.ts";
import { HostSimulatorService } from "../../../../../apps/studio/bunium/services/simulator-service.ts";
import { guestRect } from "../../../../../apps/studio/src/contracts/simulator.ts";

type Runtime = SessionRuntime & {
  app: { init(): void; shutdown(): void };
  guestApiVersion?: number;
  BuniumWindow: new (
    options: Record<string, unknown>,
  ) => {
    close(): void;
    createGuest(options: Parameters<GuestHost["createGuest"]>[0]): RuntimeGuest;
    windowHandle: Pointer;
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
runtime.app.init();

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch() {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Studio simulator native gate</title>
      <style>html,body{margin:0;width:100%;height:100%;background:#ce2020}</style>
      <script>
        const send = (eventType, eventData) => TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
        addEventListener('load', () => setTimeout(() => {
          navigator.geolocation.getCurrentPosition(
            position => send('web_app_data_send', { data: JSON.stringify({
              kind: 'geolocation', latitude: position.coords.latitude,
              longitude: position.coords.longitude, accuracy: position.coords.accuracy
            }) }),
            error => send('web_app_data_send', { data: JSON.stringify({ kind: 'geolocation-error', code: error.code }) })
          );
        }, 300));
        addEventListener('click', event => send('web_app_data_send', {
          data: JSON.stringify({ kind: 'pointer', x: event.clientX, y: event.clientY })
        }), true);
        send('web_app_data_send', { data: JSON.stringify({ kind: 'loaded', title: document.title }) });
      </script>`,
      { headers: { "Content-Type": "text/html" } },
    );
  },
});

const host = new runtime.BuniumWindow({
  url: "data:text/html,<title>Studio simulator host</title>",
  width: 800,
  height: 600,
  title: "Studio simulator native gate",
});
const sessions = new SessionAdapter(runtime, {
  resolve: (id: string) =>
    id === "native-simulator" ? { id, ephemeral: true } : undefined,
});
const service = new HostSimulatorService(runtime, sessions);
const initialBounds = guestRect({ width: 800, height: 600 }, "top");
let closed = false;
const messages: Array<{
  generation: number;
  eventType: string;
  eventData: Record<string, unknown>;
}> = [];

try {
  const controller = await service.open({
    bounds: initialBounds,
    guestHost: {
      createGuest(options) {
        return host.createGuest(options);
      },
    },
    launch: {
      url: server.url.href,
      async close() {
        closed = true;
      },
    },
    mode: "overlay",
    partitionId: "native-simulator",
    platform: "android",
    simulatorId: `native-${crypto.randomUUID()}`,
    toolbarSide: "top",
    theme: "light",
  });
  const mockLocation = {
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 12,
  };
  check(
    service.setGeolocationOverride(controller.guest.simulatorId, mockLocation),
    "host service applies mock while simulator guest starts",
  );
  const originalGuest = controller.guest;
  controller.guest.onInbound(({ data, navigationGeneration }) => {
    try {
      const parsed = JSON.parse(data) as {
        eventType: string;
        eventData: Record<string, unknown>;
      };
      messages.push({
        generation: navigationGeneration,
        eventType: parsed.eventType,
        eventData: parsed.eventData,
      });
      messagesForFailure.push(messages[messages.length - 1]);
    } catch {
      // Ignore malformed test traffic; the assertions below require valid envelopes.
    }
  });

  await until("guest document-start message", () =>
    messages.find(
      (message) =>
        message.eventData?.data &&
        JSON.parse(message.eventData.data).kind === "loaded",
    ),
  );
  const locationMessage = await until("Studio mock geolocation event", () =>
    messages.find(
      (message) =>
        message.eventData?.data &&
        JSON.parse(message.eventData.data).kind === "geolocation",
    ),
  );
  const location = JSON.parse(locationMessage.eventData.data);
  check(
    location.latitude === mockLocation.latitude &&
      location.longitude === mockLocation.longitude &&
      location.accuracy === mockLocation.accuracy,
    "Studio guest receives only configured mock coordinates",
    location,
  );
  const generation = controller.guest.navigationGeneration;
  clickAt(
    initialBounds.x + Math.floor(initialBounds.width / 2),
    initialBounds.y + Math.floor(initialBounds.height / 2),
  );
  const topClick = await until("Top guest pointer event", () =>
    messages.find(
      (message) =>
        message.eventData?.data &&
        JSON.parse(message.eventData.data).kind === "pointer",
    ),
  );
  const top = JSON.parse(topClick.eventData.data);
  check(
    top.x === Math.floor(initialBounds.width / 2) &&
      top.y === Math.floor(initialBounds.height / 2),
    "Top input coordinates",
    top,
  );

  const leftBounds = guestRect({ width: 800, height: 600 }, "left");
  controller.setMode("expanded");
  controller.setTheme("dark");
  controller.setToolbarSide("left", leftBounds);
  check(controller.guest === originalGuest, "guest identity after UI changes");
  check(
    controller.guest.navigationGeneration === generation,
    "document generation after UI changes",
  );
  clickAt(
    leftBounds.x + Math.floor(leftBounds.width / 2),
    leftBounds.y + Math.floor(leftBounds.height / 2),
  );
  const leftClick = await until(
    "Left guest pointer event",
    () =>
      messages.filter(
        (message) =>
          message.eventData?.data &&
          JSON.parse(message.eventData.data).kind === "pointer",
      )[1],
  );
  const left = JSON.parse(leftClick.eventData.data);
  check(
    left.x === Math.floor(leftBounds.width / 2) &&
      left.y === Math.floor(leftBounds.height / 2),
    "Left input coordinates",
    left,
  );
  check(
    leftClick.generation === generation,
    "message remains on same document",
    leftClick,
  );

  await service.close(controller.guest.simulatorId);
  check(closed, "prepared launch cleanup");
  console.log(
    JSON.stringify(
      {
        gate: "STUDIO_SIMULATOR_NATIVE_GATE:PASS",
        location,
        generation,
        initialBounds,
        top,
        leftBounds,
        left,
        sameGuest: controller.guest === originalGuest,
      },
      null,
      2,
    ),
  );
} catch (error) {
  fail(String(error instanceof Error ? error.stack : error));
} finally {
  await service.closeAll();
  host.close();
  server.stop(true);
  runtime.app.shutdown();
}

function clickAt(x: number, y: number): void {
  const handle = host.windowHandle;
  native.lib.symbols.bunium_dispatch_mouse_click(handle, x, y, 0, 0, 1);
  native.lib.symbols.bunium_dispatch_mouse_click(handle, x, y, 0, 1, 1);
}

async function until<T>(label: string, read: () => T | undefined): Promise<T> {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    const value = read();
    if (value !== undefined) return value;
    await Bun.sleep(10);
  }
  return fail(
    `timed out waiting for ${label}; messages=${JSON.stringify(messagesForFailure)}`,
  );
}

const messagesForFailure: unknown[] = [];
function check(condition: boolean, label: string, detail?: unknown): void {
  if (!condition) fail(`${label}: ${JSON.stringify(detail)}`);
}

function fail(message: string): never {
  console.error(`STUDIO_SIMULATOR_NATIVE_GATE:FAIL ${message}`);
  process.exit(1);
}
