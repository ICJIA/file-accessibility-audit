/**
 * scripts/encoding-invariance.ts — the same document, written every legal way.
 *
 *   pnpm encoding-invariance
 *
 * WHY THIS EXISTS (2026-08-29). Five author disputes in two days, and every
 * single bug had one shape: **the same meaning, encoded a legal way we did
 * not anticipate.**
 *
 *   /Scope /Both               — a value we did not accept   (v1.126.0)
 *   /A 19 0 R                  — attributes behind a reference
 *   /Scope 65 0 R              — the VALUE behind a reference (v1.128.0)
 *
 * Each was found by a real file from a real agency, after the wrong grade had
 * already been published. Waiting for the next one is not a strategy: ISO
 * 32000 permits a large number of encodings for the same semantics, and every
 * exporter picks differently.
 *
 * So this gate stops waiting. It builds ONE document, then re-emits the SAME
 * semantic content in every legal encoding of it, and asserts the analyzer
 * returns an IDENTICAL verdict for all of them — score, grade, and the full
 * per-category vector. A divergence means the checker is reading the wrapping
 * paper rather than the document, and names exactly which encoding it cannot
 * read.
 *
 * This is the re-save invariance gate generalized: that one proves different
 * BYTES do not change a grade, this one proves different legal STRUCTURE does
 * not either. It would have caught all three bugs above before any file
 * arrived.
 *
 * Exit code is non-zero if any encoding disagrees with the baseline.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import type { AnalysisResult } from "../apps/api/src/services/pdfAnalyzer.js";

// --- the same minimal assembler the trap battery uses --------------------
function buildPdf(objs: string[], info?: string): Buffer {
  const bodies = [...objs];
  let infoRef: number | null = null;
  if (info) {
    bodies.push(info);
    infoRef = bodies.length;
  }
  let out = "%PDF-1.7\n";
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out, "latin1");
  const size = bodies.length + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  const infoEntry = infoRef ? ` /Info ${infoRef} 0 R` : "";
  out += `trailer\n<< /Size ${size} /Root 1 0 R${infoEntry} >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const stream = (s: string) => `<< /Length ${s.length} >>\nstream\n${s}endstream`;
const FONT = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
const GRAY_IMG = `<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4096 >>\nstream\n${"x".repeat(4096)}\nendstream`;
const BODY =
  "This paragraph carries enough ordinary running prose to count as real body text for the analyzer, with plain words continuing along in an unremarkable way.";

/**
 * Every variant paints the SAME page and declares the SAME semantics:
 * a heading, a paragraph, a described figure, and a 2x2 table whose header
 * row is scoped by column. Only the ENCODING of the structure differs.
 */
interface Encoding {
  name: string;
  why: string;
  build: () => Buffer;
}

/** A /Form XObject carrying marked content of its own, keyed by its
 *  /StructParents entry — the cross-stream case /MCR + /Stm exists for. */
function formXObject(content: string, structParents: number): string {
  return `<< /Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /StructParents ${structParents} /Length ${content.length} >>\nstream\n${content}endstream`;
}

/** Round-trip a built document through qpdf with the given write options.
 *  qpdf is a REQUIRED tool for this repo (CI apt-installs it; the analyzer
 *  shells out to it), so its absence here is a hard failure, not a skip. */
function qpdfTransform(src: Buffer, args: string[]): Buffer {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enc-inv-qpdf-"));
  try {
    const inFile = path.join(dir, "in.pdf");
    const outFile = path.join(dir, "out.pdf");
    fs.writeFileSync(inFile, src);
    execFileSync("qpdf", [...args, inFile, outFile]);
    return fs.readFileSync(outFile);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const CONTENT =
  `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 740 Td (Quarterly Summary) Tj ET\nEMC\n` +
  `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 710 Td (${BODY}) Tj ET\nEMC\n` +
  `/Figure << /MCID 2 >> BDC\nq 60 0 0 60 72 620 cm /Im1 Do Q\nEMC\n` +
  `/TH << /MCID 3 >> BDC\nBT /F1 10 Tf 72 580 Td (Region) Tj ET\nEMC\n` +
  `/TH << /MCID 4 >> BDC\nBT /F1 10 Tf 200 580 Td (Total) Tj ET\nEMC\n` +
  `/TD << /MCID 5 >> BDC\nBT /F1 10 Tf 72 560 Td (North) Tj ET\nEMC\n` +
  `/TD << /MCID 6 >> BDC\nBT /F1 10 Tf 200 560 Td (412) Tj ET\nEMC\n`;

const CATALOG = (extra = "") =>
  `<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> ${extra}>>`;
const PAGE =
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>";
const PAGES = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const INFO = "<< /Title (Quarterly Summary) >>";

/** Objects 1-8 are identical in every variant; the structure elements differ. */
const HEAD = (structRoot: string) => [
  CATALOG(),
  PAGES,
  PAGE,
  stream(CONTENT),
  structRoot,
  "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R 11 0 R 12 0 R] >>",
  FONT,
  GRAY_IMG,
];

const TAIL_COMMON = [
  "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>", // 9
  "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>", // 10
  "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (A gray square used for testing.) >>", // 11
];

const ENCODINGS: Encoding[] = [
  {
    name: "baseline-inline-attributes",
    why: "the plainest legal form: attribute dictionaries written inline, values as direct names",
    build: () =>
      buildPdf(
        [
          ...HEAD("<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>"),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>", // 12
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>", // 13
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>", // 14
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /A << /O /Table /Scope /Column >> >>", // 15
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /A << /O /Table /Scope /Column >> >>", // 16
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>", // 17
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 5 >>", // 18
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 6 >>", // 19
        ],
        INFO,
      ),
  },
  {
    name: "attributes-behind-a-reference",
    why: "/A points AT a shared attribute object instead of holding one — how Word writes repeated attributes",
    build: () =>
      buildPdf(
        [
          ...HEAD("<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>"),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /A 20 0 R >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /A 20 0 R >>",
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 6 >>",
          "<< /O /Table /Scope /Column >>", // 20
        ],
        INFO,
      ),
  },
  {
    name: "attribute-values-behind-references",
    why: "the VALUE is indirect too (/Scope 21 0 R -> /Column) — the v1.128.0 bug, from a real syllabus",
    build: () =>
      buildPdf(
        [
          ...HEAD("<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>"),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /A 20 0 R >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /A 20 0 R >>",
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 6 >>",
          "<< /O /Table /Scope 21 0 R >>", // 20
          "/Column", // 21
        ],
        INFO,
      ),
  },
  {
    name: "attributes-as-an-array",
    why: "/A holds an ARRAY of attribute dictionaries — legal, and what some remediation tools emit",
    build: () =>
      buildPdf(
        [
          ...HEAD("<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>"),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /A [<< /O /Layout /Placement /Block >> << /O /Table /Scope /Column >>] >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /A [<< /O /Layout /Placement /Block >> << /O /Table /Scope /Column >>] >>",
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 6 >>",
        ],
        INFO,
      ),
  },
  {
    name: "attributes-via-class-map",
    why: "attributes reached through /C + the structure tree's /ClassMap — the third legal route, which nothing has exercised until now",
    build: () =>
      buildPdf(
        [
          ...HEAD(
            "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R /ClassMap << /ColHead << /O /Table /Scope /Column >> >> >>",
          ),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /C /ColHead >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /C /ColHead >>",
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 6 >>",
        ],
        INFO,
      ),
  },
  {
    name: "role-mapped-custom-tags",
    why: "every structure type is a custom name resolved through /RoleMap — InDesign and Word style exports",
    build: () =>
      buildPdf(
        [
          ...HEAD(
            "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R /RoleMap << /HeadA /H1 /BodyText /P /Pic /Figure /Grid /Table /GridRow /TR /ColHead /TH /Cell /TD >> >>",
          ),
          "<< /Type /StructElem /S /HeadA /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /BodyText /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Pic /P 6 0 R /Pg 3 0 R /K 2 /Alt (A gray square used for testing.) >>",
          "<< /Type /StructElem /S /Grid /P 6 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /GridRow /P 12 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /GridRow /P 12 0 R /K [18 0 R 19 0 R] >>",
          "<< /Type /StructElem /S /ColHead /P 13 0 R /Pg 3 0 R /K 3 /A << /O /Table /Scope /Column >> >>",
          "<< /Type /StructElem /S /ColHead /P 13 0 R /Pg 3 0 R /K 4 /A << /O /Table /Scope /Column >> >>",
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>",
          "<< /Type /StructElem /S /Cell /P 14 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /Cell /P 14 0 R /Pg 3 0 R /K 6 >>",
        ],
        INFO,
      ),
  },
  {
    name: "single-kid-not-in-an-array",
    why: "/K holds one element directly instead of a one-item array — legal everywhere a single child exists",
    build: () =>
      buildPdf(
        [
          ...HEAD("<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>"),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>",
          // /K as a bare integer rather than [n] — the single-child shorthand.
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /A << /O /Table /Scope /Column >> >>",
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /A << /O /Table /Scope /Column >> >>",
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K [5] >>",
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K [6] >>",
        ],
        INFO,
      ),
  },
  {
    name: "qpdf-object-streams",
    why: "the baseline rewritten by qpdf with every object packed into compressed object streams — how modern exporters actually save PDFs; a parser that only reads uncompressed object tables goes blind here",
    build: () => qpdfTransform(ENCODINGS[0]!.build(), ["--object-streams=generate"]),
  },
  {
    name: "qpdf-qdf-expanded",
    why: "the baseline expanded to QDF form (uncompressed streams, normalized dictionaries, renumbered objects) — the opposite extreme of object streams; object NUMBERS change while meaning does not, so anything keyed to a literal object id diverges here",
    build: () => qpdfTransform(ENCODINGS[0]!.build(), ["--qdf"]),
  },
  {
    name: "table-row-groups",
    why: "the same table with its rows wrapped in <THead>/<TBody> row groups — ISO 32000's standard grouping elements (Table 337); a walker that only reads a Table's direct <TR> children sees zero rows here and invents a missing-row-structure failure",
    build: () =>
      buildPdf(
        [
          ...HEAD("<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>"),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [20 0 R 21 0 R] >>", // 12
          "<< /Type /StructElem /S /TR /P 20 0 R /K [15 0 R 16 0 R] >>", // 13
          "<< /Type /StructElem /S /TR /P 21 0 R /K [18 0 R 19 0 R] >>", // 14
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /A << /O /Table /Scope /Column >> >>", // 15
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /A << /O /Table /Scope /Column >> >>", // 16
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>", // 17
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 5 >>", // 18
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 6 >>", // 19
          "<< /Type /StructElem /S /THead /P 12 0 R /K [13 0 R] >>", // 20
          "<< /Type /StructElem /S /TBody /P 12 0 R /K [14 0 R] >>", // 21
        ],
        INFO,
      ),
  },
  {
    name: "attr-array-with-revisions",
    why: "attribute arrays may interleave REVISION NUMBERS after each attribute object (ISO 32000 14.7.6.2) — /A [<<…Scope…>> 0]; a reader that assumes every array element is a dictionary trips on the bare integer",
    build: () =>
      buildPdf(
        [
          ...HEAD("<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>"),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>", // 12
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>", // 13
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>", // 14
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 3 /A [<< /O /Table /Scope /Column >> 0] >>", // 15
          "<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K 4 /A [<< /O /Table /Scope /Column >> 2] >>", // 16
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>", // 17
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 5 >>", // 18
          "<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K 6 >>", // 19
        ],
        INFO,
      ),
  },
  {
    name: "role-mapped-table-cells",
    why: "the whole table vocabulary behind a RoleMap — custom /BodyRow, /HeadCell, /DataCell tags mapped to TR/TH/TD; InDesign-style exports do this for headings, and nothing stops one doing it for tables",
    build: () =>
      buildPdf(
        [
          ...HEAD(
            "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R /RoleMap << /BodyRow /TR /HeadCell /TH /DataCell /TD >> >>",
          ),
          ...TAIL_COMMON,
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>", // 12
          "<< /Type /StructElem /S /BodyRow /P 12 0 R /K [15 0 R 16 0 R] >>", // 13
          "<< /Type /StructElem /S /BodyRow /P 12 0 R /K [18 0 R 19 0 R] >>", // 14
          "<< /Type /StructElem /S /HeadCell /P 13 0 R /Pg 3 0 R /K 3 /A << /O /Table /Scope /Column >> >>", // 15
          "<< /Type /StructElem /S /HeadCell /P 13 0 R /Pg 3 0 R /K 4 /A << /O /Table /Scope /Column >> >>", // 16
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 15 0 R 16 0 R 18 0 R 19 0 R]] >>", // 17
          "<< /Type /StructElem /S /DataCell /P 14 0 R /Pg 3 0 R /K 5 >>", // 18
          "<< /Type /StructElem /S /DataCell /P 14 0 R /Pg 3 0 R /K 6 >>", // 19
        ],
        INFO,
      ),
  },
  {
    name: "table-in-form-xobject",
    why: "the table's text painted inside a Form XObject the page invokes with /Do — its marked content lives in a DIFFERENT stream, keyed by the XObject's own /StructParents, and the cells reference it through /MCR dicts carrying /Stm (ISO 32000 14.7.4.2); every real exporter that reuses content does this, and a text-attribution walk that only reads the page stream goes blind here",
    build: () => {
      const pageContent =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 740 Td (Quarterly Summary) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 710 Td (${BODY}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 60 0 0 60 72 620 cm /Im1 Do Q\nEMC\n` +
        `/Fx0 Do\n`;
      const xobjContent =
        `/TH << /MCID 0 >> BDC\nBT /F1 10 Tf 72 580 Td (Region) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 10 Tf 200 580 Td (Total) Tj ET\nEMC\n` +
        `/TD << /MCID 2 >> BDC\nBT /F1 10 Tf 72 560 Td (North) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 200 560 Td (412) Tj ET\nEMC\n`;
      const mcr = (mcid: number) => `<< /Type /MCR /Pg 3 0 R /Stm 20 0 R /MCID ${mcid} >>`;
      return buildPdf(
        [
          CATALOG(),
          PAGES,
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R /Fx0 20 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(pageContent),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R 11 0 R 12 0 R] >>",
          FONT,
          GRAY_IMG,
          ...TAIL_COMMON.slice(0, 3),
          "<< /Type /StructElem /S /Table /P 6 0 R /K [13 0 R 14 0 R] >>", // 12
          "<< /Type /StructElem /S /TR /P 12 0 R /K [15 0 R 16 0 R] >>", // 13
          "<< /Type /StructElem /S /TR /P 12 0 R /K [18 0 R 19 0 R] >>", // 14
          `<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K ${mcr(0)} /A << /O /Table /Scope /Column >> >>`, // 15
          `<< /Type /StructElem /S /TH /P 13 0 R /Pg 3 0 R /K ${mcr(1)} /A << /O /Table /Scope /Column >> >>`, // 16
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R] 1 [15 0 R 16 0 R 18 0 R 19 0 R]] >>", // 17
          `<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K ${mcr(2)} >>`, // 18
          `<< /Type /StructElem /S /TD /P 14 0 R /Pg 3 0 R /K ${mcr(3)} >>`, // 19
          formXObject(xobjContent, 1), // 20
        ],
        INFO,
      );
    },
  },
];

function verdict(r: AnalysisResult): string {
  const cats = [...r.categories]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}=${c.score === null ? "null" : c.score}|${c.severity ?? "none"}`)
    .join(" ");
  return `${r.overallScore}/${r.grade} ${cats}`;
}

async function main() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "encoding-"));
  const results: Array<{ name: string; why: string; verdict: string }> = [];

  for (const e of ENCODINGS) {
    const buf = e.build();
    fs.writeFileSync(path.join(outDir, `${e.name}.pdf`), buf);
    try {
      const r = await analyzeDocument(buf, `${e.name}.pdf`);
      results.push({ name: e.name, why: e.why, verdict: verdict(r) });
    } catch (err: any) {
      results.push({ name: e.name, why: e.why, verdict: `THREW ${err?.message ?? err}` });
    }
  }

  const baseline = results[0]!;
  const divergent = results.slice(1).filter((r) => r.verdict !== baseline.verdict);

  console.log(
    `\nEncoding invariance — one document, ${ENCODINGS.length} legal encodings of the same meaning\n`,
  );
  console.log(`baseline (${baseline.name}):\n  ${baseline.verdict}\n`);
  for (const r of results.slice(1)) {
    const same = r.verdict === baseline.verdict;
    console.log(`${same ? "SAME     " : "DIVERGED "} ${r.name}`);
    console.log(`          ${r.why}`);
    if (!same) console.log(`          got: ${r.verdict}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  if (divergent.length) {
    console.error(
      `\n${divergent.length} ENCODING(S) CHANGED THE VERDICT — the checker is reading the encoding, not the document.`,
    );
    process.exit(1);
  }
  console.log("\nEVERY LEGAL ENCODING PRODUCED THE IDENTICAL VERDICT");
}
main();
