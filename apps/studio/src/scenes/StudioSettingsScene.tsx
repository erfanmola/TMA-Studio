import { onCleanup } from "solid-js";
import { SettingsController } from "../features/settings/controller";
import { SettingsWindow } from "../features/settings/SettingsWindow";
import { BuniumSettingsBridgeService } from "../features/settings/settings-bridge-service";
import { BuniumStorageBridgeService } from "../features/settings/storage-bridge-service";
import type { Locale } from "../i18n/locale";
import type { WindowPlatform } from "../ui";
import StudioSettingsPlaceholder from "./StudioSettingsPlaceholder";

export default function StudioSettingsScene() {
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
  const service = new BuniumSettingsBridgeService();
  const storage = new BuniumStorageBridgeService();
  const controller = new SettingsController(service);
  void controller.load();
  onCleanup(() => {
    controller.close();
    service.close();
    storage.close();
  });
  return (
    <main
      data-scene={`settings-${theme}-${locale}`}
      data-theme={theme}
      dir={locale === "fa" || locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
    >
      <SettingsWindow
        controller={controller}
        id="settings"
        locale={locale}
        platform={platform}
        storage={storage}
        theme={theme}
      />
      <StudioSettingsPlaceholder />
    </main>
  );
}
