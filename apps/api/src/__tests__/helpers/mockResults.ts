/**
 * Minimal-but-complete analyzer results for scorer-level tests. Mirrors the
 * private helpers at the top of scorer.test.ts so newer test files can build
 * the same fixtures without copying sixty lines each.
 */
import type { QpdfResult, TableAnalysis } from "../../services/qpdfService.js";
import type { PdfjsResult } from "../../services/pdfjsService.js";

export function makeQpdf(overrides: Partial<QpdfResult> = {}): QpdfResult {
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

export function makeTable(overrides: Partial<TableAnalysis> = {}): TableAnalysis {
  return {
    hasHeaders: false,
    headerCount: 0,
    dataCellCount: 0,
    hasScope: false,
    scopeMissingCount: 0,
    hasRowStructure: false,
    rowCount: 0,
    hasNestedTable: false,
    hasCaption: false,
    hasConsistentColumns: null,
    columnCounts: [],
    hasHeaderAssociation: false,
    simpleHeaderLayout: false,
    ...overrides,
  };
}

export function makePdfjs(overrides: Partial<PdfjsResult> = {}): PdfjsResult {
  return {
    pageCount: 1,
    hasText: false,
    textLength: 0,
    title: null,
    author: null,
    subject: null,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    links: [],
    imageCount: 0,
    emptyPages: [],
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
    contentStreamMcidsByPage: {},
    ...overrides,
  };
}

/** A tagged, titled, language-declared document with real text — the
 *  baseline every "one specific defect" test starts from. */
export function taggedBaseline(): { qpdf: QpdfResult; pdfjs: PdfjsResult } {
  return {
    qpdf: makeQpdf({
      hasStructTree: true,
      hasLang: true,
      lang: "en-US",
      structTreeDepth: 4,
      paragraphCount: 12,
      totalPageCount: 2,
      tabOrderPages: 2,
      contentOrder: [0, 1, 2, 3],
    }),
    pdfjs: makePdfjs({
      pageCount: 2,
      hasText: true,
      textLength: 4000,
      title: "Quarterly Report",
      lang: "en-US",
    }),
  };
}
