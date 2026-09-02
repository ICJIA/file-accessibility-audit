/**
 * The visual-heading census: EVIDENCE that a document with no heading tags
 * conveys section structure by presentation alone.
 *
 * Until 2026-09-02 the "no heading tags" 1.3.1 failure was inferred from a
 * proxy — ≥4 pages, ≥20 paragraphs, or ANY bookmark — and told the author
 * "its sections exist only visually" without ever seeing a visual heading.
 * A one-page funding chart with a single bookmark and two-page fact sheets in
 * the control corpus were accused of a Level A failure that way. 1.3.1 asks
 * that structure CONVEYED VISUALLY be programmatically determinable; if
 * nothing is conveyed visually, nothing fails. This census looks.
 *
 * A candidate is a short, contiguous line whose text is uniformly larger than
 * the document's body size (or uniformly bold at body size) and which is
 * followed on the same page by a body-size line — a heading over its
 * section. Memo label lines ("TO: John Smith": bold label, plain value) and
 * table header rows (cells with wide gaps) are deliberately NOT candidates.
 */
import { describe, it, expect } from "vitest";
import { visualHeadingCensus, type VisualTextItem } from "../services/visualHeadings.js";

let nextY = 740;
const line = (
  page: number,
  str: string,
  size: number,
  opts: { bold?: boolean; y?: number; x?: number; width?: number } = {},
): VisualTextItem => {
  const y = opts.y ?? (nextY -= 14);
  return {
    page,
    str,
    size,
    bold: opts.bold ?? false,
    x: opts.x ?? 72,
    y,
    width: opts.width ?? str.length * size * 0.5,
  };
};
const BODY = "This is an ordinary body sentence that runs on long enough to be prose.";

describe("visualHeadingCensus", () => {
  it("counts larger short lines followed by body text as heading candidates, with samples", () => {
    nextY = 740;
    const items = [
      line(1, "Introduction", 16),
      line(1, BODY, 11),
      line(1, BODY, 11),
      line(1, "Methods", 16),
      line(1, BODY, 11),
      line(1, BODY, 11),
      line(2, "Findings", 16),
      line(2, BODY, 11),
    ];
    const c = visualHeadingCensus(items);
    expect(c.bodySize).toBe(11);
    expect(c.candidateCount).toBe(3);
    expect(c.samples).toEqual(["Introduction", "Methods", "Findings"]);
  });

  it("counts a uniformly BOLD body-size line followed by body text", () => {
    nextY = 740;
    const items = [
      line(1, "Background", 11, { bold: true }),
      line(1, BODY, 11),
      line(1, "Recommendation", 11, { bold: true }),
      line(1, BODY, 11),
    ];
    expect(visualHeadingCensus(items).candidateCount).toBe(2);
  });

  it("a one-page chart with a single large title is ONE candidate — not evidence of sections", () => {
    nextY = 740;
    const items = [
      line(1, "Federal Program Funding, FY 2026", 18),
      line(1, BODY, 11),
      line(1, BODY, 11),
    ];
    expect(visualHeadingCensus(items).candidateCount).toBe(1);
  });

  it("a memo header line — bold label, plain value on the same baseline — is NOT a candidate", () => {
    nextY = 740;
    const y = 700;
    const items = [
      line(1, "TO:", 11, { bold: true, y, x: 72, width: 20 }),
      line(1, "John Smith, Director", 11, { y, x: 95 }),
      line(1, BODY, 11),
      line(1, BODY, 11),
    ];
    expect(visualHeadingCensus(items).candidateCount).toBe(0);
  });

  it("a table header row — bold cells separated by wide gaps — is NOT a candidate", () => {
    nextY = 740;
    const y = 700;
    const items = [
      line(1, "Name", 11, { bold: true, y, x: 72, width: 25 }),
      line(1, "County", 11, { bold: true, y, x: 220, width: 35 }),
      line(1, "Amount", 11, { bold: true, y, x: 400, width: 38 }),
      line(1, BODY, 11),
      line(1, BODY, 11),
    ];
    expect(visualHeadingCensus(items).candidateCount).toBe(0);
  });

  it("a cover page of big lines with no body text beneath them is NOT evidence", () => {
    nextY = 740;
    const items = [
      line(1, "Annual Report", 28),
      line(1, "Fiscal Year 2026", 20),
      line(1, "Illinois Criminal Justice Information Authority", 14),
      line(2, BODY, 11),
      line(2, BODY, 11),
    ];
    expect(visualHeadingCensus(items).candidateCount).toBe(0);
  });

  it("a long line is never a heading, however large", () => {
    nextY = 740;
    const items = [line(1, BODY + " " + BODY, 16), line(1, BODY, 11), line(1, BODY, 11)];
    expect(visualHeadingCensus(items).candidateCount).toBe(0);
  });

  it("reports no body size and no candidates for a document with no text", () => {
    const c = visualHeadingCensus([]);
    expect(c.bodySize).toBeNull();
    expect(c.candidateCount).toBe(0);
    expect(c.samples).toEqual([]);
  });
});
