import { describe, it, expect } from "vitest";
import { pdfUaFixHint, pdfUaFixRoutes } from "../components/pdfUaFixHint";

// 2026-09-01: advice is routed by RULE ID, never by description keywords.
// Keyword routing collided with ISO cross-references inside veraPDF's own
// rule text — the figure-alt rule cites "ISO 32000-1:2008, 14.7.2, Table 323"
// and was answered with table advice; the annotation rule says "except
// Widget annotations" and was answered with form-field advice; the ToUnicode
// rule was called "a cosmetic font-embedding technicality" although ToUnicode
// is exactly what makes text extractable. Real rule text from veraPDF 1.30.1
// is used below so the collisions stay pinned.

const FIGURE_ALT = {
  ruleId: "7.3-1",
  clause: "7.3",
  description:
    "Figure tags shall include an alternative representation or replacement text that represents the contents marked with the Figure tag as noted in ISO 32000-1:2008, 14.7.2, Table 323",
};

const ANNOTATION_CONTENTS = {
  ruleId: "7.18.1-2",
  clause: "7.18.1",
  description:
    "An annotation (except Widget annotations or hidden annotations, or those having rectangle outside the crop-box) shall have either Contents key or an Alt entry in the enclosing structure element",
};

const LINK_CONTENTS = {
  ruleId: "7.18.5-2",
  clause: "7.18.5",
  description:
    "Links shall contain an alternate description via their Contents key as described in ISO 32000-1:2008, 14.9.3",
};

const TO_UNICODE = {
  ruleId: "7.21.7-1",
  clause: "7.21.7",
  description:
    "The Font dictionary of all fonts shall define the map of all used character codes to Unicode values, either via a ToUnicode entry, or other mechanisms as defined in ISO 14289-1, 7.21.7",
};

const FONT_NOT_EMBEDDED = {
  ruleId: "7.21.4.1-1",
  clause: "7.21.4.1",
  description:
    "The font programs for all fonts used for rendering within a conforming file shall be embedded within that file, as defined in ISO 32000-1:2008, 9.9",
};

describe("pdfUaFixHint — routed by rule id", () => {
  it("returns a tag/artifact hint for the untagged-content rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.1-3",
      clause: "7.1",
      description: "Content shall be marked as Artifact or tagged as real content",
    });
    expect(hint).toMatch(/artifact/i);
    expect(hint).toMatch(/tag/i);
  });

  it("returns a Scope hint — NOT the generic table hint — for the Scope rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.5-1",
      clause: "7.5",
      description:
        "If the table's structure is not determinable via Headers and IDs, then structure elements of type TH shall have a Scope attribute",
    });
    expect(hint).toMatch(/scope/i);
    expect(hint).not.toMatch(/only header \(TH\) and data \(TD\)/i);
  });

  it("returns a table-structure hint for a TR/TH/TD containment rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.2-10",
      clause: "7.2",
      description: "TR element may contain only TH and TD elements",
    });
    expect(hint).toMatch(/\(TR\)/);
    expect(hint).toMatch(/table/i);
  });

  it("the figure-alt rule gets alt-text advice — its 'Table 323' citation must not route it to tables", () => {
    const hint = pdfUaFixHint(FIGURE_ALT);
    expect(hint).toMatch(/alternate text/i);
    expect(hint).not.toMatch(/table editor|table tags/i);
  });

  it("the annotation rule gets annotation advice — its 'except Widget annotations' clause must not route it to forms or figures", () => {
    const hint = pdfUaFixHint(ANNOTATION_CONTENTS);
    expect(hint).toMatch(/annotation/i);
    expect(hint).toMatch(/contents|alt/i);
    expect(hint).not.toMatch(/tooltip|form field/i);
    expect(hint).not.toMatch(/each figure/i);
  });

  it("the link-description rule gets link advice, not figure advice", () => {
    const hint = pdfUaFixHint(LINK_CONTENTS);
    expect(hint).toMatch(/link/i);
    expect(hint).not.toMatch(/each figure/i);
  });

  it("the ToUnicode rule is never called cosmetic — it is what makes text extractable", () => {
    const hint = pdfUaFixHint(TO_UNICODE);
    expect(hint).toMatch(/unicode|extract/i);
    expect(hint).not.toMatch(/cosmetic|reads fine/i);
  });

  it("a font that is NOT embedded gets embedding advice, not CIDSet-repair advice", () => {
    const hint = pdfUaFixHint(FONT_NOT_EMBEDDED);
    expect(hint).toMatch(/embed/i);
    expect(hint).not.toMatch(/cidset/i);
  });

  it("the CIDSet rule keeps the export-technicality advice", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.21.4.2-2",
      clause: "7.21.4.2",
      description:
        "If the FontDescriptor dictionary of an embedded CID font contains a CIDSet stream, then it shall identify all CIDs which are present in the font program",
    });
    expect(hint).toMatch(/cidset/i);
    expect(hint).toMatch(/preflight/i);
  });

  it("returns a heading hint for the heading-order rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.4.2-1",
      clause: "7.4.2",
      description:
        "For documents that are not strongly structured, the first heading shall be tagged as H1 and heading levels shall not be skipped",
    });
    expect(hint).toMatch(/h1.?h6/i);
  });

  it("returns a language hint for a natural-language rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.2-34",
      clause: "7.2",
      description: "Natural language for text in page content shall be determined",
    });
    expect(hint).toMatch(/language/i);
  });

  it("returns a title hint for the dc:title and DisplayDocTitle rules", () => {
    const title = pdfUaFixHint({
      ruleId: "7.1-9",
      clause: "7.1",
      description:
        "The Metadata stream in the document's catalog dictionary shall contain a dc:title entry",
    });
    expect(title).toMatch(/document title/i);
    const display = pdfUaFixHint({
      ruleId: "7.1-10",
      clause: "7.1",
      description:
        "The document catalog dictionary shall include a ViewerPreferences dictionary containing a DisplayDocTitle key, whose value shall be true",
    });
    expect(display).toMatch(/document title/i);
  });

  it("returns an identifier hint for the PDF/UA identification rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "5-1",
      clause: "5",
      description:
        "The PDF/UA version and conformance level of a file shall be specified using the PDF/UA Identification extension schema",
    });
    expect(hint).toMatch(/identifier|pdf\/ua/i);
  });

  it("returns the fallback hint mentioning the clause for an unknown rule id", () => {
    const hint = pdfUaFixHint({
      ruleId: "13.7-1",
      clause: "13.7",
      description: "Document shall not contain any bookmarks pointing to non-existent destinations.",
    });
    expect(hint).toContain("13.7");
    expect(hint).toMatch(/Acrobat/i);
  });

  it("falls back to generic 'this rule' text when clause is missing", () => {
    const hint = pdfUaFixHint({ ruleId: "x", description: "Some future unknown rule." });
    expect(hint).toContain("this rule");
  });
});

describe("pdfUaFixRoutes — routed by rule id", () => {
  it("the annotation rule never routes to form-Tooltip advice", () => {
    const r = pdfUaFixRoutes(ANNOTATION_CONTENTS);
    expect(r).not.toBeNull();
    expect(r!.pdf).toMatch(/annotation|contents/i);
    expect(r!.pdf).not.toMatch(/tooltip/i);
    expect(r!.source).not.toMatch(/form controls/i);
  });

  it("the figure-alt rule routes to alt-text advice on both sides", () => {
    const r = pdfUaFixRoutes(FIGURE_ALT);
    expect(r).not.toBeNull();
    expect(r!.source).toMatch(/alt text/i);
    expect(r!.pdf).toMatch(/alternate text/i);
  });

  it("the ToUnicode rule never claims the text reads fine either way", () => {
    const r = pdfUaFixRoutes(TO_UNICODE);
    expect(r).not.toBeNull();
    expect(`${r!.source} ${r!.pdf}`).not.toMatch(/reads fine/i);
    expect(`${r!.source} ${r!.pdf}`).toMatch(/unicode|extract/i);
  });

  it("an unknown rule id routes to nothing — wrong advice under the referee's words is worse than none", () => {
    expect(pdfUaFixRoutes({ ruleId: "13.7-1", clause: "13.7", description: "future rule" })).toBeNull();
  });
});
