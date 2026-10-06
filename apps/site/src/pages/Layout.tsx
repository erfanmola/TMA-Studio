import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import {
  dictionaries,
  GITHUB_URL,
  LOCALES,
  type Locale,
  pagePath,
  type Route,
  relative,
} from "../i18n";

const navRoutes = [
  "gettingStarted",
  "download",
  "compatibility",
  "changelog",
] as const;
const footerRoutes = ["privacy", "support"] as const;

export function Layout(props: {
  children: JSX.Element;
  locale: Locale;
  route: Route;
}) {
  const copy = dictionaries[props.locale];
  const here = pagePath(props.locale, props.route);
  const link = (route: Route, locale: Locale = props.locale) =>
    relative(here, pagePath(locale, route));

  return (
    <>
      <a class="skip-link" href="#content">
        {copy.a11y.skip}
      </a>
      <div class="site">
        <header class="site-header">
          <a aria-label={copy.a11y.home} class="brand" href={link("home")}>
            <img
              alt=""
              height="32"
              src={relative(here, "media/studio-icon-64.png")}
              width="32"
            />
            <span>{copy.meta.siteName}</span>
          </a>
          <nav aria-label={copy.a11y.primaryNav} class="site-nav">
            <ul>
              <For each={navRoutes}>
                {(route) => (
                  <li>
                    <a
                      aria-current={route === props.route ? "page" : undefined}
                      href={link(route)}
                    >
                      {copy.nav[route]}
                    </a>
                  </li>
                )}
              </For>
              <li>
                <a href={GITHUB_URL} rel="noopener">
                  {copy.nav.github}
                </a>
              </li>
            </ul>
          </nav>
        </header>
        <nav aria-label={copy.a11y.languageNav} class="language-nav">
          <ul>
            <For each={LOCALES}>
              {(locale) => (
                <li>
                  <a
                    aria-current={locale === props.locale ? "true" : undefined}
                    href={link(props.route, locale)}
                    hreflang={locale}
                    lang={locale}
                  >
                    {dictionaries[locale].meta.languageName}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </nav>
        <main id="content" tabindex="-1">
          {props.children}
        </main>
        <footer class="site-footer">
          <p>
            {copy.footer.tagline}
            <br />
            {copy.footer.independent}
          </p>
          <nav aria-label={copy.a11y.footerNav}>
            <ul class="footer-links">
              <For each={footerRoutes}>
                {(route) => (
                  <li>
                    <a
                      aria-current={route === props.route ? "page" : undefined}
                      href={link(route)}
                    >
                      {copy.nav[route]}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </nav>
        </footer>
      </div>
    </>
  );
}
