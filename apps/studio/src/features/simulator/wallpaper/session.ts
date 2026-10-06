import type { WallpaperPalette } from "./pattern";

type WorkerMessage =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      dpr: number;
      palette: WallpaperPalette;
      active: boolean;
      reducedMotion: boolean;
    }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "palette"; palette: WallpaperPalette }
  | { type: "active"; active: boolean }
  | { type: "reduced-motion"; reducedMotion: boolean };
type WorkerReply =
  | { type: "ready"; animated: boolean }
  | { type: "state"; animated: boolean }
  | { type: "error" };

export interface WallpaperWorkerPort {
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: WorkerReply }) => void) | null;
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface WallpaperEnvironment {
  createWorker(): WallpaperWorkerPort;
  isVisible(): boolean;
  prefersReducedMotion(): boolean;
  watchVisibility(listener: () => void): () => void;
  watchReducedMotion(listener: () => void): () => void;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface WallpaperSessionOptions {
  width: number;
  height: number;
  dpr: number;
  active: boolean;
  palette: WallpaperPalette;
  onReady(animated: boolean): void;
  onFallback(): void;
  onMotionChange(reducedMotion: boolean): void;
}

export interface WallpaperSession {
  setActive(active: boolean): void;
  setPalette(palette: WallpaperPalette): void;
  resize(width: number, height: number, dpr: number): void;
  dispose(): void;
}

const START_TIMEOUT_MS = 1500;

/** Transfers one canvas once; failure always leaves its static placeholder visible. */
export function startWallpaperSession(
  canvas: HTMLCanvasElement,
  placeholder: HTMLElement,
  options: WallpaperSessionOptions,
  environment: WallpaperEnvironment = browserEnvironment(),
): WallpaperSession | undefined {
  canvas.hidden = true;
  placeholder.hidden = false;
  if (typeof canvas.transferControlToOffscreen !== "function") {
    options.onFallback();
    return undefined;
  }

  let worker: WallpaperWorkerPort;
  try {
    worker = environment.createWorker();
  } catch {
    options.onFallback();
    return undefined;
  }
  let transferred: OffscreenCanvas;
  try {
    transferred = canvas.transferControlToOffscreen();
  } catch {
    worker.terminate();
    options.onFallback();
    return undefined;
  }

  let disposed = false;
  let ready = false;
  let active = options.active;
  let reducedMotion = environment.prefersReducedMotion();
  options.onMotionChange(reducedMotion);
  let palette = options.palette;
  let width = options.width;
  let height = options.height;
  let dpr = options.dpr;
  let timeout: unknown;
  let stopVisibility: () => void = () => undefined;
  let stopMotion: () => void = () => undefined;

  const clearStartTimeout = () => {
    if (timeout === undefined) return;
    environment.clearTimeout(timeout);
    timeout = undefined;
  };
  const failToStatic = () => {
    if (disposed) return;
    disposed = true;
    clearStartTimeout();
    stopVisibility();
    stopMotion();
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    canvas.hidden = true;
    placeholder.hidden = false;
    options.onFallback();
  };
  const syncActive = () => {
    if (!ready || disposed) return;
    worker.postMessage({
      type: "active",
      active: active && environment.isVisible(),
    });
  };
  const syncMotion = () => {
    if (disposed) return;
    reducedMotion = environment.prefersReducedMotion();
    options.onMotionChange(reducedMotion);
    if (ready) worker.postMessage({ type: "reduced-motion", reducedMotion });
  };
  stopVisibility = environment.watchVisibility(syncActive);
  stopMotion = environment.watchReducedMotion(syncMotion);

  worker.onmessage = ({ data }) => {
    if (disposed) return;
    if (data.type === "error") {
      failToStatic();
      return;
    }
    if (data.type === "state") {
      options.onReady(data.animated);
      return;
    }
    if (data.type !== "ready") return;
    ready = true;
    clearStartTimeout();
    canvas.hidden = false;
    placeholder.hidden = true;
    options.onReady(data.animated);
    worker.postMessage({ type: "resize", width, height, dpr });
    worker.postMessage({ type: "palette", palette });
    worker.postMessage({
      type: "active",
      active: active && environment.isVisible(),
    });
    worker.postMessage({ type: "reduced-motion", reducedMotion });
  };
  worker.onerror = failToStatic;
  timeout = environment.setTimeout(failToStatic, START_TIMEOUT_MS);

  try {
    worker.postMessage(
      {
        type: "init",
        canvas: transferred,
        width,
        height,
        dpr,
        palette,
        active: active && environment.isVisible(),
        reducedMotion,
      },
      [transferred],
    );
  } catch {
    failToStatic();
  }

  return {
    setActive(nextActive) {
      active = nextActive;
      syncActive();
    },
    setPalette(nextPalette) {
      palette = nextPalette;
      if (ready && !disposed) worker.postMessage({ type: "palette", palette });
    },
    resize(nextWidth, nextHeight, nextDpr) {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      dpr = Math.min(2, Math.max(1, nextDpr));
      if (ready && !disposed)
        worker.postMessage({ type: "resize", width, height, dpr });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearStartTimeout();
      stopVisibility();
      stopMotion();
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      canvas.hidden = true;
      placeholder.hidden = false;
    },
  };
}

function browserEnvironment(): WallpaperEnvironment {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  return {
    createWorker: () =>
      new Worker(
        new URL("../../../workers/wallpaper.worker.ts", import.meta.url),
        { type: "module", name: "tma-wallpaper" },
      ) as unknown as WallpaperWorkerPort,
    isVisible: () => document.visibilityState === "visible",
    prefersReducedMotion: () => media.matches,
    watchVisibility(listener) {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
    watchReducedMotion(listener) {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
}
