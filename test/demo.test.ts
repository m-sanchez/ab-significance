import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
