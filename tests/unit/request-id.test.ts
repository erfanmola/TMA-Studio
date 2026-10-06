import { describe, expect, test } from "bun:test";
import { nextRequestId } from "../../apps/studio/src/features/users/request-id";

describe("renderer IPC request IDs", () => {
  test("creates unique parser-safe IDs without secure-context crypto APIs", () => {
    const first = nextRequestId();
    const second = nextRequestId();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^req-[\w-]+$/u);
    expect(second).toMatch(/^req-[\w-]+$/u);
  });
});
