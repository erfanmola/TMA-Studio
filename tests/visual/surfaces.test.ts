import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const components = "../../packages/ui/src/components/";
const dialog = read(`${components}Dialog.tsx`);
const avatar = read(`${components}Avatar.tsx`);
const avatarColor = read(`${components}avatar-color.ts`);
const sidebar = read(`${components}SidebarList.tsx`);
const storage = read(`${components}StorageBar.tsx`);
const toast = read(`${components}Toast.tsx`);
const shell = read(`${components}WindowShell.tsx`);
const styles = read("../../packages/ui/src/styles/_surfaces.scss");
const tokens = read("../../packages/ui/src/styles/_tokens.scss");
const scene = read("../../apps/studio/src/scenes/CatalogScenes.tsx");

describe("surface primitives", () => {
  test("dialogs are native modals that restore focus and start destructive focus on Cancel", () => {
    expect(dialog).toContain("<dialog");
    expect(dialog).toContain("showModal()");
    expect(dialog).toContain("returnFocus");
    expect(dialog).toContain("autofocus={props.destructive}");
    expect(dialog).toContain(
      "dismissOnBackdrop={props.destructive ? false : props.dismissOnBackdrop}",
    );
    expect(dialog).toContain("aria-labelledby");
  });

  test("avatars use BigInt peer colors, persisted project index and safe image fallback", () => {
    expect(avatarColor).toContain("BigInt(id) % BigInt(AVATAR_COLOR_COUNT)");
    expect(avatarColor).toContain("Intl.Segmenter");
    expect(avatar).toContain("projectColorIndex(props.colorIndex)");
    expect(avatar).toContain("onError");
    expect(avatar).toContain('referrerpolicy="no-referrer"');
    for (let index = 0; index < 7; index += 1) {
      expect(tokens).toContain(`--avatar-${index}-top:`);
      expect(tokens).toContain(`--avatar-${index}-bottom:`);
    }
  });

  test("sidebar, storage and toasts expose accessible semantics", () => {
    expect(sidebar).toContain("<nav");
    expect(sidebar).toContain("aria-current");
    expect(storage).toContain("<table");
    expect(storage).toContain('scope="col"');
    expect(storage).toContain('aria-hidden="true" class="studio-storage__bar"');
    expect(storage).toContain("unknownSize");
    expect(toast).toContain(
      'role={toast.tone === "error" ? "alert" : "status"}',
    );
    expect(toast).toContain("pause(toast.id)");
  });

  test("window shell keeps drag regions free of controls", () => {
    expect(shell).toContain('data-drag-region="true"');
    expect(shell).toContain("dragRegionConflicts");
    expect(styles).toContain("-webkit-app-region: drag");
    expect(styles.match(/-webkit-app-region: drag/g)?.length).toBe(1);
    expect(styles).toContain('[data-platform="macos"]');
    expect(styles).toContain('[data-platform="windows"]');
  });

  test("review scene covers themes, directions, scale and image fallback", () => {
    expect(scene).toContain('{ theme: "dark", locale: "fa" }');
    expect(scene).toContain('params.get("scale")');
    expect(scene).toContain("9007199254740993");
    expect(scene).toContain("-1001234567890");
    expect(scene).toContain("brokenImage");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });
});
