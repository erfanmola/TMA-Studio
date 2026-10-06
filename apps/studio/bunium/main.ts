import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as bunium from "bunium";
import type { AccountReply } from "../src/contracts/account-rpc";
import { parseCaptureRequest } from "../src/contracts/capture";
import type { HomeReply } from "../src/contracts/home-rpc";
import type { LegacyImportReply } from "../src/contracts/legacy-import-rpc";
import {
  parseLegacyImportRequest,
  safeLegacyImportReply,
} from "../src/contracts/legacy-import-rpc";
import type { ProjectBundleReply } from "../src/contracts/project-bundle";
import {
  parseProjectBundleRequest,
  safeProjectBundleReply,
} from "../src/contracts/project-bundle";
import { ProjectServiceError } from "../src/contracts/project-service";
import type { ProjectWindowReply } from "../src/contracts/project-window-rpc";
import { guestRect } from "../src/contracts/simulator";
import { parseSimulatorRequest } from "../src/contracts/simulator-rpc";
import {
  parseStudioWindowRequest,
  type StudioWindowReply,
} from "../src/contracts/studio-window-rpc";
import type { UsersReply } from "../src/contracts/users-rpc";
import type { GuestHost } from "./runtime/guest";
import { KeyedStudioWindowRegistry } from "./runtime/keyed-windows";
import { SessionAdapter } from "./runtime/session";
import { StudioWindowRegistry } from "./runtime/windows";
import { handleAccountRequest } from "./services/account-rpc";
import {
  HostAccountService,
  StoreAccountIdentityStore,
} from "./services/account-service";
import {
  AndroidChromeOverlays,
  type AndroidOverlayHost,
  androidChromeOverlayBounds,
} from "./services/android-chrome-overlays";
import { HostHomeService, handleHomeRequest } from "./services/home-service";
import { HostLaunchService } from "./services/launch-service";
import {
  LegacyImportError,
  LegacyImportService,
  legacyConfigCandidate,
} from "./services/legacy-import";
import { MtcuteAccountClientFactory } from "./services/mtcute-account-client";
import {
  dispatchStudioMenuAction,
  nativeMenuLabels,
  studioNativeMenuItems,
} from "./services/native-menu";
import { PartitionRegistryService } from "./services/partition-registry";
import {
  ProjectBundleService,
  ProjectBundleServiceError,
} from "./services/project-bundle";
import { HostProjectService } from "./services/project-service";
import { handleProjectWindowRequest } from "./services/project-window-rpc";
import { captureScreenshot } from "./services/screenshot-capture";
import {
  HostSettingsService,
  handleSettingsRequest,
} from "./services/settings-service";
import {
  HostSimulatorService,
  type SimulatorGuestRuntime,
} from "./services/simulator-service";
import { SimulatorWindowTitles } from "./services/simulator-window-titles";
import {
  HostStorageService,
  handleStorageRequest,
} from "./services/storage-usage";
import { StoreNotFoundError, StudioStore } from "./services/store";
import {
  acknowledgeStudioUpdateHealthy,
  resolveUpdateInstallDir,
  runStudioUpdateHealthCheck,
  type StudioUpdateHealthRuntime,
} from "./services/update-health";
import {
  HostUpdateStatusService,
  handleUpdateStatusRequest,
} from "./services/update-status";
import { handleUsersRequest } from "./services/users-rpc";
import { HostUsersService } from "./services/users-service";
import { createSecretVault } from "./services/vault";
import { minimumWindowSizeForKey } from "./window-size";

type RuntimeWithTrustedOrigins = typeof bunium & {
  trustedOriginsApiVersion?: number;
} & SimulatorGuestRuntime;
if ((bunium as RuntimeWithTrustedOrigins).trustedOriginsApiVersion !== 1) {
  throw new Error(
    "Studio requires Bunium trusted-origin API v1; refusing to start with an unprotected host bridge.",
  );
}

const isDev = !process.env.BUNIUM_ROOT_CACHE_PATH;
const { app, BuniumWindow } = bunium;
const registry = new StudioWindowRegistry();
const keyed = new KeyedStudioWindowRegistry(registry);
const simulatorWindowTitles = new SimulatorWindowTitles();
type StudioMessages = {
  "account.request": unknown;
  "account.reply": AccountReply;
  "users.request": unknown;
  "users.reply": UsersReply;
  "home.request": unknown;
  "home.reply": HomeReply;
  "legacy-import.request": unknown;
  "legacy-import.reply": LegacyImportReply;
  "project-bundle.request": unknown;
  "project-bundle.reply": ProjectBundleReply;
  "home.changed": Record<string, never>;
  "project.request": unknown;
  "project.reply": ProjectWindowReply;
  "studio.window.request": unknown;
  "studio.window.reply": StudioWindowReply;
  "studio.window.close": unknown;
  "simulator.request": unknown;
  "simulator.location.reply": unknown;
  "settings.request": unknown;
  "settings.reply": unknown;
  "storage.request": unknown;
  "storage.reply": unknown;
  "update-status.request": unknown;
  "update-status.reply": unknown;
  "capture.request": unknown;
  "capture.reply": unknown;
  "simulator.chrome.ready": unknown;
  "simulator.chrome.state": unknown;
};
const dataDirectory = process.env.TMA_STUDIO_DATA_DIR
  ? resolve(process.env.TMA_STUDIO_DATA_DIR)
  : process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "TMA Studio")
    : process.platform === "win32"
      ? join(
          process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
          "TMA Studio",
        )
      : join(
          process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
          "tma-studio",
        );
const store = new StudioStore(join(dataDirectory, "studio.sqlite"));
const vault = await createSecretVault();
const legacyImportService = new LegacyImportService(store, vault, {
  backupDirectory: join(dataDirectory, "legacy-import-backups"),
});
const projectBundleService = new ProjectBundleService(store);
const accountService = new HostAccountService(
  new MtcuteAccountClientFactory(),
  vault,
  new StoreAccountIdentityStore(store),
);
const usersService = new HostUsersService(store);
const homeService = new HostHomeService(store);
const settingsService = new HostSettingsService(store, (enabled) => {
  registry.setAlwaysOnTop(enabled);
});
try {
  if (store.getSnapshot().settings?.alwaysOnTop === true) {
    registry.setAlwaysOnTop(true);
  }
} catch {
  // A missing/corrupt settings row keeps the default (off); the Settings
  // window surfaces load/save failures explicitly.
}
const launchService = new HostLaunchService(
  store,
  vault,
  new MtcuteAccountClientFactory(),
);
let simulatorService: HostSimulatorService | undefined;
let partitionRegistry: PartitionRegistryService | undefined;
const runtime = bunium as RuntimeWithTrustedOrigins;
const projectLaunch = (
  project: import("../src/contracts/entities").Project,
  platform: import("../src/contracts/entities").Platform,
) => openSimulatorLaunch(project, platform);
const projectService = new HostProjectService(store, vault, {
  identities: () =>
    store.listIdentities().map((identity) => ({
      id: identity.id,
      kind: identity.kind,
      label:
        identity.kind === "mock"
          ? [identity.firstName, identity.lastName].filter(Boolean).join(" ")
          : identity.profile.username
            ? `@${identity.profile.username}`
            : identity.profile.firstName,
    })),
  launch: projectLaunch,
});
type StudioWindow = InstanceType<typeof bunium.BuniumWindow<StudioMessages>>;
let shuttingDown = false;

function requestId(payload: unknown): string | null {
  let value = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value !== null &&
    typeof value === "object" &&
    "requestId" in value &&
    typeof value.requestId === "string"
    ? value.requestId
    : null;
}

function routeFor(key: string): {
  route: string;
  width: number;
  height: number;
  title: string;
} {
  const query = new URLSearchParams({ scene: "home" });
  if (key === "home")
    return {
      route: "?scene=home",
      width: 768,
      height: 480,
      title: "TMA Studio",
    };
  if (key.startsWith("project:new:")) {
    query.set("scene", "project");
    query.set("windowKey", key);
    return {
      route: `?${query}`,
      width: 760,
      height: 680,
      title: "TMA Studio — Project",
    };
  }
  if (key.startsWith("project:")) {
    const projectId = key.slice("project:".length);
    query.set("scene", "project");
    query.set("windowKey", key);
    if (projectId !== "create") query.set("projectId", projectId);
    return {
      route: `?${query}`,
      width: 760,
      height: 680,
      title: "TMA Studio — Project",
    };
  }
  if (key === "users")
    return {
      route: "?scene=users",
      width: 860,
      height: 700,
      title: "TMA Studio — Users",
    };
  if (key.startsWith("simulator:")) {
    const [, projectId = "", platform = "android"] = key.split(":");
    const project = store.getProject(projectId).project;
    const settings = store.getSnapshot().settings;
    const query = new URLSearchParams({
      scene: "simulator",
      projectId,
      platform,
      mode: project.defaultMode,
      side: settings?.toolbarSide ?? "top",
      theme: settings?.theme === "dark" ? "dark" : "light",
      locale: settings?.locale ?? "en",
    });
    return {
      route: `?${query}`,
      width: 1100,
      height: 760,
      title: "TMA Studio — Simulator",
    };
  }
  return {
    route: `?${new URLSearchParams({
      scene: "settings",
      locale: store.getSnapshot().settings?.locale ?? "en",
      theme: store.getSnapshot().settings?.theme ?? "system",
    })}`,
    width: 680,
    height: 640,
    title: "TMA Studio — Settings",
  };
}

function makeWindow(key: string): StudioWindow {
  const target = routeFor(key);
  const simulatorId = key.startsWith("simulator:")
    ? key.slice("simulator:".length)
    : undefined;
  let nativeTitle = target.title;
  if (simulatorId) {
    nativeTitle = simulatorWindowTitles.open(simulatorId);
  }
  const origin = isDev ? "http://localhost:5173" : "bunium://app";
  const minimumSize = minimumWindowSizeForKey(key);
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "linux";
  const window = new BuniumWindow<StudioMessages>({
    url: `${origin}/${target.route}${target.route.includes("?") ? "&" : "?"}platform=${platform}`,
    trustedOrigins: [origin],
    width: target.width,
    height: target.height,
    minWidth: minimumSize?.width,
    minHeight: minimumSize?.height,
    title: nativeTitle,
  } as ConstructorParameters<typeof BuniumWindow<StudioMessages>>[0]);
  const simulatorPlatform = simulatorId?.split(":")[1];
  const routeQuery = new URLSearchParams(target.route.slice(1));
  let androidChrome: AndroidChromeOverlays | undefined;
  let pendingLegacyPath: string | null = null;
  let pendingBundlePath: string | null = null;
  function dispatchAndroidCommand(method: string): void {
    if (!simulatorId) return;
    const controller = simulatorService?.get(simulatorId);
    if (!controller) return;
    switch (method) {
      case "android-back":
        if (!controller.pressBackButton()) {
          controller.setVisibility(false);
          androidChrome?.setSurface("telegram");
        }
        break;
      case "android-home":
        controller.setVisibility(false);
        androidChrome?.setSurface("telegram");
        break;
      case "android-tasks":
        controller.setVisibility(false);
        androidChrome?.setSurface("tasks");
        break;
      case "android-resume":
        controller.setVisibility(true);
        androidChrome?.setSurface("mini-app");
        break;
    }
  }
  if (simulatorId && simulatorPlatform === "android") {
    const createOverlay = (window as unknown as Partial<AndroidOverlayHost>)
      .createOverlay;
    if (process.platform !== "darwin" || typeof createOverlay !== "function") {
      window.close();
      throw new Error(
        "Android native chrome overlays are unavailable on this runtime.",
      );
    }
    const toolbarSide = store.getSnapshot().settings?.toolbarSide ?? "top";
    androidChrome = new AndroidChromeOverlays(
      { createOverlay: createOverlay.bind(window) },
      {
        origin,
        guestBounds: guestRect(
          { width: target.width, height: target.height },
          toolbarSide,
        ),
        locale: routeQuery.get("locale") ?? "en",
        mode:
          (routeQuery.get(
            "mode",
          ) as import("../src/contracts/entities").LaunchMode) ?? "standalone",
        side: toolbarSide,
        theme: routeQuery.get("theme") === "dark" ? "dark" : "light",
        onCommand: (command) => dispatchAndroidCommand(command.method),
      },
    );
  }
  window.on("account.request", (payload) => {
    void handleAccountRequest(payload, accountService).then((reply) => {
      const id = requestId(payload);
      if (reply) window.emit("account.reply", reply);
      else if (id)
        window.emit("account.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
    });
  });
  window.on("users.request", (payload) => {
    void handleUsersRequest(payload, usersService).then((reply) => {
      const id = requestId(payload);
      if (reply) window.emit("users.reply", reply);
      else if (id)
        window.emit("users.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
    });
  });
  window.on("home.request", (payload) => {
    void handleHomeRequest(payload, homeService).then((reply) => {
      const id = requestId(payload);
      if (reply) window.emit("home.reply", reply);
      else if (id)
        window.emit("home.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
    });
  });
  window.on("settings.request", (payload) => {
    void handleSettingsRequest(payload, settingsService).then((reply) => {
      const id = requestId(payload);
      if (reply) window.emit("settings.reply", reply);
      else if (id)
        window.emit("settings.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
    });
  });
  window.on("storage.request", (payload) => {
    void (async () => {
      try {
        if (runtime.sessionApiVersion !== 1 || !runtime.BuniumSession) {
          const id = requestId(payload);
          if (id)
            window.emit("storage.reply", {
              requestId: id,
              ok: false,
              error: "INTERNAL",
            });
          return;
        }
        partitionRegistry ??= new PartitionRegistryService(
          store,
          runtime.BuniumSession,
        );
        const activeRegistry = partitionRegistry;
        const session = runtime.BuniumSession;
        const { partitionKey } = await import("./runtime/session");
        const storageService = new HostStorageService(store, {
          canonicalDirectory: (id) => activeRegistry.canonicalDirectory(id),
          isInUse: (id) => {
            try {
              return session.isInUse(partitionKey(id));
            } catch {
              return true;
            }
          },
          clearSiteData: (id) => {
            activeRegistry.clear(id);
          },
        });
        const reply = await handleStorageRequest(payload, storageService);
        const id = requestId(payload);
        if (reply) window.emit("storage.reply", reply);
        else if (id)
          window.emit("storage.reply", {
            requestId: id,
            ok: false,
            error: "INVALID_INPUT",
          });
      } catch {
        const id = requestId(payload);
        if (id)
          window.emit("storage.reply", {
            requestId: id,
            ok: false,
            error: "INTERNAL",
          });
      }
    })();
  });
  window.on("update-status.request", (payload) => {
    void (async () => {
      try {
        const channel =
          store.getSnapshot().settings?.update.channel ?? "stable";
        const statusService = new HostUpdateStatusService(store, { channel });
        const reply = await handleUpdateStatusRequest(payload, statusService);
        const id = requestId(payload);
        if (reply) window.emit("update-status.reply", reply);
        else if (id)
          window.emit("update-status.reply", {
            requestId: id,
            ok: false,
            error: "INVALID_INPUT",
          });
      } catch {
        const id = requestId(payload);
        if (id)
          window.emit("update-status.reply", {
            requestId: id,
            ok: false,
            error: "INTERNAL",
          });
      }
    })();
  });
  window.on("legacy-import.request", (payload) => {
    const request = parseLegacyImportRequest(payload);
    if (!request) {
      const id = requestId(payload);
      if (id)
        window.emit("legacy-import.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
      return;
    }
    void (async () => {
      try {
        let outcome: Parameters<typeof safeLegacyImportReply>[1];
        switch (request.command.method) {
          case "detect": {
            pendingLegacyPath = null;
            const candidate = legacyConfigCandidate({
              platform: process.platform,
              homeDirectory: homedir(),
              environment: process.env,
            });
            const detected = await legacyImportService.detect();
            if (!candidate || !detected.found) {
              outcome = { state: "not-found" };
            } else {
              pendingLegacyPath = candidate;
              outcome = { state: "preview", preview: detected.preview };
            }
            break;
          }
          case "choose": {
            pendingLegacyPath = null;
            const selected = await runtime.showOpenDialog({
              title: "Choose legacy TMA Studio config JSON",
              allowMultiple: false,
            });
            const selectedPath = selected.paths[0];
            if (selected.canceled || !selectedPath) {
              outcome = { state: "canceled" };
              break;
            }
            const preview = await legacyImportService.previewFile(selectedPath);
            pendingLegacyPath = selectedPath;
            outcome = { state: "preview", preview };
            break;
          }
          case "import": {
            if (!pendingLegacyPath) {
              window.emit("legacy-import.reply", {
                requestId: request.requestId,
                ok: false,
                error: "INVALID_INPUT",
              });
              return;
            }
            const result =
              await legacyImportService.importFile(pendingLegacyPath);
            pendingLegacyPath = null;
            outcome = {
              state:
                result.status === "already-imported"
                  ? "already-imported"
                  : "imported",
              result,
            };
            break;
          }
        }
        window.emit(
          "legacy-import.reply",
          safeLegacyImportReply(request.requestId, outcome),
        );
      } catch (error) {
        const errorCode =
          error instanceof LegacyImportError
            ? error.code === "INVALID_FILE"
              ? "INVALID_INPUT"
              : error.code
            : "IMPORT_FAILED";
        window.emit("legacy-import.reply", {
          requestId: request.requestId,
          ok: false,
          error: errorCode,
        });
      }
    })();
  });
  window.on("project-bundle.request", (payload) => {
    const request = parseProjectBundleRequest(payload);
    if (!request) {
      const id = requestId(payload);
      if (id)
        window.emit("project-bundle.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
      return;
    }
    void (async () => {
      try {
        let result: Parameters<typeof safeProjectBundleReply>[1];
        switch (request.command.method) {
          case "catalog":
            pendingBundlePath = null;
            result = { state: "catalog", ...projectBundleService.catalog() };
            break;
          case "export": {
            pendingBundlePath = null;
            const selected = await runtime.showSaveDialog({
              title: "Export Studio projects",
              defaultName: "tma-studio-projects.json",
            });
            if (selected.canceled || !selected.path) {
              result = { state: "canceled" };
              break;
            }
            const counts = await projectBundleService.exportFile(
              selected.path,
              request.command.projectIds ?? [],
              request.command.identityIds ?? [],
            );
            result = { state: "exported", ...counts };
            break;
          }
          case "choose-import": {
            pendingBundlePath = null;
            const selected = await runtime.showOpenDialog({
              title: "Choose a Studio project bundle JSON",
              allowMultiple: false,
            });
            const path = selected.paths[0];
            if (selected.canceled || !path) {
              result = { state: "canceled" };
              break;
            }
            const preview = await projectBundleService.previewFile(path);
            pendingBundlePath = path;
            result = { state: "preview", preview };
            break;
          }
          case "import": {
            if (!pendingBundlePath)
              throw new ProjectBundleServiceError("INVALID_INPUT");
            const counts =
              await projectBundleService.importFile(pendingBundlePath);
            pendingBundlePath = null;
            result = { state: "imported", ...counts };
            break;
          }
        }
        window.emit(
          "project-bundle.reply",
          safeProjectBundleReply(request.requestId, result),
        );
      } catch (error) {
        const code =
          error instanceof ProjectBundleServiceError
            ? error.code
            : "IMPORT_FAILED";
        window.emit("project-bundle.reply", {
          requestId: request.requestId,
          ok: false,
          error: code,
        });
      }
    })();
  });
  window.on("project.request", (payload) => {
    void handleProjectWindowRequest(payload, projectService).then((reply) => {
      const id = requestId(payload);
      if (
        reply?.ok &&
        reply.result &&
        typeof reply.result === "object" &&
        "project" in reply.result
      ) {
        const project = reply.result.project;
        try {
          store.markRecentProject(project.id);
          (keyed.get("home") as StudioWindow | undefined)?.emit(
            "home.changed",
            {},
          );
        } catch {
          // Do not report a successful project write as failed if the
          // optional recent-project index could not be updated.
        }
      }
      if (reply) window.emit("project.reply", reply);
      else if (id)
        window.emit("project.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
    });
  });
  window.on("studio.window.request", (payload) => {
    const parsed = parseStudioWindowRequest(payload);
    if (!parsed) {
      const id = requestId(payload);
      if (id)
        window.emit("studio.window.reply", {
          requestId: id,
          ok: false,
          error: "INVALID_INPUT",
        });
      return;
    }
    void (async () => {
      try {
        const { action } = parsed;
        let key: string;
        if (action.kind === "create-project")
          key = `project:new:${crypto.randomUUID()}`;
        else if (action.kind === "open-project") {
          const project = store.getProject(action.projectId).project;
          key = `project:${project.id}`;
          store.markRecentProject(project.id);
          (keyed.get("home") as StudioWindow | undefined)?.emit(
            "home.changed",
            {},
          );
        } else key = action.kind;
        keyed.open(key, () => makeWindow(key));
        window.emit("studio.window.reply", {
          requestId: parsed.requestId,
          ok: true,
        });
      } catch (error) {
        window.emit("studio.window.reply", {
          requestId: parsed.requestId,
          ok: false,
          error: error instanceof StoreNotFoundError ? "NOT_FOUND" : "INTERNAL",
        });
      }
    })();
  });
  window.on("studio.window.close", (payload) => {
    let value = payload;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return;
      }
    }
    if (
      value !== null &&
      typeof value === "object" &&
      "windowKey" in value &&
      value.windowKey === key
    )
      keyed.close(key);
  });
  if (key.startsWith("simulator:")) {
    const currentSimulatorId = key.slice("simulator:".length);
    window.on("simulator.request", (payload) => {
      const request = parseSimulatorRequest(payload);
      const controller = simulatorService?.get(currentSimulatorId);
      if (!request || !controller) return;
      switch (request.command.method) {
        case "close":
          void simulatorService
            ?.close(currentSimulatorId)
            .finally(() => keyed.close(key));
          break;
        case "reload":
          controller.guest.reload();
          break;
        case "set-bounds":
          controller.setBounds(request.command.bounds);
          androidChrome?.setGuestBounds(request.command.bounds);
          break;
        case "set-mode":
          controller.setMode(request.command.mode);
          androidChrome?.setMode(request.command.mode);
          break;
        case "set-side":
          controller.setToolbarSide(request.command.side);
          androidChrome?.setSide(request.command.side);
          break;
        case "set-theme":
          controller.setTheme(request.command.theme);
          androidChrome?.setTheme(request.command.theme);
          break;
        case "set-location":
          try {
            if (
              !simulatorService?.setGeolocationOverride(currentSimulatorId, {
                latitude: request.command.latitude,
                longitude: request.command.longitude,
                accuracy: request.command.accuracy,
              })
            )
              throw new Error("Simulator is closed.");
            window.emit("simulator.location.reply", {
              requestId: request.requestId,
              ok: true,
            });
          } catch {
            window.emit("simulator.location.reply", {
              requestId: request.requestId,
              ok: false,
            });
          }
          break;
        case "clear-location":
          try {
            if (!simulatorService?.clearGeolocationOverride(currentSimulatorId))
              throw new Error("Simulator is closed.");
            window.emit("simulator.location.reply", {
              requestId: request.requestId,
              ok: true,
            });
          } catch {
            window.emit("simulator.location.reply", {
              requestId: request.requestId,
              ok: false,
            });
          }
          break;
        case "android-back":
        case "android-home":
        case "android-tasks":
        case "android-resume":
          dispatchAndroidCommand(request.command.method);
          break;
      }
    });
    window.on("capture.request", (payload) => {
      const request = parseCaptureRequest(payload);
      if (!request) return;
      const restoreCaptureFocus = () => {
        const focus = (window as StudioWindow & { focus?: () => void }).focus;
        if (typeof focus !== "function") return;
        try {
          focus.call(window);
        } catch {
          // Focus may be unsupported, refused by the OS, or the window may be
          // closing. Keep the capture reply path available either way.
        }
      };
      void captureScreenshot(runtime, request, {
        pid: process.pid,
        title: nativeTitle,
        getGeometry: () => {
          const host = window.innerSize;
          const surface = guestRect(host, request.side);
          return {
            host,
            guest:
              simulatorPlatform === "android"
                ? androidChromeOverlayBounds(surface).background
                : surface,
          };
        },
        helperPath: join(import.meta.dir, "native/tma-studio-capture"),
      })
        .then((outcome) => {
          // App-modal folder panels can leave the renderer window visible but
          // non-key after a successful selection. Reclaim focus only after the
          // capture helper finishes, so its target window is not activated
          // during composition/capture.
          restoreCaptureFocus();
          window.emit(
            "capture.reply",
            outcome.state === "saved"
              ? {
                  requestId: request.requestId,
                  ok: true,
                  fileName: outcome.fileName,
                }
              : {
                  requestId: request.requestId,
                  ok: false,
                  error:
                    outcome.state === "canceled"
                      ? "CANCELED"
                      : outcome.state === "unavailable"
                        ? "UNAVAILABLE"
                        : "FAILED",
                },
          );
        })
        .catch(() => {
          restoreCaptureFocus();
          window.emit("capture.reply", {
            requestId: request.requestId,
            ok: false,
            error: "FAILED",
          });
        });
    });
    window.onClose(() => {
      if (simulatorId) simulatorWindowTitles.close(simulatorId);
      androidChrome?.dispose();
      void simulatorService?.close(currentSimulatorId);
    });
  }
  return window;
}

async function openSimulatorLaunch(
  project: import("../src/contracts/entities").Project,
  platform: import("../src/contracts/entities").Platform,
): Promise<void> {
  if (
    runtime.guestApiVersion !== 1 ||
    runtime.sessionApiVersion !== 1 ||
    !runtime.BuniumSession
  ) {
    throw new ProjectServiceError("UNAVAILABLE");
  }
  if (project.launch.kind !== "telegram") {
    throw new ProjectServiceError("UNAVAILABLE");
  }
  const simulatorId = `${project.id}:${platform}`;
  const key = `simulator:${simulatorId}`;
  if (keyed.get(key)) {
    keyed.open(key, () => makeWindow(key));
    return;
  }
  const prepared = await launchService.prepareTelegram(project.id, platform);
  let launchClosed = false;
  const ownedLaunch = {
    ...prepared,
    async close() {
      if (launchClosed) return;
      launchClosed = true;
      await prepared.close();
    },
  };
  try {
    if (keyed.get(key)) {
      await ownedLaunch.close();
      keyed.open(key, () => makeWindow(key));
      return;
    }
    partitionRegistry ??= new PartitionRegistryService(
      store,
      runtime.BuniumSession,
    );
    const partition = partitionRegistry.register({
      projectId: project.id,
      identityId: project.identityId,
      platform,
      isolationProfile: "default",
    });
    simulatorService ??= new HostSimulatorService(
      runtime,
      new SessionAdapter(runtime, partitionRegistry),
      (id) => {
        void simulatorService
          ?.close(id)
          .finally(() => keyed.close(`simulator:${id}`));
      },
    );
    const window = keyed.open(key, () => makeWindow(key));
    await simulatorService.open({
      bounds: guestRect(
        { width: 1100, height: 760 },
        store.getSnapshot().settings?.toolbarSide ?? "top",
      ),
      guestHost: window as unknown as GuestHost,
      launch: ownedLaunch,
      mode: project.defaultMode,
      partitionId: partition.id,
      platform,
      simulatorId,
      toolbarSide: store.getSnapshot().settings?.toolbarSide ?? "top",
      theme: store.getSnapshot().settings?.theme === "dark" ? "dark" : "light",
    });
  } catch (error) {
    await ownedLaunch.close().catch(() => undefined);
    keyed.close(key);
    throw error instanceof ProjectServiceError
      ? error
      : new ProjectServiceError("UNAVAILABLE");
  }
}

keyed.onEmpty(() => {
  if (shuttingDown) return;
  shuttingDown = true;
  void (async () => {
    await simulatorService?.closeAll().catch(() => undefined);
    await accountService.close();
    vault.close();
    store.close();
    app.shutdown();
    process.exit(0);
  })();
});

const menuLabels = nativeMenuLabels(store.getSnapshot().settings?.locale);
const applicationMenu = new bunium.Menu(studioNativeMenuItems(menuLabels));
applicationMenu.onItemClicked((id: number) => {
  if (shuttingDown) return;
  dispatchStudioMenuAction(id, {
    home: () => keyed.open("home", () => makeWindow("home")),
    createProject: () => {
      const key = `project:new:${crypto.randomUUID()}`;
      keyed.open(key, () => makeWindow(key));
    },
    users: () => keyed.open("users", () => makeWindow("users")),
    settings: () => keyed.open("settings", () => makeWindow("settings")),
    quit: () => keyed.closeAll(),
  });
});
applicationMenu.setApplicationMenu();
if (process.platform === "linux") {
  new bunium.Tray(menuLabels.trayTitle).setMenu(applicationMenu);
}

if (!isDev) {
  const distDir = join(import.meta.dirname, "..", "dist");
  if (!existsSync(distDir)) {
    throw new Error(
      `bunium: no build output at ${distDir} -- run "bun run build" first`,
    );
  }
  app.setAppRoot(distDir);
}
const updateInstallDir = resolveUpdateInstallDir();
const updateHealthStatus = await runStudioUpdateHealthCheck(
  bunium as unknown as StudioUpdateHealthRuntime,
  updateInstallDir,
);
keyed.open("home", () => makeWindow("home"));
let studioProductHealthy = false;
try {
  store.getSnapshot();
  studioProductHealthy = true;
} catch {
  studioProductHealthy = false;
}
await acknowledgeStudioUpdateHealthy(
  bunium as unknown as StudioUpdateHealthRuntime,
  updateInstallDir,
  updateHealthStatus,
  studioProductHealthy,
);
