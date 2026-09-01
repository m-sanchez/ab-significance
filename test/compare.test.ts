import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareModels } from '../src/compare.ts';
import type { Outcome } from '../src/paired.ts';

/** Two models over the same ids, with per-example correctness supplied as
 * boolean arrays (true = right). */
function outcomes(bools: boolean[]): Outcome[] {
  return bools.map((correct, i) => ({ id: String(i), correct }));
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 0x100000000;
  };
}

test('a real, large improvement is called B better with a positive interval', () => {
  const rand = seeded(4);
  const n = 500;
  const a: boolean[] = [];
  const b: boolean[] = [];
  for (let i = 0; i < n; i++) {
    a.push(rand() < 0.7);
    b.push(rand() < 0.82); // genuinely better
  }
  const c = compareModels(outcomes(a), outcomes(b), { minEffectPct: 2 });
  assert.equal(c.verdict, 'B better');
  assert.ok(c.mcnemar.separable);
  assert.ok(c.bootstrap.low > 0, 'the whole interval is above zero');
});

test('two models of equal skill are not distinguished, whatever the point delta', () => {
  const rand = seeded(11);
  const n = 200;
  const a: boolean[] = [];
  const b: boolean[] = [];
  for (let i = 0; i < n; i++) {
    a.push(rand() < 0.75);
    b.push(rand() < 0.75); // same skill, independent draws
  }
  const c = compareModels(outcomes(a), outcomes(b));
  assert.equal(c.verdict, 'no separable difference');
  assert.match(c.statement, /within sampling noise/);
});

test('a separable but tiny difference is held below the declared bar', () => {
  // construct a table: 20 discordant, 15 favour B, 5 favour A -> separable,
  // but only a 10pp point difference; declare a 15pp bar
  const bothRight = Array(70).fill(true);
  const a = [...bothRight, ...Array(15).fill(false), ...Array(5).fill(true), ...Array(10).fill(false)];
  const b = [...bothRight, ...Array(15).fill(true), ...Array(5).fill(false), ...Array(10).fill(false)];
  const c = compareModels(outcomes(a), outcomes(b), { minEffectPct: 15, seed: 3 });
  assert.ok(c.mcnemar.separable, 'the sign is resolved');
  assert.equal(c.verdict, 'separable but below the declared bar');
  assert.match(c.statement, /below the 15pp bar/);
});

test('the statement reports the common-valid n and any exclusions', () => {
  const a: Outcome[] = [
    { id: '1', correct: true },
    { id: '2', correct: false },
    { id: '3', correct: true }
  ];
  const b: Outcome[] = [
    { id: '1', correct: true },
    { id: '2', correct: true },
    { id: '3', correct: null } // B abstained
  ];
  const c = compareModels(a, b);
  assert.equal(c.table.n, 2);
  assert.match(c.statement, /1 excluded, one side unscored/);
});
