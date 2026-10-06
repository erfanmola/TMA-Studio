import { describe, expect, test } from "bun:test";
import {
  type ChoiceOption,
  type ComboBoxState,
  initialComboBoxState,
  reduceComboBox,
  visibleOptions,
} from "../../packages/ui/src/components/combobox-state";
import {
  moveIndex,
  placePopup,
  typeaheadIndex,
} from "../../packages/ui/src/components/navigation";

const disabledAt =
  (...indexes: number[]) =>
  (index: number) =>
    indexes.includes(index);

describe("roving navigation", () => {
  test("horizontal arrows follow visual direction in RTL", () => {
    const base = { count: 4, current: 1, orientation: "horizontal" as const };
    expect(moveIndex("ArrowRight", base)).toBe(2);
    expect(moveIndex("ArrowLeft", base)).toBe(0);
    expect(moveIndex("ArrowRight", { ...base, direction: "rtl" })).toBe(0);
    expect(moveIndex("ArrowLeft", { ...base, direction: "rtl" })).toBe(2);
    expect(moveIndex("ArrowDown", base)).toBeNull();
  });

  test("skips disabled items, wraps, and handles Home/End", () => {
    const options = {
      count: 5,
      current: 3,
      isDisabled: disabledAt(0, 4),
      orientation: "vertical" as const,
    };
    expect(moveIndex("ArrowDown", options)).toBe(1);
    expect(moveIndex("ArrowUp", { ...options, current: 1 })).toBe(3);
    expect(moveIndex("Home", options)).toBe(1);
    expect(moveIndex("End", options)).toBe(3);
    expect(
      moveIndex("ArrowDown", { ...options, current: 3, loop: false }),
    ).toBeNull();
  });

  test("returns null when every item is disabled", () => {
    expect(
      moveIndex("ArrowDown", {
        count: 2,
        current: 0,
        isDisabled: () => true,
        orientation: "vertical",
      }),
    ).toBeNull();
  });

  test("typeahead cycles matching enabled labels", () => {
    const labels = ["Reload", "Reset", "Rotate", "Copy"];
    expect(typeaheadIndex(labels, 0, "r")).toBe(1);
    expect(typeaheadIndex(labels, 1, "r", disabledAt(2))).toBe(0);
    expect(typeaheadIndex(labels, 0, "res")).toBe(1);
    expect(typeaheadIndex(labels, 0, "x")).toBeNull();
  });
});

describe("popup placement", () => {
  const viewport = { height: 600, width: 400 };

  test("opens below and keeps inline start alignment", () => {
    const placement = placePopup({
      anchor: { bottom: 128, left: 20, right: 220, top: 100 },
      preferredHeight: 200,
      preferredWidth: 160,
      viewport,
    });
    expect(placement).toMatchObject({ left: 20, side: "below", top: 132 });
    expect(placement.width).toBe(200);
    expect(placement.maxHeight).toBe(200);
  });

  test("flips above near the bottom and clamps height to the space", () => {
    const placement = placePopup({
      anchor: { bottom: 580, left: 20, right: 220, top: 552 },
      preferredHeight: 700,
      preferredWidth: 200,
      viewport,
    });
    expect(placement.side).toBe("above");
    expect(placement.top).toBeGreaterThanOrEqual(8);
    expect(placement.top + placement.maxHeight).toBe(548);
  });

  test("aligns to the inline end in RTL and stays inside the viewport", () => {
    const placement = placePopup({
      anchor: { bottom: 40, left: 10, right: 60, top: 12 },
      direction: "rtl",
      preferredHeight: 100,
      preferredWidth: 320,
      viewport,
    });
    expect(placement.left).toBe(8);
    expect(placement.left + placement.width).toBeLessThanOrEqual(392);
  });
});

describe("combobox state", () => {
  const options: ChoiceOption[] = [
    { label: "Android", value: "android" },
    { disabled: true, label: "iPadOS", value: "ipados" },
    { label: "iOS", value: "ios" },
    { label: "Web A", value: "web-a" },
  ];
  const run = (
    events: Parameters<typeof reduceComboBox>[1][],
    value: string | null = "ios",
  ) => {
    let state: ComboBoxState = initialComboBoxState(options, value);
    const commits: string[] = [];
    for (const event of events) {
      const result = reduceComboBox(state, event, options, value);
      state = result.state;
      if (result.commit !== undefined) commits.push(result.commit);
    }
    return { commits, state };
  };

  test("Escape closes and restores the committed label without changing value", () => {
    const { commits, state } = run([
      { text: "and", type: "input" },
      { key: "ArrowDown", type: "key" },
      { key: "Escape", type: "key" },
    ]);
    expect(commits).toEqual([]);
    expect(state).toEqual({
      activeIndex: -1,
      open: false,
      query: null,
      text: "iOS",
    });
    expect(run([{ key: "Escape", type: "key" }]).state.text).toBe("iOS");
  });

  test("blur and Tab never commit or clear", () => {
    for (const event of [
      { type: "dismiss" } as const,
      { key: "Tab", type: "key" } as const,
    ]) {
      const { commits, state } = run([{ text: "web", type: "input" }, event]);
      expect(commits).toEqual([]);
      expect(state.text).toBe("iOS");
    }
  });

  test("opening starts on the selected option and skips disabled options", () => {
    const opened = run([{ key: "ArrowDown", type: "key" }]).state;
    expect(opened).toMatchObject({ activeIndex: 2, open: true, query: null });
    const up = run([
      { key: "ArrowDown", type: "key" },
      { key: "ArrowUp", type: "key" },
    ]).state;
    expect(up.activeIndex).toBe(0);
  });

  test("filters by text and commits the active option on Enter", () => {
    expect(visibleOptions(options, "  WEB ").map((o) => o.value)).toEqual([
      "web-a",
    ]);
    const { commits, state } = run([
      { text: "web", type: "input" },
      { key: "Enter", type: "key" },
    ]);
    expect(commits).toEqual(["web-a"]);
    expect(state).toMatchObject({ open: false, text: "Web A" });
  });

  test("disabled options and empty results cannot commit", () => {
    expect(
      run([
        { key: "ArrowDown", type: "key" },
        { index: 1, type: "choose" },
      ]).commits,
    ).toEqual([]);
    const empty = run([
      { text: "zzz", type: "input" },
      { key: "Enter", type: "key" },
    ]);
    expect(empty.commits).toEqual([]);
    expect(empty.state.text).toBe("iOS");
  });
});
