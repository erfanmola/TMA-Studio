export interface WallpaperPalette {
  background: string;
  mark: string;
}

export interface WallpaperCanvasContext {
  beginPath(): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  restore(): void;
  save(): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  stroke(): void;
  translate(x: number, y: number): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
}

/** Original deterministic ring-and-dot motif authored for TMA Studio. */
export function paintWallpaper(
  context: WallpaperCanvasContext,
  width: number,
  height: number,
  dpr: number,
  phase: number,
  palette: WallpaperPalette,
): void {
  if (width <= 0 || height <= 0 || dpr <= 0) return;
  context.save();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);

  // A sparse repeat of small rings and dots keeps the host chrome quiet.
  const spacing = 32;
  const offset = ((phase % spacing) + spacing) % spacing;
  context.strokeStyle = palette.mark;
  context.fillStyle = palette.mark;
  context.lineWidth = 0.75;
  context.globalAlpha = 0.12;
  for (let y = -spacing + offset; y <= height + spacing; y += spacing) {
    for (let x = -spacing + offset; x <= width + spacing; x += spacing) {
      const column = Math.round((x - offset) / spacing);
      const row = Math.round((y - offset) / spacing);
      const ring = (column + row) % 4 === 0;
      context.beginPath();
      context.arc(x, y, ring ? 2.1 : 0.75, 0, Math.PI * 2);
      if (ring) context.stroke();
      else context.fillRect(x - 0.375, y - 0.375, 0.75, 0.75);
    }
  }
  context.restore();
}
