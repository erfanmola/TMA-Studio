import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collectFiles } from "./quality.mjs";

const root = resolve(import.meta.dirname, "..");
const harness = resolve(root, "tests/visual/browser");
const config = resolve(harness, "playwright.config.ts");
const baselines = resolve(harness, "baselines", process.platform);
const [command = "run", ...rest] = process.argv.slice(2);

function playwright(args, env = {}) {
  return spawnSync("bun", ["x", "playwright", "test", "-c", config, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

async function baselineCount() {
  if (!existsSync(baselines)) return 0;
  return (await collectFiles(baselines, (_path, name) => name.endsWith(".png")))
    .length;
}

if (command === "run") {
  // Fail closed: a platform without reviewed baselines cannot pass.
  if ((await baselineCount()) === 0) {
    console.error(
      `No reviewed ${process.platform} baselines in tests/visual/browser/baselines/${process.platform}.\n` +
        "Render them, review the images, then accept explicitly:\n" +
        "  bun run test:visual:accept -- --grep <scene> (or --all --reviewed)",
    );
    process.exit(2);
  }
  const result = playwright(rest);
  if (result.status !== 0) {
    console.error(
      "Visual harness failed. Expected/actual/diff images, traces and environment.json are under .cache/visual/artifacts; open .cache/visual/report/index.html.",
    );
  }
  process.exit(result.status ?? 1);
}

if (command === "accept") {
  // Manual acceptance only: scope must be explicit, never a silent blanket.
  const grepIndex = rest.indexOf("--grep");
  const all = rest.includes("--all");
  if (grepIndex === -1 && !(all && rest.includes("--reviewed"))) {
    console.error(
      "Refusing blanket acceptance. Pass --grep <scene pattern>, or --all --reviewed after reviewing every actual image.",
    );
    process.exit(2);
  }
  const args = rest.filter((arg) => arg !== "--all" && arg !== "--reviewed");
  const result = playwright([
    "--update-snapshots=all",
    "--grep",
    "@snapshot",
    ...args,
  ]);
  if (result.status === 0) {
    console.log(
      "Baselines written. Review the changed PNGs (git diff/status) before committing them.",
    );
  }
  process.exit(result.status ?? 1);
}

if (command === "selftest") {
  // Prove the gate: a deliberate defect must fail and leave a diff artifact.
  if ((await baselineCount()) === 0) {
    console.error("Self-test needs accepted baselines first.");
    process.exit(2);
  }
  const output = mkdtempSync(join(tmpdir(), "visual-selftest-"));
  const result = playwright(
    ["--grep", "@snapshot primitives scale 100%", "--project", "chromium-dpr1"],
    { VISUAL_INJECT_DEFECT: "primitives", VISUAL_OUTPUT: output },
  );
  const diffs = await collectFiles(
    resolve(output, "artifacts"),
    (_path, name) => name.endsWith("-diff.png"),
  ).catch(() => []);
  const expected = await collectFiles(
    resolve(output, "artifacts"),
    (_path, name) => name.endsWith("-expected.png"),
  ).catch(() => []);
  if (result.status === 0 || diffs.length === 0 || expected.length === 0) {
    console.error(
      `Self-test FAILED: injected defect exit=${result.status}, diff images=${diffs.length}.`,
    );
    process.exit(1);
  }
  console.log(
    `Self-test passed: injected defect failed with ${diffs.length} diff image(s), e.g.\n  ${diffs[0]}`,
  );
  if (!rest.includes("--keep"))
    rmSync(output, { force: true, recursive: true });
  process.exit(0);
}

console.error("usage: bun scripts/visual-harness.mjs <run|accept|selftest>");
process.exit(2);
