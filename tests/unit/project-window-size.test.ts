import { describe, expect, test } from "bun:test";
import { minimumWindowSizeForKey } from "../../apps/studio/bunium/window-size";

describe("native minimum content size", () => {
  test("keeps Home usable while allowing its narrow responsive layout", () => {
    expect(minimumWindowSizeForKey("home")).toEqual({
      width: 480,
      height: 448,
    });
  });

  test("keeps Project windows above the layout's sidebar stacking breakpoint", () => {
    expect(minimumWindowSizeForKey("project:new:window-1")).toEqual({
      width: 641,
      height: 608,
    });
    expect(minimumWindowSizeForKey("project:existing-id")).toEqual({
      width: 641,
      height: 608,
    });
    expect(
      minimumWindowSizeForKey("simulator:project-1:android"),
    ).toBeUndefined();
  });
});
