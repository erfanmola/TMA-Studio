import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repo = process.env.BUNIUM_REPO;

test("native window controls and idempotent close ordering", () => {
  if (!repo) throw new Error("Set BUNIUM_REPO to a Bunium checkout");
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "fixture-app/bunium/main.ts")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        BUNIUM_MODULE: resolve(repo, "src/index.ts"),
        BUNIUM_REPO: repo,
      },
      timeout: 120_000,
    },
  );
  expect(`${result.stdout}\n${result.stderr}`).toContain(
    "NATIVE_WINDOW_CONTROLS_GATE:PASS",
  );
  expect(result.status).toBe(0);
}, 150_000);
