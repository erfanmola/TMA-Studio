import ar from "../locales/ar.json";
import de from "../locales/de.json";
import en from "../locales/en.json";
import fa from "../locales/fa.json";
import ru from "../locales/ru.json";

export const LOCALES = ["en", "ru", "de", "fa", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export type Direction = "ltr" | "rtl";
export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = { en, ru, de, fa, ar };

export function directionFor(locale: Locale): Direction {
  return locale === "fa" || locale === "ar" ? "rtl" : "ltr";
}

export function loadingCopy(
  locale: Locale,
): Dictionary["loading"] & Dictionary["locale"] {
  return { ...dictionaries[locale].loading, ...dictionaries[locale].locale };
}

export function applyDocumentLocale(
  locale: Locale,
  root: Pick<HTMLHtmlElement, "lang" | "dir"> = document.documentElement,
): void {
  root.lang = locale;
  root.dir = directionFor(locale);
}

/** Replaces `{name}` placeholders with plain text values (never HTML). */
export function formatMessage(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? match) : match,
  );
}
