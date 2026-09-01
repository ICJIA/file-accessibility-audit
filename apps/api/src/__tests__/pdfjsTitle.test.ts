/**
 * Tests for the filename-like-title classifier.
 *
 * History: analyzeWithPdfjs used to NULL any title matching
 * /^[a-z0-9_-]+$/ after lowercasing — which erased legitimate one-word
 * titles ("Introduction", "Budget2024") and then cascaded into a false
 * "confirmed" WCAG 2.4.2 failure claiming the document has no title in its
 * metadata. The title is now always preserved; filename-likeness is a
 * separate advisory flag.
 */
import { describe, it, expect } from "vitest";
import { isFilenameLikeTitle, analyzeWithPdfjs } from "../services/pdfjsService.js";
import { buildPdf, MINIMAL_DOC } from "./helpers/minimalPdf.js";

/** A one-page PDF whose catalog carries an XMP metadata stream, with an
 *  optional Info dictionary — the shape needed to test dc:title reading. */
function pdfWithXmpTitle(descriptionMarkup: string, infoDict?: string): Buffer {
  const xmp = [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    descriptionMarkup,
    " </rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("\n");
  const len = Buffer.byteLength(xmp, "latin1");
  return buildPdf(
    [
      "<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
      `<< /Type /Metadata /Subtype /XML /Length ${len} >>\nstream\n${xmp}\nendstream`,
    ],
    infoDict,
  );
}

describe("dc:title from XMP (2026-09-01)", () => {
  // Acrobat displays the XMP dc:title, PDF/UA requires it, and PDF 2.0
  // deprecates the Info dictionary — yet the title was read from Info.Title
  // alone, so a PDF titled only in its XMP was accused of having no title
  // (a confirmed 2.4.2 failure costing up to 21 points).
  it("reads the element-form dc:title when the Info dictionary has none", async () => {
    const buf = pdfWithXmpTitle(
      ' <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
        "  <dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">Annual Report 2024</rdf:li></rdf:Alt></dc:title>\n" +
        " </rdf:Description>",
    );
    const r = await analyzeWithPdfjs(buf);
    expect(r.error).toBeNull();
    expect(r.title).toBe("Annual Report 2024");
  });

  it("reads the attribute-form dc:title", async () => {
    const buf = pdfWithXmpTitle(
      ' <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" dc:title="Budget Overview"/>',
    );
    const r = await analyzeWithPdfjs(buf);
    expect(r.error).toBeNull();
    expect(r.title).toBe("Budget Overview");
  });

  it("the Info dictionary's /Title wins when both exist", async () => {
    const buf = pdfWithXmpTitle(
      ' <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
        "  <dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">XMP Title</rdf:li></rdf:Alt></dc:title>\n" +
        " </rdf:Description>",
      "<< /Title (Info Title) >>",
    );
    const r = await analyzeWithPdfjs(buf);
    expect(r.title).toBe("Info Title");
  });

  it("an EMPTY dc:title (self-closing rdf:li) stays null — never captures the next element's tag soup", async () => {
    // Word writes <dc:title><rdf:Alt><rdf:li xml:lang="x-default"/></rdf:Alt></dc:title>
    // for an unset title. A greedy raw-packet regex ran through it into
    // dc:creator and "recovered" XML markup as the document's title —
    // caught on three real corpus documents before it shipped.
    const buf = pdfWithXmpTitle(
      ' <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
        '  <dc:title><rdf:Alt><rdf:li xml:lang="x-default"/></rdf:Alt></dc:title>\n' +
        "  <dc:creator><rdf:Seq><rdf:li>Dyar, Mary Ann</rdf:li></rdf:Seq></dc:creator>\n" +
        " </rdf:Description>",
    );
    const r = await analyzeWithPdfjs(buf);
    expect(r.title).toBeNull();
  });

  it("stays null when neither source carries a title", async () => {
    const buf = pdfWithXmpTitle(' <rdf:Description rdf:about=""/>');
    const r = await analyzeWithPdfjs(buf);
    expect(r.title).toBeNull();
  });
});

describe("isFilenameLikeTitle", () => {
  it.each([
    "report_v3_final.pdf",
    "Annual Report 2024.docx",
    "Microsoft Word - budget final.docx",
    "untitled",
    "Untitled Document 3",
    "Document1",
    "scan_20240115",
    "IMG_0042",
    "budget-2024-final",
    "annual_report",
  ])("flags %j as filename-like", (title) => {
    expect(isFilenameLikeTitle(title)).toBe(true);
  });

  it.each([
    "Introduction",
    "Budget2024",
    "README",
    "Well-Being",
    "Annual Report 2024",
    "FY2025 Budget Overview",
    "Documentation",
    "Q3 Results — Crime Statistics",
  ])("does NOT flag %j", (title) => {
    expect(isFilenameLikeTitle(title)).toBe(false);
  });

  it("does not flag empty or whitespace-only strings", () => {
    expect(isFilenameLikeTitle("")).toBe(false);
    expect(isFilenameLikeTitle("   ")).toBe(false);
  });
});

// Calibration (review follow-up): single-token hyphen+digit strings are
// legitimate titles in government documents — never flag them.
describe("isFilenameLikeTitle calibration", () => {
  it.each(["COVID-19", "Section-508", "2024-2025"])(
    "does NOT flag %j (single hyphen + digits is a real title pattern)",
    (title) => {
      expect(isFilenameLikeTitle(title)).toBe(false);
    },
  );

  it.each(["Microsoft PowerPoint - Presentation1", "Microsoft Excel - Book1"])(
    "flags the Office auto-title %j",
    (title) => {
      expect(isFilenameLikeTitle(title)).toBe(true);
    },
  );
});

// Wiring regression: the original bug lived in analyzeWithPdfjs, which NULLED
// filename-like titles before the scorer ever saw them. Pin the integration:
// real pdfjs parsing must preserve the title and only set the advisory flag.
describe("analyzeWithPdfjs title wiring", () => {
  it("preserves a filename-like /Info title and sets the advisory flag", async () => {
    const buf = buildPdf(MINIMAL_DOC, "<< /Title (report_v3_final.pdf) >>");
    const r = await analyzeWithPdfjs(buf);
    expect(r.title).toBe("report_v3_final.pdf");
    expect(r.titleLooksLikeFilename).toBe(true);
  });

  it("preserves a one-word title without flagging it", async () => {
    const buf = buildPdf(MINIMAL_DOC, "<< /Title (Budget2024) >>");
    const r = await analyzeWithPdfjs(buf);
    expect(r.title).toBe("Budget2024");
    expect(r.titleLooksLikeFilename).toBeUndefined();
  });
});

// Real-world case from the WomenInPolicing control file: the remediation
// tool set /Title to the export filename ("Name-210525T15080148"). A
// timestamped or very long no-space token is a filename, even with only one
// hyphen — while short tokens like "COVID-19" stay unflagged.
describe("isFilenameLikeTitle — timestamped export filenames", () => {
  it.each([
    "WomenInPolicing2021-210525T15080148",
    "AnnualReport-230207T16344430",
    "CrimeStats2024Final20240115120000",
  ])("flags %j", (title) => {
    expect(isFilenameLikeTitle(title)).toBe(true);
  });

  it.each(["COVID-19", "Section-508", "2024-2025", "Budget2024"])(
    "still does NOT flag %j",
    (title) => {
      expect(isFilenameLikeTitle(title)).toBe(false);
    },
  );
});
