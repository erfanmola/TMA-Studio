import { describe, expect, test } from "bun:test";
import { SimulatorWindowTitles } from "../../apps/studio/bunium/services/simulator-window-titles";

describe("SimulatorWindowTitles", () => {
  test("keeps open window titles stable and distinct, then assigns a fresh title after close", () => {
    const titles = new SimulatorWindowTitles();
    const first = titles.open("project-a:android");
    expect(titles.open("project-a:android")).toBe(first);
    const second = titles.open("project-b:ios");
    expect(second).not.toBe(first);
    titles.close("project-a:android");
    const reopened = titles.open("project-a:android");
    expect(reopened).not.toBe(first);
    expect(reopened).not.toBe(second);
  });
});
