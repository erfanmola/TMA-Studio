import {
  paintWallpaper,
  type WallpaperCanvasContext,
  type WallpaperPalette,
} from "./pattern";

export interface WallpaperClock {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

/** Owns exactly one optional timer; hidden or reduced-motion instances have none. */
export class WallpaperPainter {
  private active: boolean;
  private reducedMotion: boolean;
  private disposed = false;
  private frame: number | undefined;
  private phase = 0;

  constructor(
    private readonly context: WallpaperCanvasContext,
    private width: number,
    private height: number,
    private dpr: number,
    private palette: WallpaperPalette,
    active: boolean,
    reducedMotion: boolean,
    private readonly clock: WallpaperClock,
  ) {
    this.active = active;
    this.reducedMotion = reducedMotion;
    this.draw();
    this.schedule();
  }

  resize(width: number, height: number, dpr: number): void {
    if (this.disposed) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.draw();
  }

  setPalette(palette: WallpaperPalette): void {
    if (this.disposed) return;
    this.palette = palette;
    this.draw();
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) {
      this.draw();
      this.schedule();
    } else {
      this.unschedule();
    }
  }

  setReducedMotion(reducedMotion: boolean): void {
    if (this.disposed || this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;
    if (reducedMotion) {
      this.unschedule();
      this.phase = 0;
      this.draw();
    } else {
      this.schedule();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unschedule();
  }

  private draw(): void {
    paintWallpaper(
      this.context,
      this.width,
      this.height,
      this.dpr,
      this.phase,
      this.palette,
    );
  }

  private schedule(): void {
    if (
      this.disposed ||
      !this.active ||
      this.reducedMotion ||
      this.frame !== undefined
    )
      return;
    this.frame = this.clock.request(() => {
      this.frame = undefined;
      if (this.disposed || !this.active || this.reducedMotion) return;
      this.phase = (this.phase + 0.35) % 32;
      this.draw();
      this.schedule();
    });
  }

  private unschedule(): void {
    if (this.frame === undefined) return;
    this.clock.cancel(this.frame);
    this.frame = undefined;
  }
}
