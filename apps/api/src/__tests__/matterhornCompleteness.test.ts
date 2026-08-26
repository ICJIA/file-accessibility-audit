/**
 * v1.92.0 — the "small Matterhorn completeness pass". Covers the new
 * extraction censuses (qpdfService), their scoring/gate consumers, and the
 * three Adobe-parity rows that stopped being "vacuous pass assumed":
 *
 *   19  <Note> /ID presence + uniqueness            (advisory)
 *   17  <Formula> text alternatives                 (scored in alt_text + 1.1.1 gate)
 *   14  mixed /H + /Hn conventions                  (scored — pinned in scorer.test.ts)
 *   11  /Lang value shape (BCP-47)                  (scored half-credit, never gated)
 *   02  RoleMap validity + TRANSITIVE resolution    (advisory + census correctness)
 *   29  JavaScript presence                         (disclosure + parity row)
 *   05  multimedia annotation presence              (1.2.2 not-assessed + parity row)
 *   20  optional-content /Name + /AS                (advisory)
 *
 * Parser tests use qpdfParser.test.ts's exact idiom (mocked child_process);
 * scoring tests build fixtures like scorer.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

import { analyzeWithQpdf } from "../services/qpdfService.js";
import { execFileSync } from "node:child_process";
import { scoreDocument } from "../services/scorer.js";
import { buildAdobeParityReport } from "../services/scoring/adobeParity.js";
import type { QpdfResult } from "../services/qpdfService.js";
import type { PdfjsResult } from "../services/pdfjsService.js";

const mockExec = vi.mocked(execFileSync);

function parseJson(json: unknown) {
  mockExec.mockReturnValue(JSON.stringify(json));
  return analyzeWithQpdf(Buffer.from("fake"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

function makeQpdf(overrides: Partial<QpdfResult> = {}): QpdfResult {
  return {
    hasStructTree: false,
    hasLang: false,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    outlineTitles: [],
    hasAcroForm: false,
    formFields: [],
    images: [],
    imageObjectCount: 0,
    headings: [],
    tables: [],
    lists: [],
    paragraphCount: 0,
    hasMarkInfo: false,
    isMarkedContent: false,
    hasRoleMap: false,
    roleMapEntries: [],
    tabOrderPages: 0,
    totalPageCount: 0,
    langSpans: [],
    fonts: [],
    hasPdfUaIdentifier: false,
    pdfUaPart: null,
    artifactCount: 0,
    actualTextCount: 0,
    expansionTextCount: 0,
    isEncrypted: false,
    accessibilityAllowed: null,
    displayDocTitle: null,
    hasXfa: false,
    needsRendering: false,
    suspectsFlag: false,
    structTreeDepth: 0,
    contentOrder: [],
    structTreeMcidsByPage: {},
    error: null,
    ...overrides,
  };
}

function makePdfjs(overrides: Partial<PdfjsResult> = {}): PdfjsResult {
  return {
    pageCount: 1,
    hasText: true,
    textLength: 500,
    title: "A Title",
    author: null,
    subject: null,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    links: [],
    imageCount: 0,
    nonArtifactImageCount: 0,
    emptyPages: [],
    contentStreamMcidsByPage: {},
    metadata: {
      creator: null,
      producer: null,
      creationDate: null,
      modDate: null,
      pdfVersion: null,
      isEncrypted: false,
      keywords: null,
      author: null,
      subject: null,
      pageCount: 1,
    },
    error: null,
    ...overrides,
  };
}

const findCategory = (result: ReturnType<typeof scoreDocument>, id: string) => {
  const cat = result.categories.find((c) => c.id === id);
  if (!cat) throw new Error(`category ${id} missing`);
  return cat;
};

// ---------------------------------------------------------------------------
// Parser censuses
// ---------------------------------------------------------------------------

describe("qpdfService — <Note> /ID census (Matterhorn 19)", () => {
  it("counts notes, missing IDs, and duplicate IDs", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/S": "/Note", "/ID": "u:note-1" },
          "2 0 R": { "/S": "/Note", "/ID": "u:note-1" }, // duplicate
          "3 0 R": { "/S": "/Note" }, // no ID
        },
      ],
    });
    expect(result.noteCount).toBe(3);
    expect(result.notesMissingId).toBe(1);
    expect(result.noteDuplicateIdCount).toBe(1);
  });

  it("an empty /ID string counts as missing, not as present", () => {
    const result = parseJson({
      qpdf: [null, { "1 0 R": { "/S": "/Note", "/ID": "u:" } }],
    });
    expect(result.noteCount).toBe(1);
    expect(result.notesMissingId).toBe(1);
  });
});

describe("qpdfService — <Formula> census (Matterhorn 17)", () => {
  it("accepts /Alt OR /ActualText as the text alternative, counts neither as missing", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/S": "/Formula", "/Alt": "u:x equals y" },
          "2 0 R": { "/S": "/Formula", "/ActualText": "u:a squared" },
          "3 0 R": { "/S": "/Formula" },
        },
      ],
    });
    expect(result.formulaCount).toBe(3);
    expect(result.formulasMissingAlt).toBe(1);
  });

  it("role-mapped formulas are counted (transitive chain ends on /Formula)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/RoleMap": { "/Equation": "/MathBlock", "/MathBlock": "/Formula" },
          },
          "2 0 R": { "/S": "/Equation" },
        },
      ],
    });
    expect(result.formulaCount).toBe(1);
    expect(result.formulasMissingAlt).toBe(1);
  });
});

describe("qpdfService — transitive RoleMap resolution (Matterhorn 02)", () => {
  it("a chained mapping (Custom → MyHead → H1) is recognized as a heading — the v1.91.0 single-hop walk missed it", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/RoleMap": { "/BigHead": "/MyHead", "/MyHead": "/H1" },
          },
          "2 0 R": { "/S": "/BigHead" },
        },
      ],
    });
    expect(result.headings).toEqual([{ level: "H1", tag: "/BigHead" }]);
  });

  it("reports circular RoleMap chains (02-003) without breaking the parse", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": {
            "/Type": "/Catalog",
            "/RoleMap": { "/A": "/B", "/B": "/A" },
          },
        },
      ],
    });
    expect(result.roleMapCircularTags).toEqual(["A", "B"]);
    expect(result.error).toBeNull();
  });

  it("reports remapped STANDARD types (02-004)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/RoleMap": { "/P": "/Figure" } },
        },
      ],
    });
    expect(result.roleMapStandardRemaps).toEqual(["P → Figure"]);
  });

  it("censuses custom structure tags with no standard mapping (02-001), ignoring action dictionaries", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          // Struct evidence (/K) + non-standard final tag → censused.
          "1 0 R": { "/S": "/Weird", "/K": 0 },
          // An action dict: /S names the ACTION type and there is no
          // structural evidence — must never pollute the census.
          "2 0 R": { "/S": "/URI", "/URI": "u:https://example.com" },
          "3 0 R": { "/S": "/JavaScript", "/JS": "u:app.alert(1)" },
        },
      ],
    });
    expect(result.roleMapUnmappedTags).toEqual(["Weird"]);
  });
});

describe("qpdfService — JavaScript, multimedia, and optional-content censuses", () => {
  it("counts /S /JavaScript action dictionaries and the catalog's /Names /JavaScript tree", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/Names": "2 0 R" },
          "2 0 R": { "/JavaScript": "3 0 R" },
          "4 0 R": { "/S": "/JavaScript", "/JS": "u:this.print()" },
        },
      ],
    });
    expect(result.jsActionCount).toBe(1);
    expect(result.hasJsNameTree).toBe(true);
  });

  it("counts multimedia annotations by subtype, never Sound OBJECTS (/Type /Sound)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Annot", "/Subtype": "/Screen" },
          "2 0 R": { "/Type": "/Annot", "/Subtype": "/Screen" },
          "3 0 R": { "/Type": "/Annot", "/Subtype": "/RichMedia" },
          "4 0 R": { "/Type": "/Sound" }, // a sound OBJECT, not an annotation
        },
      ],
    });
    expect(result.mediaAnnotationCounts).toEqual({
      screen: 2,
      movie: 0,
      sound: 0,
      richMedia: 1,
    });
  });

  it("audits optional-content configurations for /Name (20-001) and /AS (20-002)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/OCProperties": "2 0 R" },
          "2 0 R": {
            "/OCGs": [],
            "/D": { "/Name": "u:Default view", "/AS": [{ "/Event": "/View" }] },
            "/Configs": [{ "/Creator": "u:tool" }], // no /Name, no /AS
          },
        },
      ],
    });
    expect(result.hasOptionalContent).toBe(true);
    expect(result.ocgConfigCount).toBe(2);
    expect(result.ocgConfigsMissingName).toBe(1);
    expect(result.ocgConfigsWithAS).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scoring + conformance consumers
// ---------------------------------------------------------------------------

describe("title_language — /Lang value shape (Matterhorn 11)", () => {
  it('half-credits a declaration that is not a usable code ("english") with a targeted fix', () => {
    const qpdf = makeQpdf({ hasLang: true, lang: "english", hasStructTree: true });
    const result = scoreDocument(qpdf, makePdfjs({ title: "T" }));
    const cat = findCategory(result, "title_language");
    // Title present but DisplayDocTitle unset → 35; language declared but
    // unusable → 25.
    expect(cat.score).toBe(60);
    expect(cat.findings.some((f) => f.includes("not a usable language code"))).toBe(true);
  });

  it('gives full language credit to a normal code ("en-US")', () => {
    const qpdf = makeQpdf({ hasLang: true, lang: "en-US", hasStructTree: true });
    const result = scoreDocument(qpdf, makePdfjs({ title: "T" }));
    expect(findCategory(result, "title_language").score).toBe(85);
  });

  it("never asserts a 3.1.1 conformance failure for an unusable value — a declaration exists", () => {
    const qpdf = makeQpdf({ hasLang: true, lang: "english", hasStructTree: true });
    const result = scoreDocument(qpdf, makePdfjs({ title: "T" }));
    expect(result.conformance.failures.some((f) => f.sc === "3.1.1")).toBe(false);
  });
});

describe("alt_text — formulas share the coverage (Matterhorn 17)", () => {
  it("scores formula coverage when the document has no figures at all", () => {
    const qpdf = makeQpdf({ hasStructTree: true, formulaCount: 2, formulasMissingAlt: 1 });
    const result = scoreDocument(qpdf, makePdfjs());
    const cat = findCategory(result, "alt_text");
    expect(cat.score).toBe(50);
    expect(cat.findings.some((f) => f.includes("Mathematical Formulas (Matterhorn 17)"))).toBe(
      true,
    );
  });

  it("a fully described formula document scores 100 and stays out of the gate", () => {
    const qpdf = makeQpdf({ hasStructTree: true, formulaCount: 2, formulasMissingAlt: 0 });
    const result = scoreDocument(qpdf, makePdfjs());
    expect(findCategory(result, "alt_text").score).toBe(100);
    expect(result.conformance.failures.some((f) => f.issue.includes("formula"))).toBe(false);
  });

  it("asserts a confirmed 1.1.1 failure for formulas with no text alternative", () => {
    const qpdf = makeQpdf({ hasStructTree: true, formulaCount: 1, formulasMissingAlt: 1 });
    const result = scoreDocument(qpdf, makePdfjs());
    const failure = result.conformance.failures.find(
      (f) => f.sc === "1.1.1" && f.issue.includes("formula"),
    );
    expect(failure).toBeTruthy();
    expect(failure!.category).toBe("alt_text");
  });

  it("figures and formulas pool into one coverage figure", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      images: [
        { ref: "10 0 R", hasAlt: true, altText: "chart" },
        { ref: "11 0 R", hasAlt: false },
      ],
      formulaCount: 2,
      formulasMissingAlt: 0,
    });
    const result = scoreDocument(qpdf, makePdfjs());
    // 3 of 4 described → floor(75)
    expect(findCategory(result, "alt_text").score).toBe(75);
  });

  it("keeps the no-images N/A when there are no formulas either", () => {
    const qpdf = makeQpdf({ hasStructTree: true });
    const result = scoreDocument(qpdf, makePdfjs());
    expect(findCategory(result, "alt_text").score).toBeNull();
  });
});

describe("supplementary advisories — notes, RoleMap validity, behaviors", () => {
  it("discloses missing/duplicate Note IDs as advisory, never as score", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      noteCount: 4,
      notesMissingId: 2,
      noteDuplicateIdCount: 1,
    });
    const result = scoreDocument(qpdf, makePdfjs());
    const reading = findCategory(result, "reading_order");
    const text = reading.findings.join("\n");
    expect(text).toContain("Footnotes & Endnotes");
    expect(text).toContain("19-003");
    expect(text).toContain("19-004");
    expect(text).toMatch(/Advisory — not scored/);
  });

  it("discloses circular, standard-remapped, and unmapped RoleMap entries", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      hasRoleMap: true,
      roleMapEntries: ["A → B"],
      roleMapCircularTags: ["A", "B"],
      roleMapStandardRemaps: ["P → Figure"],
      roleMapUnmappedTags: ["Weird"],
    });
    const result = scoreDocument(qpdf, makePdfjs());
    const text = findCategory(result, "reading_order").findings.join("\n");
    expect(text).toContain("02-003");
    expect(text).toContain("02-004");
    expect(text).toContain("02-001");
    expect(text).toContain("P → Figure");
    expect(text).toContain("Weird");
  });

  it("discloses JavaScript, multimedia, and layer behaviors — and 1.2.2 joins notAssessed for media", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      jsActionCount: 2,
      hasJsNameTree: true,
      mediaAnnotationCounts: { screen: 1, movie: 0, sound: 0, richMedia: 1 },
      hasOptionalContent: true,
      ocgConfigCount: 1,
      ocgConfigsMissingName: 1,
      ocgConfigsWithAS: 1,
    });
    const result = scoreDocument(qpdf, makePdfjs());
    const text = findCategory(result, "reading_order").findings.join("\n");
    expect(text).toContain("Document Behaviors");
    expect(text).toContain("JavaScript is present");
    expect(text).toContain("multimedia annotation");
    expect(text).toContain("20-001");
    expect(text).toContain("20-002");
    expect(result.conformance.notAssessed.some((n) => n.sc === "1.2.2")).toBe(true);
  });

  it("prints no behaviors block — and no 1.2.2 entry — when nothing is present", () => {
    const qpdf = makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      jsActionCount: 0,
      hasJsNameTree: false,
      mediaAnnotationCounts: { screen: 0, movie: 0, sound: 0, richMedia: 0 },
      hasOptionalContent: false,
    });
    const result = scoreDocument(qpdf, makePdfjs());
    const text = findCategory(result, "reading_order").findings.join("\n");
    expect(text).not.toContain("Document Behaviors");
    expect(result.conformance.notAssessed.some((n) => n.sc === "1.2.2")).toBe(false);
  });
});

describe("Adobe parity — scripts/multimedia/flicker are measured, not assumed", () => {
  const byId = (report: ReturnType<typeof buildAdobeParityReport>, id: string) => {
    const row = report.rules.find((r) => r.id === id);
    if (!row) throw new Error(`rule ${id} missing`);
    return row;
  };

  it("passes all three as MEASURED when the censuses report nothing", () => {
    const qpdf = makeQpdf({
      jsActionCount: 0,
      hasJsNameTree: false,
      mediaAnnotationCounts: { screen: 0, movie: 0, sound: 0, richMedia: 0 },
    });
    const report = buildAdobeParityReport(qpdf, makePdfjs());
    for (const id of ["scripts", "tagged_multimedia", "screen_flicker"]) {
      const row = byId(report, id);
      expect(row.status, id).toBe("passed");
      expect(row.vacuous, id).toBe(false);
    }
    expect(byId(report, "scripts").note).toMatch(/measured, not assumed/);
  });

  it("downgrades to not_computed — never failed — when JavaScript or media is present", () => {
    const qpdf = makeQpdf({
      jsActionCount: 3,
      hasJsNameTree: false,
      mediaAnnotationCounts: { screen: 1, movie: 0, sound: 0, richMedia: 0 },
    });
    const report = buildAdobeParityReport(qpdf, makePdfjs());
    expect(byId(report, "scripts").status).toBe("not_computed");
    expect(byId(report, "tagged_multimedia").status).toBe("not_computed");
    expect(byId(report, "screen_flicker").status).toBe("not_computed");
  });

  it("keeps the legacy vacuous wording for fixtures that omit the censuses entirely", () => {
    const report = buildAdobeParityReport(makeQpdf(), makePdfjs());
    expect(byId(report, "scripts").vacuous).toBe(true);
    expect(byId(report, "scripts").note).toMatch(/predates the script census/);
  });
});

// ---------------------------------------------------------------------------
// v1.94.0 — annotation/OBJR, reference-XObject, attachment, and signature
// censuses, plus their scoring/gate/parity consumers and the pdfjs text
// censuses' scoring thresholds.
// ---------------------------------------------------------------------------

describe("qpdfService — OBJR-based annotation censuses (Matterhorn 28, v1.94.0)", () => {
  const withStructTree = {
    "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
    "2 0 R": { "/Type": "/StructTreeRoot", "/K": "3 0 R" },
    "3 0 R": {
      "/Type": "/StructElem",
      "/S": "/Form",
      "/P": "2 0 R",
      "/K": [{ "/Type": "/OBJR", "/Obj": "10 0 R" }],
    },
  };

  it("counts widgets and knows which ones the tag tree references via OBJR", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          ...withStructTree,
          "10 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "u:name", "/TU": "u:Name" },
          "11 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "u:email", "/TU": "u:Email" },
        },
      ],
    });
    expect(result.widgetAnnotationCount).toBe(2);
    expect(result.untaggedWidgetAnnotationCount).toBe(1); // 11 0 R has no OBJR
  });

  it("excludes Hidden/NoView widgets from the census (PDF/UA 7.18.1)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "10 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "u:calc", "/F": 2 },
        },
      ],
    });
    expect(result.widgetAnnotationCount).toBe(0);
    expect(result.untaggedWidgetAnnotationCount).toBe(0);
  });

  it("censuses other annotations (subtype counts, OBJR tagging, /Contents) and skips Popups", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          ...withStructTree,
          "10 0 R": {
            "/Type": "/Annot",
            "/Subtype": "/Highlight",
            "/Contents": "u:Key sentence",
          },
          "11 0 R": { "/Type": "/Annot", "/Subtype": "/Highlight" },
          "12 0 R": { "/Type": "/Annot", "/Subtype": "/FileAttachment" },
          "13 0 R": { "/Type": "/Annot", "/Subtype": "/Popup" },
          "14 0 R": { "/Type": "/Annot", "/Subtype": "/Stamp", "/F": 2 }, // hidden
        },
      ],
    });
    expect(result.otherAnnotationCount).toBe(3);
    expect(result.otherAnnotationSubtypeCounts).toEqual({ Highlight: 2, FileAttachment: 1 });
    expect(result.untaggedOtherAnnotationCount).toBe(2); // 11, 12 — 10 is OBJR-referenced
    expect(result.otherAnnotationsMissingContents).toBe(2);
  });

  it("counts reference XObjects (30-001), EMBEDDED-attachment /Desc gaps (21), and signature fields (23)", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "10 0 R": { "/Subtype": "/Form", "/Ref": { "/F": "u:other.pdf" } },
          "11 0 R": {
            "/Type": "/Filespec",
            "/F": "u:data.csv",
            "/EF": { "/F": "20 0 R" },
            "/Desc": "u:Raw data",
          },
          "12 0 R": { "/Type": "/Filespec", "/F": "u:notes.txt", "/EF": { "/F": "21 0 R" } },
          "13 0 R": { "/FT": "/Sig", "/T": "u:Signature1" },
          // RB-review F6: a Filespec WITHOUT /EF is an EXTERNAL reference (a
          // /GoToR target), not an attachment — it must not be counted, or
          // the report sends users to an empty Attachments panel.
          "14 0 R": { "/Type": "/Filespec", "/F": "u:remote-target.pdf" },
        },
      ],
    });
    expect(result.refXObjectCount).toBe(1);
    expect(result.embeddedFileCount).toBe(2);
    expect(result.embeddedFilesMissingDesc).toBe(1);
    expect(result.signatureFieldCount).toBe(1);
  });

  it("RB-review F9: print-production annotations (PrinterMark/TrapNet/Watermark) are never censused", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "10 0 R": { "/Type": "/Annot", "/Subtype": "/PrinterMark" },
          "11 0 R": { "/Type": "/Annot", "/Subtype": "/TrapNet" },
          "12 0 R": { "/Type": "/Annot", "/Subtype": "/Watermark" },
        },
      ],
    });
    expect(result.otherAnnotationCount).toBe(0);
    expect(result.untaggedOtherAnnotationCount).toBe(0);
  });

  it("RB-review F1: OBJRs are collected in every serialization — indirect OBJR object, /K → indirect kids array, and inline struct-elem kids", () => {
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/Type": "/Catalog", "/StructTreeRoot": "2 0 R" },
          "2 0 R": { "/Type": "/StructTreeRoot", "/K": "3 0 R" },
          // /K points at an INDIRECT ARRAY object (4 0 R) …
          "3 0 R": { "/Type": "/StructElem", "/S": "/Form", "/P": "2 0 R", "/K": "4 0 R" },
          // … which mixes an INDIRECT OBJR (5 0 R) and an INLINE struct-elem
          // kid whose own /K holds an inline OBJR.
          "4 0 R": ["5 0 R", { "/S": "/Form", "/K": [{ "/Type": "/OBJR", "/Obj": "11 0 R" }] }],
          "5 0 R": { "/Type": "/OBJR", "/Obj": "10 0 R" },
          "10 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "u:a", "/TU": "u:A" },
          "11 0 R": { "/Type": "/Annot", "/Subtype": "/Widget", "/T": "u:b", "/TU": "u:B" },
        },
      ],
    });
    expect(result.widgetAnnotationCount).toBe(2);
    // Both widgets are claimed by the tree despite the exotic serializations
    // — before F1 this read as "every widget untagged" and asserted a FALSE
    // confirmed 1.3.1 on a correctly tagged form.
    expect(result.untaggedWidgetAnnotationCount).toBe(0);
  });
});

describe("scoring + gate — untagged widgets (v1.94.0)", () => {
  const taggedDoc = (over: Partial<QpdfResult> = {}) =>
    makeQpdf({
      hasStructTree: true,
      structTreeDepth: 3,
      // Real content: an all-empty tree beside extractable text is the
      // content-free case, which deliberately suppresses the widget census
      // (the document-level 1.3.1 already covers it).
      paragraphCount: 5,
      hasAcroForm: true,
      formFields: [
        { ref: "10 0 R", hasTU: true, name: "a" },
        { ref: "11 0 R", hasTU: true, name: "b" },
      ],
      widgetAnnotationCount: 2,
      untaggedWidgetAnnotationCount: 1,
      ...over,
    });

  it("caps form_accessibility and asserts a confirmed 1.3.1 failure for untagged widgets", () => {
    const result = scoreDocument(taggedDoc(), makePdfjs());
    const cat = findCategory(result, "form_accessibility");
    expect(cat.score).toBeLessThanOrEqual(60);
    expect(cat.findings.some((f) => f.includes("not referenced from the tag structure"))).toBe(
      true,
    );
    const failure = result.conformance.failures.find(
      (f) => f.sc === "1.3.1" && f.category === "form_accessibility",
    );
    expect(failure).toBeTruthy();
  });

  it("drops to 30 when EVERY widget is untagged, and never fires without a struct tree", () => {
    const allUntagged = scoreDocument(taggedDoc({ untaggedWidgetAnnotationCount: 2 }), makePdfjs());
    expect(findCategory(allUntagged, "form_accessibility").score).toBeLessThanOrEqual(30);

    const untaggedDocResult = scoreDocument(
      taggedDoc({ hasStructTree: false, structTreeDepth: 0 }),
      makePdfjs(),
    );
    // No struct tree → the document-level 1.3.1 already covers it; the
    // widget-specific failure must not double-fire.
    expect(
      untaggedDocResult.conformance.failures.some(
        (f) => f.sc === "1.3.1" && f.category === "form_accessibility",
      ),
    ).toBe(false);
  });

  it("RB-review F3: widgets without an /AcroForm never fire the gate (the category is N/A there)", () => {
    const result = scoreDocument(taggedDoc({ hasAcroForm: false, formFields: [] }), makePdfjs());
    expect(
      result.conformance.failures.some(
        (f) => f.sc === "1.3.1" && f.category === "form_accessibility",
      ),
    ).toBe(false);
    expect(findCategory(result, "form_accessibility").score).toBeNull();
  });

  it("leaves pre-census stored reports alone (no census fields → TU-only scoring)", () => {
    const result = scoreDocument(
      makeQpdf({
        hasStructTree: true,
        structTreeDepth: 3,
        hasAcroForm: true,
        formFields: [{ ref: "10 0 R", hasTU: true, name: "a" }],
      }),
      makePdfjs(),
    );
    expect(findCategory(result, "form_accessibility").score).toBe(100);
  });
});

describe("scoring — pdfjs text censuses (Matterhorn 10 + 01, v1.94.0)", () => {
  it("caps text_extractability at 50 when a heavy share of text is unmapped", () => {
    const result = scoreDocument(
      makeQpdf({ hasStructTree: true, structTreeDepth: 3, paragraphCount: 5 }),
      makePdfjs({ unmappedTextCharCount: 300, textLength: 1000 }),
    );
    const cat = findCategory(result, "text_extractability");
    expect(cat.score).toBeLessThanOrEqual(50);
    expect(cat.findings.some((f) => f.includes("cannot be mapped to readable text"))).toBe(true);
  });

  it("treats a tiny unmapped count as advisory only (symbol-font bullets)", () => {
    const result = scoreDocument(
      makeQpdf({ hasStructTree: true, structTreeDepth: 3, paragraphCount: 5 }),
      makePdfjs({ unmappedTextCharCount: 4, textLength: 5000 }),
    );
    const cat = findCategory(result, "text_extractability");
    expect(cat.score).toBe(100);
    expect(cat.findings.some((f) => f.includes("Advisory — not scored"))).toBe(true);
  });

  it("caps text_extractability when a heavy share of visible text sits outside tagged content", () => {
    const result = scoreDocument(
      makeQpdf({ hasStructTree: true, structTreeDepth: 3, paragraphCount: 5 }),
      makePdfjs({
        taggedVisibleChars: 500,
        untaggedVisibleChars: 500,
        untaggedTextPages: [2, 3],
      }),
    );
    const cat = findCategory(result, "text_extractability");
    expect(cat.score).toBeLessThanOrEqual(50);
    expect(cat.findings.some((f) => f.includes("outside the tagged content"))).toBe(true);
    expect(cat.findings.some((f) => f.includes("pages 2, 3"))).toBe(true);
  });

  it("stays quiet when every visible character is tagged", () => {
    const result = scoreDocument(
      makeQpdf({ hasStructTree: true, structTreeDepth: 3, paragraphCount: 5 }),
      makePdfjs({ taggedVisibleChars: 900, untaggedVisibleChars: 0 }),
    );
    const cat = findCategory(result, "text_extractability");
    expect(cat.score).toBe(100);
    expect(cat.findings.some((f) => f.includes("outside the tagged content"))).toBe(false);
  });
});

describe("Adobe parity — annotations and form fields are computable (v1.94.0)", () => {
  const byId = (report: ReturnType<typeof buildAdobeParityReport>, id: string) => {
    const row = report.rules.find((r) => r.id === id);
    if (!row) throw new Error(`rule ${id} missing`);
    return row;
  };

  it("tagged_form_fields passes as measured when every widget is OBJR-referenced, fails otherwise", () => {
    const base = {
      hasStructTree: true,
      hasAcroForm: true,
      formFields: [{ ref: "10 0 R", hasTU: true, name: "a" }],
      widgetAnnotationCount: 1,
    };
    const clean = buildAdobeParityReport(
      makeQpdf({ ...base, untaggedWidgetAnnotationCount: 0 }),
      makePdfjs(),
    );
    expect(byId(clean, "tagged_form_fields").status).toBe("passed");
    const dirty = buildAdobeParityReport(
      makeQpdf({ ...base, untaggedWidgetAnnotationCount: 1 }),
      makePdfjs(),
    );
    expect(byId(dirty, "tagged_form_fields").status).toBe("failed");
  });

  it("tagged_annotations aggregates links + widgets + other annotations when the censuses exist", () => {
    const report = buildAdobeParityReport(
      makeQpdf({
        hasStructTree: true,
        widgetAnnotationCount: 1,
        untaggedWidgetAnnotationCount: 1,
        otherAnnotationCount: 2,
        untaggedOtherAnnotationCount: 0,
      }),
      makePdfjs({ linkAnnotationCount: 3, untaggedLinkAnnotationCount: 0 }),
    );
    const row = byId(report, "tagged_annotations");
    expect(row.status).toBe("failed");
    expect(row.note).toContain("1 form widget(s)");
    expect(row.note).not.toContain("Only link annotations");
  });
});

// ---------------------------------------------------------------------------
// v1.94.0 red/blue hardening (RB-1 / RB-3): hostile inputs must be BOUNDED,
// never a hang or a memory amplifier in the main Express process.
// ---------------------------------------------------------------------------

describe("red/blue — hostile RoleMap and Note inputs are bounded", () => {
  it("RB-1: a 10,000-entry single-chain RoleMap parses quickly instead of going quadratic", () => {
    const chain: Record<string, string> = {};
    for (let i = 0; i < 10_000; i++) chain[`/T${i}`] = `/T${i + 1}`;
    const objects: Record<string, unknown> = {
      "1 0 R": { "/Type": "/Catalog", "/RoleMap": chain },
      "2 0 R": { "/S": "/T0", "/K": 0 },
    };
    const started = Date.now();
    const result = parseJson({ qpdf: [null, objects] });
    const elapsed = Date.now() - started;
    expect(result.error).toBeNull();
    // Un-capped, this walk was O(entries × chain) ≈ 10^8+ steps. The hop cap
    // makes it linear-ish; 3s is a generous CI bound for what should be ms.
    expect(elapsed).toBeLessThan(3000);
    // The chain exceeds the hop cap, so the element resolves to a
    // non-standard name — which the validity census then reports.
    expect(result.roleMapUnmappedTags!.length).toBeGreaterThan(0);
    // Census lists stay capped for the report payload.
    expect(result.roleMapCircularTags!.length).toBeLessThanOrEqual(24);
    expect(result.roleMapStandardRemaps!.length).toBeLessThanOrEqual(24);
  });

  it("RB-3: multi-megabyte /ID strings still dedup (256-char prefix) without being held whole", () => {
    const bigId = "u:" + "x".repeat(1_000_000);
    const result = parseJson({
      qpdf: [
        null,
        {
          "1 0 R": { "/S": "/Note", "/ID": bigId },
          "2 0 R": { "/S": "/Note", "/ID": bigId },
        },
      ],
    });
    expect(result.noteCount).toBe(2);
    expect(result.noteDuplicateIdCount).toBe(1);
  });
});
