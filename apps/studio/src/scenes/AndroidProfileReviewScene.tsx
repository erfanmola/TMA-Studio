import { createSignal } from "solid-js";
import { TMAView } from "../features/simulator/TMAView";
import { dictionaries } from "../i18n/locale";

/** Development-only Android profile approximation for browser review. */
export default function AndroidProfileReviewScene() {
  const [mode, setMode] = createSignal<"overlay" | "expanded" | "fullscreen">(
    "overlay",
  );
  const [side, setSide] = createSignal<"top" | "bottom" | "left" | "right">(
    "top",
  );
  const [theme, setTheme] = createSignal<"light" | "dark">("light");
  const labels = dictionaries.en.simulator;
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        padding: "2rem",
        "box-sizing": "border-box",
      }}
    >
      <TMAView
        labels={labels}
        locale="en"
        mode={mode()}
        platform="android"
        side={side()}
        theme={theme()}
        onBoundsChange={() => undefined}
        onModeChange={setMode}
        onSideChange={setSide}
        onThemeChange={setTheme}
        status={
          <div style={{ padding: "5rem", "text-align": "center" }}>
            <strong>{labels.android.miniApp}</strong>
          </div>
        }
      />
    </main>
  );
}
