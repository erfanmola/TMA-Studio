import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, onCleanup } from "solid-js";
import type { CaptureScope } from "../../contracts/capture";
import type { LaunchMode, Platform } from "../../contracts/entities";
import { guestRect, type ToolbarSide } from "../../contracts/simulator";
import { directionFor, type Locale } from "../../i18n/locale";
import AndroidChrome from "../../profiles/android/AndroidChrome";
import IOSChrome, { type IOSChromeLabels } from "../../profiles/ios/IOSChrome";
import WallpaperCanvas from "./WallpaperCanvas";
import "./simulator.scss";

export interface TMAViewProps {
  labels: {
    mode: string;
    modes: Record<LaunchMode, string>;
    position: string;
    sides: Record<ToolbarSide, string>;
    theme: string;
    themes: Record<"light" | "dark", string>;
    toolbar: string;
    guestSurface: string;
    android: import("../../profiles/android/AndroidChrome").AndroidChromeLabels;
    ios: IOSChromeLabels;
    screenshot: string;
    location: {
      title: string;
      latitude: string;
      longitude: string;
      accuracy: string;
      apply: string;
      clear: string;
      applied: string;
      failed: string;
    };
    captureScope: string;
    captureScopes: Record<CaptureScope, string>;
    captureStatus: {
      ready: string;
      saving: string;
      saved: string;
      canceled: string;
      failed: string;
      unavailable: string;
    };
  };
  locale: Locale;
  mode: LaunchMode;
  platform: Platform;
  side: ToolbarSide;
  theme: "light" | "dark";
  active?: boolean;
  /** Android status/navigation are separate trusted native surfaces in the desktop app. */
  nativeAndroidChrome?: boolean;
  onBoundsChange(bounds: ReturnType<typeof guestRect>): void;
  onModeChange(mode: LaunchMode): void;
  onSideChange(side: ToolbarSide): void;
  onThemeChange(theme: "light" | "dark"): void;
  onSetLocation?(location: {
    latitude: number;
    longitude: number;
    accuracy: number;
  }): void;
  onClearLocation?(): void;
  locationStatus?: string;
  /** Guest content is a native surface and is deliberately not rendered in the DOM. */
  status?: JSX.Element;
  onCapture?(input: {
    scope: CaptureScope;
    host: { width: number; height: number };
    guest: ReturnType<typeof guestRect>;
    side: ToolbarSide;
  }): void;
}

const sides: ToolbarSide[] = ["top", "bottom", "left", "right"];
const modes: LaunchMode[] = ["overlay", "expanded", "fullscreen"];

/** Host chrome for one simulator. Native guest bounds are updated without remounting the guest. */
export function TMAView(props: TMAViewProps) {
  let host!: HTMLElement;
  let last = "";
  let currentBounds = guestRect({ width: 1, height: 1 });
  const [scope, setScope] = createSignal<CaptureScope>("viewport");
  let activeSide: ToolbarSide = "top";
  const [latitude, setLatitude] = createSignal("37.7749");
  const [longitude, setLongitude] = createSignal("-122.4194");
  const [accuracy, setAccuracy] = createSignal("12");
  const [locationOpen, setLocationOpen] = createSignal(false);
  const updateBounds = (side: ToolbarSide) => {
    const rect = host.getBoundingClientRect();
    const extent = locationOpen()
      ? side === "left" || side === "right"
        ? 240
        : 280
      : 0;
    const bounds = guestRect(
      { width: rect.width, height: rect.height },
      side,
      undefined,
      undefined,
      extent,
    );
    currentBounds = bounds;
    const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
    if (key !== last) {
      last = key;
      props.onBoundsChange(bounds);
    }
  };
  const observer = new ResizeObserver(() => updateBounds(activeSide));
  onCleanup(() => observer.disconnect());
  const attachHost = (element: HTMLElement) => {
    host = element;
    observer.observe(host);
    updateBounds(activeSide);
  };
  createEffect(
    () => props.side,
    (side) => {
      activeSide = side;
      if (host) updateBounds(side);
    },
  );

  return (
    <main
      class="tma-view"
      data-side={props.side}
      data-platform={props.platform}
      data-theme={props.theme}
      dir={directionFor(props.locale)}
      lang={props.locale}
      ref={attachHost}
    >
      <WallpaperCanvas active={props.active ?? true} theme={props.theme} />
      {props.platform === "android" && !props.nativeAndroidChrome ? (
        <AndroidChrome
          labels={props.labels.android}
          mode={props.mode}
          theme={props.theme}
        />
      ) : null}
      {props.platform === "ios" ? (
        <IOSChrome
          labels={props.labels.ios}
          mode={props.mode}
          theme={props.theme}
        />
      ) : null}
      <div
        class="tma-view__rail"
        role="toolbar"
        aria-label={props.labels.toolbar}
      >
        <fieldset class="tma-view__group">
          <legend class="tma-view__legend">{props.labels.position}</legend>
          <For each={sides}>
            {(side) => (
              <button
                aria-pressed={props.side === side ? "true" : "false"}
                onClick={() => {
                  props.onSideChange(side);
                  requestAnimationFrame(() => updateBounds(activeSide));
                }}
                type="button"
              >
                {props.labels.sides[side]}
              </button>
            )}
          </For>
        </fieldset>
        <span class="tma-view__divider" aria-hidden="true" />
        <fieldset class="tma-view__group">
          <legend class="tma-view__legend">{props.labels.mode}</legend>
          <For each={modes}>
            {(mode) => (
              <button
                aria-pressed={props.mode === mode ? "true" : "false"}
                onClick={() => props.onModeChange(mode)}
                type="button"
              >
                {props.labels.modes[mode]}
              </button>
            )}
          </For>
        </fieldset>
        <button
          class="tma-view__theme"
          aria-label={props.labels.theme}
          onClick={() =>
            props.onThemeChange(props.theme === "light" ? "dark" : "light")
          }
          type="button"
        >
          {props.labels.themes[props.theme]}
        </button>
        <details
          class="tma-view__location"
          onToggle={(event) => {
            setLocationOpen(event.currentTarget.open);
            requestAnimationFrame(() => updateBounds(activeSide));
          }}
        >
          <summary>{props.labels.location.title}</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              props.onSetLocation?.({
                latitude: Number(latitude()),
                longitude: Number(longitude()),
                accuracy: Number(accuracy()),
              });
            }}
          >
            <label>
              {props.labels.location.latitude}
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                required
                value={latitude()}
                onInput={(event) => setLatitude(event.currentTarget.value)}
              />
            </label>
            <label>
              {props.labels.location.longitude}
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                required
                value={longitude()}
                onInput={(event) => setLongitude(event.currentTarget.value)}
              />
            </label>
            <label>
              {props.labels.location.accuracy}
              <input
                type="number"
                min="0"
                max="100000"
                step="any"
                required
                value={accuracy()}
                onInput={(event) => setAccuracy(event.currentTarget.value)}
              />
            </label>
            <button type="submit">{props.labels.location.apply}</button>
            <button type="button" onClick={() => props.onClearLocation?.()}>
              {props.labels.location.clear}
            </button>
          </form>
        </details>
        <fieldset class="tma-view__group tma-view__capture-scope">
          <legend class="tma-view__legend">{props.labels.captureScope}</legend>
          <For each={["viewport", "telegram", "window"] as const}>
            {(value) => (
              <button
                aria-pressed={scope() === value ? "true" : "false"}
                onClick={() => setScope(value)}
                type="button"
              >
                {props.labels.captureScopes[value]}
              </button>
            )}
          </For>
        </fieldset>
        <button
          aria-label={props.labels.screenshot}
          onClick={() => {
            const rect = host.getBoundingClientRect();
            props.onCapture?.({
              scope: scope(),
              side: props.side,
              host: {
                width: Math.max(1, Math.floor(rect.width)),
                height: Math.max(1, Math.floor(rect.height)),
              },
              guest: currentBounds,
            });
          }}
          type="button"
        >
          {props.labels.screenshot}
        </button>
      </div>
      <section
        class="tma-view__guest-region"
        aria-label={props.labels.guestSurface}
      >
        {props.status}
        {props.locationStatus ? (
          <span
            class="tma-view__location-status"
            role="status"
            aria-live="polite"
          >
            {props.locationStatus}
          </span>
        ) : null}
      </section>
    </main>
  );
}
