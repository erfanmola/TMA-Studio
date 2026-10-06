import ar from "./locales/ar.json";
import de from "./locales/de.json";
import en from "./locales/en.json";
import fa from "./locales/fa.json";
import ru from "./locales/ru.json";

export const LOCALES = ["en", "ru", "de", "fa", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = { en, ru, de, fa, ar };

export function directionFor(locale: Locale): "ltr" | "rtl" {
  return locale === "fa" || locale === "ar" ? "rtl" : "ltr";
}

export const ROUTES = [
  "home",
  "download",
  "gettingStarted",
  "compatibility",
  "changelog",
  "privacy",
  "support",
] as const;
export type Route = (typeof ROUTES)[number];

const segments: Record<Route, string> = {
  changelog: "changelog",
  compatibility: "compatibility",
  download: "download",
  gettingStarted: "getting-started",
  home: "",
  privacy: "privacy",
  support: "support",
};

/** Root-relative directory of a page, e.g. "fa/download/". */
export function pagePath(locale: Locale, route: Route): string {
  const segment = segments[route];
  return segment ? `${locale}/${segment}/` : `${locale}/`;
}

/** Output file for a page inside the build directory. */
export function pageFile(locale: Locale, route: Route): string {
  return `${pagePath(locale, route)}index.html`;
}

/**
 * Relative URL from one page to a root-relative target, so the prerendered
 * site works from any base path and host.
 */
export function relative(from: string, target: string): string {
  const depth = from.split("/").filter(Boolean).length;
  return `${"../".repeat(depth)}${target}` || "./";
}

export const GITHUB_URL = "https://github.com/erfanmola/TMA-Studio";
export const PROFILES = [
  "Android",
  "iOS",
  "Telegram Desktop",
  "macOS",
  "Web A",
  "Web K",
] as const;
