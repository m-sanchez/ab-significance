/** Measured operating characteristics.
 *
 * The README used to assert "a ten-point gap on a sixty-item eval is usually
 * inside the noise" on the author's intuition. This file measures it, and the
 * numbers it produces are the numbers published in README.md. Everything here
 * is deterministic: tables are drawn from the same seeded LCG the bootstrap
 * uses (src/bootstrap.ts), so a rerun on any machine reproduces the table
 * rather than re-rolling it.
 *
 * Each replicate draws n examples from a four-cell distribution
 * [bothCorrect, bothWrong, aOnly, bOnly]. The true accuracy difference is
 * 100 * (bOnly - aOnly) percentage points and the discordance rate is
 * aOnly + bOnly, which is what actually drives the exact test. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mcnemar } from '../src/mcnemar.ts';
import { bootstrapDiff } from '../src/bootstrap.ts';
import type { PairedPoint } from '../src/bootstrap.ts';

/** the LCG from src/bootstrap.ts, so the whole file is reproducible */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const TT: PairedPoint = { aCorrect: true, bCorrect: true };
const FF: PairedPoint = { aCorrect: false, bCorrect: false };
const TF: PairedPoint = { aCorrect: true, bCorrect: false };
const FT: PairedPoint = { aCorrect: false, bCorrect: true };

/** no true difference, A 80% and B 80%, 20% of examples discordant */
const NULL_20 = [0.7, 0.1, 0.1, 0.1];
/** a true +10pp gap, A 72% and B 82%, 20% of examples discordant */
const ALT_10 = [0.67, 0.13, 0.05, 0.15];
/** a true -5pp gap on two accurate models, A 94.5% and B 89.5%, only 7% of
 * examples discordant - the regime where the interval has almost nothing to
 * resample */
const THIN_5 = [0.885, 0.045, 0.06, 0.01];

/** how often the exact test declares the models separable */
function separationRate(n: number, w: number[], reps: number, alpha: number, seed: number): number {
  const rand = lcg(seed);
  const cum = [w[0], w[0] + w[1], w[0] + w[1] + w[2], 1];
  let separable = 0;
  for (let r = 0; r < reps; r++) {
    let aOnly = 0;
    let bOnly = 0;
    for (let i = 0; i < n; i++) {
      const u = rand();
      let k = 0;
      while (u >= cum[k] && k < 3) k++;
      if (k === 2) aOnly++;
      else if (k === 3) bOnly++;
    }
    if (mcnemar(aOnly, bOnly, { alpha }).separable) separable++;
  }
  return (100 * separable) / reps;
}

/** how often the 95% interval contains the true difference */
function coverage(
  n: number,
  w: number[],
  truePP: number,
  reps: number,
  iterations: number,
  seed: number
): number {
  const rand = lcg(seed);
  const cum = [w[0], w[0] + w[1], w[0] + w[1] + w[2], 1];
  const pairs: PairedPoint[] = new Array(n);
  let inside = 0;
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < n; i++) {
      const u = rand();
      let k = 0;
      while (u >= cum[k] && k < 3) k++;
      pairs[i] = k === 0 ? TT : k === 1 ? FF : k === 2 ? TF : FT;
    }
    const ci = bootstrapDiff(pairs, { iterations, seed: 1000 + r });
    if (ci.low <= truePP && truePP <= ci.high) inside++;
  }
  return (100 * inside) / reps;
}

const REPS = 5000;
const COVERAGE_REPS = 500;
const COVERAGE_ITERATIONS = 600;

/** The table printed in README.md. If a change to the statistics moves these,
 * the README is wrong and this test says so. */
const PUBLISHED = {
  typeI: { 60: 2.1, 100: 3.0, 200: 3.6, 400: 4.1 },
  power10pp: { 60: 31.3, 100: 54.8, 200: 87.1, 400: 99.5 },
  coverage: {
    alt10: { 30: 94.8, 100: 95.4 },
    null20: { 30: 94.6, 100: 95.0 },
    thin5: { 30: 85.6, 100: 94.8 }
  }
} as const;

test('type-I error stays at or below the nominal alpha', () => {
  for (const n of [60, 100, 200, 400] as const) {
    const rate = separationRate(n, NULL_20, REPS, 0.05, 20250901 + n);
    assert.ok(rate <= 5, `n=${n}: false-positive rate ${rate}% exceeds alpha=5%`);
    assert.ok(
      Math.abs(rate - PUBLISHED.typeI[n]) <= 0.5,
      `n=${n}: measured ${rate}%, README publishes ${PUBLISHED.typeI[n]}%`
    );
  }
  // The exact test is conservative because the discordant count is discrete:
  // there is no critical region with exactly 5% mass. That is worth stating
  // rather than rounding away.
  const at60 = separationRate(60, NULL_20, REPS, 0.05, 20250901 + 60);
  assert.ok(at60 < 3, `the shortfall is real, not rounding: ${at60}%`);
});

test('power against a true ten-point gap lands in the published band', () => {
  const measured: Record<number, number> = {};
  for (const n of [60, 100, 200, 400] as const) {
    const rate = separationRate(n, ALT_10, REPS, 0.05, 77000 + n);
    measured[n] = rate;
    assert.ok(
      Math.abs(rate - PUBLISHED.power10pp[n]) <= 1,
      `n=${n}: measured ${rate}%, README publishes ${PUBLISHED.power10pp[n]}%`
    );
  }
  // the README's headline claim: a ten-point gap on sixty items is usually
  // inside the noise. "Usually" means the test misses it more often than not.
  assert.ok(measured[60] < 50, `a 10pp gap at n=60 is detected ${measured[60]}% of the time`);
  assert.ok(measured[100] < 70, `and still under-detected at n=100: ${measured[100]}%`);
  assert.ok(measured[200] > 80, `but resolved by n=200: ${measured[200]}%`);
  assert.ok(measured[400] > 99, `and near-certain by n=400: ${measured[400]}%`);
  assert.ok(
    measured[60] < measured[100] && measured[100] < measured[200] && measured[200] < measured[400],
    'power rises with n'
  );
});

test('interval coverage is near nominal where the discordant count is not tiny', () => {
  for (const [label, w, truePP, published] of [
    ['a true +10pp gap, 20% discordance', ALT_10, 10, PUBLISHED.coverage.alt10],
    ['no true difference, 20% discordance', NULL_20, 0, PUBLISHED.coverage.null20]
  ] as const) {
    for (const n of [30, 100] as const) {
      const seed = (w === ALT_10 ? 5150 : 6150) + n;
      const cov = coverage(n, w, truePP, COVERAGE_REPS, COVERAGE_ITERATIONS, seed);
      assert.ok(cov >= 93 && cov <= 97, `${label}, n=${n}: coverage ${cov}% is not near 95%`);
      assert.ok(
        Math.abs(cov - published[n]) <= 2,
        `${label}, n=${n}: measured ${cov}%, README publishes ${published[n]}%`
      );
    }
  }
});

test('interval coverage falls short when there is almost nothing to resample', () => {
  // A 94.5% vs B 89.5% on 30 examples: about two discordant pairs per
  // replicate, and a percentile interval built from resampling two pairs
  // frequently misses the true 5-point gap entirely. This is the caveat the
  // "Honest limits" section owes the reader, and it is measured, not guessed.
  const small = coverage(30, THIN_5, -5, COVERAGE_REPS, COVERAGE_ITERATIONS, 7150 + 30);
  assert.ok(small < 90, `expected material under-coverage at n=30, measured ${small}%`);
  assert.ok(
    Math.abs(small - PUBLISHED.coverage.thin5[30]) <= 2,
    `n=30: measured ${small}%, README publishes ${PUBLISHED.coverage.thin5[30]}%`
  );

  const larger = coverage(30 + 70, THIN_5, -5, COVERAGE_REPS, COVERAGE_ITERATIONS, 7150 + 100);
  assert.ok(larger >= 93, `and recovers by n=100: measured ${larger}%`);
  assert.ok(
    Math.abs(larger - PUBLISHED.coverage.thin5[100]) <= 2,
    `n=100: measured ${larger}%, README publishes ${PUBLISHED.coverage.thin5[100]}%`
  );
});
