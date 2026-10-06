import { describe, expect, test } from "bun:test";
import {
  describedByIds,
  focusLeavesControl,
} from "../../packages/ui/src/components/accessibility";

describe("accessible primitive helpers", () => {
  test("combines native description and error IDs without duplicates", () => {
    expect(describedByIds("hint external", "api-key", "Help", "Required")).toBe(
      "hint external api-key-description api-key-error",
    );
    expect(describedByIds(undefined, "api-key")).toBeUndefined();
  });

  test("keeps secret reveal active within its control and resets on focus exit", () => {
    const inside = {} as Node;
    const contains = (node: Node) => node === inside;
    expect(focusLeavesControl(contains, inside)).toBe(false);
    expect(focusLeavesControl(contains, {} as Node)).toBe(true);
    expect(focusLeavesControl(contains, null)).toBe(true);
  });
});
