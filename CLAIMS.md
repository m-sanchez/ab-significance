# Claims and the tests that enforce them

Every externally falsifiable claim in `README.md` and in the package
description, mapped to the executable check that would catch it if it stopped
being true. Run them all with `npm test`.

A claim in the README with no enforcing test is a claim the reader has to take
on trust, which is the opposite of what this package is for. Anything on this
page that could not be enforced was narrowed or removed rather than left
standing; the leftovers are listed at the bottom with the reason.

Test names are given as `file::test name`.

## The package description

| Claim | Enforced by |
| :-- | :-- |
| paired McNemar | `test/stats.test.ts::exact McNemar: a lopsided small split is significant, an even one is not` |
| bootstrap CI | `test/stats.test.ts::paired bootstrap interval reproduces with a fixed seed and brackets the observed diff` |
| on the common-valid subset | `test/stats.test.ts::the paired table restricts to the common-valid subset and names exclusions` |
| zero dependencies | `test/readme.test.ts::zero runtime dependencies is a fact about the package, not a badge` |

## Headline and intro

| Claim | Enforced by |
| :-- | :-- |
| dependencies badge: 0 | `test/readme.test.ts::zero runtime dependencies is a fact about the package, not a badge` |
| TypeScript badge: erasable syntax | `npm run typecheck` (`tsconfig.json` sets `erasableSyntaxOnly: true`), run in CI |
| Node badge: >= 22.18, and "Node 22.18+" in Run | `.github/workflows/test.yml` matrix (node 22, 24, 26) |
| "a ten-point gap on a sixty-item eval is usually inside the noise - the exact test resolves it only 31.3% of the time" | `test/operating-characteristics.test.ts::power against a true ten-point gap lands in the published band` |
| "pair the two models on the same examples, restrict to the subset where both actually produced a scorable answer" | `test/stats.test.ts::the paired table restricts to the common-valid subset and names exclusions` |
| "run the exact test on the disagreements" | `test/stats.test.ts::two-sided binomial matches the hand-computed tail` |
| "report an effect-size interval that can exclude zero or fail to" | `test/compare.test.ts::a real, large improvement is called B better with a positive interval`; `test/compare.test.ts::two models of equal skill are not distinguished, whatever the point delta` |

## The usage example

| Claim | Enforced by |
| :-- | :-- |
| the six values `c.verdict` can take | `test/readme.test.ts::every verdict the package can emit is documented in the README` |
| `c.statement` is "a sentence that refuses to overclaim" | `test/compare.test.ts::the emitted statement never contradicts the interval printed beside it` |
| the quoted `npm run demo` output | `test/readme.test.ts::the demo output quoted in the README is the output the demo produces` |
| `requiredN({ minEffectPct: 10, discordanceRate: 0.2 })` is 168 | `test/power.test.ts::requiredN returns the smallest n that reaches the power, and no smaller` |
| `minimumDetectableEffect({ n: 60, discordanceRate: 0.2 })` is 16.21 | `test/power.test.ts::minimumDetectableEffect is the gap the eval you already have can resolve` |

## What it does, and why each piece

| Claim | Enforced by |
| :-- | :-- |
| only examples both models scored enter the comparison | `test/stats.test.ts::the paired table restricts to the common-valid subset and names exclusions` |
| exclusions are returned by name, never counted as a loss for the skipper | `test/stats.test.ts::a skipped hard example is never counted as a loss for the skipper` |
| the discordant split is Binomial(discordant, 0.5), evaluated exactly | `test/stats.test.ts::two-sided binomial matches the hand-computed tail` |
| chi-square is available and agrees with exact once counts are large | `test/stats.test.ts::exact and chi-square agree for large discordant counts` |
| resampling examples, not models, preserves the pairing | `test/stats.test.ts::the bootstrap resamples examples, so the pairing survives` |
| the seeded LCG makes a reported interval reproduce exactly | `test/stats.test.ts::paired bootstrap interval reproduces with a fixed seed and brackets the observed diff` |
| a separable-but-tiny result gets its own verdict | `test/compare.test.ts::a separable but tiny difference is held below the declared bar` |
| the verdict is gated on both instruments, and never prints an interval excluding zero beside "not distinguishable" | `test/compare.test.ts::the emitted statement never contradicts the interval printed beside it`; `test/compare.test.ts::a one-sided interval on four discordant pairs is reported as unresolved, not as noise` |
| no shared scorable example returns `'insufficient overlap'`, naming what each side contributed | `test/compare.test.ts::a broken id join is an explicit insufficient-overlap verdict, not a confident null` |
| repeated ids are returned on `table.duplicates` instead of quietly shrinking `n` | `test/stats.test.ts::duplicate ids are surfaced, not silently collapsed` |
| `requiredN` / `minimumDetectableEffect` enumerate the exact rejection region: no simulation, same answer every time | `test/power.test.ts::the exact enumeration agrees with the simulated power`; `test/power.test.ts::requiredN returns the smallest n that reaches the power, and no smaller` |

## What this instrument actually resolves

| Claim | Enforced by |
| :-- | :-- |
| false-positive rate 2.1% / 3.0% / 3.6% / 4.1% at n = 60 / 100 / 200 / 400, and below the nominal 5% | `test/operating-characteristics.test.ts::type-I error stays at or below the nominal alpha` |
| power 31.3% / 54.8% / 87.1% / 99.5% against a true 10pp gap, and "missed about two times in three" at n=60 | `test/operating-characteristics.test.ts::power against a true ten-point gap lands in the published band` |
| interval coverage 94.8% / 95.4% and 94.6% / 95.0% at 20% discordance | `test/operating-characteristics.test.ts::interval coverage is near nominal where the discordant count is not tiny` |
| interval coverage 85.6% at n=30 with 7% discordance, recovering to 94.8% at n=100 | `test/operating-characteristics.test.ts::interval coverage falls short when there is almost nothing to resample` |
| the whole table is reproducible: `npm test` regenerates it and fails on drift | every test in `test/operating-characteristics.test.ts` compares its measurement against the published figure |

## Honest limits

| Claim | Enforced by |
| :-- | :-- |
| comparison is over binary per-example correctness | the `Outcome` type; `npm run typecheck` in CI |
| exact binomial is used up to any discordant count, log-space and stable | `test/stats.test.ts::the exact binomial stays stable at large discordant counts` |
| the percentile interval undercovers at tiny discordant counts: 85.6% at n=30, 7% discordance | `test/operating-characteristics.test.ts::interval coverage falls short when there is almost nothing to resample` |
| an even split returns p = 1 here, where R and statsmodels return 0.789 at b = c = 7 | `test/reference-divergence.test.ts::the b === c divergence from R and statsmodels is deliberate` |
| the erfc fit is accurate to 8.3e-8 worst case against scipy | `test/reference-divergence.test.ts::the chi-square path matches the reference wherever the formulas agree` |
| the exact path sums binomial terms rather than approximating | `test/stats.test.ts::two-sided binomial matches the hand-computed tail`; `test/stats.test.ts::the exact binomial stays stable at large discordant counts` |
| an empty discordant cell makes the interval one-sided by construction, flagged as `degenerate` and stated in the sentence | `test/compare.test.ts::a one-sided interval on four discordant pairs is reported as unresolved, not as noise` |
| the chi-square path never returns an impossible p-value | `test/stats.test.ts::the chi-square path returns a probability for every reachable table` |

## Run and install

| Claim | Enforced by |
| :-- | :-- |
| `npm test`, `npm run typecheck`, `npm run build` all pass | `.github/workflows/test.yml`, on node 22, 24 and 26 |
| `npm run demo` runs | `test/readme.test.ts::the demo output quoted in the README is the output the demo produces` |
| "CI proves the packed tarball imports" | the `install proof` step in `.github/workflows/test.yml`: `npm pack`, install the tarball in a scratch project, import it |

## Not test-enforced, and why

| Statement | Why there is no test |
| :-- | :-- |
| "Neither corrects for multiple comparisons across many model pairs" | a statement of what the package does not do; there is no behaviour to falsify beyond the absence of an alpha-adjustment API |
| Provenance note and first-published date | historical fact, not behaviour |
| The plain-English framing line and the section prose around the tables | framing, not a checkable assertion; every number it refers to is enforced above |
| "a pinned git tag, `github:m-sanchez/ab-significance#v2.0.0`" | the tag is created at publish time; CI proves the packed tarball imports, and the clean-clone `prepare` build was verified by hand for this release but is not yet a CI step |
