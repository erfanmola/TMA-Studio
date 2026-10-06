import {
  type WallpaperClock,
  WallpaperPainter,
} from "../features/simulator/wallpaper/painter";
import type {
  WallpaperCanvasContext,
  WallpaperPalette,
} from "../features/simulator/wallpaper/pattern";

type InitMessage = {
  type: "init";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  palette: WallpaperPalette;
  active: boolean;
  reducedMotion: boolean;
};
type WallpaperMessage =
  | InitMessage
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "palette"; palette: WallpaperPalette }
  | { type: "active"; active: boolean }
  | { type: "reduced-motion"; reducedMotion: boolean }
  | { type: "dispose" };
type WallpaperWorkerScope = {
  onmessage: ((event: MessageEvent<WallpaperMessage>) => void) | null;
  postMessage(
    message:
      | { type: "ready"; animated: boolean }
      | { type: "state"; animated: boolean }
      | { type: "error" },
  ): void;
  close(): void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(handle: number): void;
};

const scope = self as unknown as WallpaperWorkerScope;
const clock: WallpaperClock = {
  request: (callback) => scope.setTimeout(callback, 83),
  cancel: (handle) => scope.clearTimeout(handle),
};
let painter: WallpaperPainter | undefined;
let canvas: OffscreenCanvas | undefined;
let active = false;
let reducedMotion = true;

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    if (painter) return;
    const context = message.canvas.getContext("2d", { alpha: false });
    if (!context) {
      scope.postMessage({ type: "error" });
      scope.close();
      return;
    }
    canvas = message.canvas;
    const width = Math.max(1, Math.ceil(message.width));
    const height = Math.max(1, Math.ceil(message.height));
    message.canvas.width = Math.max(1, Math.ceil(width * message.dpr));
    message.canvas.height = Math.max(1, Math.ceil(height * message.dpr));
    active = message.active;
    reducedMotion = message.reducedMotion;
    painter = new WallpaperPainter(
      context as WallpaperCanvasContext,
      width,
      height,
      message.dpr,
      message.palette,
      active,
      reducedMotion,
      clock,
    );
    scope.postMessage({ type: "ready", animated: active && !reducedMotion });
    return;
  }
  if (!painter || !canvas) return;
  switch (message.type) {
    case "resize":
      canvas.width = Math.max(1, Math.ceil(message.width * message.dpr));
      canvas.height = Math.max(1, Math.ceil(message.height * message.dpr));
      painter.resize(message.width, message.height, message.dpr);
      break;
    case "palette":
      painter.setPalette(message.palette);
      break;
    case "active":
      active = message.active;
      painter.setActive(active);
      scope.postMessage({ type: "state", animated: active && !reducedMotion });
      break;
    case "reduced-motion":
      reducedMotion = message.reducedMotion;
      painter.setReducedMotion(reducedMotion);
      scope.postMessage({ type: "state", animated: active && !reducedMotion });
      break;
    case "dispose":
      painter.dispose();
      painter = undefined;
      canvas = undefined;
      scope.close();
      break;
  }
};
