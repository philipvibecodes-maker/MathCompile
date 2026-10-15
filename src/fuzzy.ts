// Subsequence fuzzy matcher for the command palette. Returns a score
// (higher is better) or null when `query` is not a subsequence of `text`.
// Matches at word boundaries and in consecutive runs score higher, and
// shorter targets win ties — so "tpy" ranks "Target: Python" above
// "Duplicate expression".
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const qc of q) {
    const found = t.indexOf(qc, ti);
    if (found < 0) return null;
    const atBoundary = found === 0 || ' /:-_('.includes(t[found - 1]);
    score += 1 + (atBoundary ? 4 : 0) + (found === prev + 1 ? 2 : 0);
    prev = found;
    ti = found + 1;
  }
  return score - t.length / 100;
}

// Matched character indices for highlighting hits in rendered text. A
// contiguous substring match wins as one run ('real' marks 'real' in
// '\reals', not 'r'+'eal'); otherwise the same greedy left-to-right scan
// as fuzzyScore marks each matched char. Empty query matches everything
// (empty hits); null when the query is not a subsequence.
export function fuzzyHits(query: string, text: string): number[] | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return [];
  const at = t.indexOf(q);
  if (at >= 0) return Array.from({ length: q.length }, (_, i) => at + i);
  const hits: number[] = [];
  let ti = 0;
  for (const qc of q) {
    const found = t.indexOf(qc, ti);
    if (found < 0) return null;
    hits.push(found);
    ti = found + 1;
  }
  return hits;
}
