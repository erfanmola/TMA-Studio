import { createSignal, onCleanup } from "solid-js";
import {
  type LaunchMode,
  PLATFORMS,
  type Platform,
} from "../contracts/entities";
import type { ToolbarSide } from "../contracts/simulator";
import { CaptureBridgeService } from "../features/simulator/capture-bridge-service";
import { TMAView } from "../features/simulator/TMAView";
import { dictionaries, LOCALES, type Locale } from "../i18n/locale";

function oneOf<T extends string>(
  value: string | null,
  values: readonly T[],
  fallback: T,
): T {
  return values.find((entry) => entry === value) ?? fallback;
}

export default function StudioSimulatorScene() {
  const params = new URLSearchParams(window.location.search);
  const locale = oneOf(params.get("locale"), LOCALES, "en" as Locale);
  const [mode, setMode] = createSignal(
    oneOf(
      params.get("mode"),
      ["overlay", "expanded", "fullscreen"] as const,
      "overlay" as LaunchMode,
    ),
  );
  const [platform] = createSignal(
    oneOf(params.get("platform"), PLATFORMS, "android" as Platform),
  );
  const [side, setSide] = createSignal(
    oneOf(
      params.get("side"),
      ["top", "bottom", "left", "right"] as const,
      "top" as ToolbarSide,
    ),
  );
  const [theme, setTheme] = createSignal(
    oneOf(
      params.get("theme"),
      ["light", "dark"] as const,
      "light" as "light" | "dark",
    ),
  );
  let requestSequence = 0;
  const send = (command: unknown) => {
    window.__bunium?.send(
      "simulator.request",
      JSON.stringify({
        requestId: `sim-${++requestSequence}`,
        command,
      }),
    );
  };
  const copy = dictionaries[locale].simulator;
  const [captureNotice, setCaptureNotice] = createSignal(
    copy.captureStatus.ready,
  );
  const [locationNotice, setLocationNotice] = createSignal("");
  const receiveLocationReply = (payload: unknown) => {
    let value = payload;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return;
      }
    }
    if (value && typeof value === "object" && "ok" in value)
      setLocationNotice(
        value.ok === true ? copy.location.applied : copy.location.failed,
      );
  };
  window.__bunium?.on("simulator.location.reply", receiveLocationReply);
  onCleanup(() =>
    window.__bunium?.off?.("simulator.location.reply", receiveLocationReply),
  );
  let capture: CaptureBridgeService | undefined;
  try {
    capture = new CaptureBridgeService();
  } catch {
    setCaptureNotice(copy.captureStatus.unavailable);
  }
  onCleanup(() => capture?.close());

  return (
    <TMAView
      labels={copy}
      locale={locale}
      mode={mode()}
      nativeAndroidChrome={platform() === "android"}
      onBoundsChange={(bounds) => send({ method: "set-bounds", bounds })}
      onCapture={(input) => {
        if (!capture) return;
        setCaptureNotice(copy.captureStatus.saving);
        void capture.request(input).then((reply) => {
          setCaptureNotice(
            reply.ok
              ? copy.captureStatus.saved.replace("{file}", reply.fileName)
              : reply.error === "CANCELED"
                ? copy.captureStatus.canceled
                : reply.error === "UNAVAILABLE"
                  ? copy.captureStatus.unavailable
                  : copy.captureStatus.failed,
          );
        });
      }}
      onModeChange={(next) => {
        setMode(next);
        send({ method: "set-mode", mode: next });
      }}
      onSideChange={(next) => {
        setSide(next);
        send({ method: "set-side", side: next });
      }}
      onThemeChange={(next) => {
        setTheme(next);
        send({ method: "set-theme", theme: next });
      }}
      onSetLocation={(location) =>
        send({ method: "set-location", ...location })
      }
      onClearLocation={() => send({ method: "clear-location" })}
      platform={platform()}
      locationStatus={locationNotice()}
      side={side()}
      theme={theme()}
      status={
        <span class="tma-view__capture-status" aria-live="polite" role="status">
          {captureNotice()}
        </span>
      }
    />
  );
}
