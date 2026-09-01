/** Where this implementation differs from the references people cross-check
 * against, pinned so the difference is a decision rather than a surprise.
 *
 * This is deliberately not a parity table. The default path - the exact
 * two-sided binomial - already agrees with scipy to machine precision, so a
 * broad table of matching values would prove nothing anyone doubted. What is
 * worth checking in is the short list of points where a user comparing this
 * package against R or statsmodels sees a different number and has to decide
 * which one is broken.
 *
 * The reference column was generated once with scipy 1.17.1:
 *
 *   from scipy.stats import chi2
 *   for a, b in [(2, 3), (3, 11), (0, 6), (10, 25), (40, 60), (1, 12),
 *                (100, 150), (0, 30), (159, 161), (50, 52), (7, 7), (3, 3)]:
 *       d, m = abs(a - b), a + b
 *       stat = (d - 1) ** 2 / m
 *       print(a, b, repr(float(chi2.sf(stat, 1))))
 *
 * `(d - 1) ** 2 / m` is the statistic R's mcnemar.test and statsmodels'
 * mcnemar(exact=False, correction=True) both compute: the continuity
 * correction is applied without a floor at zero. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mcnemar } from '../src/mcnemar.ts';

/** [aOnly, bOnly, scipy chi2.sf((|b-c|-1)^2/(b+c), 1)] */
const REFERENCE: [number, number, number][] = [
  [2, 3, 1.0], // |b-c| = 1: the correction lands on chi2 = 0 either way
  [159, 161, 0.9554201169935637], // where the erfc fit is least accurate
  [50, 52, 0.9211265554360596],
  [3, 11, 0.061368829139402316],
  [40, 60, 0.05743311963200335],
  [0, 6, 0.041226833337163815],
  [10, 25, 0.01796047752607879],
  [1, 12, 0.005545667315244061],
  [100, 150, 0.0019415397850404208],
  [0, 30, 1.1924366854416797e-7]
];

test('the chi-square path matches the reference wherever the formulas agree', () => {
  // The survival function comes from the Numerical Recipes erfc fit, whose
  // stated accuracy is 1.2e-7. Measured against scipy over the argument
  // range this package can reach, the worst absolute error is 8.3e-8, at
  // chi2 = 0.003125 - which is exactly the (159, 161) row.
  let worst = 0;
  for (const [aOnly, bOnly, reference] of REFERENCE) {
    const p = mcnemar(aOnly, bOnly, { method: 'chi-square' }).p;
    const err = Math.abs(p - reference);
    worst = Math.max(worst, err);
    assert.ok(err <= 1.2e-7, `${aOnly},${bOnly}: ${p} vs scipy ${reference} (off by ${err})`);
  }
  assert.ok(worst <= 9e-8, `worst observed error ${worst} has drifted past the measured 8.3e-8`);
  assert.ok(worst > 1e-9, 'and it is a fit, not an exact function: the error is real');
});

test('the b === c divergence from R and statsmodels is deliberate', () => {
  // R and statsmodels compute (|b-c| - 1)^2 / (b+c) literally, so an even
  // split gives chi2 = 1/(b+c) rather than 0 and a p-value below 1: 0.789 at
  // b = c = 7. This implementation floors |b-c| - 1 at zero before squaring,
  // so an even split - the single most null-supporting table there is -
  // returns p = 1 rather than a p-value that drifts down as the discordant
  // count shrinks. Both conventions exist in the literature; this one is
  // chosen because it keeps the chi-square path monotone in the evidence and
  // agrees with the exact test, which is the default here.
  const divergences: [number, number, number][] = [
    [7, 7, 0.7892680261342813],
    [3, 3, 0.6830913983096086]
  ];
  for (const [aOnly, bOnly, reference] of divergences) {
    const p = mcnemar(aOnly, bOnly, { method: 'chi-square' }).p;
    assert.equal(p, 1, `${aOnly},${bOnly}: an even split is maximal support for the null here`);
    assert.ok(
      p - reference > 0.2,
      `and the divergence from the reference (${reference}) is the point of this test`
    );
    // the exact test, which is the default, agrees with this package's choice
    assert.equal(mcnemar(aOnly, bOnly).p, 1);
  }
});
