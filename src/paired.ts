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
  /** ids that appeared more than once on one side (a resumed or retried eval
   * run writes the same example twice). Only the last outcome for such an id
   * is counted, so `n` is smaller than the row count; the ids are named here
   * rather than left to be inferred from a shrunken denominator. */
  duplicates: string[];
}

/** Build the paired contingency table over the common-valid subset. An
 * example scored by only one model is excluded and recorded, never
 * silently counted as a loss for the model that skipped it. */
export function pairedTable(a: Outcome[], b: Outcome[]): PairedTable {
  const byId = new Map<string, { a?: boolean | null; b?: boolean | null }>();
  const duplicates: string[] = [];
  const seenDuplicate = new Set<string>();
  const record = (side: 'a' | 'b', rows: Outcome[]) => {
    const seen = new Set<string>();
    for (const o of rows) {
      if (seen.has(o.id) && !seenDuplicate.has(o.id)) {
        seenDuplicate.add(o.id);
        duplicates.push(o.id);
      }
      seen.add(o.id);
      if (!byId.has(o.id)) byId.set(o.id, {});
      byId.get(o.id)![side] = o.correct ?? null;
    }
  };
  record('a', a);
  record('b', b);

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
    excluded: { onlyA, onlyB, neither },
    duplicates
  };
}
