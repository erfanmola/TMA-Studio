import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { checkDictionaryParity, collectFiles } from "./quality.mjs";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "apps/studio/src/locales");
const files = await collectFiles(directory, (_path, name) =>
  /^[a-z]{2}\.json$/i.test(name),
);
const dictionaries = {};
const issues = [];

for (const file of files) {
  // basename, not a "/" split: collectFiles returns os-native paths and "\\"
  // never appears on macOS/Linux while "/" never separates on Windows.
  const locale = basename(file, ".json").toLowerCase();
  try {
    dictionaries[locale] = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    issues.push(`${file}: invalid dictionary JSON (${error.message})`);
  }
}

if (issues.length === 0)
  issues.push(...checkDictionaryParity(dictionaries).issues);
if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else if (files.length === 0) {
  console.log("Locale check skipped (locales are not implemented yet).");
} else {
  console.log(
    `Locale parity passed (${Object.keys(dictionaries).join(", ")}).`,
  );
}
