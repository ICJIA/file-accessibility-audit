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
import {
  visualHeadingCensus,
  untaggedVisualHeadings,
  type StructAttribution,
  type VisualTextItem,
} from "../services/visualHeadings.js";

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

// ---------------------------------------------------------------------------
// VISUAL HEADINGS TAGGED AS ORDINARY TEXT (2026-10-06, user decision: score it
// like Word). In a PDF that HAS heading tags, a line that looks like a section
// heading but is tagged as a paragraph is the PDF form of Word's "paragraph
// formatted to look like a heading". The census above only ever ran on
// documents with NO heading tags; this asks, line by line, where each
// candidate's text is tagged. Every guard below was measured against the
// control corpus before it was written: cover pages, letterheads, pull quotes
// and captions all look like headings and none is one.
// ---------------------------------------------------------------------------
describe("untaggedVisualHeadings — visual headings tagged as ordinary text", () => {
  const tagged = (item: VisualTextItem, mcid: string | null): VisualTextItem => ({ ...item, mcid });
  /** One block element per heading-like line, by default a <P> holding exactly that line. */
  const attribution = (
    els: Array<[mcid: string, role: string, text: string]>,
    opts: { headings?: string[]; unreliable?: number[] } = {},
  ): StructAttribution => ({
    headingIds: new Set(opts.headings ?? []),
    elementById: new Map(els.map(([id, role, text]) => [id, { key: `el-${id}`, role, text }])),
    unreliablePages: new Set(opts.unreliable ?? []),
  });
  const BODY_EL: [string, string, string] = ["b", "P", BODY];
  /** Page 1: a real <H1>, then a <P> styled like a heading; page 2: another. */
  const docWith = (second: {
    text: string;
    size?: number;
    mcid?: string | null;
    page?: number;
  }) => {
    nextY = 740;
    return [
      tagged(line(1, "Introduction", 16), "h1"),
      tagged(line(1, BODY, 11), "b"),
      tagged(line(1, "Background", 16), "p1"),
      tagged(line(1, BODY, 11), "b"),
      tagged(
        line(second.page ?? 2, second.text, second.size ?? 16),
        second.mcid === undefined ? "p2" : second.mcid,
      ),
      tagged(line(second.page ?? 2, BODY, 11), "b"),
    ];
  };

  it("counts heading-like lines tagged as <P> beside real heading tags, on two or more pages", () => {
    const r = untaggedVisualHeadings(
      docWith({ text: "Methods" }),
      attribution([["p1", "P", "Background"], ["p2", "P", "Methods"], BODY_EL], {
        headings: ["h1"],
      }),
    );
    expect(r.count).toBe(2);
    expect(r.samples).toEqual([
      { text: "Background", page: 1 },
      { text: "Methods", page: 2 },
    ]);
  });

  it("a line inside a heading tag is not counted", () => {
    const items = [
      ...docWith({ text: "Methods" }),
      tagged(line(3, "Results", 16), "p3"),
      tagged(line(3, BODY, 11), "b"),
    ];
    const r = untaggedVisualHeadings(
      items,
      attribution(
        [["p1", "P", "Background"], ["p2", "H2", "Methods"], ["p3", "P", "Results"], BODY_EL],
        { headings: ["h1", "p2"] },
      ),
    );
    expect(r.samples).toEqual([
      { text: "Background", page: 1 },
      { text: "Results", page: 3 },
    ]);
  });

  it("a <P> nested inside a heading element is part of that heading", () => {
    const items = [
      ...docWith({ text: "Methods" }),
      tagged(line(3, "Results", 16), "p3"),
      tagged(line(3, BODY, 11), "b"),
    ];
    const r = untaggedVisualHeadings(
      items,
      attribution(
        [["p1", "P", "Background"], ["p2", "P", "Methods"], ["p3", "P", "Results"], BODY_EL],
        { headings: ["h1", "p2"] }, // p2's block element is a <P>, but it sits inside an <H2>
      ),
    );
    expect(r.samples.map((x) => x.text)).toEqual(["Background", "Results"]);
  });

  it("lines on a single page are never counted — a cover page or letterhead is not sections", () => {
    const r = untaggedVisualHeadings(
      docWith({ text: "Methods", page: 1 }),
      attribution([["p1", "P", "Background"], ["p2", "P", "Methods"], BODY_EL], {
        headings: ["h1"],
      }),
    );
    expect(r.count).toBe(0);
  });

  it("the last short line of a long, large-print paragraph (a pull quote) is not a heading", () => {
    const quote = `The number of reported cases increased 85 percent over the decade, according to the state's own figures, and continued rising after that. ${"x".repeat(60)}`;
    const r = untaggedVisualHeadings(
      docWith({ text: "Methods" }),
      attribution([["p1", "P", quote], ["p2", "P", quote], BODY_EL], { headings: ["h1"] }),
    );
    expect(r.count).toBe(0);
  });

  it.each(["Prepared by:", "carry out its mandates.", "Task Force Coordinator,"])(
    'a line ending in sentence punctuation ("%s") is not a heading',
    (text) => {
      const r = untaggedVisualHeadings(
        docWith({ text }),
        attribution([["p1", "P", "Background"], ["p2", "P", text], BODY_EL], { headings: ["h1"] }),
      );
      expect(r.samples.map((s) => s.text)).not.toContain(text);
    },
  );

  it.each([
    "Figure 2 Arrests by county",
    "Table 4 Grants by program",
    "Source Illinois State Police",
  ])('a caption or source line ("%s") is not a heading', (text) => {
    const r = untaggedVisualHeadings(
      docWith({ text }),
      attribution([["p1", "P", "Background"], ["p2", "P", text], BODY_EL], { headings: ["h1"] }),
    );
    expect(r.count).toBe(0);
  });

  it.each([
    "Caption",
    "TD",
    "TH",
    "LBody",
    "TOCI",
    "Quote",
    "BlockQuote",
    "Link",
    "Figure",
    "Title",
  ])("text whose block element is <%s> is not a paragraph posing as a heading", (role) => {
    const r = untaggedVisualHeadings(
      docWith({ text: "Methods" }),
      attribution([["p1", "P", "Background"], ["p2", role, "Methods"], BODY_EL], {
        headings: ["h1"],
      }),
    );
    expect(r.count).toBe(0);
  });

  it("a short line that is under 60% of its element (a two-line paragraph's lead) is not the element", () => {
    const lead = "Methods and the data sources behind them, with notes on gaps";
    const r = untaggedVisualHeadings(
      docWith({ text: "Methods" }),
      attribution([["p1", "P", "Background"], ["p2", "P", lead], BODY_EL], { headings: ["h1"] }),
    );
    expect(r.count).toBe(0);
  });

  it("a line split across two elements is not one heading", () => {
    nextY = 740;
    const items = [
      tagged(line(1, "Introduction", 16), "h1"),
      tagged(line(1, BODY, 11), "b"),
      tagged(line(1, "Background", 16), "p1"),
      tagged(line(1, BODY, 11), "b"),
      { ...line(2, "Meth", 16, { x: 72, y: 600, width: 30 }), mcid: "p2a" },
      { ...line(2, "ods", 16, { x: 102, y: 600, width: 24 }), mcid: "p2b" },
      tagged(line(2, BODY, 11, { y: 580 }), "b"),
    ];
    const r = untaggedVisualHeadings(
      items,
      attribution([["p1", "P", "Background"], ["p2a", "P", "Meth"], ["p2b", "P", "ods"], BODY_EL], {
        headings: ["h1"],
      }),
    );
    expect(r.count).toBe(0);
  });

  it("a page whose text could not be attributed to its tags says nothing", () => {
    const r = untaggedVisualHeadings(
      docWith({ text: "Methods" }),
      attribution([["p1", "P", "Background"], ["p2", "P", "Methods"], BODY_EL], {
        headings: ["h1"],
        unreliable: [2],
      }),
    );
    expect(r.count).toBe(0);
  });

  it("untagged (artifact) text is not tagged-as-a-paragraph text", () => {
    const r = untaggedVisualHeadings(
      docWith({ text: "Methods", mcid: null }),
      attribution([["p1", "P", "Background"], BODY_EL], { headings: ["h1"] }),
    );
    expect(r.count).toBe(0);
  });

  it("a line that is only partly tagged (part of it painted outside any tag) is not judged", () => {
    nextY = 740;
    const items = [
      tagged(line(1, "Introduction", 16), "h1"),
      tagged(line(1, BODY, 11), "b"),
      tagged(line(1, "Background", 16), "p1"),
      tagged(line(1, BODY, 11), "b"),
      { ...line(2, "Meth", 16, { x: 72, y: 600, width: 30 }), mcid: "p2" },
      { ...line(2, "ods", 16, { x: 102, y: 600, width: 24 }), mcid: null },
      tagged(line(2, BODY, 11, { y: 580 }), "b"),
    ];
    const r = untaggedVisualHeadings(
      items,
      attribution([["p1", "P", "Background"], ["p2", "P", "Meth"], BODY_EL], { headings: ["h1"] }),
    );
    expect(r.count).toBe(0);
  });

  it("the census above is unchanged by marked-content ids — it still counts every candidate", () => {
    expect(visualHeadingCensus(docWith({ text: "Methods" })).candidateCount).toBe(3);
  });
});
