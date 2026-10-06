import { describe, expect, test } from "bun:test";
import {
  checkRegression,
  mean,
  monotonicGrowth,
  stddev,
} from "../../scripts/perf-stats.mjs";

describe("perf statistics (11c)", () => {
  test("mean/stddev over repeated samples", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(stddev([5, 5, 5])).toBe(0);
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 0);
    expect(() => mean([])).toThrow();
  });

  test("quiet hardware catches drift; noisy hardware tolerates variance", () => {
    const quiet = checkRegression([10, 10, 10, 10, 10], [10, 10, 10, 10, 16], {
      absoluteFloor: 0.5,
    });
    expect(quiet.regressed).toBe(true);
    const noisy = checkRegression([10, 20, 10, 20, 10], [11, 21, 11, 21, 11], {
      absoluteFloor: 0.5,
    });
    expect(noisy.regressed).toBe(false);
    expect(noisy.tolerance).toBeGreaterThan(0.5);
  });

  test("monotonic growth needs slack beyond noise", () => {
    expect(monotonicGrowth(100, 101, 25)).toBe(false);
    expect(monotonicGrowth(100, 130, 25)).toBe(true);
  });
});
