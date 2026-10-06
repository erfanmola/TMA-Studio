import { createSignal, For } from "solid-js";
import {
  dictionaries,
  directionFor,
  formatMessage,
  type Locale,
} from "../i18n/locale";
import { ComboBox, Menu, SegmentedControl, Select, Switch, Tabs } from "../ui";

const stateScenes = [
  { theme: "light", locale: "en" },
  { theme: "dark", locale: "en" },
  { theme: "light", locale: "fa" },
  { theme: "dark", locale: "fa" },
] as const;

const tabIcon = () => (
  <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.6" />
  </svg>
);

function ControlStateScene(props: { locale: Locale; theme: "light" | "dark" }) {
  const copy = dictionaries[props.locale].controls;
  const id = (name: string) => `${name}-${props.theme}-${props.locale}`;
  const [tab, setTab] = createSignal("appearance");
  const [scheme, setScheme] = createSignal("system");
  const [profile, setProfile] = createSignal<string | null>("android-pixel");
  const [mode, setMode] = createSignal("expanded");
  const [position, setPosition] = createSignal("top");
  const [onTop, setOnTop] = createSignal(false);
  const [action, setAction] = createSignal<string | null>(null);

  const profiles = [
    { label: "Android · Pixel 9", value: "android-pixel" },
    { label: "Android · Galaxy S25", value: "android-galaxy" },
    { label: copy.profiles.custom, value: "android-custom" },
    { label: "iOS · iPhone 16", value: "ios-16" },
    { label: "iOS · iPhone SE", value: "ios-se" },
    { disabled: true, label: copy.profiles.ipados, value: "ipados" },
    { label: "Telegram Desktop", value: "tdesktop" },
    { label: "macOS", value: "macos" },
    { label: "Web A", value: "web-a" },
    { label: "Web K", value: "web-k" },
  ];
  const tabs = (
    ["general", "appearance", "simulators", "captures", "storage"] as const
  ).map((value) => ({
    icon: tabIcon(),
    label: copy.tabs[value],
    value,
  }));
  const schemes = [
    { label: copy.schemes.system, value: "system" },
    { label: copy.schemes.light, value: "light" },
    { label: copy.schemes.dark, value: "dark" },
    { disabled: true, label: copy.schemes.contrast, value: "contrast" },
  ];
  const modes = [
    { label: copy.modes.compact, value: "compact" },
    { label: copy.modes.expanded, value: "expanded" },
    {
      disabled: true,
      label: copy.modes.fullscreen,
      value: "fullscreen",
    },
  ];
  const positions = (["top", "bottom", "left", "right"] as const).map(
    (value) => ({
      label: copy.positions[value],
      value,
    }),
  );
  const menuItems = [
    { label: copy.menu.reload, value: "reload" },
    { label: copy.menu.reset, value: "reset" },
    { disabled: true, label: copy.menu.rotate, value: "rotate" },
    { label: copy.menu.copy, value: "copy" },
    { danger: true, label: copy.menu.delete, value: "delete" },
  ];
  const actionLabel = () =>
    menuItems.find((item) => item.value === action())?.label ?? copy.noAction;

  return (
    <section
      class="primitive-state-scene control-state-scene"
      data-theme={props.theme}
      dir={directionFor(props.locale)}
      lang={props.locale}
    >
      <h2>{copy.sceneTitle}</h2>
      <Tabs
        aria-label={copy.tabsLabel}
        id={id("tabs")}
        onValueChange={setTab}
        panel={() => <p class="control-state-scene__panel">{copy.panelBody}</p>}
        tabs={tabs}
        value={tab()}
      />
      <div class="primitive-state-scene__fields">
        <Select
          description={copy.selectDescription}
          id={id("scheme")}
          label={copy.selectLabel}
          onValueChange={setScheme}
          options={schemes}
          value={scheme()}
        />
        <ComboBox
          description={copy.comboDescription}
          emptyLabel={copy.comboEmpty}
          id={id("profile")}
          label={copy.comboLabel}
          onValueChange={setProfile}
          options={profiles}
          value={profile()}
        />
        <div class="control-state-scene__group">
          <span class="studio-field-row__label" id={id("mode-label")}>
            {copy.modeLabel}
          </span>
          <SegmentedControl
            aria-labelledby={id("mode-label")}
            id={id("mode")}
            onValueChange={setMode}
            options={modes}
            value={mode()}
          />
        </div>
        <div class="control-state-scene__group">
          <span class="studio-field-row__label" id={id("position-label")}>
            {copy.positionLabel}
          </span>
          <SegmentedControl
            aria-labelledby={id("position-label")}
            id={id("position")}
            onValueChange={setPosition}
            options={positions}
            value={position()}
          />
        </div>
        <Switch
          checked={onTop()}
          description={copy.switchDescription}
          id={id("on-top")}
          label={copy.switchLabel}
          onCheckedChange={setOnTop}
        />
        <Switch
          checked
          disabled
          id={id("acceleration")}
          label={copy.switchDisabledLabel}
          onCheckedChange={() => undefined}
        />
        <div class="control-state-scene__menu">
          <Menu id={id("actions")} items={menuItems} onAction={setAction}>
            {copy.menuLabel}
          </Menu>
          <output aria-live="polite" class="control-state-scene__status">
            {formatMessage(copy.lastAction, { action: actionLabel() })}
          </output>
        </div>
      </div>
    </section>
  );
}

export default function ControlScenes() {
  return (
    <main class="primitive-state-board">
      <For each={stateScenes}>
        {(scene) => (
          <ControlStateScene locale={scene.locale} theme={scene.theme} />
        )}
      </For>
    </main>
  );
}
