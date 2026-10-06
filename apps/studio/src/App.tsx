import AndroidChromeOverlayScene from "./scenes/AndroidChromeOverlayScene";
import AndroidProfileReviewScene from "./scenes/AndroidProfileReviewScene";
import CatalogScenes from "./scenes/CatalogScenes";
import ControlScenes from "./scenes/ControlScenes";
import HomeScenes from "./scenes/HomeScenes";
import IOSProfileReviewScene from "./scenes/IOSProfileReviewScene";
import LoadingScenes from "./scenes/LoadingScenes";
import PrimitiveScenes from "./scenes/PrimitiveScenes";
import ProjectScenes from "./scenes/ProjectScenes";
import SettingsScenes from "./scenes/SettingsScenes";
import StudioHomeScene from "./scenes/StudioHomeScene";
import StudioProjectScene from "./scenes/StudioProjectScene";
import StudioSettingsScene from "./scenes/StudioSettingsScene";
import StudioSimulatorScene from "./scenes/StudioSimulatorScene";
import StudioUsersScene from "./scenes/StudioUsersScene";
import UserScenes from "./scenes/UserScenes";
import WallpaperReviewScene from "./scenes/WallpaperReviewScene";

export default function App() {
  const scene = new URLSearchParams(window.location.search).get("scene");
  if (scene === "android-chrome-overlay" && window.__bunium)
    return <AndroidChromeOverlayScene />;
  if (scene === "home")
    return window.__bunium ? <StudioHomeScene /> : <HomeScenes />;
  if (scene === "users")
    return window.__bunium ? <StudioUsersScene /> : <UserScenes />;
  if (scene === "project")
    return window.__bunium ? <StudioProjectScene /> : <ProjectScenes />;
  if (scene === "settings")
    return window.__bunium ? <StudioSettingsScene /> : <SettingsScenes />;
  if (scene === "simulator" && window.__bunium) return <StudioSimulatorScene />;
  if (import.meta.env.DEV) {
    if (scene === "ios-profile-review") return <IOSProfileReviewScene />;
    if (scene === "android-profile-review")
      return <AndroidProfileReviewScene />;
    if (scene === "wallpaper-review") return <WallpaperReviewScene />;
    if (scene === "primitives") return <PrimitiveScenes />;
    if (scene === "controls") return <ControlScenes />;
    if (scene === "catalog") return <CatalogScenes />;
    if (scene === null && !window.__bunium) return <LoadingScenes />;
  }
  return window.__bunium ? <StudioHomeScene /> : <LoadingScenes />;
}
