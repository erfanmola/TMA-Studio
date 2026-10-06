import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

test("Studio simulator adapter preserves native guest and aligns input", () => {
  const repo = process.env.BUNIUM_REPO;
  if (!repo)
    throw new Error("Set BUNIUM_REPO to a Bunium checkout with guest API v1");

  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "fixture-app/bunium/main.ts")],
    {
      encoding: "utf8",
      env: { ...process.env, BUNIUM_MODULE: resolve(repo, "src/index.ts") },
      timeout: 120_000,
    },
  );
  expect(result.stdout).toContain("STUDIO_SIMULATOR_NATIVE_GATE:PASS");
  expect(result.status).toBe(0);
}, 150_000);

test("Studio Android chrome overlays route controls above the live native guest", () => {
  const repo = process.env.BUNIUM_REPO;
  if (!repo)
    throw new Error(
      "Set BUNIUM_REPO to a Bunium checkout with guest and overlay APIs",
    );

  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "fixture-app/bunium/android-chrome.ts")],
    {
      encoding: "utf8",
      env: { ...process.env, BUNIUM_MODULE: resolve(repo, "src/index.ts") },
      timeout: 120_000,
    },
  );
  expect(`${result.stdout}\n${result.stderr}`).toContain(
    "STUDIO_ANDROID_OVERLAY_NATIVE_GATE:PASS",
  );
  expect(result.status).toBe(0);
}, 150_000);
