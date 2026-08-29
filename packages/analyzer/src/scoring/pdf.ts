/**
 * PDF scoring — extracted verbatim from scorer.ts in the v1.34.0 structural
 * split (this is the "PDF remainder" left after the DOCX/PPTX/XLSX sections
 * were split into their own sibling modules). scorer.ts re-exports
 * scoreDocument from here so no other file's imports need to change.
 */
import { SCORING_WEIGHTS, ANALYSIS, WCAG, SCORING_PROFILES } from "#config";
import type { CategoryResult, ScoringMode } from "@file-audit/shared";
import type { QpdfResult, TableAnalysis } from "../qpdfService.js";
import type { PdfjsResult } from "../pdfjsService.js";
import { detectLanguageMismatch, LANGUAGE_NAMES } from "../languagePlausibility.js";
import {
  getGrade,
  getSeverity,
  aggregateScore,
  applyWcagCriteria,
  classifyLinkText,
  structTreeIsContentFree,
  untaggedContentImageCount,
  headingOutlineLines,
  splitNonEmbeddedFonts,
  isPlausibleLanguageTag,
  type ScoringResult,
  type PdfUaSignals,
} from "./common.js";
import { evaluateConformance } from "./conformance.js";
import { buildAdobeParityReport } from "./adobeParity.js";
import { computeReadingOrderFidelity } from "./readingOrderFidelity.js";
import { appendSupplementaryFindings } from "./supplementary.js";

// W3C "Understanding" URL for the ACTIVE WCAG version (2.2 by default,
// 2.1 via WCAG_VERSION) — help links must match the version the conformance
// gate audits against, not a hardcoded 2.1.
function wcagUnderstandingUrl(slug: string): string {
  return `${WCAG.UNDERSTANDING_BASE[WCAG.VERSION]}${slug}.html`;
}

export function scoreDocument(qpdf: QpdfResult, pdfjs: PdfjsResult): ScoringResult {
  const warnings: string[] = [];

  if (qpdf.error || pdfjs.error) {
    warnings.push(
      "Some accessibility checks could not be completed. The results below reflect only the checks that succeeded.",
    );
  }

  // "Scanned" is a factual classification used in the executive summary and
  // report framing — it must require truly zero extractable text AND page
  // images. The 50-char `hasText` heuristic alone misclassified short
  // born-digital documents (one-page notices, cover sheets) as scans.
  const isScanned =
    !pdfjs.error &&
    pdfjs.textLength === 0 &&
    (pdfjs.imageCount > 0 || qpdf.imageObjectCount > 0) &&
    !qpdf.hasStructTree;

  const strictCategories = buildCategories(qpdf, pdfjs, "strict");
  const conformance = evaluateConformance(qpdf, pdfjs, strictCategories);
  const strictAggregate = aggregateScore(strictCategories, isScanned, "strict", conformance);

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
    matterhornCensusGeneration: 2,
  };
}

// Summarize the machine-checkable PDF/UA-1 signals for the report panel.
// PDF/UA identifier + artifacts come from pdfjs (XMP + content stream), which
// `qpdf --json` cannot expose; structure/MarkInfo/fonts come from qpdf.
function computePdfUaSignals(qpdf: QpdfResult, pdfjs: PdfjsResult): PdfUaSignals {
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
  categories.push(scoreHeadingStructure(qpdf, pdfjs));
  categories.push(scoreAltText(qpdf, pdfjs));
  categories.push(scoreBookmarks(qpdf, pdfjs));
  categories.push(scoreTableMarkup(qpdf));
  categories.push(scoreColorContrast());
  categories.push(scoreLinkQuality(qpdf, pdfjs));
  categories.push(scoreReadingOrder(qpdf, pdfjs));
  categories.push(scoreFormAccessibility(qpdf, pdfjs));

  applyProfileWeights(categories, mode);
  applyWcagCriteria(categories);
  appendSupplementaryFindings(qpdf, pdfjs, categories);

  return categories;
}

function applyProfileWeights(categories: CategoryResult[], mode: ScoringMode): void {
  const weights = SCORING_PROFILES[mode].weights;
  for (const category of categories) {
    const profileWeight = weights[category.id as keyof typeof weights];
    if (typeof profileWeight === "number") category.weight = profileWeight;
  }
}

function scoreTextExtractability(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  let score: number;
  const findings: string[] = [];

  if (qpdf.accessibilityAllowed === false) {
    // The security handler denies assistive-technology access outright —
    // nothing else about the text layer matters until that is lifted.
    score = 0;
    findings.push(
      "The document's security settings deny assistive-technology access — the accessibility permission flag is off (PDF/UA 7.16 / Matterhorn 26-002).",
    );
    findings.push(
      "Screen readers in conforming viewers cannot read ANY content of this document, regardless of tagging or text quality.",
    );
    findings.push(
      "How to fix: In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Security tab and either remove security or enable 'Enable text access for screen reader devices for the visually impaired', then re-save. Modern AES-256 encryption always permits accessibility.",
    );
  } else if (pdfjs.hasText && qpdf.hasStructTree && structTreeIsContentFree(qpdf, pdfjs)) {
    // The root object exists but the tree references nothing — the same
    // barrier as an untagged file, so the same score. Reporting this as
    // "Document is tagged" credited a document whose entire body text sits
    // outside the structure tree.
    score = 50;
    findings.push("PDF contains extractable text");
    findings.push(
      "A tag structure (StructTreeRoot) is present but EMPTY — it references no paragraphs, headings, figures, tables, lists, or marked content.",
    );
    if (pdfjs.textLength)
      findings.push(
        `All ${pdfjs.textLength.toLocaleString()} characters of text sit outside the structure tree, so a screen reader following the tags receives nothing — the same result as an untagged document.`,
      );
    findings.push(
      "How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF (classic UI: Tools → Accessibility → Autotag Document), then open the Tags panel and confirm the body content now appears beneath the tags.",
    );
  } else if (pdfjs.hasText && qpdf.hasStructTree) {
    score = 100;
    findings.push("PDF contains extractable text");
    findings.push("Document is tagged (StructTreeRoot present)");
    if (pdfjs.textLength)
      findings.push(`Extracted ${pdfjs.textLength.toLocaleString()} characters of text content`);
  } else if (pdfjs.hasText && !qpdf.hasStructTree) {
    score = 50;
    findings.push("PDF contains extractable text");
    findings.push("Document is NOT tagged — no StructTreeRoot found");
    findings.push(
      "How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF (classic UI: Tools → Accessibility → Autotag Document). Tags create a hidden structure that tells screen readers the reading order, headings, and other elements.",
    );
  } else if (!pdfjs.hasText && qpdf.hasStructTree) {
    // The hasText threshold (~50 chars) is a scoring heuristic; the wording
    // must stay factual for documents that DO have a little real text.
    score = 25;
    if (pdfjs.textLength > 0) {
      findings.push(
        `Only ${pdfjs.textLength} characters of extractable text were found — too little to assess the text layer with confidence`,
      );
      findings.push(
        "Document is tagged (StructTreeRoot present). If this is genuinely a very short document, the low score reflects limited assessable content rather than a confirmed barrier.",
      );
    } else {
      findings.push("No extractable text found, but document has tag structure");
      findings.push(
        "This may be a partially tagged scanned document. The images need OCR (Optical Character Recognition) to convert them to real text.",
      );
      findings.push(
        "How to fix: In Adobe Acrobat, open All tools → Scan & OCR → Recognize Text → In this file (classic UI: Tools → Scan & OCR → Recognize Text → In This File).",
      );
    }
  } else {
    score = 0;
    if (pdfjs.textLength > 0) {
      findings.push(`Only ${pdfjs.textLength} characters of extractable text were found`);
      findings.push("No tag structure found");
      findings.push(
        "How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF, so the little text present is exposed to screen readers in order.",
      );
    } else if (pdfjs.imageCount > 0 || qpdf.imageObjectCount > 0) {
      findings.push("No extractable text found");
      findings.push("No tag structure found");
      findings.push(
        "This PDF appears to be a scanned image — it is essentially a photograph of text. Screen readers cannot read it at all.",
      );
      findings.push(
        "How to fix: (1) Run OCR in Adobe Acrobat: All tools → Scan & OCR → Recognize Text. (2) Then add tags: All tools → Prepare for accessibility → Automatically tag PDF.",
      );
    } else {
      findings.push("No text content was found in this document");
      findings.push("No tag structure found");
      findings.push(
        "The document contains neither extractable text nor page images — there is no content for a screen reader to read.",
      );
    }
  }

  // The producer's own Suspects flag — the file declares its tags unreliable
  // (typically OCR/auto-tag output). Advisory only; the tree is still scored.
  if (qpdf.suspectsFlag) {
    findings.push(
      "Advisory: the document's MarkInfo carries Suspects = true — the producing tool itself marked the tagging as suspect (common after OCR or automatic tagging). Treat the tag structure with extra scrutiny in manual review.",
    );
  }

  // Font embedding check — non-embedded fonts can cause garbled text for
  // screen readers. Only fonts that actually PAINT visible text are flagged:
  // word processors emit inter-run whitespace in the paragraph default font,
  // and OCR layers paint in invisible mode 3 — a font that never shows a
  // glyph cannot garble anything, and Adobe Preflight passes such files
  // (it evaluates fonts "used for rendering"). See splitNonEmbeddedFonts.
  if (qpdf.fonts.length > 0) {
    const embedded = qpdf.fonts.filter((f) => f.embedded).length;
    const { flagged, exempt } = splitNonEmbeddedFonts(qpdf.fonts, pdfjs.visibleTextFontNames);
    const exemptEntries = new Set(exempt);

    findings.push("--- Font Embedding ---");
    findings.push(
      `  ${qpdf.fonts.length} font(s) found: ${embedded} embedded, ${flagged.length + exempt.length} not embedded`,
    );
    for (const font of qpdf.fonts.slice(0, 25)) {
      findings.push(
        `  ${font.name} — ${
          font.embedded
            ? "embedded"
            : exemptEntries.has(font)
              ? "NOT embedded (never displays visible text — no impact)"
              : "NOT embedded"
        }`,
      );
    }
    if (qpdf.fonts.length > 25) {
      findings.push(`  ... and ${qpdf.fonts.length - 25} more font(s)`);
    }

    if (flagged.length > 0) {
      // NOT SCORED (2026-08-29 audit): no WCAG 2.2 success criterion requires
      // font embedding. A substituted font still renders and still extracts —
      // the loss is visual fidelity, not screen-reader access. PDF/UA 7.21.4.1
      // requires embedding outright, so this is reported as PDF/UA readiness
      // and the grade, which measures the law, is left alone.
      const fontNames = flagged
        .slice(0, 5)
        .map((f) => f.name)
        .join(", ");
      findings.push(
        `PDF/UA only — not scored: ${flagged.length} non-embedded font(s) may cause garbled text on systems without ${flagged.length === 1 ? "this font" : "these fonts"}: ${fontNames}${flagged.length > 5 ? ` (+${flagged.length - 5} more)` : ""}. No WCAG success criterion requires font embedding — a substituted font still renders and still reads aloud — so this does not affect your grade. PDF/UA (ISO 14289, clause 7.21) does require it.`,
      );
      findings.push(
        "How to fix (optional): In the source application (Word, InDesign), enable font embedding before exporting to PDF. In Acrobat: Document properties (☰ Menu on Windows, File menu on Mac) → Fonts tab shows embedding status.",
      );
    } else if (exempt.length > 0) {
      const exemptNames = exempt
        .slice(0, 5)
        .map((f) => f.name)
        .join(", ");
      // Wording contract: must NOT contain the phrase "non-embedded font" —
      // apps/web's actionPlan.ts uses /non-embedded font/i to select the
      // "Embed the fonts" fix step, and exempt fonts must never trigger it.
      findings.push(
        `All fonts used to display text are embedded. ${exempt.length} font ${exempt.length === 1 ? "entry" : "entries"} (${exemptNames}) ${exempt.length === 1 ? "is" : "are"} not embedded but never ${exempt.length === 1 ? "displays" : "display"} visible text — typically leftover whitespace runs from the source word processor — so ${exempt.length === 1 ? "it" : "they"} cannot affect how the document renders or reads.`,
      );
    } else {
      findings.push(
        "All fonts are embedded — text will render correctly regardless of the user's installed fonts",
      );
    }
  }

  // Unmapped glyphs (v1.94.0 — Matterhorn 10). pdf.js lands glyphs whose
  // fonts provide no usable text mapping in the Private Use Areas (or
  // U+FFFD): the page LOOKS fine while a screen reader gets symbols with no
  // pronunciation — the failure font embedding is only a proxy for. Tiny
  // counts are almost always symbol-font list bullets (Wingdings), so they
  // stay advisory; caps engage only when real prose is affected.
  const unmappedChars = pdfjs.unmappedTextCharCount;
  if (typeof unmappedChars === "number" && unmappedChars > 0) {
    const share = unmappedChars / Math.max(1, pdfjs.textLength);
    const sharePct = Math.round(share * 100);
    findings.push(`--- Character Mapping (Matterhorn 10) ---`);
    findings.push(
      `  ${unmappedChars.toLocaleString()} extracted character(s) cannot be mapped to readable text (${sharePct}% of the text layer) — the glyphs paint on screen, but they extract as private-use symbols a screen reader cannot pronounce.`,
    );
    if (unmappedChars >= 100 && share >= 0.05) {
      score = Math.min(score, 50);
      findings.push(
        "  A meaningful share of this document's text cannot be read aloud or searched, whatever the tagging says. Fix at the source: re-export the PDF from the original application with standard fonts (or embedding enabled), or run OCR over the affected pages — Acrobat: All tools → Scan & OCR → Recognize Text.",
      );
    } else if (unmappedChars >= 20) {
      // NOT SCORED (2026-08-29, the legal-only sweep): below the failure
      // band this is usually symbol-font bullets and dingbats — a judgment a
      // person has to make, not a confirmed 1.1.1 failure.
      findings.push(
        "Advisory — not scored: a count this size is often symbol-font bullets or dingbats, which read as decoration — your grade is not affected. Verify the affected passages read correctly with a screen reader; if they are real words, re-export from the source application.",
      );
    } else {
      findings.push(
        "  Advisory — not scored: a count this small is usually symbol-font bullets or dingbats, which read as decoration. No action needed unless real words are affected.",
      );
    }
  }

  // Text outside tagged content (v1.94.0 — Matterhorn 01-005/006). The
  // content-free-tree check catches the all-or-nothing case; this census
  // measures PARTIAL tagging — visible, non-artifact text painted outside
  // every MCID-carrying run, which no structure element can reference.
  // Computed from the text layer (never annotation appearance streams).
  const untaggedChars = pdfjs.untaggedVisibleChars;
  const taggedChars = pdfjs.taggedVisibleChars ?? 0;
  if (
    qpdf.hasStructTree &&
    !structTreeIsContentFree(qpdf, pdfjs) &&
    typeof untaggedChars === "number" &&
    untaggedChars > 0
  ) {
    const totalVisible = untaggedChars + taggedChars;
    const untaggedShare = untaggedChars / Math.max(1, totalVisible);
    const untaggedPct = Math.round(untaggedShare * 100);
    const pages = pdfjs.untaggedTextPages ?? [];
    const pageList =
      pages.length > 0
        ? ` (page${pages.length === 1 ? "" : "s"} ${pages.join(", ")}${pages.length >= 12 ? ", …" : ""})`
        : "";
    findings.push(`--- Content Outside the Tag Structure (Matterhorn 01) ---`);
    findings.push(
      `  ${untaggedChars.toLocaleString()} visible character(s) — ${untaggedPct}% of the page text — are painted outside the tagged content${pageList}. They are neither in the reading order nor marked as decorative artifacts, so a screen reader following the tags never encounters them.`,
    );
    if (untaggedShare >= 0.1 && untaggedChars >= 200) {
      score = Math.min(score, 50);
      findings.push(
        "  How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF to bring the untagged content into the structure, then verify the affected pages in the Tags panel — or mark genuinely decorative runs as artifacts.",
      );
    } else if (untaggedShare >= 0.02 && untaggedChars >= 50) {
      score = Math.min(score, 85);
      findings.push(
        "  Review the named pages in Acrobat's Tags panel: tag real content, or mark decorative text (watermarks, crop marks) as artifacts.",
      );
    } else {
      findings.push(
        "  Advisory — not scored: an amount this small is often stray export residue. Verify the named pages when convenient.",
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

function scoreTitleLanguage(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
  let score = 0;
  const findings: string[] = [];

  // Title check (50 points; 25 when the title looks like a filename — a
  // 2.4.2 failure in WCAG's own catalogue (F25: the title does not identify
  // the document), attributed by the conformance gate since the legal-only
  // sweep)
  if (pdfjs.title && pdfjs.title.trim().length > 0) {
    if (pdfjs.titleLooksLikeFilename) {
      score += 25;
      findings.push(`Document title: "${pdfjs.title}"`);
      findings.push(
        "The title looks like a filename or tool-generated string rather than a descriptive title — screen readers announce it as the document name, so partial credit only.",
      );
      findings.push(
        'How to fix: In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Description tab → replace it with a descriptive Title (e.g., "2024 Annual Crime Report").',
      );
    } else if (qpdf.displayDocTitle !== true) {
      // NOT SCORED (2026-08-29, the legal-only sweep): DisplayDocTitle is
      // PDF/UA clause 7.1's requirement, checked by veraPDF under that
      // clause. WCAG 2.1's 2.4.2 asks for a describing title, which this
      // document HAS — the viewer-preference flag is how one PDF technique
      // exposes it, not the criterion itself. Full credit; reported as an
      // unscored PDF/UA item.
      score += 50;
      findings.push(`Document title: "${pdfjs.title}"`);
      findings.push(
        "PDF/UA only — not scored: the title is set, but the DisplayDocTitle viewer preference is off, so viewers show the FILENAME in the title bar instead of this title. WCAG 2.1 asks for a describing title, which this document has — your grade is not affected. PDF/UA (clause 7.1) requires the flag as well.",
      );
      findings.push(
        "How to fix (optional): In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Initial View tab → set Show: Document Title, then save.",
      );
    } else {
      score += 50;
      findings.push(`Document title: "${pdfjs.title}" (shown by viewers — DisplayDocTitle is set)`);
    }
  } else {
    findings.push("No document title found in metadata");
    findings.push(
      "How to fix: In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Description tab → enter a descriptive Title.",
    );
    findings.push(
      'The title is what screen readers announce when a user first opens the document. Without it, they hear the filename instead (e.g., "report_v3_final.pdf").',
    );
  }

  // Language check (50 points; 25 when a declaration exists but its value
  // is not a usable language code — v1.92.0, Matterhorn 11 / WCAG technique
  // PDF16. "english" or "en_US" defeats screen-reader pronunciation
  // switching just like no tag, but a declaration IS present, so partial
  // credit with a targeted fix. Never a conformance-gate failure.)
  const hasLang = qpdf.hasLang || !!pdfjs.lang;
  const langValue = (qpdf.lang || pdfjs.lang || "").trim();
  // A well-formed tag that CONTRADICTS the text is scored like a malformed
  // one (partial credit): the declaration exists, and it defeats screen-reader
  // pronunciation exactly as thoroughly. Deliberately hard to trigger — see
  // languagePlausibility.ts for the four guards.
  const mismatch =
    hasLang && isPlausibleLanguageTag(langValue)
      ? detectLanguageMismatch(pdfjs.textSample ?? "", langValue)
      : null;
  if (mismatch) {
    score += 25;
    const declaredName = LANGUAGE_NAMES[mismatch.declared] ?? mismatch.declared;
    const detectedName = LANGUAGE_NAMES[mismatch.detected] ?? mismatch.detected;
    findings.push(
      `The document declares its language as "${langValue}" (${declaredName}), but the text reads as ${detectedName}. A screen reader follows the declaration, so it would pronounce this document with ${declaredName} pronunciation rules throughout — the words come out as ${declaredName} sounds, which is very hard to listen to and often unintelligible.`,
    );
    findings.push(
      `What the check saw: of ${mismatch.wordCount.toLocaleString()} words sampled, ${mismatch.detectedHits} are common ${detectedName} words and only ${mismatch.declaredHits} are common ${declaredName} words.`,
    );
    findings.push(
      `How to fix: In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Advanced tab → Reading Options → set Language to the language the document is actually written in, then save. In Word, set the proofing language for the whole document (Review → Language → Set Proofing Language) before exporting — a single passage marked in another language can otherwise be exported as the language of the entire file.`,
    );
    findings.push(
      `If part of this document really is in ${declaredName}, that is handled differently: mark just those passages with their own language, and leave the document language as the one most of the text is written in.`,
    );
  } else if (hasLang && isPlausibleLanguageTag(langValue)) {
    score += 50;
    findings.push(`Language declared: ${qpdf.lang || pdfjs.lang}`);
  } else if (hasLang) {
    score += 25;
    findings.push(
      `Language declared as "${langValue}" — this is not a usable language code, so screen readers may ignore it and fall back to their default pronunciation. Language codes are short standard identifiers such as "en-US" (US English) or "es" (Spanish), not language names.`,
    );
    findings.push(
      'How to fix: In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Advanced tab → Reading Options → pick the language from the dropdown (or type a standard code such as "en-US"), then save.',
    );
  } else {
    findings.push("No language declaration found");
    findings.push(
      "How to fix: In Adobe Acrobat, open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Advanced tab → Reading Options → set the Language dropdown.",
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

// ---------------------------------------------------------------------------
// Heading CONTENT quality (v1.110.0).
//
// A heading tag can sit at a perfectly legal level and still be useless: it
// can hold no text, hold half a sentence, or hold an entire paragraph. A
// 246-page annual report scored 60 for six level skips while 62 of its 96
// heading tags were one of those three things — 19 empty, 29 cut mid-word
// ("Population d", "property crime a", "la"), 14 whole paragraphs. The outline
// printed the evidence and nothing scored it.
//
// Conservative by design, because ANY sub-100 category becomes a severity and
// a severity caps the whole grade. It needs enough headings to judge, enough
// of them affected to be a pattern, and it must not mistake ordinary English
// for a fragment.
// ---------------------------------------------------------------------------

/** Longer than this is a paragraph wearing a heading's tag, not a heading. */
const HEADING_PARAGRAPH_CHARS = 120;
/** Below this many inspected headings, one bad entry would swing the share. */
const HEADING_MIN_INSPECTED = 6;
/** And a pattern needs more than one or two stragglers. */
const HEADING_MIN_UNUSABLE = 3;
/** Share of unusable headings that costs the same as a broken hierarchy. */
const HEADING_UNUSABLE_SHARE = 0.2;
/** Share at which the outline is effectively unusable for navigation. */
const HEADING_MOSTLY_UNUSABLE_SHARE = 0.5;

/** Short words that legitimately end a heading — "What we do", "How to apply".
 *  Without this list the truncation rule flags perfectly good English. */
const ORDINARY_SHORT_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "do",
  "for",
  "go",
  "he",
  "her",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "no",
  "not",
  "of",
  "off",
  "on",
  "or",
  "our",
  "out",
  "she",
  "so",
  "the",
  "to",
  "up",
  "us",
  "was",
  "we",
  "who",
  "why",
  "you",
]);

/** Ends mid-word: a trailing one-to-three-letter lowercase scrap that is not a
 *  word, with no closing punctuation to suggest the heading meant to stop. */
function endsMidWord(text: string): boolean {
  if (/[.!?:;)\]"'’”]$/.test(text)) return false;
  const last = text.split(/\s+/).pop() ?? "";
  if (last.length === 0 || last.length > 3) return false;
  if (!/^[a-z]+$/.test(last)) return false;
  return !ORDINARY_SHORT_WORDS.has(last);
}

/** Starts mid-sentence: a lowercase opening that is not a lowercase-initial
 *  name ("iPhone", "eFiling", "e-Filing"). */
function startsMidSentence(text: string): boolean {
  if (!/^[a-z]/.test(text)) return false;
  const first = text.split(/\s+/)[0] ?? "";
  if (/^[a-z][A-Z]/.test(first)) return false;
  if (/^[a-z]-[A-Z]/.test(first)) return false;
  return true;
}

export interface HeadingContentCensus {
  inspected: number;
  empty: number;
  fragments: number;
  paragraphs: number;
  unusable: number;
  /** A few offenders, verbatim, so the author can check the claim. */
  samples: string[];
}

/** Census of heading tags that do not read as headings. Exported for tests. */
export function censusHeadingContent(
  outline: Array<{ level: string; text: string; textReliable?: boolean }> | undefined,
  withoutText: number | undefined,
): HeadingContentCensus | null {
  // Entries from a page whose text could not be attributed are not evidence
  // either way — judging them would mean calling a heading a fragment because
  // WE could not read it.
  const entries = (outline ?? []).filter((e) => e.textReliable !== false);
  const empty = withoutText ?? 0;
  const inspected = entries.length + empty;
  // No outline at all is "we could not look", never "the headings are bad".
  if (entries.length === 0) return null;
  const fragmentTexts: string[] = [];
  let paragraphs = 0;
  for (const e of entries) {
    const text = e.text.trim();
    if (text.length > HEADING_PARAGRAPH_CHARS) paragraphs++;
    else if (endsMidWord(text) || startsMidSentence(text)) fragmentTexts.push(text);
  }
  return {
    inspected,
    empty,
    fragments: fragmentTexts.length,
    paragraphs,
    unusable: empty + fragmentTexts.length + paragraphs,
    // Embedded double quotes are replaced: the finding wraps each sample in
    // double quotes, and a sample carrying its own would nest them unbalanced
    // — which is also what would let document text bleed past the icon
    // classifier's quoted-span stripping (apps/web findings.ts).
    samples: fragmentTexts.slice(0, 3).map((t) => t.replace(/"/g, "'")),
  };
}

/** The score this census justifies (100 = nothing to say), plus its findings. */
function headingContentVerdict(census: HeadingContentCensus | null): {
  score: number;
  findings: string[];
} {
  if (!census || census.unusable === 0) return { score: 100, findings: [] };
  const { inspected, empty, fragments, paragraphs, unusable, samples } = census;
  const findings: string[] = ["--- Do the Headings Read Like Headings? ---"];
  if (empty > 0) {
    findings.push(
      `  ${empty} heading tag(s) carry no text at all — a screen-reader user who jumps to one lands on silence.`,
    );
  }
  if (fragments > 0) {
    findings.push(
      `  ${fragments} heading tag(s) hold a fragment rather than a heading — the tag caught part of a sentence, often cut off mid-word${samples.length ? `: ${samples.map((t) => `"${t}"`).join(", ")}` : ""}.`,
    );
  }
  if (paragraphs > 0) {
    findings.push(
      `  ${paragraphs} heading tag(s) hold an entire paragraph. A heading is a signpost; a paragraph read out as one tells a listener nothing about where they are.`,
    );
  }
  const usable = inspected - unusable;
  const pct = Math.round((100 * usable) / inspected);
  findings.push(
    `  ${usable} of ${inspected} heading tag(s) (${pct}%) read as real headings. Navigating this document by heading — which is how most screen-reader users move through a long report — mostly lands on blanks and half-sentences.`,
  );
  findings.push(
    "  This is the signature of automatic tagging applied after the fact (Acrobat's Autotag, or combining files that were tagged separately): the tags were placed by shape on the page rather than by meaning. Re-exporting from the source document with its real heading styles fixes it wholesale; repairing it in Acrobat means retagging each one by hand in the Tags panel.",
  );

  if (inspected < HEADING_MIN_INSPECTED || unusable < HEADING_MIN_UNUSABLE) {
    // Reported, not scored: too few to call it a pattern.
    return { score: 100, findings };
  }
  const share = unusable / inspected;
  if (share >= HEADING_MOSTLY_UNUSABLE_SHARE) return { score: 40, findings };
  if (share >= HEADING_UNUSABLE_SHARE) return { score: 60, findings };
  return { score: 100, findings };
}

function scoreHeadingStructure(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
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

    // A SHORT document with no headings, no heading-like role-mapped tags,
    // and no bookmark outline is plausibly heading-less by design — WCAG
    // does not require headings in content that has no sections, and the
    // DOCX path already treats this case as N/A. Scoring it 0/Critical made
    // the identical one-page memo grade 70/C as PDF and 100/A as DOCX.
    // Substantive documents (many pages/paragraphs, or heading-like signals)
    // keep the 0.
    const substantive =
      qpdf.totalPageCount >= 4 || qpdf.paragraphCount >= 20 || qpdf.outlineCount > 0;
    if (!substantive && roleMappedParagraphs.length === 0) {
      return {
        id: "heading_structure",
        label: "Heading Structure",
        weight: SCORING_WEIGHTS.heading_structure,
        score: null,
        grade: null,
        severity: null,
        findings: [
          "No headings were found. Short documents may not need them; longer documents should use H1–H6 tags so screen-reader users can navigate.",
        ],
        explanation: headingExplanation,
        helpLinks: headingLinks,
      };
    }

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

    findings.push(
      "How to fix: In Adobe Acrobat, open the Tags panel (☰ Menu on Windows or View menu on Mac → Show/Hide → Side panels → Accessibility tags; classic UI: View → Show/Hide → Navigation Panes → Tags). Select text that serves as a heading, right-click the corresponding tag, and change its type to H1, H2, etc.",
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

  // The tree above shows LEVELS (from qpdf); this shows each heading's TEXT
  // (from pdfjs's struct-tree walk) so a remediator can see which section is
  // which. Absent when pdfjs could not resolve any heading text.
  if (pdfjs.headingOutline?.length) {
    findings.push(...headingOutlineLines(pdfjs.headingOutline));
  }

  // Do those headings read like headings? Levels are only half the outline.
  const contentVerdict = headingContentVerdict(
    censusHeadingContent(pdfjs.headingOutline, pdfjs.headingsWithoutText),
  );
  findings.push(...contentVerdict.findings);

  const hasNumberedHeadings = qpdf.headings.some((h) => /^H[1-6]$/.test(h.level));

  if (!hasNumberedHeadings) {
    // NOT SCORED (2026-08-29, the legal-only sweep): headings exist and are
    // programmatically identifiable — the outline's LEVELS are what generic
    // <H> withholds. ISO 32000 itself permits <H> in strongly structured
    // documents; requiring numbered levels is PDF/UA 7.4 / Matterhorn 14,
    // not a WCAG 2.1 criterion.
    findings.push(
      "PDF/UA only — not scored: only generic <H> tags were found (not H1–H6). The headings are identifiable to assistive technology, but they carry no level, so the outline has no depth. WCAG 2.1 does not require numbered levels — your grade is not affected — but PDF/UA (clause 7.4) does.",
    );
    findings.push(
      "How to fix (optional): In the Tags panel, change each /H tag to a specific level (H1, H2, etc.) that matches the document outline.",
    );
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

  // Check hierarchy
  const levels = qpdf.headings
    .filter((h) => /^H[1-6]$/.test(h.level))
    .map((h) => parseInt(h.level.replace("H", "")));

  const h1Count = levels.filter((l) => l === 1).length;
  let hierarchyBroken = false;

  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      hierarchyBroken = true;
      findings.push(
        `  Heading hierarchy skip: H${levels[i - 1]} → H${levels[i]} (skipped H${levels[i - 1] + 1})`,
      );
    }
  }

  // Multiple H1s are ADVISORY, never scored. No WCAG criterion, PDF/UA-1
  // clause, or Matterhorn condition requires a single H1 (PDF/UA explicitly
  // permits repeated H1s in strongly structured documents), and Acrobat/PAC
  // do not flag it. Because any sub-100 category score becomes a severity
  // and a severity caps the GRADE (SEVERITY_GRADE_CAPS), scoring this
  // HTML-era convention 75 was denying a conformance-clean document its A:
  // controls/DVFR_Biennial_2024 (5×H1, no other finding) graded B for it.
  // Hierarchy SKIPS keep their penalty — that one has a standards basis
  // (Matterhorn 13-004; WCAG technique G141).
  if (h1Count > 1) {
    findings.push(
      `Found ${h1Count} H1 headings. No WCAG criterion requires a single H1, so this does not affect the score — but many style guides recommend one top-level heading (the document title), with sections demoted to H2 and below, so the outline has a single root.`,
    );
  }

  // Mixed conventions (v1.92.0 — Matterhorn 14-002): generic <H> headings
  // alongside numbered <H1>–<H6>. PDF/UA-1 requires a document to pick ONE
  // convention; a generic <H> conveys no level, so the outline a screen
  // reader announces has holes exactly where those headings sit. Scored at
  // the same tier as a hierarchy skip — the outline is partially unlevelled,
  // not absent. (An ALL-generic document is the harsher 40 above.)
  const genericHCount = qpdf.headings.filter((h) => h.level === "H").length;
  const mixedConventions = genericHCount > 0;
  if (mixedConventions) {
    findings.push(
      `PDF/UA only — not scored: ${genericHCount} generic <H> heading(s) appear alongside the numbered <H1>–<H6> headings. PDF/UA prohibits mixing the two conventions in one document (Matterhorn 14-002); WCAG 2.1 does not — your grade is not affected — but screen-reader users lose their depth in an otherwise numbered outline where those headings sit.`,
    );
    findings.push(
      "How to fix (optional): In the Tags panel, change each generic <H> tag to the specific level (H1–H6) that matches its place in the outline.",
    );
  }

  // NOT SCORED (2026-08-29, the legal-only sweep). Hierarchy SKIPS and mixed
  // conventions were scored via Matterhorn 13-004 / 14-002 and WCAG
  // technique G141 — a PDF/UA condition and a *technique*, not a criterion.
  // W3C's own guidance says skipped levels are not a WCAG failure. The
  // headings exist, are identifiable, and carry levels: 1.3.1 is satisfied.
  // Reported, never counted.
  if (hierarchyBroken) {
    findings.unshift(
      `PDF/UA only — not scored: found ${levels.length} heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected. Screen-reader users may still wonder what they missed at the skipped level.`,
    );
    findings.push(
      "How to fix (optional): renumber the heading tags so levels never skip — e.g., don't jump from H1 to H3 without an H2 in between.",
    );
  }

  if (contentVerdict.score < 100) {
    // The levels are sound; what they contain may not be — but the content
    // judgment is a heuristic (and pdf.js has misattributed heading text
    // before: v1.110.0), so it advises, never scores.
    findings.unshift(
      `Advisory — not scored: found ${levels.length} heading tags in a sound level order, but some of them may not read as headings — review the outline above by hand. Heuristic judgment only; your grade is not affected.`,
    );
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
 * not human-readable, or self-defeating (declaring the image decorative).
 * Returns a reason string if suspicious, or null if the text looks plausible.
 */
function detectSuspiciousAltText(text: string): string | null {
  if (!text || text.trim().length === 0) return null;
  const t = text.trim();

  // Alt text that says the image is decorative is a category error: a
  // genuinely decorative image belongs outside the reading order as an
  // /Artifact, not inside it with a description a screen reader will
  // announce ("Decorative border, graphic" ×3 — observed in controls/).
  // Anchored at the start so alt that DEPICTS decoration ("Photo of
  // decorative ironwork…") is untouched.
  if (
    /^decorat(ive|ion|ed)?\b/i.test(t) ||
    /^(border|spacer|divider|separator|flourish|ornament)s?$/i.test(t)
  ) {
    return "describes the image as decorative — a genuinely decorative image should be marked as an /Artifact (removed from the reading order) instead of carrying alt text";
  }

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
    /^(IMG_?\d|DSC_?\d|image\d|photo\d|picture\d|screenshot|untitled)/i.test(t) &&
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
  const untaggedImageSignals = Math.max(pdfjs.imageCount, qpdf.imageObjectCount);

  // Formulas (v1.92.0 — Matterhorn 17) join this category's coverage: like
  // figures, they are non-text content whose machine-verifiable requirement
  // is a text alternative (/Alt or /ActualText), and a separate category
  // would double-weight documents carrying both. The figures-only early
  // returns below are all gated on formulaCount === 0 so a formula-bearing
  // document always reaches the scored path.
  const formulaCount = qpdf.formulaCount ?? 0;
  const formulasMissingAlt = qpdf.formulasMissingAlt ?? 0;
  const formulasWithAlt = formulaCount - formulasMissingAlt;

  // With no tagged figures but images on the page, distinguish decorative
  // artifacts (no alt needed) from untagged content. pdfjs walks the content
  // stream and knows which images sit inside an /Artifact run; when every
  // painted image is artifacted — and qpdf sees no image objects beyond those —
  // there is no content image to describe, so the alarming "untagged images"
  // advisory below would be a false positive (e.g. a report whose only images
  // are an artifacted cover graphic and closing logos).
  const paintedImages = pdfjs.imageCount;
  const paintedContentImages = pdfjs.nonArtifactImageCount ?? paintedImages;
  const allImagesArtifacted =
    !pdfjs.error &&
    paintedImages > 0 &&
    paintedContentImages === 0 &&
    qpdf.imageObjectCount <= paintedImages;

  if (figures.length === 0 && formulaCount === 0 && allImagesArtifacted) {
    return {
      id: "alt_text",
      label: "Alt Text on Images",
      weight: SCORING_WEIGHTS.alt_text,
      score: null,
      grade: null,
      severity: null,
      notAssessed: true,
      findings: [
        `${paintedImages} image(s) detected — all are marked as artifacts (decorative) and excluded from the reading order, so no alt text is required.`,
        "Artifacted images are correctly hidden from screen readers. If any of these images actually convey information, they should instead be tagged as <Figure> with /Alt text — verify in Acrobat's Tags panel that none are meaningful content.",
      ],
      explanation: altExplanation,
      helpLinks: altLinks,
    };
  }

  // Content images with no <Figure> tag at all — measured from pdfjs's
  // artifact-aware walk, so correctly-artifacted decorative graphics are
  // already excluded. null when pdfjs could not measure it.
  const untaggedContentImages = untaggedContentImageCount(qpdf, pdfjs);

  // No tagged figures, but there ARE content images painted outside every
  // /Artifact run. This is the WORST alt-text case — nothing is described and
  // nothing is even in the reading order — and it used to return N/A, which
  // dropped the category out of the weighted average and let this document
  // out-score one with a single missing /Alt.
  if (
    figures.length === 0 &&
    formulaCount === 0 &&
    untaggedContentImages !== null &&
    untaggedContentImages > 0
  ) {
    return {
      id: "alt_text",
      label: "Alt Text on Images",
      weight: SCORING_WEIGHTS.alt_text,
      score: 0,
      grade: getGrade(0),
      severity: getSeverity(0),
      findings: [
        `${untaggedContentImages} content image(s) are painted on the page but none are tagged as <Figure> — they have no alternative text and are missing from the reading order entirely.`,
        "These are the images left AFTER excluding everything correctly marked as a decorative Artifact, so each one is either content that needs a description or decoration that still needs to be artifacted.",
        "How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Fix reading order. Select each image, then either click Figure and add alternate text (right-click → Edit Alternate Text), or click Background/Artifact if it is purely decorative.",
        `--- Image Census ---`,
        `  Tagged <Figure> elements: 0`,
        `  Content images painted outside any /Artifact run: ${untaggedContentImages}`,
        `  Total image rendering operations observed: ${pdfjs.imageCount}`,
        `  Image XObjects in the PDF object graph: ${qpdf.imageObjectCount}`,
      ],
      explanation: altExplanation,
      helpLinks: altLinks,
    };
  }

  // Raw image signals with no artifact-coverage evidence are still too noisy
  // to score automatically (pdfjs failed, or reported no artifact data).
  if (figures.length === 0 && formulaCount === 0 && untaggedImageSignals > 0) {
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

  if (figures.length === 0 && formulaCount === 0) {
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

  const figuresWithAlt = figures.filter((f) => f.hasAlt).length;
  // Formulas share the coverage figure with figures — see the census note
  // above. Content images absent from the tag tree count AGAINST coverage
  // rather than being ignored: a partially tagged document can paint many
  // more images than it tags, and those are worse off than a figure with no
  // /Alt. Scoring tagged figures alone let a document claim "all images
  // described" while half of them were never in the reading order.
  const withAlt = figuresWithAlt + formulasWithAlt;
  const untaggedInDenominator = untaggedContentImages ?? 0;
  const describableTotal = figures.length + untaggedInDenominator + formulaCount;
  const score = withAlt === 0 ? 0 : Math.floor((withAlt / describableTotal) * 100);
  const findings: string[] = [];

  if (figures.length > 0 && figuresWithAlt === figures.length) {
    findings.push(`All ${figures.length} tagged image(s) have alternative text`);
    findings.push(`--- Image Alt Text Details ---`);
    for (let fi = 0; fi < figures.length && fi < 20; fi++) {
      const fig = figures[fi];
      const label = figures.length > 1 ? `Image ${fi + 1}` : "Image";
      findings.push(`  ${label}: "${fig.altText || "(empty alt)"}"`);
    }
    if (figures.length > 20) {
      findings.push(`  ... and ${figures.length - 20} more image(s)`);
    }
  } else if (figures.length > 0) {
    findings.push(`${figuresWithAlt} of ${figures.length} image(s) have alternative text`);
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
      findings.push(`  ... and ${totalMissing - 15} more image(s) without alt text`);
    }
    if (figuresWithAlt > 0) {
      findings.push(`--- Images With Alt Text ---`);
      let shownCount = 0;
      for (let fi = 0; fi < figures.length && shownCount < 10; fi++) {
        if (figures[fi].hasAlt) {
          shownCount++;
          findings.push(`  Image ${fi + 1}: "${figures[fi].altText}"`);
        }
      }
      if (figuresWithAlt > 10) {
        findings.push(`  ... and ${figuresWithAlt - 10} more image(s) with alt text`);
      }
    }
    findings.push(
      'How to fix: In Adobe Acrobat, open the Tags panel → find the <Figure> tag for each image → right-click → Properties → enter a description in the "Alternate Text" field.',
    );
    findings.push(
      'Tip: Good alt text is concise and describes the purpose of the image, not just its appearance. For example, "Bar chart showing 2024 crime rates by county" rather than "chart".',
    );

    // Figures that are really text. Word exports text boxes, sidebars,
    // SmartArt and chart title bars as <Figure> with the text nested inside;
    // a Figure's /Alt REPLACES its contents for a screen reader, so "describe
    // it" would hide the very text the box holds. Those need retagging, and
    // the author must be told so before they follow the step above.
    const textFigures = (pdfjs.textBearingFigures ?? []).filter((f) => !f.hasAlt);
    if (textFigures.length > 0) {
      findings.push(`--- Figures That Contain Text ---`);
      findings.push(
        `${textFigures.length} <Figure> tag(s) without alt text contain readable text — typically Word text boxes, sidebars, SmartArt, or chart title bars exported as figures:`,
      );
      for (const f of textFigures.slice(0, 10)) {
        findings.push(`  Page ${f.page}: "${f.preview}"`);
      }
      if (textFigures.length > 10) {
        findings.push(`  ... and ${textFigures.length - 10} more`);
      }
      findings.push(
        'Do not add alt text to these. A <Figure>\'s alternate text replaces its contents for screen readers, so describing a text box as an image hides the text inside it. Instead change the tag so the text is read directly: Tags panel → right-click the <Figure> → Properties → Type → "Section" (or "Paragraph" for a single block of text). In Word, keep body content out of text boxes and shapes — use ordinary paragraphs, headings, and lists. Pictures and charts still need alt text.',
      );
    }
  }

  // Text that was turned into pictures on the way out of Word (v1.105.0).
  // Deliberately its own section rather than a note under "missing alt text":
  // the remedy is the opposite one. Alt text on a rasterized word is not a
  // fix — it re-types the word into a description and leaves it unsearchable,
  // unselectable, and unable to reflow. The fix belongs in the source
  // document, and the author cannot see the problem from there, so the
  // finding has to say both things out loud.
  //
  // Never asserts a WCAG failure and never moves the score: the heuristic
  // recognises the SHAPE of a rasterized text line, which is evidence, not
  // proof. It gives the reader a one-step way to confirm it themselves.
  // Softened when every image is already described (v1.107.0). A document
  // that gave its banner real alt text has done the accessible thing — the
  // DoIT XFA example alt-texted "Office Supply" and still got a scary block
  // under a category scoring 100/A. The wording is still worth having (a
  // description does not make the words searchable or resizable), but as a
  // short note rather than a five-paragraph correction aimed at someone who
  // did it wrong.
  const textLineLikeImages = qpdf.textLineLikeImageCount ?? 0;
  const everyImageDescribed = figures.length > 0 && figuresWithAlt === figures.length;
  if (textLineLikeImages > 0 && everyImageDescribed) {
    findings.push(`--- Some Lettering May Not Be Real Text ---`);
    findings.push(
      `${textLineLikeImages} image(s) here are shaped like lines of writing rather than like photographs — often a banner or letterhead whose words are part of the artwork. You have described them, which is the right thing to do, so this is a note rather than a problem: a description makes the meaning available to a screen reader, but the words themselves still cannot be searched for, selected, or resized. If that wording matters to readers, consider also having it on the page as ordinary text. Advisory — this does not affect the score.`,
    );
  } else if (textLineLikeImages > 0) {
    findings.push(`--- Some Lettering May Not Be Real Text ---`);
    findings.push(
      `${textLineLikeImages} image(s) in this document are shaped like lines of writing — wide, short, and about as tall as a line of type — rather than like photographs or logos. Graphics that shape usually mean words have been baked into artwork instead of typed as text. Letterheads and banner headings are where this happens most. On screen those words look perfect, which is exactly why it goes unnoticed.`,
    );
    findings.push(
      "Why it matters: a picture of a word is not a word. A screen reader has nothing to read out — it sees artwork, not letters. Find-on-this-page cannot search it. It will not rearrange itself when someone zooms in, and it can turn blurry when magnified. None of that is solved by describing the graphic.",
    );
    findings.push(
      "How to check this yourself, in about ten seconds: open this PDF and try to select those words with your mouse, as though you were about to copy them. If they highlight, they are real text and you can ignore this note. If nothing highlights, they are artwork.",
    );
    findings.push(
      "Documents end up this way for two different reasons, and the reasons need different fixes. (1) The lettering belongs to a logo or letterhead that was pasted in as a graphic — those words were never text and cannot be turned back into text. Make sure the same wording also appears as ordinary text somewhere on the page (the organisation's name in the body or the footer, for example), and mark the graphic itself as decorative so it is not announced as an unexplained image. (2) The lettering is text somebody typed that carries a visual effect — a drop shadow, an outline, a glow, a reflection, or a colour that fades across the letters — and the PDF export flattened it on the way out. That one IS repairable at the source: select the text, remove the effect (in Word: Font → Text Effects) or retype it as plain text in a solid colour, then export again.",
    );
    findings.push(
      'Either way, do not simply add a description. A description stands in for the words rather than bringing them back, so the wording still cannot be searched, selected, or resized. Worth knowing: no accessibility checker inside Word or InDesign can warn you about this, because the source file looks perfectly fine there — the words only stop being words when the PDF is produced, which makes the PDF the first place it can be caught. Decorative artwork is marked with the "Background/Artifact" option in Acrobat\'s reading-order tool.',
    );
  }

  // Formulas (v1.92.0 — Matterhorn 17). Counted in the coverage figure above;
  // listed here so a formula-bearing document sees exactly what is measured.
  if (formulaCount > 0) {
    findings.push(`--- Mathematical Formulas (Matterhorn 17) ---`);
    if (formulasMissingAlt === 0) {
      findings.push(
        `  All ${formulaCount} <Formula> tag(s) carry a text alternative (/Alt or /ActualText).`,
      );
    } else {
      findings.push(
        `  ${formulasMissingAlt} of ${formulaCount} <Formula> tag(s) have no text alternative — a formula's glyphs rarely extract as speakable text, so a screen reader gets nothing usable from the expression itself. Counted against this category's coverage above.`,
      );
      findings.push(
        '  How to fix: In Adobe Acrobat, open the Tags panel → find each <Formula> tag → right-click → Properties → enter the spoken form in the Alternate Text field (e.g., "x equals negative b, plus or minus the square root of b squared minus 4 a c, all over 2 a").',
      );
    }
  }

  // A formula-bearing document whose raw image signals could not be
  // artifact-classified still deserves the manual-review pointer the
  // signals-only branch above would have shown.
  if (
    figures.length === 0 &&
    formulaCount > 0 &&
    untaggedContentImages === null &&
    untaggedImageSignals > 0
  ) {
    findings.push(
      `${untaggedImageSignals} image-like object(s) were also detected but could not be classified as content or decoration — review them manually in Acrobat's Tags panel; they are not counted in this category's coverage.`,
    );
  }

  if (untaggedInDenominator > 0) {
    findings.push(
      `${untaggedInDenominator} further content image(s) are painted in the document but are not tagged as <Figure> at all — they are missing from the reading order entirely, which is worse than a figure with no /Alt. They are counted against this category's coverage above.`,
    );
    findings.push(
      "How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Fix reading order, select each untagged image, then either click Figure and add alternate text, or click Background/Artifact if it is decorative.",
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
      `  ${suspicious.length} image(s) have alt text that needs review (no score penalty):`,
    );
    for (const s of suspicious.slice(0, 15)) {
      const preview = s.alt.length > 60 ? s.alt.slice(0, 60) + "…" : s.alt;
      findings.push(`  Image ${s.index}: "${preview}" — ${s.reason}`);
    }
    if (suspicious.length > 15) {
      findings.push(`  ... and ${suspicious.length - 15} more suspicious alt text value(s)`);
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
      label: "Adobe: Check for accessibility (classic: Full Check)",
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
        "How to fix: In Adobe Acrobat, go to the Bookmarks panel (the bookmark icon in the right-side panel; classic UI: View → Show/Hide → Navigation Panes → Bookmarks). You can create bookmarks manually or auto-generate them from headings (Options menu → New Bookmarks From Structure).",
      ],
      explanation: bookmarkExplanation,
      helpLinks: bookmarkLinks,
    };
  }

  return {
    id: "bookmarks",
    label: "Bookmarks / Navigation",
    weight: SCORING_WEIGHTS.bookmarks,
    // NOT SCORED (2026-08-29, the legal-only sweep — the user's ruling made
    // explicit): no WCAG 2.1 criterion requires bookmarks inside a single
    // document, so their absence may not move the grade. Reported loudly,
    // counted never.
    score: 100,
    grade: "A",
    severity: "No issues found",
    findings: [
      `Advisory — not scored: this document has ${pdfjs.pageCount} pages and no bookmarks. No WCAG 2.1 criterion requires bookmarks in a single document (2.4.5 Multiple Ways applies to sets of pages), so your grade is not affected — but Adobe Acrobat's own checker flags long documents without them, and they remain the fastest way for every reader, screen-reader users included, to move around a long PDF.`,
      "How to fix (optional): In Adobe Acrobat, go to the Bookmarks panel. Create bookmarks for each major section, or auto-generate them from heading tags (Options → New Bookmarks From Structure).",
    ],
    explanation: bookmarkExplanation,
    helpLinks: bookmarkLinks,
  };
}

function scoreTableMarkup(qpdf: QpdfResult): CategoryResult {
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
    "Table markup tells screen readers how to navigate data tables. What is scored is what WCAG 1.3.1 requires: header cells (TH tags), row structure (TR tags), a regular grid, and — for tables whose headers run along more than one edge or contain spanned cells — a Scope or Headers association, without which the header-to-data relationship cannot be determined. Missing Scope on a plain one-header-row table, nested tables, and captions are reported as best practices and never counted in the score.";

  if (qpdf.tables.length === 0) {
    return {
      id: "table_markup",
      label: "Table Markup",
      weight: SCORING_WEIGHTS.table_markup,
      score: null,
      grade: null,
      severity: null,
      findings: ["No tables detected in this document — this category does not affect the score"],
      explanation: tableExplanation,
      helpLinks: tableLinks,
    };
  }

  // A construct whose first row spans a single column is a layout scaffold,
  // not a data table. The conformance gate already skips these for the 1.3.1
  // no-headers failure ((t.columnCounts[0] ?? 2) >= 2 — the SAME expression,
  // so score and gate can never disagree), and the DOCX/XLSX scorers skip
  // them explicitly. Docking the score for missing <TH> on them contradicted
  // all three: controls/2022_DVFR_Annual_Report carried 26 single-column
  // tables and scored 75 for header markup on constructs this tool itself
  // classifies as layout. One-column tables still appear in the overview,
  // marked, so nothing is silently hidden.
  // Single-ROW constructs join single-column ones as layout scaffolds
  // (2026-08-29): both conformance gates have always excluded sub-2×2 tables
  // from failure assertions ("overwhelmingly layout constructs"), and the
  // score now follows the same rule the gates do — a one-row [TD TD TD]
  // strip is page furniture, not a data table owed a header.
  const isDataTable = (t: TableAnalysis): boolean =>
    (t.columnCounts[0] ?? 2) >= 2 && t.rowCount >= 2;
  const scored = qpdf.tables.map((t, i) => ({ t, i })).filter(({ t }) => isDataTable(t));
  const dataTables = scored.map(({ t }) => t);
  const layoutCount = qpdf.tables.length - dataTables.length;

  const totalTables = qpdf.tables.length;
  const findings: string[] = [];

  // Per-table structural summary — ALL tables, layout ones marked.
  findings.push(`--- Table Structure Overview ---`);
  for (let ti = 0; ti < totalTables; ti++) {
    const t = qpdf.tables[ti];
    const label = totalTables > 1 ? `Table ${ti + 1}` : "Table";
    const cols = t.columnCounts.length > 0 ? `${t.columnCounts[0]} cols` : "no col data";
    const parts: string[] = [
      `${t.rowCount} rows × ${cols}`,
      `${t.headerCount} <TH>, ${t.dataCellCount} <TD>`,
    ];
    if (t.hasScope) parts.push("scope: present");
    else if (t.headerCount > 0 && t.simpleHeaderLayout)
      parts.push(`scope: absent (not required — single-axis headers)`);
    else if (t.headerCount > 0) parts.push(`scope: missing on ${t.scopeMissingCount} header(s)`);
    if (t.hasCaption) parts.push("caption: yes");
    if (t.hasNestedTable) parts.push("NESTED TABLE");
    if (t.hasConsistentColumns === false) {
      const unique = [...new Set(t.columnCounts)];
      parts.push(`inconsistent cols: [${unique.join(", ")}]`);
    }
    if (t.hasHeaderAssociation) parts.push("/Headers assoc: yes");
    if (!isDataTable(t)) parts.push("single-column — layout, not scored");
    findings.push(`  ${label}: ${parts.join(" | ")}`);
  }

  if (dataTables.length === 0) {
    findings.push(
      `${totalTables} single-column table(s) detected — treated as layout structures rather than data tables, so header markup is not required and this category does not affect the score.`,
    );
    findings.push(
      "If any of these actually presents data relationships, restructure it as a real table with <TH> header cells; if it only positions content, consider whether it needs to be a <Table> at all.",
    );
    return {
      id: "table_markup",
      label: "Table Markup",
      weight: SCORING_WEIGHTS.table_markup,
      score: null,
      grade: null,
      severity: null,
      findings,
      explanation: tableExplanation,
      helpLinks: tableLinks,
    };
  }

  if (layoutCount > 0) {
    findings.push(
      `${layoutCount} single-column table(s) are treated as layout structures and excluded from the checks below; the ${dataTables.length} multi-column data table(s) are scored.`,
    );
  }

  const n = dataTables.length;
  let score = 0;

  // 1. Header presence (40 points) — most critical for screen reader navigation
  const withHeaders = dataTables.filter((t) => t.hasHeaders).length;
  if (withHeaders === n) {
    score += 40;
    const totalTH = dataTables.reduce((sum, t) => sum + t.headerCount, 0);
    findings.push(`All ${n} table(s) have header cells (TH) — ${totalTH} header cell(s) total`);
  } else if (withHeaders > 0) {
    score += 20;
    findings.push(
      `${withHeaders} of ${n} table(s) have header cells — ${n - withHeaders} table(s) are missing <TH> tags`,
    );
    for (const { t, i } of scored) {
      if (!t.hasHeaders) {
        findings.push(`  Table ${i + 1}: 0 <TH> found — all ${t.dataCellCount} cells are <TD>`);
      }
    }
    findings.push(
      "Fix: In Adobe Acrobat, open the Tags panel → expand each <Table> → find header rows → change <TD> to <TH>",
    );
  } else {
    findings.push(
      `${n} table(s) found but none have header cells — screen readers cannot identify column or row headers`,
    );
    for (const { t, i } of scored) {
      findings.push(`  Table ${i + 1}: ${t.dataCellCount} <TD> cells, 0 <TH> cells`);
    }
    findings.push(
      "Fix: In Adobe Acrobat, open the Tags panel → expand each <Table> → find the header row → change the cell tags from <TD> to <TH>",
    );
  }

  // 2. Row structure (20 points) — second most important structural requirement
  const withRows = dataTables.filter((t) => t.hasRowStructure).length;
  if (withRows === n) {
    score += 20;
    const totalRows = dataTables.reduce((sum, t) => sum + t.rowCount, 0);
    findings.push(`All ${n} table(s) have proper row structure — ${totalRows} <TR> row(s) total`);
  } else if (withRows > 0) {
    score += 10;
    for (const { t, i } of scored) {
      if (!t.hasRowStructure) {
        findings.push(
          `  Table ${i + 1}: missing <TR> row structure — cells are directly under <Table>`,
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

  // 3. Header association (10 points): /Scope, OR the explicit /Headers
  //    attribute — the two spec-legal ways to associate data cells with
  //    headers. A table using /Headers (the more robust method for complex
  //    tables) has COMPLETE association; missing Scope there is redundant
  //    and advisory only, matching how the conformance gate (and PAC)
  //    already treat Scope-or-Headers as equivalent.
  const associated = (t: TableAnalysis): boolean => t.hasScope || t.hasHeaderAssociation;
  // THE WCAG / PDF/UA LINE (2026-08-29, drawn where the standards draw it).
  //
  // WCAG 1.3.1 asks that the header-to-data relationship be *programmatically
  // determinable*. In a plain grid whose headers sit on ONE axis with nothing
  // spanned, a marked <TH> row already makes it determinable — /Scope adds
  // nothing a screen reader needs, and its absence is a PDF/UA readiness item,
  // not a legal failure. When headers run along BOTH axes, or cells span, the
  // association genuinely is NOT determinable without /Scope or /Headers, and
  // that IS a 1.3.1 failure.
  //
  // So a simple table counts as associated for SCORING, and its missing Scope
  // is reported as an unscored PDF/UA item. This is what lets an agency say
  // truthfully "this file meets WCAG and IITAA" while the report still asks
  // for Scope — the grade now reflects only the law, and the PDF/UA work is
  // shown beside it rather than folded into the number.
  const scoredAsAssociated = (t: TableAnalysis): boolean => associated(t) || t.simpleHeaderLayout;
  const withAssociation = dataTables.filter((t) => t.hasHeaders && scoredAsAssociated(t)).length;
  const tablesWithHeaders = dataTables.filter((t) => t.hasHeaders);
  // Simple tables that would have been penalised under the old rule — reported,
  // never scored.
  const pdfUaOnlyScope = tablesWithHeaders.filter(
    (t) => !associated(t) && t.simpleHeaderLayout && t.scopeMissingCount > 0,
  );
  if (tablesWithHeaders.length === 0) {
    findings.push("Scope attributes: N/A (no header cells to check)");
  } else if (withAssociation === tablesWithHeaders.length) {
    score += 10;
    const scopeOnly = tablesWithHeaders.every((t) => t.hasScope);
    findings.push(
      scopeOnly
        ? "All <TH> cells have Scope attributes (/Column, /Row, or /Both)"
        : "All tables associate data cells with headers (via /Scope or the explicit /Headers attribute)",
    );
    if (pdfUaOnlyScope.length > 0) {
      const cells = pdfUaOnlyScope.reduce((n, t) => n + t.scopeMissingCount, 0);
      findings.push(
        `PDF/UA only — not scored: ${cells} header cell(s) across ${pdfUaOnlyScope.length} table(s) have no /Scope. Each of those tables has its headers along a single edge with nothing spanned, so the header-to-data relationship is already determinable and WCAG 1.3.1 is satisfied — your grade is not affected. PDF/UA (ISO 14289) asks for /Scope regardless, so setting it is worth doing if you are aiming at PDF/UA conformance as well as the law.`,
      );
      findings.push(
        'How to fix (optional): In Adobe Acrobat, All tools → Prepare for accessibility → Fix reading order → select the table → Table Editor → right-click the header cells → Table Cell Properties → set Scope ("Column" for headers along the top, "Row" for headers down the side). In Word, tick Table Design → Header Row before exporting and Word writes them for you.',
      );
    }
    const headersOnly = tablesWithHeaders.filter((t) => !t.hasScope && t.hasHeaderAssociation);
    if (headersOnly.length > 0) {
      findings.push(
        `Advisory — not scored: ${headersOnly.length} table(s) rely on /Headers associations without /Scope on the <TH> cells. That is complete and spec-correct; adding Scope as well is belt-and-braces for viewers with partial /Headers support.`,
      );
    }
  } else {
    const totalMissing = dataTables.reduce(
      (sum, t) => (scoredAsAssociated(t) ? sum : sum + t.scopeMissingCount),
      0,
    );
    if (withAssociation > 0) score += 5;
    findings.push(
      `${totalMissing} <TH> cell(s) missing Scope attribute (with no /Headers association either) — and these tables need it: their headers run along more than one edge or contain spanned cells, so which header belongs to which cell cannot be worked out from the table's shape alone. That makes the relationship not programmatically determinable, which is a WCAG 1.3.1 failure, not only a PDF/UA one.`,
    );
    for (const { t, i } of scored) {
      if (t.headerCount > 0 && t.scopeMissingCount > 0 && !scoredAsAssociated(t)) {
        findings.push(
          `  Table ${i + 1}: ${t.scopeMissingCount} of ${t.headerCount} <TH> missing /Scope`,
        );
      }
    }
    findings.push(
      'Fix: which value to set is decided by where the header sits, not by preference. A header at the TOP of a column, labelling everything beneath it, is Scope = "Column". A header at the START of a row, labelling everything across it, is Scope = "Row". A table can need both kinds: in a grid with labels along the top AND down the left side, the top row is Column and the left-hand cells are Row. For the corner cell where the two meet — the one that labels its row and its column at once — the standard provides a third value, Scope = "Both"; an empty corner can simply stay a data cell.',
    );
    findings.push(
      'How to set it in Adobe Acrobat: All tools → Prepare for accessibility → Fix reading order (classic UI: Tools → Accessibility → Reading Order) → select the table → Table Editor → right-click the header cell(s) → Table Cell Properties → set Scope. In Word, you rarely need to do this by hand: select the table, then Table Design → check "Header Row" (and "First Column" if the left-hand cells are labels too), and re-export — Word writes the scopes for you.',
    );
    // The standards distinction (user request, 2026-08-27). Authors are told
    // by one expert that a file is "100% compliant" and by this report that
    // something is missing, and both can be true — they are measuring
    // against different rulebooks. Saying so is more useful than letting the
    // reader assume one of the two is simply wrong.
    findings.push(
      'Which rule does this break? Both, for these tables. PDF/UA — the PDF-specific standard — treats any header cell without Scope as a defect. WCAG asks only that the header-to-data relationship be determinable by software — but in a table with headers on more than one edge, or with spanned cells, it genuinely is not determinable without Scope or Headers. That is why these particular tables are scored: this is a WCAG 1.3.1 failure and not merely a PDF/UA readiness item. (Where a table\'s headers sit along a single edge with nothing spanned, this report says so and does NOT affect your grade — see any "PDF/UA only" note above.)',
    );
  }

  // 4. Nested tables (10 points, awarded UNCONDITIONALLY since the
  //    2026-08-29 audit). No WCAG 2.2 success criterion prohibits a nested
  //    table: one that is properly tagged has determinable relationships and
  //    satisfies 1.3.1. Nesting is harder to NAVIGATE, which is real and worth
  //    saying — but "harder to navigate" is not "not programmatically
  //    determinable", and the grade measures the law. Reported, not scored.
  score += 10;
  const withNesting = dataTables.filter((t) => t.hasNestedTable).length;
  if (withNesting === 0) {
    findings.push("No nested tables detected");
  } else {
    for (const { t, i } of scored) {
      if (t.hasNestedTable) {
        findings.push(
          `  Table ${i + 1}: contains nested <Table> — extremely difficult for screen readers to navigate`,
        );
      }
    }
    findings.push(
      "PDF/UA only — not scored: a nested table is not a WCAG failure — properly tagged, its relationships are still determinable — so this does not affect your grade. It is, however, genuinely hard to navigate by keyboard and by screen reader.",
    );
    findings.push(
      "How to fix (optional): Restructure nested tables into a single flat table, or split into separate independent tables",
    );
  }

  // 5. Caption (5 points) — a best-practice enhancement, NOT a WCAG 2.1/2.2
  // requirement (no success criterion mandates a table caption). Its absence
  // must not cap an otherwise-conformant table below 100, so the points are
  // awarded unconditionally; a missing caption is surfaced as an optional
  // recommendation only.
  score += 5;
  const withCaption = dataTables.filter((t) => t.hasCaption).length;
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
  const withConsistent = dataTables.filter((t) => t.hasConsistentColumns === true).length;
  const checkable = dataTables.filter((t) => t.hasConsistentColumns !== null).length;
  if (checkable === 0) {
    findings.push("Column consistency: could not be checked (no row structure)");
  } else if (withConsistent === checkable) {
    score += 10;
    findings.push("All tables have consistent column counts across rows");
  } else {
    for (const { t, i } of scored) {
      if (t.hasConsistentColumns === false) {
        const unique = [...new Set(t.columnCounts)];
        findings.push(
          `  Table ${i + 1}: inconsistent column counts — rows span [${t.columnCounts.join(", ")}] grid columns (expected uniform ${unique[0]}; ColSpan/RowSpan are already accounted for)`,
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
  const withExplicitHeaders = dataTables.filter((t) => t.hasHeaderAssociation).length;
  // A third technique counts here too, and it is the one the standards leave
  // implicit: a plain single-axis grid associates its headers BY SHAPE. There
  // is only one direction a marked header row can refer to, so the
  // relationship is programmatically determinable without /Scope or /Headers —
  // which is precisely what SC 1.3.1 asks for. (PDF/UA still wants /Scope; that
  // is reported above as an unscored PDF/UA item.)
  const withAssoc = dataTables.filter(
    (t) => t.hasHeaderAssociation || t.hasScope || t.simpleHeaderLayout,
  ).length;
  if (withAssoc > 0) {
    score += 5;
    if (withExplicitHeaders > 0) {
      findings.push(
        `${withExplicitHeaders} table(s) use explicit header-cell associations (/Headers attribute)`,
      );
    } else if (dataTables.some((t) => t.hasScope)) {
      findings.push("Header cells are programmatically associated with data cells via /Scope");
    } else {
      findings.push(
        "Header cells are programmatically associated with data cells by the table's shape: the headers run along a single edge with nothing spanned, so there is only one relationship they can express.",
      );
    }
  }

  if (withHeaders === 0 && withRows === n) {
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
// Classify visible link text for WCAG 2.4.4 (Link Purpose).
//   - "rawUrl"      — the visible text is the URL itself. The destination is
//                     determinable, so 2.4.4 is met (and PAC does not flag it).
//                     Surfaced as a best-practice advisory, NOT penalized.
//   - "needsFix"    — empty, a vague phrase ("click here"), or 1–2 chars. The
//                     purpose is not conveyed; this is penalized.
//   - "descriptive" — self-describing text.
// The classifier itself lives in scoring/common.ts (imported at the top of
// this file) so docx/pptx/xlsx apply the identical doctrine.

// "(page N)" after a link's text, when the analysis recorded the page.
function linkPageSuffix(link: { page?: number }): string {
  return typeof link.page === "number" ? ` (page ${link.page})` : "";
}

function scoreLinkQuality(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
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
      findings: ["No links found in this document — this category does not affect the score"],
      explanation: linkExplanation,
      helpLinks: linkLinks,
    };
  }

  const total = pdfjs.links.length;

  // An untagged link — an annotation no <Link> element claims — is a defect
  // in its own right: a screen reader following the tags never meets it.
  // Its text is only geometry (whatever sat under the rectangle), so it is
  // NOT judged on wording; it fails for the tagging reason alone. Meaningful
  // only in a tagged document (an untagged document's links are all
  // "untagged" and already carry the document-level 1.3.1 failure), and only
  // when the analysis recorded the flag (stored reports from before the
  // census classify every link on its text, exactly as they always did).
  const taggingKnown = qpdf.hasStructTree && pdfjs.links.some((l) => typeof l.tagged === "boolean");
  const untagged = taggingKnown ? pdfjs.links.filter((l) => l.tagged === false) : [];
  const assessable = taggingKnown ? pdfjs.links.filter((l) => l.tagged !== false) : pdfjs.links;

  const classified = assessable.map((link) => ({
    link,
    cls: classifyLinkText(link.text),
  }));
  const needsFix = classified.filter((c) => c.cls === "needsFix");
  const rawUrls = classified.filter((c) => c.cls === "rawUrl");
  const descriptive = classified.filter((c) => c.cls === "descriptive");

  // Only UNTAGGED links are penalized (2026-08-29, the legal-only sweep) —
  // that failure is mechanical and 1.3.1-certain: the annotation exists and
  // no <Link> element claims it. Vague link TEXT ("click here") is NOT
  // scored: WCAG 2.4.4 (Level A) explicitly allows the link's purpose to
  // come from its programmatically determined context — the sentence around
  // it — which no automated text-only check can weigh. Judging the text
  // alone is 2.4.9 Link Purpose (Link Only), a AAA criterion. A visible raw
  // URL likewise satisfies 2.4.4 and stays advisory.
  const failing = untagged.length;
  const score = Math.floor(((total - failing) / total) * 100);
  const findings: string[] = [];

  if (failing === 0 && rawUrls.length === 0 && needsFix.length === 0) {
    findings.push(`All ${total} link(s) use descriptive text`);
    findings.push(`--- Link Details ---`);
    for (const { link } of classified.slice(0, 20)) {
      findings.push(`  "${link.text.trim()}"${linkPageSuffix(link)} → ${link.url}`);
    }
    if (total > 20) {
      findings.push(`  ... and ${total - 20} more link(s)`);
    }
  } else {
    if (needsFix.length > 0) {
      findings.push(
        `Advisory — not scored: ${needsFix.length} of ${total} link(s) use non-descriptive text — empty, a vague phrase such as "click here" / "read more", or too short to mean anything on its own. WCAG 2.4.4 (Level A) allows a link's purpose to come from the sentence around it, which no automated check can weigh — judging the text alone is a AAA rule (2.4.9) — so your grade is not affected. Descriptive link text is still kinder to screen-reader users, who often pull up links as a bare list.`,
      );
      findings.push(`--- Links With Non-Descriptive Text ---`);
      for (const { link } of needsFix.slice(0, 15)) {
        const t = link.text.trim();
        const why =
          t.length === 0
            ? "empty link text"
            : t.replace(/[^a-z0-9]/gi, "").length <= 2
              ? "too short to describe a destination"
              : "vague phrase";
        findings.push(`  "${t}"${linkPageSuffix(link)} — ${why} → ${link.url}`);
      }
      if (needsFix.length > 15) {
        findings.push(`  ... and ${needsFix.length - 15} more`);
      }
    }
    if (untagged.length > 0) {
      const census = pdfjs.untaggedLinkAnnotationCount ?? untagged.length;
      const internalNote =
        census > untagged.length
          ? ` (${census} untagged link annotation(s) in all, counting links to other pages of this document.)`
          : "";
      findings.push(
        `${untagged.length} of ${total} link(s) are not tagged — the link exists on the page, but no <Link> tag wraps it in the structure tree, so a screen reader following the tags never encounters it, and with the tab order set to follow the structure it cannot be tabbed to either.${internalNote}`,
      );
      findings.push(`--- Links Not Tagged ---`);
      for (const link of untagged.slice(0, 10)) {
        findings.push(`  "${link.text.trim()}"${linkPageSuffix(link)} → ${link.url}`);
      }
      if (untagged.length > 10) {
        findings.push(`  ... and ${untagged.length - 10} more`);
      }
      findings.push(
        "The text shown for an untagged link is read from the page around it and may include neighbouring words.",
      );
      findings.push(
        'How to fix (optional): In Word, links inside text boxes, shapes, and SmartArt are exported without tags — move that content into the main text flow (or a table) and re-export. In Acrobat: open the Tags panel → Options menu (⋮) → Find → choose "Unmarked Links" → Find → Tag Element, which wraps the link in a <Link> tag; repeat until no unmarked links remain, then confirm each link\'s text sits inside its <Link> tag.',
      );
    }
    if (rawUrls.length > 0) {
      findings.push(`--- Raw URL Link Text (advisory — not penalized) ---`);
      findings.push(
        `${rawUrls.length} link(s) use the raw URL as their visible text. This satisfies WCAG 2.4.4 (the destination is determinable) and is not scored against you, but a descriptive label reads better in a screen reader's list of links.`,
      );
      for (const { link } of rawUrls.slice(0, 10)) {
        findings.push(`  "${link.text.trim()}"${linkPageSuffix(link)} → ${link.url}`);
      }
      if (rawUrls.length > 10) {
        findings.push(`  ... and ${rawUrls.length - 10} more`);
      }
    }
    if (descriptive.length > 0) {
      findings.push(`--- Links With Descriptive Text ---`);
      for (const { link } of descriptive.slice(0, 10)) {
        findings.push(`  "${link.text.trim()}"${linkPageSuffix(link)} → ${link.url}`);
      }
      if (descriptive.length > 10) {
        findings.push(`  ... and ${descriptive.length - 10} more descriptive link(s)`);
      }
    }
    if (needsFix.length > 0) {
      findings.push(
        "Note: WCAG 2.4.4 is judged in context — a vague phrase can be acceptable when the surrounding sentence makes the destination clear. Review the flagged links in place; where possible, give them self-describing text.",
      );
      findings.push(
        "How to fix: In the original document (Word, InDesign, etc.), change the visible link text to something descriptive before re-exporting to PDF. In Adobe Acrobat, you can edit the text via the Edit tool (All tools → Edit a PDF; classic UI: Tools → Edit PDF).",
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

function scoreFormAccessibility(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
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
      findings: ["No form fields found in this document — this category does not affect the score"],
      explanation: formExplanation,
      helpLinks: formLinks,
    };
  }

  const withLabels = qpdf.formFields.filter((f) => f.hasTU).length;
  let score = Math.floor((withLabels / qpdf.formFields.length) * 100);
  const findings: string[] = [];

  findings.push(`${qpdf.formFields.length} form field(s) detected`);

  // Untagged widgets (v1.94.0 — Matterhorn 28, the untagged-link mechanics
  // applied to form fields): a visible widget no structure element references
  // via OBJR is invisible to a screen reader following the tags, whatever its
  // /TU says. Only meaningful in a tagged document with real content, and
  // only when the census exists (fresh analyses; stored pre-census reports
  // keep their TU-only score).
  const untaggedWidgets = qpdf.untaggedWidgetAnnotationCount;
  const widgetCensusKnown =
    typeof untaggedWidgets === "number" &&
    qpdf.hasStructTree &&
    !structTreeIsContentFree(qpdf, pdfjs);
  if (widgetCensusKnown && untaggedWidgets! > 0) {
    const totalWidgets = Math.max(qpdf.widgetAnnotationCount ?? untaggedWidgets!, untaggedWidgets!);
    // Proportional, exactly like the untagged-LINKS treatment of the same
    // defect (RB-review near-miss): one untagged widget among 26 dents the
    // score; an all-untagged form drives it to 0.
    score = Math.min(score, Math.floor(((totalWidgets - untaggedWidgets!) / totalWidgets) * 100));
    findings.push(
      `${untaggedWidgets} of ${totalWidgets} visible form-field widget(s) are not referenced from the tag structure — no structure element points at them (no OBJR), so a screen reader following the tags never reaches those fields, whatever their tooltips say.`,
    );
    findings.push(
      'How to fix: In Adobe Acrobat, open the Tags panel → Options menu (⋮) → Find → choose "Unmarked Annotations" → Find → Tag Element, so each field is wrapped in a <Form> tag at its reading position; then re-check the tab order.',
    );
  }

  if (qpdf.hasXfa && !qpdf.needsRendering) {
    findings.push(
      "Advisory — not scored: this is a static XFA form. The conventional PDF content audited here is exactly what viewers display, but the embedded XFA template layer itself was not separately audited.",
    );
  }

  if (withLabels === qpdf.formFields.length) {
    findings.push(`All fields have accessible tooltip labels (TU)`);
    findings.push(`--- Form Field Details ---`);
    for (const field of qpdf.formFields.slice(0, 20)) {
      findings.push(`  ${field.name ? `"${field.name}"` : "(unnamed)"} — has /TU label ✓`);
    }
    if (qpdf.formFields.length > 20) {
      findings.push(`  ... and ${qpdf.formFields.length - 20} more field(s)`);
    }
  } else {
    findings.push(`${withLabels} of ${qpdf.formFields.length} field(s) have accessible labels`);
    findings.push(`--- Unlabeled Form Fields ---`);
    const unlabeled = qpdf.formFields.filter((f) => !f.hasTU);
    for (const field of unlabeled.slice(0, 20)) {
      findings.push(
        `  ${field.name ? `"${field.name}"` : "(unnamed)"} — missing /TU tooltip label`,
      );
    }
    if (unlabeled.length > 20) {
      findings.push(`  ... and ${unlabeled.length - 20} more unlabeled field(s)`);
    }
    if (withLabels > 0) {
      findings.push(`--- Labeled Form Fields ---`);
      const labeled = qpdf.formFields.filter((f) => f.hasTU);
      for (const field of labeled.slice(0, 10)) {
        findings.push(`  ${field.name ? `"${field.name}"` : "(unnamed)"} — has /TU label ✓`);
      }
      if (labeled.length > 10) {
        findings.push(`  ... and ${labeled.length - 10} more labeled field(s)`);
      }
    }
    findings.push(
      "How to fix: In Adobe Acrobat, open All tools → Prepare a form (classic UI: Tools → Prepare Form), then right-click each field → Properties → General tab → enter a descriptive Tooltip. The tooltip becomes the accessible label that screen readers announce.",
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

function scoreReadingOrder(qpdf: QpdfResult, pdfjs: PdfjsResult): CategoryResult {
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
        "How to fix: First add tags (All tools → Prepare for accessibility → Automatically tag PDF), then use Fix reading order (classic UI: Tools → Accessibility → Reading Order) to verify and correct the sequence.",
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
    // NOT SCORED (2026-08-29, the legal-only sweep): a flat tree still IS a
    // programmatic reading sequence — every item in order under one parent —
    // so 1.3.2 is satisfiable and nothing here is a confirmed WCAG failure.
    // Depth is a quality signal, reported, never counted.
    findings.push(
      "Advisory — not scored: the structure tree is flat (no meaningful nesting) — the document has tags in a single sequence rather than a nested hierarchy of sections. That sequence still gives assistive technology a reading order, so your grade is not affected, but nesting makes long documents far easier to navigate.",
    );
    findings.push(
      "How to fix (optional): Use Acrobat's Fix reading order tool (All tools → Prepare for accessibility → Fix reading order; classic UI: Tools → Accessibility → Reading Order) to reorganize the tag structure into proper sections, headings, and content blocks.",
    );
    return {
      id: "reading_order",
      label: "Reading Order",
      weight: SCORING_WEIGHTS.reading_order,
      score: 100,
      grade: "A",
      severity: "No issues found",
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

  // Rigorous verdict when we have enough data.
  if (rigorous.score !== null) {
    findings.push(
      `Reading-order fidelity: ${rigorous.similarityPct}% (${rigorous.pagesAnalyzed} of ${qpdf.totalPageCount} page(s) compared)`,
    );
    findings.push(
      `Compared the structure-tree MCID sequence (logical tag order) against the content-stream MCID sequence (DRAW order — the order content is painted, which is not necessarily the visual reading order) on every page that had both. Higher = the two orders agree; a divergence means they disagree, not that the tags are wrong. Image (Figure) runs are excluded from the comparison — exporters paint images by z-order (typically last), which says nothing about reading order.`,
    );
    if (rigorous.pagesWithDrift > 0) {
      // Name the pages: a count alone gives an author nothing to open.
      const shown = rigorous.driftPages
        .slice(0, 12)
        .map((d) => `page ${d.page} (${d.similarityPct}%)`);
      const more = rigorous.driftPages.length - shown.length;
      findings.push(
        `${rigorous.pagesWithDrift} page(s) had noticeable drift (< 80% match): ${shown.join(", ")}${more > 0 ? `, and ${more} more` : ""}. Open these in Adobe Acrobat's Reading Order or Order panels to review the tag sequence.`,
      );
    }
    // FORMS ARE NOT SCORED ON THIS METRIC (v1.107.0). Draw order and reading
    // order are structurally unrelated in a form: field captions and widgets
    // are painted in a later pass, so a CORRECTLY tagged form — one whose
    // tags sit in logical reading position rather than paint position —
    // scores worst. The DoIT XFA example is the case that proved it: its
    // whole deduction came from four /Caption elements reading "Order Date:",
    // "City:", "State:", "ZIP:", tagged exactly where a reader meets them and
    // painted last. Its author was right to dispute the grade.
    //
    // The old behaviour also contradicted itself — the card said "divergence
    // is not automatically wrong" and then deducted 35 points for it. Where
    // the measurement cannot support a verdict, report it and say so rather
    // than scoring it. Per the scoring model an unassessed category counts as
    // passing, so a well-built form is no longer punished for being a form.
    const formFieldCount = qpdf.hasAcroForm ? qpdf.formFields.length : 0;
    if (formFieldCount > 0) {
      findings.push(
        `Not scored for this document: it is a form (${formFieldCount} field(s)). In a form the two orders are expected to disagree — field captions and widgets are painted in a later pass, so a correctly tagged form, whose tags sit in logical reading position rather than paint position, would score worst. Measuring it here would punish the right answer.`,
      );
      findings.push(
        "How to check reading order in a form: tab through it with the keyboard and confirm focus moves in the order a person would fill it in, then read it with a screen reader. Acrobat's Order panel shows the tagged sequence.",
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
    if (rigorous.score < 100) {
      // NOT SCORED (2026-08-29, the legal-only sweep — completing the
      // v1.107.0 form doctrine for every document): the comparison proves
      // the tag order and the DRAW order disagree, not which side is wrong.
      // Professional remediation re-orders tags away from a bad draw order
      // on purpose, and the card's own copy has always admitted "divergence
      // is not automatically wrong" — so the measurement cannot support a
      // deduction. Reported for manual review, never counted.
      findings.push(
        `Advisory — not scored: the tagged order agreed with the content stream's draw order on ${rigorous.similarityPct}% of comparable content. Divergence is not automatically wrong — remediated documents re-order tags away from a bad draw order on purpose — so this cannot be scored automatically and your grade is not affected. Verify with a screen reader or Acrobat's Order panel which side reflects the true reading sequence.`,
      );
    }
    return {
      id: "reading_order",
      label: "Reading Order",
      weight: SCORING_WEIGHTS.reading_order,
      score: 100,
      grade: "A",
      severity: "No issues found",
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
