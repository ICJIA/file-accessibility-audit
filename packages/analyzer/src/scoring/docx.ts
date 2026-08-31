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
  applyAdvisorySeverity,
  applyWcagCriteria,
  headingOutlineLines,
  truncateHeadingText,
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

function scoreDocxText(a: DocxAnalysis): CategoryResult {
  const findings = [
    "Word documents contain fully extractable, selectable text — unlike a scanned PDF, the content is always available to assistive technology.",
  ];
  if ((a.emptyParagraphRunCount ?? 0) > 0) {
    findings.push(
      `Advisory — not scored: ${a.emptyParagraphRunCount} run(s) of three or more consecutive empty paragraphs — blank lines used for spacing, each announced by a screen reader. Use paragraph spacing (Layout → Spacing) instead.`,
    );
  }
  return docxCategory(
    "text_extractability",
    "Text Extractability",
    DOCX.SCORING_WEIGHTS.text_extractability,
    100,
    findings,
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
  }
  if ((a.runLanguages?.length ?? 0) > 0) {
    findings.push(
      `Passages are declared in ${a.runLanguages!.join(", ")} alongside the document language. Screen readers switch pronunciation for each — whether every marking is a real foreign passage (rather than Word's autodetect guessing) is worth a manual glance (WCAG 3.1.2).`,
    );
  }
  if (!a.metadata.language) {
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

const MAX_FAKE_HEADING_LINES = 15;

function scoreDocxHeadings(a: DocxAnalysis): CategoryResult {
  const total = a.headings.length;
  const fakes = a.fakeHeadings.length;
  // `emptyHeadings === 0` is load-bearing (2026-08-31): without it a document
  // whose ONLY heading styles sit on blank lines returned score null — Not
  // Assessed — while conformance.ts asserted a 1.3.1 failure about those very
  // paragraphs. The report then read grade A, "No headings were found",
  // "Nothing — this document passed every automated check", and "1 criterion
  // failing" at once. Scorer and verdict must agree on whether this category
  // was assessed at all.
  if (total === 0 && fakes === 0 && (a.emptyHeadingCount ?? 0) === 0) {
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
    // NOT SCORED (2026-08-29, the legal-only sweep): starting below Heading 1
    // and skipping levels are best practices (W3C's own guidance says skipped
    // levels are not a WCAG failure), so they may not move the grade. The
    // headings exist and are programmatic — 1.3.1 is satisfied.
    if (a.headings[0].level !== 1) {
      findings.push(
        `Advisory — not scored: the first heading is Heading ${a.headings[0].level}, not Heading 1 — your grade is not affected, but starting the outline at Heading 1 gives it a single root.`,
      );
    }
    let skips = 0;
    for (let i = 1; i < total; i++) {
      if (a.headings[i].level - a.headings[i - 1].level > 1) skips++;
    }
    if (skips > 0) {
      findings.push(
        `Advisory — not scored: ${skips} place(s) skip a heading level (e.g. Heading 1 → Heading 3) — not a WCAG 2.1 failure, so your grade is not affected, but screen-reader users may wonder what they missed at the skipped level.`,
      );
    }
  }
  // SCORED since 2026-08-31 (user decision, after the WCAG audit of the
  // best-practices catalog). A Heading style on a blank line is structural
  // markup applied for a presentational purpose — spacing — announcing a
  // section that does not exist — structure conveyed by presentation that
  // does not represent a real relationship, which is WCAG 1.3.1 (Level A)
  // itself. conformance.ts records that criterion: nothing here may move a
  // score without naming the criterion it broke (the legal-basis gate).
  // NOT cited as W3C failure F43, though it is the nearest analogue: F43 is
  // written for HTML and all of its examples are heading markup applied to
  // VISIBLE text for a visual effect. W3C publishes no failure technique for
  // an empty heading, which is why the PDF twin stays hedged as contested.
  //
  // WHY WORD AND NOT PDF: this count is exact. docxService reads a Heading
  // style with no text straight from the XML — no inference. The PDF twin
  // (heading-content) rests on pdf.js text attribution, which has
  // misattributed heading text before (v1.110.0), so it stays reported and
  // unscored. Mainstream tooling splits on the underlying question — WAVE
  // calls an empty heading a 1.3.1 error, axe-core calls it best practice —
  // so the exactness of the evidence is what decides which side of the line
  // this product can defend.
  //
  // CAPPED AT 30 POINTS, deliberately: the harm is real but it is noise, not
  // lost information. 70 is the floor of the Minor band (shared/scoring.ts),
  // so empty headings alone can never take this category past Minor.
  const emptyHeadings = a.emptyHeadingCount ?? 0;
  if (emptyHeadings > 0) {
    score -= Math.min(30, emptyHeadings * 10);
    findings.push(
      `${emptyHeadings} Heading-styled paragraph(s) contain no text — a heading style applied to a blank line, usually to make space. Someone navigating by heading lands on silence, and the outline shows a section that is not there. In Word: delete the blank line, or set it to Normal style and use paragraph spacing instead.`,
    );
  }
  if (fakes > 0) {
    score -= total === 0 ? 70 : Math.min(40, fakes * 15);
    findings.push(
      `${fakes} paragraph(s) are formatted to look like headings (bold/large text) but are not real Heading styles. Apply Heading 1–6 so assistive technology can navigate them.`,
    );
  }
  if (total > 0) {
    findings.push(...headingOutlineLines(a.headings));
  }
  if (fakes > 0) {
    findings.push(`--- Paragraphs Styled Like Headings ---`);
    for (const fh of a.fakeHeadings.slice(0, MAX_FAKE_HEADING_LINES)) {
      findings.push(`  "${truncateHeadingText(fh.text)}"`);
    }
    if (fakes > MAX_FAKE_HEADING_LINES) {
      findings.push(`  ... and ${fakes - MAX_FAKE_HEADING_LINES} more paragraph(s)`);
    }
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
      `${nonDecorative.length - withAlt} image(s) are missing alt text. In Word, right-click each image → View Alt Text (some Word versions call it Edit Alt Text) and add a description.`,
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
    // Mirrors the conformance gate's rule 4 EXACTLY (2026-08-29, the
    // legal-only sweep): a bare grid with no table style, borders, shading,
    // or header marks anywhere (looksLikeLayout) is overwhelmingly a layout
    // construct — the gate has never asserted 1.3.1 on it, and the score
    // now follows the same rule the gate does.
    const isData = t.rowCount >= 2 && t.colCount >= 2 && t.looksLikeLayout !== true;
    const s = !isData ? 100 : t.hasHeaderRow ? 100 : 30;
    return s;
  });
  const score = Math.round(perTable.reduce((x, y) => x + y, 0) / perTable.length);
  const noHeader = a.tables.filter(
    (t) => !t.hasHeaderRow && t.rowCount >= 2 && t.colCount >= 2 && t.looksLikeLayout !== true,
  ).length;
  const layoutish = a.tables.filter(
    (t) => !t.hasHeaderRow && t.rowCount >= 2 && t.colCount >= 2 && t.looksLikeLayout === true,
  ).length;
  const findings = [`${a.tables.length} table(s) found.`];
  if (noHeader > 0) {
    findings.push(
      `${noHeader} data table(s) have no header row. In Word: select the top row → Table Layout → Repeat Header Rows.`,
    );
  }
  if (layoutish > 0) {
    findings.push(
      `Advisory — not scored: ${layoutish} bare grid(s) with no table style, borders, shading, or header marks anywhere — usually a layout construct, so this is not counted against your grade — but if any of these is really a data table, its missing header row IS a WCAG 1.3.1 failure, so give them a look. If it IS a data table, mark its header row (Table Layout → Repeat Header Rows) and give it a table style.`,
    );
  }
  // Nested tables: reported, never scored (2026-08-29 — same rule as the
  // PDF path since v1.131.0: properly built nesting is still determinable).
  if (a.tables.some((t) => t.hasNestedTable)) {
    findings.push(
      "Advisory — not scored: nested tables were found — your grade is not affected, but they are hard for screen readers to navigate. Flatten them where possible.",
    );
  }
  const mergedTotal = a.tables.reduce((sum, t) => sum + (t.mergedCellCount ?? 0), 0);
  if (mergedTotal > 0) {
    findings.push(
      `Note — not scored: ${mergedTotal} merged cell(s) across the table(s). Merged and split cells can confuse screen-reader navigation (Microsoft's own checker flags them); whether they harm depends on placement — review manually.`,
    );
  }
  if ((a.emptyTableRowCount ?? 0) > 0) {
    findings.push(
      `Note — not scored: ${a.emptyTableRowCount} entirely empty table row(s) — blank rows used for spacing are announced as empty rows a screen reader has to sit through. Use cell padding or table spacing instead.`,
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
  // THE PDF PATH'S DOCTRINE, APPLIED AT LAST (2026-08-31). The 2026-08-29
  // legal-only sweep stopped the PDF scorer penalising weak link TEXT — 2.4.4
  // is satisfied by the text together with its context, which no text-only
  // check can weigh — but the three Office scorers were not swept, under a
  // comment in scoring/common.ts claiming they applied "the identical
  // doctrine". They did not: a Word document with two "click here" links
  // scored link_quality 0, Critical, capping the whole file at D, with the
  // verdict naming NO criterion at all — against a public promise that every
  // finding names the WCAG rule behind it. Neither corpus gate could see it:
  // legal-basis needs a control document with weak link text (none had one)
  // and best-practice-basis needs a failing criterion (there was none).
  //
  // Only an UNNAMED link is scored now: no text at all is a link with no
  // accessible name, which WCAG 4.1.2 (Level A) forbids outright, with no
  // context to weigh. Vague text is reported and never counted.
  const unnamed = a.links.filter((l) => classifyLinkText(l.text) === "unnamed");
  const vague = a.links.filter((l) => classifyLinkText(l.text) === "vague");
  const rawUrls = a.links.filter((l) => classifyLinkText(l.text) === "rawUrl");
  const score = Math.round(((a.links.length - unnamed.length) / a.links.length) * 100);
  const findings = [`${a.links.length} link(s) found; ${unnamed.length} with no link text at all.`];
  if (unnamed.length > 0) {
    findings.push(
      `${unnamed.length} link(s) have no link text, so a screen reader announces the link with nothing to identify it. In Word: select the link → Insert → Link, and type a descriptive phrase in "Text to display".`,
    );
  }
  if (vague.length > 0) {
    findings.push(
      `Advisory — not scored against you: ${vague.length} link(s) use non-descriptive text (${vague
        .slice(0, 5)
        .map((l) => `"${l.text.trim()}"`)
        .join(
          ", ",
        )}). WCAG 2.4.4 lets the surrounding sentence supply a link's purpose, which an automated check cannot weigh, so this never affects your grade — but a descriptive phrase reads better in a screen reader's list of links.`,
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
          ? `${unresolvedRuns} text run(s) use style-inherited or automatic colors that could not be resolved, so contrast could not be evaluated automatically — review manually. (Explicit and theme-based colors ARE resolved since v1.95.0.)`
          : "No text with a resolvable color (explicit or theme-based) was found to evaluate.",
      ],
      "Text must contrast enough with its background (≥4.5:1 normal, ≥3:1 large). Word stores explicit and theme colors, so both are checked directly where they are set.",
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

function scoreDocxReadingOrder(a: DocxAnalysis): CategoryResult {
  const floating = a.floatingObjectCount ?? 0;
  const findings =
    floating > 0
      ? [
          `${floating} floating (anchored) object(s) were found — their reading position is set by anchoring, not the text flow, so verify each is announced where a reader expects it (v1.95.0 census). Inline objects follow the flow and are fine.`,
          "Word's linear flow preserves the order of ordinary paragraphs; the floating objects above are the part to check by hand.",
        ]
      : [
          "No floating (anchored) objects were found in the document body — body content follows Word's linear flow, which preserves reading order. Headers/footers and text-box internals are still worth a manual glance.",
        ];
  return docxCategory(
    "reading_order",
    "Reading Order",
    0,
    null,
    findings,
    "Reading order determines the sequence assistive technology reads content. Word's linear flow usually preserves it; floating/anchored objects are counted and disclosed for manual review.",
    [DOCX_HELP.overview],
    true,
  );
}

function scoreDocxForms(a: DocxAnalysis): CategoryResult {
  // v1.95.0: evidence-based instead of an unconditional "uncommon" claim —
  // content controls and legacy fields are DETECTED and disclosed; their
  // label/accessibility semantics still are not machine-assessed.
  const controls = (a.contentControlCount ?? 0) + (a.legacyFieldCount ?? 0);
  const findings =
    controls > 0
      ? [
          `${a.contentControlCount ?? 0} content control(s) and ${a.legacyFieldCount ?? 0} legacy form field(s) were detected. Whether each is labeled and reachable is not automatically assessed — verify with Word's own Accessibility Checker and a screen reader.`,
        ]
      : [
          "No form controls were detected in the document body (interactive content controls and legacy form fields are both checked). Interactive form semantics are not automatically assessed in this version.",
        ];
  return docxCategory(
    "form_accessibility",
    "Form Accessibility",
    0,
    null,
    findings,
    "Interactive form fields need accessible labels. Word forms (content controls or legacy fields) are detected and disclosed here; their accessibility is not scored automatically.",
    [DOCX_HELP.overview],
    true,
  );
}

function buildDocxCategories(a: DocxAnalysis): CategoryResult[] {
  const categories = [
    scoreDocxText(a),
    scoreDocxTitleLanguage(a),
    scoreDocxHeadings(a),
    scoreDocxAltText(a),
    scoreDocxTables(a),
    scoreDocxContrast(a),
    scoreDocxLists(a),
    scoreDocxLinks(a),
    scoreDocxReadingOrder(a),
    scoreDocxForms(a),
  ];
  applyWcagCriteria(categories);
  // A perfect category that still reported something says so (v1.149.0).
  applyAdvisorySeverity(categories);
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
