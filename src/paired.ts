/** Did model B actually beat model A, or is the difference sampling noise?
 *
 * The honest way to compare two models is on the SAME examples, then ask
 * whether the disagreements lean one way beyond chance. This module pairs
 * per-example outcomes, restricts to the subset where BOTH models produced
 * a scorable answer (an unequal denominator flatters whichever model
 * skipped the hard cases), and reports the discordant counts that the
 * significance tests consume. */

export interface Outcome {
  /** stable id so the two models' results line up per example */
  id: string;
  /** whether this model got this example right; null/undefined means it
   * produced no scorable answer (skipped, errored, abstained) */
  correct: boolean | null | undefined;
}

export interface PairedTable {
  /** examples both models answered (the common-valid subset) */
  n: number;
  /** both right */
  bothCorrect: number;
  /** both wrong */
  bothWrong: number;
  /** A right, B wrong */
  aOnly: number;
  /** B right, A wrong */
  bOnly: number;
  /** discordant pairs = aOnly + bOnly */
  discordant: number;
  /** ids one model could score and the other could not (excluded, named) */
  excluded: { onlyA: string[]; onlyB: string[]; neither: string[] };
}

/** Build the paired contingency table over the common-valid subset. An
 * example scored by only one model is excluded and recorded, never
 * silently counted as a loss for the model that skipped it. */
export function pairedTable(a: Outcome[], b: Outcome[]): PairedTable {
  const byId = new Map<string, { a?: boolean | null; b?: boolean | null }>();
  for (const o of a) {
    if (!byId.has(o.id)) byId.set(o.id, {});
    byId.get(o.id)!.a = o.correct ?? null;
  }
  for (const o of b) {
    if (!byId.has(o.id)) byId.set(o.id, {});
    byId.get(o.id)!.b = o.correct ?? null;
  }

  let bothCorrect = 0;
  let bothWrong = 0;
  let aOnly = 0;
  let bOnly = 0;
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  const neither: string[] = [];

  for (const [id, { a: ra, b: rb }] of byId) {
    const aScored = ra === true || ra === false;
    const bScored = rb === true || rb === false;
    if (aScored && bScored) {
      if (ra && rb) bothCorrect++;
      else if (!ra && !rb) bothWrong++;
      else if (ra && !rb) aOnly++;
      else bOnly++;
    } else if (aScored && !bScored) onlyA.push(id);
    else if (!aScored && bScored) onlyB.push(id);
    else neither.push(id);
  }

  const n = bothCorrect + bothWrong + aOnly + bOnly;
  return {
    n,
    bothCorrect,
    bothWrong,
    aOnly,
    bOnly,
    discordant: aOnly + bOnly,
    excluded: { onlyA, onlyB, neither }
  };
}
