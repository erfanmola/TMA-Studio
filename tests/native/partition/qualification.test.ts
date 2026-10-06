import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Requires the runtime checkout that provides Bunium session API v1.
const repo = process.env.BUNIUM_REPO;

test("native partition isolation, persistence and clearing", () => {
  if (!repo) {
    throw new Error("Set BUNIUM_REPO to a Bunium checkout with session API v1");
  }
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "fixture-app/bunium/main.ts")],
    {
      encoding: "utf8",
      env: { ...process.env, BUNIUM_MODULE: resolve(repo, "src/index.ts") },
      timeout: 360_000,
    },
  );
  expect(result.stdout).toContain("NATIVE_PARTITION_GATE:PASS");
  expect(result.status).toBe(0);
}, 400_000);
