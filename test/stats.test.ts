import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapDiff } from '../src/bootstrap.ts';
import { binomialTwoSided, mcnemar } from '../src/mcnemar.ts';
import { pairedTable } from '../src/paired.ts';
import type { Outcome } from '../src/paired.ts';

test('two-sided binomial matches the hand-computed tail', () => {
  // 0 of 5 fair flips: p = 2 * (1/32) = 0.0625
  assert.ok(Math.abs(binomialTwoSided(0, 5) - 0.0625) < 1e-12);
  // 5 of 10: dead centre, p = 1
  assert.equal(binomialTwoSided(5, 10), 1);
  // n=0: nothing to test
  assert.equal(binomialTwoSided(0, 0), 1);
});

test('exact McNemar: a lopsided small split is significant, an even one is not', () => {
  const lopsided = mcnemar(1, 12); // 12 of 13 disagreements favour B
  assert.ok(lopsided.p < 0.05 && lopsided.separable);
  assert.equal(lopsided.favours, 'B');

  const even = mcnemar(6, 7);
  assert.ok(even.p > 0.05 && !even.separable);
});

test('exact and chi-square agree for large discordant counts', () => {
  const exact = mcnemar(40, 60, { method: 'exact' });
  const chi = mcnemar(40, 60, { method: 'chi-square' });
  assert.ok(Math.abs(exact.p - chi.p) < 0.03, `exact ${exact.p} vs chi ${chi.p}`);
});

test('no discordant pairs means nothing to separate', () => {
  const r = mcnemar(0, 0);
  assert.equal(r.p, 1);
  assert.equal(r.favours, null);
});

test('the paired table restricts to the common-valid subset and names exclusions', () => {
  const a: Outcome[] = [
    { id: '1', correct: true },
    { id: '2', correct: false },
    { id: '3', correct: true }, // B skipped this one
    { id: '4', correct: null } // A skipped
  ];
  const b: Outcome[] = [
    { id: '1', correct: true },
    { id: '2', correct: true },
    { id: '3', correct: null },
    { id: '4', correct: true }
  ];
  const t = pairedTable(a, b);
  assert.equal(t.n, 2, 'only examples 1 and 2 were scored by both');
  assert.equal(t.bothCorrect, 1);
  assert.equal(t.bOnly, 1); // example 2: B right, A wrong
  assert.deepEqual(t.excluded.onlyA, ['3']);
  assert.deepEqual(t.excluded.onlyB, ['4']);
});

test('a skipped hard example is never counted as a loss for the skipper', () => {
  // A answers everything and does poorly; B answers only the easy ones
  const a: Outcome[] = Array.from({ length: 10 }, (_, i) => ({ id: String(i), correct: i < 4 }));
  const b: Outcome[] = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    correct: i < 4 ? true : null // B abstains on the hard 6
  }));
  const t = pairedTable(a, b);
  assert.equal(t.n, 4, 'comparison happens only where both answered');
  assert.equal(t.excluded.onlyA.length, 6, 'B abstentions are excluded, not scored as B losses');
});

test('paired bootstrap interval reproduces with a fixed seed and brackets the observed diff', () => {
  const pairs = [
    ...Array(70).fill({ aCorrect: true, bCorrect: true }),
    ...Array(10).fill({ aCorrect: false, bCorrect: false }),
    ...Array(4).fill({ aCorrect: true, bCorrect: false }),
    ...Array(16).fill({ aCorrect: false, bCorrect: true })
  ];
  const a = bootstrapDiff(pairs, { seed: 1, iterations: 5000 });
  const b = bootstrapDiff(pairs, { seed: 1, iterations: 5000 });
  assert.deepEqual(a, b, 'same seed, same interval');
  assert.ok(a.low <= a.observed && a.observed <= a.high);
  assert.ok(Math.abs(a.observed - 12) < 1e-9, 'B - A = (16-4)/100 * 100 = 12pp');
  assert.ok(a.significant, 'the interval excludes zero');
});

test('chi-square agrees with exact at an even split: |b-c| in {0,1} gives p~1', () => {
  // the continuity correction floors |b-c|-1 at 0 before squaring, so chi2=0
  // and p = erfc(0) ~ 1 (the erfc fit is exact to ~1e-7)
  assert.ok(mcnemar(7, 7, { method: 'chi-square' }).p > 1 - 1e-6, 'b=c is maximal support for the null');
  assert.ok(mcnemar(7, 8, { method: 'chi-square' }).p > 1 - 1e-6, '|b-c|=1 too');
  // and it is monotone: a less even split is more, not less, significant
  const even = mcnemar(7, 7, { method: 'chi-square' }).p;
  const skew = mcnemar(3, 11, { method: 'chi-square' }).p;
  assert.ok(skew < even, 'a lopsided split is more significant than an even one');
});
