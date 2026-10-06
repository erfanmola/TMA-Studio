export const AVATAR_COLOR_COUNT = 7;

const decimalId = /^-?\d{1,40}$/u;

/**
 * Telegram peer color index: abs(id % 7) on the exact decimal ID. BigInt keeps
 * 64-bit user IDs and negative chat IDs exact. An explicit peer color override
 * wins when it is a valid index. Invalid IDs fall back to 0 without throwing.
 */
export function telegramColorIndex(
  id: string,
  override?: number | null,
): number {
  if (isColorIndex(override)) return override;
  if (!decimalId.test(id)) return 0;
  const remainder = BigInt(id) % BigInt(AVATAR_COLOR_COUNT);
  return Number(remainder < 0n ? -remainder : remainder);
}

export function isColorIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < AVATAR_COLOR_COUNT
  );
}

/** Project avatars persist their index once; bad stored values clamp to 0. */
export function projectColorIndex(stored: number | null | undefined): number {
  return isColorIndex(stored) ? stored : 0;
}

function firstGrapheme(text: string, locale?: string): string {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(text)) return segment;
  return "";
}

/**
 * Up to two initials from the first grapheme of the first and last words, so
 * emoji, combining marks and ZWJ sequences stay whole.
 */
export function initialsFor(name: string, locale?: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) =>
      /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(word),
    );
  if (words.length === 0) return "";
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words.at(-1) ?? "") : "";
  return `${firstGrapheme(first, locale)}${last ? firstGrapheme(last, locale) : ""}`.toLocaleUpperCase(
    locale,
  );
}
