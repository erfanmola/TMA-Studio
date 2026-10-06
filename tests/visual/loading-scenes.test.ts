import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../apps/studio/src/scenes/LoadingScenes.tsx", import.meta.url),
  "utf8",
);

describe("localized loading scenes", () => {
  test("binds scene language, direction, and status from the locale foundation", () => {
    expect(source).toContain("{LOCALES.map((locale) => (");
    expect(source).toContain("data-locale={locale}");
    expect(source).toContain("dir={directionFor(locale)}");
    expect(source).toContain("lang={locale}");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("dictionaries[locale].loading.title");
    expect(source).toContain("dictionaries[locale].loading.detail");
  });
});
