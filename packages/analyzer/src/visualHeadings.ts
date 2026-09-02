/**
 * Visual-heading census — the EVIDENCE behind "no heading tags" (2026-09-02).
 *
 * WCAG 1.3.1 asks that structure conveyed through presentation be
 * programmatically determinable. A document with zero <H1>–<H6> tags fails
 * it only if it VISUALLY has section headings; until 2026-09-02 that was
 * inferred from page and paragraph counts (or a single bookmark) and asserted
 * as a confirmed Level A failure — a one-page funding chart and two-page fact
 * sheets in the control corpus were accused that way. This census looks at
 * the painted text instead.
 *
 * A candidate line is:
 *   - short (≤ MAX_HEADING_CHARS), with at least three letters, not a number;
 *   - uniformly larger than the document's body size (every lettered item on
 *     the line ≥ body + SIZE_STEP_PT), or uniformly bold at body size —
 *     "TO: John Smith" (bold label, plain value) is neither;
 *   - contiguous — items with a gap wider than 1.5 × the font size between
 *     them are a table row, not a heading;
 *   - followed on the SAME page by a body-size, non-bold line of ordinary
 *     length — a heading over its section. A cover page of big lines with
 *     nothing beneath them is not sections.
 *
 * Pure over lightweight items so it is unit-testable without pdf.js. Bold is
 * whatever the caller could resolve from the font name; when it could not,
 * size alone still works.
 */
export interface VisualTextItem {
  page: number;
  str: string;
  /** Rendered font size in user units (hypot of the text matrix scale). */
  size: number;
  bold: boolean;
  x: number;
  y: number;
  width: number;
}

export interface VisualHeadingCensus {
  candidateCount: number;
  /** Up to five distinct candidate texts, in reading order. */
  samples: string[];
  /** Character-weighted modal font size of the lettered text, or null when
   *  the document has no lettered text at all. */
  bodySize: number | null;
}

const MAX_HEADING_CHARS = 80;
const MIN_BODY_CHARS = 40;
const SIZE_STEP_PT = 1.5;
const BODY_TOLERANCE_PT = 0.75;
const MAX_SAMPLES = 5;

interface Line {
  page: number;
  y: number;
  items: VisualTextItem[];
}

const letterCount = (s: string): number => (s.match(/\p{L}/gu) ?? []).length;
const roundHalf = (n: number): number => Math.round(n * 2) / 2;

export function visualHeadingCensus(items: VisualTextItem[]): VisualHeadingCensus {
  const empty: VisualHeadingCensus = { candidateCount: 0, samples: [], bodySize: null };
  const usable = items.filter(
    (it) =>
      typeof it.str === "string" &&
      it.str.trim().length > 0 &&
      Number.isFinite(it.size) &&
      it.size > 0 &&
      Number.isFinite(it.y),
  );
  if (usable.length === 0) return empty;

  // Body size: the size carrying the most letters.
  const weight = new Map<number, number>();
  for (const it of usable) {
    const letters = letterCount(it.str);
    if (letters === 0) continue;
    const key = roundHalf(it.size);
    weight.set(key, (weight.get(key) ?? 0) + letters);
  }
  if (weight.size === 0) return empty;
  let bodySize = 0;
  let best = -1;
  for (const [size, w] of weight) {
    if (w > best || (w === best && size < bodySize)) {
      best = w;
      bodySize = size;
    }
  }

  // Lines: same page, same baseline (to half a point), in stream order.
  const lines: Line[] = [];
  const byKey = new Map<string, Line>();
  for (const it of usable) {
    const key = `${it.page}|${roundHalf(it.y)}`;
    let line = byKey.get(key);
    if (!line) {
      line = { page: it.page, y: roundHalf(it.y), items: [] };
      byKey.set(key, line);
      lines.push(line);
    }
    line.items.push(it);
  }

  const byPage = new Map<number, Line[]>();
  for (const line of lines) {
    const list = byPage.get(line.page) ?? [];
    list.push(line);
    byPage.set(line.page, list);
  }

  const lineText = (line: Line): string =>
    [...line.items]
      .sort((a, b) => a.x - b.x)
      .map((it) => it.str.trim())
      .filter(Boolean)
      .join(" ");

  const isBodyLine = (line: Line): boolean => {
    const lettered = line.items.filter((it) => letterCount(it.str) > 0);
    if (lettered.length === 0) return false;
    if (lineText(line).length < MIN_BODY_CHARS) return false;
    if (lettered.every((it) => it.bold)) return false;
    const min = Math.min(...lettered.map((it) => it.size));
    const max = Math.max(...lettered.map((it) => it.size));
    return min >= bodySize - BODY_TOLERANCE_PT && max <= bodySize + BODY_TOLERANCE_PT;
  };

  const isContiguous = (line: Line): boolean => {
    const sorted = [...line.items].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const next = sorted[i]!;
      if (!Number.isFinite(prev.width) || !Number.isFinite(prev.x) || !Number.isFinite(next.x)) {
        continue;
      }
      const gap = next.x - (prev.x + prev.width);
      if (gap > 1.5 * Math.max(prev.size, next.size)) return false;
    }
    return true;
  };

  let candidateCount = 0;
  const samples: string[] = [];
  for (const pageLines of byPage.values()) {
    // Top of the page first (PDF y grows upward).
    const ordered = [...pageLines].sort((a, b) => b.y - a.y);
    for (let i = 0; i < ordered.length; i++) {
      const line = ordered[i]!;
      const text = lineText(line);
      if (text.length > MAX_HEADING_CHARS || letterCount(text) < 3) continue;
      if (/^[\d\s.,:;()/-]+$/.test(text)) continue;
      const lettered = line.items.filter((it) => letterCount(it.str) > 0);
      if (lettered.length === 0) continue;
      const minSize = Math.min(...lettered.map((it) => it.size));
      const allBold = lettered.every((it) => it.bold);
      const larger = minSize >= bodySize + SIZE_STEP_PT;
      const boldAtBody = allBold && minSize >= bodySize - BODY_TOLERANCE_PT;
      if (!larger && !boldAtBody) continue;
      if (!isContiguous(line)) continue;
      let followedByBody = false;
      for (let j = i + 1; j < ordered.length; j++) {
        if (isBodyLine(ordered[j]!)) {
          followedByBody = true;
          break;
        }
      }
      if (!followedByBody) continue;
      candidateCount++;
      if (samples.length < MAX_SAMPLES && !samples.includes(text)) samples.push(text);
    }
  }

  return { candidateCount, samples, bodySize };
}
