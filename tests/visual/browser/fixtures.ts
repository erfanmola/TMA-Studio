import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

export { expect };

/** Frozen wall clock for every scene (Date/Intl output is deterministic). */
export const FIXED_TIME = new Date("2026-01-15T09:30:00.000Z");
const SEED = 0x5eed;

const root = resolve(import.meta.dirname, "../../..");

function hashTree(directory: string, hash = createHash("sha256")) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) hashTree(path, hash);
    else hash.update(name).update(readFileSync(path));
  }
  return hash;
}

/** Revision of everything that can change a rendered scene. */
export const fixtureRevision = (() => {
  const hash = createHash("sha256");
  hashTree(resolve(root, "apps/studio/src"), hash);
  hashTree(resolve(root, "packages/ui/src"), hash);
  return hash.digest("hex").slice(0, 16);
})();

/**
 * Harness self-test hook: VISUAL_INJECT_DEFECT=<scene id> adds a deliberate
 * visual defect to that scene so the suite must fail with a diff artifact.
 */
const injectedDefect = process.env.VISUAL_INJECT_DEFECT;
const DEFECT_CSS =
  ".studio-button--primary, .loading-gallery__indicator, .studio-tabs__tab[aria-selected='true'], .studio-avatar { outline: 0.25rem solid #FF00FF !important; }";

type Fixtures = {
  clockMode: "fixed" | "fake";
  diagnostics: string[];
};

export const test = base.extend<Fixtures>({
  clockMode: ["fixed", { option: true }],
  diagnostics: [
    async ({ page }, use) => {
      const messages: string[] = [];
      page.on("pageerror", (error) =>
        messages.push(`pageerror: ${error.message}`),
      );
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          messages.push(`${message.type()}: ${message.text()}`);
        }
      });
      await use(messages);
      expect(messages, "console errors, warnings or Solid diagnostics").toEqual(
        [],
      );
    },
    { auto: true },
  ],
  page: async ({ page, clockMode, baseURL }, use) => {
    const origin = new URL(baseURL ?? "http://127.0.0.1").origin;
    // No network: only the local dev server and inline data are reachable.
    await page.context().route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(origin) || url.startsWith("data:")) {
        return route.continue();
      }
      return route.abort("blockedbyclient");
    });
    if (clockMode === "fake") await page.clock.install({ time: FIXED_TIME });
    else await page.clock.setFixedTime(FIXED_TIME);
    await page.addInitScript((seed: number) => {
      let state = seed >>> 0;
      Math.random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }, SEED);
    await use(page);
  },
});

export type OpenOptions = {
  /** Let the document scroll so element screenshots capture whole panels. */
  fullCapture?: boolean;
  query: string;
  ready: string;
  scale?: number;
  sceneId?: string;
  theme?: "light" | "dark";
};

/** Opens a review scene and waits until fonts and layout are settled. */
export async function openScene(page: Page, options: OpenOptions) {
  await page.goto(`/${options.query}`);
  await page.waitForSelector(options.ready);
  // Review boards scroll inside a full-height container; let the document
  // scroll instead so element captures include whole panels.
  if (options.fullCapture) {
    await page.addStyleTag({
      content:
        "html, body, #root, .primitive-state-board, .catalog-state-board, .loading-gallery { height: auto !important; overflow: visible !important; }",
    });
  }
  if (options.theme) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, options.theme);
  }
  if (options.scale && options.scale !== 1) {
    await page.addStyleTag({
      content: `html { font-size: ${options.scale * 100}% !important; }`,
    });
  }
  if (injectedDefect && injectedDefect === options.sceneId) {
    await page.addStyleTag({ content: DEFECT_CSS });
  }
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = (family: string) =>
      [...document.fonts].some(
        (face) =>
          face.family.replace(/"/g, "") === family && face.status === "loaded",
      );
    return { inter: loaded("Inter"), vazirmatn: loaded("Vazirmatn") };
  });
  expect(fonts, "bundled local fonts loaded").toEqual({
    inter: true,
    vazirmatn: true,
  });
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => done(null))),
  );
}

/** Environment fingerprint attached to every visual result. */
export async function fingerprint(page: Page, extra: Record<string, unknown>) {
  const browser = page.context().browser();
  return {
    browser: `${browser?.browserType().name()} ${browser?.version()}`,
    devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
    fixedTime: FIXED_TIME.toISOString(),
    fixtureRevision,
    platform: `${process.platform}-${process.arch}`,
    viewport: page.viewportSize(),
    ...extra,
  };
}
