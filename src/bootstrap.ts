/** Paired bootstrap confidence interval for the accuracy difference.
 *
 * The p-value says "is there a difference"; the interval says "how big,
 * and how sure". Resample the common-valid examples with replacement many
 * times, and each time recompute B's accuracy minus A's on the resample.
 * The middle 95% of those differences is the confidence interval. Pairing
 * (resampling examples, not the two models independently) keeps the
 * correlation between the models intact, which is the whole point of
 * testing them on the same data. The RNG is a seeded LCG so a reported
 * interval reproduces exactly. */

export interface PairedPoint {
  aCorrect: boolean;
  bCorrect: boolean;
}

export interface BootstrapInterval {
  /** observed accuracy difference, B - A, in percentage points */
  observed: number;
  /** 95% (or `level`) interval, in percentage points */
  low: number;
  high: number;
  level: number;
  iterations: number;
  /** the interval excludes zero: the sign of the difference is resolved */
  significant: boolean;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function bootstrapDiff(
  pairs: PairedPoint[],
  opts: { iterations?: number; level?: number; seed?: number } = {}
): BootstrapInterval {
  const iterations = opts.iterations ?? 10000;
  const level = opts.level ?? 0.95;
  const n = pairs.length;
  const pct = (hits: number) => (100 * hits) / n;
  const observedA = pairs.filter((p) => p.aCorrect).length;
  const observedB = pairs.filter((p) => p.bCorrect).length;
  const observed = pct(observedB) - pct(observedA);
  if (n === 0) return { observed: 0, low: 0, high: 0, level, iterations, significant: false };

  const rand = lcg(opts.seed ?? 42);
  const diffs = new Float64Array(iterations);
  for (let it = 0; it < iterations; it++) {
    let aHits = 0;
    let bHits = 0;
    for (let i = 0; i < n; i++) {
      const pick = pairs[Math.floor(rand() * n)];
      if (pick.aCorrect) aHits++;
      if (pick.bCorrect) bHits++;
    }
    diffs[it] = pct(bHits) - pct(aHits);
  }
  diffs.sort();
  const loIdx = Math.floor(((1 - level) / 2) * iterations);
  const hiIdx = Math.ceil((1 - (1 - level) / 2) * iterations) - 1;
  const low = diffs[loIdx];
  const high = diffs[hiIdx];
  return { observed, low, high, level, iterations, significant: low > 0 || high < 0 };
}
