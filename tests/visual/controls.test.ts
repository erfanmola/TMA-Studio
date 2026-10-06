import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const components = "../../packages/ui/src/components/";
const select = read(`${components}Select.tsx`);
const combobox = read(`${components}ComboBox.tsx`);
const menu = read(`${components}Menu.tsx`);
const switchSource = read(`${components}Switch.tsx`);
const segmented = read(`${components}SegmentedControl.tsx`);
const tabs = read(`${components}Tabs.tsx`);
const styles = read("../../packages/ui/src/styles/_controls.scss");
const scene = read("../../apps/studio/src/scenes/ControlScenes.tsx");
const app = read("../../apps/studio/src/App.tsx");

describe("selection and navigation controls", () => {
  test("select stays native and never uses menu roles", () => {
    expect(select).toContain("<select");
    expect(select).toContain("<option");
    expect(select).not.toContain('role="menu');
    expect(select).not.toContain('role="listbox"');
  });

  test("combobox follows the APG listbox popup contract", () => {
    for (const attribute of [
      'role="combobox"',
      'aria-autocomplete="list"',
      "aria-activedescendant",
      "aria-controls",
      "aria-expanded",
      'role="listbox"',
      'role="option"',
      "aria-selected",
    ]) {
      expect(combobox).toContain(attribute);
    }
    expect(combobox).toContain("reduceComboBox");
  });

  test("menu button exposes menu semantics and returns focus", () => {
    for (const attribute of [
      'aria-haspopup="menu"',
      "aria-expanded",
      'role="menu"',
      'role="menuitem"',
      "trigger?.focus()",
    ]) {
      expect(menu).toContain(attribute);
    }
  });

  test("switch, segmented control and tabs use accessible roles", () => {
    expect(switchSource).toContain('role="switch"');
    expect(switchSource).toContain("aria-checked");
    expect(segmented).toContain('role="radiogroup"');
    expect(segmented).toContain('role="radio"');
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain('role="tabpanel"');
    expect(segmented).toContain("directionOf(group)");
    expect(tabs).toContain("directionOf(list)");
  });

  test("popups are fixed, bounded and styled for every state", () => {
    expect(styles).toContain("position: fixed");
    expect(styles).toContain("overflow-y: auto");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain(":disabled");
    expect(styles).toContain('[aria-disabled="true"]');
    expect(styles).toContain('[dir="rtl"] .studio-switch');
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  test("review scene covers both themes and directions in development only", () => {
    expect(scene).toContain('{ theme: "light", locale: "en" }');
    expect(scene).toContain('{ theme: "dark", locale: "fa" }');
    expect(scene).toContain("disabled: true");
    expect(scene).toContain("copy.profiles.custom");
    expect(app).toContain('scene === "controls"');
    expect(app).toContain("import.meta.env.DEV");
  });
});
