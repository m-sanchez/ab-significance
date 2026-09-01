/** How many examples would it have taken?
 *
 * The honest answer to a comparison is very often "no separable difference",
 * and the honest answer alone leaves the caller stuck: a real ten-point gap
 * on sixty items is missed about two times in three (measured in
 * test/operating-characteristics.test.ts). The next question is always "how
 * many examples do I need", and the exact binomial machinery to answer it is
 * already here.
 *
 * The model is the one McNemar tests. Each example is discordant with
 * probability `discordanceRate`; a discordant example favours B with
 * probability 0.5 + effect / (2 * discordanceRate), which makes the accuracy
 * difference exactly `effect`. The discordant count is Binomial(n,
 * discordanceRate), and given that count the exact test's rejection region is
 * enumerated directly - no simulation, no dependency, the same answer every
 * time. */

import { binomialTwoSided, logFactorial } from './mcnemar.ts';

export interface PowerModel {
  /** the accuracy gap worth detecting, |B - A| in percentage points */
  minEffectPct: number;
  /** fraction of examples on which the two models disagree. Read it off a
   * pilot run: `table.discordant / table.n`. */
  discordanceRate: number;
  /** probability of declaring separability when the gap is real; default 0.8 */
  power?: number;
  /** significance threshold; default 0.05 */
  alpha?: number;
}

/** the largest n `requiredN` will search; past this the question is better
 * answered by widening the bar than by collecting examples */
const MAX_N = 50000;

/** Probability that the exact test declares separability at this n, for this
 * true gap and discordance rate. Exact: the discordant count is summed over
 * its binomial distribution and the rejection region is enumerated. */
export function powerAt(opts: PowerModel & { n: number }): number {
  const { n } = opts;
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`n must be a non-negative integer, got ${n}`);
  }
  const { effect, discordance, alpha } = validate(opts);
  const piB = 0.5 + effect / (2 * discordance);

  const logD = Math.log(discordance);
  const log1D = discordance === 1 ? 0 : Math.log(1 - discordance);
  const mode = n * discordance;
  let total = 0;
  for (let m = 0; m <= n; m++) {
    // guarded so an empty term is zero rather than 0 * -Infinity = NaN, which
    // is reachable whenever discordance is 1 or the gap uses every
    // disagreement
    if (discordance === 1 && m < n) continue;
    const logMass =
      logFactorial(n) - logFactorial(m) - logFactorial(n - m) + m * logD + (n - m) * log1D;
    const mass = Math.exp(logMass);
    // the mixture over m is sharply peaked; the tails below this cannot move
    // the answer at double precision
    if (mass < 1e-15) {
      if (m > mode) break;
      continue;
    }
    total += mass * rejectionProbability(m, piB, alpha);
  }
  return total;
}

/** The smallest common-valid n at which a gap of `minEffectPct` is declared
 * separable with at least `power`. */
export function requiredN(opts: PowerModel): number {
  const { effect, discordance, power } = validate(opts);
  // a normal-approximation bound first, so an unanswerable question fails
  // immediately instead of after a long exact search
  const approx = (7.85 * discordance) / (effect * effect);
  if (approx > MAX_N) {
    throw new RangeError(
      `detecting ${opts.minEffectPct}pp at ${(discordance * 100).toFixed(1)}% discordance needs on ` +
        `the order of ${Math.round(approx)} examples, past the ${MAX_N} this searches. Widen ` +
        `minEffectPct, or accept that the comparison is out of reach.`
    );
  }

  let hi = 1;
  while (hi <= MAX_N && powerAt({ ...opts, n: hi }) < power) hi *= 2;
  if (hi > MAX_N) throw new RangeError(`no n at or below ${MAX_N} reaches power ${power}`);
  let lo = Math.floor(hi / 2);
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (powerAt({ ...opts, n: mid }) >= power) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The smallest gap this n can resolve at the requested power: what the eval
 * you already have is capable of seeing. */
export function minimumDetectableEffect(
  opts: Omit<PowerModel, 'minEffectPct'> & { n: number }
): number {
  const { discordance, power } = validate({ ...opts, minEffectPct: 1 });
  // the largest gap this discordance rate admits is every disagreement
  // falling the same way
  const ceiling = discordance * 100;
  const best = powerAt({ ...opts, minEffectPct: ceiling });
  if (best < power) {
    throw new RangeError(
      `at n=${opts.n} with ${(discordance * 100).toFixed(1)}% discordance no gap reaches power ` +
        `${power}: even a perfect ${ceiling.toFixed(1)}pp split reaches only ` +
        `${(best * 100).toFixed(1)}%.`
    );
  }
  let lo = 0;
  let hi = ceiling;
  for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
    const mid = (lo + hi) / 2;
    if (powerAt({ ...opts, minEffectPct: mid }) >= power) hi = mid;
    else lo = mid;
  }
  // rounded up, so the returned gap is one the eval can actually resolve
  return Math.ceil(hi * 100) / 100;
}

function validate(opts: PowerModel): {
  effect: number;
  discordance: number;
  power: number;
  alpha: number;
} {
  const effect = Math.abs(opts.minEffectPct) / 100;
  const discordance = opts.discordanceRate;
  const power = opts.power ?? 0.8;
  const alpha = opts.alpha ?? 0.05;
  if (!(discordance > 0 && discordance <= 1)) {
    throw new RangeError(`discordanceRate must be in (0, 1], got ${opts.discordanceRate}`);
  }
  if (!(effect > 0)) {
    throw new RangeError('minEffectPct must be non-zero: a gap of zero is never detectable');
  }
  if (effect > discordance) {
    throw new RangeError(
      `a ${opts.minEffectPct}pp gap needs at least ${(effect * 100).toFixed(1)}% of examples to be ` +
        `discordant, but discordanceRate is ${(discordance * 100).toFixed(1)}%`
    );
  }
  if (!(power > 0 && power < 1)) throw new RangeError(`power must be in (0, 1), got ${power}`);
  if (!(alpha > 0 && alpha < 1)) throw new RangeError(`alpha must be in (0, 1), got ${alpha}`);
  return { effect, discordance, power, alpha };
}

const _criticalCache = new Map<string, number>();
/** The largest k for which a k-versus-(m-k) split of m discordant pairs is
 * declared separable, or -1 when m pairs cannot reach alpha however they
 * fall - which is why five discordant pairs are never significant at 0.05. */
function criticalCount(m: number, alpha: number): number {
  const key = `${m}:${alpha}`;
  const hit = _criticalCache.get(key);
  if (hit !== undefined) return hit;
  // binomialTwoSided(j, m) is 2 * P(X <= j) for j < m/2, so it rises with j
  // and the boundary can be bisected
  let lo = 0;
  let hi = Math.floor((m - 1) / 2);
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (binomialTwoSided(mid, m) < alpha) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  _criticalCache.set(key, best);
  return best;
}

/** P(the exact test rejects | m discordant pairs), when each discordant pair
 * favours B with probability piB */
function rejectionProbability(m: number, piB: number, alpha: number): number {
  const crit = criticalCount(m, alpha);
  if (crit < 0) return 0;
  // piB reaches exactly 1 when the declared gap uses every disagreement (an
  // effect equal to the discordance rate), so the empty term has to be
  // dropped rather than evaluated as 0 * -Infinity = NaN
  const logPi = Math.log(piB);
  const log1Pi = piB === 1 ? 0 : Math.log(1 - piB);
  const pmf = (k: number) => {
    if (piB === 1) return k === m ? 1 : 0;
    const lp =
      logFactorial(m) - logFactorial(k) - logFactorial(m - k) + k * logPi + (m - k) * log1Pi;
    return Math.exp(lp);
  };
  // the region is the two symmetric tails, k <= crit and k >= m - crit, and
  // crit < m/2 keeps them disjoint
  let total = 0;
  for (let k = 0; k <= crit; k++) total += pmf(k) + pmf(m - k);
  return total;
}
