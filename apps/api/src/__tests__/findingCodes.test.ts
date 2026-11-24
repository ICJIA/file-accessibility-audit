/**
 * Finding codes — the machine-readable twin of every `findings` string
 * (FindingDetail in packages/shared, tagged in packages/analyzer scoring/).
 *
 * What these tests hold in place:
 *
 *   1. ALIGNMENT   every category's `findingDetails` is index-aligned with
 *                  its `findings` — same length, same text, byte for byte.
 *   2. CLOSURE     every code a scorer emits is in the registry, every
 *                  registered code is written in a scorer's source, and every
 *                  code literal in a scorer's source is registered. An
 *                  untagged finding surfaces as `<format>.<category>.uncoded`,
 *                  which is deliberately NOT registered, so it fails here.
 *   3. FORMAT      codes are dotted lowercase, start with the document's own
 *                  format, sit under the category they appear in, and are
 *                  unique.
 *   4. KIND        a finding's `kind` agrees with what its prefix declares —
 *                  the conventions the report card reads (apps/web
 *                  utils/findings.ts), re-implemented here on purpose rather
 *                  than imported, so the engine and the card are checked
 *                  against the same written rule from two sides.
 *   5. FROZEN      no code that has shipped disappears (findingCodes.snapshot.ts).
 *
 * The documents: the four PDF fixtures and the Office builders in this
 * directory (always available, CI included), hand-built analyses that reach
 * branches those do not, and — where controls/ exists (dev machines; CI
 * builds only the synthetic traps, after the tests) — every control document.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FINDING_CODES,
  FINDING_CODE_PATTERN,
  RESULT_SCHEMA_VERSION,
  findingCodeInfo,
  findingKindFromPrefix,
  type CategoryResult,
  type FindingDetail,
} from "@file-audit/shared";
import { analyzeDocument } from "../services/analyzer.js";
import { scoreDocument, scoreDocx, scorePptx, scoreXlsx } from "../services/scorer.js";
import type { DocxAnalysis } from "../services/docxService.js";
import { buildDocx, paragraph, inlineImage } from "./helpers/minimalDocx.js";
import { buildPptx, bodyShape, para, picture, pptTable } from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";
import { makePdfjs, makeQpdf, taggedBaseline } from "./helpers/mockResults.js";
import { FROZEN_FINDING_CODES } from "./findingCodes.snapshot.js";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "../../../..");
const SCORING_DIR = path.join(REPO, "packages/analyzer/src/scoring");
const CONTROLS = path.join(REPO, "controls");
const FORMATS = ["pdf", "docx", "pptx", "xlsx"] as const;

interface Scored {
  name: string;
  fileType: string;
  categories: CategoryResult[];
  scoreProfiles?: Record<string, { categories: CategoryResult[] }>;
  schemaVersion?: number;
  engineVersion?: string;
}

// ---------------------------------------------------------------------------
// The prefix conventions, written out again (see header, point 4).
// ---------------------------------------------------------------------------
function kindThePrefixDeclares(text: string): string | null {
  if (text.startsWith("  ")) return "signal";
  if (text.startsWith("---")) return "divider";
  const lower = text.toLowerCase();
  const guidance = [
    "how to fix:",
    "how to fix (optional)",
    "tip:",
    "fix:",
    "note:",
    "review these",
  ];
  if (guidance.some((p) => lower.startsWith(p))) return "howto";
  const notScored = ["pdf/ua only — not scored", "advisory — not scored", "note — not scored"];
  if (notScored.some((p) => lower.trim().startsWith(p))) return "advisory";
  return null;
}

// ---------------------------------------------------------------------------
// The documents
// ---------------------------------------------------------------------------
const CORE_NO_TITLE = `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>x</dc:creator></cp:coreProperties>`;

async function builtDocuments(): Promise<Scored[]> {
  const out: Scored[] = [];
  const add = async (name: string, buf: Buffer) => {
    out.push({ name, ...(await analyzeDocument(buf, name)) });
  };

  for (const f of fs.readdirSync(path.join(HERE, "fixtures")).filter((f) => f.endsWith(".pdf"))) {
    await add(`fixtures/${f}`, fs.readFileSync(path.join(HERE, "fixtures", f)));
  }

  await add("clean.docx", await buildDocx());
  await add(
    "inaccessible.docx",
    await buildDocx({
      coreXml: CORE_NO_TITLE,
      stylesXml:
        `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
      body:
        paragraph("A BIG FAKE HEADING", { bold: true, sizeHalfPt: 36 }) +
        paragraph("ANOTHER FAKE HEADING", { bold: true, sizeHalfPt: 36 }) +
        paragraph("Low contrast note", { color: "BBBBBB" }) +
        inlineImage({}) +
        `<w:tbl><w:tblPr><w:tblStyle w:val="GridTable4"/></w:tblPr>` +
        `<w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
        `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>` +
        `<w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr></w:tbl>` +
        paragraph("• manually typed bullet one") +
        paragraph("• manually typed bullet two"),
    }),
  );

  await add(
    "inaccessible.pptx",
    await buildPptx({
      coreXml: CORE_NO_TITLE,
      declareLanguage: false,
      slideBgHex: "FFFFFF",
      slides: [
        { title: null, body: picture({}) + pptTable({ rows: 3, cols: 3 }) },
        {
          title: null,
          body: bodyShape(
            para("• fake", { colorHex: "DDDDDD", lang: null }) +
              para("• bullets", { colorHex: "DDDDDD", lang: null }),
          ),
        },
      ],
    }),
  );

  await add(
    "accessible.xlsx",
    await buildXlsx({
      sheets: [
        {
          name: "FY26 Grants",
          dimensionRef: "A1:C40",
          tables: [{ name: "Grants" }],
          drawings: [{ kind: "chart", descr: "Awards by county, FY26" }],
          hyperlinks: [
            { id: "rIdH1", target: "https://example.gov/r", display: "Methodology notes" },
          ],
          cells: [{ ref: "A1", styleIndex: 1, value: "County" }],
        },
      ],
      styles: [{ fontRgb: "FF000000", fillRgb: "FFFFFFFF" }],
    }),
  );
  await add(
    "inaccessible.xlsx",
    await buildXlsx({
      coreXml: CORE_NO_TITLE,
      sheets: [
        {
          name: "Sheet1",
          dimensionRef: "A1:H60",
          mergeCount: 4,
          tables: [{ name: "Bad", headerRowCount: 0 }],
          drawings: [{ kind: "pic" }],
          hyperlinks: [{ id: "rIdH1", target: "https://example.gov/x", ref: "A2" }],
          cells: [
            { ref: "A1", styleIndex: 1, value: "Total" },
            { ref: "A2", kind: "is", value: "https://example.gov/x" },
          ],
        },
        { name: "Sheet2", dimensionRef: "A1:D30" },
      ],
      styles: [{ fontRgb: "FFDDDDDD", fillRgb: "FFFFFFFF" }],
    }),
  );
  return out;
}

/** Hand-built analyses for branches real bytes above do not reach. */
function handBuiltDocuments(): Scored[] {
  const out: Scored[] = [];
  const pdf = (name: string, qpdf = makeQpdf(), pdfjs = makePdfjs()) =>
    out.push({ name, fileType: "pdf", ...scoreDocument(qpdf, pdfjs) });

  pdf("mock: defaults");
  const base = taggedBaseline();
  pdf("mock: tagged baseline", base.qpdf, base.pdfjs);
  pdf("mock: structure analyzer failed", makeQpdf({ error: "qpdf failed" }), base.pdfjs);
  pdf("mock: text analyzer failed", base.qpdf, makePdfjs({ error: "pdfjs failed" }));
  pdf(
    "mock: bad language tag, no title",
    makeQpdf({ ...base.qpdf, lang: "english" }),
    makePdfjs({ ...base.pdfjs, title: null, lang: "english" }),
  );

  const docx = (over: Partial<DocxAnalysis>): DocxAnalysis => ({
    metadata: {
      title: "Quarterly Report",
      creator: "A",
      language: "en-US",
      pageCount: 2,
      wordCount: 500,
    },
    headings: [
      { level: 2, text: "Introduction" },
      { level: 4, text: "Details" },
    ],
    fakeHeadings: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 4, unresolvedRuns: 0, failing: [] },
    paragraphCount: 6,
    emptyHeadingCount: 0,
    parse: { documentOk: true, stylesState: "ok", coreState: "ok" },
    ...over,
  });
  out.push({ name: "mock docx: skipped levels", fileType: "docx", ...scoreDocx(docx({})) });
  out.push({
    name: "mock docx: body unread",
    fileType: "docx",
    ...scoreDocx(docx({ parse: { documentOk: false, stylesState: "ok", coreState: "ok" } })),
  });
  out.push({
    name: "mock docx: unusable language, properties unreadable",
    fileType: "docx",
    ...scoreDocx(
      docx({
        metadata: {
          title: "x_y_final.docx",
          creator: null,
          language: "english",
          pageCount: 1,
          wordCount: 5,
        },
        emptyHeadingCount: 2,
      }),
    ),
  });
  out.push({
    name: "mock docx: core unparseable",
    fileType: "docx",
    ...scoreDocx(
      docx({
        metadata: { title: null, creator: null, language: null, pageCount: 1, wordCount: 5 },
        parse: { documentOk: true, stylesState: "unparseable", coreState: "unparseable" },
      }),
    ),
  });
  return out;
}

/** Every control document, where the corpus exists. */
async function controlDocuments(): Promise<Scored[]> {
  const out: Scored[] = [];
  if (!fs.existsSync(CONTROLS)) return out;
  const supported = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);
  const files: string[] = [];
  for (const e of fs.readdirSync(CONTROLS, { withFileTypes: true })) {
    if (e.name.startsWith("._") || e.name === "_not-documents") continue;
    if (e.isDirectory()) {
      for (const f of fs.readdirSync(path.join(CONTROLS, e.name))) {
        if (!f.startsWith("._") && supported.has(path.extname(f).toLowerCase()))
          files.push(path.join(e.name, f));
      }
    } else if (supported.has(path.extname(e.name).toLowerCase())) files.push(e.name);
  }
  for (const f of files.sort()) {
    try {
      const r = await analyzeDocument(fs.readFileSync(path.join(CONTROLS, f)), path.basename(f));
      out.push({ name: `controls/${f}`, ...r });
    } catch {
      // A file the analyzer refuses has no findings to check.
    }
  }
  return out;
}

function everyCategory(doc: Scored): CategoryResult[] {
  const seen = new Set<CategoryResult>(doc.categories);
  for (const p of Object.values(doc.scoreProfiles ?? {})) for (const c of p.categories) seen.add(c);
  return [...seen];
}

function everyDetail(
  docs: Scored[],
): Array<{ doc: Scored; category: CategoryResult; detail: FindingDetail }> {
  const out: Array<{ doc: Scored; category: CategoryResult; detail: FindingDetail }> = [];
  for (const doc of docs)
    for (const category of everyCategory(doc))
      for (const detail of category.findingDetails ?? []) out.push({ doc, category, detail });
  return out;
}

let docs: Scored[] = [];
let corpusSize = 0;

beforeAll(async () => {
  const corpus = await controlDocuments();
  corpusSize = corpus.length;
  docs = [...(await builtDocuments()), ...handBuiltDocuments(), ...corpus];
}, 600_000);

// ---------------------------------------------------------------------------
describe("finding codes: the result carries them", () => {
  it("has documents of all four formats to judge", () => {
    for (const f of FORMATS) expect(docs.some((d) => d.fileType === f)).toBe(true);
    expect(docs.length).toBeGreaterThanOrEqual(15);
    // Where the corpus exists it is used whole; say so in the log.
    if (corpusSize > 0) console.info(`[findingCodes] ${corpusSize} control document(s) included`);
  });

  it("stamps every result with schemaVersion and engineVersion", () => {
    const analyzerVersion = JSON.parse(
      fs.readFileSync(path.join(REPO, "packages/analyzer/package.json"), "utf8"),
    ).version;
    for (const d of docs) {
      expect(d.schemaVersion, d.name).toBe(RESULT_SCHEMA_VERSION);
      expect(d.engineVersion, d.name).toBe(analyzerVersion);
    }
    expect(RESULT_SCHEMA_VERSION).toBe(1);
  });

  it("1. findingDetails is index-aligned with findings, text identical", () => {
    for (const d of docs) {
      for (const c of everyCategory(d)) {
        const where = `${d.name} › ${c.id}`;
        expect(Array.isArray(c.findingDetails), where).toBe(true);
        expect(c.findingDetails!.length, where).toBe(c.findings.length);
        c.findings.forEach((text, i) => expect(c.findingDetails![i].text, where).toBe(text));
      }
    }
  });

  it("2a. every emitted code is registered — no finding is left uncoded", () => {
    const unregistered = new Map<string, string>();
    for (const { doc, category, detail } of everyDetail(docs)) {
      if (!findingCodeInfo(detail.code)) {
        unregistered.set(
          `${detail.code} :: ${detail.text.slice(0, 90)}`,
          `${doc.name} › ${category.id}`,
        );
      }
    }
    expect([...unregistered.entries()]).toEqual([]);
  });

  it("3a. an emitted code starts with the document's format and sits under its own category", () => {
    const wrong = new Set<string>();
    for (const { doc, category, detail } of everyDetail(docs)) {
      const [format, cat] = detail.code.split(".");
      if (format !== doc.fileType || (cat !== category.id && cat !== "general")) {
        wrong.add(`${detail.code} in ${doc.fileType} › ${category.id}`);
      }
    }
    expect([...wrong]).toEqual([]);
  });

  it("4. kind agrees with the prefix conventions the report card reads", () => {
    const wrong = new Set<string>();
    for (const { detail } of everyDetail(docs)) {
      const declared = kindThePrefixDeclares(detail.text);
      const ok = declared
        ? detail.kind === declared
        : detail.kind === "failure" || detail.kind === "pass" || detail.kind === "info";
      if (!ok) {
        wrong.add(
          `${detail.code}: kind ${detail.kind}, prefix says ${declared ?? "failure|pass|info"} — "${detail.text.slice(0, 60)}"`,
        );
      }
      // And the engine's own exported reading of the prefix is the same rule.
      expect(findingKindFromPrefix(detail.text)).toBe(declared);
    }
    expect([...wrong]).toEqual([]);
  });

  it("numbers and criteria are well-formed where present", () => {
    for (const { detail } of everyDetail(docs)) {
      for (const k of ["count", "total"] as const) {
        if (detail[k] !== undefined) expect(Number.isFinite(detail[k]), detail.code).toBe(true);
      }
      if (detail.pages)
        for (const p of detail.pages) expect(Number.isInteger(p), detail.code).toBe(true);
      if (detail.sc)
        for (const sc of detail.sc) expect(sc, detail.code).toMatch(/^\d\.\d\.\d{1,2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
describe("finding codes: the registry", () => {
  const registered = Object.keys(FINDING_CODES);

  it("3b. every code is dotted lowercase, belongs to a real format, and agrees with its entry", () => {
    expect(registered.length).toBeGreaterThan(100);
    expect(new Set(registered).size).toBe(registered.length);
    for (const code of registered) {
      expect(code).toMatch(FINDING_CODE_PATTERN);
      expect(code).toMatch(/^[a-z]+(\.[a-z0-9_]+){2,}$/);
      const info = findingCodeInfo(code)!;
      const [format, category] = code.split(".");
      expect(FORMATS as readonly string[], code).toContain(format);
      expect(info.format, code).toBe(format);
      expect(info.category, code).toBe(category);
      expect(info.summary.length, code).toBeGreaterThan(8);
      expect(info.summary, code).toMatch(/[.?]$/);
      expect(code.endsWith(".uncoded"), code).toBe(false);
    }
  });

  it("3c. no two registry source lines define the same code (an object literal would hide it)", () => {
    const dir = path.join(REPO, "packages/shared/src/findingCodes");
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      for (const m of src.matchAll(/^\s*"((?:pdf|docx|pptx|xlsx)\.[a-z0-9_.]+)":/gm)) {
        if (seen.has(m[1])) dupes.push(`${m[1]} (${seen.get(m[1])} and ${f})`);
        seen.set(m[1], f);
      }
    }
    expect(dupes).toEqual([]);
    expect([...seen.keys()].sort()).toEqual([...registered].sort());
  });

  // The static half of closure: it does not depend on any document reaching
  // a branch.
  const scoringSources = fs
    .readdirSync(SCORING_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: f, src: fs.readFileSync(path.join(SCORING_DIR, f), "utf8") }));
  const literals = new Map<string, string>();
  for (const { file, src } of scoringSources) {
    for (const m of src.matchAll(/["'`]((?:pdf|docx|pptx|xlsx)\.[a-z0-9_]+\.[a-z0-9_.]+)["'`]/g)) {
      literals.set(m[1], file);
    }
  }

  it("2b. every code literal in the scoring sources is registered", () => {
    const orphans = [...literals.entries()].filter(([code]) => !findingCodeInfo(code));
    expect(orphans).toEqual([]);
  });

  it("2c. every registered code is written in the scoring sources", () => {
    expect(registered.filter((code) => !literals.has(code))).toEqual([]);
  });

  it("2d. no finding string is written to a findings array untagged", () => {
    // The shapes a finding is born in: pushed, unshifted, or the first
    // element of a findings array literal. Each must start with fd(…) (or be
    // a non-literal expression, which is tagged where it is consumed).
    const untagged: string[] = [];
    const shapes = [
      /findings\s*\.\s*(?:push|unshift)\(\s*(?:\/\/[^\n]*\n\s*)*["'`]/g,
      /findings\s*(?::\s*string\[\])?\s*[:=]\s*\[\s*(?:\/\/[^\n]*\n\s*)*["'`]/g,
      /findings\[\d+\]\s*=\s*["'`]/g,
    ];
    for (const { file, src } of scoringSources) {
      if (!["pdf.ts", "docx.ts", "pptx.ts", "xlsx.ts", "supplementary.ts"].includes(file)) continue;
      for (const re of shapes) {
        for (const m of src.matchAll(re)) {
          const line = src.slice(0, m.index).split("\n").length;
          untagged.push(`${file}:${line}`);
        }
      }
    }
    expect(untagged).toEqual([]);
  });

  it("5. no shipped code has disappeared (removing or renaming one is a breaking change)", () => {
    expect(FROZEN_FINDING_CODES.length).toBeGreaterThan(100);
    expect(FROZEN_FINDING_CODES.filter((code) => !findingCodeInfo(code))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("finding codes: tagging never changes the words", () => {
  it("an untagged finding gets the unregistered `uncoded` code, kind read from its prefix", () => {
    // Scored outside the four scorers' own tagging: a category edited after
    // the fact keeps its details only if someone re-derives them, so the
    // shape of the fallback is pinned through the public scorer instead — a
    // result's details always cover every finding it carries.
    const r = scoreXlsx({
      metadata: { title: null, creator: null, sheetCount: 1 },
      sheets: [],
      tables: [],
      images: [],
      links: [],
      contrast: { checkedRuns: 0, unresolvedRuns: 0, failing: [] },
      totalCellsWithValue: 0,
      textBoxCount: 0,
    } as unknown as Parameters<typeof scoreXlsx>[0]);
    for (const c of r.categories) {
      expect(c.findingDetails!.map((d) => d.text)).toEqual(c.findings);
      for (const d of c.findingDetails!) expect(d.code.endsWith(".uncoded")).toBe(false);
    }
  });

  it("keeps a profile's categories and the top-level categories in step", () => {
    const base = taggedBaseline();
    const r = scoreDocument(base.qpdf, base.pdfjs);
    for (const profile of Object.values(r.scoreProfiles)) {
      for (const c of profile.categories) {
        expect(c.findingDetails!.length).toBe(c.findings.length);
      }
    }
    const pptx = scorePptx({
      metadata: { title: "Deck", creator: null, language: "en-US", slideCount: 0 },
      slides: [],
      images: [],
      tables: [],
      links: [],
      lists: { realListItems: 0, manualBulletParagraphs: 0 },
      contrast: { checkedRuns: 0, unresolvedRuns: 0, failing: [] },
    } as unknown as Parameters<typeof scorePptx>[0]);
    for (const c of pptx.categories) expect(c.findingDetails!.length).toBe(c.findings.length);
  });
});
