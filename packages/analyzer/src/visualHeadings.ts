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
  /** The id of the innermost marked-content sequence the item was painted
   *  in (pdf.js's "p12R_mc3"), or null for untagged text and artifacts.
   *  Absent when the caller did not resolve it; only untaggedVisualHeadings
   *  reads it. */
  mcid?: string | null;
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

interface CandidateLine {
  page: number;
  text: string;
  items: VisualTextItem[];
  /** The line (the last line of a wrapped heading) sits directly over body
   *  text, or over a heading-shaped line that does. Bold body-size
   *  candidates always do; larger ones may not (a title-page line). */
  overBody: boolean;
}

/** A candidate line with the geometry the wrap test needs. */
interface PlacedLine extends CandidateLine {
  y: number;
  size: number;
  bold: boolean;
  x0: number;
  x1: number;
}

/** A continuation sits at most this many font sizes below the line above it.
 *  Ordinary leading is 1.15–1.3; a new heading after a blank line is 2+. */
const MAX_WRAP_LEADING = 1.6;
const WRAP_SIZE_TOLERANCE_PT = 0.5;
/** A bold body-size heading's paragraph starts within this many font sizes
 *  beneath it (a blank line after the heading is about 2.5). */
const MAX_HEADING_TO_BODY_LEADING = 3.5;
/** How many heading-shaped lines may stack before body text must appear:
 *  a section heading over a sub-heading over a sub-sub-heading, wrapped. */
const MAX_STACKED_HEADINGS = 5;

/** Does `next` continue the heading `prev` ends? Same size, same weight, the
 *  very next line down, and under it rather than beside it. */
function continuesHeading(prev: PlacedLine, next: PlacedLine): boolean {
  if (prev.page !== next.page) return false;
  if (prev.bold !== next.bold) return false;
  if (Math.abs(prev.size - next.size) > WRAP_SIZE_TOLERANCE_PT) return false;
  const drop = prev.y - next.y;
  if (!(drop > 0 && drop <= MAX_WRAP_LEADING * Math.max(prev.size, next.size))) return false;
  // Horizontal overlap: a heading in the next column is not a continuation.
  return Math.min(prev.x1, next.x1) > Math.max(prev.x0, next.x0);
}

/**
 * A heading that wraps is ONE heading (2026-11-12).
 *
 * Candidates were counted per LINE, so "one is a title, two or more are
 * sections" was decided by where the lines happened to break. A one-page
 * flyer exported from PowerPoint — a title wrapped over three lines, a bold
 * call-out sentence over two — was told it had five section headings and
 * failed 1.3.1 at 0/Critical, in a document with a title and no sections.
 *
 * Consecutive candidate lines that continue one another become one candidate
 * with their text joined. A joined block longer than MAX_HEADING_CHARS is
 * dropped whole: it is a sentence set large or bold — emphasis — and the
 * per-line cap only missed it because each of its lines was short.
 */
function mergeWrappedLines(placed: PlacedLine[]): CandidateLine[] {
  const out: CandidateLine[] = [];
  let block: PlacedLine[] = [];
  const flush = (): void => {
    if (block.length === 0) return;
    const text = block.map((l) => l.text).join(" ");
    if (block.length === 1 || text.length <= MAX_HEADING_CHARS) {
      out.push({
        page: block[0]!.page,
        text,
        items: block.flatMap((l) => l.items),
        overBody: block[block.length - 1]!.overBody,
      });
    }
    block = [];
  };
  for (const line of placed) {
    const prev = block[block.length - 1];
    if (prev && !continuesHeading(prev, line)) flush();
    block.push(line);
  }
  flush();
  return out;
}

export function visualHeadingCensus(items: VisualTextItem[]): VisualHeadingCensus {
  const { lines, bodySize } = candidateLines(items);
  const samples: string[] = [];
  for (const line of lines) {
    if (samples.length < MAX_SAMPLES && !samples.includes(line.text)) samples.push(line.text);
  }
  return { candidateCount: lines.length, samples, bodySize };
}

/** The census's candidate lines, in reading order (pages in stream order,
 *  each top to bottom) — shared by visualHeadingCensus and
 *  untaggedVisualHeadings so the two can never disagree on what a heading-
 *  like line is. */
function candidateLines(items: VisualTextItem[]): {
  lines: CandidateLine[];
  bodySize: number | null;
} {
  const empty = { lines: [] as CandidateLine[], bodySize: null };
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

  /** The line's own shape, or null when it cannot be a heading: short, not a
   *  number, uniformly larger than body or uniformly bold at body size, and
   *  contiguous. */
  const headingShape = (
    line: Line,
  ): { text: string; minSize: number; allBold: boolean; larger: boolean } | null => {
    const text = lineText(line);
    if (text.length > MAX_HEADING_CHARS || letterCount(text) < 3) return null;
    if (/^[\d\s.,:;()/-]+$/.test(text)) return null;
    // A line that opens with a bullet is a list item, however bold: a board
    // roster's "• Name" lines sit directly over each member's description.
    if (/^[\u2022\u00b7\u25aa\u25a0\u25e6\u25cf\u25cb\u2023\u2043\u2013\u2014*-]\s/.test(text))
      return null;
    const lettered = line.items.filter((it) => letterCount(it.str) > 0);
    if (lettered.length === 0) return null;
    const minSize = Math.min(...lettered.map((it) => it.size));
    const allBold = lettered.every((it) => it.bold);
    const larger = minSize >= bodySize + SIZE_STEP_PT;
    const boldAtBody = allBold && minSize >= bodySize - BODY_TOLERANCE_PT;
    if (!larger && !boldAtBody) return null;
    if (!isContiguous(line)) return null;
    return { text, minSize, allBold, larger };
  };

  const extentOf = (line: Line): { x0: number; x1: number } => {
    const xs = line.items.filter((it) => Number.isFinite(it.x));
    return {
      x0: Math.min(...xs.map((it) => it.x)),
      x1: Math.max(...xs.map((it) => it.x + (Number.isFinite(it.width) ? it.width : 0))),
    };
  };

  const candidates: CandidateLine[] = [];
  for (const pageLines of byPage.values()) {
    const placed: PlacedLine[] = [];
    // Top of the page first (PDF y grows upward).
    const ordered = [...pageLines].sort((a, b) => b.y - a.y);
    const shapes = ordered.map((line) => headingShape(line));
    const extents = ordered.map((line) => extentOf(line));
    // BOLD AT BODY SIZE NEEDS MORE THAN "SOME BODY TEXT LOWER DOWN" (2026-11-12).
    // Until bold detection was repaired the same day (pdfjsService
    // resolveBoldFonts) this branch had never fired, so it had never been
    // measured. Measured against the control set, bold body-size lines are
    // real section headings in most reports — and also author names on a
    // title page, a chart's row labels, a table's column label. What tells
    // them apart is position: a heading sits DIRECTLY over its paragraph (or
    // over a sub-heading that does). So for this kind only, the next line
    // beneath it, in its own column and within a few line-heights, must be
    // body text, or another heading-shaped line that itself leads to body.
    const directlyOverBody = (start: number): boolean => {
      let k = start;
      for (let hops = 0; hops < MAX_STACKED_HEADINGS; hops++) {
        const from = extents[k]!;
        let next = -1;
        for (let j = k + 1; j < ordered.length; j++) {
          const e = extents[j]!;
          if (ordered[j]!.y < ordered[k]!.y && Math.min(from.x1, e.x1) > Math.max(from.x0, e.x0)) {
            next = j;
            break;
          }
        }
        if (next === -1) return false;
        const size = shapes[k]?.minSize ?? bodySize;
        if (ordered[k]!.y - ordered[next]!.y > MAX_HEADING_TO_BODY_LEADING * size) return false;
        // Prose, not a table row: cells joined across wide gaps are long enough
        // to pass for a sentence (a funding chart's group labels sat over rows).
        if (isBodyLine(ordered[next]!) && isContiguous(ordered[next]!)) return true;
        if (!shapes[next]) return false;
        k = next;
      }
      return false;
    };
    for (let i = 0; i < ordered.length; i++) {
      const line = ordered[i]!;
      const shape = shapes[i];
      if (!shape) continue;
      const { text, minSize, allBold } = shape;
      const overBody = directlyOverBody(i);
      if (!shape.larger && !overBody) continue;
      let followedByBody = false;
      for (let j = i + 1; j < ordered.length; j++) {
        if (isBodyLine(ordered[j]!)) {
          followedByBody = true;
          break;
        }
      }
      if (!followedByBody) continue;
      placed.push({
        page: line.page,
        text,
        items: line.items,
        y: line.y,
        size: minSize,
        bold: allBold,
        overBody,
        ...extents[i]!,
      });
    }
    candidates.push(...mergeWrappedLines(placed));
  }

  return { lines: candidates, bodySize };
}

// ---------------------------------------------------------------------------
// Visual headings TAGGED AS ORDINARY TEXT (2026-10-06, user decision: scored
// like Word's "paragraph formatted to look like a heading" — 15 points each,
// at most 40, WCAG 1.3.1).
//
// The census above runs only on documents with NO heading tags. In a document
// that HAS some, the same defect is a line that looks like a section heading
// but whose text is tagged as an ordinary paragraph: screen-reader users
// cannot find or jump to that section. Measured against the control corpus
// first (2026-10-06): 281 candidate lines sat outside heading tags in 13
// tagged PDFs, and the false ones fell into recognisable shapes — each guard
// below removes one, and what survived (160 lines in four reports) was, line
// for line, a real section heading:
//
//   - Only text tagged as a paragraph (block element <P>, or <NonStruct>) —
//     never a caption, cell, list body, TOC entry, quote, link, figure or
//     title, all of which look like headings for good reason.
//   - The element IS the line: the line is most of its text (which, with
//     candidate lines capped at 80 characters, also keeps the element short).
//     The short last line of a large-print paragraph (a pull quote, "carry
//     out its mandates.") is part of something longer.
//   - No trailing . , ; : — headings do not end mid-sentence ("Prepared by:",
//     "…and Report Writer,").
//   - Not a caption or source line ("Figure 2 …", "Table 4 …", "Source …").
//   - Every lettered item tagged, none inside a heading, all in ONE element,
//     on a page whose text could be attributed to its tags at all.
//   - Lines on at least TWO pages: sections recur through a document; a cover
//     page or letterhead is all on one.
// ---------------------------------------------------------------------------

/** Where each marked-content id sits in the structure tree. */
export interface StructAttribution {
  /** Ids inside a heading element (H, H1–H6). */
  headingIds: Set<string>;
  /** Each id's nearest BLOCK element (its nearest non-Span ancestor): a key
   *  unique to that element, its role (after the RoleMap), and its text. */
  elementById: Map<string, { key: string; role: string; text: string }>;
  /** Pages whose text could not be attributed to their tags. */
  unreliablePages: Set<number>;
}

export interface UntaggedVisualHeadings {
  count: number;
  /** Every counted line, in reading order. */
  samples: Array<{ text: string; page: number }>;
}

const PARAGRAPH_ROLES = new Set(["P", "NonStruct"]);
const MIN_LINE_SHARE_OF_ELEMENT = 0.6;
const CAPTION_RE =
  /^(?:figure|fig\.|table|chart|graph|map|exhibit|photo|image|source|sources|note|notes)\b/i;
const MIN_PAGES = 2;

export function untaggedVisualHeadings(
  items: VisualTextItem[],
  tags: StructAttribution,
): UntaggedVisualHeadings {
  const normalize = (t: string): string => t.replace(/\s+/g, " ").trim();
  const kept: Array<{ text: string; page: number }> = [];
  for (const line of candidateLines(items).lines) {
    if (tags.unreliablePages.has(line.page)) continue;
    // A heading sits directly over its section (2026-11-12). Each line kept
    // here costs points, so the looser "some body text further down the
    // page" that lets the census recognise a title is not enough: a title
    // page's subtitle passed every other guard below and, once a second
    // line elsewhere joined it, took a clean 26-page report from A to B.
    if (!line.overBody) continue;
    if (/[.,;:]$/.test(line.text) || CAPTION_RE.test(line.text)) continue;
    const lettered = line.items.filter((it) => letterCount(it.str) > 0);
    const ids = lettered.map((it) => it.mcid ?? "");
    if (ids.length === 0) continue;
    // Text inside a heading element — even a <P> nested in an <H1> — is a
    // heading already.
    if (ids.some((id) => tags.headingIds.has(id))) continue;
    // Every item must resolve to a tagged element: untagged text and
    // artifacts have no marked-content id, so they never do.
    const elements = ids.map((id) => tags.elementById.get(id));
    if (elements.some((e) => !e)) continue;
    const element = elements[0]!;
    if (elements.some((e) => e!.key !== element.key)) continue;
    if (!PARAGRAPH_ROLES.has(element.role)) continue;
    const elementText = normalize(element.text);
    // The line is most of its element. With candidate lines capped at
    // MAX_HEADING_CHARS, this also caps the element at under two lines.
    if (elementText.length === 0) continue;
    if (normalize(line.text).length < MIN_LINE_SHARE_OF_ELEMENT * elementText.length) continue;
    kept.push({ text: line.text, page: line.page });
  }
  if (new Set(kept.map((k) => k.page)).size < MIN_PAGES) return { count: 0, samples: [] };
  return { count: kept.length, samples: kept };
}
