import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import postcss from "postcss";
import * as sass from "sass";

const ignoredDirectories = new Set([".git", ".cache", "dist", "node_modules"]);
const styleExtensions = new Set([".css", ".scss", ".sass"]);
const otherLengthUnits =
  /(-?(?:\d+\.?\d*|\.\d+))(px|em|ex|ch|ic|lh|rlh|cap|vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|pt|pc|in|cm|mm)\b/gi;
const remValues = /(-?(?:\d+\.?\d*|\.\d+))rem\b/gi;
const tokenDirectoryName = /tokens?/i;
const localeNames = ["en", "ru", "de", "fa", "ar"];

export async function collectFiles(root, accept) {
  const files = [];

  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          !ignoredDirectories.has(entry.name) &&
          !entry.name.startsWith(".")
        ) {
          await visit(path);
        }
      } else if (entry.isFile() && accept(path, entry.name)) {
        files.push(path);
      }
    }
  }

  await visit(root);
  return files.sort();
}

export function checkCssDimensions(css, file) {
  const issues = [];
  const root = postcss.parse(css, { from: file });
  const checkValue = (value, line) => {
    for (const match of value.matchAll(otherLengthUnits)) {
      issues.push(
        `${file}:${line}: use rem instead of ${match[2]} in ${match[0]}`,
      );
    }
  };

  root.walkDecls((declaration) =>
    checkValue(declaration.value, declaration.source?.start?.line ?? 1),
  );
  root.walkAtRules((rule) =>
    checkValue(rule.params, rule.source?.start?.line ?? 1),
  );
  return issues;
}

export function checkRemGrid(text, file) {
  const issues = [];
  for (const match of text.matchAll(remValues)) {
    const rem = Number(match[1]);
    const nominalPixels = rem * 16;
    if (
      !Number.isFinite(rem) ||
      Math.abs(nominalPixels - Math.round(nominalPixels)) > 1e-8
    ) {
      issues.push(
        `${file}: ${match[0]} does not map to a whole nominal CSS pixel at 16px/rem`,
      );
    }
  }
  return issues;
}

export async function readCompiledStyles(root) {
  const files = await collectFiles(root, (_path, name) => {
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    return styleExtensions.has(extension);
  });
  const styles = [];

  for (const file of files) {
    const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
    const css =
      extension === ".css"
        ? await readFile(file, "utf8")
        : sass.compile(file).css;
    styles.push({ file, css });
  }

  return styles;
}

export function flattenDictionary(value, prefix = "", keys = new Set()) {
  if (typeof value === "string") {
    keys.add(prefix);
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenDictionary(child, prefix ? `${prefix}.${key}` : key, keys);
    }
  }
  return keys;
}

export function checkDictionaryParity(dictionaries) {
  const issues = [];
  const configured = Object.keys(dictionaries);
  if (configured.length === 0) return { configured: false, issues };

  for (const locale of localeNames) {
    if (!(locale in dictionaries))
      issues.push(`missing required locale ${locale}`);
  }
  if (!("en" in dictionaries)) return { configured: true, issues };

  const baseKeys = flattenDictionary(dictionaries.en);
  for (const locale of localeNames) {
    if (!(locale in dictionaries)) continue;
    const keys = flattenDictionary(dictionaries[locale]);
    for (const key of baseKeys) {
      if (!keys.has(key)) issues.push(`${locale} is missing key ${key}`);
    }
    for (const key of keys) {
      if (!baseKeys.has(key))
        issues.push(`${locale} has unexpected key ${key}`);
    }
  }
  return { configured: true, issues };
}

export function relativePath(root, file) {
  return relative(root, file).split("\\").join("/");
}

export { localeNames, tokenDirectoryName };
