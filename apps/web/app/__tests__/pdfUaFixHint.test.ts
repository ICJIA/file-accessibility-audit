import { describe, it, expect } from "vitest";
import { pdfUaFixHint } from "../components/pdfUaFixHint";

describe("pdfUaFixHint", () => {
  it("returns a tag/artifact hint for the untagged-content rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.1-1",
      clause: "7.1",
      description: "Content shall either be marked as an Artifact or tagged as real content.",
    });
    expect(hint).toMatch(/artifact/i);
    expect(hint).toMatch(/tag/i);
  });

  it("returns a Scope hint — NOT the generic table hint — for a Scope-attribute rule mentioning TH", () => {
    const hint = pdfUaFixHint({
      ruleId: "9.4-1",
      clause: "9.4",
      description: "Each header cell of type TH in a table shall have a Scope attribute.",
    });
    expect(hint).toMatch(/scope/i);
    expect(hint).not.toMatch(/only header \(TH\) and data \(TD\)/i);
  });

  it("returns a table-structure hint for a TR/TH/TD rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "14.8-2",
      clause: "14.8",
      description: "TR element may contain only TH and TD elements.",
    });
    expect(hint).toMatch(/\(TR\)/);
    expect(hint).toMatch(/table/i);
  });

  it("returns a font-embedding hint for a CIDSet/font rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.21-3",
      clause: "7.21",
      description: "The embedded font's CIDSet does not contain all glyphs used by the document.",
    });
    expect(hint).toMatch(/embed/i);
    expect(hint).toMatch(/font/i);
  });

  it("returns the fallback hint mentioning the clause for an unrecognized rule", () => {
    const hint = pdfUaFixHint({
      ruleId: "13.7-1",
      clause: "13.7",
      description: "Document shall not contain any bookmarks pointing to non-existent destinations.",
    });
    expect(hint).toContain("13.7");
    expect(hint).toMatch(/Acrobat/i);
  });

  it("returns an alt-text hint for a rule mentioning alternate text", () => {
    const hint = pdfUaFixHint({
      ruleId: "13.1-2",
      clause: "13.1",
      description: "Figure element does not provide Alternate Text via the Alt entry.",
    });
    expect(hint).toMatch(/alternate text/i);
  });

  it("returns a heading hint for a rule mentioning heading levels", () => {
    const hint = pdfUaFixHint({
      ruleId: "14.6-1",
      clause: "14.6",
      description: "Heading levels shall not be skipped (jumped from H2 to H4).",
    });
    expect(hint).toMatch(/h1.?h6/i);
  });

  it("returns a language hint for a rule mentioning Lang", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.2-1",
      clause: "7.2",
      description: "The natural language of the document is not specified via a Lang attribute.",
    });
    expect(hint).toMatch(/language/i);
  });

  it("returns a title hint for a rule mentioning document Title", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.4-1",
      clause: "7.4",
      description: "The document does not have a Title entry in the document information dictionary.",
    });
    expect(hint).toMatch(/document title/i);
  });

  it("returns a metadata hint for a rule mentioning XMP metadata", () => {
    const hint = pdfUaFixHint({
      ruleId: "7.8-1",
      clause: "7.8",
      description: "The document's XMP metadata does not include the required PDF/UA identifier.",
    });
    expect(hint).toMatch(/xmp/i);
  });

  it("falls back to generic 'this rule' text when clause is missing", () => {
    const hint = pdfUaFixHint({ ruleId: "x", description: "Some future unknown rule." });
    expect(hint).toContain("this rule");
  });
});
