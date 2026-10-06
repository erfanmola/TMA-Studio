import { createEffect, onCleanup } from "solid-js";
import type { WallpaperPalette } from "./wallpaper/pattern";
import {
  startWallpaperSession,
  type WallpaperSession,
} from "./wallpaper/session";
import "./wallpaper/wallpaper.scss";

export interface WallpaperCanvasProps {
  active?: boolean;
  theme?: "light" | "dark";
  instance?: string;
}

function paletteFrom(element: HTMLElement): WallpaperPalette {
  const styles = getComputedStyle(element);
  return {
    background: styles.getPropertyValue("--color-canvas").trim() || "#E5E3E7",
    mark: styles.getPropertyValue("--color-accent").trim() || "#0055B8",
  };
}

/** Local procedural wallpaper with a static first-frame and failure fallback. */
export function WallpaperCanvas(props: WallpaperCanvasProps) {
  let root!: HTMLDivElement;
  let placeholder!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let session: WallpaperSession | undefined;
  let resizeObserver: ResizeObserver | undefined;

  createEffect(
    () => props.active ?? true,
    (active) => {
      if (root) root.dataset.active = String(active);
      session?.setActive(active);
    },
  );

  createEffect(
    () => props.theme ?? "light",
    (theme) => {
      if (!root) return;
      root.dataset.theme = theme;
      if (session) {
        session.setPalette(paletteFrom(root));
        return;
      }
      const bounds = root.getBoundingClientRect();
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      session = startWallpaperSession(canvas, placeholder, {
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
        dpr,
        active: props.active ?? true,
        palette: paletteFrom(root),
        onReady(animated) {
          root.dataset.state = "ready";
          root.dataset.animated = String(animated);
        },
        onFallback() {
          root.dataset.state = "static-fallback";
          root.dataset.animated = "false";
        },
        onMotionChange(reducedMotion) {
          root.dataset.motion = reducedMotion ? "reduced" : "full";
        },
      });
      if (!session) root.dataset.state = "static-fallback";

      resizeObserver = new ResizeObserver(([entry]) => {
        if (!entry || !session) return;
        session.resize(
          Math.max(1, entry.contentRect.width),
          Math.max(1, entry.contentRect.height),
          Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
        );
      });
      resizeObserver.observe(root);
    },
  );

  onCleanup(() => {
    resizeObserver?.disconnect();
    session?.dispose();
  });

  return (
    <div
      aria-hidden="true"
      class="studio-wallpaper"
      data-active={props.active ?? true}
      data-instance={props.instance}
      data-motion="unknown"
      data-state="starting"
      data-theme={props.theme ?? "light"}
      ref={root}
    >
      <div class="studio-wallpaper__placeholder" ref={placeholder} />
      <canvas class="studio-wallpaper__canvas" ref={canvas} />
    </div>
  );
}

export default WallpaperCanvas;
