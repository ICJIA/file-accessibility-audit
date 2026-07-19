/**
 * DOCX (Word) scoring — extracted verbatim from scorer.ts in the v1.34.0
 * structural split. scorer.ts re-exports scoreDocx from here so no other
 * file's imports need to change.
 */
import { DOCX } from "#config";
import type { CategoryResult, HelpLink } from "@file-audit/shared";
import type { DocxAnalysis } from "../docxService.js";
import {
  getGrade,
  getSeverity,
  classifyLinkText,
  clamp100,
  aggregateScore,
  applyWcagCriteria,
  type ScoringResult,
} from "./common.js";
import { evaluateDocxConformance } from "./conformance.js";

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
      // Capped: a long document with a recurring template quirk should read
      // as "one systematic issue", not saturate the category to zero.
      score -= Math.min(30, skips * 15);
      findings.push(
        `${skips} place(s) skip a heading level (e.g. Heading 1 → Heading 3). Don't skip levels — screen-reader users infer structure from them.`,
      );
    }
  }
  if ((a.emptyHeadingCount ?? 0) > 0) {
    findings.push(
      `Advisory — not scored: ${a.emptyHeadingCount} empty Heading-styled paragraph(s) (no text — often a spacing habit). They clutter the navigable outline; use paragraph spacing instead.`,
    );
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
  const withAlt = nonDecorative.filter((i) => i.altText && i.altText.trim().length > 0).length;
  let score = Math.round((withAlt / nonDecorative.length) * 100);
  const findings = [`${withAlt} of ${nonDecorative.length} meaningful image(s) have alt text.`];
  if (withAlt < nonDecorative.length) {
    score = Math.min(score, 85);
    findings.push(
      `${nonDecorative.length - withAlt} image(s) are missing alt text. In Word, right-click each image → View Alt Text and add a description.`,
    );
    const titleOnly = nonDecorative.filter((i) => i.titleOnly && !i.altText).length;
    if (titleOnly > 0) {
      findings.push(
        `${titleOnly} of those have only the Title property filled — screen readers read the Description (alt text) field, not Title. Move the text into the Description box.`,
      );
    }
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
  const score = Math.round(perTable.reduce((x, y) => x + y, 0) / perTable.length);
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

function scoreDocxLinks(a: DocxAnalysis): CategoryResult {
  if (a.links.length === 0) {
    return docxCategory(
      "link_quality",
      "Link Quality",
      DOCX.SCORING_WEIGHTS.link_quality,
      null,
      ["No hyperlinks were found."],
      "Link text should describe the destination. Vague phrases like 'click here' are unhelpful out of context.",
      [DOCX_HELP.links],
      false,
    );
  }
  // Shared 2.4.4 doctrine (scoring/common.ts, calibrated in the PDF path):
  // raw URLs SATISFY 2.4.4 and are advisory-only; empty/vague/too-short text
  // is the actual violation. The old raw-URL penalty (plus an 85-point cap)
  // scored an all-URL reference memo 0 as DOCX while its PDF twin scored 100.
  const needsFix = a.links.filter((l) => classifyLinkText(l.text) === "needsFix");
  const rawUrls = a.links.filter((l) => classifyLinkText(l.text) === "rawUrl");
  const score = Math.round(((a.links.length - needsFix.length) / a.links.length) * 100);
  const findings = [`${a.links.length} link(s) found; ${needsFix.length} with unclear text.`];
  if (needsFix.length > 0) {
    findings.push(
      `Vague or empty link text: ${needsFix
        .slice(0, 5)
        .map((l) => (l.text.trim() ? `"${l.text}"` : "(empty)"))
        .join(", ")}. Use descriptive link text that makes sense on its own.`,
    );
  }
  if (rawUrls.length > 0) {
    findings.push(
      `Advisory — not scored against you: ${rawUrls.length} link(s) show the raw URL as their visible text. This satisfies WCAG 2.4.4 (the destination is determinable), but a descriptive label reads better in a screen reader's list of links.`,
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
  const aggregate = aggregateScore(categories, false, "strict", conformance, "Word document");
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
