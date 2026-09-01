/** The one-call comparison: pair two models' per-example outcomes, run
 * McNemar for the p-value and the paired bootstrap for the effect-size
 * interval, and report a verdict that refuses to overclaim. A pre-declared
 * bar (minimum improvement to care about) can be supplied so "declare the
 * bar before you look" is enforced by the type, not left to discipline. */

import { bootstrapDiff } from './bootstrap.ts';
import type { BootstrapInterval } from './bootstrap.ts';
import { mcnemar } from './mcnemar.ts';
import type { McNemarResult } from './mcnemar.ts';
import { pairedTable } from './paired.ts';
import type { Outcome, PairedTable } from './paired.ts';

export type Verdict =
  | 'B better'
  | 'A better'
  | 'no separable difference'
  | 'separable but below the declared bar'
  /** the exact test and the interval reach opposite conclusions; the sign is
   * not resolved by the evidence, and neither instrument is preferred over
   * the other silently */
  | 'instruments disagree';

export interface Comparison {
  table: PairedTable;
  mcnemar: McNemarResult;
  bootstrap: BootstrapInterval;
  verdict: Verdict;
  /** the accuracy of each model on the common-valid subset, for context */
  accuracy: { a: number; b: number };
  statement: string;
}

export interface CompareOptions {
  alpha?: number;
  bootstrapIterations?: number;
  level?: number;
  seed?: number;
  /** minimum B-minus-A improvement (percentage points) worth acting on;
   * a difference can be statistically separable and still trivially small */
  minEffectPct?: number;
}

export function compareModels(a: Outcome[], b: Outcome[], opts: CompareOptions = {}): Comparison {
  const table = pairedTable(a, b);
  const test = mcnemar(table.aOnly, table.bOnly, { alpha: opts.alpha });

  const pairs = [
    ...Array(table.bothCorrect).fill({ aCorrect: true, bCorrect: true }),
    ...Array(table.bothWrong).fill({ aCorrect: false, bCorrect: false }),
    ...Array(table.aOnly).fill({ aCorrect: true, bCorrect: false }),
    ...Array(table.bOnly).fill({ aCorrect: false, bCorrect: true })
  ];
  const boot = bootstrapDiff(pairs, {
    iterations: opts.bootstrapIterations,
    level: opts.level,
    seed: opts.seed
  });

  const accA = table.n === 0 ? 0 : (100 * (table.bothCorrect + table.aOnly)) / table.n;
  const accB = table.n === 0 ? 0 : (100 * (table.bothCorrect + table.bOnly)) / table.n;
  const minEffect = opts.minEffectPct ?? 0;

  // Both instruments gate the verdict. Preferring one silently is how the
  // statement used to print a 95% interval excluding zero directly beside
  // "the models are not distinguishable here" (reachable at aOnly=0,
  // bOnly=4, n=204). When they disagree the honest answer is that they
  // disagree, and the gloss says which said what.
  let verdict: Verdict;
  if (test.separable !== boot.significant) {
    verdict = 'instruments disagree';
  } else if (!test.separable) {
    verdict = 'no separable difference';
  } else if (Math.abs(boot.observed) < minEffect) {
    verdict = 'separable but below the declared bar';
  } else {
    verdict = test.favours === 'B' ? 'B better' : 'A better';
  }

  const excluded =
    table.excluded.onlyA.length + table.excluded.onlyB.length + table.excluded.neither.length;
  const statement =
    `on the ${table.n} examples both models scored` +
    (excluded > 0 ? ` (${excluded} excluded, one side unscored)` : '') +
    `: A ${accA.toFixed(1)}%, B ${accB.toFixed(1)}%; ` +
    `McNemar p=${test.p.toFixed(4)}, ` +
    `B-A ${boot.observed >= 0 ? '+' : ''}${boot.observed.toFixed(1)}pp ` +
    `[${boot.low.toFixed(1)}, ${boot.high.toFixed(1)}]. ${verdictGloss(verdict, minEffect, test, boot)}`;

  return { table, mcnemar: test, bootstrap: boot, verdict, accuracy: { a: accA, b: accB }, statement };
}

function verdictGloss(
  v: Verdict,
  minEffect: number,
  test: McNemarResult,
  boot: BootstrapInterval
): string {
  switch (v) {
    case 'no separable difference':
      return 'The disagreement is within sampling noise; the models are not distinguishable here.';
    case 'separable but below the declared bar':
      return `Separable, but the effect is below the ${minEffect}pp bar declared for acting on it.`;
    case 'B better':
      return 'B is better, beyond noise and beyond the declared bar.';
    case 'A better':
      return 'A is better, beyond noise and beyond the declared bar.';
    case 'instruments disagree':
      return disagreementGloss(test, boot);
  }
}

/** Say plainly which instrument said what, rather than printing both numbers
 * and asserting one of them. */
function disagreementGloss(test: McNemarResult, boot: BootstrapInterval): string {
  const pairs = `${test.discordant} discordant pair${test.discordant === 1 ? '' : 's'}`;
  const pct = `${(boot.level * 100).toFixed(0)}%`;
  if (boot.significant) {
    const why = boot.degenerate
      ? ` Every disagreement fell one way (${test.aOnly === 0 ? 'A won none' : 'B won none'}), so no resample can cross zero and the interval is one-sided by construction, not by weight of evidence.`
      : '';
    return (
      `The instruments disagree: the ${pct} interval excludes zero, but the exact test cannot ` +
      `resolve the sign from ${pairs} (p=${test.p.toFixed(4)}).${why} The sign is not resolved.`
    );
  }
  return (
    `The instruments disagree: the exact test resolves the sign from ${pairs} ` +
    `(p=${test.p.toFixed(4)}), but the ${pct} interval still contains zero. The sign is not resolved.`
  );
}
