/**
 * Rigorous reading-order fidelity check, shared by the scorer (category
 * score) and the conformance gate (1.3.2 Meaningful Sequence evidence).
 *
 * For each page that has both a struct-tree MCID sequence (from QPDF) and a
 * content-stream MCID sequence (from pdfjs), compute the longest-common-
 * subsequence ratio — i.e. how many MCIDs appear in the same relative order
 * in both sequences. Aggregate weighted by the number of shared MCIDs per
 * page, then map to 0-100.
 *
 * Returns score=null when no page can be meaningfully compared, so callers
 * can fall back to an honest N/A instead of a noise-level verdict. The
 * conformance gate relies on this contract: a null score means "no order
 * evidence", and no 1.3.2 failure may be asserted from heuristics alone.
 */
import type { QpdfResult } from "../qpdfService.js";
import type { PdfjsResult } from "../pdfjsService.js";

export interface ReadingOrderFidelity {
  score: number | null;
  similarityPct: number;
  pagesAnalyzed: number;
  pagesWithDrift: number;
}

export function computeReadingOrderFidelity(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
): ReadingOrderFidelity {
  const emptyResult: ReadingOrderFidelity = {
    score: null,
    similarityPct: 0,
    pagesAnalyzed: 0,
    pagesWithDrift: 0,
  };

  const structByPage = qpdf.structTreeMcidsByPage;
  const streamByPage = pdfjs.contentStreamMcidsByPage;
  if (!structByPage || !streamByPage) return emptyResult;

  const pageNumbers = new Set<number>([
    ...Object.keys(structByPage).map(Number),
    ...Object.keys(streamByPage).map(Number),
  ]);

  let totalShared = 0;
  let weightedSum = 0;
  let pagesAnalyzed = 0;
  let pagesWithDrift = 0;

  for (const pageNum of pageNumbers) {
    const struct = structByPage[pageNum] ?? [];
    const stream = streamByPage[pageNum] ?? [];
    if (struct.length === 0 || stream.length === 0) continue;

    const streamSet = new Set<number>(stream);
    const shared = new Set<number>(struct.filter((m) => streamSet.has(m)));
    if (shared.size < 2) continue; // <2 shared MCIDs = no order signal

    const filteredStruct = struct.filter((m) => shared.has(m));
    const filteredStream = stream.filter((m) => shared.has(m));

    const lcs = longestCommonSubsequence(filteredStruct, filteredStream);
    const denom = Math.max(filteredStruct.length, filteredStream.length);
    const pageSimilarity = denom > 0 ? lcs / denom : 1;

    totalShared += shared.size;
    weightedSum += pageSimilarity * shared.size;
    pagesAnalyzed++;
    if (pageSimilarity < 0.8) pagesWithDrift++;
  }

  if (pagesAnalyzed === 0 || totalShared === 0) return emptyResult;

  const similarity = weightedSum / totalShared;
  const similarityPct = Math.round(similarity * 100);

  // Top band is 0.97 (not 0.99) so a near-perfect document is not docked for a
  // 1–2% longest-common-subsequence wobble that is really MCID-extraction
  // jitter (artifact handling, multi-MCID runs) rather than genuine disorder.
  //
  // IMPORTANT on what this measures: the comparison is tag order vs the
  // content stream's DRAW order — not "visual reading order". The struct
  // tree exists precisely to override draw order, and remediation tools
  // deliberately re-order tags away from it, so a mid-band divergence is
  // evidence of DISAGREEMENT, not proof the tags are wrong. The 0.8–0.97
  // band therefore deducts lightly (85, Minor); only heavy divergence drops
  // further, and the conformance gate never asserts a confirmed 1.3.2 from
  // this metric alone (see conformance.ts).
  // Lower bands are Moderate (65) and 30 — not 40/10: 50–80% agreement is
  // routine for correctly tagged FORMS (fields painted in creation order,
  // tags ordered logically), and the metric cannot say which side is wrong.
  // The signal is "review manually", never Critical-by-default.
  let score: number;
  if (similarity >= 0.97) score = 100;
  else if (similarity >= 0.9) score = 90;
  else if (similarity >= 0.8) score = 85;
  else if (similarity >= 0.5) score = 65;
  else score = 30;

  return {
    score,
    similarityPct,
    pagesAnalyzed,
    pagesWithDrift,
  };
}

// Length of the longest common subsequence of two integer arrays.
// Standard O(m*n) DP. For typical PDF pages (tens to low hundreds of MCIDs)
// this is negligible. Used to measure how "out of order" two MCID sequences
// are relative to each other.
function longestCommonSubsequence(a: number[], b: number[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const prev = new Array<number>(n + 1).fill(0);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1] + 1;
      else curr[j] = Math.max(prev[j], curr[j - 1]);
    }
    for (let k = 0; k <= n; k++) prev[k] = curr[k];
  }
  return prev[n];
}
