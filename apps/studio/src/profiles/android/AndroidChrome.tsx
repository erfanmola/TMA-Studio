import { createSignal, Show } from "solid-js";
import type { LaunchMode } from "../../contracts/entities";

export interface AndroidChromeLabels {
  statusBar: string;
  back: string;
  home: string;
  tasks: string;
  resume: string;
  background: string;
  simulated: string;
  taskSwitcher: string;
  telegramSurface: string;
  miniApp: string;
}

export type AndroidChromeSurface = "mini-app" | "telegram" | "tasks";
export type AndroidChromeRegion =
  | "all"
  | "status"
  | "navigation"
  | "background";
export type AndroidChromeAction = "back" | "home" | "tasks" | "resume";

/** Browser-rendered Android system chrome approximation; it does not emulate Android OS. */
export default function AndroidChrome(props: {
  labels: AndroidChromeLabels;
  mode: LaunchMode;
  theme: "light" | "dark";
  region?: AndroidChromeRegion;
  surface?: AndroidChromeSurface;
  onAction?: (action: AndroidChromeAction) => void;
}) {
  const [localSurface, setLocalSurface] =
    createSignal<AndroidChromeSurface>("mini-app");
  const [clock] = createSignal("9:41");
  const region = () => props.region ?? "all";
  const surface = () => props.surface ?? localSurface();
  const action = (value: AndroidChromeAction) => {
    if (props.onAction) {
      props.onAction(value);
      return;
    }
    setLocalSurface(
      value === "tasks"
        ? "tasks"
        : value === "resume"
          ? "mini-app"
          : "telegram",
    );
  };

  return (
    <div
      class="android-chrome"
      data-theme={props.theme}
      data-surface={surface()}
      data-region={region()}
    >
      <Show when={region() === "all" || region() === "status"}>
        <div
          class="android-chrome__status"
          role="status"
          aria-label={props.labels.statusBar}
        >
          <span>{clock()}</span>
          <span aria-hidden="true">● ▮▮▮ ▰</span>
        </div>
        <span class="android-chrome__mode" aria-hidden="true">
          {props.mode}
        </span>
      </Show>
      <Show
        when={
          (region() === "all" || region() === "background") &&
          surface() !== "mini-app"
        }
      >
        <section class="android-chrome__background" aria-live="polite">
          <strong>
            {surface() === "tasks"
              ? props.labels.taskSwitcher
              : props.labels.telegramSurface}
          </strong>
          <p>{props.labels.simulated}</p>
          <button type="button" onClick={() => action("resume")}>
            {props.labels.resume}
          </button>
        </section>
      </Show>
      <Show when={region() === "all" || region() === "navigation"}>
        <nav
          class="android-chrome__navigation"
          aria-label={props.labels.background}
        >
          <button
            type="button"
            aria-label={props.labels.back}
            onClick={() => action("back")}
          >
            <span class="android-chrome__back" />
          </button>
          <button
            type="button"
            aria-label={props.labels.home}
            onClick={() => action("home")}
          >
            <span class="android-chrome__home" />
          </button>
          <button
            type="button"
            aria-label={props.labels.tasks}
            onClick={() => action("tasks")}
          >
            <span class="android-chrome__tasks" />
          </button>
        </nav>
      </Show>
    </div>
  );
}
