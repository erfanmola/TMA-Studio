import { describe, expect, test } from "bun:test";
import {
  initialsFor,
  projectColorIndex,
  telegramColorIndex,
} from "../../packages/ui/src/components/avatar-color";
import {
  formatBytes,
  formatShare,
} from "../../packages/ui/src/components/format";

describe("avatar colors", () => {
  test("uses exact BigInt abs(id % 7) beyond Number precision", () => {
    // 2^53 + 1 is not representable as a Number; Number(id) % 7 would be wrong.
    expect(telegramColorIndex("9007199254740993")).toBe(
      Number(9007199254740993n % 7n),
    );
    expect(Number("9007199254740993") % 7).not.toBe(
      telegramColorIndex("9007199254740993"),
    );
    expect(telegramColorIndex("5000000003")).toBe(Number(5000000003n % 7n));
  });

  test("negative chat IDs use the absolute remainder", () => {
    expect(telegramColorIndex("-1001234567890")).toBe(
      Number(1001234567890n % 7n),
    );
    expect(telegramColorIndex("-7")).toBe(0);
  });

  test("explicit peer overrides win and invalid inputs never throw", () => {
    expect(telegramColorIndex("5000000003", 6)).toBe(6);
    expect(telegramColorIndex("5000000003", 9)).toBe(Number(5000000003n % 7n));
    expect(telegramColorIndex("12a")).toBe(0);
    expect(telegramColorIndex("")).toBe(0);
  });

  test("project index is persisted input, clamped when corrupt", () => {
    expect(projectColorIndex(4)).toBe(4);
    expect(projectColorIndex(7)).toBe(0);
    expect(projectColorIndex(2.5)).toBe(0);
    expect(projectColorIndex(undefined)).toBe(0);
  });
});

describe("grapheme-aware initials", () => {
  test("takes first and last word initials", () => {
    expect(initialsFor("Alex Morgan")).toBe("AM");
    expect(initialsFor("Nima")).toBe("N");
    expect(initialsFor("  sara   de   klein ")).toBe("SK");
  });

  test("keeps emoji, ZWJ and combining sequences whole", () => {
    expect(initialsFor("👩‍💻 Dev")).toBe("👩‍💻D");
    expect(initialsFor("émile zola")).toBe("ÉZ");
    expect(initialsFor("🇮🇷 Team")).toBe("🇮🇷T");
  });

  test("handles Persian, Arabic and locale casing", () => {
    expect(initialsFor("آرش مرادی", "fa")).toBe("آم");
    expect(initialsFor("أحمد مراد", "ar")).toBe("أم");
    expect(initialsFor("istanbul ilçe", "tr")).toBe("İİ");
    expect(initialsFor("  -- ")).toBe("");
  });
});

describe("storage formatting", () => {
  test("formats decimal byte units per locale", () => {
    expect(formatBytes(0, "en")).toBe("0 byte");
    expect(formatBytes(128_000_000, "en")).toBe("128 MB");
    expect(formatBytes(1_500_000_000, "en")).toBe("1.5 GB");
    expect(formatBytes(128_000_000, "fa")).toContain("۱۲۸");
    expect(formatBytes(Number.NaN, "en")).toBe("");
    expect(formatBytes(-1, "en")).toBe("");
  });

  test("formats shares and marks tiny non-zero parts", () => {
    expect(formatShare(128, 500, "en")).toBe("26%");
    expect(formatShare(1, 1000, "en")).toBe("<1%");
    expect(formatShare(0, 1000, "en")).toBe("0%");
    expect(formatShare(1, 0, "en")).toBe("");
  });
});
