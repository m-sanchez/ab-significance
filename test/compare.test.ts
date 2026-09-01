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

/** Build a paired table with exactly the requested cell counts. */
function fromCells(bothCorrect: number, bothWrong: number, aOnly: number, bOnly: number) {
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

test('the emitted statement never contradicts the interval printed beside it', () => {
  // The statement is this package's product. It prints the p-value and the
  // interval in one sentence and then glosses them. A gloss that says "not
  // distinguishable" beside an interval that excludes zero - or that names a
  // winner beside an interval straddling zero - is the worst output this
  // package can produce, so sweep the small-count corner where the two
  // instruments come apart and assert the emitted sentence never does it.
  const violations: string[] = [];
  for (const filler of [0, 10, 40, 200]) {
    for (let aOnly = 0; aOnly <= 8; aOnly++) {
      for (let bOnly = 0; bOnly <= 8; bOnly++) {
        const { a, b } = fromCells(Math.ceil(filler / 2), Math.floor(filler / 2), aOnly, bOnly);
        const c = compareModels(a, b, { seed: 7, bootstrapIterations: 1000 });
        const saysUnresolved = /not distinguishable here/.test(c.statement);
        const saysWinner = /beyond noise/.test(c.statement);
        const where = `filler=${filler} aOnly=${aOnly} bOnly=${bOnly} n=${c.table.n}`;
        if (c.bootstrap.significant && saysUnresolved) {
          violations.push(`${where}: interval [${c.bootstrap.low.toFixed(1)}, ${c.bootstrap.high.toFixed(1)}] excludes zero but the sentence says the models are not distinguishable`);
        }
        if (saysWinner && !(c.bootstrap.significant && c.mcnemar.separable)) {
          violations.push(`${where}: the sentence names a winner on p=${c.mcnemar.p.toFixed(4)} / interval [${c.bootstrap.low.toFixed(1)}, ${c.bootstrap.high.toFixed(1)}]`);
        }
        if (c.verdict === 'no separable difference' && c.bootstrap.significant) {
          violations.push(`${where}: verdict 'no separable difference' while the interval excludes zero`);
        }
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `${violations.length} self-contradicting statements:\n  ` + violations.slice(0, 8).join('\n  ')
  );
});

test('a one-sided interval on four discordant pairs is reported as unresolved, not as noise', () => {
  // The case that used to print a 95% interval of [0.5, 3.9] immediately
  // beside "the models are not distinguishable here": 204 examples, B wins
  // all four disagreements. Four coin flips landing the same way is p=0.125,
  // and the percentile interval cannot contain zero because no resample can
  // cross it.
  const { a, b } = fromCells(102, 98, 0, 4);
  const c = compareModels(a, b, { seed: 42 });
  assert.ok(c.bootstrap.significant, 'the interval still excludes zero');
  assert.ok(!c.mcnemar.separable, 'the exact test still cannot resolve four pairs');
  assert.equal(c.verdict, 'instruments disagree');
  assert.ok(c.bootstrap.degenerate, 'A won none, so no resample can cross zero');
  assert.match(c.statement, /one-sided by construction/);
  assert.match(c.statement, /The sign is not resolved\./);
  assert.doesNotMatch(c.statement, /not distinguishable here/);
});

test('a broken id join is an explicit insufficient-overlap verdict, not a confident null', () => {
  // A typo in one side's id scheme produces zero overlap. That used to come
  // back as verdict 'no separable difference' with "A 0.0%, B 0.0%" and
  // "the models are not distinguishable here" - a scientific conclusion
  // drawn from no data, which a consumer branching on the verdict reads as
  // an answer rather than as a broken join.
  const a: Outcome[] = Array.from({ length: 40 }, (_, i) => ({ id: `ex-${i}`, correct: i % 2 === 0 }));
  const b: Outcome[] = Array.from({ length: 40 }, (_, i) => ({ id: `ex_${i}`, correct: i % 3 === 0 }));
  const c = compareModels(a, b);
  assert.equal(c.table.n, 0);
  assert.equal(c.verdict, 'insufficient overlap');
  assert.match(c.statement, /40 ids/, 'the statement names what each side contributed');
  assert.match(c.statement, /0 .*(shared|common)/i);
  assert.doesNotMatch(c.statement, /not distinguishable here/);
});

test('alpha and the interval level cannot be set inconsistently', () => {
  // alpha was forwarded to the test but not to the interval, so {alpha: 0.01}
  // printed a 99%-strict separability decision beside a 95% interval in the
  // same sentence, with nothing marking the mismatch.
  const { a, b } = fromCells(70, 10, 4, 16);
  const strict = compareModels(a, b, { alpha: 0.01, seed: 3 });
  assert.equal(strict.bootstrap.level, 0.99, 'the interval follows the alpha that produced the verdict');
  assert.match(strict.statement, /99%/);

  assert.throws(
    () => compareModels(a, b, { alpha: 0.01, level: 0.95 }),
    /alpha/,
    'asking for a 99% test and a 95% interval in one call is a mistake, not a feature'
  );
});
