import { describe, it, expect } from "vitest";
import { buildActionPlan, verdictPhrase, PLAN_COPY } from "../utils/actionPlan";

const cat = (id: string, label: string, severity: string | null, findings: string[] = []) => ({
  id,
  label,
  severity,
  findings,
});

// The full id inventory — union of pdf/docx/pptx/xlsx scorers. If the analyzer
// gains a category, this list (and PLAN_COPY) must grow with it.
const ALL_IDS = [
  "text_extractability",
  "title_language",
  "heading_structure",
  "alt_text",
  "color_contrast",
  "bookmarks",
  "table_markup",
  "link_quality",
  "form_accessibility",
  "reading_order",
  "list_structure",
  "slide_titles",
  "sheet_names",
];

describe("PLAN_COPY dictionary", () => {
  it.each(ALL_IDS)("has a plain-language entry for %s", (id) => {
    const entry = PLAN_COPY[id];
    expect(entry).toBeDefined();
    expect(entry!.title.length).toBeGreaterThan(10);
    expect(entry!.why.length).toBeGreaterThan(20);
    // Plain language: titles are imperative sentences, not jargon labels.
    expect(entry!.title).not.toMatch(/WCAG|ISO|14289/);
    expect(entry!.why).not.toMatch(/WCAG|ISO|14289/);
  });
});

describe("buildActionPlan", () => {
  it("orders steps Critical → Moderate → Minor with 1-based ranks", () => {
    const steps = buildActionPlan(
      [
        cat("bookmarks", "Bookmarks / Navigation", "Minor"),
        cat("title_language", "Document Title & Language", "Moderate"),
        cat("text_extractability", "Text Extractability", "Critical"),
        cat("alt_text", "Alt Text on Images", "Pass"),
        cat("color_contrast", "Color Contrast", null),
      ],
      "pdf",
    );
    expect(steps.map((s) => s.categoryId)).toEqual([
      "text_extractability",
      "title_language",
      "bookmarks",
    ]);
    expect(steps.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(steps[0]!.detailAnchor).toBe("#cat-text_extractability");
  });

  it("keeps analyzer emission order for equal severities (stable sort)", () => {
    const steps = buildActionPlan(
      [
        cat("title_language", "Document Title & Language", "Moderate"),
        cat("heading_structure", "Heading Structure", "Moderate"),
      ],
      "pdf",
    );
    expect(steps.map((s) => s.categoryId)).toEqual(["title_language", "heading_structure"]);
  });

  it("gives PDFs two routes (source first, then Acrobat)", () => {
    const steps = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf");
    expect(steps[0]!.routes.map((r) => r.tool)).toEqual(["source", "acrobat"]);
    expect(steps[0]!.routes[0]!.steps.length).toBeGreaterThan(0);
    expect(steps[0]!.routes[1]!.steps.length).toBeGreaterThan(0);
  });

  it("gives OOXML files a single source route (the upload IS the source)", () => {
    const docx = buildActionPlan(
      [cat("heading_structure", "Heading Structure", "Critical")],
      "docx",
    );
    expect(docx[0]!.routes.map((r) => r.tool)).toEqual(["source"]);
    const pptx = buildActionPlan([cat("slide_titles", "Slide Titles", "Moderate")], "pptx");
    expect(pptx[0]!.routes.map((r) => r.tool)).toEqual(["source"]);
    const xlsx = buildActionPlan([cat("sheet_names", "Sheet Names", "Minor")], "xlsx");
    expect(xlsx[0]!.routes.map((r) => r.tool)).toEqual(["source"]);
  });

  it("prefers the report's own '--- Adobe Acrobat: How to Fix ---' steps over the dictionary", () => {
    const steps = buildActionPlan(
      [
        cat("table_markup", "Table Markup", "Moderate", [
          "2 tables lack header rows",
          "--- Adobe Acrobat: How to Fix ---",
          "Open the Tags panel",
          "Mark the first row cells as <TH>",
        ]),
      ],
      "pdf",
    );
    const acrobat = steps[0]!.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps).toEqual(["Open the Tags panel", "Mark the first row cells as <TH>"]);
  });

  it("missing fileType is treated as pdf (old stored reports)", () => {
    const steps = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], undefined);
    expect(steps[0]!.routes.map((r) => r.tool)).toEqual(["source", "acrobat"]);
  });

  it("unknown category id falls back to label + first actionable finding — never blank", () => {
    const steps = buildActionPlan(
      [cat("future_check", "Future Check", "Critical", ["Tip: skip", "3 widgets are broken"])],
      "pdf",
    );
    expect(steps[0]!.title).toBe("Fix: Future Check");
    expect(steps[0]!.why).toBe("3 widgets are broken");
    expect(steps[0]!.routes.length).toBeGreaterThan(0);
    expect(steps[0]!.wcagRefs).toEqual([]);
  });

  it("attaches WCAG refs from WCAG_CATEGORY_MAP", () => {
    const steps = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf");
    expect(steps[0]!.wcagRefs).toEqual([{ sc: "1.1.1", name: "Non-text Content" }]);
  });

  it("survives malformed input (forged stored reports)", () => {
    expect(buildActionPlan(null, "pdf")).toEqual([]);
    expect(buildActionPlan("junk" as unknown, "pdf")).toEqual([]);
    expect(
      buildActionPlan([{ id: "x", label: "X", severity: "Critical", findings: "junk" }], "pdf")[0]!
        .title,
    ).toBe("Fix: X");
  });
});

describe("verdictPhrase", () => {
  it("critical present → not ready to publish", () => {
    expect(verdictPhrase([cat("a", "A", "Critical"), cat("b", "B", "Minor")])).toBe(
      "not ready to publish",
    );
  });
  it("moderate only → fix recommended before publishing", () => {
    expect(verdictPhrase([cat("a", "A", "Moderate")])).toBe("fix recommended before publishing");
  });
  it("minor only / clean → ready to publish", () => {
    expect(verdictPhrase([cat("a", "A", "Minor")])).toBe("ready to publish");
    expect(verdictPhrase([cat("a", "A", "Pass")])).toBe("ready to publish");
    expect(verdictPhrase([])).toBe("ready to publish");
    expect(verdictPhrase(null)).toBe("ready to publish");
  });
});
