/** The README makes claims a reader is entitled to check: what the demo
 * prints, what verdicts the package can hand back, and what it depends on.
 * They are checked here against the package rather than left to proofreading. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareModels } from '../src/compare.ts';
import type { Outcome } from '../src/paired.ts';

const repoFile = (name: string) => fileURLToPath(new URL(`../${name}`, import.meta.url));
const readme = () => readFileSync(repoFile('README.md'), 'utf8');

/** README.md quotes the output of `npm run demo` as evidence for what the
 * package prints. Quoted output that the demo does not actually produce is a
 * claim the reader cannot check, so these fragments are copied verbatim from
 * the README and asserted against a real run. Changing the demo means
 * changing both. */
const QUOTED_IN_README = [
  'A 68.3%, B 78.3%; McNemar p=0.3075, B-A +10.0pp [-6.7, 25.0].',
  'The disagreement is within sampling noise; the models are not distinguishable here.',
  '(45 excluded, one side unscored): A 100.0%, B 72.7%; McNemar p=0.0001, ' +
    'B-A -27.3pp [-40.0, -16.4]. A is better, beyond noise and beyond the declared bar.',
  "(B's raw accuracy over what it answered would look like 73%.)"
];

test('the demo output quoted in the README is the output the demo produces', () => {
  const demo = fileURLToPath(new URL('../demo/demo.ts', import.meta.url));
  const run = spawnSync(process.execPath, [demo], { encoding: 'utf8' });
  assert.equal(run.status, 0, `demo exited ${run.status}: ${run.stderr}`);
  for (const fragment of QUOTED_IN_README) {
    assert.ok(
      run.stdout.includes(fragment),
      `README quotes a line the demo does not print:\n  ${fragment}\nactual output:\n${run.stdout}`
    );
  }
});

/** a paired table with exactly these cell counts */
function cells(bothCorrect: number, bothWrong: number, aOnly: number, bOnly: number) {
  const a: Outcome[] = [];
  const b: Outcome[] = [];
  let i = 0;
  const push = (ac: boolean, bc: boolean, k: number) => {
    for (let j = 0; j < k; j++, i++) {
      a.push({ id: String(i), correct: ac });
      b.push({ id: String(i), correct: bc });
    }
  };
  push(true, true, bothCorrect);
  push(false, false, bothWrong);
  push(true, false, aOnly);
  push(false, true, bOnly);
  return { a, b };
}

test('every verdict the package can emit is documented in the README', () => {
  // A verdict a caller can receive but cannot find in the README is a
  // surprise waiting in a consumer's switch statement.
  const emitted = new Set<string>();
  const bBetter = cells(70, 10, 4, 16);
  emitted.add(compareModels(bBetter.a, bBetter.b, { minEffectPct: 2, seed: 3 }).verdict);
  const aBetter = cells(70, 10, 16, 4);
  emitted.add(compareModels(aBetter.a, aBetter.b, { minEffectPct: 2, seed: 3 }).verdict);
  const flat = cells(50, 40, 5, 5);
  emitted.add(compareModels(flat.a, flat.b, { seed: 3 }).verdict);
  const tiny = cells(70, 10, 5, 15);
  emitted.add(compareModels(tiny.a, tiny.b, { minEffectPct: 15, seed: 3 }).verdict);
  const split = cells(102, 98, 0, 4);
  emitted.add(compareModels(split.a, split.b, { seed: 42 }).verdict);
  const disjoint = compareModels(
    [{ id: 'x-1', correct: true }],
    [{ id: 'y-1', correct: false }]
  );
  emitted.add(disjoint.verdict);

  assert.equal(emitted.size, 6, `expected all six verdicts, got ${[...emitted].join(' | ')}`);
  const text = readme();
  for (const verdict of emitted) {
    assert.ok(text.includes(`'${verdict}'`), `README does not document the verdict '${verdict}'`);
  }
});

test('zero runtime dependencies is a fact about the package, not a badge', () => {
  const pkg = JSON.parse(readFileSync(repoFile('package.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(pkg.dependencies ?? {}),
    [],
    'the README and the description both promise zero runtime dependencies'
  );
  assert.deepEqual(Object.keys(pkg.peerDependencies ?? {}), []);
  assert.deepEqual(Object.keys(pkg.optionalDependencies ?? {}), []);

  // and nothing in src reaches outside the package for it
  const sources = ['index.ts', 'paired.ts', 'mcnemar.ts', 'bootstrap.ts', 'compare.ts', 'power.ts'];
  for (const file of sources) {
    const code = readFileSync(repoFile(`src/${file}`), 'utf8');
    for (const [, specifier] of code.matchAll(/from '([^']+)'/g)) {
      assert.ok(
        specifier.startsWith('./') || specifier.startsWith('../'),
        `src/${file} imports '${specifier}', which is not part of this package`
      );
    }
  }
});
