import { NoHydration, renderToString } from "@solidjs/web";
import {
  dictionaries,
  directionFor,
  LOCALES,
  type Locale,
  pagePath,
  type Route,
  relative,
} from "./i18n";
import { Layout } from "./pages/Layout";
import { pages, pageTitle } from "./pages/Pages";

export { LOCALES, pageFile, ROUTES } from "./i18n";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Follows the system color scheme; the shared tokens switch on data-theme. */
export const THEME_SCRIPT =
  "(()=>{const m=matchMedia('(prefers-color-scheme: dark)');const a=()=>{document.documentElement.dataset.theme=m.matches?'dark':'light'};a();m.addEventListener('change',a)})()";

function documentShell(options: {
  body: string;
  description: string;
  dir: string;
  head: string;
  lang: string;
  stylesheets: readonly string[];
  title: string;
}): string {
  const links = options.stylesheets
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("");
  return `<!doctype html><html lang="${options.lang}" dir="${options.dir}" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(options.title)}</title><meta name="description" content="${escapeHtml(options.description)}"><meta name="color-scheme" content="light dark">${links}${options.head}<script>${THEME_SCRIPT}</script></head><body>${options.body}</body></html>`;
}

export function renderPage(
  locale: Locale,
  route: Route,
  stylesheets: readonly string[],
): string {
  const here = pagePath(locale, route);
  const Page = pages[route];
  const body = renderToString(() => (
    <NoHydration>
      <Layout locale={locale} route={route}>
        <Page locale={locale} />
      </Layout>
    </NoHydration>
  ));
  const alternates = LOCALES.map(
    (other) =>
      `<link rel="alternate" hreflang="${other}" href="${relative(here, pagePath(other, route))}">`,
  ).join("");
  return documentShell({
    body,
    description: dictionaries[locale].meta.description,
    dir: directionFor(locale),
    head: `<link rel="icon" href="${relative(here, "media/studio-icon-64.png")}">${alternates}`,
    lang: locale,
    stylesheets: stylesheets.map((file) => relative(here, file)),
    title: pageTitle(locale, route),
  });
}

/** Root page: language choice without user-agent redirects. */
export function renderChooser(stylesheets: readonly string[]): string {
  const body = renderToString(() => (
    <NoHydration>
      <div class="site">
        <main class="chooser" id="content">
          <img alt="" height="64" src="media/studio-icon-64.png" width="64" />
          <h1>TMA Studio</h1>
          <ul>
            {LOCALES.map((locale) => (
              <li>
                <a
                  class="studio-button studio-button--secondary studio-button--comfortable"
                  href={pagePath(locale, "home")}
                  hreflang={locale}
                  lang={locale}
                >
                  {dictionaries[locale].meta.languageName}
                </a>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </NoHydration>
  ));
  return documentShell({
    body,
    description: dictionaries.en.meta.description,
    dir: "ltr",
    head: '<link rel="icon" href="media/studio-icon-64.png">',
    lang: "en",
    stylesheets,
    title: dictionaries.en.meta.siteName,
  });
}
