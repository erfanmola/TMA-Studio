import { createSignal, onCleanup } from "solid-js";
import type { LaunchMode } from "../contracts/entities";
import { dictionaries, LOCALES, type Locale } from "../i18n/locale";
import AndroidChrome, {
  type AndroidChromeAction,
  type AndroidChromeRegion,
  type AndroidChromeSurface,
} from "../profiles/android/AndroidChrome";
import "../features/simulator/simulator.scss";

type ChromeState = {
  mode: LaunchMode;
  surface: AndroidChromeSurface;
  theme: "light" | "dark";
};

function oneOf<T extends string>(
  value: string | null,
  values: readonly T[],
  fallback: T,
): T {
  return values.find((entry) => entry === value) ?? fallback;
}

function parseState(value: unknown): ChromeState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (
    Object.keys(state).some(
      (key) => !["locale", "mode", "side", "surface", "theme"].includes(key),
    ) ||
    !["overlay", "expanded", "fullscreen"].includes(String(state.mode)) ||
    !["mini-app", "telegram", "tasks"].includes(String(state.surface)) ||
    (state.theme !== "light" && state.theme !== "dark")
  ) {
    return null;
  }
  return {
    mode: state.mode as LaunchMode,
    surface: state.surface as AndroidChromeSurface,
    theme: state.theme,
  };
}

const actionMethod: Record<AndroidChromeAction, string> = {
  back: "android-back",
  home: "android-home",
  resume: "android-resume",
  tasks: "android-tasks",
};

export default function AndroidChromeOverlayScene() {
  const params = new URLSearchParams(window.location.search);
  const locale = oneOf(params.get("locale"), LOCALES, "en" as Locale);
  const region = oneOf(
    params.get("region"),
    ["status", "navigation", "background"] as const,
    "status" as AndroidChromeRegion,
  );
  const initial = parseState({
    mode: params.get("mode"),
    surface: params.get("surface") ?? "mini-app",
    theme: params.get("theme"),
  }) ?? {
    mode: "overlay" as const,
    surface: "mini-app" as const,
    theme: "light" as const,
  };
  const [state, setState] = createSignal(initial);
  let requestSequence = 0;
  const receiveState = (payload: unknown) => {
    const next = parseState(payload);
    if (next) setState(next);
  };
  const onAction = (action: AndroidChromeAction) => {
    window.__bunium?.send(
      "simulator.request",
      JSON.stringify({
        requestId: `android-${region}-${++requestSequence}`,
        command: { method: actionMethod[action] },
      }),
    );
  };
  window.__bunium?.on("simulator.chrome.state", receiveState);
  window.__bunium?.send("simulator.chrome.ready", "{}");
  onCleanup(() => {
    window.__bunium?.off?.("simulator.chrome.state", receiveState);
  });
  const labels = dictionaries[locale].simulator.android;

  return (
    <main class="android-chrome-overlay-root" data-region={region}>
      <AndroidChrome
        labels={labels}
        mode={state().mode}
        onAction={onAction}
        region={region}
        surface={state().surface}
        theme={state().theme}
      />
    </main>
  );
}
