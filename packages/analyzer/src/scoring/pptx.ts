/**
 * PPTX (PowerPoint) scoring — extracted verbatim from scorer.ts in the
 * v1.34.0 structural split. scorer.ts re-exports scorePptx from here so no
 * other file's imports need to change.
 */
import { PPTX } from "#config";
import type { CategoryResult, HelpLink } from "@file-audit/shared";
import type { PptxAnalysis } from "../pptxService.js";
import {
  getGrade,
  getSeverity,
  classifyLinkText,
  clamp100,
  aggregateScore,
  applyWcagCriteria,
  type ScoringResult,
} from "./common.js";
import { evaluatePptxConformance } from "./conformance.js";

// ===========================================================================
// PPTX (POWERPOINT) SCORING
// ===========================================================================
// Maps a PptxAnalysis onto the same CategoryResult model the PDF/DOCX
// pipelines use, then reuses the shared aggregateScore / generateSummary /
// applyWcagCriteria helpers and the PPTX conformance gate. The PDF and DOCX
// paths above are untouched.

const PPTX_HELP = {
  overview: {
    label: "Microsoft: Make your PowerPoint presentations accessible",
    url: "https://support.microsoft.com/en-us/office/make-your-powerpoint-presentations-accessible-to-people-with-disabilities-6f7772b2-2f33-4bd2-8ca7-dae3b2b3ef25",
  },
  altText: {
    label: "Microsoft: Add alt text to images",
    url: "https://support.microsoft.com/en-us/office/add-alternative-text-to-a-shape-picture-chart-smartart-graphic-or-other-object-44989b2a-903c-4d9a-b742-6a75b451c669",
  },
  slideTitles: {
    label: "Microsoft: Title a slide",
    url: "https://support.microsoft.com/en-us/office/title-a-slide-c5286802-495a-4b47-a844-c7d6ac1c8dd5",
  },
  contrast: {
    label: "WebAIM: Contrast Checker",
    url: "https://webaim.org/resources/contrastchecker/",
  },
} as const;

function pptxCategory(
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

function scorePptxText(): CategoryResult {
  return pptxCategory(
    "text_extractability",
    "Text Extractability",
    PPTX.SCORING_WEIGHTS.text_extractability,
    100,
    [
      "PowerPoint slides contain fully extractable, selectable text — unlike a scanned image, the content is always available to assistive technology.",
    ],
    "PowerPoint stores real text (never a flat image), so screen readers can always read the words. This foundational check therefore passes automatically for .pptx; the remaining categories assess how well that text is structured.",
    [PPTX_HELP.overview],
  );
}

function scorePptxTitleLanguage(a: PptxAnalysis): CategoryResult {
  let score = 0;
  const findings: string[] = [];
  if (a.metadata.title) {
    score += 50;
    findings.push(`Presentation title: "${a.metadata.title}"`);
  } else {
    findings.push(
      "No presentation title is set. In PowerPoint: File → Info → Properties → Title. Screen readers announce the title (or the filename if none) when the presentation opens.",
    );
  }
  if (a.metadata.language) {
    score += 50;
    findings.push(`Presentation language: ${a.metadata.language}`);
  } else {
    findings.push(
      "No default presentation language is declared. In PowerPoint this comes from the presentation's default language setting; it tells screen readers which pronunciation rules to use.",
    );
  }
  return pptxCategory(
    "title_language",
    "Title & Language",
    PPTX.SCORING_WEIGHTS.title_language,
    score,
    findings,
    "A meaningful presentation title and a declared language are announced by screen readers when the file opens. Both come from the PowerPoint file's properties.",
    [PPTX_HELP.overview],
  );
}

function scorePptxSlideTitles(a: PptxAnalysis): CategoryResult {
  if (a.slides.length === 0) {
    return pptxCategory(
      "slide_titles",
      "Slide Titles",
      PPTX.SCORING_WEIGHTS.slide_titles,
      null,
      ["No slides were found."],
      "Every slide needs a title placeholder so screen-reader users can tell slides apart and jump directly to one — PowerPoint's equivalent of a heading. This presentation has no slides to assess.",
      [PPTX_HELP.slideTitles],
      false,
    );
  }

  // Hidden slides are not presented — they neither need titles nor belong in
  // the outline judgment.
  const visible = a.slides.filter((s) => !s.hidden);
  const hiddenCount = a.slides.length - visible.length;
  const untitled = visible.filter((s) => !s.title);
  const titleGroups = new Map<string, number[]>();
  for (const s of visible) {
    if (!s.title) continue;
    const idx = titleGroups.get(s.title) ?? [];
    idx.push(s.index);
    titleGroups.set(s.title, idx);
  }
  const duplicateGroups = [...titleGroups.entries()].filter(([, idx]) => idx.length > 1);

  // Proportional with a floor and cap — the old linear −20/slide scored a
  // 100-slide deck with 95 titled slides (95% compliant) an identical 0 to
  // an all-untitled deck. Ratio-based mirrors the alt-text convention; the
  // cap keeps any untitled slide out of "No issues found", the floor keeps
  // small decks from cratering on one miss.
  let score =
    untitled.length > 0
      ? Math.max(
          40,
          Math.min(85, Math.round((100 * (visible.length - untitled.length)) / visible.length)),
        )
      : 100;
  const findings: string[] = [];

  if (untitled.length > 0) {
    const nums = untitled.map((s) => s.index).join(", ");
    findings.push(
      `Slide${untitled.length > 1 ? "s" : ""} ${nums} ${
        untitled.length > 1 ? "have" : "has"
      } no title. In PowerPoint: use the Outline view (View → Outline) or a layout with a title placeholder so every slide has one.`,
    );
  }

  if (duplicateGroups.length > 0) {
    score -= Math.min(30, 10 * duplicateGroups.length);
    for (const [title, idx] of duplicateGroups) {
      findings.push(
        `${idx.length} slides share the title "${title}". Give each slide a distinct, descriptive title so screen-reader users can tell them apart in the outline.`,
      );
    }
  }

  if (hiddenCount > 0) {
    findings.push(`${hiddenCount} hidden slide(s) were excluded from title judgment.`);
  }
  if (untitled.length === 0 && duplicateGroups.length === 0) {
    findings.push(`All ${visible.length} visible slide(s) have a distinct title.`);
  }

  return pptxCategory(
    "slide_titles",
    "Slide Titles",
    PPTX.SCORING_WEIGHTS.slide_titles,
    clamp100(score),
    findings,
    "Each slide's title placeholder lets screen-reader users tell slides apart in the outline and jump directly to one — PowerPoint's equivalent of a heading.",
    [PPTX_HELP.slideTitles],
  );
}

function scorePptxAltText(a: PptxAnalysis): CategoryResult {
  if (a.images.length === 0) {
    return pptxCategory(
      "alt_text",
      "Alt Text on Images",
      PPTX.SCORING_WEIGHTS.alt_text,
      null,
      ["No images were found."],
      "Every meaningful image, chart, or graphic needs alternative text describing it for screen-reader users. Decorative images should be marked decorative instead.",
      [PPTX_HELP.altText],
      false,
    );
  }
  const nonDecorative = a.images.filter((i) => !i.decorative);
  if (nonDecorative.length === 0) {
    // N/A, matching DOCX: nothing to assess — a vacuous 100 lifted the
    // weighted average as a reward for absence.
    return pptxCategory(
      "alt_text",
      "Alt Text on Images",
      PPTX.SCORING_WEIGHTS.alt_text,
      null,
      ["All images are marked decorative, so none require alt text."],
      "Every meaningful image, chart, or graphic needs alternative text describing it for screen-reader users. Decorative images should be marked decorative instead.",
      [PPTX_HELP.altText],
      false,
    );
  }
  const missing = nonDecorative.filter((i) => !i.altText);
  let score = Math.round((100 * (nonDecorative.length - missing.length)) / nonDecorative.length);
  // Cap 85 (Minor ceiling) whenever any image lacks alt — cross-format
  // convention shared with DOCX so one barrier has one grade consequence.
  if (missing.length > 0) score = Math.min(score, 85);
  const findings = [
    `${nonDecorative.length - missing.length} of ${nonDecorative.length} meaningful image(s) have alt text.`,
  ];
  if (missing.length > 0) {
    findings.push(
      `${missing.length} image(s) are missing alt text. In PowerPoint: right-click each image → Edit Alt Text and add a description.`,
    );
  }
  return pptxCategory(
    "alt_text",
    "Alt Text on Images",
    PPTX.SCORING_WEIGHTS.alt_text,
    clamp100(score),
    findings,
    "Screen readers announce an image's alt text in place of the image. Without it, the image's information is lost.",
    [PPTX_HELP.altText],
  );
}

function scorePptxReadingOrder(a: PptxAnalysis): CategoryResult {
  const visible = a.slides.filter((s) => !s.hidden);
  const titled = visible.filter((s) => s.title);
  // The only order signal this check has is "the title reads first" — with
  // no titled visible slides there is nothing to verify, and returning a
  // vacuous 100 partially refunded the slide_titles zero it accompanied.
  if (titled.length === 0) {
    return pptxCategory(
      "reading_order",
      "Reading Order",
      PPTX.SCORING_WEIGHTS.reading_order,
      null,
      [
        "No titled slides to order-check — reading order was not assessed. Verify manually with the Tab key or the Selection Pane.",
      ],
      "Reading order determines the sequence assistive technology announces a slide's content. A slide's title should read first, orienting the listener before the body content.",
      [PPTX_HELP.overview],
      true,
    );
  }
  const titledOutOfOrder = titled.filter((s) => !s.titleIsFirstShape);
  const denseSlides = visible.filter((s) => s.shapeCount > 10);

  const score = 100 - 15 * titledOutOfOrder.length;
  const findings: string[] = [];

  if (titledOutOfOrder.length > 0) {
    const nums = titledOutOfOrder.map((s) => s.index).join(", ");
    findings.push(
      `Slide${titledOutOfOrder.length > 1 ? "s" : ""} ${nums} ${
        titledOutOfOrder.length > 1 ? "have" : "has"
      } a title that is not the first shape in reading order. In PowerPoint: open the Selection Pane (Home → Arrange → Selection Pane) and reorder shapes so the title reads first.`,
    );
  }

  if (denseSlides.length > 0) {
    const nums = denseSlides.map((s) => `${s.index} (${s.shapeCount} shapes)`).join(", ");
    findings.push(
      `Slide${denseSlides.length > 1 ? "s" : ""} ${nums} ${
        denseSlides.length > 1 ? "have" : "has"
      } more than 10 shapes. Dense slides are hard to verify automatically — check the reading order manually with the Tab key or the Selection Pane.`,
    );
  }

  if (findings.length === 0) {
    findings.push("Every titled slide's title reads first in tab order.");
  }

  return pptxCategory(
    "reading_order",
    "Reading Order",
    PPTX.SCORING_WEIGHTS.reading_order,
    clamp100(score),
    findings,
    "Reading order determines the sequence assistive technology announces a slide's content. A slide's title should read first, orienting the listener before the body content.",
    [PPTX_HELP.overview],
    false,
  );
}

function scorePptxTableMarkup(a: PptxAnalysis): CategoryResult {
  if (a.tables.length === 0) {
    return pptxCategory(
      "table_markup",
      "Table Markup",
      PPTX.SCORING_WEIGHTS.table_markup,
      null,
      ["No tables were found."],
      "Data tables need a marked header row so screen readers can associate each cell with its column header.",
      [PPTX_HELP.overview],
      false,
    );
  }
  const dataTablesNoHeader = a.tables.filter(
    (t) => t.rowCount >= 2 && t.colCount >= 2 && !t.hasHeaderRow,
  );
  // Per-table average, mirroring scoreDocxTables: a data table with no header
  // row scores 30 (a severe but not zero violation — the table's cell text is
  // still readable, just unassociated with its header), not a flat per-table
  // subtraction from 100. A single unheadered table should not read as
  // "Minor" (70+) when it is the deck's only table.
  const perTable = a.tables.map((t) => {
    const isData = t.rowCount >= 2 && t.colCount >= 2;
    return !isData || t.hasHeaderRow ? 100 : 30;
  });
  const score = Math.round(perTable.reduce((x, y) => x + y, 0) / perTable.length);
  const findings = [`${a.tables.length} table(s) found.`];
  if (dataTablesNoHeader.length > 0) {
    findings.push(
      `${dataTablesNoHeader.length} data table(s) have no header row. In PowerPoint: select the table → Table Design → check "Header Row", and mark the top row's cells as headers.`,
    );
  }
  return pptxCategory(
    "table_markup",
    "Table Markup",
    PPTX.SCORING_WEIGHTS.table_markup,
    clamp100(score),
    findings,
    "A designated header row lets screen readers announce the relevant header as a user moves across a data table's cells.",
    [PPTX_HELP.overview],
  );
}

function scorePptxColorContrast(a: PptxAnalysis): CategoryResult {
  const { checkedRuns, unresolvedRuns, failing } = a.contrast;
  if (checkedRuns === 0) {
    return pptxCategory(
      "color_contrast",
      "Color Contrast",
      PPTX.SCORING_WEIGHTS.color_contrast,
      null,
      [
        "No text with an explicit color was found; inherited and unresolvable fills are not checked.",
      ],
      "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). PowerPoint stores explicit run and shape fill colors, so this is checked directly where colors are set.",
      [PPTX_HELP.contrast],
      unresolvedRuns > 0,
    );
  }
  if (failing.length === 0) {
    return pptxCategory(
      "color_contrast",
      "Color Contrast",
      PPTX.SCORING_WEIGHTS.color_contrast,
      100,
      [`${checkedRuns} colored text run(s) checked; all meet the WCAG contrast minimum.`],
      "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). PowerPoint stores explicit run and shape fill colors, so this is checked directly where colors are set.",
      [PPTX_HELP.contrast],
    );
  }
  // Proportion of checked runs that pass, capped at 85 — mirroring
  // scoreDocxContrast. A flat per-run subtraction let a deck where EVERY
  // checked run fails still read as "Minor"; failing 100% of checked runs
  // must not score anywhere near that.
  const score = Math.min(85, Math.round(((checkedRuns - failing.length) / checkedRuns) * 100));
  const worst = failing.reduce((x, y) => (x.ratio < y.ratio ? x : y));
  const findings = [
    `${checkedRuns} colored text run(s) checked; ${failing.length} below the WCAG minimum.`,
    `Lowest contrast ${worst.ratio}:1 (${worst.foreground} on ${worst.background}). Needs ≥4.5:1 (≥3:1 for large text).`,
  ];
  return pptxCategory(
    "color_contrast",
    "Color Contrast",
    PPTX.SCORING_WEIGHTS.color_contrast,
    clamp100(score),
    findings,
    "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). PowerPoint stores explicit run and shape fill colors, so this is checked directly where colors are set.",
    [PPTX_HELP.contrast],
  );
}

function scorePptxListStructure(a: PptxAnalysis): CategoryResult {
  const { realListItems, manualBulletParagraphs } = a.lists;
  if (realListItems === 0 && manualBulletParagraphs === 0) {
    return pptxCategory(
      "list_structure",
      "List Structure",
      PPTX.SCORING_WEIGHTS.list_structure,
      null,
      ["No lists were found."],
      "Real bulleted/numbered list formatting lets screen readers announce list structure and item counts. Manually-typed bullet characters do not.",
      [PPTX_HELP.overview],
      false,
    );
  }
  if (manualBulletParagraphs === 0) {
    return pptxCategory(
      "list_structure",
      "List Structure",
      PPTX.SCORING_WEIGHTS.list_structure,
      100,
      [
        `${realListItems} real list item(s) found; all use PowerPoint's bullet/numbering formatting.`,
      ],
      "Real bulleted/numbered list formatting lets screen readers announce list structure and item counts. Manually-typed bullet characters do not.",
      [PPTX_HELP.overview],
    );
  }
  // Proportion of list paragraphs using real formatting, capped at 85 —
  // mirroring scoreDocxLists. A flat per-paragraph subtraction let a slide
  // with NO real list formatting (0 of N items real) still score 70+; a deck
  // that is 100% manually-typed bullets is not a "Minor" list problem.
  const total = realListItems + manualBulletParagraphs;
  const score = Math.min(85, Math.round((realListItems / total) * 100));
  const findings = [
    `${realListItems} real list item(s); ${manualBulletParagraphs} manually-typed bullet paragraph(s).`,
    `${manualBulletParagraphs} paragraph(s) use typed characters (e.g. "-" or "*") instead of PowerPoint's bullet/numbering formatting. In PowerPoint: select the text → Home → Bullets/Numbering.`,
  ];
  return pptxCategory(
    "list_structure",
    "List Structure",
    PPTX.SCORING_WEIGHTS.list_structure,
    clamp100(score),
    findings,
    "Screen readers announce 'list, N items' and each item's position only for real PowerPoint list formatting — not for hand-typed bullet characters.",
    [PPTX_HELP.overview],
  );
}

function scorePptxLinkQuality(a: PptxAnalysis): CategoryResult {
  if (a.links.length === 0) {
    return pptxCategory(
      "link_quality",
      "Link Quality",
      PPTX.SCORING_WEIGHTS.link_quality,
      null,
      ["No hyperlinks were found."],
      "Link text should describe the destination. Empty or vague link text is unhelpful out of context.",
      [PPTX_HELP.overview],
      false,
    );
  }
  // Shared 2.4.4 doctrine (scoring/common.ts): raw URLs are advisory-only;
  // empty/vague/too-short text is penalized. The old rule penalized raw URLs
  // but let "click here" pass untouched — backwards on both counts.
  const needsFix = a.links.filter((l) => classifyLinkText(l.text) === "needsFix");
  const rawUrls = a.links.filter((l) => classifyLinkText(l.text) === "rawUrl");
  const score = Math.round((100 * (a.links.length - needsFix.length)) / a.links.length);
  const findings = [`${a.links.length} link(s) found; ${needsFix.length} with unclear text.`];
  if (needsFix.length > 0) {
    findings.push(
      `Empty or vague link text: ${needsFix
        .slice(0, 5)
        .map((l) => (l.text.trim() ? `"${l.text}"` : "(empty)"))
        .join(
          ", ",
        )}. In PowerPoint: select the linked text → Insert → Link, and use a descriptive phrase.`,
    );
  }
  if (rawUrls.length > 0) {
    findings.push(
      `Advisory — not scored against you: ${rawUrls.length} link(s) show the raw URL as their visible text. This satisfies WCAG 2.4.4, but a descriptive label reads better in a screen reader's list of links.`,
    );
  }
  return pptxCategory(
    "link_quality",
    "Link Quality",
    PPTX.SCORING_WEIGHTS.link_quality,
    clamp100(score),
    findings,
    "Screen-reader users often pull up a list of links out of context, so each link's text must describe where it goes rather than showing a raw URL.",
    [PPTX_HELP.overview],
  );
}

function scorePptxForms(): CategoryResult {
  return pptxCategory(
    "form_accessibility",
    "Form Accessibility",
    0,
    null,
    [
      "Interactive form controls are uncommon in PowerPoint presentations and are not automatically assessed in this version.",
    ],
    "Interactive form fields need accessible labels. They are rare in PowerPoint presentations and are not assessed automatically here.",
    [PPTX_HELP.overview],
    true,
  );
}

function buildPptxCategories(a: PptxAnalysis): CategoryResult[] {
  const categories = [
    scorePptxText(),
    scorePptxTitleLanguage(a),
    scorePptxSlideTitles(a),
    scorePptxAltText(a),
    scorePptxReadingOrder(a),
    scorePptxTableMarkup(a),
    scorePptxColorContrast(a),
    scorePptxListStructure(a),
    scorePptxLinkQuality(a),
    scorePptxForms(),
  ];
  applyWcagCriteria(categories);
  return categories;
}

/**
 * Score a PowerPoint (.pptx) presentation. Produces the same ScoringResult
 * shape as scoreDocument (PDF) / scoreDocx, minus the PDF-only pdfUa/
 * adobeParity signals, so it flows through the existing report UI unchanged.
 */
export function scorePptx(analysis: PptxAnalysis): ScoringResult {
  const categories = buildPptxCategories(analysis);
  const conformance = evaluatePptxConformance(analysis);
  const aggregate = aggregateScore(
    categories,
    false,
    "strict",
    conformance,
    "PowerPoint presentation",
  );
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
