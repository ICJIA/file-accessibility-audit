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
