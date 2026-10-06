import { describe, expect, test } from "bun:test";
import { minimumWindowSizeForKey } from "../../apps/studio/bunium/window-size";

describe("settings native minimum (05d)", () => {
  test("keeps Settings tabs usable under tiling", () => {
    expect(minimumWindowSizeForKey("settings")).toEqual({
      width: 480,
      height: 480,
    });
  });
});
