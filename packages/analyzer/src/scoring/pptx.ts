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
  applyAdvisorySeverity,
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

  // NOT SCORED (2026-08-29, the legal-only sweep). This file's own
  // conformance gate has always ruled that a missing slide title is "not a
  // confirmed WCAG violation on its own" — a slide can carry its heading in
  // a body placeholder — and the score must now follow the same rule the
  // gate does. Reported loudly, counted never.
  //
  // A TYPED heading is the other case, and it IS scored (2026-08-31). Where a
  // slide has no title placeholder but does carry a short, explicitly large
  // or bold line in a floating text box, the heading EXISTS and is simply not
  // marked up — structure conveyed by presentation alone, which is WCAG 1.3.1
  // Level A, the same failure Word has scored since the start. The two
  // questions are different: "must a slide have a heading?" is 2.4.10, Level
  // AAA and outside the legal bar; "is the heading it visibly has marked up?"
  // is 1.3.1 and squarely inside it. PowerPoint had no answer to the second
  // at all until now — a real Level A failure the report never mentioned.
  const fakeHeadings = a.fakeHeadings ?? [];
  let score = 100;
  if (fakeHeadings.length > 0) {
    score = Math.max(0, 100 - Math.min(40, fakeHeadings.length * 15));
  }
  const findings: string[] = [];

  if (fakeHeadings.length > 0) {
    const nums = fakeHeadings.map((f) => f.slide).join(", ");
    findings.push(
      `Slide${fakeHeadings.length > 1 ? "s" : ""} ${nums} ${
        fakeHeadings.length > 1 ? "have" : "has"
      } a heading typed into an ordinary text box instead of the slide's title placeholder — it looks like a heading and is not one, so assistive technology cannot announce it as the slide's title or navigate to it. In PowerPoint: Home → Layout → pick a layout with a Title, then move the text into the title placeholder (or View → Outline and type it there).`,
    );
    findings.push(`--- Text Boxes Styled Like Slide Titles ---`);
    for (const f of fakeHeadings.slice(0, 10)) {
      findings.push(`  Slide ${f.slide}: "${f.text.slice(0, 80)}"`);
    }
  }
  if (untitled.length > 0) {
    const nums = untitled.map((s) => s.index).join(", ");
    findings.push(
      `Advisory — not scored: slide${untitled.length > 1 ? "s" : ""} ${nums} ${
        untitled.length > 1 ? "have" : "has"
      } no title — your grade is not affected (no WCAG 2.1 A/AA criterion requires a heading to exist; that is 2.4.10 Section Headings, Level AAA), but titled slides give screen-reader users a navigable outline. In PowerPoint: use the Outline view (View → Outline) or a layout with a title placeholder.`,
    );
  }

  // NOT SCORED (2026-08-29, the legal-only sweep): whether two identically
  // titled slides "describe their purpose" (2.4.6) is a judgment about the
  // slides' content that no automated check can make — a deck can honestly
  // have two "Q3 results" slides. Reported, never counted. So are MISSING
  // titles: `const score = 100` above. (This comment asserted the opposite
  // until 2026-08-31 — it described pre-v1.136 behaviour and contradicted the
  // code six lines above it.)
  if (duplicateGroups.length > 0) {
    for (const [title, idx] of duplicateGroups) {
      findings.push(
        `Advisory — not scored: ${idx.length} slides share the title "${title}" — your grade is not affected, but a distinct, descriptive title on each slide lets screen-reader users tell them apart in the outline.`,
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
      `${missing.length} image(s) are missing alt text. In PowerPoint: right-click each image → View Alt Text (some versions call it Edit Alt Text) and add a description.`,
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

  // NOT SCORED (2026-08-31). The legal-only sweep of 2026-08-29 un-scored the
  // sibling rule six functions above — a slide missing its title — because
  // this file's own conformance gate rules it "not a confirmed WCAG violation
  // on its own". That gate's doc comment says the SAME THING, in the same
  // sentence, about this heuristic: "most notably a slide missing its own
  // title (`slide_titles`) and the title-first reading-order heuristic
  // (`reading_order`) are NOT gate failures". The sweep missed this one, so
  // for two days the product deducted 15 points per slide for a defect it
  // simultaneously declined to call a WCAG failure — the exact over-scoring
  // the sweep existed to end, and what `legal-basis` caught the moment a trap
  // document finally exercised the rule (synthetic-134).
  //
  // A title read second is genuinely worth fixing: it is why the advisory
  // still names every slide. But 1.3.2 asks that a correct reading sequence
  // be programmatically DETERMINABLE, and it is — the shape tree states it
  // exactly. "Determinable but not ideal" is advice, not a violation.
  // Reported loudly, counted never.
  const score = 100;
  const findings: string[] = [];

  if (titledOutOfOrder.length > 0) {
    const nums = titledOutOfOrder.map((s) => s.index).join(", ");
    findings.push(
      `Advisory — not scored: slide${titledOutOfOrder.length > 1 ? "s" : ""} ${nums} ${
        titledOutOfOrder.length > 1 ? "have" : "has"
      } a title that is not the first shape in reading order. A listener hears the body text before the heading that was meant to orient them. In PowerPoint: open the Selection Pane (Home → Arrange → Selection Pane) and reorder shapes so the title reads first.`,
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
  const score = Math.round((100 * (a.links.length - unnamed.length)) / a.links.length);
  const findings = [`${a.links.length} link(s) found; ${unnamed.length} with no link text at all.`];
  if (unnamed.length > 0) {
    findings.push(
      `${unnamed.length} link(s) have no link text, so a screen reader announces the link with nothing to identify it. In PowerPoint: select the linked text → Insert → Link, and type a descriptive phrase in "Text to display".`,
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
  // A perfect category that still reported something says so (v1.149.0).
  applyAdvisorySeverity(categories);
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
