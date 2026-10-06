import { createSignal, onCleanup } from "solid-js";
import type { RecentProject } from "../contracts/home-service";
import { type HomeProject, HomeWindow } from "../features/home/HomeWindow";
import { BuniumHomeBridgeService } from "../features/home/home-bridge-service";
import { BuniumWindowBridgeService } from "../features/home/window-bridge-service";
import {
  dictionaries,
  directionFor,
  LOCALES,
  type Locale,
} from "../i18n/locale";
import type { WindowPlatform } from "../ui";

function sceneLocale(): Locale {
  const locale = new URLSearchParams(window.location.search).get("locale");
  return locale && LOCALES.includes(locale as Locale)
    ? (locale as Locale)
    : "en";
}

function scenePlatform(): WindowPlatform {
  const platform = new URLSearchParams(window.location.search).get("platform");
  return platform === "windows" || platform === "linux" ? platform : "macos";
}

function homeProject(record: RecentProject): HomeProject {
  if (record.status === "missing")
    return {
      id: record.id,
      name: record.id,
      avatarColorIndex: 0,
      targetLabel: "",
      targetStatus: "missing",
    };
  let targetLabel = record.url;
  try {
    targetLabel = new URL(record.url).host;
  } catch {}
  return {
    id: record.id,
    name: record.name,
    avatarColorIndex: record.avatarColorIndex,
    targetLabel,
    targetStatus: "available",
  };
}

export default function StudioHomeScene() {
  const locale = sceneLocale();
  const platform = scenePlatform();
  const theme =
    new URLSearchParams(window.location.search).get("theme") === "dark"
      ? "dark"
      : "light";
  const copy = dictionaries[locale].home;
  const home = new BuniumHomeBridgeService();
  const windows = new BuniumWindowBridgeService();
  const [projects, setProjects] = createSignal<HomeProject[]>([]);
  const [recentStatus, setRecentStatus] = createSignal<
    "loading" | "error" | "ready"
  >("loading");
  const [actionError, setActionError] = createSignal(false);
  let closed = false;

  const load = async () => {
    try {
      const recent = await home.listRecent();
      if (closed) return;
      setProjects(recent.map(homeProject));
      setRecentStatus("ready");
    } catch {
      if (closed) return;
      setRecentStatus("error");
    }
  };
  const reload = () => {
    setRecentStatus("loading");
    void load();
  };
  const open = (action: Parameters<BuniumWindowBridgeService["open"]>[0]) => {
    setActionError(false);
    void windows.open(action).catch(() => setActionError(true));
  };
  const removeRecent = async (projectId: string) => {
    setActionError(false);
    try {
      await home.removeRecent(projectId);
      await load();
    } catch {
      setActionError(true);
    }
  };
  const reloadOnFocus = reload;
  const onVisibility = () => {
    if (document.visibilityState === "visible") reload();
  };

  void load();
  window.addEventListener("focus", reloadOnFocus);
  document.addEventListener("visibilitychange", onVisibility);
  window.__bunium?.on("home.changed", reloadOnFocus);
  onCleanup(() => {
    closed = true;
    window.removeEventListener("focus", reloadOnFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    window.__bunium?.off?.("home.changed", reloadOnFocus);
    home.close();
    windows.close();
  });

  return (
    <main dir={directionFor(locale)} lang={locale}>
      <HomeWindow
        actionError={actionError()}
        copy={copy}
        id={`home-${locale}-${theme}`}
        locale={locale}
        logoSrc="/studio-icon.png"
        onCreateProject={() => open({ kind: "create-project" })}
        onManageUsers={() => open({ kind: "users" })}
        onOpenProject={(projectId) => open({ kind: "open-project", projectId })}
        onRemoveRecent={(projectId) => void removeRecent(projectId)}
        onRetry={reload}
        onSettings={() => open({ kind: "settings" })}
        platform={platform}
        projects={projects()}
        recentStatus={recentStatus()}
        theme={theme}
      />
    </main>
  );
}
