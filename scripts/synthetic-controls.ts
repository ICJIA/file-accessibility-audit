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

/** A one-page document whose single tagged link carries the given text. */
function linkDoc(linkText: string): Buffer {
  const content =
    `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Link doc")}) Tj ET\nEMC\n` +
    `/Link << /MCID 1 >> BDC\nBT /F1 11 Tf 72 680 Td (${linkText}) Tj ET\nEMC\n`;
  return buildPdf(
    [
      "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [9 0 R] >>",
      stream(content),
      "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
      "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 11 0 R] >>",
      "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
      "<< /Nums [0 [7 0 R 11 0 R]] >>",
      "<< /Type /Annot /Subtype /Link /Rect [72 675 260 692] /A << /S /URI /URI (https://example.com/page) >> /F 4 /StructParent 1 >>",
      FONT,
      "<< /Type /StructElem /S /Link /P 6 0 R /Pg 3 0 R /K [1 << /Type /OBJR /Obj 9 0 R >>] >>",
    ],
    "<< /Title (Link Text Sample) >>",
  );
}

/** A minimal N-page document: one tagged <P> of real text per page. Returns
 *  the object array and the index bases so callers can extend it. */
function multiPageObjs(pageCount: number): { objs: string[]; catalogExtra: string } {
  // Layout: 1 catalog, 2 pages-node, then per page: page + content stream,
  // then structroot, document elem, per-page P elems, parenttree, font.
  const pageObj = (i: number) => 3 + i * 2;
  const contentObj = (i: number) => 4 + i * 2;
  const structRoot = 3 + pageCount * 2;
  const docElem = structRoot + 1;
  const pElem = (i: number) => docElem + 1 + i;
  const parentTree = docElem + 1 + pageCount;
  const font = parentTree + 1;
  const objs: string[] = [];
  objs.push("{{CATALOG}}");
  objs.push(
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );
  for (let i = 0; i < pageCount; i++) {
    const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG(`Page ${i + 1}`)}) Tj ET\nEMC\n`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentObj(i)} 0 R /StructParents ${i} >>`,
    );
    objs.push(stream(content));
  }
  objs.push(`<< /Type /StructTreeRoot /K ${docElem} 0 R /ParentTree ${parentTree} 0 R >>`);
  objs.push(
    `<< /Type /StructElem /S /Document /P ${structRoot} 0 R /K [${Array.from({ length: pageCount }, (_, i) => `${pElem(i)} 0 R`).join(" ")}] >>`,
  );
  for (let i = 0; i < pageCount; i++)
    objs.push(`<< /Type /StructElem /S /P /P ${docElem} 0 R /Pg ${pageObj(i)} 0 R /K 0 >>`);
  objs.push(
    `<< /Nums [${Array.from({ length: pageCount }, (_, i) => `${i} [${pElem(i)} 0 R]`).join(" ")}] >>`,
  );
  objs.push(FONT);
  return {
    objs,
    catalogExtra: `/Pages 2 0 R /StructTreeRoot ${structRoot} 0 R /MarkInfo << /Marked true >> /Lang (en-US)`,
  };
}

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
  // -------------------------------------------------------------------------
  // Batch two (39 samples total): coverage of everything a non-accessible
  // document plausibly does — heading pathologies, table pathologies, link
  // pathologies, the Matterhorn advisories, RoleMap abuse, document
  // behaviors — plus the GOOD twins the checker must never flag.
  // -------------------------------------------------------------------------
  {
    file: "synthetic-19-skipped-heading-levels.pdf",
    truth:
      "H1 -> H3 -> H5 with nothing between: level skips break the outline (Matterhorn 13-004).",
    build: () => {
      const lv = [1, 3, 5, 1, 3, 5];
      let content = "";
      lv.forEach((l, i) => {
        content += `/H${l} << /MCID ${i} >> BDC\nBT /F1 ${18 - l} Tf 72 ${740 - i * 40} Td (Section heading number ${i + 1}) Tj ET\nEMC\n`;
      });
      content += `/P << /MCID 6 >> BDC\nBT /F1 11 Tf 72 480 Td (${LONG("Level skips")}) Tj ET\nEMC\n`;
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 15 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 14 0 R >>",
        "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 13 0 R] >>",
      ];
      lv.forEach((l, i) =>
        objs.push(`<< /Type /StructElem /S /H${l} /P 6 0 R /Pg 3 0 R /K ${i} >>`),
      );
      objs.push("<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 6 >>");
      objs.push("<< /Nums [0 [7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 13 0 R]] >>");
      objs.push(FONT);
      return buildPdf(objs, "<< /Title (Skipped Heading Levels) >>");
    },
    check: (r) => {
      const c = cat("heading_structure")(r)!;
      if (c.score === 100) return "level skips scored 100";
      if (!/skip/i.test(c.findings.join("\n"))) return "no skip finding";
      return null;
    },
  },
  {
    file: "synthetic-20-generic-h-only.pdf",
    truth: "Only generic <H> tags, no levels at all — an outline with no hierarchy to navigate.",
    build: () => {
      let content = "";
      for (let i = 0; i < 3; i++)
        content += `/H << /MCID ${i} >> BDC\nBT /F1 15 Tf 72 ${740 - i * 60} Td (Generic heading ${i + 1}) Tj ET\nEMC\n`;
      content += `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 540 Td (${LONG("Generic H")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 12 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 11 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 9 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /H /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /H /P 6 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
          "<< /Nums [0 [7 0 R 8 0 R 9 0 R 10 0 R]] >>",
          FONT,
        ],
        "<< /Title (Generic H Only) >>",
      );
    },
    check: (r) => {
      const c = cat("heading_structure")(r)!;
      return c.score !== null && c.score < 100 ? null : `generic-only <H> scored ${c.score}`;
    },
  },
  {
    file: "synthetic-21-mixed-h-conventions.pdf",
    truth:
      "Numbered H1/H2 mixed with generic <H> — PDF/UA forbids mixing the two conventions (Matterhorn 14-002).",
    build: () => {
      let content = "";
      ["H1", "H", "H2"].forEach((_, i) => {
        content += `/T${i} << /MCID ${i} >> BDC\nBT /F1 15 Tf 72 ${740 - i * 60} Td (Mixed heading ${i + 1}) Tj ET\nEMC\n`;
      });
      content += `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 540 Td (${LONG("Mixed conventions")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 12 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 11 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 9 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /H /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
          "<< /Nums [0 [7 0 R 8 0 R 9 0 R 10 0 R]] >>",
          FONT,
        ],
        "<< /Title (Mixed Heading Conventions) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      return /generic <H>|mixing|14-002|convention/i.test(text)
        ? null
        : "mixed conventions not flagged";
    },
  },
  {
    file: "synthetic-22-filename-title.pdf",
    truth:
      "A title of 'report_v3_final.pdf' is a filename, not a title — flagged as such, not accepted quietly.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Filename title")}) Tj ET\nEMC\n`;
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
        "<< /Title (report_v3_final.pdf) >>",
      );
    },
    check: (r) => (/filename/i.test(allFindings(r)) ? null : "filename-shaped title not flagged"),
  },
  {
    file: "synthetic-23-title-display-off.pdf",
    truth:
      "A good title the viewer is told NOT to display — DisplayDocTitle unset means readers hear the filename anyway.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Display off")}) Tj ET\nEMC\n`;
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
        "<< /Title (A Perfectly Good Title) >>",
      );
    },
    check: (r) =>
      /DisplayDocTitle|title display|document title/i.test(allFindings(r))
        ? null
        : "OBSERVE: DisplayDocTitle-unset not mentioned",
  },
  {
    file: "synthetic-24-th-without-scope.pdf",
    truth:
      "Header cells present but no /Scope and no /Headers — the exact defect from the v1.108 dispute; flagged with direction-by-position advice.",
    build: () => {
      let content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Scope test")}) Tj ET\nEMC\n`;
      let mcid = 1;
      for (let row = 0; row < 2; row++)
        for (let col = 0; col < 2; col++) {
          const tag = row === 0 ? "TH" : "TD";
          content += `/${tag} << /MCID ${mcid} >> BDC\nBT /F1 10 Tf ${72 + col * 120} ${660 - row * 24} Td (${tag} ${row}-${col}) Tj ET\nEMC\n`;
          mcid++;
        }
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 16 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 15 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [14 0 R 7 0 R] >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [8 0 R 9 0 R] >>",
          "<< /Type /StructElem /S /TR /P 7 0 R /K [10 0 R 11 0 R] >>",
          "<< /Type /StructElem /S /TR /P 7 0 R /K [12 0 R 13 0 R] >>",
          "<< /Type /StructElem /S /TH /P 8 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /TH /P 8 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /TD /P 9 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /TD /P 9 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [14 0 R 10 0 R 11 0 R 12 0 R 13 0 R]] >>",
          FONT,
        ],
        "<< /Title (Headers Without Direction) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/Scope/i.test(text)) return "missing-Scope not flagged";
      if (!/top|Column.*Row|position/i.test(text)) return "no direction-by-position advice";
      return null;
    },
  },
  {
    file: "synthetic-25-fake-bullet-list.pdf",
    truth:
      "Bullets typed as plain text with no list structure — a lazy-author move automation may not see; recorded honestly either way.",
    build: () => {
      let content = "";
      const lines = [
        "- First fake bullet item here",
        "- Second fake bullet item here",
        "- Third fake bullet item here",
      ];
      lines.forEach((l, i) => {
        content += `/P << /MCID ${i} >> BDC\nBT /F1 11 Tf 72 ${720 - i * 20} Td (${l}) Tj ET\nEMC\n`;
      });
      content += `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 640 Td (${LONG("Fake bullets")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 12 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 11 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 9 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
          "<< /Nums [0 [7 0 R 8 0 R 9 0 R 10 0 R]] >>",
          FONT,
        ],
        "<< /Title (Fake Bullet List) >>",
      );
    },
    check: (r) =>
      /list/i.test(allFindings(r))
        ? null
        : "OBSERVE: dash-bullets in plain paragraphs pass silently — a documented automation limit (no tag structure to inspect)",
  },
  {
    file: "synthetic-26-nested-table.pdf",
    truth:
      "A table inside a table cell — extremely difficult for screen readers; must be flagged, and the inner one must not double the table count.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Nested table")}) Tj ET\nEMC\n` +
        `/TD << /MCID 1 >> BDC\nBT /F1 10 Tf 80 660 Td (Outer cell) Tj ET\nEMC\n` +
        `/TD << /MCID 2 >> BDC\nBT /F1 10 Tf 200 660 Td (Inner cell) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 13 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 12 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [14 0 R 7 0 R] >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [8 0 R] >>",
          "<< /Type /StructElem /S /TR /P 7 0 R /K [9 0 R] >>",
          "<< /Type /StructElem /S /TD /P 8 0 R /Pg 3 0 R /K [1 10 0 R] >>",
          "<< /Type /StructElem /S /Table /P 9 0 R /K [11 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [15 0 R] >>",
          "<< /Nums [0 [14 0 R 9 0 R 15 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /TD /P 11 0 R /Pg 3 0 R /K 2 >>",
        ],
        "<< /Title (Nested Table) >>",
      );
    },
    check: (r) => (/nested/i.test(allFindings(r)) ? null : "nested table not flagged"),
  },
  {
    file: "synthetic-27-ragged-table.pdf",
    truth:
      "Rows covering different numbers of columns (2 then 5) with no spans declared — the grid does not line up for a reader.",
    build: () => {
      let content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Ragged table")}) Tj ET\nEMC\n`;
      for (let i = 1; i <= 7; i++)
        content += `/TD << /MCID ${i} >> BDC\nBT /F1 10 Tf ${72 + ((i - 1) % 5) * 90} ${660 - Math.floor((i - 1) / 5) * 24} Td (Cell ${i}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 18 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 17 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [16 0 R 7 0 R] >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [8 0 R 9 0 R] >>",
          "<< /Type /StructElem /S /TR /P 7 0 R /K [10 0 R 11 0 R] >>",
          "<< /Type /StructElem /S /TR /P 7 0 R /K [12 0 R 13 0 R 14 0 R 15 0 R 19 0 R] >>",
          "<< /Type /StructElem /S /TD /P 8 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /TD /P 8 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /TD /P 9 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /TD /P 9 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /TD /P 9 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 9 0 R /Pg 3 0 R /K 6 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [16 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 15 0 R 19 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /TD /P 9 0 R /Pg 3 0 R /K 7 >>",
        ],
        "<< /Title (Ragged Table) >>",
      );
    },
    check: (r) => (/inconsistent/i.test(allFindings(r)) ? null : "ragged columns not flagged"),
  },
  {
    file: "synthetic-28-link-bare-url.pdf",
    truth:
      "Link text that is just the raw web address — a screen reader spells the whole thing out.",
    build: () => linkDoc("https://example.com/very/long/path/document.pdf"),
    check: (r) => {
      const text = allFindings(r);
      return /URL|address|link text/i.test(text) || cat("link_quality")(r)!.score !== 100
        ? null
        : "OBSERVE: bare-URL link text not scored down";
    },
  },
  {
    file: "synthetic-29-link-click-here.pdf",
    truth: "'click here' tells a reader jumping link-to-link nothing about the destination.",
    build: () => linkDoc("click here"),
    check: (r) =>
      cat("link_quality")(r)!.score !== 100 ||
      /click here|generic|descriptive/i.test(allFindings(r))
        ? null
        : "OBSERVE: 'click here' passed link quality silently",
  },
  {
    file: "synthetic-30-untagged-link.pdf",
    truth:
      "A clickable link no tag claims — invisible to the structure a screen reader navigates (Matterhorn 28).",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Untagged link")}) Tj ET\nEMC\nBT /F1 11 Tf 72 680 Td (Visit our site today) Tj ET\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [8 0 R] >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          "<< /Type /Annot /Subtype /Link /Rect [72 675 220 692] /A << /S /URI /URI (https://example.com) >> /F 4 >>",
          FONT,
        ],
        "<< /Title (Untagged Link) >>",
      );
    },
    check: (r) =>
      /untagged|no structure element|not.*tag/i.test(allFindings(r))
        ? null
        : "untagged link annotation not flagged",
  },
  {
    file: "synthetic-31-empty-headings.pdf",
    truth:
      "Eight heading tags, six holding no text at all — a reader jumping by heading lands on silence (the v1.110 check, on a page attribution CAN read).",
    build: () => {
      let content = "";
      content += `/H1 << /MCID 0 >> BDC\nBT /F1 16 Tf 72 750 Td (Real Heading One) Tj ET\nEMC\n`;
      content += `/H2 << /MCID 1 >> BDC\nBT /F1 13 Tf 72 720 Td (Real Heading Two) Tj ET\nEMC\n`;
      for (let i = 2; i < 8; i++) content += `/H2 << /MCID ${i} >> BDC\nEMC\n`;
      content += `/P << /MCID 8 >> BDC\nBT /F1 11 Tf 72 690 Td (Short body line) Tj ET\nEMC\n`;
      const kids = Array.from({ length: 9 }, (_, i) => `${7 + i} 0 R`);
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 17 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 16 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${kids.join(" ")}] >>`,
        "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
        "<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K 1 >>",
      ];
      for (let i = 2; i < 8; i++)
        objs.push(`<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K ${i} >>`);
      objs.push("<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 8 >>");
      objs.push(`<< /Nums [0 [${kids.join(" ")}]] >>`);
      objs.push(FONT);
      return buildPdf(objs, "<< /Title (Empty Headings) >>");
    },
    check: (r) => {
      const c = cat("heading_structure")(r)!;
      if (!/carry no text at all/i.test(c.findings.join("\n"))) return "empty headings not named";
      return c.score !== null && c.score <= 60 ? null : `empty-heading outline scored ${c.score}`;
    },
  },
  {
    file: "synthetic-32-note-without-id.pdf",
    truth:
      "A footnote tagged <Note> with no /ID — assistive technology cannot link the reference to the note (Matterhorn 19-003, advisory).",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Note test")}) Tj ET\nEMC\n` +
        `/Note << /MCID 1 >> BDC\nBT /F1 9 Tf 72 100 Td (1. The footnote text sits here.) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Note /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Nums [0 [7 0 R 8 0 R]] >>",
          FONT,
        ],
        "<< /Title (Note Without ID) >>",
      );
    },
    check: (r) =>
      /19-003|no \/ID|Note/i.test(allFindings(r)) ? null : "ID-less <Note> not mentioned",
  },
  {
    file: "synthetic-33-unnamed-layer.pdf",
    truth:
      "An optional-content layer configuration with no name — assistive technology cannot announce which view is active (Matterhorn 20-001, advisory).",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Layer test")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /OCProperties << /OCGs [8 0 R] /D << /Order [8 0 R] >> >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          "<< /Type /OCG /Name (Layer 1) >>",
          FONT,
        ],
        "<< /Title (Unnamed Layer Config) >>",
      );
    },
    check: (r) =>
      /layer|20-001|configuration/i.test(allFindings(r))
        ? null
        : "OBSERVE: unnamed layer config not mentioned",
  },
  {
    file: "synthetic-34-rolemap-circular.pdf",
    truth:
      "A RoleMap where A maps to B and B maps back to A — a loop that must not hang the checker (Matterhorn 02-003).",
    build: () => {
      const content = `/AA << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Circular map")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R /RoleMap << /AA /BB /BB /AA >> >>",
          "<< /Type /StructElem /S /AA /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          FONT,
        ],
        "<< /Title (Circular RoleMap) >>",
      );
    },
    check: (r) =>
      /circular|02-003/i.test(allFindings(r))
        ? null
        : "OBSERVE: circular RoleMap chain not named (analysis completed, which is the hard truth)",
  },
  {
    file: "synthetic-35-rolemap-remaps-standard.pdf",
    truth:
      "The RoleMap redefines the STANDARD type /P to mean /Figure — PDF/UA forbids remapping standard types; viewers may honor either meaning (Matterhorn 02-004).",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Standard remap")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R /RoleMap << /P /Figure >> >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          FONT,
        ],
        "<< /Title (Standard Type Remapped) >>",
      );
    },
    check: (r) =>
      /remap|02-004|standard.*type/i.test(allFindings(r))
        ? null
        : "standard-type remap not flagged",
  },
  {
    file: "synthetic-36-javascript-action.pdf",
    truth:
      "A document carrying JavaScript actions — behavior a reader cannot predict; disclosed, never silent.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Script test")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /OpenAction 8 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          "<< /S /JavaScript /JS (app.alert\\(1\\);) >>",
          FONT,
        ],
        "<< /Title (JavaScript Action) >>",
      );
    },
    check: (r) =>
      /JavaScript/i.test(allFindings(r))
        ? null
        : "OBSERVE: JavaScript action not surfaced in findings",
  },
  {
    file: "synthetic-37-no-tab-order.pdf",
    truth:
      "No tab order set on any page — keyboard users walk the visual order, not the logical one.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Tab order")}) Tj ET\nEMC\n`;
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
        "<< /Title (No Tab Order) >>",
      );
    },
    check: (r) => (/tab order/i.test(allFindings(r)) ? null : "missing tab order not mentioned"),
  },
  {
    file: "synthetic-38-actualtext-figure.pdf",
    truth:
      "GOOD TWIN: a figure described via /ActualText instead of /Alt — ISO 32000 allows either; it must count as described, not flagged.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("ActualText twin")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 1 >> BDC\nq 40 0 0 40 72 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> /XObject << /Im1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 11 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 11 0 R]] >>",
          FONT,
          GRAY_IMG(10),
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 /ActualText (Company wordmark in gray.) >>",
        ],
        "<< /Title (ActualText Twin) >>",
      );
    },
    check: (r) => {
      const c = cat("alt_text")(r)!;
      return c.score === 100 || c.score === null
        ? null
        : `ActualText-described figure flagged (alt ${c.score})`;
    },
  },
  {
    file: "synthetic-39-artifact-decoration.pdf",
    truth:
      "GOOD TWIN: decorative content properly marked /Artifact — headers, footers, rules. It must be EXCLUDED, never demanded a description for.",
    build: () => {
      const content =
        `/Artifact << /Type /Pagination >> BDC\nBT /F1 8 Tf 72 770 Td (Running header decoration) Tj ET\nEMC\n` +
        `/Artifact << /Type /Layout >> BDC\nq 40 0 0 40 500 700 cm /Im1 Do Q\nEMC\n` +
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("Artifact twin")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> /XObject << /Im1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /P /P 5 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [6 0 R]] >>",
          FONT,
          GRAY_IMG(9),
        ],
        "<< /Title (Artifact Twin) >>",
      );
    },
    check: (r) => {
      const alt = cat("alt_text")(r)!;
      if (alt.score !== null && alt.score < 100)
        return `decorative artifact demanded a description (alt ${alt.score})`;
      return null;
    },
  },
  // -------------------------------------------------------------------------
  // Batch three (50 samples total): navigation, formulas, languages, rotated
  // pages, cross-category integration, and the grand good twin.
  // -------------------------------------------------------------------------
  {
    file: "synthetic-40-language-span-good.pdf",
    truth:
      "GOOD TWIN: a French passage properly declared with its own /Lang span inside an English document — recorded, never penalized.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Language span")}) Tj ET\nEMC\n` +
        `/Span << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (Liberte, egalite, fraternite pour tous les documents.) Tj ET\nEMC\n`;
      return buildPdf(
        [
          // DisplayDocTitle set: this is a GOOD twin, and without it the
          // title-display advisory (see synthetic-23) is what docks the score
          // — the first run of this sample proved exactly that.
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Span /P 6 0 R /Pg 3 0 R /K 1 /Lang (fr-FR) >>",
          "<< /Nums [0 [7 0 R 8 0 R]] >>",
          FONT,
        ],
        "<< /Title (Declared Language Span) >>",
      );
    },
    check: (r) => {
      const c = cat("title_language")(r)!;
      return c.score === 100
        ? null
        : `properly declared span penalized (title_language ${c.score})`;
    },
  },
  {
    file: "synthetic-41-long-doc-no-bookmarks.pdf",
    truth:
      "Twelve pages and no bookmarks — a long document without a navigable outline must lose navigation points.",
    build: () => {
      const { objs, catalogExtra } = multiPageObjs(12);
      objs[0] = `<< /Type /Catalog ${catalogExtra} >>`;
      return buildPdf(objs, "<< /Title (Twelve Pages No Bookmarks) >>");
    },
    check: (r) => {
      const c = cat("bookmarks")(r);
      if (!c || c.score === null) return "bookmarks unscored on a 12-page document";
      return c.score < 100 ? null : "12 pages without bookmarks scored 100";
    },
  },
  {
    file: "synthetic-42-long-doc-with-bookmarks.pdf",
    truth: "GOOD TWIN: the same twelve pages WITH bookmarks — navigation must score clean.",
    build: () => {
      const { objs, catalogExtra } = multiPageObjs(12);
      const outlines = objs.length + 1; // next object number after current list
      const item = (n: number) => outlines + n;
      objs[0] = `<< /Type /Catalog ${catalogExtra} /Outlines ${outlines} 0 R >>`;
      objs.push(
        `<< /Type /Outlines /First ${item(1)} 0 R /Last ${item(3)} 0 R /Count 3 >>`,
        `<< /Title (Introduction) /Parent ${outlines} 0 R /Next ${item(2)} 0 R /Dest [3 0 R /Fit] >>`,
        `<< /Title (Findings) /Parent ${outlines} 0 R /Prev ${item(1)} 0 R /Next ${item(3)} 0 R /Dest [9 0 R /Fit] >>`,
        `<< /Title (Appendix) /Parent ${outlines} 0 R /Prev ${item(2)} 0 R /Dest [19 0 R /Fit] >>`,
      );
      return buildPdf(objs, "<< /Title (Twelve Pages With Bookmarks) >>");
    },
    check: (r) => {
      const c = cat("bookmarks")(r)!;
      return c.score === 100 || c.score === null ? null : `bookmarked 12-pager docked (${c.score})`;
    },
  },
  {
    file: "synthetic-43-cover-sheet.pdf",
    truth:
      "A one-page cover sheet that is a single H1 and one line — small honest documents must not be punished for being small.",
    build: () => {
      // A realistic cover: title plus one full descriptive line — the first
      // cut had ~48 characters total, under the 50-char real-text floor, and
      // was honestly called textless. That floor is correct; the sample was
      // too spartan to be a fair "small honest document".
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 22 Tf 72 700 Td (Annual Report 2026) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 12 Tf 72 660 Td (${LONG("Prepared by the research unit")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Nums [0 [7 0 R 8 0 R]] >>",
          FONT,
        ],
        "<< /Title (Cover Sheet) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      return bad.length === 0 ? null : `cover sheet accused of ${bad.map((c) => c.id).join(", ")}`;
    },
  },
  {
    file: "synthetic-44-artifact-figure-conflict.pdf",
    truth:
      "Contradictory authoring: the image is painted as decorative /Artifact, yet ALSO tagged <Figure> with no alt. The tag is the author's claim that it is content — the missing description must be flagged.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Conflict test")}) Tj ET\nEMC\n` +
        `/Artifact << /Type /Layout >> BDC\nq 40 0 0 40 72 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> /XObject << /Im1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 11 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R]] >>",
          FONT,
          GRAY_IMG(10),
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R >>",
        ],
        "<< /Title (Artifact Figure Conflict) >>",
      );
    },
    check: (r) => {
      const c = cat("alt_text")(r)!;
      return c.score !== null && c.score < 100
        ? null
        : "a tagged alt-less <Figure> was excused because its paint was marked decorative";
    },
  },
  {
    file: "synthetic-45-rotated-pages.pdf",
    truth:
      "Pages rotated 90 degrees — a scanner-and-editor commonplace. Text must still extract; the analysis must not care which way is up.",
    build: () => {
      const { objs, catalogExtra } = multiPageObjs(2);
      objs[0] = `<< /Type /Catalog ${catalogExtra} >>`;
      objs[2] = objs[2]!.replace("/StructParents 0", "/StructParents 0 /Rotate 90");
      objs[4] = objs[4]!.replace("/StructParents 1", "/StructParents 1 /Rotate 270");
      return buildPdf(objs, "<< /Title (Rotated Pages) >>");
    },
    check: (r) => {
      const text = cat("text_extractability")(r)!;
      return text.score !== null && text.score >= 85 && !r.isScanned
        ? null
        : `rotation broke extraction (text ${text.score}, scanned ${r.isScanned})`;
    },
  },
  {
    file: "synthetic-46-link-good-twin.pdf",
    truth:
      "GOOD TWIN: a properly tagged link whose text says where it goes — link quality must score clean.",
    build: () => linkDoc("Read the 2025 annual report"),
    check: (r) => {
      const c = cat("link_quality")(r)!;
      return c.score === 100 || c.score === null
        ? null
        : `descriptive tagged link docked (${c.score}): ${c.findings.slice(0, 2).join(" | ")}`;
    },
  },
  {
    file: "synthetic-47-formula-no-alt.pdf",
    truth:
      "A <Formula> with no text alternative — formula glyphs rarely extract as speakable text, so a screen reader gets nothing (Matterhorn 17).",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Formula test")}) Tj ET\nEMC\n` +
        `/Formula << /MCID 1 >> BDC\nBT /F1 14 Tf 72 680 Td (E = mc2) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Formula /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Nums [0 [7 0 R 8 0 R]] >>",
          FONT,
        ],
        "<< /Title (Formula Without Alt) >>",
      );
    },
    check: (r) => (/formula/i.test(allFindings(r)) ? null : "alt-less <Formula> not flagged"),
  },
  {
    file: "synthetic-48-formula-good-twin.pdf",
    truth: "GOOD TWIN: the same formula carrying its spoken form as /ActualText — no complaint.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Formula twin")}) Tj ET\nEMC\n` +
        `/Formula << /MCID 1 >> BDC\nBT /F1 14 Tf 72 680 Td (E = mc2) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Formula /P 6 0 R /Pg 3 0 R /K 1 /ActualText (E equals m c squared) >>",
          "<< /Nums [0 [7 0 R 8 0 R]] >>",
          FONT,
        ],
        "<< /Title (Formula With Spoken Form) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      return /formula\(s\) tagged <Formula> have no text alternative/i.test(text)
        ? "described formula still flagged"
        : null;
    },
  },
  {
    file: "synthetic-49-three-failures-one-file.pdf",
    truth:
      "Integration: one document carrying THREE unrelated defects at once — untagged text, an alt-less figure, and a headerless table. All three must be flagged in one report.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Integration")}) Tj ET\nEMC\n` +
        `BT /F1 11 Tf 72 700 Td (${LONG("This untagged sentence is invisible to a reader")}) Tj ET\n` +
        `BT /F1 11 Tf 72 682 Td (${LONG("And so is this second one which no tag claims")}) Tj ET\n` +
        `/Figure << /MCID 1 >> BDC\nq 40 0 0 40 72 600 cm /Im1 Do Q\nEMC\n` +
        `/TD << /MCID 2 >> BDC\nBT /F1 10 Tf 72 540 Td (Cell A) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 162 540 Td (Cell B) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 13 0 R >> /XObject << /Im1 14 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 12 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 9 0 R] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [10 0 R] >>",
          "<< /Type /StructElem /S /TR /P 9 0 R /K [11 0 R 15 0 R] >>",
          "<< /Type /StructElem /S /TD /P 10 0 R /Pg 3 0 R /K 2 >>",
          "<< /Nums [0 [7 0 R 8 0 R 11 0 R 15 0 R]] >>",
          FONT,
          GRAY_IMG(14),
          "<< /Type /StructElem /S /TD /P 10 0 R /Pg 3 0 R /K 3 >>",
        ],
        "<< /Title (Three Failures One File) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      const missing: string[] = [];
      if (!/outside the tagged content|Outside the Tag Structure|untagged/i.test(text))
        missing.push("untagged text");
      if (!(cat("alt_text")(r)!.score! < 100)) missing.push("alt-less figure");
      if (!(cat("table_markup")(r)!.score! < 100)) missing.push("headerless table");
      return missing.length === 0
        ? null
        : `not all defects flagged together: missed ${missing.join(", ")}`;
    },
  },
  {
    file: "synthetic-50-kitchen-sink-good.pdf",
    truth:
      "THE GRAND GOOD TWIN: headings, a described figure, a table with directed headers (/Scope), a labeled tagged form field, tab order, title, language — everything right at once. No Critical or Moderate accusation is permitted.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 750 Td (Complete Document) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Kitchen sink")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 40 0 0 40 72 640 cm /Im1 Do Q\nEMC\n` +
        `/TH << /MCID 3 >> BDC\nBT /F1 10 Tf 72 580 Td (Year) Tj ET\nEMC\n` +
        `/TH << /MCID 4 >> BDC\nBT /F1 10 Tf 162 580 Td (Total) Tj ET\nEMC\n` +
        `/TD << /MCID 5 >> BDC\nBT /F1 10 Tf 72 560 Td (2026) Tj ET\nEMC\n` +
        `/TD << /MCID 6 >> BDC\nBT /F1 10 Tf 162 560 Td (12) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> /AcroForm << /Fields [17 0 R] >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 15 0 R >> /XObject << /Im1 16 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [17 0 R] /Tabs /S >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 14 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 8 0 R 18 0 R 9 0 R 19 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [10 0 R 11 0 R] >>",
          "<< /Type /StructElem /S /TR /P 9 0 R /K [12 0 R 13 0 R] >>",
          "<< /Type /StructElem /S /TR /P 9 0 R /K [20 0 R 21 0 R] >>",
          "<< /Type /StructElem /S /TH /P 10 0 R /Pg 3 0 R /K 3 /A << /O /Table /Scope /Column >> >>",
          "<< /Type /StructElem /S /TH /P 10 0 R /Pg 3 0 R /K 4 /A << /O /Table /Scope /Column >> >>",
          "<< /Nums [0 [7 0 R 8 0 R 18 0 R 12 0 R 13 0 R 20 0 R 21 0 R]] >>",
          FONT,
          GRAY_IMG(16),
          "<< /Type /Annot /Subtype /Widget /FT /Tx /T (contact_email) /TU (Contact email address) /Rect [72 500 300 520] /F 4 /P 3 0 R /StructParent 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (A gray decorative square used for testing.) >>",
          "<< /Type /StructElem /S /Form /P 6 0 R /Pg 3 0 R /K << /Type /OBJR /Obj 17 0 R >> >>",
          "<< /Type /StructElem /S /TD /P 11 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 11 0 R /Pg 3 0 R /K 6 >>",
        ],
        "<< /Title (The Complete Document) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `accused of ${bad.map((c) => `${c.id}(${c.severity})`).join(", ")}`;
      const table = cat("table_markup")(r)!;
      if (table.score !== null && table.score < 100)
        return `directed headers still docked (table ${table.score})`;
      return null;
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
