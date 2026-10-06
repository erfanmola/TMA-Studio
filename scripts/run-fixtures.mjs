import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { collectFiles } from "./quality.mjs";

const suite = process.argv[2];
if (suite !== "visual" && suite !== "native") {
  console.error("usage: bun scripts/run-fixtures.mjs <visual|native>");
  process.exit(2);
}

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "tests", suite);
const files = await collectFiles(directory, (_path, name) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(name),
);
if (files.length === 0) {
  console.error(
    `${suite} fixture runner is ready, but no ${suite} fixtures exist yet.`,
  );
  process.exit(2);
}

const result = spawnSync(process.execPath, ["test", ...files], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
