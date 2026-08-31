import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("RB-review F5: heavy unmapped glyphs on a tagged PDF → font/character-map step, never the OCR headline", () => {
    const step = build(
      [
        "PDF contains extractable text",
        "Document is tagged (StructTreeRoot present)",
        "--- Character Mapping (Matterhorn 10) ---",
        "  300 extracted character(s) cannot be mapped to readable text (30% of the text layer) — the glyphs paint on screen, but they extract as private-use symbols a screen reader cannot pronounce.",
        "  A meaningful share of this document's text cannot be read aloud or searched, whatever the tagging says. Fix at the source: re-export the PDF from the original application with standard fonts (or embedding enabled), or run OCR over the affected pages — Acrobat: All tools → Scan & OCR → Recognize Text.",
      ],
      "Moderate",
    );
    expect(step.title.toLowerCase()).toMatch(/font|words/);
    expect(step.why).not.toContain("picture of text");
    expect(step.why.toLowerCase()).toContain("unreadable symbols");
  });

  it("RB-review F5: heavy untagged text on a tagged PDF → bring-into-structure step, never the OCR headline", () => {
    const step = build(
      [
        "PDF contains extractable text",
        "Document is tagged (StructTreeRoot present)",
        "--- Content Outside the Tag Structure (Matterhorn 01) ---",
        "  500 visible character(s) — 50% of the page text — are painted outside the tagged content (pages 2, 3). They are neither in the reading order nor marked as decorative artifacts, so a screen reader following the tags never encounters them.",
        "  How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF to bring the untagged content into the structure, then verify the affected pages in the Tags panel — or mark genuinely decorative runs as artifacts.",
      ],
      "Moderate",
    );
    expect(step.title.toLowerCase()).toContain("untagged text");
    expect(step.why).not.toContain("picture of text");
    expect(step.why.toLowerCase()).toContain("outside the tag structure");
  });

  it("RB-review F5: the ADVISORY census tiers keep the category's normal copy (no variant hijack)", () => {
    const step = build(
      [
        "PDF contains extractable text",
        "Document is tagged (StructTreeRoot present)",
        "3 non-embedded font(s) may cause garbled text on systems without these fonts: ArialMT",
        "--- Character Mapping (Matterhorn 10) ---",
        "  4 extracted character(s) cannot be mapped to readable text (0% of the text layer)…",
        "  Advisory — not scored: a count this small is usually symbol-font bullets or dingbats… No action needed unless real words are affected.",
      ],
      "Minor",
    );
    // The fonts variant should win — the advisory glyph line must not steal
    // the headline from the actual (scored) problem.
    expect(step.title.toLowerCase()).toContain("font");
    expect(step.title.toLowerCase()).not.toContain("words");
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

describe("alt_text variant — lettering that is artwork, not text", () => {
  // Most authors only ever read the Visual view, so the plan step is where
  // this has to be explained (user request, 2026-08-27). The defect: Word's
  // PDF export flattens text carrying an effect into pictures, one per line.
  // A real ICJIA board agenda is the reference case — its letterhead, the
  // agency's own name, became three images, so "ILLINOIS" appeared nowhere
  // in the text layer.
  //
  // The step's first job is to answer "what images?". The author knows they
  // never inserted one, and nothing in Word looked wrong, so a step that
  // opens by demanding descriptions reads as the tool being broken.
  const RASTERIZED_FINDINGS = [
    "0 of 3 image(s) have alternative text",
    "--- Images Missing Alt Text ---",
    "  Image 1: <Figure> tag — no /Alt attribute",
    "--- Some Lettering May Not Be Real Text ---",
    "3 image(s) in this document are shaped like lines of writing — wide, short, and about as tall as a line of type — rather than like photographs or logos.",
    "Why it matters: a picture of a word is not a word.",
  ];

  it("explains what the mystery images are and why they exist", () => {
    const step = buildActionPlan(
      [cat("alt_text", "Alt Text on Images", "Critical", RASTERIZED_FINDINGS)],
      "pdf",
    )[0]!;
    expect(step.title).toMatch(/artwork|lettering/i);
    // Answers "what images?" before asking the author for anything.
    expect(step.why).toMatch(/never have added|never added/i);
    expect(step.why).toMatch(/letterhead|banner/i);
    // Says why it matters in human terms, not standards terms.
    expect(step.why).toMatch(/screen reader/i);
    expect(step.why).toMatch(/search/i);
    // Gives the reader the ten-second self-check.
    expect(step.why).toMatch(/select/i);
    // And is honest that no source-side checker can warn them.
    expect(step.why).toMatch(/no checker inside Word or InDesign|source file looks fine/i);
  });

  it("covers BOTH causes — recoverable typed text and unrecoverable artwork", () => {
    // The correction that a fresh-eyes review forced (2026-08-27). The first
    // copy asserted one mechanism: "Word flattened your text into a picture,
    // remove the effect and re-export". Inspecting the reference agenda's
    // content stream showed the letterhead words were VECTOR OUTLINES —
    // 194 bezier curves, zero text operators — i.e. lettering inside placed
    // artwork, which no amount of removing effects recovers. Telling that
    // author to strip a text effect would have sent them hunting for
    // something that was never there. Both causes must be named, with their
    // different remedies.
    const step = buildActionPlan(
      [cat("alt_text", "Alt Text on Images", "Critical", RASTERIZED_FINDINGS)],
      "pdf",
    )[0]!;
    const source = step.routes.find((r) => r.tool === "source")!.steps.join(" ");
    // Cause 1: baked into a logo/letterhead graphic — NOT recoverable, so the
    // remedy is real text elsewhere plus marking the graphic decorative.
    expect(source).toMatch(/logo or letterhead/i);
    expect(source).toMatch(/never text and cannot be recovered|cannot be recovered/i);
    expect(source).toMatch(/decorative/i);
    // Cause 2: typed text carrying an effect — IS recoverable at the source.
    expect(source).toMatch(/Text Effects/i);
    expect(source).toMatch(/does come through as real text|once the effect is gone/i);
    expect(source).toMatch(/re-upload|Save as PDF again/i);
    // Real photos still need describing — not lost when this variant takes over.
    expect(source).toMatch(/Alt Text/);
  });

  it("is honest that Acrobat cannot undo it", () => {
    const step = buildActionPlan(
      [cat("alt_text", "Alt Text on Images", "Critical", RASTERIZED_FINDINGS)],
      "pdf",
    )[0]!;
    const acrobatText = step.routes.find((r) => r.tool === "acrobat")!.steps.join(" ");
    expect(acrobatText).toMatch(/cannot turn artwork back into text/i);
    expect(acrobatText).toMatch(/Background\/Artifact/);
  });

  it("outranks the text-box variant when a document has both", () => {
    // First match wins, and this defect is the more severe of the two: a text
    // box still holds its words inside the file, a flattened line has none.
    const step = buildActionPlan(
      [
        cat("alt_text", "Alt Text on Images", "Critical", [
          ...RASTERIZED_FINDINGS,
          "--- Figures That Contain Text ---",
          '  Page 22: "LEGISLATIVE TIMELINE"',
        ]),
      ],
      "pdf",
    )[0]!;
    expect(step.title).toMatch(/artwork|lettering/i);
    expect(step.why).toMatch(/letterhead|banner/i);
  });

  it("keeps today's copy when no image looks like text", () => {
    const today = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf")[0]!;
    const plain = buildActionPlan(
      [
        cat("alt_text", "Alt Text on Images", "Critical", [
          "0 of 3 image(s) have alternative text",
          "  Image 1: <Figure> tag — no /Alt attribute",
        ]),
      ],
      "pdf",
    )[0]!;
    expect(plain.title).toBe(today.title);
    expect(plain.why).toBe(today.why);
  });

  it("is InDesign-aware and obeys the plain-language rule", () => {
    const step = buildActionPlan(
      [cat("alt_text", "Alt Text on Images", "Critical", RASTERIZED_FINDINGS)],
      "pdf",
      "Adobe InDesign 21.4 (Macintosh)",
    )[0]!;
    const source = step.routes.find((r) => r.tool === "source")!;
    expect(source.label).toBe("Easiest — fix the InDesign file, then re-export");
    expect(source.steps.join(" ")).not.toMatch(/Word|File → Save As/);
    // Non-technical audience: no standards references, and none of the PDF
    // internals the Detailed view is allowed to use.
    for (const s of [step.title, step.why, ...step.routes.flatMap((r) => r.steps)]) {
      expect(s).not.toMatch(/WCAG|ISO|14289|StructTreeRoot|MCID|rasteri[sz]|XObject/i);
    }
  });

  it("leads the Acrobat route with the correction, ahead of the report's own block", () => {
    // Caught by rendering the real agenda rather than by a unit test: a
    // report carrying its own Acrobat block beats the dictionary default, so
    // the route opened with "Add alternate text — Acrobat detects all figures
    // and walks through them" — the exact move this step exists to prevent.
    // The lead-in must come FIRST, and the block's still-useful steps stay.
    const step = buildActionPlan(
      [
        cat("alt_text", "Alt Text on Images", "Critical", [
          ...RASTERIZED_FINDINGS,
          "--- Adobe Acrobat: How to Fix ---",
          "To fix every image in one pass: All tools → Prepare for accessibility → Add alternate text",
          "Decorative images: select with the Reading Order tool → click Background/Artifact",
        ]),
      ],
      "pdf",
    )[0]!;
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps[0]).toMatch(/do not describe the graphics that are really words/i);
    expect(acrobat.steps[0]).toMatch(/cannot turn artwork back into letters/i);
    // The per-document block survives underneath — a real photo still needs a
    // description, and that advice must not be thrown away.
    expect(acrobat.steps.join(" ")).toMatch(/Add alternate text/);
    expect(acrobat.steps.length).toBeGreaterThan(1);
  });

  it("does not say the caveat twice when the dictionary default is in use", () => {
    // With no per-document block the dictionary copy already opens with the
    // same warning, so the lead-in must stay out of the way.
    const step = buildActionPlan(
      [cat("alt_text", "Alt Text on Images", "Critical", RASTERIZED_FINDINGS)],
      "pdf",
    )[0]!;
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    const leadIns = acrobat.steps.filter((s) => /do not describe the graphics/i.test(s));
    expect(leadIns).toHaveLength(0);
    expect(acrobat.steps[0]).toMatch(/cannot turn artwork back into text/i);
  });

  it("matches the header the ANALYZER actually emits — the wiring, not just the logic", () => {
    // This variant is keyed on a string produced in another package. Both
    // sides pass their own tests while agreeing on nothing if either is
    // reworded, and the symptom is silent: the Visual view quietly drops back
    // to "add a description", which is the exact wrong advice this exists to
    // replace. So assert the literal at its source.
    const analyzer = readFileSync(
      resolve(__dirname, "../../../../packages/analyzer/src/scoring/pdf.ts"),
      "utf8",
    );
    expect(analyzer).toContain("--- Some Lettering May Not Be Real Text ---");
  });
});

describe("alt_text variant — figures that are really text boxes", () => {
  // Word exports text boxes, sidebars, SmartArt and chart title bars as
  // <Figure>. A Figure's alt text REPLACES its contents for a screen reader,
  // so the stock "describe every image" step would have the author hide the
  // text those boxes hold (FFY24 SCIP Plan, 2026-08-20: 16 of 26 alt-less
  // figures were text). When the analyzer reports such figures, the plan's
  // step must say so — and must keep describing the real pictures.
  const TEXT_FIGURE_FINDINGS = [
    "1 of 27 image(s) have alternative text",
    "--- Images Missing Alt Text ---",
    "  Image 1: <Figure> tag — no /Alt attribute",
    "--- Figures That Contain Text ---",
    "16 <Figure> tag(s) without alt text contain readable text — typically Word text boxes, sidebars, SmartArt, or chart title bars exported as figures:",
    '  Page 22: "LEGISLATIVE TIMELINE"',
    "Do not add alt text to these. A <Figure>'s alternate text replaces its contents for screen readers, so describing a text box as an image hides the text inside it.",
  ];

  it("tells the author to retag the text boxes and still describe the real pictures", () => {
    const step = buildActionPlan(
      [cat("alt_text", "Alt Text on Images", "Critical", TEXT_FIGURE_FINDINGS)],
      "pdf",
    )[0]!;
    expect(step.title).toMatch(/text box/i);
    expect(step.why).toMatch(/text box/i);
    expect(step.why).toMatch(/hide/i);
    const source = step.routes.find((r) => r.tool === "source")!;
    const joined = source.steps.join(" ");
    expect(joined).toMatch(/Alt Text/);
    expect(joined).toMatch(/text box/i);
    expect(joined).toMatch(/ordinary paragraphs|main text/i);
    // No per-document Acrobat block in this fixture → dictionary route, which
    // must carry the retag path.
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps.join(" ")).toMatch(/Properties → Type/);
  });

  it("keeps today's copy when no figure contains text", () => {
    const today = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf")[0]!;
    const plain = buildActionPlan(
      [
        cat("alt_text", "Alt Text on Images", "Critical", [
          "0 of 3 image(s) have alternative text",
          "  Image 1: <Figure> tag — no /Alt attribute",
        ]),
      ],
      "pdf",
    )[0]!;
    expect(plain.title).toBe(today.title);
    expect(plain.why).toBe(today.why);
  });

  it("is InDesign-aware and obeys the plain-language rule", () => {
    const step = buildActionPlan(
      [cat("alt_text", "Alt Text on Images", "Critical", TEXT_FIGURE_FINDINGS)],
      "pdf",
      "Adobe InDesign 21.4 (Macintosh)",
    )[0]!;
    const source = step.routes.find((r) => r.tool === "source")!;
    expect(source.label).toBe("Easiest — fix the InDesign file, then re-export");
    expect(source.steps.join(" ")).not.toMatch(/Word|File → Save As/);
    expect(step.title).not.toMatch(/WCAG|ISO|14289|StructTreeRoot|MCID/);
    expect(step.why).not.toMatch(/WCAG|ISO|14289|StructTreeRoot|MCID/);
  });
});

describe("link_quality variant — untagged links", () => {
  // Six links inside a Word text box had no <Link> tag (FFY24 SCIP Plan,
  // 2026-08-20). The stock link step says Acrobat cannot help — true for
  // link WORDING, false for tagging, which Acrobat's "Unmarked Links" finder
  // handles — and sends the author to rewrite text that is fine.
  const UNTAGGED_FINDINGS = [
    "6 of 83 link(s) are not tagged — the link exists on the page, but no <Link> tag wraps it in the structure tree, so a screen reader following the tags never encounters it.",
    "--- Links Not Tagged ---",
    '  "PA" (page 22) → https://www.ilga.gov/legislation/publicacts/102/102-1116.htm',
  ];

  it("explains the tagging problem and gives a real Acrobat route", () => {
    const step = buildActionPlan(
      [cat("link_quality", "Link & URL Quality", "Minor", UNTAGGED_FINDINGS)],
      "pdf",
    )[0]!;
    expect(step.title).toMatch(/tag/i);
    expect(step.why).toMatch(/no tag|not tagged|without a tag/i);
    const source = step.routes.find((r) => r.tool === "source")!;
    expect(source.steps.join(" ")).toMatch(/text box/i);
    const acrobat = step.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.label).toBe("No source file? Fix the PDF in Acrobat Pro");
    expect(acrobat.steps.join(" ")).toMatch(/Unmarked Links/);
  });

  it("still covers link wording, since both problems usually travel together", () => {
    const step = buildActionPlan(
      [cat("link_quality", "Link & URL Quality", "Minor", UNTAGGED_FINDINGS)],
      "pdf",
    )[0]!;
    const source = step.routes.find((r) => r.tool === "source")!;
    expect(source.steps.join(" ")).toMatch(/describe the destination/i);
  });

  it("keeps today's source-only copy when every link is tagged", () => {
    const today = buildActionPlan([cat("link_quality", "Link & URL Quality", "Minor")], "pdf")[0]!;
    const vagueOnly = buildActionPlan(
      [
        cat("link_quality", "Link & URL Quality", "Minor", [
          '1 of 9 link(s) use non-descriptive text — empty, a vague phrase such as "click here" / "read more", or too short to mean anything',
          "--- Links With Non-Descriptive Text ---",
          '  "here" (page 21) — vague phrase → https://example.org',
        ]),
      ],
      "pdf",
    )[0]!;
    expect(vagueOnly.title).toBe(today.title);
    expect(vagueOnly.routes.find((r) => r.tool === "acrobat")!.label).toBe(
      "Only fixable in the source document",
    );
  });

  it("is InDesign-aware and obeys the plain-language rule", () => {
    const step = buildActionPlan(
      [cat("link_quality", "Link & URL Quality", "Minor", UNTAGGED_FINDINGS)],
      "pdf",
      "Adobe InDesign 21.4 (Macintosh)",
    )[0]!;
    const source = step.routes.find((r) => r.tool === "source")!;
    expect(source.label).toBe("Easiest — fix the InDesign file, then re-export");
    expect(source.steps.join(" ")).not.toMatch(/Word|File → Save As/);
    expect(step.title).not.toMatch(/WCAG|ISO|14289|StructTreeRoot|MCID/);
    expect(step.why).not.toMatch(/WCAG|ISO|14289|StructTreeRoot|MCID/);
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

describe("table_markup variant — headers exist but have no direction", () => {
  // A DoIT Accessibility example (2026-08-27): a clean two-way table with all
  // seven header cells tagged and not one carrying a Scope. Its author
  // believed the file was fully compliant — against WCAG they had a fair
  // argument, against PDF/UA they did not. The stock step says "mark a
  // header row", which teaches nothing to someone whose header row is
  // already marked.
  const SCOPE_FINDINGS = [
    "--- Table Structure Overview ---",
    "  Table: 4 rows × 4 cols | 7 <TH>, 9 <TD> | scope: missing on 7 header(s)",
    "All 1 table(s) have header cells (TH) — 7 header cell(s) total",
    "7 <TH> cell(s) missing Scope attribute (with no /Headers association either) — screen readers may not correctly associate headers with data",
  ];

  const step = () =>
    buildActionPlan([cat("table_markup", "Table Markup", "Minor", SCOPE_FINDINGS)], "pdf")[0]!;

  it("does not tell an author to mark a header row they already marked", () => {
    const s = step();
    expect(s.title).toMatch(/which way|direction/i);
    expect(s.why).toMatch(/already has its header cells marked/i);
  });

  it("says which value goes where — the whole question", () => {
    const joined = step()
      .routes.flatMap((r) => r.steps)
      .join(" ");
    expect(joined).toMatch(/TOP.*Column/s);
    expect(joined).toMatch(/LEFT.*Row/s);
    // And the corner cell, which is the one genuinely ambiguous cell.
    expect(joined).toMatch(/corner/i);
  });

  it("leads the Acrobat route, ahead of the generic table block", () => {
    // The per-document block opens with "how to add header cells" — useless
    // here — so the applicable instruction must come first.
    const acrobat = buildActionPlan(
      [
        cat("table_markup", "Table Markup", "Minor", [
          ...SCOPE_FINDINGS,
          "--- Adobe Acrobat: How to Fix ---",
          "To add header cells: right-click a <TD> tag → Properties → Type",
        ]),
      ],
      "pdf",
    )[0]!.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps[0]).toMatch(/header cells already exist/i);
    expect(acrobat.steps.join(" ")).toMatch(/To add header cells/); // block kept
  });

  it("states the 1.3.1 failure plainly, and where simple tables went instead", () => {
    // Post-split (v1.130/v1.136): this step only fires for two-axis or
    // spanned tables where the association genuinely cannot be determined —
    // a confirmed WCAG failure. The old "experts may disagree" hedge
    // contradicted the earned REQUIRED chip an inch above it. The copy still
    // names PDF/UA — but as the place the SIMPLE-table version of this
    // finding lives, not as a competing verdict on this one.
    const why = step().why;
    expect(why).toMatch(/WCAG 1\.3\.1 failure — not just a PDF\/UA preference/i);
    expect(why).not.toMatch(/experts may disagree/i);
    // The simple-table variant of this finding now lives in the Best
    // Practices section (2026-08-30) — "Above and beyond" carries only
    // veraPDF's verdict, and no longer collects our own unscored findings.
    expect(why).toMatch(/Best practices/);
  });

  it("keeps today's copy for a table with no headers at all", () => {
    const today = buildActionPlan([cat("table_markup", "Table Markup", "Moderate")], "pdf")[0]!;
    const noHeaders = buildActionPlan(
      [cat("table_markup", "Table Markup", "Moderate", ["2 table(s) have no header cells (TH)"])],
      "pdf",
    )[0]!;
    expect(noHeaders.title).toBe(today.title);
    expect(noHeaders.why).toBe(today.why);
  });
});

describe("title_language step titles match what actually failed (v1.138.1)", () => {
  const cat = (findings: string[]) => ({
    id: "title_language",
    label: "Document Title & Language",
    score: 50,
    severity: "Moderate",
    findings,
  });

  it("title missing, language set → the step never tells the reader to set the language", () => {
    // The SFY25 report showed "Give the document a title and set its
    // language" on a file whose language was already declared.
    const steps = buildActionPlan(
      [cat(["No document title found", "Language declared: en"])] as never,
      "pdf",
    );
    expect(steps[0]!.title).toBe("Give the document a title");
    expect(steps[0]!.title).not.toMatch(/language/i);
    expect(steps[0]!.why).toMatch(/language is already set/i);
  });

  it("language wrong, title set → the step is about the language only", () => {
    const steps = buildActionPlan(
      [
        cat([
          'Document title: "Annual Report" (shown by viewers — DisplayDocTitle is set)',
          'The document declares its language as "fr-FR" (French), but the text reads as English.',
        ]),
      ] as never,
      "pdf",
    );
    expect(steps[0]!.title).toBe("Fix the document's language declaration");
    expect(steps[0]!.why).toMatch(/title is already set/i);
  });

  it("both missing → the combined default step survives", () => {
    const steps = buildActionPlan(
      [cat(["No document title found", "No language declaration found"])] as never,
      "pdf",
    );
    expect(steps[0]!.title).toBe("Give the document a title and set its language");
  });
});

describe("heading_structure: blank headings get their own fix, not the fake-heading one (2026-08-31)", () => {
  const cats = (findings: string[]) => [
    { id: "heading_structure", label: "Heading Structure", score: 70, severity: "Minor", findings },
  ];
  const EMPTY =
    "3 Heading-styled paragraph(s) contain no text — a heading style applied to a blank line, usually to make space.";
  const FAKE =
    "4 paragraph(s) are formatted to look like headings (bold/large text) but are not real Heading styles.";

  it("tells the author to clear the blank headings — not to start using heading styles they already use", () => {
    const step = buildActionPlan(cats([EMPTY]), "docx")[0]!;
    expect(step.title).toMatch(/blank headings/i);
    expect(step.why).not.toMatch(/merely bold or large/);
    // Steps live on the route, not the step (PlanStep.routes[].steps).
    expect(step.routes.flatMap((r: { steps: string[] }) => r.steps).join(" ")).toMatch(
      /Navigation pane/,
    );
  });

  it("keeps the fake-heading advice when a document has both — that is the larger defect", () => {
    const step = buildActionPlan(cats([EMPTY, FAKE]), "docx")[0]!;
    expect(step.title).toMatch(/real heading styles/i);
  });

  it("leaves every other heading document on the default copy", () => {
    const step = buildActionPlan(cats([FAKE]), "docx")[0]!;
    expect(step.title).toMatch(/real heading styles/i);
  });
});

describe("the criterion chip links the rule it names (standing rule, 2026-08-31)", () => {
  // This chip sits on the checklist a public body works from, naming the rule
  // a deduction rests on with no way to go and read it — while the PRINTABLE
  // version of the same data has linked it all along. Source-inspected: the
  // chip is deep inside a v-for in a large template.
  const src = readFileSync(resolve(__dirname, "..", "components", "ActionPlan.vue"), "utf-8");

  it("renders the criterion as an anchor when a slug is known", () => {
    // The chip block runs from the dynamic element to its closing tag.
    const start = src.indexOf(':is="criterionHref(wcagRef.sc)');
    expect(start, "the chip is no longer a dynamic element").toBeGreaterThan(-1);
    const chip = src.slice(start, src.indexOf("</component", start));
    expect(chip).toContain('v-for="wcagRef in step.wcagRefs"');
    expect(chip).toContain(':href="criterionHref(wcagRef.sc) || undefined"');
    expect(chip).toContain("noopener noreferrer");
  });

  it("uses the same slug source as the printable plan, so the two cannot disagree", () => {
    expect(src).toContain("wcagSlugFor");
    expect(src).toContain("wcag.understandingUrl(slug)");
    // Falls back to plain text rather than a dead link.
    expect(src).toMatch(/return slug \? wcag\.understandingUrl\(slug\) : null;/);
  });
});
