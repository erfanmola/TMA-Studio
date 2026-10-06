import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const files = [
  "README.md",
  "docs/COMPATIBILITY.md",
  "docs/PRIVACY.md",
  "docs/SUPPORT.md",
  "docs/NOTICES.md",
];

function read(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

describe("public docs (12b)", () => {
  test("contain no private paths, local hosts, attribution or installer links", () => {
    for (const name of files) {
      const text = read(name);
      for (const marker of [
        "/Users/",
        "tma-studio-planning",
        "localhost",
        "127.0.0.1",
        "Co-Authored-By",
        "Codex",
        "Anthropic",
      ]) {
        expect(text, `${name} contains ${marker}`).not.toContain(marker);
      }
      expect(text, `${name} mentions TON`).not.toMatch(/\bTON\b/u);
      expect(text, `${name} links an installer`).not.toMatch(
        /\.(dmg|exe|msi|appimage|deb|rpm|pkg|zip)(\?|#|$)/iu,
      );
    }
  });

  test("carry real setup commands and honest unreleased status", () => {
    const readme = read("README.md");
    for (const command of [
      "bun install --frozen-lockfile",
      "bun run check",
      "bun run build:studio",
      "bun run dev",
    ]) {
      expect(readme).toContain(command);
    }
    expect(readme).toMatch(/not been released|unreleased/iu);
    expect(readme).toMatch(/not yet verified|in development/iu);
    expect(readme).not.toMatch(/pixel-perfect|fully verified|certified/iu);
  });
});
