import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Requires the runtime checkout that provides Bunium guest API v1.
const repo = process.env.BUNIUM_REPO;

test("native guest transport, routing, generations and disposal", () => {
  if (!repo) {
    throw new Error("Set BUNIUM_REPO to a Bunium checkout with guest API v1");
  }
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "fixture-app/bunium/main.ts")],
    {
      encoding: "utf8",
      env: { ...process.env, BUNIUM_MODULE: resolve(repo, "src/index.ts") },
      timeout: 240_000,
    },
  );
  expect(result.stdout).toContain("NATIVE_GUEST_GATE:PASS");
  expect(result.status).toBe(0);
}, 300_000);
