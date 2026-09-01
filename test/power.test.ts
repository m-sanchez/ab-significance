import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerAt, requiredN, minimumDetectableEffect } from '../src/power.ts';

test('the exact enumeration agrees with the simulated power', () => {
  // test/operating-characteristics.test.ts measures the same quantity by
  // simulation: 31.3% / 54.8% / 87.1% / 99.5% at n = 60 / 100 / 200 / 400 for
  // a true 10pp gap at 20% discordance, over 5000 replicates (Monte-Carlo
  // standard error about 0.7pp). Two independent routes to the same numbers:
  // the simulation checks the enumeration, and the enumeration checks the
  // simulation.
  const enumerated = {
    60: powerAt({ n: 60, minEffectPct: 10, discordanceRate: 0.2 }),
    100: powerAt({ n: 100, minEffectPct: 10, discordanceRate: 0.2 }),
    200: powerAt({ n: 200, minEffectPct: 10, discordanceRate: 0.2 }),
    400: powerAt({ n: 400, minEffectPct: 10, discordanceRate: 0.2 })
  };
  const simulated = { 60: 0.313, 100: 0.548, 200: 0.871, 400: 0.995 };
  for (const n of [60, 100, 200, 400] as const) {
    assert.ok(
      Math.abs(enumerated[n] - simulated[n]) < 0.015,
      `n=${n}: enumerated ${enumerated[n].toFixed(4)} vs simulated ${simulated[n]}`
    );
  }
  // and the enumeration is exact, so it is pinned to the digit
  assert.ok(Math.abs(enumerated[60] - 0.3075) < 5e-4, `${enumerated[60]}`);
  assert.ok(Math.abs(enumerated[400] - 0.995) < 5e-4, `${enumerated[400]}`);
});

test('requiredN returns the smallest n that reaches the power, and no smaller', () => {
  const cases: [number, number, number][] = [
    // minEffectPct, discordanceRate, expected n at 80% power and alpha 0.05
    [10, 0.2, 168],
    [5, 0.2, 658],
    [10, 0.4, 329]
  ];
  for (const [minEffectPct, discordanceRate, expected] of cases) {
    const n = requiredN({ minEffectPct, discordanceRate });
    assert.equal(n, expected, `${minEffectPct}pp at ${discordanceRate} discordance`);
    assert.ok(
      powerAt({ n, minEffectPct, discordanceRate }) >= 0.8,
      'the returned n reaches the power'
    );
    assert.ok(
      powerAt({ n: n - 1, minEffectPct, discordanceRate }) < 0.8,
      'and one example fewer does not'
    );
  }
});

test('requiredN moves the way sample size has to move', () => {
  const base = requiredN({ minEffectPct: 10, discordanceRate: 0.2 });
  assert.ok(requiredN({ minEffectPct: 5, discordanceRate: 0.2 }) > base, 'a smaller gap costs more');
  assert.ok(
    requiredN({ minEffectPct: 10, discordanceRate: 0.2, power: 0.95 }) > base,
    'more power costs more'
  );
  assert.ok(
    requiredN({ minEffectPct: 10, discordanceRate: 0.2, alpha: 0.01 }) > base,
    'a stricter alpha costs more'
  );
  // more disagreement means more information per example about the sign, but
  // a fixed percentage-point gap is a smaller share of a larger discordant
  // pool, so it takes more examples
  assert.ok(
    requiredN({ minEffectPct: 10, discordanceRate: 0.4 }) > base,
    'a fixed gap buried in more disagreement costs more'
  );
});

test('five discordant pairs cannot be significant however they fall', () => {
  // binomialTwoSided(0, 5) = 0.0625, so a clean sweep of five disagreements
  // still misses alpha = 0.05. With every example discordant and every
  // disagreement going one way, power is exactly 0 at n=5 and exactly 1 at
  // n=6 - the sharpest statement of what the exact test can and cannot do.
  assert.equal(powerAt({ n: 5, minEffectPct: 100, discordanceRate: 1 }), 0);
  assert.ok(Math.abs(powerAt({ n: 6, minEffectPct: 100, discordanceRate: 1 }) - 1) < 1e-12);
});

test('minimumDetectableEffect is the gap the eval you already have can resolve', () => {
  const pinned: [number, number][] = [
    // n, smallest gap resolvable at 80% power, alpha 0.05, 20% discordance
    [60, 16.21],
    [100, 12.78],
    [200, 9.12],
    [400, 6.44]
  ];
  for (const [n, expected] of pinned) {
    const mde = minimumDetectableEffect({ n, discordanceRate: 0.2 });
    assert.ok(Math.abs(mde - expected) < 0.02, `n=${n}: ${mde} vs ${expected}`);
    assert.ok(powerAt({ n, minEffectPct: mde, discordanceRate: 0.2 }) >= 0.8, 'and it is reachable');
    assert.ok(
      powerAt({ n, minEffectPct: mde - 0.5, discordanceRate: 0.2 }) < 0.8,
      'while half a point less is not'
    );
  }
  // the README's story: sixty items cannot resolve the ten-point gap that
  // started the argument
  assert.ok(minimumDetectableEffect({ n: 60, discordanceRate: 0.2 }) > 10);
});

test('the round trip between the two questions closes', () => {
  const n = requiredN({ minEffectPct: 10, discordanceRate: 0.2 });
  const mde = minimumDetectableEffect({ n, discordanceRate: 0.2 });
  assert.ok(mde <= 10 && mde > 9.5, `n=${n} resolves ${mde}pp, which should just cover 10pp`);
});

test('questions with no answer are refused, not answered', () => {
  assert.throws(
    () => requiredN({ minEffectPct: 0, discordanceRate: 0.2 }),
    /never detectable/,
    'a zero gap has no sample size'
  );
  assert.throws(
    () => requiredN({ minEffectPct: 30, discordanceRate: 0.2 }),
    /discordanceRate is 20.0%/,
    'a 30pp gap cannot live inside 20% disagreement'
  );
  assert.throws(() => requiredN({ minEffectPct: 10, discordanceRate: 0 }), /discordanceRate/);
  assert.throws(
    () => requiredN({ minEffectPct: 0.05, discordanceRate: 0.3 }),
    /out of reach/,
    'and a gap needing millions of examples says so instead of searching'
  );
  assert.throws(
    () => minimumDetectableEffect({ n: 20, discordanceRate: 0.05 }),
    /no gap reaches power/,
    'twenty examples at 5% discordance resolve nothing at all'
  );
});
