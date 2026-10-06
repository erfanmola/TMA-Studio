import { resolve } from "node:path";
import { checkCssDimensions, readCompiledStyles } from "./quality.mjs";

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
    issues.push(...checkCssDimensions(css, file));
  }
}

if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    count === 0
      ? "Style check passed (no authored CSS/SCSS yet)."
      : `Style check passed (${count} stylesheet(s)).`,
  );
}
