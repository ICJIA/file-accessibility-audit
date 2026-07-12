/**
 * XLSX (Excel) scoring — extracted verbatim from scorer.ts in the v1.34.0
 * structural split. scorer.ts re-exports scoreXlsx from here so no other
 * file's imports need to change.
 */
import { XLSX } from "#config";
import type { CategoryResult, HelpLink } from "@file-audit/shared";
import type { XlsxAnalysis } from "../xlsxService.js";
import {
  getGrade,
  getSeverity,
  clamp100,
  aggregateScore,
  applyWcagCriteria,
  type ScoringResult,
} from "./common.js";
import { evaluateXlsxConformance } from "./conformance.js";

// ===========================================================================
// XLSX (EXCEL) SCORING
// ===========================================================================
// Maps an XlsxAnalysis onto the same CategoryResult model the PDF/DOCX/PPTX
// pipelines use, then reuses the shared aggregateScore / generateSummary /
// applyWcagCriteria helpers and the XLSX conformance gate. The PDF, DOCX, and
// PPTX paths above are untouched.

const XLSX_HELP = {
  overview: {
    label: "Microsoft: Make your Excel documents accessible",
    url: "https://support.microsoft.com/en-us/office/make-your-excel-documents-accessible-to-people-with-disabilities-6cc05fc5-1314-48b5-8eb3-683e49b3e593",
  },
  altText: {
    label: "Microsoft: Add alt text to images",
    url: "https://support.microsoft.com/en-us/office/add-alternative-text-to-a-shape-picture-chart-smartart-graphic-or-other-object-44989b2a-903c-4d9a-b742-6a75b451c669",
  },
  sheetNames: {
    label: "Microsoft: Rename a worksheet",
    url: "https://support.microsoft.com/en-us/office/rename-a-worksheet-3f1f7148-ee83-404d-8ef0-9ff99fbad1f9",
  },
  tables: {
    label: "Microsoft: Create and format tables",
    url: "https://support.microsoft.com/en-us/office/create-and-format-tables-e81aa349-b006-4f8a-9806-5af9df0ac664",
  },
  contrast: {
    label: "WebAIM: Contrast Checker",
    url: "https://webaim.org/resources/contrastchecker/",
  },
} as const;

function xlsxCategory(
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

function scoreXlsxText(): CategoryResult {
  return xlsxCategory(
    "text_extractability",
    "Text Extractability",
    XLSX.SCORING_WEIGHTS.text_extractability,
    100,
    [
      "Excel worksheets contain fully extractable, selectable text in real cells — unlike a scanned image, the content is always available to assistive technology.",
    ],
    "Excel stores real cell text (never a flat image), so screen readers can always read the values. This foundational check therefore passes automatically for .xlsx; the remaining categories assess how well that data is structured.",
    [XLSX_HELP.overview],
  );
}

function scoreXlsxTitleLanguage(a: XlsxAnalysis): CategoryResult {
  const hasTitle = !!a.metadata.title;
  const findings: string[] = [];
  if (hasTitle) {
    findings.push(`Workbook title: "${a.metadata.title}"`);
  } else {
    findings.push(
      "No workbook title is set. In Excel: File → Info → Properties → Title. Screen readers announce the title (or the filename if none) when the workbook opens.",
    );
  }
  findings.push(
    "Excel does not store a document language, so WCAG 3.1.1 (Language of Page) is not automatically assessed for Excel workbooks.",
  );
  return xlsxCategory(
    "title_language",
    "Title & Language",
    XLSX.SCORING_WEIGHTS.title_language,
    hasTitle ? 100 : 0,
    findings,
    "A meaningful workbook title is announced by screen readers when the file opens. Unlike Word or PowerPoint, Excel workbooks have no document-language property to declare, so that half of this check is always not assessed.",
    [XLSX_HELP.overview],
  );
}

function scoreXlsxSheetNames(a: XlsxAnalysis): CategoryResult {
  const visible = a.sheets.filter((s) => !s.hidden);
  if (visible.length === 0) {
    return xlsxCategory(
      "sheet_names",
      "Sheet Names",
      XLSX.SCORING_WEIGHTS.sheet_names,
      null,
      ["No visible sheets were found."],
      'Descriptive sheet names (not Excel defaults like "Sheet1") are the workbook\'s navigation — screen-reader users hear them when switching sheets.',
      [XLSX_HELP.sheetNames],
      false,
    );
  }
  const defaultNamed = visible.filter((s) => s.defaultNamed);
  const findings =
    defaultNamed.length === 0
      ? [`All ${visible.length} visible sheet(s) have descriptive names.`]
      : defaultNamed.map(
          (s) =>
            `Rename "${s.name}" to describe its contents — sheet names are the workbook's navigation.`,
        );
  return xlsxCategory(
    "sheet_names",
    "Sheet Names",
    XLSX.SCORING_WEIGHTS.sheet_names,
    clamp100(100 - 25 * defaultNamed.length),
    findings,
    'Descriptive sheet names (not Excel defaults like "Sheet1") are the workbook\'s navigation — screen-reader users hear them when switching sheets.',
    [XLSX_HELP.sheetNames],
  );
}

function scoreXlsxTableMarkup(a: XlsxAnalysis): CategoryResult {
  const hasDataSheet = a.sheets.some((s) => s.usedRangeCellCount >= 12);
  if (a.tables.length === 0 && !hasDataSheet) {
    return xlsxCategory(
      "table_markup",
      "Table Markup",
      XLSX.SCORING_WEIGHTS.table_markup,
      null,
      ["No tables or sizable data ranges were found."],
      "Data laid out as a real Excel Table (with a header row) lets screen readers announce the relevant column header as a user moves across cells. Plain ranges of typed cells carry no such structure.",
      [XLSX_HELP.tables],
      false,
    );
  }

  let score = 100;
  const findings: string[] = [`${a.tables.length} defined table(s) found.`];

  const headerless = a.tables.filter((t) => !t.hasHeaderRow);
  if (headerless.length > 0) {
    score -= 30 * headerless.length;
    findings.push(
      `${headerless.length} table(s) have no header row: ${headerless
        .map((t) => `"${t.name}" on "${t.sheetName}"`)
        .join(", ")}. In Excel: select the table → Table Design → check "Header Row".`,
    );
  }

  const datafulWithoutTable = a.sheets.some(
    (s) => s.usedRangeCellCount >= 12 && !s.hasDefinedTable,
  );
  if (datafulWithoutTable) {
    score -= 10;
    findings.push(
      "Advisory: some worksheet data is laid out as a plain cell range rather than a defined Excel Table. In Excel: select the range → Insert → Table so screen readers can navigate it by header.",
    );
  }

  const mergedSheets = a.sheets.filter((s) => s.mergedRangeCount > 0);
  if (mergedSheets.length > 0) {
    score -= Math.min(15, 5 * mergedSheets.length);
    findings.push(
      `Advisory: ${mergedSheets.length} sheet(s) contain merged cells (${mergedSheets
        .map((s) => `"${s.name}": ${s.mergedRangeCount}`)
        .join(
          ", ",
        )}), which can confuse screen-reader navigation. Avoid merged cells where possible.`,
    );
  }

  return xlsxCategory(
    "table_markup",
    "Table Markup",
    XLSX.SCORING_WEIGHTS.table_markup,
    clamp100(score),
    findings,
    "Data laid out as a real Excel Table (with a header row) lets screen readers announce the relevant column header as a user moves across cells. Merged cells and plain, unstructured ranges are harder to navigate.",
    [XLSX_HELP.tables],
  );
}

function scoreXlsxAltText(a: XlsxAnalysis): CategoryResult {
  if (a.images.length === 0) {
    return xlsxCategory(
      "alt_text",
      "Alt Text on Images",
      XLSX.SCORING_WEIGHTS.alt_text,
      null,
      ["No images were found."],
      "Every meaningful image, chart, or graphic needs alternative text describing it for screen-reader users. Decorative images should be marked decorative instead.",
      [XLSX_HELP.altText],
      false,
    );
  }
  const nonDec = a.images.filter((i) => !i.decorative);
  if (nonDec.length === 0) {
    return xlsxCategory(
      "alt_text",
      "Alt Text on Images",
      XLSX.SCORING_WEIGHTS.alt_text,
      100,
      ["All images are marked decorative, so none require alt text."],
      "Every meaningful image, chart, or graphic needs alternative text describing it for screen-reader users. Decorative images should be marked decorative instead.",
      [XLSX_HELP.altText],
    );
  }
  const missingAlt = nonDec.filter((i) => !i.altText || i.altText.trim().length === 0);
  const score = Math.round((100 * (nonDec.length - missingAlt.length)) / nonDec.length);
  const findings = [
    `${nonDec.length - missingAlt.length} of ${nonDec.length} meaningful image(s) have alt text.`,
  ];
  if (missingAlt.length > 0) {
    findings.push(
      `${missingAlt.length} image(s) are missing alt text. In Excel: right-click each image → Edit Alt Text and add a description.`,
    );
  }
  return xlsxCategory(
    "alt_text",
    "Alt Text on Images",
    XLSX.SCORING_WEIGHTS.alt_text,
    clamp100(score),
    findings,
    "Screen readers announce an image's alt text in place of the image. Without it, the image's information is lost.",
    [XLSX_HELP.altText],
  );
}

function scoreXlsxColorContrast(a: XlsxAnalysis): CategoryResult {
  const { checkedRuns, unresolvedRuns, failing } = a.contrast;
  if (checkedRuns === 0) {
    return xlsxCategory(
      "color_contrast",
      "Color Contrast",
      XLSX.SCORING_WEIGHTS.color_contrast,
      null,
      [
        "No cell styles with explicit font and solid-fill colors were found; theme and indexed colors are not resolved.",
      ],
      "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). Excel stores explicit cell-style colors, so this is checked directly where both a font color and a solid fill are set.",
      [XLSX_HELP.contrast],
      unresolvedRuns > 0,
    );
  }
  if (failing.length === 0) {
    return xlsxCategory(
      "color_contrast",
      "Color Contrast",
      XLSX.SCORING_WEIGHTS.color_contrast,
      100,
      [`${checkedRuns} cell style(s) checked; all meet the WCAG contrast minimum.`],
      "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). Excel stores explicit cell-style colors, so this is checked directly where both a font color and a solid fill are set.",
      [XLSX_HELP.contrast],
    );
  }
  // Proportion of checked cell styles that pass, capped at 85 — mirroring
  // scoreDocxContrast/scorePptxColorContrast. A flat per-style subtraction
  // let a workbook where EVERY checked style fails still read as "Minor";
  // failing 100% of checked styles must not score anywhere near that.
  const score = Math.min(85, Math.round(((checkedRuns - failing.length) / checkedRuns) * 100));
  const worst = failing.reduce((x, y) => (x.ratio < y.ratio ? x : y));
  const findings = [
    `${checkedRuns} cell style(s) checked; ${failing.length} below the WCAG contrast minimum.`,
    `Lowest contrast ${worst.ratio}:1 (${worst.foreground} on ${worst.background}). Needs ≥4.5:1 (≥3:1 for large text).`,
  ];
  return xlsxCategory(
    "color_contrast",
    "Color Contrast",
    XLSX.SCORING_WEIGHTS.color_contrast,
    clamp100(score),
    findings,
    "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). Excel stores explicit cell-style colors, so this is checked directly where both a font color and a solid fill are set.",
    [XLSX_HELP.contrast],
  );
}

const XLSX_RAW_URL_RE = /^(https?:\/\/|www\.)/i;

function scoreXlsxLinkQuality(a: XlsxAnalysis): CategoryResult {
  if (a.links.length === 0) {
    return xlsxCategory(
      "link_quality",
      "Link Quality",
      XLSX.SCORING_WEIGHTS.link_quality,
      null,
      ["No hyperlinks were found."],
      "Link text should describe the destination. Empty link text and raw URLs are unhelpful out of context.",
      [XLSX_HELP.overview],
      false,
    );
  }
  const bad = a.links.filter((l) => !l.text || XLSX_RAW_URL_RE.test(l.text));
  const score = Math.round((100 * (a.links.length - bad.length)) / a.links.length);
  const findings = [`${a.links.length} link(s) found; ${bad.length} with unclear text.`];
  if (bad.length > 0) {
    findings.push(
      `Empty or raw-URL link text: ${bad
        .slice(0, 5)
        .map((l) => (l.text ? `"${l.text}"` : "(empty)"))
        .join(
          ", ",
        )}. In Excel: right-click the cell → Edit Link, and use a descriptive phrase instead of the raw address.`,
    );
  }
  return xlsxCategory(
    "link_quality",
    "Link Quality",
    XLSX.SCORING_WEIGHTS.link_quality,
    clamp100(score),
    findings,
    "Screen-reader users often pull up a list of links out of context, so each link's text must describe where it goes rather than showing a raw URL.",
    [XLSX_HELP.overview],
  );
}

function scoreXlsxForms(): CategoryResult {
  return xlsxCategory(
    "form_accessibility",
    "Form Accessibility",
    0,
    null,
    [
      "Interactive form controls are uncommon in Excel workbooks and are not automatically assessed in this version.",
    ],
    "Interactive form fields need accessible labels. They are rare in Excel workbooks and are not assessed automatically here.",
    [XLSX_HELP.overview],
    true,
  );
}

function buildXlsxCategories(a: XlsxAnalysis): CategoryResult[] {
  const categories = [
    scoreXlsxText(),
    scoreXlsxTitleLanguage(a),
    scoreXlsxSheetNames(a),
    scoreXlsxTableMarkup(a),
    scoreXlsxAltText(a),
    scoreXlsxColorContrast(a),
    scoreXlsxLinkQuality(a),
    scoreXlsxForms(),
  ];
  applyWcagCriteria(categories);
  return categories;
}

/**
 * Score an Excel (.xlsx) workbook. Produces the same ScoringResult shape as
 * scoreDocument (PDF) / scoreDocx / scorePptx, minus the PDF-only pdfUa/
 * adobeParity signals, so it flows through the existing report UI unchanged.
 */
export function scoreXlsx(analysis: XlsxAnalysis): ScoringResult {
  const categories = buildXlsxCategories(analysis);
  const conformance = evaluateXlsxConformance(analysis);
  const aggregate = aggregateScore(categories, false, "strict", conformance, "Excel workbook");
  return {
    overallScore: aggregate.overallScore,
    grade: aggregate.grade,
    isScanned: false,
    executiveSummary: aggregate.executiveSummary,
    categories,
    warnings: [],
    scoringMode: "strict",
    scoreProfiles: { strict: aggregate.profile, remediation: aggregate.profile },
    conformance,
    // pdfUa and adobeParity are intentionally omitted — PDF-only signals.
  };
}
