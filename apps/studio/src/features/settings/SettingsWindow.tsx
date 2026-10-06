import {
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch as SwitchCase,
  untrack,
} from "solid-js";
import {
  DEVICE_PRESETS,
  guestViewportForDevice,
} from "../../contracts/devices";
import {
  dictionaries,
  directionFor,
  LOCALES,
  type Locale,
} from "../../i18n/locale";
import {
  Button,
  Dialog,
  SegmentedControl,
  Select,
  Switch,
  Tabs,
  type WindowPlatform,
  WindowShell,
} from "../../ui";
import type { SettingsController } from "./controller";
import { StorageSection } from "./StorageSection";
import type { StoragePort } from "./storage-bridge-service";
import "./settings.scss";

type Section = "general" | "appearance" | "simulators" | "captures" | "storage";

export type SettingsWindowProps = {
  controller: SettingsController;
  id: string;
  locale: Locale;
  platform: WindowPlatform;
  storage?: StoragePort;
  theme?: "light" | "dark";
};

const UI_SCALES = ["1", "1.125", "1.25", "1.5", "1.75", "2"] as const;

export function SettingsWindow(props: SettingsWindowProps) {
  const copy = untrack(() => dictionaries[props.locale].settings);
  const chrome = untrack(() => dictionaries[props.locale].controls);
  const [state, setState] = createSignal(
    untrack(() => props.controller.current),
  );
  const unsubscribe = untrack(() => props.controller.subscribe(setState));
  onCleanup(unsubscribe);
  const [section, setSection] = createSignal<Section>("general");
  const id = (name: string) => `${props.id}-${name}`;
  const draft = () => state().draft;
  const dirty = () => {
    const snapshot = state();
    if (!snapshot.settings || !snapshot.draft) return false;
    return JSON.stringify(snapshot.settings) !== JSON.stringify(snapshot.draft);
  };

  const tabs = (
    ["general", "appearance", "simulators", "captures", "storage"] as const
  ).map((value) => ({ label: chrome.tabs[value], value }));

  const deviceOptions = DEVICE_PRESETS.map((device) => ({
    label: `${device.id} · ${device.viewport.width}×${device.viewport.height} @${device.targetDpr}x`,
    value: device.id,
  }));

  const saveErrorText = () => {
    const code = state().saveError;
    if (!code) return undefined;
    if (code === "CONFLICT") return copy.conflictNotice;
    if (code === "INVALID_INPUT") return copy.invalidInput;
    return copy.saveFailed;
  };

  const selectedDevice = () =>
    DEVICE_PRESETS.find((d) => d.id === draft()?.defaultDeviceId) ?? null;
  const viewportNote = () => {
    const device = selectedDevice();
    if (!device) return copy.unknownDevice;
    const viewport = guestViewportForDevice(device);
    return copy.viewportNote
      .replace("{width}", String(viewport.width))
      .replace("{height}", String(viewport.height))
      .replace("{dpr}", String(device.targetDpr));
  };

  return (
    <div
      class="settings-window"
      data-theme={props.theme}
      dir={directionFor(props.locale)}
      lang={props.locale}
    >
      <WindowShell
        footer={
          <Show when={state().phase === "ready" || state().phase === "saving"}>
            <Show when={saveErrorText()}>
              {(message) => (
                <p class="settings-window__save-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>
            <Show when={state().settings && draft()}>
              <span class="settings-window__badge" role="status">
                {dirty() ? copy.unsavedBadge : copy.savedBadge}
              </span>
            </Show>
            <Button
              disabled={state().phase === "saving" || !dirty()}
              id={id("save")}
              loading={state().phase === "saving"}
              onClick={() => void props.controller.save()}
              variant="primary"
            >
              {state().phase === "saving" ? copy.saving : copy.save}
            </Button>
          </Show>
        }
        id={id("window")}
        platform={props.platform}
        title={copy.windowTitle}
      >
        <SwitchCase>
          <Match when={state().phase === "loading"}>
            <p class="settings-window__status" role="status">
              {copy.loading}
            </p>
          </Match>
          <Match when={state().phase === "load-failed"}>
            <div class="settings-window__status" role="alert">
              <p>{copy.loadFailed}</p>
              <Button onClick={() => void props.controller.load()}>
                {copy.retry}
              </Button>
            </div>
          </Match>
          <Match when={state().draft !== null}>
            <Tabs
              aria-label={chrome.tabsLabel}
              id={id("tabs")}
              onValueChange={(value) => setSection(value as Section)}
              panel={() => <div />}
              tabs={tabs}
              value={section()}
            />
            <Show when={section() === "general"}>
              <div class="settings-window__section">
                <Select
                  description={copy.localeDescription}
                  id={id("locale")}
                  label={copy.localeLabel}
                  onValueChange={(value) =>
                    props.controller.edit({ locale: value as Locale })
                  }
                  options={LOCALES.map((value) => ({
                    label: dictionaries[value as Locale].locale.name,
                    value,
                  }))}
                  value={draft()?.locale ?? "en"}
                />
                <Switch
                  checked={draft()?.alwaysOnTop ?? false}
                  description={copy.alwaysOnTopDescription}
                  id={id("always-on-top")}
                  label={copy.alwaysOnTopLabel}
                  onCheckedChange={(checked) =>
                    props.controller.edit({ alwaysOnTop: checked })
                  }
                />
                <Switch
                  checked={draft()?.restoreWindows ?? true}
                  description={copy.restoreDescription}
                  id={id("restore")}
                  label={copy.restoreLabel}
                  onCheckedChange={(checked) =>
                    props.controller.edit({ restoreWindows: checked })
                  }
                />
                <Switch
                  checked={draft()?.closeToTray ?? false}
                  description={copy.trayDescription}
                  id={id("tray")}
                  label={copy.trayLabel}
                  onCheckedChange={(checked) =>
                    props.controller.edit({ closeToTray: checked })
                  }
                />
                <div class="settings-window__row">
                  <span
                    class="studio-field-row__label"
                    id={id("channel-label")}
                  >
                    {copy.updateLabel}
                  </span>
                  <SegmentedControl
                    aria-labelledby={id("channel-label")}
                    id={id("channel")}
                    onValueChange={(value) =>
                      props.controller.editUpdate({
                        channel: value as "stable" | "preview",
                      })
                    }
                    options={[
                      { label: copy.channels.stable, value: "stable" },
                      { label: copy.channels.preview, value: "preview" },
                    ]}
                    value={draft()?.update.channel ?? "stable"}
                  />
                </div>
                <Switch
                  checked={draft()?.update.checkAutomatically ?? true}
                  id={id("update-check")}
                  label={copy.updateCheck}
                  onCheckedChange={(checked) =>
                    props.controller.editUpdate({ checkAutomatically: checked })
                  }
                />
                <Switch
                  checked={draft()?.update.downloadAutomatically ?? false}
                  id={id("update-download")}
                  label={copy.updateDownload}
                  onCheckedChange={(checked) =>
                    props.controller.editUpdate({
                      downloadAutomatically: checked,
                    })
                  }
                />
              </div>
            </Show>
            <Show when={section() === "appearance"}>
              <div class="settings-window__section">
                <div class="settings-window__row">
                  <span class="studio-field-row__label" id={id("theme-label")}>
                    {copy.themeLabel}
                  </span>
                  <SegmentedControl
                    aria-labelledby={id("theme-label")}
                    id={id("theme")}
                    onValueChange={(value) =>
                      props.controller.edit({
                        theme: value as "system" | "light" | "dark",
                      })
                    }
                    options={[
                      { label: chrome.schemes.system, value: "system" },
                      { label: chrome.schemes.light, value: "light" },
                      { label: chrome.schemes.dark, value: "dark" },
                    ]}
                    value={draft()?.theme ?? "system"}
                  />
                </div>
                <Select
                  description={copy.scaleDescription}
                  id={id("scale")}
                  label={copy.scaleLabel}
                  onValueChange={(value) =>
                    props.controller.edit({
                      uiScale: Number(value) as
                        | 1
                        | 1.125
                        | 1.25
                        | 1.5
                        | 1.75
                        | 2,
                    })
                  }
                  options={UI_SCALES.map((value) => ({
                    label: `${Number(value) * 100}%`,
                    value,
                  }))}
                  value={String(draft()?.uiScale ?? 1)}
                />
                <Switch
                  checked={draft()?.hapticFrameShake ?? false}
                  description={copy.hapticDescription}
                  id={id("haptic")}
                  label={copy.hapticLabel}
                  onCheckedChange={(checked) =>
                    props.controller.edit({ hapticFrameShake: checked })
                  }
                />
              </div>
            </Show>
            <Show when={section() === "simulators"}>
              <div class="settings-window__section">
                <Select
                  description={copy.deviceDescription}
                  id={id("device")}
                  label={copy.deviceLabel}
                  onValueChange={(value) =>
                    props.controller.edit({ defaultDeviceId: value })
                  }
                  options={deviceOptions}
                  value={draft()?.defaultDeviceId ?? ""}
                />
                <p class="settings-window__note">{viewportNote()}</p>
                <p class="settings-window__note">{copy.dprNote}</p>
                <div class="settings-window__row">
                  <span
                    class="studio-field-row__label"
                    id={id("toolbar-label")}
                  >
                    {copy.toolbarLabel}
                  </span>
                  <SegmentedControl
                    aria-labelledby={id("toolbar-label")}
                    id={id("toolbar")}
                    onValueChange={(value) =>
                      props.controller.edit({
                        toolbarSide: value as
                          | "top"
                          | "bottom"
                          | "left"
                          | "right",
                      })
                    }
                    options={(["top", "bottom", "left", "right"] as const).map(
                      (value) => ({
                        label: chrome.positions[value],
                        value,
                      }),
                    )}
                    value={draft()?.toolbarSide ?? "top"}
                  />
                </div>
              </div>
            </Show>
            <Show when={section() === "captures"}>
              <div class="settings-window__section">
                <p class="settings-window__note" role="note">
                  {copy.capturesUnavailable}
                </p>
              </div>
            </Show>
            <Show when={section() === "storage"}>
              <Show
                fallback={
                  <div class="settings-window__section">
                    <p class="settings-window__note" role="note">
                      {copy.storageUnavailable}
                    </p>
                  </div>
                }
                when={props.storage}
              >
                {(service) => (
                  <StorageSection
                    id={id("storage")}
                    locale={props.locale}
                    service={service()}
                  />
                )}
              </Show>
            </Show>
          </Match>
        </SwitchCase>
      </WindowShell>
      <Dialog
        description={copy.conflictDescription}
        footer={
          <>
            <Button onClick={() => props.controller.resolveConflict("reload")}>
              {copy.conflictReload}
            </Button>
            <Button
              autofocus
              onClick={() => void props.controller.resolveConflict("overwrite")}
              variant="primary"
            >
              {copy.conflictOverwrite}
            </Button>
          </>
        }
        id={id("conflict")}
        onCancel={() => props.controller.resolveConflict("reload")}
        open={state().conflict !== null}
        title={copy.conflictTitle}
      />
    </div>
  );
}
