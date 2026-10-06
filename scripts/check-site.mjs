// Builds the prerendered site and checks routes, links, locale markup,
// accessibility basics, dictionary parity, host-import boundary, style units
// and asset budgets. Pass --skip-build to check an existing dist.
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  checkCssDimensions,
  checkDictionaryParity,
  checkRemGrid,
  collectFiles,
  flattenDictionary,
  localeNames,
  readCompiledStyles,
  relativePath,
} from "./quality.mjs";

const root = resolve(import.meta.dirname, "..");
const site = resolve(root, "apps/site");
const dist = resolve(site, "dist");
const issues = [];
const fail = (message) => issues.push(message);

if (!process.argv.includes("--skip-build")) {
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: site,
    stderr: "inherit",
    stdout: "ignore",
  });
  if (build.exitCode !== 0) {
    console.error("Site build failed");
    process.exit(1);
  }
}

// Routes: one language chooser plus every page in every locale.
const routes = [
  "",
  "download/",
  "getting-started/",
  "compatibility/",
  "changelog/",
  "privacy/",
  "support/",
];
const expected = [
  "index.html",
  ...localeNames.flatMap((locale) =>
    routes.map((route) => `${locale}/${route}index.html`),
  ),
];
for (const file of expected) {
  if (!existsSync(join(dist, file))) fail(`missing page ${file}`);
}

const pages = await collectFiles(dist, (_path, name) => name.endsWith(".html"));
if (pages.length !== expected.length) {
  fail(`expected ${expected.length} pages, found ${pages.length}`);
}

const privateMarkers = [
  "/Users/",
  "tma-studio-planning",
  "localhost",
  "127.0.0.1",
];
const allowedExternal = /^https:\/\/github\.com\/erfanmola\/TMA-Studio(\/|$)/u;
const installerLink = /\.(dmg|exe|msi|appimage|deb|rpm|pkg|zip)(\?|#|$)/iu;

function resolveTarget(page, url) {
  const clean = url.split("#")[0].split("?")[0];
  if (clean === "") return page;
  const target = resolve(dirname(page), clean);
  return clean.endsWith("/") ? join(target, "index.html") : target;
}

for (const page of pages) {
  const name = relativePath(dist, page);
  const html = await readFile(page, "utf8");
  const locale = name.includes("/") ? name.split("/")[0] : "en";
  const state = { alts: 0, h1: 0, ids: new Set(), imgs: 0, lang: "", dir: "" };
  const urls = [];

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(element) {
        state.lang = element.getAttribute("lang") ?? "";
        state.dir = element.getAttribute("dir") ?? "";
      },
    })
    .on("h1", {
      element() {
        state.h1 += 1;
      },
    })
    .on("img", {
      element(element) {
        state.imgs += 1;
        if (element.hasAttribute("alt")) state.alts += 1;
        urls.push(["img", element.getAttribute("src") ?? ""]);
      },
    })
    .on("[id]", {
      element(element) {
        state.ids.add(element.getAttribute("id"));
      },
    })
    .on("a", {
      element(element) {
        urls.push(["a", element.getAttribute("href") ?? ""]);
      },
    })
    .on("link", {
      element(element) {
        urls.push(["link", element.getAttribute("href") ?? ""]);
      },
    })
    .on("script", {
      element(element) {
        if (element.hasAttribute("src")) fail(`${name}: external script`);
      },
    })
    .on("*", {
      element(element) {
        for (const [attribute] of element.attributes) {
          if (attribute.startsWith("on")) {
            fail(`${name}: inline event handler ${attribute}`);
          }
        }
      },
    });
  await rewriter.transform(new Response(html)).text();

  const direction = locale === "fa" || locale === "ar" ? "rtl" : "ltr";
  if (state.lang !== locale) fail(`${name}: lang="${state.lang}"`);
  if (state.dir !== direction) fail(`${name}: dir="${state.dir}"`);
  if (state.h1 !== 1) fail(`${name}: ${state.h1} h1 elements`);
  if (state.alts !== state.imgs) fail(`${name}: image without alt`);
  if (!/<title>[^<]+<\/title>/u.test(html)) fail(`${name}: empty title`);
  if (!state.ids.has("content")) fail(`${name}: missing #content target`);
  for (const marker of privateMarkers) {
    if (html.includes(marker)) fail(`${name}: contains ${marker}`);
  }
  if (/\bTON\b/u.test(html)) fail(`${name}: mentions TON`);

  for (const [kind, url] of urls) {
    if (url === "") {
      fail(`${name}: empty ${kind} URL`);
    } else if (/^[a-z]+:/iu.test(url)) {
      if (kind !== "a" || !allowedExternal.test(url)) {
        fail(`${name}: unexpected external ${kind} ${url}`);
      }
    } else if (url.startsWith("#")) {
      if (!state.ids.has(url.slice(1))) fail(`${name}: broken anchor ${url}`);
    } else {
      const target = resolveTarget(page, url);
      if (!target.startsWith(dist) || !existsSync(target)) {
        fail(`${name}: broken ${kind} ${url}`);
      }
    }
    if (installerLink.test(url)) fail(`${name}: installer link ${url}`);
  }
}

// Dictionaries: five locales, identical keys, no empty strings.
const dictionaries = {};
for (const locale of localeNames) {
  const file = resolve(site, `src/locales/${locale}.json`);
  if (!existsSync(file)) continue;
  dictionaries[locale] = JSON.parse(await readFile(file, "utf8"));
  for (const key of flattenDictionary(dictionaries[locale])) {
    const value = key
      .split(".")
      .reduce((node, part) => node?.[part], dictionaries[locale]);
    if (typeof value === "string" && value.trim() === "") {
      fail(`${locale}.json: empty ${key}`);
    }
  }
}
issues.push(...checkDictionaryParity(dictionaries).issues);

// Host boundary: site sources never import Bun, Bunium or Node modules.
const sources = await collectFiles(resolve(site, "src"), (_path, name) =>
  /\.(ts|tsx)$/u.test(name),
);
for (const file of sources) {
  const text = await readFile(file, "utf8");
  if (/from\s+["'](bun|bunium|bun:[^"']+|node:[^"']+)["']/u.test(text)) {
    fail(`${relativePath(root, file)}: imports a host module`);
  }
}

// Owned styles: rem-only lengths on the whole-pixel grid.
for (const { file, css } of await readCompiledStyles(resolve(site, "src"))) {
  issues.push(...checkCssDimensions(css, relativePath(root, file)));
  issues.push(...checkRemGrid(css, relativePath(root, file)));
}

// Budgets: pages stay small; media and styles stay light (fonts excluded).
const assets = await collectFiles(dist, () => true);
let payload = 0;
for (const file of assets) {
  const size = statSync(file).size;
  const name = relativePath(dist, file);
  if (name.endsWith(".html") && size > 24_000) fail(`${name}: ${size} bytes`);
  if (/\.(png|jpe?g|webp|svg)$/u.test(name) && size > 120_000) {
    fail(`${name}: ${size} bytes`);
  }
  if (!name.endsWith(".woff2")) payload += size;
}
if (payload > 600_000) fail(`non-font payload ${payload} bytes`);

if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Site check passed (${pages.length} pages, ${localeNames.length} locales, ${payload} non-font bytes).`,
  );
}
