import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkCssDimensions,
  checkDictionaryParity,
  checkRemGrid,
} from "../../scripts/quality.mjs";
import { rendererBoundaryPlugin } from "../../scripts/renderer-boundary.mjs";

const fixtureRoot = join(import.meta.dir, "../fixtures/invalid");

test("style check rejects non-rem dimensional lengths", async () => {
  const css = await readFile(join(fixtureRoot, "non-rem.css"), "utf8");
  const issues = checkCssDimensions(css, "non-rem.css");

  expect(issues).toHaveLength(2);
  expect(issues[0]).toContain("use rem instead of px");
  expect(issues[1]).toContain("use rem instead of em");
});

test("token check rejects rem sizes that do not map to whole nominal pixels", async () => {
  const tokens = await readFile(
    join(fixtureRoot, "off-grid.tokens.json"),
    "utf8",
  );
  const issues = checkRemGrid(tokens, "off-grid.tokens.json");

  expect(issues).toHaveLength(1);
  expect(issues[0]).toContain(
    "0.1rem does not map to a whole nominal CSS pixel",
  );
});

test("locale check rejects a missing translated dictionary key", async () => {
  const en = JSON.parse(await readFile(join(fixtureRoot, "en.json"), "utf8"));
  const fa = JSON.parse(await readFile(join(fixtureRoot, "fa.json"), "utf8"));
  const result = checkDictionaryParity({ en, fa });

  expect(result.configured).toBe(true);
  expect(result.issues).toContain("fa is missing key common.cancel");
});

test("renderer boundary rejects native imports found in a source fixture", async () => {
  const source = await readFile(
    join(fixtureRoot, "renderer-import.ts"),
    "utf8",
  );
  const specifier = source.match(/from\s+["']([^"']+)["']/)?.[1];
  expect(specifier).toBe("bunium");

  const plugin = rendererBoundaryPlugin();
  const resolveId = plugin.resolveId;
  expect(resolveId).toBeDefined();
  expect(() =>
    resolveId?.call(
      {
        error(message: string) {
          throw new Error(message);
        },
      },
      specifier as string,
    ),
  ).toThrow("Renderer cannot import host or native module: bunium");
});
