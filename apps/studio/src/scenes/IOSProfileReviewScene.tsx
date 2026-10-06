import { createSignal, For } from "solid-js";
import type { LaunchMode } from "../contracts/entities";
import { dictionaries } from "../i18n/locale";
import IOSChrome from "../profiles/ios/IOSChrome";

/** Development-only portrait review; it does not emulate WKWebView or iOS. */
export default function IOSProfileReviewScene() {
  const [mode, setMode] = createSignal<LaunchMode>("overlay");
  const [theme, setTheme] = createSignal<"light" | "dark">("light");
  const labels = dictionaries.en.simulator;
  const modes: LaunchMode[] = ["overlay", "expanded", "fullscreen"];

  return (
    <main class="ios-profile-review" data-theme={theme()}>
      <div class="ios-profile-review__controls">
        <label>
          {labels.mode}
          <select
            aria-label={labels.mode}
            value={mode()}
            onChange={(event) =>
              setMode(event.currentTarget.value as LaunchMode)
            }
          >
            <For each={modes}>
              {(entry) => <option value={entry}>{labels.modes[entry]}</option>}
            </For>
          </select>
        </label>
        <button
          type="button"
          aria-label={labels.theme}
          onClick={() => setTheme(theme() === "light" ? "dark" : "light")}
        >
          {labels.themes[theme()]}
        </button>
      </div>
      <section class="ios-profile-review__device">
        <IOSChrome labels={labels.ios} mode={mode()} theme={theme()} />
        <div class="ios-profile-review__guest">
          <span>THE EVERYDAY COLLECTION</span>
          <strong>{labels.ios.miniApp}</strong>
          <p>{labels.ios.engine}</p>
        </div>
      </section>
    </main>
  );
}
