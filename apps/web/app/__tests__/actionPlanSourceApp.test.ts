/**
 * Two faults in one PDF report (2026-11-16): a flyer exported from PowerPoint
 * whose only failure was "the title is set, but the PDF is told to show the
 * file name".
 *
 *   1. THE STEP WAS ABOUT THE WRONG DEFECT. No variant covered "title set,
 *      not displayed", so the combined default fired: "Give the document a
 *      title and set its language" — both already set — with an "Easiest"
 *      route (set the title, re-export) that changes nothing, and the one
 *      setting that fixes it fourth of six in the fallback route.
 *
 *   2. THE STEPS WERE WORD'S. The PDF's own Creator said PowerPoint
 *      ("Acrobat PDFMaker 11 for PowerPoint"); only InDesign was recognised,
 *      so every other PDF was sent to Word's menus.
 */
import { describe, it, expect } from "vitest";
import { buildActionPlan, pdfSourceApp } from "../utils/actionPlan";
import { sourceTieInLine } from "../utils/documentMetadata";

// The analyzer's own lines for the flyer (scoring/pdf.ts), verbatim.
const NOT_DISPLAYED = [
  'Document title: "Illinois Firearm Restraining Order Study Recruitment Flyer"',
  "The title is set, but the DisplayDocTitle viewer preference is off, so viewers and screen readers announce the FILENAME instead — the same experience as no title. W3C's own PDF technique for 2.4.2 (PDF18) sets this flag.",
  "How to fix: In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Initial View tab → set Show: Document Title, then save.",
  "Language declared: EN-US",
  "--- Adobe Acrobat: How to Fix ---",
  'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Document" → "Title" and "Primary Language"',
  "Open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties)",
  "Set title: Description tab → Title field (enter a meaningful document title)",
  'Set title display: Initial View tab → Window Options → Show → "Document Title"',
  "Set language: Advanced tab → Reading Options → Language dropdown",
];
const titleCat = (findings: string[]) => ({
  id: "title_language",
  label: "Title & Language",
  score: 75,
  severity: "Minor",
  findings,
});
const cat = (id: string, severity = "Moderate", findings: string[] = []) => ({
  id,
  label: id,
  score: 50,
  severity,
  findings,
});
const PDFMAKER_PPT = "Acrobat PDFMaker 11 for PowerPoint";

describe("a title that is set but not displayed gets its own step", () => {
  const step = buildActionPlan([titleCat(NOT_DISPLAYED)] as never, "pdf", PDFMAKER_PPT)[0]!;

  it("is not told to give the document a title or set its language", () => {
    expect(step.title).toBe("Tell the PDF to show its title");
    expect(step.title).not.toMatch(/language|Give the document a title/i);
    expect(step.why).toMatch(/already has a title/);
  });

  it("leads with the one setting that fixes it, and nothing else", () => {
    expect(step.routes).toHaveLength(1);
    const route = step.routes[0]!;
    expect(route.tool).toBe("acrobat");
    expect(route.label).toBe("Change one setting in Acrobat Pro");
    expect(route.steps.join(" ")).toMatch(/Initial View tab → set Show: Document Title/);
    // Not the report's generic block: nobody here needs to type a title or
    // pick a language.
    expect(route.steps.join(" ")).not.toMatch(
      /Set title: Description|Set language|Run the checker/,
    );
  });

  it("never sends the reader to set a title in the source and re-export", () => {
    expect(step.routes.flatMap((r) => r.steps).join(" ")).not.toMatch(/set Title|In Word/);
  });

  it("an InDesign file keeps its export setting as the source route", () => {
    const s = buildActionPlan(
      [titleCat(NOT_DISPLAYED)] as never,
      "pdf",
      "Adobe InDesign 21.4 (Macintosh)",
    )[0]!;
    const source = s.routes.find((r) => r.tool === "source")!;
    expect(source.steps.join(" ")).toMatch(/Display Title/);
    expect(s.routes.some((r) => r.tool === "acrobat")).toBe(true);
  });

  it("obeys the plain-language rule", () => {
    for (const t of [step.title, step.why, ...step.routes.flatMap((r) => r.steps)]) {
      expect(t).not.toMatch(/WCAG|DisplayDocTitle|viewer preference|PDF18/);
    }
  });

  it("a title that is also missing or weak still gets the title step", () => {
    const s = buildActionPlan(
      [titleCat(["No document title found in metadata", "Language declared: en"])] as never,
      "pdf",
    )[0]!;
    expect(s.title).toBe("Give the document a title");
  });
});

describe("pdfSourceApp reads the program a PDF says it came from", () => {
  it.each([
    ["Acrobat PDFMaker 11 for PowerPoint", "powerpoint"],
    ["Microsoft® PowerPoint® for Microsoft 365", "powerpoint"],
    ["Microsoft® Excel® for Microsoft 365", "excel"],
    ["Acrobat PDFMaker 24 for Excel", "excel"],
    ["Adobe InDesign 21.4 (Macintosh)", "indesign"],
  ])("%s → %s", (creator, app) => {
    expect(pdfSourceApp(creator)).toBe(app);
  });

  it.each([
    "Microsoft® Word for Microsoft 365",
    "Canon iR-ADV",
    "Excellence Suite",
    "",
    null,
    undefined,
  ])("%s → nothing recognised (today's Word-worded steps)", (creator) => {
    expect(pdfSourceApp(creator)).toBeNull();
  });
});

describe("a PDF from PowerPoint or Excel gets that program's steps", () => {
  it("PowerPoint: PowerPoint's own steps, a re-export, and a label that names it", () => {
    const source = buildActionPlan(
      [cat("alt_text", "Critical")],
      "pdf",
      PDFMAKER_PPT,
    )[0]!.routes.find((r) => r.tool === "source")!;
    expect(source.label).toBe("Easiest — fix the PowerPoint file, then re-export");
    expect(source.steps.join(" ")).toMatch(/Right-click each picture → View Alt Text/);
    expect(source.steps.at(-1)).toMatch(/Export the PDF again/);
    expect(source.steps.join(" ")).not.toMatch(/\bWord\b/);
  });

  it("PowerPoint headings are slide titles", () => {
    const source = buildActionPlan([cat("heading_structure")], "pdf", PDFMAKER_PPT)[0]!.routes.find(
      (r) => r.tool === "source",
    )!;
    expect(source.steps.join(" ")).toMatch(/Title placeholder/);
    expect(source.steps.join(" ")).not.toMatch(/\bWord\b|Styles gallery/);
  });

  it("Excel: Excel's own steps and a label that names it", () => {
    const source = buildActionPlan(
      [cat("table_markup", "Critical")],
      "pdf",
      "Microsoft® Excel® for Microsoft 365",
    )[0]!.routes.find((r) => r.tool === "source")!;
    expect(source.label).toBe("Easiest — fix the Excel file, then re-export");
    expect(source.steps.join(" ")).toMatch(/My table has headers/);
    expect(source.steps.join(" ")).not.toMatch(/\bWord\b/);
  });

  it("where no steps exist for that program, the label says the steps are Word's", () => {
    const source = buildActionPlan([cat("bookmarks")], "pdf", PDFMAKER_PPT)[0]!.routes.find(
      (r) => r.tool === "source",
    )!;
    expect(source.label).toBe(
      "Fix the source file, then re-export — these steps are written for Word; this PDF came from PowerPoint, where the menus differ",
    );
  });

  it("the Acrobat route is untouched", () => {
    const withApp = buildActionPlan([cat("alt_text", "Critical")], "pdf", PDFMAKER_PPT)[0]!;
    const without = buildActionPlan([cat("alt_text", "Critical")], "pdf")[0]!;
    expect(withApp.routes.find((r) => r.tool === "acrobat")).toEqual(
      without.routes.find((r) => r.tool === "acrobat"),
    );
  });

  it("an uploaded PowerPoint file ignores the creator — the upload is the source", () => {
    expect(buildActionPlan([cat("alt_text", "Critical")], "pptx", PDFMAKER_PPT)).toEqual(
      buildActionPlan([cat("alt_text", "Critical")], "pptx"),
    );
  });
});

describe("the metadata card names the same program the steps do", () => {
  it("PowerPoint", () => {
    expect(sourceTieInLine({ fileType: "pdf", pdfMetadata: { creator: PDFMAKER_PPT } })).toMatch(
      /written for PowerPoint/,
    );
  });
  it("Excel", () => {
    expect(
      sourceTieInLine({
        fileType: "pdf",
        pdfMetadata: { creator: "Microsoft® Excel® for Microsoft 365" },
      }),
    ).toMatch(/written for Excel/);
  });
});
