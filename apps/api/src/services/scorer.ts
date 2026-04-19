import {
  SCORING_PROFILES,
  SCORING_WEIGHTS,
  GRADE_THRESHOLDS,
  SEVERITY_THRESHOLDS,
  ANALYSIS,
} from "#config";
import type { QpdfResult } from "./qpdfService.js";
import type { PdfjsResult } from "./pdfjsService.js";
import { appendSupplementaryFindings } from "./scoring/supplementary.js";
import { generateSummary } from "./scoring/summary.js";

export interface HelpLink {
  label: string;
  url: string;
}

export interface CategoryResult {
  id: string;
  label: string;
  weight: number;
  score: number | null; // null = N/A
  grade: string | null;
  severity: string | null;
  findings: string[];
  explanation: string;
  helpLinks: HelpLink[];
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
}

export type ScoringMode = keyof typeof SCORING_PROFILES;

export interface ScoreProfileResult {
  mode: ScoringMode;
  label: string;
  description: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  categoryScores: Record<string, number | null>;
  categories: CategoryResult[];
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
  const remediationCategories = buildCategories(qpdf, pdfjs, "remediation");

  const strictAggregate = aggregateScore(strictCategories, isScanned, "strict");
  const remediationAggregate = aggregateScore(
    remediationCategories,
    isScanned,
    "remediation",
  );

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
      remediation: remediationAggregate.profile,
    },
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
  categories.push(scorePdfUaCompliance(qpdf, mode));
  categories.push(scoreBookmarks(qpdf, pdfjs));
  categories.push(scoreTableMarkup(qpdf, mode));
  categories.push(scoreColorContrast());
  categories.push(scoreLinkQuality(pdfjs));
  categories.push(scoreReadingOrder(qpdf, mode));
  categories.push(scoreFormAccessibility(qpdf));

  applyProfileWeights(categories, mode);
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

function refreshCategoryPresentation(category: CategoryResult): void {
  if (category.score === null) {
    category.grade = null;
    category.severity = null;
    return;
  }

  category.score = Math.max(0, Math.min(100, Math.round(category.score)));
  category.grade = getGrade(category.score);
  category.severity = getSeverity(category.score);
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
): {
  overallScore: number;
  grade: string;
  executiveSummary: string;
  profile: ScoreProfileResult;
} {
  const applicable = categories.filter((c) => c.score !== null);
  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const overallScore =
    totalWeight > 0
      ? Math.round(
          applicable.reduce(
            (sum, c) => sum + c.score! * (c.weight / totalWeight),
            0,
          ),
        )
      : 0;

  const grade = getGrade(overallScore);
  const executiveSummary = generateSummary(
    overallScore,
    grade,
    isScanned,
    categories,
    mode,
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
      "How to fix: In Adobe Acrobat, go to Accessibility → Add Tags to Document. Tags create a hidden structure that tells screen readers the reading order, headings, and other elements.",
    );
  } else if (!pdfjs.hasText && qpdf.hasStructTree) {
    score = 25;
    findings.push("No extractable text found, but document has tag structure");
    findings.push(
      "This may be a partially tagged scanned document. The images need OCR (Optical Character Recognition) to convert them to real text.",
    );
    findings.push(
      "How to fix: In Adobe Acrobat, go to Scan & OCR → Recognize Text → In This File.",
    );
  } else {
    score = 0;
    findings.push("No extractable text found");
    findings.push("No tag structure found");
    findings.push(
      "This PDF appears to be a scanned image — it is essentially a photograph of text. Screen readers cannot read it at all.",
    );
    findings.push(
      "How to fix: (1) Run OCR in Adobe Acrobat: Scan & OCR → Recognize Text. (2) Then add tags: Accessibility → Add Tags to Document.",
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

  // Title check (50 points)
  if (pdfjs.title && pdfjs.title.trim().length > 0) {
    score += 50;
    findings.push(`Document title: "${pdfjs.title}"`);
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
        url: "https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html",
      },
      {
        label: "WebAIM: Document Properties",
        url: "https://webaim.org/techniques/acrobat/acrobat#document",
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
      url: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
    },
    {
      label: "WebAIM: Headings in PDFs",
      url: "https://webaim.org/techniques/acrobat/acrobat#702",
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
      "How to fix: In Adobe Acrobat, open the Tags panel (View → Show/Hide → Navigation Panes → Tags). Select text that serves as a heading, right-click the corresponding tag, and change its type to H1, H2, etc.",
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
    severity: "Pass",
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
      url: "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html",
    },
    {
      label: "WebAIM: Alt Text in PDFs",
      url: "https://webaim.org/techniques/acrobat/acrobat#702",
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
    withAlt === 0 ? 0 : Math.round((withAlt / figures.length) * 100);
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

function scorePdfUaCompliance(
  qpdf: QpdfResult,
  mode: ScoringMode,
): CategoryResult {
  const pdfUaLinks: CategoryResult["helpLinks"] = [
    {
      label: "PDF/UA Overview",
      url: "https://www.w3.org/WAI/WCAG21/Techniques/pdf/",
    },
    {
      label: "PAC 2024",
      url: "https://pac.pdf-accessibility.org/",
    },
    {
      label: "Matterhorn Protocol",
      url: "https://www.pdfa.org/resource/the-matterhorn-protocol-1-1/",
    },
    {
      label: "Illinois IITAA 2.1 Standards (§504.2.2 / E205.4)",
      url: "https://doit.illinois.gov/initiatives/accessibility/iitaa/iitaa-2-1-standards.html",
    },
  ];
  const pdfUaExplanation =
    "This category groups PDF/UA-oriented structural checks that remediation tools often emphasize: tagged structure, MarkInfo/Marked, PDF/UA metadata claims, list legality, table legality, and tab order. Illinois IITAA 2.1 expressly references PDF/UA in §504.2.2 for authoring-tool PDF export capability, while E205.4 frames document-level electronic content accessibility through WCAG 2.1 for non-web documents. In this app the category is therefore scored only in Practical mode, while Strict remains the primary document-level publication lens.";

  if (mode !== "remediation") {
    return {
      id: "pdf_ua_compliance",
      label: "PDF/UA Compliance Signals",
      weight: SCORING_WEIGHTS.pdf_ua_compliance,
      score: null,
      grade: null,
      severity: null,
      findings: [
        "Strict mode does not use PDF/UA or Matterhorn conformance as the primary document-level publication/compliance score.",
        "Illinois IITAA 2.1 §504.2.2 requires PDF/UA export capability for authoring tools, while E205.4 frames final electronic-content accessibility through WCAG 2.1.",
        "Use Practical mode to review PDF/UA-oriented audit signals such as tagging, MarkInfo, PDF/UA identifiers, list/table legality, and tab order.",
        "This category does not affect the Strict score.",
      ],
      explanation: pdfUaExplanation,
      helpLinks: pdfUaLinks,
    };
  }

  const findings: string[] = [];

  if (!qpdf.hasStructTree) {
    return {
      id: "pdf_ua_compliance",
      label: "PDF/UA Compliance Signals",
      weight: SCORING_WEIGHTS.pdf_ua_compliance,
      score: 0,
      grade: "F",
      severity: "Critical",
      findings: [
        "No StructTreeRoot found — the document is not tagged.",
        "Without tags, major PDF/UA-oriented structure checks fail immediately.",
        "How to fix: In Adobe Acrobat, run Accessibility → Add Tags to Document, then verify the resulting structure manually or in PAC.",
      ],
      explanation: pdfUaExplanation,
      helpLinks: pdfUaLinks,
    };
  }

  let score = 25;
  findings.push("Tagged PDF detected (StructTreeRoot present).");

  if (qpdf.hasMarkInfo && qpdf.isMarkedContent) {
    score += 20;
    findings.push(
      "MarkInfo /Marked is true — real content is distinguished from artifacts.",
    );
  } else if (qpdf.hasMarkInfo) {
    score += 10;
    findings.push(
      "MarkInfo is present, but /Marked is not true — artifact handling may be incomplete.",
    );
  } else {
    findings.push("No MarkInfo dictionary found.");
  }

  if (qpdf.hasPdfUaIdentifier) {
    score += 15;
    findings.push(
      `PDF/UA identifier found${qpdf.pdfUaPart ? ` (PDF/UA-${qpdf.pdfUaPart})` : ""}.`,
    );
  } else {
    findings.push("No PDF/UA identifier found in metadata.");
  }

  if (qpdf.totalPageCount > 0) {
    if (qpdf.tabOrderPages === qpdf.totalPageCount) {
      score += 10;
      findings.push(
        `Tab order is set on all ${qpdf.totalPageCount} page(s) (/Tabs /S or equivalent page tab-order entries detected).`,
      );
    } else if (qpdf.tabOrderPages > 0) {
      score += 5;
      findings.push(
        `Tab order is set on ${qpdf.tabOrderPages} of ${qpdf.totalPageCount} page(s).`,
      );
    } else {
      findings.push("No page-level tab order entries detected.");
    }
  }

  const listScore = listLegalityScore(qpdf.lists);
  score += listScore;
  if (qpdf.lists.length === 0) {
    findings.push(
      "No list structures present — no list-legality issues detected.",
    );
  } else {
    const wellFormed = qpdf.lists.filter((list) => list.isWellFormed).length;
    findings.push(
      `List legality: ${wellFormed} of ${qpdf.lists.length} detected list(s) are well formed (${listScore}/15 points).`,
    );
  }

  const tableScore = tableLegalityScore(qpdf.tables);
  score += tableScore;
  if (qpdf.tables.length === 0) {
    findings.push(
      "No table structures present — no table-legality issues detected.",
    );
  } else {
    findings.push(
      `Table legality: structural row nesting, non-nested tables, and consistent columns contributed ${tableScore}/15 points.`,
    );
  }

  if (qpdf.actualTextCount + qpdf.expansionTextCount > 0) {
    findings.push(
      `Screen-reader text overrides detected: ${qpdf.actualTextCount} /ActualText and ${qpdf.expansionTextCount} /E expansion text attribute(s).`,
    );
  }

  if (qpdf.hasRoleMap) {
    findings.push(
      `RoleMap present with ${qpdf.roleMapEntries.length} custom tag mapping(s).`,
    );
  }

  findings.push(
    "Practical mode scores this as a PDF/UA-oriented readiness signal, not a formal Matterhorn or PDF/UA conformance audit.",
  );

  return {
    id: "pdf_ua_compliance",
    label: "PDF/UA Compliance Signals",
    weight: SCORING_WEIGHTS.pdf_ua_compliance,
    score,
    grade: getGrade(score),
    severity: getSeverity(score),
    findings,
    explanation: pdfUaExplanation,
    helpLinks: pdfUaLinks,
  };
}

function scoreColorContrast(): CategoryResult {
  const contrastLinks: CategoryResult["helpLinks"] = [
    {
      label: "WCAG 1.4.3: Contrast (Minimum)",
      url: "https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html",
    },
    {
      label: "Adobe: Accessibility Full Check",
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
      url: "https://webaim.org/techniques/acrobat/acrobat#702",
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
      severity: "Pass",
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
      score: 25,
      grade: getGrade(25),
      severity: getSeverity(25),
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
    score: 0,
    grade: "F",
    severity: "Critical",
    findings: [
      `Document has ${pdfjs.pageCount} pages but no bookmarks`,
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
      url: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
    },
    {
      label: "WebAIM: Table Accessibility in PDFs",
      url: "https://webaim.org/techniques/acrobat/acrobat#702",
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
      'Fix: In Adobe Acrobat, select each <TH> tag → Properties → Scope → set to "Column" or "Row"',
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

  // 5. Caption (5 points) — nice to have, not a WCAG requirement
  const withCaption = qpdf.tables.filter((t) => t.hasCaption).length;
  if (withCaption === n) {
    score += 5;
    findings.push(`All ${n} table(s) have <Caption> elements`);
  } else if (withCaption > 0) {
    score += 2;
    findings.push(
      `${withCaption} of ${n} table(s) have <Caption> — ${n - withCaption} missing`,
    );
    findings.push(
      "Fix: Add a <Caption> tag as the first child of each <Table> with a brief description",
    );
  } else {
    findings.push(
      "No tables have <Caption> elements — adding a caption helps screen readers announce table purpose",
    );
    findings.push(
      "Fix: Add a <Caption> tag as the first child of each <Table> in the Tags panel",
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
          `  Table ${ti + 1}: inconsistent column counts — rows have [${t.columnCounts.join(", ")}] cells (expected uniform ${unique[0]})`,
        );
      }
    }
    findings.push(
      "Fix: Ensure all rows have the same number of cells. Use empty cells or colspan/rowspan where needed.",
    );
  }

  // 7. Header association bonus (5 points)
  const withAssoc = qpdf.tables.filter((t) => t.hasHeaderAssociation).length;
  if (withAssoc > 0) {
    score += 5;
    findings.push(
      `${withAssoc} table(s) use explicit header-cell associations (/Headers attribute)`,
    );
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

function scoreLinkQuality(pdfjs: PdfjsResult): CategoryResult {
  const linkLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Create and Edit Links",
      url: "https://helpx.adobe.com/acrobat/using/accessibility-features-pdfs.html",
    },
    {
      label: "WCAG 2.4.4: Link Purpose",
      url: "https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html",
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

  const rawUrlPattern = /^(https?:\/\/|www\.)/i;
  const descriptive = pdfjs.links.filter(
    (l) => !rawUrlPattern.test(l.text.trim()),
  );
  const score = Math.round((descriptive.length / pdfjs.links.length) * 100);
  const findings: string[] = [];

  if (descriptive.length === pdfjs.links.length) {
    findings.push(`All ${pdfjs.links.length} link(s) use descriptive text`);
    findings.push(`--- Link Details ---`);
    for (const link of pdfjs.links.slice(0, 20)) {
      findings.push(`  "${link.text.trim()}" → ${link.url}`);
    }
    if (pdfjs.links.length > 20) {
      findings.push(`  ... and ${pdfjs.links.length - 20} more link(s)`);
    }
  } else {
    const rawCount = pdfjs.links.length - descriptive.length;
    findings.push(
      `${rawCount} of ${pdfjs.links.length} link(s) display raw URLs instead of descriptive text`,
    );
    findings.push(`--- Links Using Raw URLs ---`);
    const rawLinks = pdfjs.links.filter((l) =>
      rawUrlPattern.test(l.text.trim()),
    );
    for (const link of rawLinks.slice(0, 15)) {
      findings.push(`  "${link.text.trim()}" — raw URL displayed as link text`);
    }
    if (rawLinks.length > 15) {
      findings.push(`  ... and ${rawLinks.length - 15} more raw URL link(s)`);
    }
    if (descriptive.length > 0) {
      findings.push(`--- Links With Descriptive Text ---`);
      for (const link of descriptive.slice(0, 10)) {
        findings.push(`  "${link.text.trim()}" → ${link.url}`);
      }
      if (descriptive.length > 10) {
        findings.push(
          `  ... and ${descriptive.length - 10} more descriptive link(s)`,
        );
      }
    }
    findings.push(
      "How to fix: In the original document (Word, InDesign, etc.), change the visible link text to something descriptive before re-exporting to PDF. In Adobe Acrobat, you can edit link properties via the Edit PDF tool.",
    );
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
      url: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
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
  const score = Math.round((withLabels / qpdf.formFields.length) * 100);
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
      "How to fix: In Adobe Acrobat, right-click each form field → Properties → General tab → enter a descriptive Tooltip. The tooltip becomes the accessible label that screen readers announce.",
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
  mode: ScoringMode,
): CategoryResult {
  const readingLinks: CategoryResult["helpLinks"] = [
    {
      label: "Adobe: Fix Reading Order",
      url: "https://helpx.adobe.com/acrobat/using/create-verify-pdf-accessibility.html",
    },
    {
      label: "WCAG 1.3.2: Meaningful Sequence",
      url: "https://www.w3.org/WAI/WCAG21/Understanding/meaningful-sequence.html",
    },
    {
      label: "WebAIM: Reading Order",
      url: "https://webaim.org/techniques/acrobat/acrobat#702",
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
        "How to fix: First add tags (Accessibility → Add Tags to Document), then use the Reading Order tool (Accessibility → Reading Order) to verify and correct the sequence.",
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
      "How to fix: Use the Reading Order tool in Adobe Acrobat (Accessibility → Reading Order) to reorganize the tag structure into proper sections, headings, and content blocks.",
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

  // Check MCID ordering
  findings.push(
    "Automated reading-order verification is currently limited to structure-tree depth and tag presence.",
  );
  findings.push(
    "This analyzer does not yet compare per-page marked-content order against actual page content streams, so a precise reading-order verdict would be unreliable.",
  );
  findings.push(
    "Manual review recommended: verify the tag order in Adobe Acrobat's Reading Order / Order panels or in PAC before publishing.",
  );

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
    findings.push(
      "This remains a softer readiness signal, not a formal page-stream reading-order verification.",
    );

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

  return {
    id: "reading_order",
    label: "Reading Order",
    weight: SCORING_WEIGHTS.reading_order,
    score: null,
    grade: null,
    severity: null,
    findings,
    explanation: readingExplanation,
    helpLinks: readingLinks,
  };
}

