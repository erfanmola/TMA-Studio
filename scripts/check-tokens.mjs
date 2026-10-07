import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  checkRemGrid,
  collectFiles,
  readCompiledStyles,
  tokenDirectoryName,
} from "./quality.mjs";

const root = resolve(import.meta.dirname, "..");
const roots = [
  resolve(root, "apps/studio/src"),
  resolve(root, "packages/ui/src"),
];
const issues = [];
let count = 0;

for (const directory of roots) {
  for (const { file, css } of await readCompiledStyles(directory)) {
    count += 1;
    issues.push(...checkRemGrid(css, file));
  }
}

for (const directory of roots) {
  const files = await collectFiles(
    directory,
    (path, name) =>
      name.endsWith(".json") &&
      // Split on both separators: collectFiles returns os-native paths.
      (tokenDirectoryName.test(path.split(/[/\\]/).at(-2) ?? "") ||
        /tokens?/i.test(name)),
  );
  for (const file of files) {
    count += 1;
    const text = await readFile(file, "utf8");
    try {
      JSON.parse(text);
      issues.push(...checkRemGrid(text, file));
    } catch (error) {
      issues.push(`${file}: invalid token JSON (${error.message})`);
    }
  }
}

if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    count === 0
      ? "Token check passed (no authored styles or token files yet)."
      : `Token check passed (${count} style/token file(s)).`,
  );
}
