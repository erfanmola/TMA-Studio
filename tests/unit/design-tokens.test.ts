import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  dictionaries,
  directionFor,
  LOCALES,
} from "../../apps/studio/src/i18n/locale";

const tokenFile = new URL(
  "../../packages/ui/src/styles/_tokens.scss",
  import.meta.url,
);
const fontStyleFile = new URL(
  "../../packages/ui/src/styles/_fonts.scss",
  import.meta.url,
);
const styleFile = new URL(
  "../../packages/ui/src/styles/index.scss",
  import.meta.url,
);
const tokenSource = readFileSync(tokenFile, "utf8");
const fontSource = readFileSync(fontStyleFile, "utf8");
const styleSource = readFileSync(styleFile, "utf8");

function themeBlock(selector: RegExp): string {
  const match = tokenSource.match(selector);
  if (!match?.[1])
    throw new Error(`Missing generated token selector ${selector}`);
  return match[1];
}

function color(block: string, token: string): string {
  const value = block.match(
    new RegExp(`--color-${token}:\\s*(#[0-9a-f]{6})`, "iu"),
  )?.[1];
  if (!value) throw new Error(`Missing color token ${token}`);
  return value;
}

function luminance(hex: string): number {
  const channels =
    hex
      .slice(1)
      .match(/.{2}/gu)
      ?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return (
    0.2126 * (linear[0] ?? 0) +
    0.7152 * (linear[1] ?? 0) +
    0.0722 * (linear[2] ?? 0)
  );
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

describe("generated design foundation", () => {
  test("maintains normal-text contrast for semantic text, status and action pairs", () => {
    const surfaces = [
      "canvas",
      "surface",
      "sidebar",
      "raised",
      "hover",
      "selected",
      "field",
    ];
    for (const selector of [
      /:root, \[data-theme="light"\] \{([^}]*)\}/u,
      /\[data-theme="dark"\] \{([^}]*)\}/u,
    ]) {
      const block = themeBlock(selector);
      for (const foreground of [
        "text",
        "secondary",
        "muted",
        "accent",
        "danger",
        "success",
        "warning",
      ]) {
        for (const background of surfaces) {
          expect(
            contrast(color(block, foreground), color(block, background)),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(
        contrast(color(block, "on-accent"), color(block, "accent")),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(color(block, "control-border"), color(block, "field")),
      ).toBeGreaterThanOrEqual(3);
      for (const background of ["canvas", "surface", "selected"]) {
        expect(
          contrast(color(block, "focus"), color(block, background)),
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("ships the pinned variable font files with their complete local notices", () => {
    const assets = [
      [
        "Inter-Variable.woff2",
        "693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3",
      ],
      [
        "Vazirmatn-Variable.woff2",
        "4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92",
      ],
    ] as const;
    for (const [filename, expectedHash] of assets) {
      const bytes = readFileSync(
        new URL(`../../packages/ui/src/fonts/${filename}`, import.meta.url),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        expectedHash,
      );
    }
    const interLicense = readFileSync(
      new URL("../../packages/ui/src/fonts/Inter-OFL.txt", import.meta.url),
      "utf8",
    );
    const vazirmatnLicense = readFileSync(
      new URL("../../packages/ui/src/fonts/Vazirmatn-OFL.txt", import.meta.url),
      "utf8",
    );
    expect(interLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(vazirmatnLicense).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(fontSource).toContain('font-family: "Inter"');
    expect(fontSource).toContain('font-family: "Vazirmatn"');
    expect(fontSource).toContain("unicode-range: U+0600-06FF");
    expect(styleSource).toContain("unicode-bidi: isolate");
    expect(styleSource).toContain("line-height: var(--line-height-arabic)");
  });

  test("provides same-shape five-locale loading copy and physical RTL direction", () => {
    expect(LOCALES).toEqual(["en", "ru", "de", "fa", "ar"]);
    const baseKeys = Object.keys(dictionaries.en.loading).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(dictionaries[locale].loading).sort()).toEqual(
        baseKeys,
      );
      expect(dictionaries[locale].loading.title.length).toBeGreaterThan(0);
      expect(dictionaries[locale].loading.detail.length).toBeGreaterThan(0);
    }
    expect(directionFor("fa")).toBe("rtl");
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("en")).toBe("ltr");
    expect(directionFor("ru")).toBe("ltr");
    expect(directionFor("de")).toBe("ltr");
  });
});
