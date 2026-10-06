import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const captureTestEnabled =
  process.platform === "darwin" && process.env.RUN_NATIVE_CAPTURE === "1";

test.skipIf(!captureTestEnabled)(
  "captures a real composed Bunium window and bounds cancellation/write failures",
  () => {
    const repo = process.env.BUNIUM_REPO;
    if (!repo) throw new Error("Set BUNIUM_REPO to a Bunium checkout");
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, "qualify.mjs")],
      {
        encoding: "utf8",
        env: { ...process.env, BUNIUM_REPO: repo },
        timeout: 180_000,
      },
    );
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "NATIVE_CAPTURE_GATE:PASS",
    );
    expect(result.status).toBe(0);
  },
  190_000,
);
