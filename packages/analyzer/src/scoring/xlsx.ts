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
  classifyLinkText,
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

function scoreXlsxText(a: XlsxAnalysis): CategoryResult {
  // The old version asserted "fully extractable text in real cells"
  // UNCONDITIONALLY — including for workbooks whose entire narrative lives
  // in drawing text boxes over an empty grid, or that are one pasted
  // screenshot. The claim is now keyed to evidence.
  if (a.totalCellsWithValue === 0) {
    const findings = [
      "No cell values were found in this workbook's visible sheets, so the usual Excel guarantee — extractable text in real cells — does not apply here.",
    ];
    if (a.textBoxCount > 0) {
      findings.push(
        `${a.textBoxCount} drawing text box(es) hold this workbook's text content. Text boxes float over the grid and are not reached by cell navigation — move important narrative into real cells where possible.`,
      );
    }
    findings.push("Text extractability was not assessed for this workbook.");
    return xlsxCategory(
      "text_extractability",
      "Text Extractability",
      XLSX.SCORING_WEIGHTS.text_extractability,
      null,
      findings,
      "Excel normally stores real cell text screen readers can always read; this workbook has no cell values, so that guarantee could not be confirmed.",
      [XLSX_HELP.overview],
      true,
    );
  }
  const findings = [
    `${a.totalCellsWithValue.toLocaleString()} cell(s) contain extractable, selectable values — unlike a scanned image, this content is always available to assistive technology.`,
  ];
  if (a.textBoxCount > 0) {
    findings.push(
      `Note: ${a.textBoxCount} drawing text box(es) also hold text that cell-based checks do not audit.`,
    );
  }
  return xlsxCategory(
    "text_extractability",
    "Text Extractability",
    XLSX.SCORING_WEIGHTS.text_extractability,
    100,
    findings,
    "Excel stores real cell text (never a flat image), so screen readers can always read the values. The remaining categories assess how well that data is structured.",
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
    // 50, not 0: a missing title costs HALF this category in every other
    // format (language being structurally absent in Excel is not the
    // author's fault and must not double the penalty).
    hasTitle ? 100 : 50,
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
  // Proportional with floor/cap (mirrors slide titles): the old −25 per
  // sheet zeroed a 20-sheet workbook over 4 leftover names while barely
  // touching a 2-sheet one.
  const score =
    defaultNamed.length === 0
      ? 100
      : Math.max(
          40,
          Math.min(
            85,
            Math.round((100 * (visible.length - defaultNamed.length)) / visible.length),
          ),
        );
  return xlsxCategory(
    "sheet_names",
    "Sheet Names",
    XLSX.SCORING_WEIGHTS.sheet_names,
    score,
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

  // Dataful sheets with no header semantics anywhere. Pivot sheets are
  // excluded — pivots materialize as plain cells and cannot be converted to
  // an Excel Table, so the advice would be wrong for them.
  const datafulWithoutTable = a.sheets.some(
    (s) => !s.hidden && s.usedRangeCellCount >= 12 && !s.hasDefinedTable && !s.hasPivot,
  );
  if (datafulWithoutTable && a.tables.length === 0) {
    // No header semantics in the whole workbook — the format's stated
    // fundamental. The old "Advisory: −10" both under-penalized it and broke
    // the advisory-means-unscored promise; 60 (Moderate) reflects the config's
    // own weighting of table structure.
    score = Math.min(score, 60);
    findings.push(
      "Worksheet data is laid out as plain cell ranges with no defined Excel Table anywhere, so screen readers cannot announce column headers while navigating. In Excel: select each data range → Insert → Table.",
    );
  } else if (datafulWithoutTable) {
    findings.push(
      "Note — not scored: some worksheet data sits outside the defined table(s) as plain ranges. Consider Insert → Table for those ranges too.",
    );
  }

  const pivotSheets = a.sheets.filter((s) => !s.hidden && s.hasPivot);
  if (pivotSheets.length > 0) {
    findings.push(
      `Note — not scored: ${pivotSheets.length} sheet(s) contain pivot tables (${pivotSheets
        .map((s) => `"${s.name}"`)
        .join(", ")}). Pivots cannot become Excel Tables; verify their readability manually.`,
    );
  }

  const mergedSheets = a.sheets.filter((s) => !s.hidden && s.mergedRangeCount > 0);
  if (mergedSheets.length > 0) {
    findings.push(
      `Note — not scored: ${mergedSheets.length} sheet(s) contain merged cells (${mergedSheets
        .map((s) => `"${s.name}": ${s.mergedRangeCount}`)
        .join(
          ", ",
        )}), which can confuse screen-reader navigation. Whether they harm depends on placement — review manually.`,
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
    // N/A, matching DOCX: an all-decorative workbook has nothing to assess —
    // returning 100 lifted the weighted average as a reward for absence.
    return xlsxCategory(
      "alt_text",
      "Alt Text on Images",
      XLSX.SCORING_WEIGHTS.alt_text,
      null,
      ["All images are marked decorative, so none require alt text."],
      "Every meaningful image, chart, or graphic needs alternative text describing it for screen-reader users. Decorative images should be marked decorative instead.",
      [XLSX_HELP.altText],
      false,
    );
  }
  const missingAlt = nonDec.filter((i) => !i.altText || i.altText.trim().length === 0);
  let score = Math.round((100 * (nonDec.length - missingAlt.length)) / nonDec.length);
  const findings = [
    `${nonDec.length - missingAlt.length} of ${nonDec.length} meaningful image(s) have alt text.`,
  ];
  if (missingAlt.length > 0) {
    // Cap 85 (Minor ceiling) whenever any image lacks alt — cross-format
    // convention shared with DOCX so one barrier has one grade consequence.
    score = Math.min(score, 85);
    findings.push(
      `${missingAlt.length} image(s) are missing alt text. In Excel: right-click each image → Edit Alt Text and add a description.`,
    );
    const titleOnly = nonDec.filter((i) => i.titleOnly && !i.altText).length;
    if (titleOnly > 0) {
      findings.push(
        `${titleOnly} of those have only the Title property filled — screen readers read the Description (alt text) field, not Title.`,
      );
    }
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
  // Unresolved links (no cell text AND no display attribute in the file)
  // cannot be judged — excluding them beats calling a working link "(empty)".
  const assessable = a.links.filter((l) => l.resolved);
  const unresolvedCount = a.links.length - assessable.length;
  if (assessable.length === 0) {
    return xlsxCategory(
      "link_quality",
      "Link Quality",
      XLSX.SCORING_WEIGHTS.link_quality,
      null,
      [
        `${a.links.length} link(s) found, but their text could not be resolved from the file — link quality was not assessed.`,
      ],
      "Link text should describe the destination. Empty link text and raw URLs are unhelpful out of context.",
      [XLSX_HELP.overview],
      true,
    );
  }
  // Shared 2.4.4 doctrine (scoring/common.ts): raw URLs are advisory-only;
  // empty/vague/too-short text is penalized.
  const needsFix = assessable.filter((l) => classifyLinkText(l.text) === "needsFix");
  const rawUrls = assessable.filter((l) => classifyLinkText(l.text) === "rawUrl");
  const score = Math.round((100 * (assessable.length - needsFix.length)) / assessable.length);
  const findings = [`${assessable.length} link(s) assessed; ${needsFix.length} with unclear text.`];
  if (unresolvedCount > 0) {
    findings.push(
      `${unresolvedCount} additional link(s) had no resolvable text in the file and were not assessed.`,
    );
  }
  if (needsFix.length > 0) {
    findings.push(
      `Empty or vague link text: ${needsFix
        .slice(0, 5)
        .map((l) => (l.text ? `"${l.text}"` : "(empty)"))
        .join(
          ", ",
        )}. In Excel: right-click the cell → Edit Link, and use a descriptive phrase.`,
    );
  }
  if (rawUrls.length > 0) {
    findings.push(
      `Advisory — not scored against you: ${rawUrls.length} link(s) show the raw URL as their visible text. This satisfies WCAG 2.4.4, but a descriptive label reads better in a screen reader's list of links.`,
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
    scoreXlsxText(a),
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
