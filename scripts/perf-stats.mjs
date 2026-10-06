/**
 * Variance-aware statistics for the shell performance runner. No universal
 * RSS/time limits live here: baselines are recorded per named hardware and
 * regressions are judged against repeated-run variance.
 */
export function mean(samples) {
  if (samples.length === 0) throw new Error("Need at least one sample.");
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

export function stddev(samples) {
  if (samples.length < 2) return 0;
  const average = mean(samples);
  const variance =
    samples.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (samples.length - 1);
  return Math.sqrt(variance);
}

/**
 * Compares a current repeated measurement against a baseline. The tolerance
 * is the larger of an absolute floor and a multiple of the baseline's own
 * standard deviation, so noisy hardware does not fail stable code and quiet
 * hardware still catches real drift.
 */
export function checkRegression(
  baseline,
  current,
  options = { absoluteFloor: 0 },
) {
  const baselineMean = mean(baseline);
  const currentMean = mean(current);
  const tolerance = Math.max(
    options.absoluteFloor,
    stddev(baseline) * (options.stddevMultiple ?? 3),
  );
  return {
    regressed: currentMean > baselineMean + tolerance,
    baselineMean,
    currentMean,
    tolerance,
  };
}

export function monotonicGrowth(first, last, slack) {
  return last > first + slack;
}
