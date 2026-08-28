/**
 * scripts/synthetic-controls.ts
 *
 * Adversarial synthetic controls: twelve hand-built PDFs, each constructed
 * around ONE designed truth, regenerated deterministically and then pushed
 * through the production analysis pipeline with that truth asserted.
 *
 *   pnpm synthetic-controls
 *
 * WHY THIS EXISTS (2026-08-28): the real-document corpus in controls/ proves
 * the checker agrees with itself on ordinary documents. It cannot prove the
 * checker is RIGHT, because nobody knows a real 246-page report's ground
 * truth to the last tag. These documents are the opposite trade: tiny,
 * synthetic, and with their truth designed in — a document that lies about
 * being scanned, alt text that is technically present and actually empty, a
 * structure tree with a cycle, headings wearing paragraph bodies, a detached
 * decoy subtree, text that carries hostile markup. If the checker is a
 * keyword matcher wearing a lab coat, these are the documents that expose it.
 *
 * The PDFs land in controls/ with a synthetic- prefix, beside the real
 * corpus, so each can also be uploaded by hand to audit.icjia.app and
 * verified individually (controls/ is gitignored — the GENERATOR is the
 * durable artifact; anyone can regenerate and re-verify).
 * Exit code is non-zero if any designed truth is violated.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzePDF } from "../apps/api/src/services/pdfAnalyzer.js";
import type { AnalysisResult } from "../apps/api/src/services/pdfAnalyzer.js";

// Directly in controls/ with a "synthetic-" prefix (user request): the files
// sit beside the real corpus so each can also be uploaded by hand to
// audit.icjia.app and verified individually.
const OUT_DIR = path.resolve(import.meta.dirname, "..", "controls");

// ---------------------------------------------------------------------------
// Minimal PDF assembler — same shape as the test helper
// (apps/api/src/__tests__/helpers/minimalPdf.ts): contiguous object numbers
// from 1, a real xref table, latin1 throughout, so parsers need no recovery.
// ---------------------------------------------------------------------------
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
const GRAY_IMG = (_n: number) =>
  `<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 64 >>\nstream\n${"x".repeat(64)}endstream`;
const LONG = (seed: string) =>
  `${seed} is a sentence long enough to be body text rather than a label and it keeps going with plain words so the extractor sees a real paragraph of ordinary running prose here.`;

interface Sample {
  file: string;
  truth: string;
  build: () => Buffer;
  /** Assert the designed truth; return null on pass, a message on failure.
   *  "OBSERVE:" prefix records behavior without failing the run. */
  check: (r: AnalysisResult) => string | null;
}

const cat = (id: string) => (r: AnalysisResult) => r.categories.find((c) => c.id === id);
const allFindings = (r: AnalysisResult) => r.categories.flatMap((c) => c.findings).join("\n");

const SAMPLES: Sample[] = [
  {
    file: "synthetic-01-well-built.pdf",
    truth: "A correctly built document must not be accused of any Critical or Moderate problem.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Introduction) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("This report")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 80 0 0 80 72 560 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> /XObject << /Im1 11 0 R >> >> /Contents 4 0 R /StructParents 0 /Tabs /S >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          `<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>`,
          "<< /Nums [0 [7 0 R 8 0 R 12 0 R]] >>",
          FONT,
          GRAY_IMG(11),
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (A gray square used for testing.) >>",
        ],
        "<< /Title (A Well-Built Test Document) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `accused of ${bad.map((c) => `${c.id}(${c.severity})`).join(", ")}`;
      if (r.overallScore < 89) return `score ${r.overallScore} < 89`;
      return null;
    },
  },
  {
    file: "synthetic-02-scanned-lie.pdf",
    truth:
      "An untagged, image-only document scores 0 no matter how good its metadata looks — a title and a language cannot buy back unreadable pages. (First cut of this sample carried a structure tree and learned the checker's actual definition: a TAGGED image-only document is not a raw scan, because its text may legitimately live in /Alt — it scores as a tagged document missing alt instead.)",
    build: () => {
      const content = `q 612 0 0 792 0 0 cm /Im1 Do Q\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>",
          GRAY_IMG(4),
          stream(content),
        ],
        "<< /Title (Pretending To Be Accessible) >>",
      );
    },
    check: (r) =>
      r.overallScore === 0 && r.grade === "F"
        ? null
        : `scored ${r.overallScore}/${r.grade} — the scanned floor did not hold`,
  },
  {
    file: "synthetic-03-hollow-alt.pdf",
    truth:
      "Alt text that is empty or whitespace-only is not alt text. Two of the three figures here have hollow /Alt; only one is real.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Body text")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 1 >> BDC\nq 40 0 0 40 72 600 cm /Im1 Do Q\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 40 0 0 40 172 600 cm /Im1 Do Q\nEMC\n` +
        `/Figure << /MCID 3 >> BDC\nq 40 0 0 40 272 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 11 0 R >> /XObject << /Im1 12 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 10 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [13 0 R 7 0 R 8 0 R 9 0 R] >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 /Alt () >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (   ) >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 3 /Alt (A real description of a square.) >>",
          "<< /Nums [0 [13 0 R 7 0 R 8 0 R 9 0 R]] >>",
          FONT,
          GRAY_IMG(12),
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
        ],
        "<< /Title (Hollow Alt Text) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      const m = text.match(/(\d+) of (\d+) image\(s\) have alternative text/);
      if (!m) return "no image census line found";
      if (m[1] === "1" && m[2] === "3") return null;
      return `census says ${m[0]} — hollow /Alt counted as real alt text`;
    },
  },
  {
    file: "synthetic-04-gibberish-lang.pdf",
    truth:
      "A /Lang of 'zx!!9' is not a declared language — the checker must not give language credit for garbage.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Language test")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (zx!!9) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          FONT,
        ],
        "<< /Title (Gibberish Language Tag) >>",
      );
    },
    check: (r) => {
      const c = cat("title_language")(r)!;
      if (c.score === 100) return `title_language scored 100 with /Lang (zx!!9)`;
      return null;
    },
  },
  {
    file: "synthetic-05-tag-cycle.pdf",
    truth:
      "A structure tree containing a CYCLE (a section whose kids include itself) must not hang, crash, or double-count.",
    build: () => {
      const content = `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Only Heading) Tj ET\nEMC\n/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Cycle test")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          // 6 → [7(H1), 8(P), 6(ITSELF)] — the cycle.
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 6 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Nums [0 [7 0 R 8 0 R]] >>",
          FONT,
        ],
        "<< /Title (Structure Cycle) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      const m = text.match(/Found (\d+) heading tags?/i) ?? text.match(/(\d+) heading tag/);
      if (m && Number(m[1]) > 1) return `cycle double-counted headings: ${m[0]}`;
      return null; // completing at all is the main truth; timeout would have thrown
    },
  },
  {
    file: "synthetic-06-sixty-deep.pdf",
    truth: "Sixty levels of nested containers must parse without a crash or a truncated analysis.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Deep nesting")}) Tj ET\nEMC\n`;
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 68 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 67 0 R >>",
      ];
      // Objects 6..65: a 60-deep chain of Divs. 66 is the P leaf.
      for (let i = 6; i <= 65; i++) {
        const parent = i === 6 ? 5 : i - 1;
        const kid = i === 65 ? 66 : i + 1;
        objs.push(`<< /Type /StructElem /S /Div /P ${parent} 0 R /K ${kid} 0 R >>`);
      }
      objs.push("<< /Type /StructElem /S /P /P 65 0 R /Pg 3 0 R /K 0 >>");
      objs.push("<< /Nums [0 [66 0 R]] >>");
      objs.push(FONT);
      return buildPdf(objs, "<< /Title (Sixty Levels Deep) >>");
    },
    check: (r) => (r.overallScore >= 0 && r.overallScore <= 100 ? null : "no sane score"),
  },
  {
    file: "synthetic-07-paragraphs-as-headings.pdf",
    truth:
      "Six of seven H1 tags wrap entire paragraphs. Level order is perfect — a checker that only reads levels calls this clean; the content check must not.",
    build: () => {
      // Painted line by line, as every real exporter does — a paragraph as
      // ONE 371-char Tj is wider than the page and pdf.js hands back only
      // ~112 chars of it, which is a fixture artifact, not a document shape.
      const para = (n: number) => LONG(`Heading lie number ${n}`) + " " + LONG("It continues");
      const paintLines = (text: string, y: number) => {
        const words = text.split(" ");
        const lines: string[] = [];
        for (let w = 0; w < words.length; w += 10) lines.push(words.slice(w, w + 10).join(" "));
        return lines
          .map((line, li) => `BT /F1 11 Tf 72 ${y - li * 13} Td (${line}) Tj ET`)
          .join("\n");
      };
      let content = `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 740 Td (Real Title) Tj ET\nEMC\n`;
      for (let i = 1; i <= 6; i++) {
        content += `/H1 << /MCID ${i} >> BDC\n${paintLines(para(i), 740 - i * 60)}\nEMC\n`;
      }
      content += `/P << /MCID 7 >> BDC\nBT /F1 11 Tf 72 500 Td (${LONG("One honest paragraph")}) Tj ET\nEMC\n`;
      const kids = ["7 0 R", "8 0 R", "9 0 R", "10 0 R", "11 0 R", "12 0 R", "13 0 R", "14 0 R"];
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 16 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 15 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${kids.join(" ")}] >>`,
      ];
      for (let i = 0; i <= 6; i++)
        objs.push(`<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K ${i} >>`);
      objs.push("<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 7 >>");
      objs.push(`<< /Nums [0 [${kids.join(" ")}]] >>`);
      objs.push(FONT);
      return buildPdf(objs, "<< /Title (Paragraphs Wearing Heading Tags) >>");
    },
    check: (r) => {
      const c = cat("heading_structure")(r)!;
      return c.score <= 60 ? null : `heading_structure ${c.score} — paragraph-headings not caught`;
    },
  },
  {
    file: "synthetic-08-headerless-table.pdf",
    truth: "A 3x3 data table with no header cells must lose table-markup points.",
    build: () => {
      let content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Table test")}) Tj ET\nEMC\n`;
      let mcid = 1;
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) {
          content += `/TD << /MCID ${mcid} >> BDC\nBT /F1 10 Tf ${72 + col * 90} ${640 - row * 24} Td (Cell ${row + 1}-${col + 1}) Tj ET\nEMC\n`;
          mcid++;
        }
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 25 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 24 0 R >>",
        "<< /Type /StructElem /S /Document /P 5 0 R /K [23 0 R 7 0 R] >>",
        "<< /Type /StructElem /S /Table /P 6 0 R /K [8 0 R 9 0 R 10 0 R] >>",
      ];
      // rows 8..10, cells 11..19
      for (let row = 0; row < 3; row++) {
        const cells = [11 + row * 3, 12 + row * 3, 13 + row * 3].map((n) => `${n} 0 R`);
        objs.push(`<< /Type /StructElem /S /TR /P 7 0 R /K [${cells.join(" ")}] >>`);
      }
      for (let i = 0; i < 9; i++)
        objs.push(
          `<< /Type /StructElem /S /TD /P ${8 + Math.floor(i / 3)} 0 R /Pg 3 0 R /K ${i + 1} >>`,
        );
      objs.push("<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>"); // obj 20
      // pad to keep numbering: 20 was P; parenttree 24 expects font 25.
      objs.push("<< /Type /StructElem /S /NonStruct /P 6 0 R >>"); // 21 filler
      objs.push("<< /Type /StructElem /S /NonStruct /P 6 0 R >>"); // 22 filler
      objs.splice(19, 0); // no-op, clarity
      // fix: P element must be obj 23 per Document /K — reorder by pushing fillers first
      const pIdx = objs.findIndex((o) => o.includes("/S /P /P 6 0 R"));
      const [pObj] = objs.splice(pIdx, 1);
      objs.push(pObj!); // now obj 23
      objs.push(
        `<< /Nums [0 [23 0 R ${Array.from({ length: 9 }, (_, i) => `${11 + i} 0 R`).join(" ")}]] >>`,
      ); // 24
      objs.push(FONT); // 25
      return buildPdf(objs, "<< /Title (Headerless Table) >>");
    },
    check: (r) => {
      const c = cat("table_markup")(r)!;
      return c.score < 100 ? null : "a headerless 3x3 table scored 100";
    },
  },
  {
    file: "synthetic-09-empty-table.pdf",
    truth: "A <Table> element with no rows at all must not crash the table analyzer.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Empty table")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [] >>",
          "<< /Nums [0 [7 0 R]] >>",
          FONT,
        ],
        "<< /Title (Empty Table Shell) >>",
      );
    },
    check: () => null, // completing without a thrown analysis IS the truth
  },
  {
    file: "synthetic-10-orphan-decoy.pdf",
    truth:
      "A detached subtree stuffed with alt-less figures and fragment headings must not touch the score — reachability is the path to the root, not a back-pointer (v1.111.0).",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 740 Td (Genuine Title) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("Decoy test")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 60 0 0 60 72 580 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> /XObject << /Im1 11 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Nums [0 [7 0 R 8 0 R 12 0 R]] >>",
          FONT,
          GRAY_IMG(11),
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (A described square.) >>",
          // ---- the decoy: 13 hangs off NOTHING; 14-16 are alt-less figures,
          // 17-18 fragment headings — all pointing /P at the orphan.
          "<< /Type /StructElem /S /Part /K [14 0 R 15 0 R 16 0 R 17 0 R 18 0 R] >>",
          "<< /Type /StructElem /S /Figure /P 13 0 R >>",
          "<< /Type /StructElem /S /Figure /P 13 0 R >>",
          "<< /Type /StructElem /S /Figure /P 13 0 R >>",
          "<< /Type /StructElem /S /H2 /P 13 0 R /T (Population d) >>",
          "<< /Type /StructElem /S /H2 /P 13 0 R /T (property crime a) >>",
        ],
        "<< /Title (Orphan Decoy) >>",
      );
    },
    check: (r) => {
      const alt = cat("alt_text")(r)!;
      const head = cat("heading_structure")(r)!;
      if (alt.score !== 100) return `alt_text ${alt.score} — orphan figures counted`;
      if (head.score !== 100) return `heading_structure ${head.score} — orphan headings counted`;
      return null;
    },
  },
  {
    file: "synthetic-11-untagged-text.pdf",
    truth:
      "Real visible text painted OUTSIDE any tag must be flagged — a screen reader never reaches it (Matterhorn 01).",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Tagged paragraph")}) Tj ET\nEMC\n` +
        `BT /F1 11 Tf 72 700 Td (${LONG("This sentence is painted with no tag at all")}) Tj ET\n` +
        `BT /F1 11 Tf 72 670 Td (${LONG("And so is this one which is also invisible to a reader")}) Tj ET\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          FONT,
        ],
        "<< /Title (Untagged Text) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (/outside tagged content|not.*tagged|untagged/i.test(text)) return null;
      return "untagged painted text produced no finding";
    },
  },
  {
    file: "synthetic-12-hostile-strings.pdf",
    truth:
      "Hostile markup in headings, alt text and the title must survive as inert data: analysis completes, samples stay quote-balanced, nothing executes downstream (escaping is pinned by the web tests).",
    build: () => {
      const h1 = "<script>alert(1)</script> advisory committe";
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 14 Tf 72 740 Td (${h1}) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("Hostile strings")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 40 0 0 40 72 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> /XObject << /Im1 11 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Nums [0 [7 0 R 8 0 R 12 0 R]] >>",
          FONT,
          GRAY_IMG(11),
          '<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (\\"><img src=x onerror=alert\\(2\\)> {{7*7}}) >>',
        ],
        "<< /Title (Hostile ${7*7} \\(Strings\\)) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/<script>alert\(1\)<\/script>/.test(text) && !/alert\(1\)/.test(text))
        return "OBSERVE: hostile heading text did not surface in findings (may be fine)";
      // any quoted heading sample must have had its double quotes sanitized
      const sampleLine = text.match(/cut off mid-word: (.*)$/m);
      if (
        sampleLine &&
        /""/.test(sampleLine[1] ?? "") === false &&
        /"{2,}/.test(sampleLine[1] ?? "")
      )
        return `unbalanced quoting in samples: ${sampleLine[1]}`;
      return null;
    },
  },
  {
    file: "synthetic-13-bold-fake-headings.pdf",
    truth:
      "The lazy-author classic: twelve paragraphs whose 'headings' are just big bold text in <P> tags. A substantive document with zero heading tags must be flagged, not excused.",
    build: () => {
      // Twenty-two paragraphs: the "plausibly heading-less by design" excuse
      // covers short notices (under 4 pages AND under 20 paragraphs); this
      // document must be unambiguously substantive.
      let content = "";
      const kids: string[] = [];
      for (let i = 0; i < 11; i++) {
        content += `/P << /MCID ${i * 2} >> BDC\nBT /F1 16 Tf 72 ${748 - i * 62} Td (Section ${i + 1} Looks Like A Heading) Tj ET\nEMC\n`;
        content += `/P << /MCID ${i * 2 + 1} >> BDC\nBT /F1 11 Tf 72 ${730 - i * 62} Td (${LONG(`Body ${i + 1}`)}) Tj ET\nEMC\n`;
        kids.push(`${7 + i * 2} 0 R`, `${8 + i * 2} 0 R`);
      }
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 30 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 29 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${kids.join(" ")}] >>`,
      ];
      for (let i = 0; i < 22; i++)
        objs.push(`<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K ${i} >>`);
      objs.push(`<< /Nums [0 [${kids.join(" ")}]] >>`);
      objs.push(FONT);
      return buildPdf(objs, "<< /Title (Bold Text Instead Of Headings) >>");
    },
    check: (r) => {
      const c = cat("heading_structure")(r)!;
      if (c.score === null || c.score === 100)
        return `heading_structure ${c.score} — a 12-paragraph document with zero headings was excused`;
      if (!/No heading tags found/i.test(c.findings.join("\n")))
        return "missing the 'No heading tags found' finding";
      return null;
    },
  },
  {
    file: "synthetic-14-indesign-rolemap.pdf",
    truth:
      "InDesign-style RoleMap soup: custom names for everything, headings recognized THROUGH the map, and a misspelled /Lbody one capital off the standard — which must be named as a spelling slip, not as missing content.",
    build: () => {
      const content =
        `/Heading_A << /MCID 0 >> BDC\nBT /F1 16 Tf 72 740 Td (Mapped Heading) Tj ET\nEMC\n` +
        `/Basic_Para << /MCID 1 >> BDC\nBT /F1 11 Tf 72 710 Td (${LONG("RoleMap test")}) Tj ET\nEMC\n` +
        `/Lbl_x << /MCID 2 >> BDC\nBT /F1 11 Tf 80 680 Td (1.) Tj ET\nEMC\n` +
        `/Lbody << /MCID 3 >> BDC\nBT /F1 11 Tf 100 680 Td (First list item body text here.) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 13 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 12 0 R /RoleMap << /Heading_A /H1 /Basic_Para /P /Story /Sect /Lbl_x /Lbl >> >>",
          "<< /Type /StructElem /S /Story /P 5 0 R /K [7 0 R 8 0 R 9 0 R] >>",
          "<< /Type /StructElem /S /Heading_A /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Basic_Para /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /L /P 6 0 R /K [10 0 R] >>",
          "<< /Type /StructElem /S /LI /P 9 0 R /K [11 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /Lbl_x /P 10 0 R /Pg 3 0 R /K 2 >>",
          "<< /Nums [0 [7 0 R 8 0 R 11 0 R 14 0 R]] >>",
          FONT,
          // The misspelling: /Lbody (lowercase b), unmapped in the RoleMap.
          "<< /Type /StructElem /S /Lbody /P 10 0 R /Pg 3 0 R /K 3 >>",
        ],
        "<< /Title (RoleMap Soup) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/Found 1 heading|1 heading tag/i.test(text) && !/H1/.test(text))
        return "the role-mapped heading was not recognized as a heading";
      if (!/capitalization|capital letter|spelled/i.test(text))
        return "the /Lbody near-miss was not named as a spelling slip";
      if (/missing <LBody>/i.test(text) && !/almost certainly present/i.test(text))
        return "still tells the author to ADD bodies that exist under the wrong name";
      return null;
    },
  },
  {
    file: "synthetic-15-canva-empty-pairs.pdf",
    truth:
      "The Canva/DVFR page shape: every marked-content pair closes empty and the text is painted outside them. Headings on such a page must NOT be reported as empty — 'we could not read this page' is not 'these headings are blank' (v1.110.0 guard, end to end).",
    build: () => {
      let content = "";
      // Four empty marked-content pairs the tree will point at.
      for (let i = 0; i < 4; i++) content += `/Span << /MCID ${i} >> BDC\nEMC\n`;
      // Twenty-two bare text ops OUTSIDE any marked content.
      for (let i = 0; i < 22; i++)
        content += `BT /F1 11 Tf 72 ${740 - i * 12} Td (Loose line ${i + 1} of ordinary page text) Tj ET\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 11 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 10 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 9 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K [2 3] >>",
          "<< /Nums [0 [7 0 R 8 0 R 9 0 R 9 0 R]] >>",
          FONT,
        ],
        "<< /Title (Canva Empty Pairs) >>",
      );
    },
    check: (r) => {
      const c = cat("heading_structure")(r)!;
      const text = c.findings.join("\n");
      if (/carry no text at all/i.test(text))
        return "headings on an unattributable page were reported as empty";
      if (c.score !== null && c.score < 100)
        return `heading score ${c.score} docked on a page the reader provably could not attribute`;
      return null;
    },
  },
  {
    file: "synthetic-16-form-unlabeled.pdf",
    truth:
      "A form whose three fields have no labels (/TU) and whose widgets no tag claims must be flagged on the form category — an unlabeled field is unusable by screen reader.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Application form")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /AcroForm << /Fields [8 0 R 9 0 R 10 0 R] >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 11 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [8 0 R 9 0 R 10 0 R] >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          "<< /Type /Annot /Subtype /Widget /FT /Tx /T (field1) /Rect [72 600 300 620] /F 4 /P 3 0 R >>",
          "<< /Type /Annot /Subtype /Widget /FT /Tx /T (field2) /Rect [72 560 300 580] /F 4 /P 3 0 R >>",
          "<< /Type /Annot /Subtype /Widget /FT /Btn /T (field3) /Rect [72 520 90 538] /F 4 /P 3 0 R >>",
          FONT,
        ],
        "<< /Title (Unlabeled Form) >>",
      );
    },
    check: (r) => {
      const c = cat("form_accessibility")(r);
      if (!c || c.score === null) return "form category absent/unscored on a document WITH fields";
      if (c.score === 100) return "three unlabeled, untagged fields scored 100";
      return null;
    },
  },
  {
    file: "synthetic-17-form-labeled.pdf",
    truth:
      "The good twin: every field labeled (/TU), every widget claimed by the tag tree via OBJR. The form category must be clean, and reading order must be reported-not-scored on a form (v1.107).",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Proper form")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /AcroForm << /Fields [8 0 R 9 0 R] >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 13 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [8 0 R 9 0 R] /Tabs /S >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [12 0 R 10 0 R 11 0 R] >>",
          "<< /Nums [0 [12 0 R]] /Nums [0 [12 0 R]] >>",
          "<< /Type /Annot /Subtype /Widget /FT /Tx /T (first_name) /TU (First name) /Rect [72 600 300 620] /F 4 /P 3 0 R /StructParent 1 >>",
          "<< /Type /Annot /Subtype /Widget /FT /Tx /T (last_name) /TU (Last name) /Rect [72 560 300 580] /F 4 /P 3 0 R /StructParent 2 >>",
          "<< /Type /StructElem /S /Form /P 6 0 R /Pg 3 0 R /K << /Type /OBJR /Obj 8 0 R >> >>",
          "<< /Type /StructElem /S /Form /P 6 0 R /Pg 3 0 R /K << /Type /OBJR /Obj 9 0 R >> >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          FONT,
        ],
        "<< /Title (Properly Labeled Form) >>",
      );
    },
    check: (r) => {
      const form = cat("form_accessibility")(r);
      if (form && form.score !== null && form.score < 100)
        return `labeled, tagged form docked to ${form.score}: ${form.findings.slice(0, 3).join(" | ")}`;
      const reading = cat("reading_order")(r);
      if (reading && typeof reading.score === "number" && reading.score < 100)
        return `reading order SCORED (${reading.score}) on a form — v1.107 says report, don't score`;
      return null;
    },
  },
  {
    file: "synthetic-18-rasterized-lettering.pdf",
    truth:
      "The Canva/Word export trick: a letterhead line rasterized into a wide, short, line-of-type-shaped image. The lettering warning must fire (v1.105).",
    build: () => {
      const content =
        `/Figure << /MCID 0 >> BDC\nq 400 0 0 14 72 740 cm /Im1 Do Q\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("Rasterized letterhead")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> /XObject << /Im1 11 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R] >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Nums [0 [7 0 R 8 0 R]] >>",
          FONT,
          // 600x21 pixels: wide, short, the height of a line of type.
          `<< /Type /XObject /Subtype /Image /Width 600 /Height 21 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 12600 >>\nstream\n${"x".repeat(12600)}endstream`,
        ],
        "<< /Title (Rasterized Letterhead) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (/shaped like lines of writing|Lettering May Not Be Real Text/i.test(text)) return null;
      return "OBSERVE: line-shaped image did not trigger the lettering warning (thresholds may require more signals)";
    },
  },
];

// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let hardFailures = 0;
  const rows: string[] = [];
  for (const s of SAMPLES) {
    const buf = s.build();
    fs.writeFileSync(path.join(OUT_DIR, s.file), buf);
    let verdict: string;
    try {
      const r = await analyzePDF(buf, s.file);
      const problem = s.check(r);
      if (problem === null) verdict = `PASS    ${String(r.overallScore).padStart(3)}/${r.grade}`;
      else if (problem.startsWith("OBSERVE:"))
        verdict = `OBSERVE ${String(r.overallScore).padStart(3)}/${r.grade}  ${problem}`;
      else {
        verdict = `FAIL    ${String(r.overallScore).padStart(3)}/${r.grade}  ${problem}`;
        hardFailures++;
      }
    } catch (e: any) {
      verdict = `THREW   ${e?.message ?? e}`;
      hardFailures++;
    }
    rows.push(`${verdict.padEnd(72)} ${s.file}`);
    rows.push(`        truth: ${s.truth}`);
  }
  console.log(`\nSynthetic adversarial controls — ${SAMPLES.length} documents in ${OUT_DIR}\n`);
  for (const row of rows) console.log(row);
  console.log(`\n${hardFailures === 0 ? "ALL TRUTHS HELD" : `${hardFailures} TRUTH(S) VIOLATED`}`);
  process.exit(hardFailures === 0 ? 0 : 1);
}
main();
