import WallpaperCanvas from "../features/simulator/WallpaperCanvas";

/** Development-only fixture scene for worker transfer and per-instance review. */
export default function WallpaperReviewScene() {
  return (
    <main class="wallpaper-review">
      <section class="wallpaper-review__instance">
        <WallpaperCanvas instance="light" theme="light" />
      </section>
      <section class="wallpaper-review__instance">
        <WallpaperCanvas instance="dark" theme="dark" />
      </section>
    </main>
  );
}
