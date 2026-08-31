/** npm run demo: three comparisons a naive accuracy delta gets wrong.
 * Synthetic, seeded, reproducible. */

import { compareModels } from '../src/compare.ts';
import type { Outcome } from '../src/paired.ts';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    return (z >>> 0) / 0x100000000;
  };
}

function draw(rand: () => number, n: number, p: number): boolean[] {
  return Array.from({ length: n }, () => rand() < p);
}

const oc = (bools: (boolean | null)[]): Outcome[] =>
  bools.map((correct, i) => ({ id: String(i), correct }));

const rand = seeded(5);

console.log('1. a small instrument, a real 10-point gap\n');
{
  const a = oc(draw(rand, 60, 0.72));
  const b = oc(draw(rand, 60, 0.82));
  console.log('   ' + compareModels(a, b, { minEffectPct: 3 }).statement + '\n');
}

console.log('2. the same 10-point gap on 60 items - too few to be sure\n');
{
  // hand-build a 60-item table where B leads by 10pp but only 8 disagree
  const both = Array(46).fill(true);
  const a = oc([...both, ...Array(2).fill(true), ...Array(5).fill(false), ...Array(7).fill(false)]);
  const b = oc([...both, ...Array(2).fill(false), ...Array(5).fill(true), ...Array(7).fill(false)]);
  console.log('   ' + compareModels(a, b).statement + '\n');
}

console.log('3. B skips the hard questions and looks better than it is\n');
{
  const a = oc(Array.from({ length: 100 }, (_, i) => i < 55)); // 55% on everything
  const b = oc(Array.from({ length: 100 }, (_, i) => (i < 40 ? true : i < 55 ? false : null)));
  const c = compareModels(a, b);
  console.log('   ' + c.statement);
  console.log(`   (B's raw accuracy over what it answered would look like ${((40 / 55) * 100).toFixed(0)}%.)`);
}
