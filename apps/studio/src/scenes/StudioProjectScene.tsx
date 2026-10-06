import { onCleanup } from "solid-js";
import { BuniumWindowBridgeService } from "../features/home/window-bridge-service";
import { ProjectController } from "../features/project/controller";
import { ProjectWindow } from "../features/project/ProjectWindow";
import { BuniumProjectBridgeService } from "../features/project/project-bridge-service";
import type { Locale } from "../i18n/locale";
import type { WindowPlatform } from "../ui";

export default function StudioProjectScene() {
  const params = new URLSearchParams(window.location.search);
  const rawLocale = params.get("locale");
  const locale = (
    ["en", "ru", "de", "fa", "ar"].includes(rawLocale ?? "") ? rawLocale : "en"
  ) as Locale;
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const platformValue = params.get("platform");
  const platform: WindowPlatform =
    platformValue === "windows" || platformValue === "linux"
      ? platformValue
      : "macos";
  const projectId = params.get("projectId") ?? undefined;
  const windowKey = params.get("windowKey") ?? "project:create";
  const service = new BuniumProjectBridgeService();
  const windows = new BuniumWindowBridgeService();
  const controller = new ProjectController({
    avatarColorIndex: 0,
    onClose: () => windows.closeWindow(windowKey),
    onSaved: (project) => {
      if (!projectId) {
        window.history.replaceState(
          null,
          "",
          `?scene=project&projectId=${encodeURIComponent(project.id)}&windowKey=${encodeURIComponent(windowKey)}&locale=${locale}&theme=${theme}&platform=${platform}`,
        );
      }
    },
    projectId,
    service,
  });
  void controller.load();
  onCleanup(() => {
    service.close();
    windows.close();
  });
  return (
    <main
      data-scene={`project-${theme}-${locale}`}
      data-theme={theme}
      dir={locale === "fa" || locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
    >
      <ProjectWindow
        controller={controller}
        id={`project-${projectId ?? "create"}`}
        locale={locale}
        platform={platform}
        theme={theme}
      />
    </main>
  );
}
