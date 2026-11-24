/**
 * utils/findingMatch.ts — the one rule every consumer of finding lines
 * follows: a line with a finding code is recognised by the code, a line
 * without one by its wording. findingCodeParity.test.ts proves the table
 * against real engine output; this file pins the rule itself.
 */
import { describe, it, expect } from "vitest";
import {
  FINDING,
  buildCodeIndex,
  findingHit,
  findingLines,
  isFinding,
  phrase,
  text,
} from "../utils/findingMatch";
import { estimateFixTime } from "../utils/fixTime";
import { buildActionPlan } from "../utils/actionPlan";
import { buildContext, matchMain, signalLines } from "../utils/bestPractices";

const detail = (code: string, line: string, extra: object = {}) => ({
  code,
  kind: "failure",
  text: line,
  ...extra,
});

describe("a line with a code is recognised by the code alone", () => {
  const rule = FINDING.pdfNoHeadingTags;
  const code = "pdf.heading_structure.no_heading_tags";

  it("matches a reworded line that still carries the code", () => {
    const line = "This document's structure holds not one heading element.";
    const index = buildCodeIndex([line], [detail(code, line)]);
    expect(rule.wording(line)).toBe(false);
    expect(findingHit(rule, line, index)).toEqual({ by: "code", coded: { code } });
  });

  it("does not match a line whose words fit but whose code is another finding's", () => {
    const line = "No heading tags found in the document structure";
    expect(rule.wording(line)).toBe(true);
    const index = buildCodeIndex([line], [detail("pdf.heading_structure.headings_found", line)]);
    expect(isFinding(rule, line, index)).toBe(false);
  });

  it("carries the code's own numbers", () => {
    const line = "3 of 9 pictures are described.";
    const index = buildCodeIndex(
      [line],
      [detail("pdf.alt_text.images_with_alt", line, { count: 3, total: 9 })],
    );
    expect(findingHit(FINDING.fixImagesWithAlt, line, index)).toEqual({
      by: "code",
      coded: { code: "pdf.alt_text.images_with_alt", count: 3, total: 9 },
    });
  });
});

describe("a line without a code is recognised by its wording", () => {
  const rule = FINDING.pdfNoHeadingTags;
  const line = "No heading tags found in the document structure";

  it("when the report has no findingDetails at all", () => {
    expect(buildCodeIndex([line], undefined)).toBeNull();
    expect(findingHit(rule, line, null)).toEqual({ by: "wording" });
    expect(isFinding(rule, "Found 4 heading tags with logical hierarchy", null)).toBe(false);
  });

  it("when its detail is the engine's `uncoded` placeholder", () => {
    const index = buildCodeIndex([line], [detail("pdf.heading_structure.uncoded", line)]);
    expect(index).toBeNull();
    expect(findingHit(rule, line, index)).toEqual({ by: "wording" });
  });

  it("when the details do not line up with the findings", () => {
    const other = "PDF contains extractable text";
    // Wrong length.
    expect(buildCodeIndex([line, other], [detail("x.y.z", line)])).toBeNull();
    // Right length, wrong twin: the detail's text is not the line beside it.
    expect(buildCodeIndex([line], [detail("pdf.heading_structure.headings_found", other)])).toBe(
      null,
    );
  });

  it("line by line: a coded line and an un-coded one in the same category", () => {
    const coded = "Reworded: there are no headings marked up here.";
    const plain = "No heading tags found in the document structure";
    const index = buildCodeIndex(
      [coded, plain],
      [
        detail("pdf.heading_structure.no_heading_tags", coded),
        detail("pdf.heading_structure.uncoded", plain),
      ],
    );
    expect(findingHit(rule, coded, index)?.by).toBe("code");
    expect(findingHit(rule, plain, index)?.by).toBe("wording");
  });
});

describe("buildCodeIndex", () => {
  it("never throws on a damaged report", () => {
    const hostile = { toString: () => { throw new Error("no"); } }; // prettier-ignore
    for (const [findings, details] of [
      [null, null],
      ["a string", "another"],
      [
        [1, null, {}],
        [1, null, {}],
      ],
      [["line"], [{ code: 7, text: "line" }]],
      [["line"], [hostile]],
      [[hostile], [{ code: "a.b.c", text: hostile }]],
    ] as Array<[unknown, unknown]>) {
      expect(() => buildCodeIndex(findings, details)).not.toThrow();
      expect(buildCodeIndex(findings, details)).toBeNull();
    }
  });

  it("knows a divider by its bare heading and a signal line without its indent", () => {
    const findings = ["--- Heading Tree ---", "  H1 → H2 → H2"];
    const index = buildCodeIndex(findings, [
      detail("pdf.heading_structure.tree_heading", findings[0]!),
      detail("pdf.heading_structure.tree_levels", findings[1]!),
    ]);
    expect(index?.get("Heading Tree")?.[0]?.code).toBe("pdf.heading_structure.tree_heading");
    expect(index?.get("H1 → H2 → H2")?.[0]?.code).toBe("pdf.heading_structure.tree_levels");
  });

  it("a signal line that quotes the document cannot lend its code to the analyzer's own line", () => {
    // An indented line whose text, once un-indented, reads exactly like a
    // top-level line. The top-level line keeps its own code and only that.
    const own = "No heading tags found in the document structure";
    const quoted = `  ${own}`;
    const index = buildCodeIndex(
      [own, quoted],
      [
        detail("pdf.heading_structure.headings_found", own),
        detail("pdf.heading_structure.no_heading_tags", quoted),
      ],
    );
    expect(index?.get(own)?.map((c) => c.code)).toEqual(["pdf.heading_structure.headings_found"]);
    expect(isFinding(FINDING.pdfNoHeadingTags, own, index)).toBe(false);
  });

  it("keeps both codes when the same words are tagged twice in one category", () => {
    const line = "  https://example.org";
    const index = buildCodeIndex(
      [line, line],
      [
        detail("pdf.link_quality.raw_urls_item", line),
        detail("pdf.link_quality.vague_list_item", line),
      ],
    );
    expect(index?.get(line)?.map((c) => c.code)).toEqual([
      "pdf.link_quality.raw_urls_item",
      "pdf.link_quality.vague_list_item",
    ]);
  });
});

describe("the wording helpers match the way each consumer always has", () => {
  it("phrase: every needle, ignoring case", () => {
    expect(phrase("Pages", "no bookmarks")("This document has 20 pages and NO BOOKMARKS")).toBe(
      true,
    );
    expect(phrase("pages", "no bookmarks")("Bookmarks are not required for 3 pages")).toBe(false);
  });

  it("text: one part, case and all", () => {
    expect(text("Document is NOT tagged")("Document is NOT tagged — no StructTreeRoot found")).toBe(
      true,
    );
    expect(text("Document is NOT tagged")("document is not tagged")).toBe(false);
  });

  it("findingLines skips entries that are not strings", () => {
    const lines = findingLines([null, 3, "Document is NOT tagged — no StructTreeRoot found"]);
    expect(lines.has(FINDING.planNotTagged)).toBe(true);
    expect(lines.has(FINDING.planAccessDenied)).toBe(false);
    expect(findingLines("not an array").has(FINDING.planNotTagged)).toBe(false);
  });
});

describe("each consumer goes by code when the line is reworded", () => {
  it("fixTime: the count comes from the code, not from the sentence", () => {
    const line = "Some paragraphs were typed with bullet characters by hand.";
    const details = [detail("docx.list_structure.typed_bullets", line, { count: 9 })];
    expect(estimateFixTime("list_structure", [line], "docx")).toBeNull();
    expect(estimateFixTime("list_structure", [line], "docx", details)).toEqual({
      label: "~3 min",
      maxMinutes: 3,
    });
  });

  it("fixTime: missing alt is total minus described, from the code", () => {
    const line = "Two of the five pictures carry a description.";
    const details = [detail("docx.alt_text.images_with_alt", line, { count: 2, total: 5 })];
    expect(estimateFixTime("alt_text", [line], "docx", details)?.label).toBe("~3 min");
  });

  it("actionPlan: the step variant is chosen by code", () => {
    const line = "Assistive technology is locked out by this file's permissions.";
    const category = {
      id: "text_extractability",
      label: "Text Extractability",
      severity: "Critical",
      findings: [line],
    };
    const coded = {
      ...category,
      findingDetails: [detail("pdf.text_extractability.accessibility_denied", line)],
    };
    const title = "Allow screen readers in the document's security settings";
    expect(buildActionPlan([category], "pdf")[0]?.title).not.toBe(title);
    expect(buildActionPlan([coded], "pdf")[0]?.title).toBe(title);
  });

  it("bestPractices: matchers and signal groups read the code", () => {
    const findings = [
      "The outline of this file is empty of headings.",
      "--- Levels, in order ---",
      "  H1 → H2",
    ];
    const category = {
      id: "heading_structure",
      findings,
      findingDetails: [
        detail("pdf.heading_structure.no_heading_tags", findings[0]!),
        detail("pdf.heading_structure.tree_heading", findings[1]!),
        detail("pdf.heading_structure.tree_levels", findings[2]!),
      ],
    };
    const coded = buildContext(category, "pdf", 3);
    expect(matchMain(coded, FINDING.pdfNoHeadingTags)).toBe(findings[0]);
    expect(signalLines(coded, FINDING.pdfHeadingTreeGroup)).toEqual(["H1 → H2"]);

    const stored = buildContext({ id: category.id, findings }, "pdf", 3);
    expect(stored.codes).toBeNull();
    expect(matchMain(stored, FINDING.pdfNoHeadingTags)).toBeNull();
    expect(signalLines(stored, FINDING.pdfHeadingTreeGroup)).toEqual([]);
    // Bare needles remain wording-only, whatever codes the context carries.
    expect(matchMain(coded, "no heading tags")).toBeNull();
    expect(matchMain(coded, "empty of headings")).toBe(findings[0]);
  });
});
