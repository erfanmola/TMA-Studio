const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** Localized decimal byte size (1 kB = 1000 B), e.g. "128 MB" or "۱۲۸ مگابایت". */
export function formatBytes(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
  }).format(value);
}

/** Share of a total as a whole-percent label, "<1%" for tiny non-zero parts. */
export function formatShare(part: number, total: number, locale: string) {
  if (!(total > 0) || !(part >= 0)) return "";
  const ratio = part / total;
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    style: "percent",
  });
  if (ratio > 0 && ratio < 0.01) {
    return `<${formatter.format(0.01)}`;
  }
  return formatter.format(ratio);
}
