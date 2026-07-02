import {
  SCORING_PROFILES,
  SCORING_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  ANALYSIS,
  WCAG_CATEGORY_MAP,
  WCAG,
  DOCX,
} from "#config";
import type { QpdfResult } from "./qpdfService.js";
import type { PdfjsResult } from "./pdfjsService.js";
import type { DocxAnalysis } from "./docxService.js";
import { appendSupplementaryFindings } from "./scoring/supplementary.js";
import { generateSummary } from "./scoring/summary.js";
import {
  buildAdobeParityReport,
  type AdobeParityResult,
} from "./scoring/adobeParity.js";
import {
  evaluateConformance,
  evaluateDocxConformance,
  type ConformanceVerdict,
} from "./scoring/conformance.js";
import { computeReadingOrderFidelity } from "./scoring/readingOrderFidelity.js";
// Report-payload types live in packages/shared so the web app can type API
// responses with the real shapes. Re-exported here so the CLI's and the API's
// existing `from "./scorer.js"` type imports keep working unchanged.
import type {
  CategoryResult,
  HelpLink,
  WcagCriterion,
  ScoreProfileResult,
  ScoringMode,
} from "@file-audit/shared";
export type {
  CategoryResult,
  HelpLink,
  WcagCriterion,
  ScoreProfileResult,
  ScoringMode,
};

// Machine-checkable PDF/UA-1 (ISO 14289-1) signals, summarized for the report's
// "Conformance signals" panel. These are SIGNALS, not a conformance verdict —
// a full PDF/UA-1 validation (the Matterhorn Protocol's failure conditions,
// many requiring human judgment) needs PAC or veraPDF. Sourced from pdfjs (XMP
// + content stream) and qpdf (structure tree, MarkInfo, fonts).
export interface PdfUaSignals {
  /** A PDF/UA identifier (pdfuaid:part) is declared in the XMP metadata. */
  hasIdentifier: boolean;
  /** The declared part number, e.g. "1" for PDF/UA-1. */
  part: string | null;
  /** Document has a logical structure tree (StructTreeRoot). */
  isTagged: boolean;
  /** MarkInfo /Marked true — real content is distinguished from artifacts. */
  isMarkedContent: boolean;
  /** Count of /Artifact marked-content runs (headers, footers, page numbers). */
  artifactRunCount: number;
  /** Depth of the structure tree (flat ≈ 1; richly nested ≥ 3). */
  structTreeDepth: number;
  fontCount: number;
  embeddedFontCount: number;
  /** All fonts are embedded (vacuously true when the document has no fonts). */
  allFontsEmbedded: boolean;
  /** A default document language is declared. */
  hasLanguage: boolean;
  /** A document title is present in the metadata. */
  hasTitle: boolean;
}

export interface ScoringResult {
  overallScore: number;
  grade: string;
  isScanned: boolean;
  executiveSummary: string;
  categories: CategoryResult[];
  warnings: string[];
  scoringMode: ScoringMode;
  scoreProfiles: Record<ScoringMode, ScoreProfileResult>;
  // Adobe Acrobat's built-in Accessibility Checker runs 32 binary rules, most
  // of which pass vacuously on documents with sparse structure. This field
  // mirrors that 32-rule output alongside our verdict so users can reconcile
  // the divergence. NOT an aggregated "Adobe score" — qualitative only.
  // PDF-only: Adobe Acrobat parity report. Optional — omitted for .docx.
  adobeParity?: AdobeParityResult;
  // Binary WCAG 2.1 conformance verdict, computed independently of the
  // weighted score. The score is a prioritised-readiness metric with partial
  // credit; this is the honest pass/fail answer. See conformance.ts.
  conformance: ConformanceVerdict;
  // PDF-only: machine-checkable PDF/UA-1 signals, surfaced as a "conformance
  // signals" panel. Optional — omitted for .docx (no PDF/UA concept applies).
  pdfUa?: PdfUaSignals;
}

// W3C "Understanding" URL for the ACTIVE WCAG version (2.2 by default,
// 2.1 via WCAG_VERSION) — help links must match the version the conformance
// gate audits against, not a hardcoded 2.1.
function wcagUnderstandingUrl(slug: string): string {
  return `${WCAG.UNDERSTANDING_BASE[WCAG.VERSION]}${slug}.html`;
}

function getGrade(score: number): string {
  for (const t of GRADE_THRESHOLDS) {
    if (score >= t.min) return t.grade;
  }
  return "F";
}

function getSeverity(score: number | null): string | null {
  if (score === null) return null;
  for (const t of SEVERITY_THRESHOLDS) {
    if (score >= t.min) return t.severity;
  }
  return "Critical";
}

export function scoreDocument(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
): ScoringResult {
  const warnings: string[] = [];

  if (qpdf.error || pdfjs.error) {
    warnings.push(
      "Some accessibility checks could not be completed. The results below reflect only the checks that succeeded.",
    );
  }

  const isScanned = !pdfjs.error && !pdfjs.hasText && !qpdf.hasStructTree;

  const strictCategories = buildCategories(qpdf, pdfjs, "strict");
  const conformance = evaluateConformance(qpdf, pdfjs, strictCategories);
  const strictAggregate = aggregateScore(
    strictCategories,
    isScanned,
    "strict",
    conformance,
  );

  // As of v1.21.0 only the Strict (WCAG + IITAA §E205.4) profile is
  // surfaced to users. The previous Practical / PDF-UA flavored profile
  // was retired — PDF/UA conformance is now surfaced more authoritatively
  // by the optional veraPDF check on the remediation result page.
  //
  // We still emit `scoreProfiles.remediation` as a structural alias of
  // `scoreProfiles.strict` so historical consumers (shared-report JSON
  // payloads, downstream tooling) keep round-tripping cleanly. The alias
  // will be dropped in a future release once consumers have migrated.
  const adobeParity = buildAdobeParityReport(qpdf, pdfjs);
  const pdfUa = computePdfUaSignals(qpdf, pdfjs);

  return {
    overallScore: strictAggregate.overallScore,
    grade: strictAggregate.grade,
    isScanned,
    executiveSummary: strictAggregate.executiveSummary,
    categories: strictCategories,
    warnings,
    scoringMode: "strict",
    scoreProfiles: {
      strict: strictAggregate.profile,
      remediation: strictAggregate.profile,
    },
    adobeParity,
    conformance,
    pdfUa,
  };
}

// ===========================================================================
// DOCX (WORD) SCORING
// ===========================================================================
// Maps a DocxAnalysis onto the same CategoryResult model the PDF pipeline uses,
// then reuses the shared aggregateScore / generateSummary / applyWcagCriteria
// helpers and the DOCX conformance gate. The PDF path above is untouched.

const DOCX_HELP = {
  overview: {
    label: "Microsoft: Make your Word documents accessible",
    url: "https://support.microsoft.com/en-us/office/make-your-word-documents-accessible-to-people-with-disabilities-d9bf3683-87ac-47ea-b91a-78dcacb3c66d",
  },
  webaim: {
    label: "WebAIM: Microsoft Word Accessibility",
    url: "https://webaim.org/techniques/word/",
  },
  headings: {
    label: "Microsoft: Improve accessibility with heading styles",
    url: "https://support.microsoft.com/en-us/office/video-improve-accessibility-with-heading-styles-68f1eeff-6113-410f-8313-b5d382cc3be1",
  },
  altText: {
    label: "Microsoft: Add alt text to images",
    url: "https://support.microsoft.com/en-us/office/add-alternative-text-to-a-shape-picture-chart-smartart-graphic-or-other-object-44989b2a-903c-4d9a-b742-6a75b451c669",
  },
  tables: {
    label: "Microsoft: Create accessible tables in Word",
    url: "https://support.microsoft.com/en-us/office/video-create-accessible-tables-in-word-cb464015-59dc-46a0-ac01-6217c62210e5",
  },
  links: {
    label: "Microsoft: Create accessible links",
    url: "https://support.microsoft.com/en-us/office/create-accessible-links-in-word-28305cc8-3be2-417c-a313-dc22082d1ee0",
  },
  contrast: {
    label: "WebAIM: Contrast Checker",
    url: "https://webaim.org/resources/contrastchecker/",
  },
} as const;

function docxCategory(
  id: string,
  label: string,
  weight: number,
  score: number | null,
  findings: string[],
  explanation: string,
  helpLinks: HelpLink[],
  notAssessed = false,
): CategoryResult {
  return {
    id,
    label,
    weight,
    score,
    grade: score === null ? null : getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation,
    helpLinks,
    notAssessed,
  };
}

const clamp100 = (n: number): number =>
  Math.max(0, Math.min(100, Math.round(n)));

function scoreDocxText(): CategoryResult {
  return docxCategory(
    "text_extractability",
    "Text Extractability",
    DOCX.SCORING_WEIGHTS.text_extractability,
    100,
    [
      "Word documents contain fully extractable, selectable text — unlike a scanned PDF, the content is always available to assistive technology.",
    ],
    "Word stores real text (never a flat image), so screen readers can always read the words. This foundational check therefore passes automatically for .docx; the remaining categories assess how well that text is structured.",
    [DOCX_HELP.overview, DOCX_HELP.webaim],
  );
}

function scoreDocxTitleLanguage(a: DocxAnalysis): CategoryResult {
  let score = 0;
  const findings: string[] = [];
  if (a.metadata.title) {
    score += 50;
    findings.push(`Document title: "${a.metadata.title}"`);
  } else {
    findings.push(
      "No document title is set. In Word: File → Info → Properties → Title. Screen readers announce the title (or the filename if none) when the document opens.",
    );
  }
  if (a.metadata.language) {
    score += 50;
    findings.push(`Document language: ${a.metadata.language}`);
  } else {
    findings.push(
      "No document language is declared. In Word: Review → Language → Set Proofing Language. This tells screen readers which pronunciation rules to use.",
    );
  }
  return docxCategory(
    "title_language",
    "Title & Language",
    DOCX.SCORING_WEIGHTS.title_language,
    score,
    findings,
    "A meaningful document title and a declared language are announced by screen readers when the document opens. Both come from the Word document's properties.",
    [DOCX_HELP.overview],
  );
}

function scoreDocxHeadings(a: DocxAnalysis): CategoryResult {
  const total = a.headings.length;
  const fakes = a.fakeHeadings.length;
  if (total === 0 && fakes === 0) {
    return docxCategory(
      "heading_structure",
      "Heading Structure",
      DOCX.SCORING_WEIGHTS.heading_structure,
      null,
      [
        "No headings were found. Short documents may not need them; longer documents should use Heading styles so readers can navigate.",
      ],
      "Heading styles (Heading 1–6) create the navigable outline screen-reader users rely on. This document has none to assess.",
      [DOCX_HELP.headings],
      false,
    );
  }
  let score = 100;
  const findings: string[] = [];
  if (total > 0) {
    findings.push(`${total} real heading(s) found.`);
    if (a.headings[0].level !== 1) {
      score -= 15;
      findings.push(
        `The first heading is Heading ${a.headings[0].level}, not Heading 1. Start the outline at Heading 1.`,
      );
    }
    let skips = 0;
    for (let i = 1; i < total; i++) {
      if (a.headings[i].level - a.headings[i - 1].level > 1) skips++;
    }
    if (skips > 0) {
      score -= skips * 15;
      findings.push(
        `${skips} place(s) skip a heading level (e.g. Heading 1 → Heading 3). Don't skip levels — screen-reader users infer structure from them.`,
      );
    }
  }
  if (fakes > 0) {
    score -= total === 0 ? 70 : Math.min(40, fakes * 15);
    findings.push(
      `${fakes} paragraph(s) are formatted to look like headings (bold/large text) but are not real Heading styles. Apply Heading 1–6 so assistive technology can navigate them.`,
    );
  }
  return docxCategory(
    "heading_structure",
    "Heading Structure",
    DOCX.SCORING_WEIGHTS.heading_structure,
    clamp100(score),
    findings,
    "Real Heading styles (not just bold, larger text) give screen-reader users a navigable outline and convey document structure. Visually-styled 'fake' headings are invisible to assistive technology.",
    [DOCX_HELP.headings, DOCX_HELP.webaim],
  );
}

function scoreDocxAltText(a: DocxAnalysis): CategoryResult {
  const nonDecorative = a.images.filter((i) => !i.decorative);
  if (nonDecorative.length === 0) {
    return docxCategory(
      "alt_text",
      "Alt Text on Images",
      DOCX.SCORING_WEIGHTS.alt_text,
      null,
      [
        a.images.length > 0
          ? "All images are marked decorative, so none require alt text."
          : "No images were found.",
      ],
      "Every meaningful image needs alternative text describing it for screen-reader users. Decorative images should be marked decorative instead.",
      [DOCX_HELP.altText],
      false,
    );
  }
  const withAlt = nonDecorative.filter(
    (i) => i.altText && i.altText.trim().length > 0,
  ).length;
  let score = Math.round((withAlt / nonDecorative.length) * 100);
  const findings = [
    `${withAlt} of ${nonDecorative.length} meaningful image(s) have alt text.`,
  ];
  if (withAlt < nonDecorative.length) {
    score = Math.min(score, 85);
    findings.push(
      `${nonDecorative.length - withAlt} image(s) are missing alt text. In Word, right-click each image → View Alt Text and add a description.`,
    );
  }
  return docxCategory(
    "alt_text",
    "Alt Text on Images",
    DOCX.SCORING_WEIGHTS.alt_text,
    clamp100(score),
    findings,
    "Screen readers announce an image's alt text in place of the image. Without it, the image's information is lost.",
    [DOCX_HELP.altText, DOCX_HELP.webaim],
  );
}

function scoreDocxTables(a: DocxAnalysis): CategoryResult {
  if (a.tables.length === 0) {
    return docxCategory(
      "table_markup",
      "Table Markup",
      DOCX.SCORING_WEIGHTS.table_markup,
      null,
      ["No tables were found."],
      "Data tables need a marked header row so screen readers can associate each cell with its column/row header.",
      [DOCX_HELP.tables],
      false,
    );
  }
  const perTable = a.tables.map((t) => {
    const isData = t.rowCount >= 2 && t.colCount >= 2;
    let s = !isData ? 100 : t.hasHeaderRow ? 100 : 30;
    if (t.hasNestedTable) s = Math.min(s, 60);
    return s;
  });
  const score = Math.round(
    perTable.reduce((x, y) => x + y, 0) / perTable.length,
  );
  const noHeader = a.tables.filter(
    (t) => !t.hasHeaderRow && t.rowCount >= 2 && t.colCount >= 2,
  ).length;
  const findings = [`${a.tables.length} table(s) found.`];
  if (noHeader > 0) {
    findings.push(
      `${noHeader} data table(s) have no header row. In Word: select the top row → Table Layout → Repeat Header Rows.`,
    );
  }
  if (a.tables.some((t) => t.hasNestedTable)) {
    findings.push(
      "Nested tables were found — these are hard for screen readers to navigate. Flatten them where possible.",
    );
  }
  return docxCategory(
    "table_markup",
    "Table Markup",
    DOCX.SCORING_WEIGHTS.table_markup,
    clamp100(score),
    findings,
    "A designated header row lets screen readers announce the relevant header as a user moves across a data table's cells.",
    [DOCX_HELP.tables],
  );
}

const RAW_URL_RE = /^\s*(https?:\/\/|www\.)/i;
const VAGUE_LINK_RE =
  /^\s*(click here|here|read more|more|link|this|this link|learn more)\s*$/i;

function scoreDocxLinks(a: DocxAnalysis): CategoryResult {
  if (a.links.length === 0) {
    return docxCategory(
      "link_quality",
      "Link Quality",
      DOCX.SCORING_WEIGHTS.link_quality,
      null,
      ["No hyperlinks were found."],
      "Link text should describe the destination. Raw URLs and vague phrases like 'click here' are unhelpful out of context.",
      [DOCX_HELP.links],
      false,
    );
  }
  const bad = a.links.filter(
    (l) => RAW_URL_RE.test(l.text) || VAGUE_LINK_RE.test(l.text.trim()),
  );
  let score = Math.round(
    ((a.links.length - bad.length) / a.links.length) * 100,
  );
  const findings = [
    `${a.links.length} link(s) found; ${bad.length} with unclear text.`,
  ];
  if (bad.length > 0) {
    score = Math.min(score, 85);
    findings.push(
      `Vague or raw-URL link text: ${bad
        .slice(0, 5)
        .map((l) => `"${l.text}"`)
        .join(", ")}. Use descriptive link text that makes sense on its own.`,
    );
  }
  return docxCategory(
    "link_quality",
    "Link Quality",
    DOCX.SCORING_WEIGHTS.link_quality,
    clamp100(score),
    findings,
    "Screen-reader users often navigate by pulling up a list of links out of context, so each link's text must describe where it goes.",
    [DOCX_HELP.links],
  );
}

function scoreDocxContrast(a: DocxAnalysis): CategoryResult {
  const { checkedRuns, unresolvedRuns, failing } = a.contrast;
  if (checkedRuns === 0) {
    return docxCategory(
      "color_contrast",
      "Color Contrast",
      DOCX.SCORING_WEIGHTS.color_contrast,
      null,
      [
        unresolvedRuns > 0
          ? `${unresolvedRuns} text run(s) inherit their color from styles/theme; those colors are not resolved in this version, so contrast could not be evaluated automatically — review manually.`
          : "No explicitly-colored text was found to evaluate.",
      ],
      "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). Word stores explicit colors, so this is checked directly where colors are set.",
      [DOCX_HELP.contrast],
      unresolvedRuns > 0,
    );
  }
  let score = Math.round(((checkedRuns - failing.length) / checkedRuns) * 100);
  const findings = [
    `${checkedRuns} colored text run(s) checked; ${failing.length} below the WCAG minimum.`,
  ];
  if (unresolvedRuns > 0) {
    findings.push(
      `${unresolvedRuns} additional run(s) use inherited/theme colors that couldn't be resolved — review those manually.`,
    );
  }
  if (failing.length > 0) {
    score = Math.min(score, 85);
    const worst = failing.reduce((x, y) => (x.ratio < y.ratio ? x : y));
    findings.push(
      `Lowest contrast ${worst.ratio}:1 (${worst.foreground} on ${worst.background}). Needs ≥4.5:1 (≥3:1 for large text).`,
    );
  }
  return docxCategory(
    "color_contrast",
    "Color Contrast",
    DOCX.SCORING_WEIGHTS.color_contrast,
    clamp100(score),
    findings,
    "Low-contrast text is hard to read for low-vision users. Word stores explicit and theme colors, so contrast is machine-checkable for .docx (unlike PDF).",
    [DOCX_HELP.contrast],
  );
}

function scoreDocxLists(a: DocxAnalysis): CategoryResult {
  const { realListItems, manualBulletParagraphs } = a.lists;
  const total = realListItems + manualBulletParagraphs;
  if (total === 0) {
    return docxCategory(
      "list_structure",
      "List Structure",
      DOCX.SCORING_WEIGHTS.list_structure,
      null,
      ["No lists were found."],
      "Real list formatting (the Bullets/Numbering buttons) lets screen readers announce list structure and item counts. Manually-typed bullets do not.",
      [DOCX_HELP.overview],
      false,
    );
  }
  let score = Math.round((realListItems / total) * 100);
  const findings = [
    `${realListItems} real list item(s); ${manualBulletParagraphs} manually-typed bullet/number paragraph(s).`,
  ];
  if (manualBulletParagraphs > 0) {
    score = Math.min(score, 85);
    findings.push(
      `${manualBulletParagraphs} paragraph(s) use typed bullets or numbers instead of Word's list formatting. Use the Bullets/Numbering buttons so the list is announced as a list.`,
    );
  }
  return docxCategory(
    "list_structure",
    "List Structure",
    DOCX.SCORING_WEIGHTS.list_structure,
    clamp100(score),
    findings,
    "Screen readers announce 'list, N items' and each item's position only for real Word lists — not for hand-typed bullet characters.",
    [DOCX_HELP.overview],
  );
}

function scoreDocxReadingOrder(): CategoryResult {
  return docxCategory(
    "reading_order",
    "Reading Order",
    0,
    null,
    [
      "Word's linear document flow generally preserves reading order. Floating objects, text boxes, and wrapped images are not automatically verified — review those manually.",
    ],
    "Reading order determines the sequence assistive technology reads content. Word's linear flow usually preserves it; this tool does not automatically assess floating/anchored objects.",
    [DOCX_HELP.overview],
    true,
  );
}

function scoreDocxForms(): CategoryResult {
  return docxCategory(
    "form_accessibility",
    "Form Accessibility",
    0,
    null,
    [
      "Interactive form controls are uncommon in Word documents and are not automatically assessed in this version.",
    ],
    "Interactive form fields need accessible labels. They are rare in Word documents and are not assessed automatically here.",
    [DOCX_HELP.overview],
    true,
  );
}

function buildDocxCategories(a: DocxAnalysis): CategoryResult[] {
  const categories = [
    scoreDocxText(),
    scoreDocxTitleLanguage(a),
    scoreDocxHeadings(a),
    scoreDocxAltText(a),
    scoreDocxTables(a),
    scoreDocxContrast(a),
    scoreDocxLists(a),
    scoreDocxLinks(a),
    scoreDocxReadingOrder(),
    scoreDocxForms(),
  ];
  applyWcagCriteria(categories);
  return categories;
}

/**
 * Score a Word (.docx) document. Produces the same ScoringResult shape as
 * scoreDocument (PDF), minus the PDF-only pdfUa/adobeParity signals, so it
 * flows through the existing report UI unchanged.
 */
export function scoreDocx(analysis: DocxAnalysis): ScoringResult {
  const categories = buildDocxCategories(analysis);
  const conformance = evaluateDocxConformance(analysis);
  const aggregate = aggregateScore(
    categories,
    false,
    "strict",
    conformance,
    "Word document",
  );
  return {
    overallScore: aggregate.overallScore,
    grade: aggregate.grade,
    isScanned: false,
    executiveSummary: aggregate.executiveSummary,
    categories,
    warnings: [],
    scoringMode: "strict",
    scoreProfiles: {
      strict: aggregate.profile,
      remediation: aggregate.profile,
    },
    conformance,
    // pdfUa and adobeParity are intentionally omitted — PDF-only signals.
  };
}

// Summarize the machine-checkable PDF/UA-1 signals for the report panel.
// PDF/UA identifier + artifacts come from pdfjs (XMP + content stream), which
// `qpdf --json` cannot expose; structure/MarkInfo/fonts come from qpdf.
function computePdfUaSignals(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
): PdfUaSignals {
  const fontCount = qpdf.fonts.length;
  const embeddedFontCount = qpdf.fonts.filter((f) => f.embedded).length;
  return {
    hasIdentifier: (pdfjs.hasPdfUaIdentifier ?? false) || qpdf.hasPdfUaIdentifier,
    part: pdfjs.pdfUaPart ?? qpdf.pdfUaPart,
    isTagged: qpdf.hasStructTree,
    isMarkedContent: qpdf.isMarkedContent,
    artifactRunCount: qpdf.artifactCount + (pdfjs.artifactRunCount ?? 0),
    structTreeDepth: qpdf.structTreeDepth,
    fontCount,
    embeddedFontCount,
    allFontsEmbedded: embeddedFontCount === fontCount,
    hasLanguage: qpdf.hasLang || !!pdfjs.lang,
    hasTitle: !!(pdfjs.title && pdfjs.title.trim().length > 0),
  };
}

function buildCategories(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
  mode: ScoringMode,
): CategoryResult[] {
  const categories: CategoryResult[] = [];

  categories.push(scoreTextExtractability(qpdf, pdfjs));
  categories.push(scoreTitleLanguage(qpdf, pdfjs));
  categories.push(scoreHeadingStructure(qpdf, mode));
  categories.push(scoreAltText(qpdf, pdfjs));
  categories.push(scoreBookmarks(qpdf, pdfjs));
  categories.push(scoreTableMarkup(qpdf, mode));
  categories.push(scoreColorContrast());
  categories.push(scoreLinkQuality(pdfjs));
  categories.push(scoreReadingOrder(qpdf, pdfjs, mode));
  categories.push(scoreFormAccessibility(qpdf));

  applyProfileWeights(categories, mode);
  applyWcagCriteria(categories);
  appendSupplementaryFindings(qpdf, pdfjs, categories);

  return categories;
}

function applyProfileWeights(
  categories: CategoryResult[],
  mode: ScoringMode,
): void {
  const weights = SCORING_PROFILES[mode].weights;
  for (const category of categories) {
    const profileWeight = weights[category.id as keyof typeof weights];
    if (typeof profileWeight === "number") category.weight = profileWeight;
  }
}

// Attach the published WCAG 2.1 success-criteria mapping to each category so
// the methodology is auditable per-category and the UI can show it inline.
function applyWcagCriteria(categories: CategoryResult[]): void {
  for (const category of categories) {
    const criteria = WCAG_CATEGORY_MAP[category.id];
    if (criteria) category.wcagCriteria = criteria.map((c) => ({ ...c }));
  }
}

function listLegalityScore(lists: QpdfResult["lists"]): number {
  if (lists.length === 0) return 15;
  const wellFormed = lists.filter((list) => list.isWellFormed).length;
  return Math.round((wellFormed / lists.length) * 15);
}

function tableLegalityScore(tables: QpdfResult["tables"]): number {
  if (tables.length === 0) return 15;

  const tableScores = tables.map((table) => {
    let tableScore = 0;
    if (table.hasRowStructure) tableScore += 40;
    if (table.hasConsistentColumns === true) tableScore += 35;
    else if (table.hasConsistentColumns === null) tableScore += 20;
    if (!table.hasNestedTable) tableScore += 25;
    return tableScore;
  });

  const average =
    tableScores.reduce((sum, tableScore) => sum + tableScore, 0) /
    tableScores.length;

  return Math.round((average / 100) * 15);
}

function aggregateScore(
  categories: CategoryResult[],
  isScanned: boolean,
  mode: ScoringMode,
  conformance: ConformanceVerdict,
  noun: string = "PDF",
): {
  overallScore: number;
  grade: string;
  executiveSummary: string;
  profile: ScoreProfileResult;
} {
  const applicable = categories.filter((c) => c.score !== null);

  // Straightforward weighted average across all applicable categories.
  const weightedAverage = (cats: CategoryResult[]): number => {
    const totalWeight = cats.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight === 0) return 0;
    return Math.round(
      cats.reduce(
        (sum, c) => sum + c.score! * (c.weight / totalWeight),
        0,
      ),
    );
  };

  let overallScore = weightedAverage(applicable);

  // Bonus-only PDF/UA in Practical mode:
  // Historically, the PDF/UA Compliance Signals category was weighted
  // normally in the Practical aggregate. That made Practical drag below
  // Strict whenever a document had strong WCAG semantics (alt text, real
  // headings, bookmarks) but weak PDF/UA signals (low MarkInfo / tab-order
  // / PDF/UA-identifier coverage). That was surprising: a "practical
  // readiness" profile shouldn't punish a document for missing PDF/UA
  // markers that don't affect WCAG conformance.
  //
  // Fix: PDF/UA is now a lift-only contribution in Practical. Compute the
  // Practical aggregate BOTH ways (with PDF/UA and without) and keep the
  // higher score. PDF/UA can boost the number when it's strong; when it's
  // weak, it is ignored for aggregation purposes and the renormalized
  // "WCAG-only Practical" score is surfaced instead.
  //
  // Strict is unaffected (its pdf_ua_compliance weight is 0 anyway) and
  // the PDF/UA category itself still appears in the per-category table
  // with its own score, so auditors see the PDF/UA signal — it just
  // doesn't drag the overall Practical number below the WCAG-only baseline.
  if (mode === "remediation") {
    const withoutPdfUa = applicable.filter(
      (c) => c.id !== "pdf_ua_compliance",
    );
    if (withoutPdfUa.length < applicable.length) {
      const withoutScore = weightedAverage(withoutPdfUa);
      overallScore = Math.max(overallScore, withoutScore);
    }
  }

  const grade = getGrade(overallScore);
  const executiveSummary = generateSummary(
    overallScore,
    grade,
    isScanned,
    categories,
    conformance,
    noun,
  );

  return {
    overallScore,
    grade,
    executiveSummary,
    profile: {
      mode,
      label: SCORING_PROFILES[mode].label,
      description: SCORING_PROFILES[mode].description,
      overallScore,
      grade,
      executiveSummary,
      categoryScores: Object.fromEntries(
        categories.map((category) => [category.id, category.score]),
      ),
      categories,
    },
  };
}

function scoreTextExtractability(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
): CategoryResult {
  let score: number;
  const findings: string[] = [];

  if (pdfjs.hasText && qpdf.hasStructTree) {
    score = 100;
    findings.push("PDF contains extractable text");
    findings.push("Document is tagged (StructTreeRoot present)");
    if (pdfjs.textLength)
      findings.push(
        `Extracted ${pdfjs.textLength.toLocaleString()} characters of text content`,
      );
  } else if (pdfjs.hasText && !qpdf.hasStructTree) {
    score = 50;
    findings.push("PDF contains extractable text");
    findings.push("Document is NOT tagged — no StructTreeRoot found");
    findings.push(
      "How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF (classic UI: Tools → Accessibility → Autotag Document). Tags create a hidden structure that tells screen readers the reading order, headings, and other elements.",
    );
  } else if (!pdfjs.hasText && qpdf.hasStructTree) {
    score = 25;
    findings.push("No extractable text found, but document has tag structure");
    findings.push(
      "This may be a partially tagged scanned document. The images need OCR (Optical Character Recognition) to convert them to real text.",
    );
    findings.push(
      "How to fix: In Adobe Acrobat, open All tools → Scan & OCR → Recognize Text → In This File.",
    );
  } else {
    score = 0;
    findings.push("No extractable text found");
    findings.push("No tag structure found");
    findings.push(
      "This PDF appears to be a scanned image — it is essentially a photograph of text. Screen readers cannot read it at all.",
    );
    findings.push(
      "How to fix: (1) Run OCR in Adobe Acrobat: All tools → Scan & OCR → Recognize Text. (2) Then add tags: All tools → Prepare for accessibility → Automatically tag PDF.",
    );
  }

  // Font embedding check — non-embedded fonts can cause garbled text for screen readers
  if (qpdf.fonts.length > 0) {
    const embedded = qpdf.fonts.filter((f) => f.embedded).length;
    const notEmbedded = qpdf.fonts.filter((f) => !f.embedded);

    findings.push("--- Font Embedding ---");
    findings.push(
      `  ${qpdf.fonts.length} font(s) found: ${embedded} embedded, ${notEmbedded.length} not embedded`,
    );
    for (const font of qpdf.fonts.slice(0, 25)) {
      findings.push(
        `  ${font.name} — ${font.embedded ? "embedded" : "NOT embedded"}`,
      );
    }
    if (qpdf.fonts.length > 25) {
      findings.push(`  ... and ${qpdf.fonts.length - 25} more font(s)`);
    }

    if (notEmbedded.length > 0) {
      score = Math.min(score, 85); // cap at 85 (Minor) — never Pass with non-embedded fonts
      const fontNames = notEmbedded
        .slice(0, 5)
        .map((f) => f.name)
        .join(", ");
      findings.push(
        `${notEmbedded.length} non-embedded font(s) may cause garbled text on systems without ${notEmbedded.length === 1 ? "this font" : "these fonts"}: ${fontNames}${notEmbedded.length > 5 ? ` (+${notEmbedded.length - 5} more)` : ""}`,
      );
      findings.push(
        "Fix: In the source application (Word, InDesign), enable font embedding before exporting to PDF. In Acrobat: File → Properties → Fonts tab shows embedding status.",
      );
    } else {
      findings.push(
        "All fonts are embedded — text will render correctly regardless of the user's installed fonts",
      );
    }
  }

  return {
    id: "text_extractability",
    label: "Text Extractability",
    weight: SCORING_WEIGHTS.text_extractability,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation:
      "Text extractability checks whether the PDF contains real, selectable text (not just images of text) and whether it has a tag structure. Tags are a hidden layer that tells assistive technology — like screen readers — what each piece of content is and in what order to read it. Without extractable text, a screen reader has nothing to work with. Non-embedded fonts can also cause screen readers to extract garbled or incorrect text.",
    helpLinks: [
      {
        label: "Adobe: Add Tags to a PDF",
        url: "https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html",
      },
      {
        label: "Adobe: OCR a Scanned Document",
        url: "https://helpx.adobe.com/acrobat/using/edit-scanned-pdfs.html",
      },
      {
        label: "WebAIM: PDF Accessibility",
        url: "https://webaim.org/techniques/acrobat/",
      },
    ],
  };
}

function scoreTitleLanguage(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
): CategoryResult {
  let score = 0;
  const findings: string[] = [];

  // Title check (50 points; 25 when the title looks like a filename —
  // present, so not a conformance failure, but weak for screen reader users)
  if (pdfjs.title && pdfjs.title.trim().length > 0) {
    if (pdfjs.titleLooksLikeFilename) {
      score += 25;
      findings.push(`Document title: "${pdfjs.title}"`);
      findings.push(
        "The title looks like a filename or tool-generated string rather than a descriptive title — screen readers announce it as the document name, so partial credit only.",
      );
      findings.push(
        'How to fix: In Adobe Acrobat, go to File → Properties → Description tab → replace it with a descriptive Title (e.g., "2024 Annual Crime Report").',
      );
    } else {
      score += 50;
      findings.push(`Document title: "${pdfjs.title}"`);
    }
  } else {
    findings.push("No document title found in metadata");
    findings.push(
      "How to fix: In Adobe Acrobat, go to File → Properties → Description tab → enter a descriptive Title.",
    );
    findings.push(
      'The title is what screen readers announce when a user first opens the document. Without it, they hear the filename instead (e.g., "report_v3_final.pdf").',
    );
  }

  // Language check (50 points)
  const hasLang = qpdf.hasLang || !!pdfjs.lang;
  if (hasLang) {
    score += 50;
    findings.push(`Language declared: ${qpdf.lang || pdfjs.lang}`);
  } else {
    findings.push("No language declaration found");
    findings.push(
      "How to fix: In Adobe Acrobat, go to File → Properties → Advanced tab → set the Language dropdown.",
    );
    findings.push(
      "The language tag tells screen readers which pronunciation rules to use. Without it, a French document might be read with English pronunciation.",
    );
  }

  if (pdfjs.author) findings.push(`Author: ${pdfjs.author}`);

  return {
    id: "title_language",
    label: "Document Title & Language",
    weight: SCORING_WEIGHTS.title_language,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation:
      "This category checks two metadata fields: the document title and the language declaration. The title appears in the browser tab and is the first thing a screen reader announces. The language tag tells assistive technology how to pronounce the text correctly.",
    helpLinks: [
      {
        label: "Adobe: Set Document Title",
        url: "https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html",
      },
      {
        label: "WCAG 3.1.1: Language of Page",
        url: wcagUnderstandingUrl("language-of-page"),
      },
      {
        label: "WebAIM: Document Properties",
        url: "https://webaim.org/techniques/acrobat/other",
      },
    ],
  };
}

function getHeadingLikeParagraphMappings(qpdf: QpdfResult): string[] {
  return qpdf.roleMapEntries.filter((entry) => {
    const [source, target] = entry.split(" → ");
    return /head/i.test(source || "") && target === "P";
  });
}

function scoreHeadingStructure(
  qpdf: QpdfResult,
  mode: ScoringMode,
): CategoryResult {
  const findings: string[] = [];
  const headingExplanation =
    "Headings (H1–H6) create a navigable outline of the document. Screen reader users rely on headings to skim and jump between sections — similar to how sighted users scan bold section titles. Headings must follow a logical hierarchy: H1 for the main title, H2 for major sections, H3 for subsections, and so on. Skipping levels (e.g., H1 → H3) confuses assistive technology.";
  const headingLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Add Headings to a PDF",
      url: "https://helpx.adobe.com/acrobat/using/editing-document-structure-content-tags.html",
    },
    {
      label: "WCAG 1.3.1: Info and Relationships",
      url: wcagUnderstandingUrl("info-and-relationships"),
    },
    {
      label: "WebAIM: Headings in PDFs",
      url: "https://webaim.org/techniques/acrobat/reviewing#repairs",
    },
  ];

  if (qpdf.headings.length === 0) {
    const roleMappedParagraphs = getHeadingLikeParagraphMappings(qpdf);
    const hasRemediationSignals =
      qpdf.hasStructTree &&
      qpdf.paragraphCount >= 25 &&
      (qpdf.outlineCount > 0 || roleMappedParagraphs.length > 0);
    const findings = ["No heading tags found in the document structure"];

    if (roleMappedParagraphs.length > 0) {
      findings.push(
        `Custom heading-like tags are present, but the RoleMap maps them to paragraphs: ${roleMappedParagraphs.slice(0, 4).join(", ")}${roleMappedParagraphs.length > 4 ? ` (+${roleMappedParagraphs.length - 4} more)` : ""}`,
      );
    }

    if (qpdf.outlineCount > 0 || qpdf.paragraphCount > 0) {
      findings.push(
        `Bookmarks and paragraph-level structure do not replace true H1–H6 semantics (${qpdf.outlineCount} bookmark(s), ${qpdf.paragraphCount} paragraph-level tag(s))`,
      );
    }

    if (mode === "remediation" && hasRemediationSignals) {
      findings.push(
        "Remediation-oriented scoring grants partial credit for rich tagged body structure and navigation aids, but strict mode still treats this as a heading failure.",
      );
      findings.push(
        "How to fully fix: Promote actual section starts to H1/H2/H3 tags instead of leaving heading-like content mapped to P.",
      );
      return {
        id: "heading_structure",
        label: "Heading Structure",
        weight: SCORING_WEIGHTS.heading_structure,
        score: 70,
        grade: getGrade(70),
        severity: getSeverity(70),
        findings,
        explanation: headingExplanation,
        helpLinks: headingLinks,
      };
    }

    findings.push(
      "How to fix: In Adobe Acrobat, open the Tags panel (classic UI: View → Show/Hide → Navigation Panes → Tags; new UI: the Accessibility tags panel in the left rail). Select text that serves as a heading, right-click the corresponding tag, and change its type to H1, H2, etc.",
    );
    return {
      id: "heading_structure",
      label: "Heading Structure",
      weight: SCORING_WEIGHTS.heading_structure,
      score: 0,
      grade: "F",
      severity: "Critical",
      findings,
      explanation: headingExplanation,
      helpLinks: headingLinks,
    };
  }

  // Show the heading outline as a compact flow
  findings.push(`--- Heading Tree ---`);
  findings.push(`  ${qpdf.headings.map((h) => h.level).join(" → ")}`);

  const hasNumberedHeadings = qpdf.headings.some((h) =>
    /^H[1-6]$/.test(h.level),
  );

  if (!hasNumberedHeadings) {
    findings.push(
      "Only generic /H tags found (not H1–H6). Generic heading tags don't convey hierarchy.",
    );
    findings.push(
      "How to fix: In the Tags panel, change each /H tag to a specific level (H1, H2, etc.) that matches the document outline.",
    );
    return {
      id: "heading_structure",
      label: "Heading Structure",
      weight: SCORING_WEIGHTS.heading_structure,
      score: 40,
      grade: getGrade(40),
      severity: getSeverity(40),
      findings,
      explanation: headingExplanation,
      helpLinks: headingLinks,
    };
  }

  // Check hierarchy
  const levels = qpdf.headings
    .filter((h) => /^H[1-6]$/.test(h.level))
    .map((h) => parseInt(h.level.replace("H", "")));

  const h1Count = levels.filter((l) => l === 1).length;
  let hierarchyBroken = false;
  let hasMultipleH1 = h1Count > 1;

  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      hierarchyBroken = true;
      findings.push(
        `Heading hierarchy skip: H${levels[i - 1]} → H${levels[i]} (skipped H${levels[i - 1] + 1})`,
      );
    }
  }

  if (hasMultipleH1) {
    findings.push(
      `Found ${h1Count} H1 headings — a document should have exactly one H1 (the document title)`,
    );
    findings.push(
      "Fix: Change extra H1 tags to H2 or lower so there is a single top-level heading",
    );
  }

  if (hierarchyBroken || hasMultipleH1) {
    const issues: string[] = [];
    if (hierarchyBroken) issues.push("hierarchy has gaps");
    if (hasMultipleH1) issues.push(`${h1Count} H1 headings instead of one`);
    findings.unshift(
      `Found ${levels.length} heading tags, but ${issues.join(" and ")}`,
    );
    if (hierarchyBroken) {
      findings.push(
        "Heading levels should not skip — e.g., don't jump from H1 to H3 without an H2 in between.",
      );
    }
    const score =
      hierarchyBroken && hasMultipleH1 ? 55 : hasMultipleH1 ? 75 : 60;
    return {
      id: "heading_structure",
      label: "Heading Structure",
      weight: SCORING_WEIGHTS.heading_structure,
      score,
      grade: getGrade(score),
      severity: getSeverity(score),
      findings,
      explanation: headingExplanation,
      helpLinks: headingLinks,
    };
  }

  findings.push(`Found ${levels.length} heading tags with logical hierarchy`);
  return {
    id: "heading_structure",
    label: "Heading Structure",
    weight: SCORING_WEIGHTS.heading_structure,
    score: 100,
    grade: "A",
    severity: "No issues found",
    findings,
    explanation: headingExplanation,
    helpLinks: headingLinks,
  };
}

/**
 * Heuristic check for alt text that is likely machine-generated, encoded,
 * or otherwise not human-readable. Returns a reason string if suspicious,
 * or null if the text looks plausible.
 */
function detectSuspiciousAltText(text: string): string | null {
  if (!text || text.trim().length === 0) return null;
  const t = text.trim();

  // Hex-encoded / binary-looking: long run of hex chars (possibly with "b:" prefix)
  const hexCleaned = t.replace(/^b:/, "");
  if (hexCleaned.length > 20 && /^[0-9a-fA-F]+$/.test(hexCleaned)) {
    return "appears to be hex-encoded data, not a human-readable description";
  }

  // Very long string with no spaces — likely encoded or a hash
  if (t.length > 30 && !t.includes(" ")) {
    return "very long string with no spaces — may be encoded or auto-generated";
  }

  // Mostly non-ASCII or control characters
  const nonAscii = t.replace(/[\x20-\x7E]/g, "").length;
  if (t.length > 5 && nonAscii / t.length > 0.5) {
    return "contains mostly non-printable or non-ASCII characters";
  }

  // Common filename patterns used as alt text
  if (
    /^(IMG_?\d|DSC_?\d|image\d|photo\d|picture\d|screenshot|untitled)/i.test(
      t,
    ) &&
    /\.(jpe?g|png|gif|bmp|tiff?|webp|svg|pdf)$/i.test(t)
  ) {
    return "appears to be a filename rather than a description";
  }

  // Single word that is just "image", "photo", "picture", "graphic", "icon", "figure"
  if (/^(image|photo|picture|graphic|icon|figure|img|pic|logo)$/i.test(t)) {
    return "generic placeholder — does not describe the image content";
  }

  return null;
}

function scoreAltText(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  const altLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Add Alt Text to Images",
      url: "https://helpx.adobe.com/acrobat/using/editing-document-structure-content-tags.html#add_alternate_text_to_links_and_figures",
    },
    {
      label: "WCAG 1.1.1: Non-text Content",
      url: wcagUnderstandingUrl("non-text-content"),
    },
    {
      label: "WebAIM: Alt Text in PDFs",
      url: "https://webaim.org/techniques/acrobat/reviewing#repairs",
    },
  ];
  const altExplanation =
    "Alternative text (alt text) is a short text description attached to each image in the document. Screen readers read this description aloud so that blind and low-vision users can understand visual content. Every informative image needs alt text. Decorative images (borders, spacers) should be marked as artifacts instead.";

  const figures = qpdf.images.filter((img) => img.ref);
  const untaggedImageSignals = Math.max(
    pdfjs.imageCount,
    qpdf.imageObjectCount,
  );

  // Untagged/raw image signals are too noisy to score automatically.
  if (figures.length === 0 && untaggedImageSignals > 0) {
    const advisoryFindings: string[] = [
      `${untaggedImageSignals} image-like object(s) detected, but no tagged <Figure> elements were found`,
      "Automated alt-text scoring was skipped because raw image detection includes decorative graphics, repeated assets, and other non-content imagery that may not require alt text.",
      "Manual review recommended: open the PDF in Adobe Acrobat or PAC and verify which visual elements are meaningful content images versus decorative artifacts.",
      `--- Image Review Guidance ---`,
      `  Tagged figures found: 0`,
      `  Raw image signals detected: ${untaggedImageSignals}`,
      `  Content images should be tagged as <Figure> and include meaningful /Alt text`,
      `  Decorative graphics should be marked as Artifacts so they are removed from the reading order`,
    ];
    if (qpdf.imageObjectCount > 0) {
      advisoryFindings.push(
        `  QPDF found ${qpdf.imageObjectCount} image XObject(s) in the PDF object graph`,
      );
    }
    if (pdfjs.imageCount > 0) {
      advisoryFindings.push(
        `  PDF.js observed ${pdfjs.imageCount} image rendering operation(s) while painting pages`,
      );
    }
    return {
      id: "alt_text",
      label: "Alt Text on Images",
      weight: SCORING_WEIGHTS.alt_text,
      score: null,
      grade: null,
      severity: null,
      notAssessed: true,
      findings: advisoryFindings,
      explanation: altExplanation,
      helpLinks: altLinks,
    };
  }

  if (figures.length === 0) {
    return {
      id: "alt_text",
      label: "Alt Text on Images",
      weight: SCORING_WEIGHTS.alt_text,
      score: null,
      grade: null,
      severity: null,
      findings: [
        "No images detected in this document — this category does not affect the score",
        "If this document does contain images, they may not be properly tagged as <Figure> elements. Verify manually in Adobe Acrobat's Tags panel.",
      ],
      explanation: altExplanation,
      helpLinks: altLinks,
    };
  }

  const withAlt = figures.filter((f) => f.hasAlt).length;
  const score =
    withAlt === 0 ? 0 : Math.floor((withAlt / figures.length) * 100);
  const findings: string[] = [];

  if (withAlt === figures.length) {
    findings.push(`All ${figures.length} image(s) have alternative text`);
    findings.push(`--- Image Alt Text Details ---`);
    for (let fi = 0; fi < figures.length && fi < 20; fi++) {
      const fig = figures[fi];
      const label = figures.length > 1 ? `Image ${fi + 1}` : "Image";
      findings.push(`  ${label}: "${fig.altText || "(empty alt)"}"`);
    }
    if (figures.length > 20) {
      findings.push(`  ... and ${figures.length - 20} more image(s)`);
    }
  } else {
    findings.push(
      `${withAlt} of ${figures.length} image(s) have alternative text`,
    );
    findings.push(`--- Images Missing Alt Text ---`);
    let missingCount = 0;
    for (let fi = 0; fi < figures.length && missingCount < 15; fi++) {
      if (!figures[fi].hasAlt) {
        missingCount++;
        findings.push(`  Image ${fi + 1}: <Figure> tag — no /Alt attribute`);
      }
    }
    const totalMissing = figures.filter((f) => !f.hasAlt).length;
    if (totalMissing > 15) {
      findings.push(
        `  ... and ${totalMissing - 15} more image(s) without alt text`,
      );
    }
    if (withAlt > 0) {
      findings.push(`--- Images With Alt Text ---`);
      let shownCount = 0;
      for (let fi = 0; fi < figures.length && shownCount < 10; fi++) {
        if (figures[fi].hasAlt) {
          shownCount++;
          findings.push(`  Image ${fi + 1}: "${figures[fi].altText}"`);
        }
      }
      if (withAlt > 10) {
        findings.push(`  ... and ${withAlt - 10} more image(s) with alt text`);
      }
    }
    findings.push(
      'How to fix: In Adobe Acrobat, open the Tags panel → find the <Figure> tag for each image → right-click → Properties → enter a description in the "Alternate Text" field.',
    );
    findings.push(
      'Tip: Good alt text is concise and describes the purpose of the image, not just its appearance. For example, "Bar chart showing 2024 crime rates by county" rather than "chart".',
    );
  }

  // Check for suspicious / non-human-readable alt text (no score penalty)
  const suspicious: Array<{ index: number; alt: string; reason: string }> = [];
  for (let fi = 0; fi < figures.length; fi++) {
    const fig = figures[fi];
    if (fig.hasAlt && fig.altText) {
      const reason = detectSuspiciousAltText(fig.altText);
      if (reason) suspicious.push({ index: fi + 1, alt: fig.altText, reason });
    }
  }
  if (suspicious.length > 0) {
    findings.push(`--- ⚠ Alt Text Quality Warning ---`);
    findings.push(
      `  ${suspicious.length} image(s) have alt text that may not be human-readable (no score penalty):`,
    );
    for (const s of suspicious.slice(0, 15)) {
      const preview = s.alt.length > 60 ? s.alt.slice(0, 60) + "…" : s.alt;
      findings.push(`  Image ${s.index}: "${preview}" — ${s.reason}`);
    }
    if (suspicious.length > 15) {
      findings.push(
        `  ... and ${suspicious.length - 15} more suspicious alt text value(s)`,
      );
    }
    findings.push(
      `  Review these images and replace auto-generated or encoded alt text with meaningful descriptions.`,
    );
  }

  return {
    id: "alt_text",
    label: "Alt Text on Images",
    weight: SCORING_WEIGHTS.alt_text,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: altExplanation,
    helpLinks: altLinks,
  };
}

function scoreColorContrast(): CategoryResult {
  const contrastLinks: CategoryResult["helpLinks"] = [
    {
      label: "WCAG 1.4.3: Contrast (Minimum)",
      url: wcagUnderstandingUrl("contrast-minimum"),
    },
    {
      label: "Adobe: Check accessibility (Full Check)",
      url: "https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html",
    },
  ];

  return {
    id: "color_contrast",
    label: "Color Contrast",
    weight: SCORING_WEIGHTS.color_contrast,
    score: null,
    grade: null,
    severity: null,
    notAssessed: true,
    findings: [
      "This analyzer does not yet compute rendered text/background contrast inside PDF page content.",
      "Color contrast remains N/A in both Strict and Practical modes until PDF contrast analysis is implemented.",
      "The category is shown so the external practical scoring schema is explicit, but it does not affect the score today.",
    ],
    explanation:
      "Color contrast checks whether text stands out strongly enough from its background for low-vision users. Unlike web pages, PDFs often require rendered page analysis to determine foreground/background pairs accurately. This analyzer does not yet perform that rendered contrast audit.",
    helpLinks: contrastLinks,
  };
}

function scoreBookmarks(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  const bookmarkLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Create Bookmarks",
      url: "https://helpx.adobe.com/acrobat/using/page-thumbnails-bookmarks-pdfs.html#create_a_bookmark",
    },
    {
      label: "Adobe: Auto-generate Bookmarks from Headings",
      url: "https://helpx.adobe.com/acrobat/using/page-thumbnails-bookmarks-pdfs.html",
    },
    {
      label: "WebAIM: PDF Navigation",
      url: "https://webaim.org/techniques/acrobat/other#bookmarks",
    },
  ];
  const bookmarkExplanation =
    "Bookmarks (also called outlines) create a clickable table of contents in the PDF sidebar. They let all users — including those using screen readers — jump directly to any section. For documents longer than a few pages, bookmarks are essential for navigation. In Adobe Acrobat, bookmarks can be generated automatically from heading tags.";

  if (pdfjs.pageCount < ANALYSIS.BOOKMARKS_PAGE_THRESHOLD) {
    return {
      id: "bookmarks",
      label: "Bookmarks / Navigation",
      weight: SCORING_WEIGHTS.bookmarks,
      score: null,
      grade: null,
      severity: null,
      findings: [
        `Document has ${pdfjs.pageCount} page(s) — bookmarks are not required for documents under ${ANALYSIS.BOOKMARKS_PAGE_THRESHOLD} pages`,
        "This category does not affect the score",
      ],
      explanation: bookmarkExplanation,
      helpLinks: bookmarkLinks,
    };
  }

  const hasOutlines = qpdf.hasOutlines || pdfjs.hasOutlines;
  const outlineCount = Math.max(qpdf.outlineCount, pdfjs.outlineCount);

  if (hasOutlines && outlineCount > 0) {
    const findings = [`${outlineCount} bookmark(s) found`];
    if (qpdf.outlineTitles?.length > 0) {
      findings.push("--- Bookmark Outline ---");
      for (const title of qpdf.outlineTitles) {
        findings.push(`  ${title}`);
      }
    }
    return {
      id: "bookmarks",
      label: "Bookmarks / Navigation",
      weight: SCORING_WEIGHTS.bookmarks,
      score: 100,
      grade: "A",
      severity: "No issues found",
      findings,
      explanation: bookmarkExplanation,
      helpLinks: bookmarkLinks,
    };
  }

  if (hasOutlines && outlineCount === 0) {
    return {
      id: "bookmarks",
      label: "Bookmarks / Navigation",
      weight: SCORING_WEIGHTS.bookmarks,
      score: 40,
      grade: getGrade(40),
      severity: getSeverity(40),
      findings: [
        "Outline structure present but contains no entries",
        "How to fix: In Adobe Acrobat, go to the Bookmarks panel (View → Show/Hide → Navigation Panes → Bookmarks). You can create bookmarks manually or auto-generate them from headings (Options menu → New Bookmarks from Structure).",
      ],
      explanation: bookmarkExplanation,
      helpLinks: bookmarkLinks,
    };
  }

  return {
    id: "bookmarks",
    label: "Bookmarks / Navigation",
    weight: SCORING_WEIGHTS.bookmarks,
    score: 45,
    grade: getGrade(45),
    severity: getSeverity(45),
    findings: [
      `Document has ${pdfjs.pageCount} pages but no bookmarks`,
      "Bookmarks map to WCAG 2.4.5 Multiple Ways (Level AA). A clear heading structure is a partial alternative way to navigate, so missing bookmarks is treated as a moderate issue rather than a critical failure — but bookmarks remain best practice for long documents.",
      "How to fix: In Adobe Acrobat, go to the Bookmarks panel. Create bookmarks for each major section, or auto-generate them from heading tags (Options → New Bookmarks from Structure).",
    ],
    explanation: bookmarkExplanation,
    helpLinks: bookmarkLinks,
  };
}

function scoreTableMarkup(qpdf: QpdfResult, mode: ScoringMode): CategoryResult {
  const tableLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Make Tables Accessible",
      url: "https://helpx.adobe.com/acrobat/using/editing-document-structure-content-tags.html",
    },
    {
      label: "WCAG 1.3.1: Info and Relationships",
      url: wcagUnderstandingUrl("info-and-relationships"),
    },
    {
      label: "WebAIM: Table Accessibility in PDFs",
      url: "https://webaim.org/techniques/acrobat/reviewing#repairs",
    },
    {
      label: "PAC 2024: Table Structure",
      url: "https://pac.pdf-accessibility.org/",
    },
  ];
  const tableExplanation =
    "Table markup tells screen readers how to navigate data tables. This checks seven aspects of table accessibility, weighted by importance: header cells (TH tags, 40 pts), row structure (TR tags, 20 pts), scope attributes linking headers to columns/rows (10 pts), nested table detection (10 pts), consistent column counts (10 pts), caption elements (5 pts), and header-cell associations (5 pts). Headers and row structure are the foundation; scope and captions are enhancements.";

  if (qpdf.tables.length === 0) {
    return {
      id: "table_markup",
      label: "Table Markup",
      weight: SCORING_WEIGHTS.table_markup,
      score: null,
      grade: null,
      severity: null,
      findings: [
        "No tables detected in this document — this category does not affect the score",
      ],
      explanation: tableExplanation,
      helpLinks: tableLinks,
    };
  }

  const n = qpdf.tables.length;
  const findings: string[] = [];
  let score = 0;

  // Per-table structural summary
  findings.push(`--- Table Structure Overview ---`);
  for (let ti = 0; ti < n; ti++) {
    const t = qpdf.tables[ti];
    const label = n > 1 ? `Table ${ti + 1}` : "Table";
    const cols =
      t.columnCounts.length > 0 ? `${t.columnCounts[0]} cols` : "no col data";
    const parts: string[] = [
      `${t.rowCount} rows × ${cols}`,
      `${t.headerCount} <TH>, ${t.dataCellCount} <TD>`,
    ];
    if (t.hasScope) parts.push("scope: present");
    else if (t.headerCount > 0)
      parts.push(`scope: missing on ${t.scopeMissingCount} header(s)`);
    if (t.hasCaption) parts.push("caption: yes");
    if (t.hasNestedTable) parts.push("NESTED TABLE");
    if (t.hasConsistentColumns === false) {
      const unique = [...new Set(t.columnCounts)];
      parts.push(`inconsistent cols: [${unique.join(", ")}]`);
    }
    if (t.hasHeaderAssociation) parts.push("/Headers assoc: yes");
    findings.push(`  ${label}: ${parts.join(" | ")}`);
  }

  // 1. Header presence (40 points) — most critical for screen reader navigation
  const withHeaders = qpdf.tables.filter((t) => t.hasHeaders).length;
  if (withHeaders === n) {
    score += 40;
    const totalTH = qpdf.tables.reduce((sum, t) => sum + t.headerCount, 0);
    findings.push(
      `All ${n} table(s) have header cells (TH) — ${totalTH} header cell(s) total`,
    );
  } else if (withHeaders > 0) {
    score += 20;
    findings.push(
      `${withHeaders} of ${n} table(s) have header cells — ${n - withHeaders} table(s) are missing <TH> tags`,
    );
    for (let ti = 0; ti < n; ti++) {
      if (!qpdf.tables[ti].hasHeaders) {
        findings.push(
          `  Table ${ti + 1}: 0 <TH> found — all ${qpdf.tables[ti].dataCellCount} cells are <TD>`,
        );
      }
    }
    findings.push(
      "Fix: In Adobe Acrobat, open the Tags panel → expand each <Table> → find header rows → change <TD> to <TH>",
    );
  } else {
    findings.push(
      `${n} table(s) found but none have header cells — screen readers cannot identify column or row headers`,
    );
    for (let ti = 0; ti < n; ti++) {
      findings.push(
        `  Table ${ti + 1}: ${qpdf.tables[ti].dataCellCount} <TD> cells, 0 <TH> cells`,
      );
    }
    findings.push(
      "Fix: In Adobe Acrobat, open the Tags panel → expand each <Table> → find the header row → change the cell tags from <TD> to <TH>",
    );
  }

  // 2. Row structure (20 points) — second most important structural requirement
  const withRows = qpdf.tables.filter((t) => t.hasRowStructure).length;
  if (withRows === n) {
    score += 20;
    const totalRows = qpdf.tables.reduce((sum, t) => sum + t.rowCount, 0);
    findings.push(
      `All ${n} table(s) have proper row structure — ${totalRows} <TR> row(s) total`,
    );
  } else if (withRows > 0) {
    score += 10;
    for (let ti = 0; ti < n; ti++) {
      if (!qpdf.tables[ti].hasRowStructure) {
        findings.push(
          `  Table ${ti + 1}: missing <TR> row structure — cells are directly under <Table>`,
        );
      }
    }
  } else {
    findings.push(
      "No tables have <TR> row structure — cells are not grouped into rows, which breaks screen reader table navigation",
    );
    findings.push(
      "Fix: In Adobe Acrobat, restructure each table so cells are wrapped in <TR> (Table Row) tags",
    );
  }

  // 3. Scope attributes (10 points) — enhancement for complex tables
  const withScope = qpdf.tables.filter(
    (t) => t.hasHeaders && t.hasScope,
  ).length;
  const tablesWithHeaders = qpdf.tables.filter((t) => t.hasHeaders);
  if (tablesWithHeaders.length === 0) {
    findings.push("Scope attributes: N/A (no header cells to check)");
  } else if (withScope === tablesWithHeaders.length) {
    score += 10;
    findings.push("All <TH> cells have Scope attributes (/Column or /Row)");
  } else {
    const totalMissing = qpdf.tables.reduce(
      (sum, t) => sum + t.scopeMissingCount,
      0,
    );
    if (withScope > 0) score += 5;
    findings.push(
      `${totalMissing} <TH> cell(s) missing Scope attribute — screen readers may not correctly associate headers with data`,
    );
    for (let ti = 0; ti < n; ti++) {
      const t = qpdf.tables[ti];
      if (t.headerCount > 0 && t.scopeMissingCount > 0) {
        findings.push(
          `  Table ${ti + 1}: ${t.scopeMissingCount} of ${t.headerCount} <TH> missing /Scope`,
        );
      }
    }
    findings.push(
      'Fix: In Adobe Acrobat, open the Reading Order tool → select the table → Table Editor → right-click the header cell(s) → Table Cell Properties → set Scope to "Column" or "Row"',
    );
  }

  // 4. No nested tables (10 points)
  const withNesting = qpdf.tables.filter((t) => t.hasNestedTable).length;
  if (withNesting === 0) {
    score += 10;
    findings.push("No nested tables detected");
  } else {
    for (let ti = 0; ti < n; ti++) {
      if (qpdf.tables[ti].hasNestedTable) {
        findings.push(
          `  Table ${ti + 1}: contains nested <Table> — extremely difficult for screen readers to navigate`,
        );
      }
    }
    findings.push(
      "Fix: Restructure nested tables into a single flat table, or split into separate independent tables",
    );
  }

  // 5. Caption (5 points) — a best-practice enhancement, NOT a WCAG 2.1/2.2
  // requirement (no success criterion mandates a table caption). Its absence
  // must not cap an otherwise-conformant table below 100, so the points are
  // awarded unconditionally; a missing caption is surfaced as an optional
  // recommendation only.
  score += 5;
  const withCaption = qpdf.tables.filter((t) => t.hasCaption).length;
  if (withCaption === n) {
    findings.push(`All ${n} table(s) have <Caption> elements`);
  } else if (withCaption > 0) {
    findings.push(
      `${withCaption} of ${n} table(s) have a <Caption>; ${n - withCaption} do not. A caption is optional (not required by WCAG 2.1/2.2), but it helps screen readers announce a table's purpose.`,
    );
  } else {
    findings.push(
      "No tables have a <Caption> element. A caption is optional (not required by WCAG 2.1/2.2), but adding one as the first child of each <Table> helps screen readers announce the table's purpose.",
    );
  }

  // 6. Consistent columns (10 points)
  const withConsistent = qpdf.tables.filter(
    (t) => t.hasConsistentColumns === true,
  ).length;
  const checkable = qpdf.tables.filter(
    (t) => t.hasConsistentColumns !== null,
  ).length;
  if (checkable === 0) {
    findings.push(
      "Column consistency: could not be checked (no row structure)",
    );
  } else if (withConsistent === checkable) {
    score += 10;
    findings.push("All tables have consistent column counts across rows");
  } else {
    for (let ti = 0; ti < n; ti++) {
      const t = qpdf.tables[ti];
      if (t.hasConsistentColumns === false) {
        const unique = [...new Set(t.columnCounts)];
        findings.push(
          `  Table ${ti + 1}: inconsistent column counts — rows span [${t.columnCounts.join(", ")}] grid columns (expected uniform ${unique[0]}; ColSpan/RowSpan are already accounted for)`,
        );
      }
    }
    findings.push(
      "Fix: Ensure every row covers the same number of grid columns — add the missing cells, or set correct /ColSpan//RowSpan attributes on spanning cells.",
    );
  }

  // 7. Header association (5 points) — header cells must be programmatically
  // associated with their data cells. WCAG 2.1/2.2 SC 1.3.1 Info and
  // Relationships (Level A — unchanged between the two versions) accepts
  // either technique:
  // /Scope is the recommended approach for simple tables, while the explicit
  // /Headers attribute is intended for complex tables. Crediting only /Headers
  // would wrongly dock a fully-conformant scope-based simple table 5 points.
  const withExplicitHeaders = qpdf.tables.filter(
    (t) => t.hasHeaderAssociation,
  ).length;
  const withAssoc = qpdf.tables.filter(
    (t) => t.hasHeaderAssociation || t.hasScope,
  ).length;
  if (withAssoc > 0) {
    score += 5;
    if (withExplicitHeaders > 0) {
      findings.push(
        `${withExplicitHeaders} table(s) use explicit header-cell associations (/Headers attribute)`,
      );
    } else {
      findings.push(
        "Header cells are programmatically associated with data cells via /Scope",
      );
    }
  }

  const qualifiesForRemediationPartialCredit =
    mode === "remediation" &&
    withHeaders === 0 &&
    withRows === n &&
    checkable > 0 &&
    withConsistent === checkable;

  if (qualifiesForRemediationPartialCredit) {
    score = Math.max(score, 70);
    findings.push(
      "Remediation-oriented scoring grants partial credit because the table grid is well-formed, but strict mode still expects true header semantics.",
    );
    findings.push(
      "A visually obvious header row is not enough for WCAG-oriented semantic review — the cells still need <TH> and, where appropriate, /Scope or /Headers.",
    );
  } else if (withHeaders === 0 && withRows === n) {
    findings.push(
      "The table has usable row structure, but row structure alone does not create programmatic header relationships.",
    );
  }

  return {
    id: "table_markup",
    label: "Table Markup",
    weight: SCORING_WEIGHTS.table_markup,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: tableExplanation,
    helpLinks: tableLinks,
  };
}

// WCAG 2.4.4 (Link Purpose) — visible link text that does not describe the
// destination. Covers raw URLs *and* the canonical vague phrases ("click
// here", "read more", …). 2.4.4 is judged "in context", so the surrounding
// sentence can sometimes rescue a weak link — these are flagged for review,
// not asserted as definite failures.
const VAGUE_LINK_PHRASES = new Set([
  "click here",
  "click",
  "here",
  "read more",
  "more",
  "learn more",
  "see more",
  "this",
  "this link",
  "link",
  "link here",
  "go",
  "go here",
  "continue",
  "details",
  "see details",
  "more info",
  "more information",
  "info",
  "download",
  "view",
  "open",
  "visit",
  "click this link",
]);

// Classify visible link text for WCAG 2.4.4 (Link Purpose).
//   - "rawUrl"      — the visible text is the URL itself. The destination is
//                     determinable, so 2.4.4 is met (and PAC does not flag it).
//                     Surfaced as a best-practice advisory, NOT penalized.
//   - "needsFix"    — empty, a vague phrase ("click here"), or 1–2 chars. The
//                     purpose is not conveyed; this is penalized.
//   - "descriptive" — self-describing text.
type LinkClass = "descriptive" | "rawUrl" | "needsFix";

function classifyLinkText(text: string): LinkClass {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return "needsFix"; // empty link text — no purpose conveyed
  if (/^(https?:\/\/|www\.)/i.test(t)) return "rawUrl"; // visible URL — advisory
  if (VAGUE_LINK_PHRASES.has(t.replace(/[.!?:;\s]+$/g, ""))) return "needsFix";
  // 1–2 alphanumeric characters cannot describe a destination.
  if (t.replace(/[^a-z0-9]/gi, "").length <= 2) return "needsFix";
  return "descriptive";
}

function scoreLinkQuality(pdfjs: PdfjsResult): CategoryResult {
  const linkLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Create and Edit Links",
      url: "https://helpx.adobe.com/acrobat/using/accessibility-features-pdfs.html",
    },
    {
      label: "WCAG 2.4.4: Link Purpose",
      url: wcagUnderstandingUrl("link-purpose-in-context"),
    },
    {
      label: "WebAIM: Links and Hypertext",
      url: "https://webaim.org/techniques/hypertext/",
    },
  ];
  const linkExplanation =
    'Screen reader users often navigate by tabbing through links or pulling up a list of all links on the page. If a link says "https://www.example.com/reports/2024/q3/data.pdf", that\'s not useful. A descriptive label like "Q3 2024 Data Report" tells the user where the link goes without needing to see the URL.';

  if (pdfjs.links.length === 0) {
    return {
      id: "link_quality",
      label: "Link & URL Quality",
      weight: SCORING_WEIGHTS.link_quality,
      score: null,
      grade: null,
      severity: null,
      findings: [
        "No links found in this document — this category does not affect the score",
      ],
      explanation: linkExplanation,
      helpLinks: linkLinks,
    };
  }

  const classified = pdfjs.links.map((link) => ({
    link,
    cls: classifyLinkText(link.text),
  }));
  const needsFix = classified.filter((c) => c.cls === "needsFix");
  const rawUrls = classified.filter((c) => c.cls === "rawUrl");
  const descriptive = classified.filter((c) => c.cls === "descriptive");

  // Only genuinely non-descriptive text (empty / vague phrase / 1–2 chars) is
  // penalized. A visible raw URL satisfies WCAG 2.4.4 (the destination is
  // determinable) and is surfaced as advisory only — it does not lower the
  // score. This keeps the verdict aligned with WCAG and with PAC.
  const score = Math.floor(
    ((pdfjs.links.length - needsFix.length) / pdfjs.links.length) * 100,
  );
  const findings: string[] = [];

  if (needsFix.length === 0 && rawUrls.length === 0) {
    findings.push(`All ${pdfjs.links.length} link(s) use descriptive text`);
    findings.push(`--- Link Details ---`);
    for (const { link } of classified.slice(0, 20)) {
      findings.push(`  "${link.text.trim()}" → ${link.url}`);
    }
    if (pdfjs.links.length > 20) {
      findings.push(`  ... and ${pdfjs.links.length - 20} more link(s)`);
    }
  } else {
    if (needsFix.length > 0) {
      findings.push(
        `${needsFix.length} of ${pdfjs.links.length} link(s) use non-descriptive text — empty, or a vague phrase such as "click here" / "read more"`,
      );
      findings.push(`--- Links With Non-Descriptive Text ---`);
      for (const { link } of needsFix.slice(0, 15)) {
        const t = link.text.trim();
        const why = t.length === 0 ? "empty link text" : "vague phrase";
        findings.push(`  "${t}" — ${why} → ${link.url}`);
      }
      if (needsFix.length > 15) {
        findings.push(`  ... and ${needsFix.length - 15} more`);
      }
    }
    if (rawUrls.length > 0) {
      findings.push(`--- Raw URL Link Text (advisory — not penalized) ---`);
      findings.push(
        `${rawUrls.length} link(s) use the raw URL as their visible text. This satisfies WCAG 2.4.4 (the destination is determinable) and is not scored against you, but a descriptive label reads better in a screen reader's list of links.`,
      );
      for (const { link } of rawUrls.slice(0, 10)) {
        findings.push(`  "${link.text.trim()}" → ${link.url}`);
      }
      if (rawUrls.length > 10) {
        findings.push(`  ... and ${rawUrls.length - 10} more`);
      }
    }
    if (descriptive.length > 0) {
      findings.push(`--- Links With Descriptive Text ---`);
      for (const { link } of descriptive.slice(0, 10)) {
        findings.push(`  "${link.text.trim()}" → ${link.url}`);
      }
      if (descriptive.length > 10) {
        findings.push(
          `  ... and ${descriptive.length - 10} more descriptive link(s)`,
        );
      }
    }
    if (needsFix.length > 0) {
      findings.push(
        "Note: WCAG 2.4.4 is judged in context — a vague phrase can be acceptable when the surrounding sentence makes the destination clear. Review the flagged links in place; where possible, give them self-describing text.",
      );
      findings.push(
        "How to fix: In the original document (Word, InDesign, etc.), change the visible link text to something descriptive before re-exporting to PDF. In Adobe Acrobat, you can edit link properties via the Edit PDF tool.",
      );
    }
  }

  return {
    id: "link_quality",
    label: "Link & URL Quality",
    weight: SCORING_WEIGHTS.link_quality,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: linkExplanation,
    helpLinks: linkLinks,
  };
}

function scoreFormAccessibility(qpdf: QpdfResult): CategoryResult {
  const formLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Create Accessible Forms",
      url: "https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html",
    },
    {
      label: "WCAG 1.3.1: Labels for Form Fields",
      url: wcagUnderstandingUrl("info-and-relationships"),
    },
    {
      label: "WebAIM: Accessible PDF Forms",
      url: "https://webaim.org/techniques/acrobat/forms",
    },
  ];
  const formExplanation =
    'Form fields (text boxes, checkboxes, dropdowns) need a "tooltip" label (called TU in the PDF spec) so screen readers can announce what each field is for. Without a tooltip, a screen reader user encounters a text box with no indication of what to type — they hear "text field" instead of "First Name".';

  if (!qpdf.hasAcroForm || qpdf.formFields.length === 0) {
    return {
      id: "form_accessibility",
      label: "Form Accessibility",
      weight: SCORING_WEIGHTS.form_accessibility,
      score: null,
      grade: null,
      severity: null,
      findings: [
        "No form fields found in this document — this category does not affect the score",
      ],
      explanation: formExplanation,
      helpLinks: formLinks,
    };
  }

  const withLabels = qpdf.formFields.filter((f) => f.hasTU).length;
  const score = Math.floor((withLabels / qpdf.formFields.length) * 100);
  const findings: string[] = [];

  findings.push(`${qpdf.formFields.length} form field(s) detected`);

  if (withLabels === qpdf.formFields.length) {
    findings.push(`All fields have accessible tooltip labels (TU)`);
    findings.push(`--- Form Field Details ---`);
    for (const field of qpdf.formFields.slice(0, 20)) {
      findings.push(
        `  ${field.name ? `"${field.name}"` : "(unnamed)"} — has /TU label ✓`,
      );
    }
    if (qpdf.formFields.length > 20) {
      findings.push(`  ... and ${qpdf.formFields.length - 20} more field(s)`);
    }
  } else {
    findings.push(
      `${withLabels} of ${qpdf.formFields.length} field(s) have accessible labels`,
    );
    findings.push(`--- Unlabeled Form Fields ---`);
    const unlabeled = qpdf.formFields.filter((f) => !f.hasTU);
    for (const field of unlabeled.slice(0, 20)) {
      findings.push(
        `  ${field.name ? `"${field.name}"` : "(unnamed)"} — missing /TU tooltip label`,
      );
    }
    if (unlabeled.length > 20) {
      findings.push(
        `  ... and ${unlabeled.length - 20} more unlabeled field(s)`,
      );
    }
    if (withLabels > 0) {
      findings.push(`--- Labeled Form Fields ---`);
      const labeled = qpdf.formFields.filter((f) => f.hasTU);
      for (const field of labeled.slice(0, 10)) {
        findings.push(
          `  ${field.name ? `"${field.name}"` : "(unnamed)"} — has /TU label ✓`,
        );
      }
      if (labeled.length > 10) {
        findings.push(`  ... and ${labeled.length - 10} more labeled field(s)`);
      }
    }
    findings.push(
      "How to fix: In Adobe Acrobat, open All tools → Prepare a form, then right-click each field → Properties → General tab → enter a descriptive Tooltip. The tooltip becomes the accessible label that screen readers announce.",
    );
  }

  return {
    id: "form_accessibility",
    label: "Form Accessibility",
    weight: SCORING_WEIGHTS.form_accessibility,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: formExplanation,
    helpLinks: formLinks,
  };
}

function scoreReadingOrder(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
  mode: ScoringMode,
): CategoryResult {
  const readingLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Fix Reading Order",
      url: "https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html",
    },
    {
      label: "WCAG 1.3.2: Meaningful Sequence",
      url: wcagUnderstandingUrl("meaningful-sequence"),
    },
    {
      label: "WebAIM: Reading Order",
      url: "https://webaim.org/techniques/acrobat/reviewing#order",
    },
  ];
  const readingExplanation =
    "Reading order determines the sequence in which a screen reader announces content. In a visual layout, humans naturally read left-to-right, top-to-bottom. But PDFs store content in drawing order, which may not match the visual order — for example, a sidebar might be read before the main content. The tag structure tree overrides the drawing order, ensuring assistive technology reads content in the correct logical sequence.";

  if (!qpdf.hasStructTree) {
    return {
      id: "reading_order",
      label: "Reading Order",
      weight: SCORING_WEIGHTS.reading_order,
      score: 0,
      grade: "F",
      severity: "Critical",
      findings: [
        "No structure tree present — reading order cannot be determined",
        "Without a tag structure, screen readers fall back to the raw drawing order, which may not match the visual layout at all.",
        "How to fix: First add tags (All tools → Prepare for accessibility → Automatically tag PDF), then use Fix reading order (classic UI: Accessibility → Reading Order) to verify and correct the sequence.",
      ],
      explanation: readingExplanation,
      helpLinks: readingLinks,
    };
  }

  const findings: string[] = [];
  findings.push(`Structure tree depth: ${qpdf.structTreeDepth} level(s)`);
  findings.push(`Content items (MCIDs): ${qpdf.contentOrder.length}`);
  findings.push(
    `Pages: ${qpdf.totalPageCount} | Paragraphs: ${qpdf.paragraphCount} | Headings: ${qpdf.headings.length}`,
  );

  // Check tree depth (flat = bad)
  if (qpdf.structTreeDepth <= 1) {
    findings.push(
      "Structure tree is flat (no meaningful nesting) — the document has tags but they don't define a nested hierarchy.",
    );
    findings.push(
      "How to fix: Use Acrobat's Fix reading order tool (All tools → Prepare for accessibility → Fix reading order; classic UI: Accessibility → Reading Order) to reorganize the tag structure into proper sections, headings, and content blocks.",
    );
    return {
      id: "reading_order",
      label: "Reading Order",
      weight: SCORING_WEIGHTS.reading_order,
      score: 30,
      grade: getGrade(30),
      severity: getSeverity(30),
      findings,
      explanation: readingExplanation,
      helpLinks: readingLinks,
    };
  }

  // Strict: compare struct-tree MCID order (logical) against content-stream
  // MCID order (visual) per page. When both sequences are available and
  // non-trivial, emit a real score. Fall back to null only when extraction
  // failed or the sequences are too short to compare meaningfully.
  const rigorous = computeReadingOrderFidelity(qpdf, pdfjs);

  if (mode === "remediation") {
    let score = 55;

    if (qpdf.totalPageCount > 0) {
      if (qpdf.tabOrderPages === qpdf.totalPageCount) score += 20;
      else if (qpdf.tabOrderPages > 0) score += 10;
    }

    if (qpdf.contentOrder.length > 1) score += 10;
    if (qpdf.structTreeDepth >= 3) score += 5;
    if (qpdf.paragraphCount > 0 || qpdf.headings.length > 0) score += 5;

    findings.push(`--- Practical profile: reading-order readiness ---`);
    findings.push(
      "Practical mode scores this category using available reading-order proxies such as structure depth, content-order evidence, and tab-order coverage.",
    );
    if (rigorous.score !== null) {
      findings.push(
        `Rigorous struct-tree vs. content-stream order fidelity: ${rigorous.similarityPct}% across ${rigorous.pagesAnalyzed} analyzed page(s). (Not factored into the Practical score — see Strict for the rigorous verdict.)`,
      );
    }

    return {
      id: "reading_order",
      label: "Reading Order",
      weight: SCORING_WEIGHTS.reading_order,
      score: Math.min(95, score),
      grade: getGrade(Math.min(95, score)),
      severity: getSeverity(Math.min(95, score)),
      findings,
      explanation: readingExplanation,
      helpLinks: readingLinks,
    };
  }

  // Strict mode — rigorous verdict when we have enough data.
  if (rigorous.score !== null) {
    findings.push(
      `Reading-order fidelity: ${rigorous.similarityPct}% (${rigorous.pagesAnalyzed} of ${qpdf.totalPageCount} page(s) compared)`,
    );
    findings.push(
      `Compared the structure-tree MCID sequence (logical tag order) against the content-stream MCID sequence (visual draw order) on every page that had both. Higher = the tag order matches the visual flow.`,
    );
    if (rigorous.pagesWithDrift > 0) {
      findings.push(
        `${rigorous.pagesWithDrift} page(s) had noticeable drift (< 80% match). Open these in Adobe Acrobat's Reading Order or Order panels to review the tag sequence.`,
      );
    }
    if (rigorous.score < 100) {
      findings.push(
        `Reading order scored ${rigorous.score}/100 — the tagged order matched the visual draw order on ${rigorous.similarityPct}% of comparable content (a perfect 100 requires ≥ 97%). The gap is usually a few tags whose order differs slightly from the visual flow; review the page(s) noted above in Acrobat's Order panel.`,
      );
    }
    return {
      id: "reading_order",
      label: "Reading Order",
      weight: SCORING_WEIGHTS.reading_order,
      score: rigorous.score,
      grade: getGrade(rigorous.score),
      severity: getSeverity(rigorous.score),
      findings,
      explanation: readingExplanation,
      helpLinks: readingLinks,
    };
  }

  findings.push(
    "Automated reading-order verification could not be performed: the structure tree and content-stream MCID sequences did not overlap sufficiently for a meaningful comparison.",
  );
  findings.push(
    "Manual review recommended: verify the tag order in Adobe Acrobat's Reading Order / Order panels or in PAC before publishing.",
  );

  return {
    id: "reading_order",
    label: "Reading Order",
    weight: SCORING_WEIGHTS.reading_order,
    score: null,
    grade: null,
    severity: null,
    notAssessed: true,
    findings,
    explanation: readingExplanation,
    helpLinks: readingLinks,
  };
}

// The rigorous reading-order fidelity check lives in
// scoring/readingOrderFidelity.ts so the conformance gate can consume the
// same evidence (1.3.2 may only be asserted from an actual order comparison,
// never from heuristic category scores).

