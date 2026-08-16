import { describe, it, expect } from "vitest";
import { buildActionPlan, publicationVerdict, PLAN_COPY } from "../utils/actionPlan";

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

describe("text_extractability failure-mode variants", () => {
  // One category id covers four very different problems. The plan step must
  // describe the one the analyzer actually found — a Minor font-embedding
  // advisory on a fully tagged, fully extractable PDF was being presented as
  // "some or all of this document is a picture of text" (user report,
  // 2026-08-15: ARI fact sheet, 85/Minor, text + tags fine, 3 fonts
  // unembedded). Detection keys on finding strings the analyzer has emitted
  // for every stored report; unknown strings keep today's copy.

  const build = (findings: string[], severity = "Minor") =>
    buildActionPlan(
      [cat("text_extractability", "Text Extractability", severity, findings)],
      "pdf",
    )[0]!;

  it("non-embedded fonts on a tagged, extractable PDF → font-embedding step, not OCR", () => {
    const step = build([
      "PDF contains extractable text",
      "Document is tagged (StructTreeRoot present)",
      "Extracted 5,447 characters of text content",
      "--- Font Embedding ---",
      "  8 font(s) found: 5 embedded, 3 not embedded",
      "  TimesNewRomanPSMT — NOT embedded",
      "3 non-embedded font(s) may cause garbled text on systems without these fonts: TimesNewRomanPS-BoldMT, TimesNewRomanPSMT, ArialMT",
      "Fix: In the source application (Word, InDesign), enable font embedding before exporting to PDF. In Acrobat: Document properties (☰ Menu on Windows, File menu on Mac) → Fonts tab shows embedding status.",
    ]);
    expect(step.title.toLowerCase()).toContain("font");
    // The why must say the text itself reads fine — the exact opposite of
    // the scanned-document copy.
    expect(step.why.toLowerCase()).toContain("readable");
    expect(step.why).not.toContain("picture of text");
    const source = step.routes.find((r) => r.tool === "source")!;
    expect(source.steps.join(" ")).toMatch(/font embedding/i);
    expect(source.steps.join(" ")).not.toMatch(/structure tags/i);
    // No per-document Acrobat block in this fixture → dictionary route.
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps.join(" ")).toMatch(/Fonts tab|Embed missing fonts/);
    expect(acrobat.steps.join(" ")).not.toMatch(/Scan & OCR/);
  });

  it("extractable text but no tags → tagging step, without OCR and without 'picture of text'", () => {
    const step = build(
      [
        "PDF contains extractable text",
        "Document is NOT tagged — no StructTreeRoot found",
        "How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF (classic UI: Tools → Accessibility → Autotag Document). Tags create a hidden structure that tells screen readers the reading order, headings, and other elements.",
      ],
      "Moderate",
    );
    expect(step.title.toLowerCase()).toContain("tag");
    expect(step.why).not.toContain("picture of text");
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps.join(" ")).toContain("Automatically tag PDF");
    expect(acrobat.steps.join(" ")).not.toMatch(/Scan & OCR/);
  });

  it("an EMPTY structure tree is the same barrier as no tags → same tagging step", () => {
    const step = build(
      [
        "PDF contains extractable text",
        "A tag structure (StructTreeRoot) is present but EMPTY — it references no paragraphs, headings, figures, tables, lists, or marked content.",
      ],
      "Moderate",
    );
    expect(step.title.toLowerCase()).toContain("tag");
    expect(step.why).not.toContain("picture of text");
  });

  it("security settings that deny assistive technology → security step, ranked by its own copy", () => {
    const step = build(
      [
        "The document's security settings deny assistive-technology access — the accessibility permission flag is off (PDF/UA 7.16 / Matterhorn 26-002).",
        "Screen readers in conforming viewers cannot read ANY content of this document, regardless of tagging or text quality.",
      ],
      "Critical",
    );
    expect(step.title.toLowerCase()).toContain("security");
    expect(step.why.toLowerCase()).toContain("security");
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps.join(" ")).toContain("Enable text access for screen reader devices");
    expect(acrobat.steps.join(" ")).not.toMatch(/Scan & OCR/);
  });

  it("a genuinely scanned document keeps the original copy — OCR is the right advice there", () => {
    const step = build(
      [
        "No extractable text found",
        "No tag structure found",
        "This PDF appears to be a scanned image — it is essentially a photograph of text. Screen readers cannot read it at all.",
      ],
      "Critical",
    );
    expect(step.title).toBe("Make the text readable by screen readers");
    expect(step.why).toContain("picture of text");
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps.join(" ")).toContain("Scan & OCR");
  });

  it("unrecognized findings (old stored reports) keep the original copy", () => {
    expect(build(["No text found"], "Critical").title).toBe(
      "Make the text readable by screen readers",
    );
    expect(build([], "Critical").title).toBe("Make the text readable by screen readers");
  });

  it("untagged + unembedded fonts together → tagging wins (the more fundamental barrier)", () => {
    const step = build(
      [
        "PDF contains extractable text",
        "Document is NOT tagged — no StructTreeRoot found",
        "3 non-embedded font(s) may cause garbled text on systems without these fonts: ArialMT",
      ],
      "Moderate",
    );
    expect(step.title.toLowerCase()).toContain("tag");
    expect(step.title.toLowerCase()).not.toContain("font");
  });

  it("variant titles and whys obey the plain-language rule", () => {
    const variants = [
      build([
        "Document is tagged (StructTreeRoot present)",
        "3 non-embedded font(s) may cause garbled text on systems without these fonts: ArialMT",
      ]),
      build(
        ["PDF contains extractable text", "Document is NOT tagged — no StructTreeRoot found"],
        "Moderate",
      ),
      build(
        [
          "The document's security settings deny assistive-technology access — the accessibility permission flag is off (PDF/UA 7.16 / Matterhorn 26-002).",
        ],
        "Critical",
      ),
    ];
    for (const step of variants) {
      expect(step.title.length).toBeGreaterThan(10);
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.title).not.toMatch(/WCAG|ISO|14289|StructTreeRoot/);
      expect(step.why).not.toMatch(/WCAG|ISO|14289|StructTreeRoot/);
    }
  });
});

describe("InDesign-authored PDFs (creator detection)", () => {
  // Annual reports at ICJIA are frequently laid out in Adobe InDesign, not
  // Word — a reader holding an .indd file can't follow "File → Save As →
  // PDF" because InDesign has no such menu. The analyzer already stores the
  // PDF's Creator (InDesign stamps "Adobe InDesign <version>" on every
  // direct export), so the source route swaps to InDesign steps when the
  // report says InDesign made the file. Anything else — Word, missing,
  // unrecognized, old reports — keeps today's copy exactly (fail-safe =
  // status quo, same posture as the text_extractability variants).

  const INDESIGN = "Adobe InDesign 21.4 (Macintosh)";
  const INDESIGN_LABEL = "Easiest — fix the InDesign file, then re-export";

  it("swaps the source route to InDesign steps and says so in the label", () => {
    const steps = buildActionPlan(
      [cat("heading_structure", "Heading Structure", "Moderate")],
      "pdf",
      INDESIGN,
    );
    const source = steps[0]!.routes.find((r) => r.tool === "source")!;
    expect(source.label).toBe(INDESIGN_LABEL);
    expect(source.steps.join(" ")).toContain("Edit All Export Tags");
    expect(source.steps.join(" ")).not.toMatch(/\bWord\b/);
    // The Acrobat route is untouched — no-source-file readers keep their path.
    const acrobat = steps[0]!.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps.length).toBeGreaterThan(0);
  });

  it("recognizes real-world Creator strings from any InDesign era, any case", () => {
    for (const creator of ["Adobe InDesign CC 2019 (Windows)", "adobe indesign 16.0"]) {
      const steps = buildActionPlan(
        [cat("alt_text", "Alt Text on Images", "Critical")],
        "pdf",
        creator,
      );
      expect(steps[0]!.routes[0]!.steps.join(" ")).toContain("Object Export Options");
    }
  });

  it("keeps today's routes byte-for-byte for Word, unknown, and missing creators", () => {
    const today = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf");
    for (const creator of ["Microsoft® Word for Microsoft 365", "Canon iR-ADV", null, undefined]) {
      expect(
        buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf", creator)[0]!
          .routes,
      ).toEqual(today[0]!.routes);
    }
  });

  it("ignores the creator for OOXML uploads — the upload IS the source", () => {
    const steps = buildActionPlan(
      [cat("heading_structure", "Heading Structure", "Critical")],
      "docx",
      INDESIGN,
    );
    expect(steps[0]!.routes.map((r) => r.tool)).toEqual(["source"]);
    expect(steps[0]!.routes[0]!.steps.join(" ")).not.toContain("InDesign");
  });

  it("every PLAN_COPY entry with PDF source steps carries InDesign steps", () => {
    for (const [id, entry] of Object.entries(PLAN_COPY)) {
      if (entry.source.pdf?.length) {
        expect(entry.sourceInDesign?.length, `${id} lacks sourceInDesign`).toBeGreaterThan(0);
      } else {
        expect(
          entry.sourceInDesign,
          `${id} has InDesign steps but no PDF source steps`,
        ).toBeUndefined();
      }
    }
  });

  it("InDesign steps send no one into Word menus", () => {
    for (const [id, entry] of Object.entries(PLAN_COPY)) {
      for (const step of entry.sourceInDesign ?? []) {
        expect(step, `${id}`).not.toMatch(/\bWord\b/);
      }
    }
  });

  it("text_extractability variants are InDesign-aware too", () => {
    const fonts = buildActionPlan(
      [
        cat("text_extractability", "Text Extractability", "Minor", [
          "PDF contains extractable text",
          "Document is tagged (StructTreeRoot present)",
          "3 non-embedded font(s) may cause garbled text on systems without these fonts: ArialMT",
        ]),
      ],
      "pdf",
      INDESIGN,
    )[0]!;
    const fontsSource = fonts.routes.find((r) => r.tool === "source")!;
    expect(fontsSource.label).toBe(INDESIGN_LABEL);
    expect(fontsSource.steps.join(" ")).toMatch(/embeds fonts automatically/i);

    const untagged = buildActionPlan(
      [
        cat("text_extractability", "Text Extractability", "Moderate", [
          "PDF contains extractable text",
          "Document is NOT tagged — no StructTreeRoot found",
        ]),
      ],
      "pdf",
      INDESIGN,
    )[0]!;
    const untaggedSource = untagged.routes.find((r) => r.tool === "source")!;
    expect(untaggedSource.steps.join(" ")).toContain("Create Tagged PDF");
    expect(untaggedSource.steps.join(" ")).not.toMatch(/\bWord\b/);
  });

  it("unknown category ids still fall back safely under an InDesign creator", () => {
    const steps = buildActionPlan(
      [cat("future_check", "Future Check", "Critical", ["3 widgets are broken"])],
      "pdf",
      INDESIGN,
    );
    expect(steps[0]!.routes.length).toBeGreaterThan(0);
  });
});

describe("publicationVerdict", () => {
  it("leads with the blocker, counted, and carries the critical tone", () => {
    expect(publicationVerdict([cat("a", "A", "Critical"), cat("b", "B", "Minor")])).toEqual({
      text: "Not ready to publish — 1 critical issue",
      tone: "critical",
    });
    expect(publicationVerdict([cat("a", "A", "Critical"), cat("b", "B", "Critical")]).text).toBe(
      "Not ready to publish — 2 critical issues",
    );
  });

  it("moderate only keeps the clause that pairs with a grade adjective", () => {
    expect(publicationVerdict([cat("a", "A", "Moderate")])).toEqual({
      text: "fix recommended before publishing",
      tone: "moderate",
    });
  });

  it("minor only / clean / malformed → ready to publish", () => {
    for (const input of [
      [cat("a", "A", "Minor")],
      [cat("a", "A", "Pass")],
      [],
      null,
      "junk" as unknown as null,
    ]) {
      expect(publicationVerdict(input)).toEqual({ text: "ready to publish", tone: "ok" });
    }
  });
});
