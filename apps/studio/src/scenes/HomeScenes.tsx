import { createSignal } from "solid-js";
import { type HomeProject, HomeWindow } from "../features/home/HomeWindow";
import {
  dictionaries,
  directionFor,
  LOCALES,
  type Locale,
} from "../i18n/locale";

const sampleProjects: HomeProject[] = [
  {
    id: "orbit-store",
    name: "Orbit Store",
    avatarColorIndex: 0,
    targetLabel: "localhost:3000",
    targetStatus: "available",
  },
  {
    id: "pocket-notes",
    name: "Pocket Notes",
    avatarColorIndex: 4,
    targetLabel: "localhost:5173",
    targetStatus: "available",
  },
  {
    id: "atlas-wallet",
    name: "Atlas Wallet",
    avatarColorIndex: 2,
    targetLabel: "",
    targetStatus: "missing",
  },
];

export default function HomeScenes() {
  const params = new URLSearchParams(window.location.search);
  const localeValue = params.get("locale");
  const locale =
    localeValue && LOCALES.includes(localeValue as Locale)
      ? (localeValue as Locale)
      : "en";
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const state = params.get("state");
  const [projects, setProjects] = createSignal(
    state === "empty" || state === "loading" || state === "error"
      ? []
      : sampleProjects,
  );
  const [recentStatus, setRecentStatus] = createSignal<
    "loading" | "error" | "ready"
  >(state === "loading" ? "loading" : state === "error" ? "error" : "ready");
  const [action, setAction] = createSignal("none");
  const copy = dictionaries[locale].home;

  return (
    <main
      data-home-action={action()}
      data-scene={`home-${state ?? "default"}-${theme}-${locale}`}
      dir={directionFor(locale)}
      lang={locale}
    >
      <HomeWindow
        copy={copy}
        id={`home-${locale}-${theme}`}
        locale={locale}
        logoSrc="/studio-icon.png"
        onCreateProject={() => setAction("create-project")}
        onManageUsers={() => setAction("users")}
        onOpenProject={(id) => setAction(`project:${id}`)}
        onRemoveRecent={(id) => {
          setProjects((current) =>
            current.filter((project) => project.id !== id),
          );
          setAction(`remove:${id}`);
        }}
        onRetry={() => setRecentStatus("ready")}
        onSettings={() => setAction("settings")}
        platform="macos"
        projects={projects()}
        recentStatus={recentStatus()}
        theme={theme}
        updateAvailable={params.get("update") === "available"}
        releaseNotesHref={
          params.get("update") === "available"
            ? "https://example.invalid/release-notes"
            : undefined
        }
      />
    </main>
  );
}
