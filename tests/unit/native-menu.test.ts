import { describe, expect, test } from "bun:test";
import {
  dispatchStudioMenuAction,
  nativeMenuLabels,
  STUDIO_MENU_ACTION,
  studioNativeMenuItems,
} from "../../apps/studio/bunium/services/native-menu";

describe("Studio native menu", () => {
  test("builds localized commands for every supported locale", () => {
    for (const locale of ["en", "ru", "de", "fa", "ar"]) {
      const items = studioNativeMenuItems(nativeMenuLabels(locale));
      expect(items).toHaveLength(1);
      expect(items[0]?.submenu?.map((item) => item.type ?? item.id)).toEqual([
        STUDIO_MENU_ACTION.home,
        STUDIO_MENU_ACTION.createProject,
        STUDIO_MENU_ACTION.users,
        STUDIO_MENU_ACTION.settings,
        "separator",
        STUDIO_MENU_ACTION.quit,
      ]);
    }
  });

  test("falls back safely for unknown locales", () => {
    expect(nativeMenuLabels("unknown")).toEqual(nativeMenuLabels("en"));
    expect(nativeMenuLabels(undefined)).toEqual(nativeMenuLabels("en"));
  });

  test("dispatches only known menu action ids", () => {
    const called: string[] = [];
    const actions = {
      home: () => called.push("home"),
      createProject: () => called.push("create-project"),
      users: () => called.push("users"),
      settings: () => called.push("settings"),
      quit: () => called.push("quit"),
    };

    expect(
      dispatchStudioMenuAction(STUDIO_MENU_ACTION.createProject, actions),
    ).toBe(true);
    expect(dispatchStudioMenuAction(9000, actions)).toBe(false);
    expect(called).toEqual(["create-project"]);
  });
});
