/** McNemar's test on the discordant pairs.
 *
 * Of the examples the two models disagreed on, how likely is a split this
 * lopsided if the two were really equally good? Under the null the
 * discordant pairs are fair coin flips, so the count that went to B is
 * Binomial(discordant, 0.5). For the small discordant counts a careful
 * evaluation produces (a sixty-item instrument disagrees on a handful),
 * the EXACT two-sided binomial test is the right tool, not the chi-square
 * approximation, which is unreliable when b + c is small. Both are here;
 * exact is the default. */

/** Two-sided exact binomial p-value for `k` successes in `n` fair trials.
 * Computed by summing the tail at or below the observed probability, in
 * log space so it is stable for large n. */
export function binomialTwoSided(k: number, n: number): number {
  if (n === 0) return 1;
  if (k < 0 || k > n) throw new RangeError(`k=${k} out of range for n=${n}`);
  const logChoose = (nn: number, kk: number) => logFactorial(nn) - logFactorial(kk) - logFactorial(nn - kk);
  const logProb = (kk: number) => logChoose(n, kk) + n * Math.log(0.5);
  const observed = logProb(k);
  const eps = 1e-9;
  let total = 0;
  for (let i = 0; i <= n; i++) {
    if (logProb(i) <= observed + eps) total += Math.exp(logProb(i));
  }
  return Math.min(1, total);
}

const _logFactorialCache = [0, 0];
function logFactorial(n: number): number {
  if (n < _logFactorialCache.length) return _logFactorialCache[n];
  let value = _logFactorialCache[_logFactorialCache.length - 1];
  for (let i = _logFactorialCache.length; i <= n; i++) {
    value += Math.log(i);
    _logFactorialCache[i] = value;
  }
  return _logFactorialCache[n];
}

export interface McNemarResult {
  /** the two discordant counts fed in (A-only, B-only) */
  aOnly: number;
  bOnly: number;
  discordant: number;
  method: 'exact' | 'chi-square';
  /** two-sided p-value */
  p: number;
  /** the standard 0.05 threshold, stated so the caller does not invent one */
  separable: boolean;
  /** which model the disagreement favours, or null on a tie */
  favours: 'A' | 'B' | null;
}

export function mcnemar(
  aOnly: number,
  bOnly: number,
  opts: { method?: 'exact' | 'chi-square'; alpha?: number } = {}
): McNemarResult {
  const method = opts.method ?? 'exact';
  const alpha = opts.alpha ?? 0.05;
  const discordant = aOnly + bOnly;
  let p: number;
  if (method === 'exact') {
    p = binomialTwoSided(Math.min(aOnly, bOnly), discordant);
  } else {
    // chi-square with continuity correction; unreliable for small discordant.
    // The correction is |b-c|-1 floored at 0 BEFORE squaring, so |b-c| in
    // {0,1} gives chi2=0 and p=1 (maximal support for the null), matching
    // the exact test at an even split.
    if (discordant === 0) p = 1;
    else {
      const d = Math.max(0, Math.abs(aOnly - bOnly) - 1);
      const chi2 = (d * d) / discordant;
      // The erfc fit is a Chebyshev approximation, accurate to ~1.2e-7 but
      // not bounded by 1: erfc(0) evaluates to 1.0000000300000005, so an
      // even split used to return an impossible p-value. Clamp like the
      // exact path does at binomialTwoSided.
      p = Math.min(1, Math.max(0, chiSquareSurvival1df(chi2)));
    }
  }
  const favours = aOnly === bOnly ? null : bOnly > aOnly ? 'B' : 'A';
  return { aOnly, bOnly, discordant, method, p, separable: p < alpha, favours };
}

/** Upper-tail probability of the chi-square distribution with 1 dof, via
 * the error function: P(X > x) = erfc(sqrt(x/2)). */
function chiSquareSurvival1df(x: number): number {
  return erfc(Math.sqrt(x / 2));
}

/** Numerical Recipes erfcc: erfc to ~1.2e-7 via a Chebyshev fit, evaluated
 * with Horner's method over a flat coefficient list (no deep nesting). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const c = [
    -1.26551223, 1.00002368, 0.37409196, 0.09678418, -0.18628806, 0.27886807,
    -1.13520398, 1.48851587, -0.82215223, 0.17087277
  ];
  let poly = c[c.length - 1];
  for (let i = c.length - 2; i >= 0; i--) poly = poly * t + c[i];
  const tau = t * Math.exp(-z * z + poly);
  return x >= 0 ? tau : 2 - tau;
}
