import { For, onCleanup } from "solid-js";
import { SettingsController } from "../features/settings/controller";
import { MemorySettingsService } from "../features/settings/memory-service";
import { MemoryStorageService } from "../features/settings/memory-storage-service";
import { SettingsWindow } from "../features/settings/SettingsWindow";
import type { Locale } from "../i18n/locale";

const scenes = [
  { locale: "en", theme: "light" },
  { locale: "en", theme: "dark" },
  { locale: "fa", theme: "light" },
  { locale: "fa", theme: "dark" },
] as const;

function SettingsScene(props: { locale: Locale; theme: "light" | "dark" }) {
  const key = `settings-${props.theme}-${props.locale}`;
  const service = new MemorySettingsService({
    locale: props.locale,
    theme: props.theme === "dark" ? "dark" : "light",
  });
  const storage = new MemoryStorageService();
  const controller = new SettingsController(service);
  void controller.load();
  onCleanup(() => controller.close());
  return (
    <section class="settings-scene" data-scene={key}>
      <SettingsWindow
        controller={controller}
        id={key}
        locale={props.locale}
        platform="macos"
        storage={storage}
        theme={props.theme}
      />
    </section>
  );
}

export default function SettingsScenes() {
  return (
    <main class="settings-scene-board">
      <For each={scenes}>
        {(scene) => <SettingsScene locale={scene.locale} theme={scene.theme} />}
      </For>
    </main>
  );
}
