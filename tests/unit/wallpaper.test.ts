import { describe, expect, test } from "bun:test";
import {
  type WallpaperClock,
  WallpaperPainter,
} from "../../apps/studio/src/features/simulator/wallpaper/painter";
import {
  paintWallpaper,
  type WallpaperCanvasContext,
  type WallpaperPalette,
} from "../../apps/studio/src/features/simulator/wallpaper/pattern";
import {
  startWallpaperSession,
  type WallpaperEnvironment,
  type WallpaperWorkerPort,
} from "../../apps/studio/src/features/simulator/wallpaper/session";

const palette: WallpaperPalette = { background: "#eeeeee", mark: "#2255aa" };

class FakeContext implements WallpaperCanvasContext {
  operations: unknown[][] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  globalAlpha = 1;
  lineWidth = 1;
  beginPath() {
    this.operations.push(["begin"]);
  }
  clearRect(...values: number[]) {
    this.operations.push(["clear", ...values]);
  }
  arc(...values: number[]) {
    this.operations.push(["arc", ...values]);
  }
  fillRect(...values: number[]) {
    this.operations.push(["fillRect", this.fillStyle, ...values]);
  }
  restore() {
    this.operations.push(["restore"]);
  }
  save() {
    this.operations.push(["save"]);
  }
  setTransform(...values: number[]) {
    this.operations.push(["transform", ...values]);
  }
  stroke() {
    this.operations.push(["stroke", this.strokeStyle]);
  }
  translate(...values: number[]) {
    this.operations.push(["translate", ...values]);
  }
}

class FakeClock implements WallpaperClock {
  private next = 1;
  private callbacks = new Map<number, () => void>();
  request(callback: () => void): number {
    const id = this.next++;
    this.callbacks.set(id, callback);
    return id;
  }
  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }
  get pending(): number {
    return this.callbacks.size;
  }
  tick(): void {
    const entry = this.callbacks.entries().next().value as
      | [number, () => void]
      | undefined;
    if (!entry) return;
    this.callbacks.delete(entry[0]);
    entry[1]();
  }
}

class FakeWorker implements WallpaperWorkerPort {
  onerror: ((event: unknown) => void) | null = null;
  onmessage:
    | ((event: {
        data:
          | { type: "ready"; animated: boolean }
          | { type: "state"; animated: boolean }
          | { type: "error" };
      }) => void)
    | null = null;
  messages: Array<{ type: string; transfer?: Transferable[] }> = [];
  terminated = false;
  postMessage(message: { type: string }, transfer?: Transferable[]): void {
    this.messages.push({ type: message.type, transfer });
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(
    data:
      | { type: "ready"; animated: boolean }
      | { type: "state"; animated: boolean }
      | { type: "error" },
  ): void {
    this.onmessage?.({ data });
  }
}

class FakeEnvironment implements WallpaperEnvironment {
  worker = new FakeWorker();
  visible = true;
  reducedMotion = false;
  visibilityListeners = new Set<() => void>();
  motionListeners = new Set<() => void>();
  timers = new Map<number, () => void>();
  private nextTimer = 1;
  createWorker(): WallpaperWorkerPort {
    return this.worker;
  }
  isVisible(): boolean {
    return this.visible;
  }
  prefersReducedMotion(): boolean {
    return this.reducedMotion;
  }
  watchVisibility(listener: () => void): () => void {
    this.visibilityListeners.add(listener);
    return () => this.visibilityListeners.delete(listener);
  }
  watchReducedMotion(listener: () => void): () => void {
    this.motionListeners.add(listener);
    return () => this.motionListeners.delete(listener);
  }
  setTimeout(callback: () => void): number {
    const id = this.nextTimer++;
    this.timers.set(id, callback);
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  expire(): void {
    const callbacks = [...this.timers.values()];
    this.timers.clear();
    callbacks.forEach((callback) => {
      callback();
    });
  }
  changeVisibility(visible: boolean): void {
    this.visible = visible;
    this.visibilityListeners.forEach((listener) => {
      listener();
    });
  }
  changeMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.motionListeners.forEach((listener) => {
      listener();
    });
  }
}

function fixture() {
  const offscreen = {} as OffscreenCanvas;
  const canvas = {
    hidden: false,
    transfers: 0,
    transferControlToOffscreen() {
      this.transfers += 1;
      return offscreen;
    },
  } as unknown as HTMLCanvasElement & { transfers: number };
  const placeholder = { hidden: true } as HTMLElement;
  const environment = new FakeEnvironment();
  const states: Array<{ animated: boolean } | "fallback"> = [];
  const session = startWallpaperSession(
    canvas,
    placeholder,
    {
      width: 200,
      height: 100,
      dpr: 2,
      active: true,
      palette,
      onReady(animated) {
        states.push({ animated });
      },
      onFallback() {
        states.push("fallback");
      },
      onMotionChange() {},
    },
    environment,
  );
  return { canvas, environment, placeholder, session, states };
}

describe("local wallpaper worker", () => {
  test("paints a deterministic original pattern with bounded sparse geometry", () => {
    const first = new FakeContext();
    const second = new FakeContext();
    paintWallpaper(first, 160, 80, 1, 0, palette);
    paintWallpaper(second, 160, 80, 1, 0, palette);
    expect(first.operations).toEqual(second.operations);
    expect(first.operations[0]?.[0]).toBe("save");
    expect(first.operations.at(-1)?.[0]).toBe("restore");
    expect(
      first.operations.filter(([op]) => op === "arc").length,
    ).toBeLessThanOrEqual(40);
    const moved = new FakeContext();
    paintWallpaper(moved, 160, 80, 1, 1, palette);
    expect(moved.operations).not.toEqual(first.operations);
  });

  test("pauses all scheduled painting for hidden, reduced-motion, and disposed instances", () => {
    const firstClock = new FakeClock();
    const secondClock = new FakeClock();
    const firstContext = new FakeContext();
    const secondContext = new FakeContext();
    const first = new WallpaperPainter(
      firstContext,
      160,
      80,
      1,
      palette,
      true,
      false,
      firstClock,
    );
    const second = new WallpaperPainter(
      secondContext,
      160,
      80,
      1,
      palette,
      true,
      true,
      secondClock,
    );
    expect(firstClock.pending).toBe(1);
    expect(secondClock.pending).toBe(0);
    firstClock.tick();
    expect(firstClock.pending).toBe(1);
    first.setActive(false);
    expect(firstClock.pending).toBe(0);
    first.setActive(true);
    expect(firstClock.pending).toBe(1);
    first.setReducedMotion(true);
    expect(firstClock.pending).toBe(0);
    first.setReducedMotion(false);
    expect(firstClock.pending).toBe(1);
    first.dispose();
    second.dispose();
    expect(firstClock.pending).toBe(0);
    expect(secondClock.pending).toBe(0);
  });

  test("transfers one canvas, keeps the placeholder until ready, pauses while hidden, then disposes", () => {
    const { canvas, environment, placeholder, session, states } = fixture();
    expect(canvas.transfers).toBe(1);
    expect(environment.worker.messages[0]?.type).toBe("init");
    expect(environment.worker.messages[0]?.transfer).toHaveLength(1);
    expect(canvas.hidden).toBe(true);
    expect(placeholder.hidden).toBe(false);
    environment.worker.emit({ type: "ready", animated: true });
    expect(canvas.hidden).toBe(false);
    expect(placeholder.hidden).toBe(true);
    expect(states).toContainEqual({ animated: true });
    environment.changeVisibility(false);
    expect(environment.worker.messages.at(-1)?.type).toBe("active");
    environment.changeMotion(true);
    expect(environment.worker.messages.at(-1)?.type).toBe("reduced-motion");
    session?.dispose();
    expect(environment.worker.terminated).toBe(true);
    expect(environment.visibilityListeners.size).toBe(0);
    expect(environment.motionListeners.size).toBe(0);
    expect(canvas.hidden).toBe(true);
    expect(placeholder.hidden).toBe(false);
  });

  test("falls back to the static pattern and terminates a worker that misses the startup deadline", () => {
    const { canvas, environment, placeholder, session, states } = fixture();
    environment.expire();
    expect(states).toEqual(["fallback"]);
    expect(environment.worker.terminated).toBe(true);
    expect(canvas.hidden).toBe(true);
    expect(placeholder.hidden).toBe(false);
    session?.dispose();
    expect(environment.visibilityListeners.size).toBe(0);
  });

  test("keeps the original placeholder and terminates when canvas transfer fails", () => {
    const environment = new FakeEnvironment();
    const canvas = {
      hidden: true,
      transferControlToOffscreen() {
        throw new Error("OffscreenCanvas transfer is unavailable");
      },
    } as unknown as HTMLCanvasElement;
    const placeholder = { hidden: true } as HTMLElement;
    let fallback = false;
    const session = startWallpaperSession(
      canvas,
      placeholder,
      {
        width: 200,
        height: 100,
        dpr: 1,
        active: true,
        palette,
        onReady() {},
        onFallback() {
          fallback = true;
        },
        onMotionChange() {},
      },
      environment,
    );
    expect(session).toBeUndefined();
    expect(fallback).toBe(true);
    expect(environment.worker.terminated).toBe(true);
    expect(canvas.hidden).toBe(true);
    expect(placeholder.hidden).toBe(false);
  });
});
