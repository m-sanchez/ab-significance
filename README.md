# ab-significance

![TypeScript](https://img.shields.io/badge/TypeScript-erasable_syntax-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/node-%3E%3D22.18-5FA04E?logo=nodedotjs&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-B45309)
[![CI](https://github.com/m-sanchez/ab-significance/actions/workflows/test.yml/badge.svg)](https://github.com/m-sanchez/ab-significance/actions/workflows/test.yml)
![License](https://img.shields.io/badge/license-MIT-6E6E6E)
[![npm](https://img.shields.io/npm/v/@m-sanchez/ab-significance?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/@m-sanchez/ab-significance)

> **In plain English:** version B looks better than A, but is it a real improvement or just luck? This tells you whether the difference is statistically real.

Did model B really beat model A, or is it sampling noise? Paired McNemar
and a bootstrap confidence interval on the common-valid subset. Zero
dependencies.

[More tools](https://github.com/m-sanchez) · [Working rules](https://miguelsanchez.co.uk/ethics) ·
[Worked example: routing-study](https://github.com/m-sanchez/routing-study)

*Provenance: a fresh, dependency-free implementation of standard methods,
written to test the systems the other tools came from. First published
2026-08-31.*

"B scored 82% and A scored 72%, so B is better" is how good models get
shipped on ten items of luck. A ten-point gap on a sixty-item eval is
usually inside the noise - measured, the exact test resolves it only 31.3%
of the time - and a model that quietly skips the hard questions looks
better than it is. This answers the comparison honestly:
pair the two models on the same examples, restrict to the subset where
both actually produced a scorable answer, run the exact test on the
disagreements, and report an effect-size interval that can exclude zero or
fail to.

```ts
import { compareModels } from '@m-sanchez/ab-significance';

// per-example outcomes; `correct: null` = the model produced no scorable
// answer (skipped, errored, abstained)
const c = compareModels(modelA, modelB, { minEffectPct: 2 });

c.verdict;   // 'B better' | 'A better' | 'no separable difference'
             //            | 'separable but below the declared bar'
c.statement; // a sentence that refuses to overclaim
```

`npm run demo`:

```
1. a small instrument, a real 10-point gap
   ... A 68.3%, B 78.3%; McNemar p=0.3075, B-A +10.0pp [-6.7, 25.0].
   The disagreement is within sampling noise; the models are not distinguishable here.

3. B skips the hard questions and looks better than it is
   ... (55 excluded, one side unscored): A 100.0%, B 72.7%; McNemar p=0.0001,
   B-A -27.3pp [-40.0, -16.4]. A is better, beyond noise and beyond the declared bar.
   (B's raw accuracy over what it answered would look like 73%.)
```

## What it does, and why each piece

- **Common-valid subset** (`pairedTable`). Only examples both models scored
  enter the comparison; the ids one model could score and the other could
  not are excluded and returned by name, never counted as a loss for the
  model that skipped them. An unequal denominator is the most common way an
  A/B accuracy delta lies.
- **Exact McNemar** (`mcnemar`). Under the null, the disagreements are fair
  coin flips, so the split is Binomial(discordant, 0.5). For the small
  discordant counts a real eval produces, the exact two-sided binomial test
  is used, not the chi-square approximation (which is unreliable when the
  discordant count is small). Chi-square is available and agrees with exact
  once the counts are large.
- **Paired bootstrap CI** (`bootstrapDiff`). The p-value says whether;
  the interval says how much, and how sure. Resampling *examples* (not the
  two models independently) preserves the correlation between models that
  testing on shared data creates. The RNG is a seeded LCG, so a reported
  interval reproduces exactly.
- **A declared bar** (`minEffectPct`). A difference can be statistically
  separable and still too small to act on. Declaring the minimum effect
  you care about *before* you look is enforced by the option, not left to
  discipline: a separable-but-tiny result gets its own verdict.

## What this instrument actually resolves

Measured, not asserted. Every figure below comes from
`test/operating-characteristics.test.ts`, which draws simulated evals from
the same seeded LCG the bootstrap uses, so `npm test` reproduces the table
exactly and fails if the statistics drift away from it.

How often the exact test declares two models separable at alpha = 0.05, over
5000 simulated evals in which 20% of examples are discordant:

| common-valid n | no true difference (false positives) | true 10-point gap (power) |
| --: | --: | --: |
| 60 | 2.1% | 31.3% |
| 100 | 3.0% | 54.8% |
| 200 | 3.6% | 87.1% |
| 400 | 4.1% | 99.5% |

A real ten-point gap on sixty items is missed about two times in three. The
false-positive rate sits below the nominal 5% because the discordant count
is discrete - there is no critical region carrying exactly 5% of the mass -
so the exact test is conservative by construction.

Coverage of the 95% bootstrap interval, over 500 simulated evals with 600
resamples each (each figure carries roughly +/-2pp of Monte-Carlo error):

| regime | n = 30 | n = 100 |
| :-- | --: | --: |
| true +10pp, 20% discordant | 94.8% | 95.4% |
| no true difference, 20% discordant | 94.6% | 95.0% |
| true -5pp, 7% discordant (A 94.5%, B 89.5%) | **85.6%** | 94.8% |

The last row is the one to read twice: when both models are accurate and
rarely disagree, thirty examples leave the interval about two discordant
pairs to resample, and it misses a real five-point gap one time in seven.

## Honest limits

- Comparison is over binary per-example correctness. For a graded or
  multi-metric score, reduce to a per-example win/loss first, or use a
  paired bootstrap over the raw scores (the bootstrap here takes
  win/loss pairs).
- McNemar tests the sign of the difference; the bootstrap sizes it. Neither
  corrects for multiple comparisons across many model pairs; if you compare
  a leaderboard, adjust alpha yourself.
- Exact binomial is used up to any discordant count (log-space, stable);
  the chi-square path exists for comparison, not speed.
- The percentile interval undercovers when the discordant count is tiny:
  measured 85.6% coverage of a true 5-point gap at n=30 with 7% discordance
  (table above). Below roughly ten discordant pairs, read the interval as an
  illustration and the p-value as the decision.
- When one discordant cell is empty, no resample can cross zero, so the
  interval is one-sided by construction rather than by weight of evidence.
  `bootstrapDiff` flags this as `degenerate`, and `compareModels` says so in
  the statement instead of reporting a resolved sign.

## Run

```bash
npm install       # dev-only: typescript
npm test
npm run demo
npm run typecheck
```

Install: `npm install @m-sanchez/ab-significance` (or a pinned git tag,
`github:m-sanchez/ab-significance#v1.0.2`; CI proves the packed tarball
imports). Node 22.18+, zero runtime dependencies.

## The tests are the point

| Test | Claim |
| :-- | :-- |
| two-sided binomial matches the hand-computed tail | the exact test is exact |
| a lopsided small split is separable, an even one is not | McNemar reads the disagreement, not the totals |
| exact and chi-square agree once counts are large | the exact default is not eccentric, just correct for small n |
| the paired table restricts to the common-valid subset | unequal denominators cannot flatter a skipper |
| a skipped hard example is never a loss for the skipper | abstention is excluded and named, not scored |
| the bootstrap reproduces with a fixed seed | a reported interval is a reproducible interval |
| a real gap is B-better, a matched pair is not separable | the verdict tracks the evidence, not the point delta |
| a separable but tiny difference is held below the bar | significance is not the same as mattering |
