/**
 * v1.95.0 — the Office coverage pass. DOCX: theme-color contrast resolution
 * (the PPTX approach, ported through the shared scheme map), run-level
 * language census (3.1.2 evidence), merged-cell and empty-row advisories,
 * floating-object census, forms honesty, spacing advisories. XLSX: theme
 * (with tint) and legacy indexed color resolution — including the palette
 * override — first-data-cell advisory, hidden-sheet disclosure, and the
 * form-control census. Fixtures are REAL packages via minimalDocx/minimalXlsx,
 * so the extractors run end to end.
 */
import { describe, it, expect } from "vitest";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";
import { analyzeDocx } from "../services/docxService.js";
import { analyzeXlsx } from "../services/xlsxService.js";
import { scoreDocx, scoreXlsx } from "../services/scorer.js";
import { evaluateDocxConformance } from "../services/scoring/conformance.js";
import {
  applyWordTintShade,
  applyExcelTint,
  EXCEL_INDEXED_PALETTE,
  WORD_THEME_COLOR_MAP,
} from "../services/ooxml.js";

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_THEME =
  `<?xml version="1.0"?><a:theme xmlns:a="${A}" name="Office"><a:themeElements><a:clrScheme name="Office">` +
  `<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
  `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>` +
  `<a:dk2><a:srgbClr val="44546A"/></a:dk2>` +
  `<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
  `<a:accent1><a:srgbClr val="4472C4"/></a:accent1>` +
  `<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>` +
  `<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>` +
  `<a:accent4><a:srgbClr val="FFC000"/></a:accent4>` +
  `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>` +
  `<a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
  `<a:hlink><a:srgbClr val="0563C1"/></a:hlink>` +
  `<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>` +
  `</a:clrScheme></a:themeElements></a:theme>`;

const themedRun = (themeColor: string, text: string, extraAttrs = "") =>
  `<w:p><w:r><w:rPr><w:color w:themeColor="${themeColor}"${extraAttrs}/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;

// ---------------------------------------------------------------------------
// Shared helpers (pure math) — exactness lives here; integration below
// asserts classification outcomes.
// ---------------------------------------------------------------------------
describe("ooxml theme helpers (v1.95.0)", () => {
  it("applyWordTintShade: shade multiplies toward black, tint blends toward white, invalid modifiers no-op", () => {
    expect(applyWordTintShade("4472C4", undefined, "80")).toBe("223962");
    expect(applyWordTintShade("000000", "80", undefined)).toBe("7F7F7F");
    expect(applyWordTintShade("4472C4", undefined, undefined)).toBe("4472C4");
    expect(applyWordTintShade("4472C4", "zz", "not-hex")).toBe("4472C4");
  });

  it("applyExcelTint: 0 is identity, positive lightens, negative darkens (luminance ordering)", () => {
    const lum = (hex: string) =>
      parseInt(hex.slice(0, 2), 16) + parseInt(hex.slice(2, 4), 16) + parseInt(hex.slice(4, 6), 16);
    expect(applyExcelTint("808080", 0)).toBe("808080");
    expect(lum(applyExcelTint("808080", 0.5))).toBeGreaterThan(lum("808080"));
    expect(lum(applyExcelTint("808080", -0.5))).toBeLessThan(lum("808080"));
    expect(applyExcelTint("000000", 0.8)).not.toBe("000000");
  });

  it("the indexed palette is the 66-entry ECMA default and the Word theme map covers every ST_ThemeColor name", () => {
    expect(EXCEL_INDEXED_PALETTE).toHaveLength(66);
    expect(EXCEL_INDEXED_PALETTE[0]).toBe("000000");
    expect(EXCEL_INDEXED_PALETTE[1]).toBe("FFFFFF");
    for (const name of ["dark1", "light1", "text1", "background2", "accent6", "hyperlink"]) {
      expect(WORD_THEME_COLOR_MAP[name], name).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// DOCX — theme contrast
// ---------------------------------------------------------------------------
describe("docx theme-color contrast (v1.95.0)", () => {
  it("resolves themeColor runs against word/theme/theme1.xml — a near-white theme color on the white page FAILS 1.4.3", async () => {
    const buf = await buildDocx({
      themeXml: OFFICE_THEME,
      body: themedRun("light2", "barely visible themed text") + themedRun("dark1", "solid text"),
    });
    const r = await analyzeDocx(buf);
    expect(r.contrast.checkedRuns).toBe(2);
    expect(r.contrast.failing).toHaveLength(1);
    expect(r.contrast.failing[0]!.foreground).toBe("#E7E6E6");
    // The gate asserts it as a confirmed 1.4.3 — theme colors are no longer
    // invisible to the format's headline machine check.
    const verdict = evaluateDocxConformance(r);
    expect(verdict.failures.some((f) => f.sc === "1.4.3")).toBe(true);
  });

  it("applies themeShade/themeTint and resolves theme cell fills (white text on a dark1 themeFill passes)", async () => {
    const body =
      `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single"/></w:tblBorders></w:tblPr><w:tr><w:tc>` +
      `<w:tcPr><w:shd w:val="clear" w:themeFill="dark1"/></w:tcPr>` +
      `<w:p><w:r><w:rPr><w:color w:val="FFFFFF"/></w:rPr><w:t>Header</w:t></w:r></w:p>` +
      `</w:tc></w:tr></w:tbl>` +
      themedRun("accent1", "shaded accent", ' w:themeShade="80"');
    const buf = await buildDocx({ themeXml: OFFICE_THEME, body });
    const r = await analyzeDocx(buf);
    // Both the white-on-themeFill cell and the shaded accent run resolve.
    expect(r.contrast.checkedRuns).toBe(2);
    // White on dark1 (black) is 21:1 — must not be a false failure.
    expect(r.contrast.failing.some((f) => f.foreground === "#FFFFFF")).toBe(false);
  });

  it("stays honest without a theme part: themeColor runs remain unresolved", async () => {
    const buf = await buildDocx({ body: themedRun("accent1", "themed") });
    const r = await analyzeDocx(buf);
    expect(r.contrast.checkedRuns).toBe(0);
    expect(r.contrast.unresolvedRuns).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DOCX — censuses
// ---------------------------------------------------------------------------
describe("docx v1.95.0 censuses", () => {
  it("collects distinct foreign run languages (primary subtags; same-primary variants excluded)", async () => {
    const body =
      `<w:p><w:r><w:rPr><w:lang w:val="es-ES"/></w:rPr><w:t>Hola</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:lang w:val="fr-FR"/></w:rPr><w:t>Bonjour</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:lang w:val="en-GB"/></w:rPr><w:t>Colour</w:t></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.runLanguages).toEqual(["es", "fr"]);
    // The gate's 3.1.2 entry carries the evidence, PDF-style.
    const verdict = evaluateDocxConformance(r);
    const entry = verdict.notAssessed.find((n) => n.sc === "3.1.2")!;
    expect(entry.reason).toContain("es, fr");
  });

  it("counts floating (anchored) drawings and names them in the 1.3.2 reason and the reading-order card", async () => {
    const body =
      `<w:p><w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" name="Float"/></wp:anchor></w:drawing></w:r></w:p>` +
      `<w:p><w:r><w:t>body text</w:t></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.floatingObjectCount).toBe(1);
    const verdict = evaluateDocxConformance(r);
    expect(verdict.notAssessed.find((n) => n.sc === "1.3.2")!.reason).toContain(
      "1 floating (anchored) object",
    );
    const reading = scoreDocx(r).categories.find((c) => c.id === "reading_order")!;
    expect(reading.findings.join("\n")).toContain("1 floating (anchored) object");
  });

  it("detects INTERACTIVE content controls and legacy form fields, and the forms card becomes evidence-based", async () => {
    const body =
      `<w:sdt><w:sdtPr><w:text/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>control</w:t></w:r></w:p></w:sdtContent></w:sdt>` +
      `<w:p><w:r><w:instrText> FORMTEXT </w:instrText></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.contentControlCount).toBe(1);
    expect(r.legacyFieldCount).toBe(1);
    const forms = scoreDocx(r).categories.find((c) => c.id === "form_accessibility")!;
    expect(forms.score).toBeNull(); // still not scored — but no longer "uncommon"
    expect(forms.findings.join("\n")).toContain("1 content control(s) and 1 legacy form field(s)");
  });

  it("flags spacing habits: runs of 3+ empty paragraphs and entirely empty table rows (advisory only)", async () => {
    const body =
      `<w:p><w:r><w:t>real</w:t></w:r></w:p><w:p/><w:p/><w:p/>` +
      `<w:tbl><w:tblPr><w:tblStyle w:val="T"/></w:tblPr>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>H</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>I</w:t></w:r></w:p></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p><w:r><w:t>d</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>e</w:t></w:r></w:p></w:tc></w:tr>` +
      `</w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.emptyParagraphRunCount).toBe(1);
    expect(r.emptyTableRowCount).toBe(1);
    const result = scoreDocx(r);
    const text = result.categories.find((c) => c.id === "text_extractability")!;
    expect(text.score).toBe(100); // advisory, never scored
    expect(text.findings.join("\n")).toContain("three or more consecutive empty paragraphs");
    const tables = result.categories.find((c) => c.id === "table_markup")!;
    expect(tables.findings.join("\n")).toContain("1 entirely empty table row(s)");
  });

  it("counts merged cells (gridSpan + vMerge) as a table advisory that never scores", async () => {
    const body =
      `<w:tbl><w:tblPr><w:tblStyle w:val="T"/></w:tblPr>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Merged head</w:t></w:r></w:p></w:tc></w:tr>` +
      `<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr>` +
      `<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p><w:r><w:t>c</w:t></w:r></w:p></w:tc></w:tr>` +
      `</w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.tables[0]!.mergedCellCount).toBe(3);
    const tables = scoreDocx(r).categories.find((c) => c.id === "table_markup")!;
    expect(tables.findings.join("\n")).toContain("3 merged cell(s)");
  });
});

// ---------------------------------------------------------------------------
// XLSX — theme / indexed color resolution + censuses
// ---------------------------------------------------------------------------
describe("xlsx theme and indexed color resolution (v1.95.0)", () => {
  it("pins the theme-INDEX polarity: theme=0 is the LIGHT slot — white-on-white fails, never black-on-white", async () => {
    const buf = await buildXlsx({
      themeXml: OFFICE_THEME,
      sheets: [
        {
          name: "Data",
          cells: [{ ref: "A1", value: "42", styleIndex: 1 }],
        },
      ],
      styles: [{ fontThemeIdx: 0, fillRgb: "FFFFFFFF" }],
    });
    const r = await analyzeXlsx(buf);
    expect(r.contrast.checkedRuns).toBe(1);
    expect(r.contrast.failing).toHaveLength(1);
    expect(r.contrast.failing[0]!.foreground).toBe("#FFFFFF");
  });

  it("resolves theme + tint (a heavily lightened dark1 on white fails, with a lightened foreground)", async () => {
    const buf = await buildXlsx({
      themeXml: OFFICE_THEME,
      sheets: [{ name: "Data", cells: [{ ref: "A1", value: "1", styleIndex: 1 }] }],
      styles: [{ fontThemeIdx: 1, fontTint: 0.85, fillRgb: "FFFFFFFF" }],
    });
    const r = await analyzeXlsx(buf);
    expect(r.contrast.checkedRuns).toBe(1);
    expect(r.contrast.failing).toHaveLength(1);
    expect(r.contrast.failing[0]!.foreground).not.toBe("#000000");
  });

  it("resolves legacy indexed colors from the spec default palette (black-on-white passes)", async () => {
    const buf = await buildXlsx({
      sheets: [{ name: "Data", cells: [{ ref: "A1", value: "1", styleIndex: 1 }] }],
      styles: [{ fontIndexed: 0, fillIndexed: 1 }],
    });
    const r = await analyzeXlsx(buf);
    expect(r.contrast.checkedRuns).toBe(1);
    expect(r.contrast.failing).toHaveLength(0);
  });

  it("honors a workbook's indexedColors palette override", async () => {
    const stylesXml =
      `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts><font><sz val="11"/></font><font><sz val="11"/><color indexed="2"/></font></fonts>` +
      `<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill></fills>` +
      `<cellXfs><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2"/></cellXfs>` +
      // Index 2 is FF0000 in the default palette; overridden to near-white.
      `<colors><indexedColors><rgbColor rgb="FF111111"/><rgbColor rgb="FF222222"/><rgbColor rgb="FFFEFEFE"/></indexedColors></colors>` +
      `</styleSheet>`;
    const buf = await buildXlsx({
      stylesXml,
      sheets: [{ name: "Data", cells: [{ ref: "A1", value: "1", styleIndex: 1 }] }],
    });
    const r = await analyzeXlsx(buf);
    expect(r.contrast.checkedRuns).toBe(1);
    expect(r.contrast.failing).toHaveLength(1);
    expect(r.contrast.failing[0]!.foreground).toBe("#FEFEFE");
  });
});

// ---------------------------------------------------------------------------
// Independent-review regression pins (the v1.95.0 red/blue findings) — each
// replays the false-positive or false-negative the review found.
// ---------------------------------------------------------------------------
describe("v1.95.0 review findings", () => {
  it("CR-1: a TOC/building-block w:sdt (docPartObj) is NOT a content control; nested wrappers don't inflate", async () => {
    const body =
      `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr>` +
      `<w:sdtContent><w:p><w:r><w:t>Contents</w:t></w:r></w:p></w:sdtContent></w:sdt>` +
      `<w:sdt><w:sdtPr><w:citation/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>(Smith 2026)</w:t></w:r></w:p></w:sdtContent></w:sdt>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.contentControlCount).toBe(0);
    const forms = scoreDocx(r).categories.find((c) => c.id === "form_accessibility")!;
    expect(forms.findings.join("\n")).toContain("No form controls were detected");
  });

  it("CR-2: empty paragraphs inside table cells never chain into a body 'spacing run'", async () => {
    // A 3-cell all-empty row: one empty-row note, NO paragraph-run advisory.
    const body =
      `<w:p><w:r><w:t>real</w:t></w:r></w:p>` +
      `<w:tbl><w:tblPr><w:tblStyle w:val="T"/></w:tblPr>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>H</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>I</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>J</w:t></w:r></w:p></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>` +
      `</w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.emptyParagraphRunCount).toBe(0);
    expect(r.emptyTableRowCount).toBe(1);
  });

  it("CR-3: with no document language, routine run-level w:lang stamps are NOT reported as foreign passages", async () => {
    const body = `<w:p><w:r><w:rPr><w:lang w:val="en-US"/></w:rPr><w:t>text</w:t></w:r></w:p>`;
    // Styles part with no docDefaults w:lang — the generator-file shape.
    const stylesXml =
      `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const buf = await buildDocx({ body, stylesXml });
    const r = await analyzeDocx(buf);
    expect(r.runLanguages).toEqual([]);
  });

  it("CR-4: a FORMTEXT token split across instrText runs is still one detected field", async () => {
    const body = `<w:p><w:r><w:instrText> FORM</w:instrText></w:r><w:r><w:instrText>TEXT </w:instrText></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.legacyFieldCount).toBe(1);
  });

  it("CR-8: a table row whose only content is an image is NOT an empty spacing row", async () => {
    const body =
      `<w:tbl><w:tblPr><w:tblStyle w:val="T"/></w:tblPr>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>H</w:t></w:r></w:p></w:tc></w:tr>` +
      `<w:tr><w:tc><w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="9" name="Logo" descr="Agency logo"/></wp:inline></w:drawing></w:r></w:p></w:tc></w:tr>` +
      `</w:tbl>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.emptyTableRowCount).toBe(0);
  });

  it("CR-9: a malformed empty theme attribute stays unresolved — never resolves to slot 0 (white)", async () => {
    const stylesXml =
      `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts><font><sz val="11"/></font><font><sz val="11"/><color theme=""/></font></fonts>` +
      `<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill></fills>` +
      `<cellXfs><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2"/></cellXfs></styleSheet>`;
    const buf = await buildXlsx({
      themeXml: OFFICE_THEME,
      stylesXml,
      sheets: [{ name: "Data", cells: [{ ref: "A1", value: "1", styleIndex: 1 }] }],
    });
    const r = await analyzeXlsx(buf);
    expect(r.contrast.checkedRuns).toBe(0);
    expect(r.contrast.unresolvedRuns).toBe(1);
    expect(r.contrast.failing).toHaveLength(0); // no fabricated white-on-white
  });

  it("CR-10: a present-but-unreadable indexedColors override entry is unresolved — never swapped for the overridden default", async () => {
    const stylesXml =
      `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts><font><sz val="11"/></font><font><sz val="11"/><color indexed="2"/></font></fonts>` +
      `<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill></fills>` +
      `<cellXfs><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2"/></cellXfs>` +
      // Entry 2 exists but is junk — must NOT fall back to default-palette red.
      `<colors><indexedColors><rgbColor rgb="FF111111"/><rgbColor rgb="FF222222"/><rgbColor rgb="zz!bad"/></indexedColors></colors>` +
      `</styleSheet>`;
    const buf = await buildXlsx({
      stylesXml,
      sheets: [{ name: "Data", cells: [{ ref: "A1", value: "1", styleIndex: 1 }] }],
    });
    const r = await analyzeXlsx(buf);
    expect(r.contrast.checkedRuns).toBe(0);
    expect(r.contrast.unresolvedRuns).toBe(1);
  });
});

describe("v1.95.0 adversarial hardening", () => {
  it("rejects forged w:lang values — garbage never reaches runLanguages or the 3.1.2 reason", async () => {
    const junk = "x".repeat(4096);
    const body =
      `<w:p><w:r><w:rPr><w:lang w:val="${junk}"/></w:rPr><w:t>a</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:lang w:val="123-456"/></w:rPr><w:t>b</w:t></w:r></w:p>` +
      `<w:p><w:r><w:rPr><w:lang w:val="de-DE"/></w:rPr><w:t>c</w:t></w:r></w:p>`;
    const buf = await buildDocx({ body });
    const r = await analyzeDocx(buf);
    expect(r.runLanguages).toEqual(["de"]);
  });

  it("caps a forged indexedColors override and leaves past-cap indices unresolved, never mis-colored", async () => {
    const flood = Array.from({ length: 1000 }, () => `<rgbColor rgb="FF123456"/>`).join("");
    const stylesXml =
      `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts><font><sz val="11"/></font><font><sz val="11"/><color indexed="500"/></font></fonts>` +
      `<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill></fills>` +
      `<cellXfs><xf fontId="0" fillId="0"/><xf fontId="1" fillId="2"/></cellXfs>` +
      `<colors><indexedColors>${flood}</indexedColors></colors></styleSheet>`;
    const buf = await buildXlsx({
      stylesXml,
      sheets: [{ name: "Data", cells: [{ ref: "A1", value: "1", styleIndex: 1 }] }],
    });
    const r = await analyzeXlsx(buf);
    // indexed="500" is past both the cap and the spec palette — unresolved.
    expect(r.contrast.checkedRuns).toBe(0);
    expect(r.contrast.unresolvedRuns).toBe(1);
  });

  it("treats out-of-range theme indices and junk tints as unresolved, not defaulted", async () => {
    const buf = await buildXlsx({
      themeXml: OFFICE_THEME,
      sheets: [
        {
          name: "Data",
          cells: [
            { ref: "A1", value: "1", styleIndex: 1 },
            { ref: "A2", value: "2", styleIndex: 2 },
          ],
        },
      ],
      styles: [
        { fontThemeIdx: 99, fillRgb: "FFFFFFFF" }, // no such slot -> unresolved
        { fontThemeIdx: 1, fontTint: Number.NaN, fillRgb: "FFFFFFFF" }, // junk tint -> tint 0
      ],
    });
    const r = await analyzeXlsx(buf);
    expect(r.contrast.unresolvedRuns).toBe(1);
    expect(r.contrast.checkedRuns).toBe(1); // black on white, tint ignored
    expect(r.contrast.failing).toHaveLength(0);
  });
});

describe("xlsx v1.95.0 censuses", () => {
  it("records the first data cell and advises when data starts far from A1", async () => {
    const cells = Array.from({ length: 14 }, (_, i) => ({
      ref: `F${10 + i}`,
      value: String(i),
    }));
    const buf = await buildXlsx({ sheets: [{ name: "Far Start", cells }] });
    const r = await analyzeXlsx(buf);
    expect(r.sheets[0]!.firstDataRow).toBe(10);
    expect(r.sheets[0]!.firstDataCol).toBe(6);
    const tables = scoreXlsx(r).categories.find((c) => c.id === "table_markup")!;
    expect(tables.findings.join("\n")).toContain('"Far Start" data begins at row 10, column 6');
  });

  it("discloses hidden sheets as excluded (sheet-names card)", async () => {
    const buf = await buildXlsx({
      sheets: [
        { name: "Budget Overview", cells: [{ ref: "A1", value: "1" }] },
        { name: "Lookup", hidden: true, cells: [{ ref: "A1", value: "2" }] },
      ],
    });
    const r = await analyzeXlsx(buf);
    const names = scoreXlsx(r).categories.find((c) => c.id === "sheet_names")!;
    expect(names.findings.join("\n")).toContain("1 hidden sheet(s) were excluded");
  });

  it("detects legacy form/OLE controls and the forms card becomes evidence-based", async () => {
    const buf = await buildXlsx({
      sheets: [
        {
          name: "Form",
          cells: [{ ref: "A1", value: "1" }],
          rawSheetExtra:
            `<controls><control shapeId="1" name="CheckBox1"/></controls>` +
            `<oleObjects><oleObject progId="Forms.CommandButton.1" shapeId="2"/></oleObjects>`,
        },
      ],
    });
    const r = await analyzeXlsx(buf);
    expect(r.formControlCount).toBe(2);
    const forms = scoreXlsx(r).categories.find((c) => c.id === "form_accessibility")!;
    expect(forms.score).toBeNull();
    expect(forms.findings.join("\n")).toContain("2 legacy form/OLE control(s)");
  });
});
