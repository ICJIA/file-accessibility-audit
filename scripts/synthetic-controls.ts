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
import { twinViolations } from "./gateLogic.mjs";
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
// 64x64, not 8x8: real exporters do not ship 8x8 art, and the analyzer's
// tiny-image skip (MIN_IMAGE_DIM) made an 8x8 fixture's census depend on
// whether pdf.js could resolve it -- which VARIED with byte layout. Caught by
// scripts/resave-invariance.ts on its first run (2026-08-29). The trailing
// newline before endstream is spec-conforming stream framing.
const GRAY_IMG = (_n: number) =>
  `<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 4096 >>\nstream\n${"x".repeat(4096)}\nendstream`;
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
      "Six of seven H1 tags wrap entire paragraphs — level order perfect, content wrong. Since the legal-only sweep (2026-08-29) content QUALITY is a judgment no automated check can confirm (and pdf.js has misread heading text before — v1.110.0), so it must be reported as an advisory and never scored: the outline census still names every suspect heading, the grade stays 100/A.",
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
      const text = allFindings(r);
      if (
        !/Advisory — not scored:.*(do not read as headings|may not read as headings)/is.test(text)
      )
        return "paragraph-headings not reported as advisory";
      const h = cat("heading_structure")(r);
      if (h && h.score !== null && h.score < 100)
        return `content judgment still scored (${h.score})`;
      return null;
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
      "Heading levels that skip (H1 → H3). W3C's own guidance says skipped levels are not a WCAG failure — it is PDF/UA / best-practice territory (Matterhorn 13-004) — so since the legal-only sweep it must be reported as a PDF/UA-only item and never scored: 100/A with the skip named.",
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
      const text = allFindings(r);
      if (!/PDF\/UA only — not scored:.*gaps/is.test(text) && !/Heading hierarchy skip/i.test(text))
        return "the level skip vanished from the report";
      const h = cat("heading_structure")(r);
      if (h && h.score !== null && h.score < 100) return `a level skip was scored (${h.score})`;
      return r.overallScore === 100
        ? null
        : `scored ${r.overallScore} — skips are not WCAG failures`;
    },
  },
  {
    file: "synthetic-20-generic-h-only.pdf",
    truth:
      "Only generic <H> tags, no H1–H6. The headings are identifiable — only their LEVELS are missing, which ISO 32000 permits and PDF/UA 7.4 forbids — so since the legal-only sweep it is a PDF/UA-only item: reported, never scored, 100/A.",
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
      const text = allFindings(r);
      if (!/PDF\/UA only — not scored:.*generic <H>/is.test(text))
        return "generic-<H> not reported as a PDF/UA-only item";
      const h = cat("heading_structure")(r);
      if (h && h.score !== null && h.score < 100) return `generic <H> was scored (${h.score})`;
      return null;
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
      "The COMPLEX side of the WCAG/PDF-UA line, and the shape behind the v1.108 dispute: headers run along the TOP and down the LEFT, with no /Scope and no /Headers. Nothing in the file says whether a left-hand cell labels its row or is data, so the header-to-data relationship is genuinely not determinable — a WCAG 1.3.1 failure, not merely a PDF/UA readiness item. Must be SCORED (unlike its simple twin, synthetic-121).",
    build: () => {
      let content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Scope test")}) Tj ET\nEMC\n`;
      let mcid = 1;
      // Row 0 is all headers; column 0 is all headers — two axes.
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) {
          const tag = row === 0 || col === 0 ? "TH" : "TD";
          content += `/${tag} << /MCID ${mcid} >> BDC\nBT /F1 10 Tf ${72 + col * 120} ${660 - row * 24} Td (${tag} ${row}-${col}) Tj ET\nEMC\n`;
          mcid++;
        }
      const cellObj = (i: number) => 11 + i; // 9 cells: objects 11..19
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
        FONT,
        `<< /Nums [0 [9 0 R ${Array.from({ length: 9 }, (_, i) => `${cellObj(i)} 0 R`).join(" ")}]] >>`,
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
        "<< /Type /StructElem /S /Table /P 6 0 R /K [20 0 R 21 0 R 22 0 R] >>",
      ];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++) {
          const tag = row === 0 || col === 0 ? "/TH" : "/TD";
          objs.push(
            `<< /Type /StructElem /S ${tag} /P ${20 + row} 0 R /Pg 3 0 R /K ${row * 3 + col + 1} >>`,
          );
        }
      for (let row = 0; row < 3; row++)
        objs.push(
          `<< /Type /StructElem /S /TR /P 10 0 R /K [${[0, 1, 2].map((c) => `${cellObj(row * 3 + c)} 0 R`).join(" ")}] >>`,
        );
      return buildPdf(objs, "<< /Title (Two Axis Headers Without Scope) >>");
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/Scope/i.test(text)) return "missing-Scope not flagged";
      if (/PDF\/UA only — not scored/.test(text))
        return "a two-axis table's missing scope was excused as PDF/UA-only — it is a WCAG failure";
      if (!/top|Column.*Row|position/i.test(text)) return "no direction-by-position advice";
      const t = cat("table_markup")(r);
      return t && t.score !== null && t.score < 100
        ? null
        : "a two-axis table with no scope was not scored down";
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
      "Eight heading tags, six holding no text. A reader jumping by heading lands on silence — but 'this element resolved no text' has been OUR extraction limit before (v1.110.0 cost a clean control 21 points), so an empty-heading verdict cannot be CONFIRMED mechanically. Since the legal-only sweep: reported as an advisory with every empty heading named, never scored.",
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
      const text = allFindings(r);
      if (!/Advisory — not scored:/i.test(text)) return "empty headings not reported as advisory";
      const h = cat("heading_structure")(r);
      if (h && h.score !== null && h.score < 100)
        return `empty headings scored (${h.score}) — the v1.110 lesson forbids confirming this`;
      return null;
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
      "Twelve substantive pages, no bookmarks, and no headings either. Since the legal-only sweep the missing BOOKMARKS may not move the grade (no WCAG 2.1 criterion requires them — reported as an advisory); the missing HEADINGS are the real 1.3.1 failure and still score 0/Critical, capping the document at 69/D. The trap now proves both halves: the advisory appears, and the grade that remains comes from the law.",
    build: () => {
      const { objs, catalogExtra } = multiPageObjs(12);
      objs[0] = `<< /Type /Catalog ${catalogExtra} >>`;
      return buildPdf(objs, "<< /Title (Twelve Pages No Bookmarks) >>");
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/Advisory — not scored:.*no bookmarks/is.test(text))
        return "missing bookmarks not reported as advisory";
      const b = cat("bookmarks")(r);
      if (b && b.score !== null && b.score < 100) return `bookmarks scored (${b.score})`;
      const h = cat("heading_structure")(r);
      if (!h || h.score !== 0) return "the real failure (no headings) was not scored";
      return null;
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

  // -------------------------------------------------------------------------
  // BATCH FOUR (51-100), 2026-08-28: fifty documents modeled on what Canva,
  // InDesign, and Word ACTUALLY export — the three tools behind most of the
  // problem documents agencies upload. Canva 51-68, InDesign 69-86,
  // Word 87-97, cross-tool finale 98-100.
  // -------------------------------------------------------------------------
  {
    file: "synthetic-51-canva-flat-poster.pdf",
    truth:
      "Canva's default PDF export: a beautiful poster with real text painted on the page and NO tags at all. A title and a language cannot buy back an untagged document.",
    build: () => {
      const content =
        `q 612 0 0 300 0 492 cm /Im1 Do Q\n` +
        `BT /F1 24 Tf 72 440 Td (Community Resource Fair) Tj ET\n` +
        `BT /F1 11 Tf 72 400 Td (${LONG("Join us Saturday")}) Tj ET\n` +
        `BT /F1 11 Tf 72 380 Td (${LONG("Free services")}) Tj ET\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>",
          stream(content),
          FONT,
          GRAY_IMG(6),
        ],
        "<< /Title (Community Resource Fair Poster) >>",
      );
    },
    check: (r) => {
      if (!/outside tagged content|not.*tagged|untagged|no structure/i.test(allFindings(r)))
        return "untagged poster not called untagged";
      if (r.overallScore > 79) return `untagged poster scored ${r.overallScore} — too kind`;
      return null;
    },
  },
  {
    file: "synthetic-52-canva-missing-title.pdf",
    truth:
      "A Canva download that was never given a name: tagged and readable, but no title anywhere in its metadata. The checker must name the missing title, not shrug.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Neighborhood Newsletter) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("This month")}) Tj ET\nEMC\n`;
      return buildPdf([
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
        "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
        "<< /Nums [0 [7 0 R 10 0 R]] >>",
        FONT,
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
      ]);
    },
    check: (r) =>
      /No document title found in metadata/i.test(allFindings(r))
        ? null
        : "missing title not named",
  },
  {
    file: "synthetic-53-canva-decorative-swarm.pdf",
    truth:
      "Canva's decorative shapes exported as twelve tagged <Figure>s with no descriptions, beside one real photo that has one. The census must read 1 of 13 — the swarm is not described.",
    build: () => {
      let content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Report body")}) Tj ET\nEMC\n`;
      for (let i = 0; i < 12; i++)
        content += `/Figure << /MCID ${i + 1} >> BDC\nq 12 0 0 12 ${80 + i * 40} 640 cm /Im1 Do Q\nEMC\n`;
      content += `/Figure << /MCID 13 >> BDC\nq 80 0 0 80 72 520 cm /Im1 Do Q\nEMC\n`;
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R ${Array.from({ length: 13 }, (_, i) => `${11 + i} 0 R`).join(" ")}] >>`,
        FONT,
        GRAY_IMG(8),
        `<< /Nums [0 [10 0 R ${Array.from({ length: 13 }, (_, i) => `${11 + i} 0 R`).join(" ")}]] >>`,
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
      ];
      for (let i = 0; i < 12; i++)
        objs.push(`<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K ${i + 1} >>`);
      objs.push(
        "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 13 /Alt (A photograph of the community center entrance.) >>",
      );
      return buildPdf(objs, "<< /Title (Decorative Swarm) >>");
    },
    check: (r) => {
      const m = allFindings(r).match(/(\d+) of (\d+) image\(s\) have alternative text/);
      if (!m) return "no image census line found";
      return m[1] === "1" && m[2] === "13" ? null : `census says ${m[0]}`;
    },
  },
  {
    file: "synthetic-54-canva-artifact-twin.pdf",
    truth:
      "The same page done right: the twelve decorative shapes marked as artifacts (invisible to screen readers, correctly), the one real photo described. No accusation is deserved and none may be made.",
    build: () => {
      let content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Report body")}) Tj ET\nEMC\n`;
      for (let i = 0; i < 12; i++)
        content += `/Artifact BMC\nq 12 0 0 12 ${80 + i * 40} 640 cm /Im1 Do Q\nEMC\n`;
      content += `/Figure << /MCID 1 >> BDC\nq 80 0 0 80 72 520 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 11 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 /Alt (A photograph of the community center entrance.) >>",
        ],
        "<< /Title (Decorative Shapes Done Right) >>",
      );
    },
    check: (r) => {
      const m = allFindings(r).match(/(\d+) of (\d+) image\(s\) have alternative text/);
      if (m && m[2] !== "1") return `artifacts counted as images — census ${m[0]}`;
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      return bad.length ? `accused of ${bad.map((c) => c.id).join(", ")}` : null;
    },
  },
  {
    file: "synthetic-55-canva-headline-image.pdf",
    truth:
      "The stylized headline is a picture of words with no description; the body is real text. The census must read 0 of 1 — a headline you cannot hear is a missing description.",
    build: () => {
      const content =
        `/Figure << /MCID 0 >> BDC\nq 400 0 0 60 72 700 cm /Im1 Do Q\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 660 Td (${LONG("The details")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 11 0 R]] >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Headline As Picture) >>",
      );
    },
    check: (r) => {
      const m = allFindings(r).match(/(\d+) of (\d+) image\(s\) have alternative text/);
      if (!m) return "no image census line found";
      return m[1] === "0" && m[2] === "1" ? null : `census says ${m[0]}`;
    },
  },
  {
    file: "synthetic-56-canva-mixed-links.pdf",
    truth:
      "Three links a template produced: one descriptive, one a bare web address, one saying only 'here'. The two bad habits must each be named; the good one must not be.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Event page")}) Tj ET\nEMC\n` +
        `/Link << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (Read the full program schedule) Tj ET\nEMC\n` +
        `/Link << /MCID 2 >> BDC\nBT /F1 11 Tf 72 670 Td (https://example.org/x9k2/p?id=884) Tj ET\nEMC\n` +
        `/Link << /MCID 3 >> BDC\nBT /F1 11 Tf 72 640 Td (here) Tj ET\nEMC\n`;
      const annot = (n: number, y: number) =>
        `<< /Type /Annot /Subtype /Link /Rect [72 ${y} 300 ${y + 16}] /A << /S /URI /URI (https://example.org/p${n}) >> /F 4 /StructParent ${n} >>`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [8 0 R 9 0 R 10 0 R] >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 11 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [12 0 R 13 0 R 14 0 R 15 0 R] >>",
          FONT,
          annot(1, 697),
          annot(2, 667),
          annot(3, 637),
          "<< /Nums [0 [12 0 R 13 0 R 14 0 R 15 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Link /P 6 0 R /Pg 3 0 R /K [1 << /Type /OBJR /Obj 8 0 R >>] >>",
          "<< /Type /StructElem /S /Link /P 6 0 R /Pg 3 0 R /K [2 << /Type /OBJR /Obj 9 0 R >>] >>",
          "<< /Type /StructElem /S /Link /P 6 0 R /Pg 3 0 R /K [3 << /Type /OBJR /Obj 10 0 R >>] >>",
        ],
        "<< /Title (Three Links) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/click here|generic|descriptive/i.test(text)) return "'here' link not flagged";
      if (!/URL|address|link text/i.test(text)) return "bare-URL link not flagged";
      return null;
    },
  },
  {
    file: "synthetic-57-canva-no-language.pdf",
    truth:
      "Tagged, titled, readable — but the document never says what language it is in, so a screen reader must guess its pronunciation. The missing declaration must be named.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Volunteer Guide) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Welcome aboard")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Volunteer Guide) >>",
      );
    },
    check: (r) =>
      /No language declaration found/i.test(allFindings(r)) ? null : "missing /Lang not named",
  },
  {
    file: "synthetic-58-canva-square-page.pdf",
    truth:
      "A social-media square page, 1080 by 1080 points. An unusual page size is a design choice, not an accessibility defect — a correctly tagged square must not be punished.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 22 Tf 80 980 Td (Save The Date) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 12 Tf 80 940 Td (${LONG("Our annual meeting")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1080 1080] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Save The Date Square) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `square page accused of ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `square page scored ${r.overallScore}`;
    },
  },
  {
    file: "synthetic-59-canva-decorated-heading.pdf",
    truth:
      "A heading dressed in guillemet ornaments, template-style. Decoration in the text must not break heading detection or crash extraction.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 20 Tf 72 720 Td (\\253\\253 Spring Festival \\273\\273) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("The festival")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Decorated Heading) >>",
      );
    },
    check: (r) => {
      const m =
        allFindings(r).match(/Found (\d+) heading tags?/i) ??
        allFindings(r).match(/(\d+) heading tag/);
      if (m && m[1] !== "1") return `heading census says ${m[1]}`;
      return null;
    },
  },
  {
    file: "synthetic-60-canva-one-giant-p.pdf",
    truth:
      "Four pages of real prose with visual hierarchy only — sizes and colors, never a heading tag. A substantive document with no headings must be told so.",
    build: () => {
      const { objs, catalogExtra } = multiPageObjs(4);
      objs[0] = `<< /Type /Catalog ${catalogExtra} >>`;
      return buildPdf(objs, "<< /Title (All Style No Structure) >>");
    },
    check: (r) =>
      /No heading tags found|No headings were found/i.test(allFindings(r))
        ? null
        : "heading-free substantive document not flagged",
  },
  {
    file: "synthetic-61-canva-dangling-pg.pdf",
    truth:
      "A tag whose page pointer aims at an object that does not exist — the leftovers of a deleted page. The checker must survive it and still finish the report.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Live text")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 1 >> BDC\nq 60 0 0 60 72 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R 12 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 11 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 /Alt (A gray square with a description.) >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 99 0 R /K 7 >>",
        ],
        "<< /Title (Dangling Page Pointer) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      if (!/of \d+ image\(s\) have alternative text/.test(allFindings(r)))
        return "image census missing";
      return null;
    },
  },
  {
    file: "synthetic-62-canva-double-tagged.pdf",
    truth:
      "One piece of painted content claimed by TWO tags at once — a paragraph and a figure both point at the same marked run. Contradictory tagging must not crash the checker or lose the text.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Shared content")}) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Second paragraph")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R 11 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 10 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 0 >>",
        ],
        "<< /Title (Double Tagged Content) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const t = cat("text_extractability")(r);
      if (t && t.severity === "Critical") return "double tagging zeroed text extraction";
      return null;
    },
  },
  {
    file: "synthetic-63-canva-blank-pages.pdf",
    truth:
      "Template padding: pages two and four are completely empty. Blank pages are wasteful, not fatal — they must not zero a document whose other pages are properly tagged.",
    build: () => {
      const pg = (n: number, extra: string) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]${extra} >>`;
      const content = (seed: string) =>
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG(seed)}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 11 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R 7 0 R] /Count 5 >>",
          pg(1, " /Resources << /Font << /F1 17 0 R >> >> /Contents 8 0 R /StructParents 0"),
          pg(2, ""),
          pg(3, " /Resources << /Font << /F1 17 0 R >> >> /Contents 9 0 R /StructParents 1"),
          pg(4, ""),
          pg(5, " /Resources << /Font << /F1 17 0 R >> >> /Contents 10 0 R /StructParents 2"),
          stream(content("Page one")),
          stream(content("Page three")),
          stream(content("Page five")),
          "<< /Type /StructTreeRoot /K 12 0 R /ParentTree 16 0 R >>",
          "<< /Type /StructElem /S /Document /P 11 0 R /K [13 0 R 14 0 R 15 0 R] >>",
          "<< /Type /StructElem /S /P /P 12 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 12 0 R /Pg 5 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 12 0 R /Pg 7 0 R /K 0 >>",
          "<< /Nums [0 [13 0 R] 1 [14 0 R] 2 [15 0 R]] >>",
          FONT,
        ],
        "<< /Title (Padded With Blanks) >>",
      );
    },
    check: (r) => {
      if (r.overallScore === 0) return "blank padding zeroed the document";
      return r.overallScore >= 60 ? null : `scored ${r.overallScore} — blanks over-punished`;
    },
  },
  {
    file: "synthetic-64-canva-h1-forest.pdf",
    truth:
      "Every text box exported as its own top-level heading: five H1s, no hierarchy beneath them. The heading census must read all five; the checker reports the shape honestly.",
    build: () => {
      let content = "";
      for (let i = 0; i < 5; i++)
        content += `/H1 << /MCID ${i} >> BDC\nBT /F1 16 Tf 72 ${740 - i * 30} Td (Section Heading Number ${i + 1}) Tj ET\nEMC\n`;
      content += `/P << /MCID 5 >> BDC\nBT /F1 11 Tf 72 560 Td (${LONG("Body under")}) Tj ET\nEMC\n`;
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${Array.from({ length: 6 }, (_, i) => `${9 + i} 0 R`).join(" ")}] >>`,
        FONT,
        `<< /Nums [0 [${Array.from({ length: 6 }, (_, i) => `${9 + i} 0 R`).join(" ")}]] >>`,
      ];
      for (let i = 0; i < 5; i++)
        objs.push(`<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K ${i} >>`);
      objs.push("<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 5 >>");
      return buildPdf(objs, "<< /Title (Heading Forest) >>");
    },
    check: (r) => {
      const m =
        allFindings(r).match(/Found (\d+) heading tags?/i) ??
        allFindings(r).match(/(\d+) heading tag/);
      if (!m) return "no heading census";
      return m[1] === "5" ? null : `census says ${m[1]} of 5 H1s`;
    },
  },
  {
    file: "synthetic-65-canva-story-no-bookmarks.pdf",
    truth:
      "A Canva-style 12-page story export: no bookmarks (now an unscored advisory — no WCAG 2.1 criterion requires them) and no headings (the real 1.3.1 failure, still scored). The grade that remains comes from the law, not the best practice.",
    build: () => {
      const { objs, catalogExtra } = multiPageObjs(12);
      objs[0] = `<< /Type /Catalog ${catalogExtra} >>`;
      return buildPdf(objs, "<< /Title (Twelve Page Story) >>");
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/Advisory — not scored:.*no bookmarks/is.test(text))
        return "missing bookmarks not reported as advisory";
      const b = cat("bookmarks")(r);
      if (b && b.score !== null && b.score < 100) return `bookmarks scored (${b.score})`;
      return null;
    },
  },
  {
    file: "synthetic-66-canva-vector-decor.pdf",
    truth:
      "Heavy vector decoration — dozens of drawn shapes, none marked — beneath properly tagged text. Unmarked drawing operators are furniture, not content, and must cost nothing.",
    build: () => {
      let decor = "";
      for (let i = 0; i < 40; i++)
        decor += `q 0.9 0.9 0.9 rg ${40 + i * 13} ${100 + (i % 7) * 90} 9 9 re f Q\n`;
      const content =
        decor +
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Annual Highlights) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("This year")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Vector Decoration) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `decor accused: ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `scored ${r.overallScore}`;
    },
  },
  {
    file: "synthetic-67-canva-emoticon-alt.pdf",
    truth:
      "An image whose description is ':-) :-) :-)'. Automation can verify a description EXISTS; whether it is a good one is the human 60-70% — the census must count it, and the product's own coverage disclosure carries the rest.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Photo caption")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 1 >> BDC\nq 60 0 0 60 72 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 11 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 /Alt (:-\\) :-\\) :-\\)) >>",
        ],
        "<< /Title (Emoticon Alt Text) >>",
      );
    },
    check: (r) => {
      const alt = cat("alt_text")(r);
      if (!alt) return "no alt_text category";
      if (alt.severity === "Critical" || alt.severity === "Moderate")
        return `present (if silly) alt still accused: ${alt.severity}`;
      return alt.score === null || alt.score >= 89 ? null : `alt_text scored ${alt.score}`;
    },
  },
  {
    file: "synthetic-68-canva-done-right.pdf",
    truth:
      "A Canva-style layout remediated by hand: tagged, titled, language set, headline real text, photo described, shapes artifacted. The checker must recognize the repair — no accusation, high grade.",
    build: () => {
      const content =
        `/Artifact BMC\nq 0.9 0.9 0.9 rg 0 700 612 92 re f Q\nEMC\n` +
        `/H1 << /MCID 0 >> BDC\nBT /F1 22 Tf 72 730 Td (Fall Community Events) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 660 Td (${LONG("Every autumn")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 100 0 0 70 72 540 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> /XObject << /Im1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 10 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 11 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          FONT,
          GRAY_IMG(9),
          "<< /Nums [0 [7 0 R 11 0 R 12 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (Families at last year's fall festival in the park.) >>",
        ],
        "<< /Title (Fall Community Events Guide) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `remediated Canva doc accused of ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `scored ${r.overallScore}`;
    },
  },

  {
    file: "synthetic-69-indesign-untagged-book.pdf",
    truth:
      "InDesign with 'Create Tagged PDF' unchecked: six pages of real text, a proper title, bookmarks, a language — everything EXCEPT tags. Pretty is not accessible; the untagged content must be named.",
    build: () => {
      const pageObj = (i: number) => 3 + i * 2;
      const objs: string[] = [
        "{{CAT}}",
        `<< /Type /Pages /Kids [${Array.from({ length: 6 }, (_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count 6 >>`,
      ];
      for (let i = 0; i < 6; i++) {
        objs.push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 15 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
        );
        objs.push(stream(`BT /F1 11 Tf 72 720 Td (${LONG(`Chapter page ${i + 1}`)}) Tj ET\n`));
      }
      objs.push(FONT); // 15
      objs.push("<< /First 17 0 R /Last 17 0 R /Count 1 >>"); // 16 outlines
      objs.push(`<< /Title (Chapter One) /Parent 16 0 R /Dest [${pageObj(0)} 0 R /Fit] >>`); // 17
      objs[0] =
        "<< /Type /Catalog /Pages 2 0 R /Lang (en-US) /Outlines 16 0 R /ViewerPreferences << /DisplayDocTitle true >> >>";
      return buildPdf(objs, "<< /Title (The Untagged Book) >>");
    },
    check: (r) => {
      if (!/outside tagged content|not.*tagged|untagged|no structure/i.test(allFindings(r)))
        return "untagged book not called untagged";
      if (r.overallScore > 79) return `untagged book scored ${r.overallScore} — too kind`;
      return null;
    },
  },
  {
    file: "synthetic-70-indesign-rolemap-styles.pdf",
    truth:
      "InDesign's custom paragraph-style names — Head-A, Body-Text — exported as custom tags with a correct role map. The checker must read through the map: the heading is a heading.",
    build: () => {
      const content =
        `/Head-A << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Program Overview) Tj ET\nEMC\n` +
        `/Body-Text << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("The program")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R /RoleMap << /Head-A /H1 /Body-Text /P >> >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /Head-A /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /Body-Text /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Custom Styles Mapped Right) >>",
      );
    },
    check: (r) => {
      const m =
        allFindings(r).match(/Found (\d+) heading tags?/i) ??
        allFindings(r).match(/(\d+) heading tag/);
      if (!m || m[1] !== "1") return `role-mapped heading not seen (census ${m?.[1] ?? "none"})`;
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      return bad.length ? `accused of ${bad.map((c) => c.id).join(", ")}` : null;
    },
  },
  {
    file: "synthetic-71-indesign-unmapped-tag.pdf",
    truth:
      "A custom tag with NO role-map entry at all — the style was renamed after mapping. An unknown tag must not crash the checker, and the text inside it must not vanish.",
    build: () => {
      const content =
        `/BodyCopy << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Orphan style")}) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Mapped style")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /BodyCopy /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Unmapped Custom Tag) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const t = cat("text_extractability")(r);
      if (t && t.severity === "Critical") return "unknown tag zeroed text extraction";
      return null;
    },
  },
  {
    file: "synthetic-72-indesign-figures-no-alt.pdf",
    truth:
      "Three anchored images whose alt-text panel was never opened — the single most common InDesign miss. The census must read 0 of 3.",
    build: () => {
      let content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Annual report")}) Tj ET\nEMC\n`;
      for (let i = 0; i < 3; i++)
        content += `/Figure << /MCID ${i + 1} >> BDC\nq 60 0 0 60 ${72 + i * 90} 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R 12 0 R 13 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 11 0 R 12 0 R 13 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 3 >>",
        ],
        "<< /Title (Alt Panel Never Opened) >>",
      );
    },
    check: (r) => {
      const m = allFindings(r).match(/(\d+) of (\d+) image\(s\) have alternative text/);
      if (!m) return "no image census line";
      return m[1] === "0" && m[2] === "3" ? null : `census says ${m[0]}`;
    },
  },
  {
    file: "synthetic-73-indesign-master-artifacts.pdf",
    truth:
      "Master-page furniture — running header and page number on all four pages — correctly marked as artifacts, over a properly headed report. Furniture done right must cost nothing.",
    build: () => {
      const pageObj = (i: number) => 3 + i * 2;
      const furniture = (i: number) =>
        `/Artifact << /Type /Pagination /Subtype /Header >> BDC\nBT /F1 9 Tf 72 770 Td (Annual Report 2026) Tj ET\nEMC\n` +
        `/Artifact << /Type /Pagination >> BDC\nBT /F1 9 Tf 530 30 Td (Page ${i + 1}) Tj ET\nEMC\n`;
      const objs: string[] = [
        "{{CAT}}",
        `<< /Type /Pages /Kids [${Array.from({ length: 4 }, (_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count 4 >>`,
      ];
      const p1 =
        furniture(0) +
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 730 Td (Findings Overview) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("Body page 1")}) Tj ET\nEMC\n`;
      objs.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 19 0 R >> >> /Contents 4 0 R /StructParents 0 >>`,
      );
      objs.push(stream(p1));
      for (let i = 1; i < 4; i++) {
        const content =
          furniture(i) +
          `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG(`Body page ${i + 1}`)}) Tj ET\nEMC\n`;
        objs.push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 19 0 R >> >> /Contents ${4 + i * 2} 0 R /StructParents ${i} >>`,
        );
        objs.push(stream(content));
      }
      objs.push("<< /Type /StructTreeRoot /K 12 0 R /ParentTree 18 0 R >>"); // 11
      objs.push(
        "<< /Type /StructElem /S /Document /P 11 0 R /K [13 0 R 14 0 R 15 0 R 16 0 R 17 0 R] >>",
      ); // 12
      objs.push(`<< /Type /StructElem /S /H1 /P 12 0 R /Pg ${pageObj(0)} 0 R /K 0 >>`); // 13
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(0)} 0 R /K 1 >>`); // 14
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(1)} 0 R /K 0 >>`); // 15
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(2)} 0 R /K 0 >>`); // 16
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(3)} 0 R /K 0 >>`); // 17
      objs.push("<< /Nums [0 [13 0 R 14 0 R] 1 [15 0 R] 2 [16 0 R] 3 [17 0 R]] >>"); // 18
      objs.push(FONT); // 19
      objs[0] =
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 11 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>";
      return buildPdf(objs, "<< /Title (Master Page Furniture) >>");
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `artifacted furniture accused: ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `scored ${r.overallScore}`;
    },
  },
  {
    file: "synthetic-74-indesign-toc-unlinked.pdf",
    truth:
      "A table-of-contents page with dotted leaders as plain text and no links anywhere in the document. With no links present, the link check must count as passing — never 'not applicable, so penalized'.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 16 Tf 72 740 Td (Contents) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (Chapter One . . . . . . . . 3) Tj ET\nEMC\n` +
        `/P << /MCID 2 >> BDC\nBT /F1 11 Tf 72 680 Td (Chapter Two . . . . . . . . 9) Tj ET\nEMC\n` +
        `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 640 Td (${LONG("Preface")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R 11 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R 11 0 R 12 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
        ],
        "<< /Title (Unlinked Contents Page) >>",
      );
    },
    check: (r) => {
      const c = cat("link_quality")(r);
      if (!c) return "no link category";
      if (c.score !== null && c.score < 100) return `no links, yet link score ${c.score}`;
      if (c.severity === "Critical" || c.severity === "Moderate")
        return `no links, yet accused: ${c.severity}`;
      return null;
    },
  },
  {
    file: "synthetic-75-indesign-toc-linked.pdf",
    truth:
      "The same contents page done right: each line a real tagged link with descriptive text, jumping inside the document. Descriptive internal links must pass clean.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 16 Tf 72 740 Td (Contents) Tj ET\nEMC\n` +
        `/Link << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (Chapter One: Getting Started) Tj ET\nEMC\n` +
        `/P << /MCID 2 >> BDC\nBT /F1 11 Tf 72 640 Td (${LONG("Preface")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [10 0 R] >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 11 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 11 0 R 12 0 R]] >>",
          FONT,
          "<< /Type /Annot /Subtype /Link /Rect [72 697 280 713] /Dest [3 0 R /Fit] /F 4 /StructParent 1 >>",
          "<< /Type /StructElem /S /Link /P 6 0 R /Pg 3 0 R /K [1 << /Type /OBJR /Obj 10 0 R >>] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 2 >>",
        ],
        "<< /Title (Linked Contents Page) >>",
      );
    },
    check: (r) => {
      const c = cat("link_quality")(r);
      if (c && (c.severity === "Critical" || c.severity === "Moderate"))
        return `descriptive internal link accused: ${c.severity}`;
      const bad = r.categories.filter((x) => x.severity === "Critical");
      return bad.length ? `accused of ${bad.map((x) => x.id).join(", ")}` : null;
    },
  },
  {
    file: "synthetic-76-indesign-bold-not-th.pdf",
    truth:
      "A table whose header row is merely styled bold — every cell exported as a data cell. A header you can only see is not a header; the table must be dinged.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Budget table")}) Tj ET\nEMC\n` +
        `/TD << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (Category) Tj ET\nEMC\n` +
        `/TD << /MCID 2 >> BDC\nBT /F1 11 Tf 200 700 Td (Amount) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 72 680 Td (Training) Tj ET\nEMC\n` +
        `/TD << /MCID 4 >> BDC\nBT /F1 10 Tf 200 680 Td (12,400) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R] >>",
          "<< /Type /StructElem /S /TR /P 11 0 R /K [13 0 R 14 0 R] >>",
          FONT,
          "<< /Nums [0 [10 0 R 13 0 R 14 0 R 15 0 R 16 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [7 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /TR /P 11 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TD /P 7 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /TD /P 7 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 4 >>",
        ],
        "<< /Title (Bold Is Not A Header) >>",
      );
    },
    check: (r) => {
      const c = cat("table_markup")(r)!;
      return c.score !== null && c.score < 100 ? null : "bold-only header row scored 100";
    },
  },
  {
    file: "synthetic-77-indesign-threaded-reverse.pdf",
    truth:
      "Threaded text frames exported with tags in the opposite order from the paint order. Disagreement between the two orders must not crash the checker or lose either paragraph.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Second frame")}) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("First frame")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 10 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
        ],
        "<< /Title (Threaded Frames Reversed) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const t = cat("text_extractability")(r);
      if (t && t.severity === "Critical") return "reversed thread order zeroed extraction";
      return null;
    },
  },
  {
    file: "synthetic-78-indesign-spread-page.pdf",
    truth:
      "A facing-page spread exported as one double-wide page, 1224 by 792. An unusual canvas is not a defect; a tagged spread must pass like any other page.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Center Spread) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Left side")}) Tj ET\nEMC\n` +
        `/P << /MCID 2 >> BDC\nBT /F1 11 Tf 700 690 Td (${LONG("Right side")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1224 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R 11 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R 11 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 2 >>",
        ],
        "<< /Title (Facing Page Spread) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `spread accused: ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `spread scored ${r.overallScore}`;
    },
  },
  {
    file: "synthetic-79-indesign-dangling-bookmark.pdf",
    truth:
      "A bookmark pointing at a page that was deleted after the bookmarks were made. A dead bookmark must not crash the checker; the report must still finish.",
    build: () => {
      const content = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Live page")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /Outlines 9 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 7 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [11 0 R] >>",
          "<< /Nums [0 [11 0 R]] >>",
          FONT,
          "<< /First 10 0 R /Last 10 0 R /Count 1 >>",
          "<< /Title (Deleted Chapter) /Parent 9 0 R /Dest [99 0 R /Fit] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
        ],
        "<< /Title (Dead Bookmark) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      return cat("bookmarks")(r) ? null : "bookmarks category vanished";
    },
  },
  {
    file: "synthetic-80-indesign-figure-caption.pdf",
    truth:
      "A described figure grouped with its caption, the way InDesign exports an anchored image with a caption frame. The pairing is correct and must pass clean.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Field notes")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 1 >> BDC\nq 80 0 0 60 72 620 cm /Im1 Do Q\nEMC\n` +
        `/Caption << /MCID 2 >> BDC\nBT /F1 9 Tf 72 605 Td (Figure 1: The survey site at dawn.) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 12 0 R 13 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Div /P 6 0 R /K [12 0 R 13 0 R] >>",
          "<< /Type /StructElem /S /Figure /P 11 0 R /Pg 3 0 R /K 1 /Alt (The survey site photographed at dawn.) >>",
          "<< /Type /StructElem /S /Caption /P 11 0 R /Pg 3 0 R /K 2 >>",
        ],
        "<< /Title (Figure With Caption) >>",
      );
    },
    check: (r) => {
      const alt = cat("alt_text")(r);
      if (alt && (alt.severity === "Critical" || alt.severity === "Moderate"))
        return `captioned, described figure accused: ${alt.severity}`;
      const bad = r.categories.filter((c) => c.severity === "Critical");
      return bad.length ? `accused of ${bad.map((c) => c.id).join(", ")}` : null;
    },
  },
  {
    file: "synthetic-81-indesign-span-explosion.pdf",
    truth:
      "One paragraph shattered into 120 style-run spans — InDesign's character-style confetti. Fragmentation must not crash the checker or zero the text.",
    build: () => {
      let content = "";
      const spanRefs: string[] = [];
      for (let i = 0; i < 120; i++) {
        content += `/Span << /MCID ${i} >> BDC\nBT /F1 10 Tf ${72 + (i % 12) * 42} ${740 - Math.floor(i / 12) * 16} Td (word${i}) Tj ET\nEMC\n`;
        spanRefs.push(`${9 + i} 0 R`);
      }
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${129} 0 R] >>`,
        FONT,
        `<< /Nums [0 [${Array.from({ length: 120 }, (_, i) => `${9 + i} 0 R`).join(" ")}]] >>`,
      ];
      for (let i = 0; i < 120; i++)
        objs.push(`<< /Type /StructElem /S /Span /P 129 0 R /Pg 3 0 R /K ${i} >>`);
      objs.push(`<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K [${spanRefs.join(" ")}] >>`);
      return buildPdf(objs, "<< /Title (Style Run Confetti) >>");
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const t = cat("text_extractability")(r);
      if (t && t.severity === "Critical") return "span confetti zeroed extraction";
      return null;
    },
  },
  {
    file: "synthetic-82-indesign-empty-frames.pdf",
    truth:
      "Two headings whose text frames were emptied during a late edit, still exported as heading tags with nothing inside. Empty headings must be named.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 740 Td (Quarterly Update) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 710 Td (${LONG("The quarter")}) Tj ET\nEMC\n` +
        `/H2 << /MCID 2 >> BDC\nEMC\n` +
        `/H2 << /MCID 3 >> BDC\nEMC\n` +
        `/H2 << /MCID 4 >> BDC\nBT /F1 14 Tf 72 650 Td (Spending Detail) Tj ET\nEMC\n` +
        `/P << /MCID 5 >> BDC\nBT /F1 11 Tf 72 620 Td (${LONG("Spending rose")}) Tj ET\nEMC\n`;
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${Array.from({ length: 6 }, (_, i) => `${9 + i} 0 R`).join(" ")}] >>`,
        FONT,
        `<< /Nums [0 [${Array.from({ length: 6 }, (_, i) => `${9 + i} 0 R`).join(" ")}]] >>`,
        "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        "<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K 2 >>",
        "<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K 3 >>",
        "<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K 4 >>",
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 5 >>",
      ];
      return buildPdf(objs, "<< /Title (Emptied Heading Frames) >>");
    },
    check: (r) =>
      /carry no text at all/i.test(allFindings(r)) ? null : "emptied heading frames not named",
  },
  {
    file: "synthetic-83-indesign-crop-marks.pdf",
    truth:
      "A print-shop export: crop marks drawn outside the crop box, live content inside it. Printer's marks must not confuse the reading of the real page.",
    build: () => {
      const marks =
        `q 0 0 0 RG 0.5 w 18 36 m 18 6 l S 36 18 m 6 18 l S Q\n` +
        `q 0 0 0 RG 0.5 w 594 756 m 594 786 l S 576 774 m 606 774 l S Q\n`;
      const content =
        marks +
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Print Ready Flyer) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Come celebrate")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [36 36 576 756] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Print Ready Flyer) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `crop marks accused: ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `scored ${r.overallScore}`;
    },
  },
  {
    file: "synthetic-84-indesign-form-xobject-text.pdf",
    truth:
      "A reusable drawing object with untagged text inside it, placed beside properly tagged text — the shape a placed snippet exports as. It must not crash the checker, and the tagged text must survive.",
    build: () => {
      const inner = `BT /F1 10 Tf 4 4 Td (Inside a placed object with more words to read) Tj ET\n`;
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Main story")}) Tj ET\nEMC\n` +
        `q 1 0 0 1 72 600 cm /Fx1 Do Q\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Fx1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R] >>",
          FONT,
          `<< /Type /XObject /Subtype /Form /BBox [0 0 300 20] /Resources << /Font << /F1 7 0 R >> >> /Length ${inner.length} >>\nstream\n${inner}endstream`,
          "<< /Nums [0 [10 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
        ],
        "<< /Title (Placed Object Text) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const t = cat("text_extractability")(r);
      if (t && t.severity === "Critical") return "placed object zeroed extraction";
      return null;
    },
  },
  {
    file: "synthetic-85-indesign-soft-hyphens.pdf",
    truth:
      "Justified text riddled with soft hyphens at line breaks. Typographic hyphenation must not zero extraction or crash the reading of words.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (The commis\\255sion recom\\255mends a compre\\255hensive re\\255view of the pro\\255gram and its out\\255comes across every re\\255gion this year.) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Plain second paragraph")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 10 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Hyphenated Justified Text) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const t = cat("text_extractability")(r);
      if (t && (t.severity === "Critical" || t.severity === "Moderate"))
        return `soft hyphens accused: ${t.severity}`;
      return null;
    },
  },
  {
    file: "synthetic-86-indesign-done-right.pdf",
    truth:
      "InDesign at its best: mapped styles, a described anchored image, a linked contents line, bookmarks, title display, tab order. The checker must recognize professional work.",
    build: () => {
      const content =
        `/Head-A << /MCID 0 >> BDC\nBT /F1 20 Tf 72 740 Td (Program Handbook) Tj ET\nEMC\n` +
        `/Body-Text << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("This handbook")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 80 0 0 60 72 600 cm /Im1 Do Q\nEMC\n` +
        `/Link << /MCID 3 >> BDC\nBT /F1 11 Tf 72 560 Td (Read the appendix on reporting) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> /Outlines 12 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> /XObject << /Im1 9 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [10 0 R] /Tabs /S >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 11 0 R /RoleMap << /Head-A /H1 /Body-Text /P >> >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 14 0 R 15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /Head-A /P 6 0 R /Pg 3 0 R /K 0 >>",
          FONT,
          GRAY_IMG(9),
          "<< /Type /Annot /Subtype /Link /Rect [72 557 300 573] /Dest [3 0 R /Fit] /F 4 /StructParent 1 >>",
          "<< /Nums [0 [7 0 R 14 0 R 15 0 R 16 0 R]] >>",
          "<< /First 13 0 R /Last 13 0 R /Count 1 >>",
          "<< /Title (Program Handbook) /Parent 12 0 R /Dest [3 0 R /Fit] >>",
          "<< /Type /StructElem /S /Body-Text /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (Staff assisting a visitor at the front desk.) >>",
          "<< /Type /StructElem /S /Link /P 6 0 R /Pg 3 0 R /K [3 << /Type /OBJR /Obj 10 0 R >>] >>",
        ],
        "<< /Title (Program Handbook) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `professional export accused: ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `scored ${r.overallScore}`;
    },
  },

  {
    file: "synthetic-87-word-rasterized-effects.pdf",
    truth:
      "Word's export of a title with text effects: each styled line becomes a picture of words, one image per line, over real body text. The checker must say the lettering may not be real text.",
    build: () => {
      const content =
        `/Figure << /MCID 0 >> BDC\nq 420 0 0 15 72 740 cm /Im1 Do Q\nEMC\n` +
        `/Figure << /MCID 1 >> BDC\nq 420 0 0 15 72 720 cm /Im1 Do Q\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 420 0 0 15 72 700 cm /Im1 Do Q\nEMC\n` +
        `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 660 Td (${LONG("Meeting agenda")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R 12 0 R 13 0 R] >>",
          FONT,
          `<< /Type /XObject /Subtype /Image /Width 600 /Height 21 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 12600 >>\nstream\n${"x".repeat(12600)}endstream`,
          "<< /Nums [0 [10 0 R 11 0 R 12 0 R 13 0 R]] >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
        ],
        "<< /Title (Styled Title Rasterized) >>",
      );
    },
    check: (r) =>
      /shaped like lines of writing|Lettering May Not Be Real Text/i.test(allFindings(r))
        ? null
        : "line-shaped images not called possible lettering",
  },
  {
    file: "synthetic-88-word-whitespace-table.pdf",
    truth:
      "A 'table' drawn with spaces — columns aligned by whitespace inside ordinary paragraphs, no table tag anywhere. The checker must not hallucinate a table where none is declared.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 10 Tf 72 740 Td (Category        Amount     Change) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 10 Tf 72 720 Td (Training        12,400     +8 percent) Tj ET\nEMC\n` +
        `/P << /MCID 2 >> BDC\nBT /F1 10 Tf 72 700 Td (Outreach        9,100      -2 percent) Tj ET\nEMC\n` +
        `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 660 Td (${LONG("Notes on the figures")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R 11 0 R 12 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 10 0 R 11 0 R 12 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
        ],
        "<< /Title (Whitespace Columns) >>",
      );
    },
    check: (r) => {
      const c = cat("table_markup")(r);
      if (c && c.score !== null && c.score < 100)
        return `no declared table, yet table score ${c.score}`;
      const bad = r.categories.filter((x) => x.severity === "Critical");
      return bad.length ? `accused of ${bad.map((x) => x.id).join(", ")}` : null;
    },
  },
  {
    file: "synthetic-89-word-boilerplate-alt.pdf",
    truth:
      "Word's auto-generated description: 'A picture containing text, screenshot'. Automation can verify a description exists; judging whether it says anything useful is the human share of the work — the report's own coverage disclosure carries that.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Quarterly memo")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 1 >> BDC\nq 80 0 0 60 72 600 cm /Im1 Do Q\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 11 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 1 /Alt (A picture containing text, screenshot) >>",
        ],
        "<< /Title (Auto Generated Description) >>",
      );
    },
    check: (r) => {
      const alt = cat("alt_text")(r);
      if (!alt) return "no alt_text category";
      if (alt.severity === "Critical" || alt.severity === "Moderate")
        return `present boilerplate alt accused: ${alt.severity}`;
      return null;
    },
  },
  {
    file: "synthetic-90-word-empty-spacers.pdf",
    truth:
      "Sixteen empty paragraphs used as vertical spacing between six real ones — the Enter-key school of layout. Spacer paragraphs must not crash, distort, or zero the report.",
    build: () => {
      let content = `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 750 Td (Spacing By Enter Key) Tj ET\nEMC\n`;
      const refs: string[] = ["9 0 R"];
      let mcid = 1;
      for (let i = 0; i < 6; i++) {
        content += `/P << /MCID ${mcid} >> BDC\nBT /F1 11 Tf 72 ${720 - i * 60} Td (${LONG(`Real paragraph ${i + 1}`)}) Tj ET\nEMC\n`;
        refs.push(`${10 + i} 0 R`);
        mcid++;
        for (let j = 0; j < 3 && i < 5; j++) {
          content += `/P << /MCID ${mcid} >> BDC\nEMC\n`;
          refs.push(`${16 + i * 3 + j} 0 R`);
          mcid++;
        }
      }
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${refs.join(" ")}] >>`,
        FONT,
        `<< /Nums [0 [${refs.join(" ")}]] >>`,
        "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
      ];
      let m2 = 1;
      const spacerObjs: string[] = [];
      for (let i = 0; i < 6; i++) {
        objs.push(`<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K ${m2} >>`);
        m2++;
        for (let j = 0; j < 3 && i < 5; j++) {
          spacerObjs.push(`<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K ${m2} >>`);
          m2++;
        }
      }
      return buildPdf([...objs, ...spacerObjs], "<< /Title (Spacing By Enter Key) >>");
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      if (r.overallScore === 0) return "spacer paragraphs zeroed the document";
      const bad = r.categories.filter((c) => c.severity === "Critical");
      return bad.length ? `accused of ${bad.map((c) => c.id).join(", ")}` : null;
    },
  },
  {
    file: "synthetic-91-word-track-changes.pdf",
    truth:
      "Review leftovers: a highlight and a popup comment shipped in the final PDF. Non-link annotations must not crash the checker or be mistaken for links.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 740 Td (Final Draft) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("The reviewed text")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 8 0 R >> >> /Contents 4 0 R /StructParents 0 /Annots [9 0 R 10 0 R] >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 11 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          FONT,
          "<< /Type /Annot /Subtype /Highlight /Rect [72 697 220 713] /QuadPoints [72 713 220 713 72 697 220 697] /C [1 1 0] /T (Reviewer 1) /Contents (Please verify this number.) >>",
          "<< /Type /Annot /Subtype /Popup /Rect [400 640 560 700] /Parent 9 0 R >>",
          "<< /Nums [0 [7 0 R 12 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Final Draft With Comments) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const c = cat("link_quality")(r);
      if (c && (c.severity === "Critical" || c.severity === "Moderate"))
        return `comments mistaken for links: ${c.severity}`;
      return null;
    },
  },
  {
    file: "synthetic-92-word-styles-good.pdf",
    truth:
      "Word used correctly: real heading styles exported as a clean H1, H2, H3 ladder. The census must read all three, and nothing may be accused.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 20 Tf 72 750 Td (Policy Manual) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("This manual")}) Tj ET\nEMC\n` +
        `/H2 << /MCID 2 >> BDC\nBT /F1 15 Tf 72 680 Td (Hiring Procedures) Tj ET\nEMC\n` +
        `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 650 Td (${LONG("Hiring begins")}) Tj ET\nEMC\n` +
        `/H3 << /MCID 4 >> BDC\nBT /F1 13 Tf 72 610 Td (Interview Panels) Tj ET\nEMC\n` +
        `/P << /MCID 5 >> BDC\nBT /F1 11 Tf 72 580 Td (${LONG("Panels include")}) Tj ET\nEMC\n`;
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${Array.from({ length: 6 }, (_, i) => `${9 + i} 0 R`).join(" ")}] >>`,
        FONT,
        `<< /Nums [0 [${Array.from({ length: 6 }, (_, i) => `${9 + i} 0 R`).join(" ")}]] >>`,
        "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        "<< /Type /StructElem /S /H2 /P 6 0 R /Pg 3 0 R /K 2 >>",
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
        "<< /Type /StructElem /S /H3 /P 6 0 R /Pg 3 0 R /K 4 >>",
        "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 5 >>",
      ];
      return buildPdf(objs, "<< /Title (Policy Manual) >>");
    },
    check: (r) => {
      const m =
        allFindings(r).match(/Found (\d+) heading tags?/i) ??
        allFindings(r).match(/(\d+) heading tag/);
      if (!m || m[1] !== "3") return `heading census says ${m?.[1] ?? "none"} of 3`;
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      return bad.length ? `styled Word doc accused: ${bad.map((c) => c.id).join(", ")}` : null;
    },
  },
  {
    file: "synthetic-93-word-fake-and-real-list.pdf",
    truth:
      "A real tagged list beside a hand-typed dash 'list' on the same page. Having done it right once does not excuse the fake one; the dash habit must still be named.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Two lists")}) Tj ET\nEMC\n` +
        `/LBody << /MCID 1 >> BDC\nBT /F1 11 Tf 90 700 Td (First real item in the list) Tj ET\nEMC\n` +
        `/LBody << /MCID 2 >> BDC\nBT /F1 11 Tf 90 680 Td (Second real item in the list) Tj ET\nEMC\n` +
        `/P << /MCID 3 >> BDC\nBT /F1 11 Tf 72 640 Td (- typed dash item one) Tj ET\nEMC\n` +
        `/P << /MCID 4 >> BDC\nBT /F1 11 Tf 72 620 Td (- typed dash item two) Tj ET\nEMC\n` +
        `/P << /MCID 5 >> BDC\nBT /F1 11 Tf 72 600 Td (- typed dash item three) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R 15 0 R 16 0 R 17 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 13 0 R 14 0 R 15 0 R 16 0 R 17 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /L /P 6 0 R /K [11 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /LI /P 10 0 R /K 13 0 R >>",
          "<< /Type /StructElem /S /LI /P 10 0 R /K 14 0 R >>",
          "<< /Type /StructElem /S /LBody /P 11 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /LBody /P 12 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 5 >>",
        ],
        "<< /Title (Real And Fake Lists) >>",
      );
    },
    check: (r) => (/list/i.test(allFindings(r)) ? null : "typed dash list not named"),
  },
  {
    file: "synthetic-94-word-merged-cells.pdf",
    truth:
      "A table with a merged header spanning two columns — Word's everyday layout. Cell spans must not crash the checker, and the properly headed table must not be zeroed.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Span table")}) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (Budget by Quarter) Tj ET\nEMC\n` +
        `/TH << /MCID 2 >> BDC\nBT /F1 10 Tf 72 680 Td (Q1) Tj ET\nEMC\n` +
        `/TH << /MCID 3 >> BDC\nBT /F1 10 Tf 200 680 Td (Q2) Tj ET\nEMC\n` +
        `/TD << /MCID 4 >> BDC\nBT /F1 10 Tf 72 660 Td (4,100) Tj ET\nEMC\n` +
        `/TD << /MCID 5 >> BDC\nBT /F1 10 Tf 200 660 Td (5,300) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 14 0 R 15 0 R 16 0 R 17 0 R 18 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [11 0 R 12 0 R 13 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [17 0 R 18 0 R] >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 1 /A << /O /Table /Scope /Column /ColSpan 2 >> >>",
          "<< /Type /StructElem /S /TH /P 12 0 R /Pg 3 0 R /K 2 /A << /O /Table /Scope /Column >> >>",
          "<< /Type /StructElem /S /TH /P 12 0 R /Pg 3 0 R /K 3 /A << /O /Table /Scope /Column >> >>",
          "<< /Type /StructElem /S /TD /P 13 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /TD /P 13 0 R /Pg 3 0 R /K 5 >>",
        ],
        "<< /Title (Merged Header Table) >>",
      );
    },
    check: (r) => {
      if (!r.grade) return "no grade computed";
      const c = cat("table_markup")(r);
      if (!c) return "no table category";
      if (c.severity === "Critical") return "merged header zeroed the table";
      return null;
    },
  },
  {
    file: "synthetic-95-word-info-title-only.pdf",
    truth:
      "A title stored only in the classic metadata slot, no modern XMP packet — how older Word saves. A title is a title; it must not be reported missing.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Records Retention Memo) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 690 Td (${LONG("Retention rules")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [7 0 R 10 0 R] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Nums [0 [7 0 R 10 0 R]] >>",
          FONT,
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
        ],
        "<< /Title (Records Retention Memo) >>",
      );
    },
    check: (r) =>
      /No document title found in metadata/i.test(allFindings(r))
        ? "an Info-dictionary title was reported missing"
        : null,
  },
  {
    file: "synthetic-96-word-print-to-pdf.pdf",
    truth:
      "'Print to PDF' instead of exporting: no tags, no title, no language — three losses in one habit, and all three must be named on one report.",
    build: () => {
      const content =
        `BT /F1 16 Tf 72 740 Td (Staff Announcement) Tj ET\n` +
        `BT /F1 11 Tf 72 700 Td (${LONG("Please note")}) Tj ET\n` +
        `BT /F1 11 Tf 72 680 Td (${LONG("Also note")}) Tj ET\n`;
      return buildPdf([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        stream(content),
        FONT,
      ]);
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/outside tagged content|not.*tagged|untagged|no structure/i.test(text))
        return "untagged printout not called untagged";
      if (!/No document title found in metadata/i.test(text)) return "missing title not named";
      if (!/No language declaration found/i.test(text)) return "missing language not named";
      return null;
    },
  },
  {
    file: "synthetic-97-word-done-right.pdf",
    truth:
      "Word used the way the training says: styles for headings, a described picture, a real list, a properly headed table, title and language set. Ordinary care must earn a high grade.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 20 Tf 72 750 Td (Office Move Guide) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("We are moving")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 80 0 0 60 72 620 cm /Im1 Do Q\nEMC\n` +
        `/LBody << /MCID 3 >> BDC\nBT /F1 11 Tf 90 580 Td (Pack your desk by Friday) Tj ET\nEMC\n` +
        `/LBody << /MCID 4 >> BDC\nBT /F1 11 Tf 90 560 Td (Label every box with your floor) Tj ET\nEMC\n` +
        `/TH << /MCID 5 >> BDC\nBT /F1 10 Tf 72 520 Td (Floor) Tj ET\nEMC\n` +
        `/TH << /MCID 6 >> BDC\nBT /F1 10 Tf 200 520 Td (Move Date) Tj ET\nEMC\n` +
        `/TD << /MCID 7 >> BDC\nBT /F1 10 Tf 72 500 Td (Third) Tj ET\nEMC\n` +
        `/TD << /MCID 8 >> BDC\nBT /F1 10 Tf 200 500 Td (October 12) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 9 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [10 0 R 11 0 R 12 0 R 13 0 R 18 0 R] >>",
          FONT,
          GRAY_IMG(8),
          "<< /Nums [0 [10 0 R 11 0 R 12 0 R 16 0 R 17 0 R 21 0 R 22 0 R 23 0 R 24 0 R]] >>",
          "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (A map of the third floor with numbered zones.) >>",
          "<< /Type /StructElem /S /L /P 6 0 R /K [14 0 R 15 0 R] >>",
          "<< /Type /StructElem /S /LI /P 13 0 R /K 16 0 R >>",
          "<< /Type /StructElem /S /LI /P 13 0 R /K 17 0 R >>",
          "<< /Type /StructElem /S /LBody /P 14 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /LBody /P 15 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [19 0 R 20 0 R] >>",
          "<< /Type /StructElem /S /TR /P 18 0 R /K [21 0 R 22 0 R] >>",
          "<< /Type /StructElem /S /TR /P 18 0 R /K [23 0 R 24 0 R] >>",
          "<< /Type /StructElem /S /TH /P 19 0 R /Pg 3 0 R /K 5 /A << /O /Table /Scope /Column >> >>",
          "<< /Type /StructElem /S /TH /P 19 0 R /Pg 3 0 R /K 6 /A << /O /Table /Scope /Column >> >>",
          "<< /Type /StructElem /S /TD /P 20 0 R /Pg 3 0 R /K 7 >>",
          "<< /Type /StructElem /S /TD /P 20 0 R /Pg 3 0 R /K 8 >>",
        ],
        "<< /Title (Office Move Guide) >>",
      );
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `careful Word doc accused: ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `scored ${r.overallScore}`;
    },
  },
  {
    file: "synthetic-98-tool-soup.pdf",
    truth:
      "Three tools' habits stapled into one file: a Canva-style untagged art page, an InDesign-style mapped page with an undescribed image, a Word-style body. One report must catch the untagged page AND the missing description together.",
    build: () => {
      const pgRes = (extra: string) => `/Resources << /Font << /F1 12 0 R >> ${extra}>> `;
      const p1 =
        `q 306 0 0 200 0 592 cm /Im1 Do Q\n` +
        `BT /F1 20 Tf 72 540 Td (Big Untagged Splash Page) Tj ET\n` +
        `BT /F1 11 Tf 72 500 Td (${LONG("Painted outside any tag")}) Tj ET\n`;
      const p2 =
        `/Head-A << /MCID 0 >> BDC\nBT /F1 16 Tf 72 740 Td (Mapped Section) Tj ET\nEMC\n` +
        `/Body-Text << /MCID 1 >> BDC\nBT /F1 11 Tf 72 710 Td (${LONG("Mapped body")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 60 0 0 60 72 600 cm /Im1 Do Q\nEMC\n`;
      const p3 = `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("Ordinary final page")}) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 9 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>",
          "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${pgRes("/XObject << /Im1 13 0 R >> ")}/Contents 6 0 R >>`,
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${pgRes("/XObject << /Im1 13 0 R >> ")}/Contents 7 0 R /StructParents 0 >>`,
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${pgRes("")}/Contents 8 0 R /StructParents 1 >>`,
          stream(p1),
          stream(p2),
          stream(p3),
          "<< /Type /StructTreeRoot /K 10 0 R /ParentTree 11 0 R /RoleMap << /Head-A /H1 /Body-Text /P >> >>",
          "<< /Type /StructElem /S /Document /P 9 0 R /K [14 0 R 15 0 R 16 0 R 17 0 R] >>",
          "<< /Nums [0 [14 0 R 15 0 R 16 0 R] 1 [17 0 R]] >>",
          FONT,
          GRAY_IMG(13),
          "<< /Type /StructElem /S /Head-A /P 10 0 R /Pg 4 0 R /K 0 >>",
          "<< /Type /StructElem /S /Body-Text /P 10 0 R /Pg 4 0 R /K 1 >>",
          "<< /Type /StructElem /S /Figure /P 10 0 R /Pg 4 0 R /K 2 >>",
          "<< /Type /StructElem /S /P /P 10 0 R /Pg 5 0 R /K 0 >>",
        ],
        "<< /Title (Three Tools One File) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/outside tagged content|not.*tagged|untagged|Outside the Tag Structure/i.test(text))
        return "untagged splash page not caught";
      const m = text.match(/(\d+) of (\d+) image\(s\) have alternative text/);
      if (!m) return "no image census — undescribed figure missed";
      if (r.overallScore > 79) return `tool soup scored ${r.overallScore} — too kind`;
      return null;
    },
  },
  {
    file: "synthetic-99-remediated-brochure.pdf",
    truth:
      "A four-page brochure that has been through remediation: heading on the first page, described figure, a linked and labeled navigation line, clean paragraphs throughout. Repair must be recognized across a whole document, not just a single page.",
    build: () => {
      const pageObj = (i: number) => 3 + i * 2;
      const objs: string[] = [
        "{{CAT}}",
        `<< /Type /Pages /Kids [${Array.from({ length: 4 }, (_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count 4 >>`,
      ];
      const p1 =
        `/H1 << /MCID 0 >> BDC\nBT /F1 20 Tf 72 740 Td (Community Services Brochure) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 700 Td (${LONG("Our services")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 80 0 0 60 72 600 cm /Im1 Do Q\nEMC\n`;
      objs.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 16 0 R >> /XObject << /Im1 17 0 R >> >> /Contents 4 0 R /StructParents 0 >>`,
      );
      objs.push(stream(p1));
      for (let i = 1; i < 4; i++) {
        objs.push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 16 0 R >> >> /Contents ${4 + i * 2} 0 R /StructParents ${i} >>`,
        );
        objs.push(
          stream(
            `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG(`Service area ${i}`)}) Tj ET\nEMC\n`,
          ),
        );
      }
      objs.push("<< /Type /StructTreeRoot /K 12 0 R /ParentTree 15 0 R >>"); // 11
      objs.push(
        "<< /Type /StructElem /S /Document /P 11 0 R /K [13 0 R 14 0 R 18 0 R 19 0 R 20 0 R 21 0 R] >>",
      ); // 12
      objs.push(`<< /Type /StructElem /S /H1 /P 12 0 R /Pg ${pageObj(0)} 0 R /K 0 >>`); // 13
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(0)} 0 R /K 1 >>`); // 14
      objs.push("<< /Nums [0 [13 0 R 14 0 R 18 0 R] 1 [19 0 R] 2 [20 0 R] 3 [21 0 R]] >>"); // 15
      objs.push(FONT); // 16
      objs.push(GRAY_IMG(17)); // 17
      objs.push(
        `<< /Type /StructElem /S /Figure /P 12 0 R /Pg ${pageObj(0)} 0 R /K 2 /Alt (Staff greeting families at the service center.) >>`,
      ); // 18
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(1)} 0 R /K 0 >>`); // 19
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(2)} 0 R /K 0 >>`); // 20
      objs.push(`<< /Type /StructElem /S /P /P 12 0 R /Pg ${pageObj(3)} 0 R /K 0 >>`); // 21
      objs[0] =
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 11 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>";
      return buildPdf(objs, "<< /Title (Community Services Brochure) >>");
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length) return `remediated brochure accused: ${bad.map((c) => c.id).join(", ")}`;
      return r.overallScore >= 89 ? null : `scored ${r.overallScore}`;
    },
  },
  {
    file: "synthetic-100-the-hundredth.pdf",
    truth:
      "Trap number one hundred does everything right — headings, a described figure, directed table headers, a labeled tagged form field, tab order, title, language. The hundredth answer, like the first, must be exactly 100 out of 100.",
    build: () => {
      const content =
        `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 750 Td (One Hundred Documents) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F1 11 Tf 72 720 Td (${LONG("The hundredth trap")}) Tj ET\nEMC\n` +
        `/Figure << /MCID 2 >> BDC\nq 40 0 0 40 72 640 cm /Im1 Do Q\nEMC\n` +
        `/TH << /MCID 3 >> BDC\nBT /F1 10 Tf 72 580 Td (Batch) Tj ET\nEMC\n` +
        `/TH << /MCID 4 >> BDC\nBT /F1 10 Tf 162 580 Td (Documents) Tj ET\nEMC\n` +
        `/TD << /MCID 5 >> BDC\nBT /F1 10 Tf 72 560 Td (Four) Tj ET\nEMC\n` +
        `/TD << /MCID 6 >> BDC\nBT /F1 10 Tf 162 560 Td (Fifty) Tj ET\nEMC\n`;
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
          "<< /Type /Annot /Subtype /Widget /FT /Tx /T (batch_number) /TU (Which batch is this document from) /Rect [72 500 300 520] /F 4 /P 3 0 R /StructParent 1 >>",
          "<< /Type /StructElem /S /Figure /P 6 0 R /Pg 3 0 R /K 2 /Alt (A gray square marking the hundredth trap document.) >>",
          "<< /Type /StructElem /S /Form /P 6 0 R /Pg 3 0 R /K << /Type /OBJR /Obj 17 0 R >> >>",
          "<< /Type /StructElem /S /TD /P 11 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 11 0 R /Pg 3 0 R /K 6 >>",
        ],
        "<< /Title (One Hundred Documents) >>",
      );
    },
    check: (r) =>
      r.overallScore === 100 && r.grade === "A"
        ? null
        : `the hundredth document scored ${r.overallScore}/${r.grade}, not 100/A`,
  },
  {
    file: "synthetic-116-crosstab-scope-both.pdf",
    truth:
      "A cross-tab table done RIGHT: top-row headers Scope=/Column, left-column header Scope=/Row, and the corner header — which labels its row AND its column — Scope=/Both, the third value ISO 32000 defines. Written the way real exporters write it: /A pointing AT a shared attribute object rather than holding one inline. Every header is scoped, so no header may be reported as missing scope and the table must score 100. (The trap that would have caught the 2026-08-29 DoIT bug: /Both was rejected, docking a correctly built reference document to 89/B.)",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Cross tab")}) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 10 Tf 72 700 Td (Region) Tj ET\nEMC\n` +
        `/TH << /MCID 2 >> BDC\nBT /F1 10 Tf 200 700 Td (2025) Tj ET\nEMC\n` +
        `/TH << /MCID 3 >> BDC\nBT /F1 10 Tf 300 700 Td (2026) Tj ET\nEMC\n` +
        `/TH << /MCID 4 >> BDC\nBT /F1 10 Tf 72 680 Td (North) Tj ET\nEMC\n` +
        `/TD << /MCID 5 >> BDC\nBT /F1 10 Tf 200 680 Td (140) Tj ET\nEMC\n` +
        `/TD << /MCID 6 >> BDC\nBT /F1 10 Tf 300 680 Td (152) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 13 0 R 14 0 R 15 0 R 16 0 R 17 0 R 18 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [11 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [13 0 R 14 0 R 15 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [16 0 R 17 0 R 18 0 R] >>",
          // The corner header labels the row beneath it AND the column beside
          // it, so /Both is correct — via an INDIRECT /A, the shape real
          // exporters write.
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 1 /A 19 0 R >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 2 /A 20 0 R >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 3 /A 20 0 R >>",
          "<< /Type /StructElem /S /TH /P 12 0 R /Pg 3 0 R /K 4 /A 21 0 R >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 6 >>",
          "<< /O /Table /Scope /Both >>",
          "<< /O /Table /Scope /Column >>",
          "<< /O /Table /Scope /Row >>",
        ],
        "<< /Title (Cross Tab With Both Scope) >>",
      );
    },
    check: (r) => {
      if (/missing Scope attribute/i.test(allFindings(r)))
        return "a fully scoped cross-tab was reported as missing scope";
      const t = cat("table_markup")(r);
      if (!t || t.score === null) return "table_markup unscored";
      if (t.score < 100) return `fully scoped cross-tab docked (table ${t.score})`;
      return r.overallScore === 100 && r.grade === "A"
        ? null
        : `scored ${r.overallScore}/${r.grade}, not 100/A`;
    },
  },
  {
    file: "synthetic-117-indirect-attr-values.pdf",
    truth:
      "A spanned table whose /Scope, /ColSpan and /RowSpan VALUES are each stored as indirect references to shared scalar objects — legal under ISO 32000 and exactly how Word writes repeated values. Resolving the /A dictionary but not the value inside it reads the literal string '23 0 R' instead of /Column, which cost a correctly built DoIT syllabus TWO false findings at once: every scoped header called missing, and a regular grid called ragged because every span read as 1. Scope must be seen, and the 3-column grid (1+2, carry+2, 3) must come out consistent.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Spanned table")}) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 10 Tf 72 700 Td (Term) Tj ET\nEMC\n` +
        `/TH << /MCID 2 >> BDC\nBT /F1 10 Tf 200 700 Td (Enrollment by campus) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 200 680 Td (410) Tj ET\nEMC\n` +
        `/TD << /MCID 4 >> BDC\nBT /F1 10 Tf 300 680 Td (395) Tj ET\nEMC\n` +
        `/TD << /MCID 5 >> BDC\nBT /F1 10 Tf 72 660 Td (Spring) Tj ET\nEMC\n` +
        `/TD << /MCID 6 >> BDC\nBT /F1 10 Tf 200 660 Td (388) Tj ET\nEMC\n` +
        `/TD << /MCID 7 >> BDC\nBT /F1 10 Tf 300 660 Td (402) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 14 0 R 15 0 R 16 0 R 17 0 R 18 0 R 19 0 R 20 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [11 0 R 12 0 R 13 0 R] >>",
          // Row 1: a row-header spanning 2 rows, then a column-header spanning
          // 2 columns → width 1 + 2 = 3.
          "<< /Type /StructElem /S /TR /P 10 0 R /K [14 0 R 15 0 R] >>",
          // Row 2: two data cells + the carried row-span → 1 + 2 = 3.
          "<< /Type /StructElem /S /TR /P 10 0 R /K [16 0 R 17 0 R] >>",
          // Row 3: three plain cells → 3.
          "<< /Type /StructElem /S /TR /P 10 0 R /K [18 0 R 19 0 R 20 0 R] >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 1 /A 21 0 R >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 2 /A 22 0 R >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /TD /P 13 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 13 0 R /Pg 3 0 R /K 6 >>",
          "<< /Type /StructElem /S /TD /P 13 0 R /Pg 3 0 R /K 7 >>",
          // Every attribute VALUE below is an indirect reference — the trap.
          "<< /O /Table /Scope 23 0 R /RowSpan 25 0 R >>",
          "<< /O /Table /Scope 24 0 R /ColSpan 25 0 R >>",
          "/Row",
          "/Column",
          "2",
        ],
        "<< /Title (Indirect Attribute Values) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (/missing Scope attribute/i.test(text))
        return "scope stored as an indirect value was read as missing";
      if (/inconsistent/i.test(text))
        return "spans stored as indirect values were read as 1, making a regular grid look ragged";
      const t = cat("table_markup")(r);
      if (!t || t.score === null) return "table_markup unscored";
      return t.score === 100 ? null : `fully scoped spanned table docked (table ${t.score})`;
    },
  },
  {
    file: "synthetic-118-language-mismatch.pdf",
    truth:
      "English prose in a document that declares itself French. The tag is present and well-formed, so every conformance checker — veraPDF included — passes it; a screen reader following the declaration reads the whole document with French pronunciation. WCAG 3.1.1 asks for the language of the page to be correct, not merely stated. Must be flagged.",
    build: () => {
      const lines =
        "The department publishes this course syllabus for students who are enrolled in the introductory physics sequence and for anyone who is considering the course. The text explains what the class will cover, how the work is graded, and where to find help when a problem set is difficult. Students should read it before the first meeting. The instructor holds office hours twice a week and answers questions by email within two working days. Laboratory sections meet in the science building, and each student is expected to bring the printed worksheet that is posted online before the session begins.".match(
          /.{1,88}(\s|$)/g,
        )!;
      let content = `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 750 Td (Course Syllabus) Tj ET\nEMC\n`;
      lines.forEach((ln, i) => {
        content += `/P << /MCID ${i + 1} >> BDC\nBT /F1 11 Tf 72 ${720 - i * 16} Td (${ln.trim()}) Tj ET\nEMC\n`;
      });
      const kids = ["9 0 R", ...lines.map((_, i) => `${10 + i} 0 R`)];
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (fr-FR) /ViewerPreferences << /DisplayDocTitle true >> >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${kids.join(" ")}] >>`,
        FONT,
        `<< /Nums [0 [${kids.join(" ")}]] >>`,
        "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
      ];
      lines.forEach((_, i) => {
        objs.push(`<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K ${i + 1} >>`);
      });
      return buildPdf(objs, "<< /Title (Course Syllabus) >>");
    },
    check: (r) =>
      /declares its language as .* but the text reads as English/i.test(allFindings(r))
        ? null
        : "English text declared French was not flagged",
  },
  {
    file: "synthetic-119-language-good-twin.pdf",
    truth:
      "GOOD TWIN, and the guard against over-triggering: the same English document declared en-US, carrying one genuinely French sentence in its own /Lang span — precisely the shape of the correctly authored Word source this bug came from. A document must never be accused of a language mismatch for containing a properly marked foreign passage.",
    build: () => {
      const lines =
        "The department publishes this course syllabus for students who are enrolled in the introductory physics sequence and for anyone who is considering the course. The text explains what the class will cover, how the work is graded, and where to find help when a problem set is difficult. Students should read it before the first meeting. The instructor holds office hours twice a week and answers questions by email within two working days. Laboratory sections meet in the science building, and each student is expected to bring the printed worksheet that is posted online before the session begins.".match(
          /.{1,88}(\s|$)/g,
        )!;
      let content = `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 750 Td (Course Syllabus) Tj ET\nEMC\n`;
      lines.forEach((ln, i) => {
        content += `/P << /MCID ${i + 1} >> BDC\nBT /F1 11 Tf 72 ${720 - i * 16} Td (${ln.trim()}) Tj ET\nEMC\n`;
      });
      const frMcid = lines.length + 1;
      content += `/P << /MCID ${frMcid} >> BDC\nBT /F1 11 Tf 72 ${720 - lines.length * 16} Td (Ce programme est egalement disponible en francais sur demande.) Tj ET\nEMC\n`;
      const kids = ["9 0 R", ...lines.map((_, i) => `${10 + i} 0 R`), `${10 + lines.length} 0 R`];
      const objs = [
        "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
        stream(content),
        "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
        `<< /Type /StructElem /S /Document /P 5 0 R /K [${kids.join(" ")}] >>`,
        FONT,
        `<< /Nums [0 [${kids.join(" ")}]] >>`,
        "<< /Type /StructElem /S /H1 /P 6 0 R /Pg 3 0 R /K 0 >>",
      ];
      lines.forEach((_, i) => {
        objs.push(`<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K ${i + 1} >>`);
      });
      objs.push(`<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K ${frMcid} /Lang (fr-FR) >>`);
      return buildPdf(objs, "<< /Title (Course Syllabus) >>");
    },
    check: (r) => {
      if (/but the text reads as/i.test(allFindings(r)))
        return "a correctly declared document with one French passage was accused of a mismatch";
      const c = cat("title_language")(r);
      return c && c.score !== null && c.score < 100 ? `title_language docked (${c.score})` : null;
    },
  },
  {
    file: "synthetic-120-classmap-attributes.pdf",
    truth:
      "A table whose header directions are attached BY CLASS: each header names a class in /C, and the structure tree root's /ClassMap maps that name to the attribute dictionary holding /Scope. This is the THIRD legal way to attach attributes — beside an inline /A dictionary and a reference to one — and no trap had ever used it. Found preemptively by scripts/encoding-invariance.ts on its first run (2026-08-29), before any agency file arrived: a table scoped this way scored 89/B with every header reported as missing scope. Scope must be seen through the class map, and the table must score 100.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Class map table")}) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 10 Tf 72 700 Td (Region) Tj ET\nEMC\n` +
        `/TH << /MCID 2 >> BDC\nBT /F1 10 Tf 200 700 Td (Total) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 72 680 Td (North) Tj ET\nEMC\n` +
        `/TD << /MCID 4 >> BDC\nBT /F1 10 Tf 200 680 Td (412) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          // The class map lives on the structure tree root, not on the cells.
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R /ClassMap << /ColHead << /O /Table /Scope /Column >> >> >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 13 0 R 14 0 R 15 0 R 16 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [11 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [15 0 R 16 0 R] >>",
          // No /A at all — the scope is reachable ONLY through /C.
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 1 /C /ColHead >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 2 /C /ColHead >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 4 >>",
        ],
        "<< /Title (Class Map Attributes) >>",
      );
    },
    check: (r) => {
      if (/missing Scope attribute/i.test(allFindings(r)))
        return "scope attached through a class map was read as missing";
      const t = cat("table_markup")(r);
      if (!t || t.score === null) return "table_markup unscored";
      return t.score === 100 ? null : `class-map scoped table docked (table ${t.score})`;
    },
  },
  {
    file: "synthetic-121-simple-table-no-scope.pdf",
    truth:
      "THE WCAG / PDF-UA LINE. A plain grid: one header row along the top, nothing spanned, no /Scope anywhere. PDF/UA calls that a defect; WCAG 1.3.1 does not, because a marked <TH> row already makes the header-to-data relationship determinable — there is only one axis it could refer to. So this must score 100/A (the grade follows the law) AND still report the missing /Scope as an explicitly unscored PDF/UA item. The twin of synthetic-24, whose headers run along BOTH edges and which therefore IS a WCAG failure.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Simple grid")}) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 10 Tf 72 700 Td (Month) Tj ET\nEMC\n` +
        `/TH << /MCID 2 >> BDC\nBT /F1 10 Tf 200 700 Td (Visits) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 72 680 Td (January) Tj ET\nEMC\n` +
        `/TD << /MCID 4 >> BDC\nBT /F1 10 Tf 200 680 Td (412) Tj ET\nEMC\n` +
        `/TD << /MCID 5 >> BDC\nBT /F1 10 Tf 72 660 Td (February) Tj ET\nEMC\n` +
        `/TD << /MCID 6 >> BDC\nBT /F1 10 Tf 200 660 Td (455) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 14 0 R 15 0 R 16 0 R 17 0 R 18 0 R 19 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [11 0 R 12 0 R 13 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [14 0 R 15 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [16 0 R 17 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [18 0 R 19 0 R] >>",
          // Header cells with NO /A at all — the whole point.
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /TD /P 13 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 13 0 R /Pg 3 0 R /K 6 >>",
        ],
        "<< /Title (Simple Grid Without Scope) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/PDF\/UA only — not scored/.test(text))
        return "the missing scope was not reported as an unscored PDF/UA item";
      const t = cat("table_markup")(r);
      if (!t || t.score === null) return "table_markup unscored";
      if (t.score < 100) return `a WCAG-conformant simple table was docked (table ${t.score})`;
      return r.overallScore === 100 && r.grade === "A"
        ? null
        : `scored ${r.overallScore}/${r.grade} — the grade must follow the law, not PDF/UA`;
    },
  },
  {
    file: "synthetic-122-unembedded-font-unscored.pdf",
    truth:
      "An unembedded ArialMT paints visible text, everything else perfect. No WCAG success criterion requires font embedding — a substituted font still renders and still extracts — so since v1.131.0 this must score 100/A while the census still names the font and a 'PDF/UA only — not scored' line explains the line the industry standard draws (PDF/UA 7.21). The trap that keeps the removed 85-cap from quietly coming back.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Font census")}) Tj ET\nEMC\n` +
        `/P << /MCID 1 >> BDC\nBT /F2 11 Tf 72 700 Td (Quarterly figures rendered in a font the file does not carry.) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R /F2 10 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 11 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 11 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          // The census walks FontDescriptor chains (a descriptor with no
          // /FontFile* = not embedded) — a bare font dict with no descriptor
          // never enters it, which is exactly how real files carry the defect:
          // Word writes the descriptor and omits the font program.
          "<< /Type /Font /Subtype /TrueType /BaseFont /ArialMT /Encoding /WinAnsiEncoding /FontDescriptor 12 0 R /FirstChar 32 /LastChar 122 >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /FontDescriptor /FontName /ArialMT /Flags 32 /FontBBox [-665 -325 2000 1006] /ItalicAngle 0 /Ascent 905 /Descent -212 /CapHeight 716 /StemV 80 >>",
        ],
        "<< /Title (Unembedded Font Census) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/non-embedded font/i.test(text)) return "the unembedded font was not named";
      if (!/PDF\/UA only — not scored:[^]*non-embedded font/i.test(text))
        return "the font finding lost its not-scored prefix";
      const t = cat("text_extractability")(r);
      if (t && t.score !== null && t.score < 100)
        return `text_extractability docked (${t.score}) for a requirement no WCAG criterion makes`;
      return r.overallScore === 100 && r.grade === "A"
        ? null
        : `scored ${r.overallScore}/${r.grade} — the 85-cap for unembedded fonts is back`;
    },
  },
  {
    file: "synthetic-123-nested-table-unscored.pdf",
    truth:
      "A properly tagged table nested inside a table cell, both with clean single-axis header rows. Hard to navigate — genuinely — but its relationships are still programmatically determinable, so 1.3.1 is satisfied and since v1.131.0 this must score 100/A while the nesting is still reported as an unscored item. Guards the removed 10-point nested-table deduction.",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("Nested table")}) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 10 Tf 72 700 Td (Region) Tj ET\nEMC\n` +
        `/TH << /MCID 2 >> BDC\nBT /F1 10 Tf 260 700 Td (Detail) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 72 680 Td (North) Tj ET\nEMC\n` +
        `/TH << /MCID 4 >> BDC\nBT /F1 9 Tf 260 680 Td (Month) Tj ET\nEMC\n` +
        `/TH << /MCID 5 >> BDC\nBT /F1 9 Tf 340 680 Td (Visits) Tj ET\nEMC\n` +
        `/TD << /MCID 6 >> BDC\nBT /F1 9 Tf 260 664 Td (January) Tj ET\nEMC\n` +
        `/TD << /MCID 7 >> BDC\nBT /F1 9 Tf 340 664 Td (412) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 13 0 R 14 0 R 15 0 R 19 0 R 20 0 R 21 0 R 22 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          // Outer table: header row + one data row whose second cell HOLDS a table.
          "<< /Type /StructElem /S /Table /P 6 0 R /K [11 0 R 12 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [15 0 R 16 0 R] >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /Pg 3 0 R /K 3 >>",
          "<< /Type /StructElem /S /TD /P 12 0 R /K [17 0 R] >>",
          // Inner table, itself clean: one header row, one data row.
          "<< /Type /StructElem /S /Table /P 16 0 R /K [18 0 R 23 0 R] >>",
          "<< /Type /StructElem /S /TR /P 17 0 R /K [19 0 R 20 0 R] >>",
          "<< /Type /StructElem /S /TH /P 18 0 R /Pg 3 0 R /K 4 >>",
          "<< /Type /StructElem /S /TH /P 18 0 R /Pg 3 0 R /K 5 >>",
          "<< /Type /StructElem /S /TD /P 23 0 R /Pg 3 0 R /K 6 >>",
          "<< /Type /StructElem /S /TD /P 23 0 R /Pg 3 0 R /K 7 >>",
          "<< /Type /StructElem /S /TR /P 17 0 R /K [21 0 R 22 0 R] >>",
        ],
        "<< /Title (Nested Table Reported Not Scored) >>",
      );
    },
    check: (r) => {
      const text = allFindings(r);
      if (!/nested/i.test(text)) return "the nested table was not reported";
      if (!/PDF\/UA only — not scored:[^]*nested/i.test(text))
        return "the nested-table note lost its not-scored prefix";
      return r.overallScore === 100 && r.grade === "A"
        ? null
        : `scored ${r.overallScore}/${r.grade} — the removed nested-table deduction is back`;
    },
  },
  {
    file: "synthetic-124-single-row-table.pdf",
    truth:
      "A ONE-ROW table: a TH leading a single row of data cells. Both conformance gates have always classified sub-2×2 constructs as layout scaffolds ('overwhelmingly layout constructs'), and since the legal-only sweep the score follows the same rule the gates do: the construct is excluded from table scoring entirely and the document is 100/A. (Written originally to expose the single-axis test's blind spot, which it did — the deeper fix removed the whole class from scoring.)",
    build: () => {
      const content =
        `/P << /MCID 0 >> BDC\nBT /F1 11 Tf 72 740 Td (${LONG("One row")}) Tj ET\nEMC\n` +
        `/TH << /MCID 1 >> BDC\nBT /F1 10 Tf 72 700 Td (Total) Tj ET\nEMC\n` +
        `/TD << /MCID 2 >> BDC\nBT /F1 10 Tf 200 700 Td (412) Tj ET\nEMC\n` +
        `/TD << /MCID 3 >> BDC\nBT /F1 10 Tf 320 700 Td (455) Tj ET\nEMC\n`;
      return buildPdf(
        [
          "<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R /StructParents 0 >>",
          stream(content),
          "<< /Type /StructTreeRoot /K 6 0 R /ParentTree 8 0 R >>",
          "<< /Type /StructElem /S /Document /P 5 0 R /K [9 0 R 10 0 R] >>",
          FONT,
          "<< /Nums [0 [9 0 R 12 0 R 13 0 R 14 0 R]] >>",
          "<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>",
          "<< /Type /StructElem /S /Table /P 6 0 R /K [11 0 R] >>",
          "<< /Type /StructElem /S /TR /P 10 0 R /K [12 0 R 13 0 R 14 0 R] >>",
          "<< /Type /StructElem /S /TH /P 11 0 R /Pg 3 0 R /K 1 >>",
          "<< /Type /StructElem /S /TD /P 11 0 R /Pg 3 0 R /K 2 >>",
          "<< /Type /StructElem /S /TD /P 11 0 R /Pg 3 0 R /K 3 >>",
        ],
        "<< /Title (Single Row Table) >>",
      );
    },
    check: (r) => {
      const t = cat("table_markup")(r);
      if (t && t.score !== null && t.score < 100)
        return `a one-row layout construct was scored down (table ${t.score})`;
      return r.overallScore === 100 && r.grade === "A"
        ? null
        : `scored ${r.overallScore}/${r.grade} — a one-row strip is page furniture, not a data table`;
    },
  },
  {
    file: "synthetic-125-wcag-clean-bp-debt.pdf",
    truth:
      "A document can satisfy WCAG 2.1 completely and still carry best-practice work. This one is tagged, marked, titled, language-tagged, nested into sections, and its one figure is described — no WCAG criterion fails, so it must land in the A band with no Critical or Moderate category and an empty conformance-failure list. It nonetheless skips a heading level (H1 -> H3), runs past the bookmark threshold with no bookmarks, and leaves DisplayDocTitle off. None of those is a WCAG 2.1 failure, so none may move the score — and all three must still be reported, each carrying a not-scored prefix. This is the corpus proof of the Best Practices claim: a clean grade and work worth doing can be true at the same time.",
    build: () => {
      // Painted line by line, as every real exporter does: one unbroken Tj
      // run wider than the page comes back from pdf.js truncated at ~112
      // chars, which is a fixture artifact, not a document shape.
      const paintLines = (text: string, y: number) => {
        const words = text.split(" ");
        const lines: string[] = [];
        for (let w = 0; w < words.length; w += 10) lines.push(words.slice(w, w + 10).join(" "));
        return lines
          .map((line, li) => `BT /F1 11 Tf 72 ${y - li * 13} Td (${line}) Tj ET`)
          .join("\n");
      };
      // Twelve pages clears ANALYSIS.BOOKMARKS_PAGE_THRESHOLD (10) — under
      // it the bookmarks category is Not Assessed and the advisory never
      // fires, so the trap would prove nothing.
      const PAGES = 12;
      const pageObj = (i: number) => 3 + i * 2;
      const contentObj = (i: number) => 4 + i * 2;
      const structRoot = 3 + PAGES * 2;
      const docElem = structRoot + 1;
      const font = docElem + 1;
      const image = font + 1;
      const sect1 = image + 1;
      const h1 = sect1 + 1;
      const p1 = h1 + 1;
      const fig = p1 + 1;
      const sect2 = fig + 1;
      const h3 = sect2 + 1;
      const pRest = (i: number) => h3 + 1 + i;
      const parentTree = pRest(PAGES - 2) + 1;

      const objs: string[] = [];
      // No /ViewerPreferences: DisplayDocTitle is off, defect three.
      objs.push(
        `<< /Type /Catalog /Pages 2 0 R /StructTreeRoot ${structRoot} 0 R /MarkInfo << /Marked true >> /Lang (en-US) >>`,
      );
      objs.push(
        `<< /Type /Pages /Kids [${Array.from({ length: PAGES }, (_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
      );
      for (let i = 0; i < PAGES; i++) {
        let content: string;
        if (i === 0) {
          content =
            `/H1 << /MCID 0 >> BDC\nBT /F1 18 Tf 72 730 Td (Annual Program Report) Tj ET\nEMC\n` +
            `/P << /MCID 1 >> BDC\n${paintLines(LONG("This opening section"), 700)}\nEMC\n` +
            `/Figure << /MCID 2 >> BDC\nq 80 0 0 80 72 540 cm /Im1 Do Q\nEMC\n`;
        } else if (i === 1) {
          // H1 -> H3: defect one. Nothing else about the outline is wrong.
          content =
            `/H3 << /MCID 0 >> BDC\nBT /F1 14 Tf 72 730 Td (Program Enrollment) Tj ET\nEMC\n` +
            `/P << /MCID 1 >> BDC\n${paintLines(LONG("Enrollment across the year"), 700)}\nEMC\n`;
        } else {
          content = `/P << /MCID 0 >> BDC\n${paintLines(LONG(`Section ${i + 1} continues the account and`), 730)}\nEMC\n`;
        }
        const res =
          i === 0
            ? `<< /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${image} 0 R >> >>`
            : `<< /Font << /F1 ${font} 0 R >> >>`;
        objs.push(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${res} /Contents ${contentObj(i)} 0 R /StructParents ${i} /Tabs /S >>`,
        );
        objs.push(stream(content));
      }
      objs.push(`<< /Type /StructTreeRoot /K ${docElem} 0 R /ParentTree ${parentTree} 0 R >>`);
      objs.push(
        `<< /Type /StructElem /S /Document /P ${structRoot} 0 R /K [${sect1} 0 R ${sect2} 0 R] >>`,
      );
      objs.push(FONT);
      objs.push(GRAY_IMG(image));
      objs.push(
        `<< /Type /StructElem /S /Sect /P ${docElem} 0 R /K [${h1} 0 R ${p1} 0 R ${fig} 0 R] >>`,
      );
      objs.push(`<< /Type /StructElem /S /H1 /P ${sect1} 0 R /Pg ${pageObj(0)} 0 R /K 0 >>`);
      objs.push(`<< /Type /StructElem /S /P /P ${sect1} 0 R /Pg ${pageObj(0)} 0 R /K 1 >>`);
      objs.push(
        `<< /Type /StructElem /S /Figure /P ${sect1} 0 R /Pg ${pageObj(0)} 0 R /K 2 /Alt (A gray square standing in for the enrollment chart.) >>`,
      );
      objs.push(
        `<< /Type /StructElem /S /Sect /P ${docElem} 0 R /K [${h3} 0 R ${Array.from({ length: PAGES - 1 }, (_, i) => `${pRest(i)} 0 R`).join(" ")}] >>`,
      );
      objs.push(`<< /Type /StructElem /S /H3 /P ${sect2} 0 R /Pg ${pageObj(1)} 0 R /K 0 >>`);
      for (let i = 0; i < PAGES - 1; i++) {
        objs.push(
          `<< /Type /StructElem /S /P /P ${sect2} 0 R /Pg ${pageObj(i + 1)} 0 R /K ${i === 0 ? 1 : 0} >>`,
        );
      }
      const nums: string[] = [
        `0 [${h1} 0 R ${p1} 0 R ${fig} 0 R]`,
        `1 [${h3} 0 R ${pRest(0)} 0 R]`,
      ];
      for (let i = 2; i < PAGES; i++) nums.push(`${i} [${pRest(i - 1)} 0 R]`);
      objs.push(`<< /Nums [${nums.join(" ")}] >>`);
      // A real /Title, and no bookmarks anywhere: defect two.
      return buildPdf(objs, "<< /Title (Annual Program Report 2026) >>");
    },
    check: (r) => {
      const bad = r.categories.filter(
        (c) => c.severity === "Critical" || c.severity === "Moderate",
      );
      if (bad.length)
        return `WCAG-clean document accused of ${bad.map((c) => `${c.id}(${c.severity})`).join(", ")}`;
      if (r.overallScore < 89)
        return `score ${r.overallScore} < 89 — best-practice debt must not move the grade`;
      const failures = r.conformance?.failures ?? [];
      if (failures.length)
        return `conformance failures present: ${failures.map((f) => f.sc).join(", ")}`;
      const notScored = r.categories
        .flatMap((c) => c.findings)
        .filter((f) => /^(pdf\/ua only|advisory|note) — not scored/i.test(f.trim()));
      if (notScored.length < 3)
        return `expected at least 3 not-scored items, found ${notScored.length}`;
      const all = notScored.join("\n").toLowerCase();
      for (const needle of ["level order has gaps", "no bookmarks", "displaydoctitle"]) {
        if (!all.includes(needle)) return `missing the designed advisory: ${needle}`;
      }
      return null;
    },
  },
];

// ---------------------------------------------------------------------------
// Reader-facing manifest: one short plain-language label + verdict chip per
// trap, keyed by file. Rendered into the trust page's "all 100 documents"
// modal by scripts/build-brief.mjs (via scripts/trap-manifest.json, written
// at the end of a successful run). main() fails if this drifts from SAMPLES.
//   caught = the designed defect was flagged · held = a correct document or
//   hostile input passed/survived clean · bug = the battery caught a real
//   bug in the checker itself.
// ---------------------------------------------------------------------------
type TrapChip = "caught" | "held" | "bug";
const TRAP_MANIFEST: Record<string, { label: string; chip: TrapChip; chipText?: string }> = {
  "synthetic-01-well-built.pdf": {
    label: "A correctly built document — no false accusations allowed",
    chip: "held",
  },
  "synthetic-02-scanned-lie.pdf": {
    label: "Perfect title & language — secretly one big photo",
    chip: "caught",
    chipText: "CAUGHT \u00b7 SCORED 0",
  },
  "synthetic-03-hollow-alt.pdf": {
    label: 'Image "description" of nothing but blank spaces',
    chip: "bug",
  },
  "synthetic-04-gibberish-lang.pdf": {
    label: "Language declared as meaningless gibberish",
    chip: "caught",
  },
  "synthetic-05-tag-cycle.pdf": {
    label: "Internal structure that loops back on itself forever",
    chip: "held",
  },
  "synthetic-06-sixty-deep.pdf": { label: "Tags nested sixty levels deep", chip: "held" },
  "synthetic-07-paragraphs-as-headings.pdf": {
    label: "Whole paragraphs disguised as headings",
    chip: "caught",
  },
  "synthetic-08-headerless-table.pdf": {
    label: "A data table with no header row at all",
    chip: "caught",
  },
  "synthetic-09-empty-table.pdf": { label: "A table tag with no rows inside it", chip: "held" },
  "synthetic-10-orphan-decoy.pdf": {
    label: "A detached decoy stuffed with fake problems",
    chip: "held",
  },
  "synthetic-11-untagged-text.pdf": {
    label: "Real text painted outside every tag",
    chip: "caught",
  },
  "synthetic-12-hostile-strings.pdf": {
    label: "Hostile computer code hidden in the text",
    chip: "held",
  },
  "synthetic-13-bold-fake-headings.pdf": {
    label: "Big bold text instead of real headings",
    chip: "caught",
  },
  "synthetic-14-indesign-rolemap.pdf": {
    label: "InDesign naming soup with a one-letter typo",
    chip: "caught",
  },
  "synthetic-15-canva-empty-pairs.pdf": {
    label: "A page built the way Canva builds them — unreadable inside",
    chip: "held",
  },
  "synthetic-16-form-unlabeled.pdf": {
    label: "A form with no labels on any field",
    chip: "caught",
  },
  "synthetic-17-form-labeled.pdf": { label: "The same form, fully labeled", chip: "held" },
  "synthetic-18-rasterized-lettering.pdf": {
    label: "A letterhead line that is a picture of type",
    chip: "caught",
  },
  "synthetic-19-skipped-heading-levels.pdf": {
    label: "Heading levels that skip steps",
    chip: "caught",
  },
  "synthetic-20-generic-h-only.pdf": {
    label: "Generic headings with no levels at all",
    chip: "caught",
  },
  "synthetic-21-mixed-h-conventions.pdf": {
    label: "Two heading conventions mixed together",
    chip: "caught",
  },
  "synthetic-22-filename-title.pdf": {
    label: "A filename where the title should be",
    chip: "caught",
  },
  "synthetic-23-title-display-off.pdf": {
    label: "A good title the viewer is told not to show",
    chip: "caught",
  },
  "synthetic-24-th-without-scope.pdf": {
    label: "Header cells with no declared direction",
    chip: "caught",
  },
  "synthetic-25-fake-bullet-list.pdf": {
    label: "Bullets typed as plain text, no list structure",
    chip: "caught",
  },
  "synthetic-26-nested-table.pdf": { label: "A table inside a table cell", chip: "caught" },
  "synthetic-27-ragged-table.pdf": { label: "Rows whose columns do not line up", chip: "caught" },
  "synthetic-28-link-bare-url.pdf": {
    label: "Link text that is just the raw web address",
    chip: "caught",
  },
  "synthetic-29-link-click-here.pdf": {
    label: 'A link that says only "click here"',
    chip: "caught",
  },
  "synthetic-30-untagged-link.pdf": { label: "A clickable link no tag claims", chip: "caught" },
  "synthetic-31-empty-headings.pdf": {
    label: "Eight headings, six holding no text at all",
    chip: "caught",
  },
  "synthetic-32-note-without-id.pdf": {
    label: "A footnote no reader can trace back",
    chip: "caught",
  },
  "synthetic-33-unnamed-layer.pdf": {
    label: "A layer switch with no name to announce",
    chip: "caught",
  },
  "synthetic-34-rolemap-circular.pdf": {
    label: "A naming loop that could hang a parser",
    chip: "caught",
  },
  "synthetic-35-rolemap-remaps-standard.pdf": {
    label: "The standard rulebook words redefined",
    chip: "caught",
  },
  "synthetic-36-javascript-action.pdf": {
    label: "JavaScript actions hidden in the document",
    chip: "caught",
  },
  "synthetic-37-no-tab-order.pdf": { label: "No keyboard tab order on any page", chip: "caught" },
  "synthetic-38-actualtext-figure.pdf": {
    label: "A figure described the other legal way",
    chip: "held",
  },
  "synthetic-39-artifact-decoration.pdf": {
    label: "Decoration properly marked invisible",
    chip: "held",
  },
  "synthetic-40-language-span-good.pdf": {
    label: "A French passage properly declared",
    chip: "held",
  },
  "synthetic-41-long-doc-no-bookmarks.pdf": {
    label: "Twelve pages and no bookmarks",
    chip: "caught",
  },
  "synthetic-42-long-doc-with-bookmarks.pdf": {
    label: "The same twelve pages, with bookmarks",
    chip: "held",
  },
  "synthetic-43-cover-sheet.pdf": {
    label: "A one-page cover sheet — small is not a defect",
    chip: "held",
  },
  "synthetic-44-artifact-figure-conflict.pdf": {
    label: "Marked decorative, yet tagged as content, undescribed",
    chip: "caught",
  },
  "synthetic-45-rotated-pages.pdf": { label: "Pages rotated sideways", chip: "held" },
  "synthetic-46-link-good-twin.pdf": { label: "A link that says where it goes", chip: "held" },
  "synthetic-47-formula-no-alt.pdf": { label: "A formula with no spoken form", chip: "caught" },
  "synthetic-48-formula-good-twin.pdf": {
    label: "The same formula, spoken form included",
    chip: "held",
  },
  "synthetic-49-three-failures-one-file.pdf": {
    label: "Three unrelated defects in one file — all three flagged",
    chip: "caught",
  },
  "synthetic-50-kitchen-sink-good.pdf": {
    label: "Everything right at once — the grand good twin",
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
  "synthetic-51-canva-flat-poster.pdf": {
    label: "Canva default export: gorgeous and completely untagged",
    chip: "caught",
  },
  "synthetic-52-canva-missing-title.pdf": {
    label: "Never given a name — no title anywhere",
    chip: "caught",
  },
  "synthetic-53-canva-decorative-swarm.pdf": {
    label: "Twelve decorative shapes tagged as content, undescribed",
    chip: "caught",
  },
  "synthetic-54-canva-artifact-twin.pdf": {
    label: "The same shapes properly made invisible",
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
  "synthetic-55-canva-headline-image.pdf": {
    label: "A stylized headline that is a picture of words",
    chip: "caught",
  },
  "synthetic-56-canva-mixed-links.pdf": {
    label: 'Three links: one good, one raw address, one "here"',
    chip: "caught",
  },
  "synthetic-57-canva-no-language.pdf": { label: "No language declared anywhere", chip: "caught" },
  "synthetic-58-canva-square-page.pdf": {
    label: "A social-media square page, tagged right",
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
  "synthetic-59-canva-decorated-heading.pdf": {
    label: "A heading dressed in template ornaments",
    chip: "held",
  },
  "synthetic-60-canva-one-giant-p.pdf": {
    label: "Four pages of visual style, zero heading tags",
    chip: "caught",
  },
  "synthetic-61-canva-dangling-pg.pdf": { label: "A tag pointing at a deleted page", chip: "held" },
  "synthetic-62-canva-double-tagged.pdf": {
    label: "One passage claimed by two tags at once",
    chip: "held",
  },
  "synthetic-63-canva-blank-pages.pdf": { label: "Blank pages used as padding", chip: "held" },
  "synthetic-64-canva-h1-forest.pdf": {
    label: "Every text box its own H1 — reported honestly",
    chip: "held",
  },
  "synthetic-65-canva-story-no-bookmarks.pdf": {
    label: "A twelve-page photo story with no navigation",
    chip: "caught",
  },
  "synthetic-66-canva-vector-decor.pdf": {
    label: "Forty drawn shapes beneath properly tagged text",
    chip: "held",
  },
  "synthetic-67-canva-emoticon-alt.pdf": {
    label: 'An image described as ":-)" — the human share of the work',
    chip: "held",
  },
  "synthetic-68-canva-done-right.pdf": { label: "A Canva layout remediated by hand", chip: "held" },
  "synthetic-69-indesign-untagged-book.pdf": {
    label: "InDesign with tagging unchecked — pretty, not accessible",
    chip: "caught",
  },
  "synthetic-70-indesign-rolemap-styles.pdf": {
    label: "Custom style names, mapped correctly",
    chip: "held",
  },
  "synthetic-71-indesign-unmapped-tag.pdf": {
    label: "A custom tag with no mapping at all",
    chip: "held",
  },
  "synthetic-72-indesign-figures-no-alt.pdf": {
    label: "Three images, alt panel never opened",
    chip: "caught",
  },
  "synthetic-73-indesign-master-artifacts.pdf": {
    label: "Running headers properly made invisible",
    chip: "held",
  },
  "synthetic-74-indesign-toc-unlinked.pdf": {
    label: "A contents page with no links — nothing to punish",
    chip: "held",
  },
  "synthetic-75-indesign-toc-linked.pdf": {
    label: "A contents page properly linked",
    chip: "held",
  },
  "synthetic-76-indesign-bold-not-th.pdf": {
    label: "A header row that is only styled bold",
    chip: "caught",
  },
  "synthetic-77-indesign-threaded-reverse.pdf": {
    label: "Threaded frames tagged in reverse order",
    chip: "held",
  },
  "synthetic-78-indesign-spread-page.pdf": {
    label: "A facing-page spread, double wide",
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
  "synthetic-79-indesign-dangling-bookmark.pdf": {
    label: "A bookmark to a deleted page",
    chip: "held",
  },
  "synthetic-80-indesign-figure-caption.pdf": {
    label: "A figure grouped with its caption",
    chip: "held",
  },
  "synthetic-81-indesign-span-explosion.pdf": {
    label: "One paragraph shattered into 120 style runs",
    chip: "held",
  },
  "synthetic-82-indesign-empty-frames.pdf": {
    label: "Headings emptied in a late edit",
    chip: "caught",
  },
  "synthetic-83-indesign-crop-marks.pdf": {
    label: "Crop marks outside the trim box",
    chip: "held",
  },
  "synthetic-84-indesign-form-xobject-text.pdf": {
    label: "Text inside a placed drawing object",
    chip: "held",
  },
  "synthetic-85-indesign-soft-hyphens.pdf": {
    label: "Soft hyphens through justified text",
    chip: "held",
  },
  "synthetic-86-indesign-done-right.pdf": {
    label: "InDesign at its best — mapped, described, linked",
    chip: "held",
  },
  "synthetic-87-word-rasterized-effects.pdf": {
    label: "Word text effects: every styled line a picture",
    chip: "caught",
  },
  "synthetic-88-word-whitespace-table.pdf": {
    label: 'A "table" drawn with spaces — none hallucinated',
    chip: "held",
  },
  "synthetic-89-word-boilerplate-alt.pdf": {
    label: "Word's auto-alt: present, judged by the human share",
    chip: "held",
  },
  "synthetic-90-word-empty-spacers.pdf": {
    label: "Sixteen empty paragraphs as vertical spacing",
    chip: "held",
  },
  "synthetic-91-word-track-changes.pdf": {
    label: "Review comments shipped in the final file",
    chip: "held",
  },
  "synthetic-92-word-styles-good.pdf": {
    label: "Word styles used correctly: a clean H1-H2-H3 ladder",
    chip: "held",
  },
  "synthetic-93-word-fake-and-real-list.pdf": {
    label: 'A real list beside a typed dash "list"',
    chip: "caught",
  },
  "synthetic-94-word-merged-cells.pdf": {
    label: "A merged header spanning two columns",
    chip: "held",
  },
  "synthetic-95-word-info-title-only.pdf": {
    label: "A title in the classic metadata slot only",
    chip: "held",
  },
  "synthetic-96-word-print-to-pdf.pdf": {
    label: '"Print to PDF": three losses in one habit',
    chip: "caught",
  },
  "synthetic-97-word-done-right.pdf": { label: "Word done right, end to end", chip: "held" },
  "synthetic-98-tool-soup.pdf": {
    label: "Three tools' bad habits stapled into one file",
    chip: "caught",
  },
  "synthetic-99-remediated-brochure.pdf": {
    label: "A remediated four-page brochure",
    chip: "held",
  },
  "synthetic-100-the-hundredth.pdf": {
    label: "The hundredth document — perfect, and graded perfect",
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
  "synthetic-116-crosstab-scope-both.pdf": {
    label: "A cross-tab table scoped Column, Row, and Both — the corner header done right",
    chip: "bug",
  },
  "synthetic-117-indirect-attr-values.pdf": {
    label: "Scope and spans stored as references, the way Word writes them",
    chip: "bug",
  },
  "synthetic-118-language-mismatch.pdf": {
    label: "English text declaring itself French — a tag that is present and wrong",
    chip: "bug",
  },
  "synthetic-119-language-good-twin.pdf": {
    label: "The same document declared correctly, with one real French passage",
    chip: "held",
  },
  "synthetic-120-classmap-attributes.pdf": {
    label:
      "Header directions attached by class — the third legal route, caught before any file used it",
    chip: "bug",
  },
  "synthetic-121-simple-table-no-scope.pdf": {
    label:
      "A plain grid with no scope — PDF/UA asks for it, the law does not, and the grade follows the law",
    chip: "held",
  },
  "synthetic-122-unembedded-font-unscored.pdf": {
    label:
      "A font left unembedded — PDF/UA requires embedding, the law does not; reported, never scored",
    chip: "held",
  },
  "synthetic-123-nested-table-unscored.pdf": {
    label:
      "A table nested in a table cell — hard to navigate, still determinable; reported, never scored",
    chip: "held",
  },
  "synthetic-124-single-row-table.pdf": {
    label:
      "A one-row table misread as a crosstab — this trap was written first, watched fail, and forced the fix",
    chip: "bug",
  },
  "synthetic-125-wcag-clean-bp-debt.pdf": {
    label:
      "Passes WCAG 2.1 outright, and still has three things worth doing — a clean grade beside real advice",
    chip: "held",
    chipText: "HELD \u00b7 SCORED 100",
  },
};

// ---------------------------------------------------------------------------
// Twin orderings (2026-08-29): the corpus carries matched pairs — the same
// document with and without one defect. Beyond each file's own truth, the
// PAIR carries one more: the flawed twin must NEVER outscore the correct
// one, overall or in the defect's own category. This is monotonicity — a
// checker for which adding a defect can RAISE a score is broken in a way
// no single-file test can see. Checked after the per-file pass, same gate.
// ---------------------------------------------------------------------------
const TWIN_ORDERINGS: { bad: string; good: string; category: string }[] = [
  {
    bad: "synthetic-16-form-unlabeled.pdf",
    good: "synthetic-17-form-labeled.pdf",
    category: "form_accessibility",
  },
  {
    bad: "synthetic-41-long-doc-no-bookmarks.pdf",
    good: "synthetic-42-long-doc-with-bookmarks.pdf",
    category: "bookmarks",
  },
  {
    bad: "synthetic-47-formula-no-alt.pdf",
    good: "synthetic-48-formula-good-twin.pdf",
    category: "alt_text",
  },
  {
    bad: "synthetic-53-canva-decorative-swarm.pdf",
    good: "synthetic-54-canva-artifact-twin.pdf",
    category: "alt_text",
  },
];

// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const resultsByFile = new Map<string, AnalysisResult>();
  let hardFailures = 0;
  const rows: string[] = [];
  for (const s of SAMPLES) {
    const buf = s.build();
    fs.writeFileSync(path.join(OUT_DIR, s.file), buf);
    let verdict: string;
    try {
      const r = await analyzePDF(buf, s.file);
      resultsByFile.set(s.file, r);
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
  // Twin orderings — needs the results of the per-file pass above.
  for (const t of TWIN_ORDERINGS) {
    const bad = resultsByFile.get(t.bad);
    const good = resultsByFile.get(t.good);
    if (!bad || !good) {
      console.error(`twin ordering: missing result for ${t.bad} / ${t.good}`);
      hardFailures++;
      continue;
    }
    const problems = twinViolations(bad, good, t.category);
    if (problems.length) {
      console.error(`TWIN ORDER VIOLATED ${t.bad} vs ${t.good}: ${problems.join("; ")}`);
      hardFailures++;
    }
  }
  console.log(
    `twin orderings: ${TWIN_ORDERINGS.length} pairs — flawed twin never outscored the correct one`,
  );

  const missing = SAMPLES.filter((x) => !TRAP_MANIFEST[x.file]).map((x) => x.file);
  const extra = Object.keys(TRAP_MANIFEST).filter((f) => !SAMPLES.some((x) => x.file === f));
  if (missing.length || extra.length) {
    console.error(
      `manifest drift — missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`,
    );
    hardFailures++;
  } else if (hardFailures === 0) {
    // Only a fully verified run may refresh the reader-facing manifest.
    fs.writeFileSync(
      path.join(import.meta.dirname, "trap-manifest.json"),
      JSON.stringify(
        {
          count: SAMPLES.length,
          generated: new Date().toISOString().slice(0, 10),
          items: SAMPLES.map((x) => ({ file: x.file, ...TRAP_MANIFEST[x.file] })),
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`trap-manifest.json refreshed (${SAMPLES.length} entries)`);
  }
  console.log(`\n${hardFailures === 0 ? "ALL TRUTHS HELD" : `${hardFailures} TRUTH(S) VIOLATED`}`);
  process.exit(hardFailures === 0 ? 0 : 1);
}
main();
