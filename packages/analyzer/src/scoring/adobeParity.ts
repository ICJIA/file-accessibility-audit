/**
 * Adobe Acrobat parity report.
 *
 * Adobe's built-in Accessibility Checker runs 32 rules, mostly binary
 * "if this content exists, is it well-formed?" checks. It almost never
 * asserts that a *type* of content must exist — so on documents with
 * sparse structure, most rules pass vacuously.
 *
 * This service maps the 32 rules onto our existing QPDF/pdfjs signals,
 * so the UI can surface Acrobat's view side-by-side with ours, with
 * "vacuous pass" annotations where Acrobat's pass is misleading.
 *
 * We do NOT expose an aggregated "Adobe score" — users anchor on the
 * higher number and the framing collapses. Adobe parity is qualitative.
 */

import type { QpdfResult } from "../qpdfService.js";
import type { PdfjsResult } from "../pdfjsService.js";
import { splitNonEmbeddedFonts } from "./common.js";

export type AdobeStatus = "passed" | "failed" | "manual" | "skipped" | "not_computed";

export type AdobeCategory =
  "Document" | "Page Content" | "Forms" | "Alternate Text" | "Tables" | "Lists" | "Headings";

export interface AdobeRuleResult {
  id: string;
  category: AdobeCategory;
  name: string;
  description: string;
  status: AdobeStatus;
  vacuous: boolean;
  note: string;
}

export interface AdobeParitySummary {
  passed: number;
  failed: number;
  manual: number;
  skipped: number;
  notComputed: number;
  vacuousPasses: number;
  total: number;
}

export interface AdobeParityResult {
  summary: AdobeParitySummary;
  rules: AdobeRuleResult[];
}

function rule(
  id: string,
  category: AdobeCategory,
  name: string,
  description: string,
  status: AdobeStatus,
  vacuous: boolean,
  note: string,
): AdobeRuleResult {
  return { id, category, name, description, status, vacuous, note };
}

export function buildAdobeParityReport(qpdf: QpdfResult, pdfjs: PdfjsResult): AdobeParityResult {
  const rules: AdobeRuleResult[] = [];

  const figureCount = qpdf.images.length;
  const tableCount = qpdf.tables.length;
  const listCount = qpdf.lists.length;
  const formFieldCount = qpdf.formFields.length;
  const headingCount = qpdf.headings.length;
  const paintedImageCount = pdfjs.imageCount;

  // ──────────────────────────────────────────────────────────────────
  // Document (8 rules)
  // ──────────────────────────────────────────────────────────────────

  // The permission flag is read directly from qpdf's security-handler
  // capabilities, so encrypted-but-accessible documents (all AES-256/R6
  // files, and legacy files with the flag on) pass instead of being blanket-
  // failed for merely being encrypted.
  const encrypted = qpdf.isEncrypted || pdfjs.metadata.isEncrypted;
  const accessibilityDenied = qpdf.accessibilityAllowed === false;
  rules.push(
    rule(
      "accessibility_permission_flag",
      "Document",
      "Accessibility permission flag",
      "Accessibility permission flag must be set",
      accessibilityDenied ? "failed" : "passed",
      false,
      accessibilityDenied
        ? "The security handler denies assistive-technology access (accessibility permission flag off) — screen readers cannot read this document."
        : encrypted
          ? "Document is encrypted, but its security settings explicitly permit assistive-technology access."
          : "Document is not encrypted; assistive tech can read content.",
    ),
  );

  const imageOnly = !pdfjs.hasText && !qpdf.hasStructTree;
  rules.push(
    rule(
      "image_only_pdf",
      "Document",
      "Image-only PDF",
      "Document is not image-only PDF",
      imageOnly ? "failed" : "passed",
      false,
      imageOnly
        ? "No extractable text and no structure tree — document appears image-only."
        : `Document has ${pdfjs.textLength.toLocaleString()} characters of extractable text.`,
    ),
  );

  const taggedVacuous = qpdf.hasStructTree && qpdf.structTreeDepth === 0;
  rules.push(
    rule(
      "tagged_pdf",
      "Document",
      "Tagged PDF",
      "Document is tagged PDF",
      qpdf.hasStructTree ? "passed" : "failed",
      taggedVacuous,
      qpdf.hasStructTree
        ? taggedVacuous
          ? "StructTreeRoot exists, but structTreeDepth=0 — the tag tree is flat/empty. Acrobat's rule only checks presence of the root object."
          : `StructTreeRoot present, depth=${qpdf.structTreeDepth}, ${qpdf.paragraphCount} <P> tag(s), ${headingCount} heading(s).`
        : "No StructTreeRoot found in the document catalog.",
    ),
  );

  rules.push(
    rule(
      "logical_reading_order",
      "Document",
      "Logical Reading Order",
      "Document structure provides a logical reading order",
      "manual",
      false,
      qpdf.structTreeDepth === 0
        ? "Acrobat always marks this as manual. Note: structure tree is empty here — there is nothing to verify."
        : `Acrobat always marks this as manual. This tool computed reading-order fidelity separately; see the Reading Order category.`,
    ),
  );

  rules.push(
    rule(
      "primary_language",
      "Document",
      "Primary language",
      "Text language is specified",
      qpdf.hasLang ? "passed" : "failed",
      false,
      qpdf.hasLang ? `Language declared: ${qpdf.lang}` : "No /Lang entry in the document catalog.",
    ),
  );

  // Title: Adobe's rule passes only when the title is SHOWN in the title
  // bar — i.e. an /Info (or XMP) title exists AND ViewerPreferences/
  // DisplayDocTitle is true. Both signals are parsed now.
  const hasInfoTitle = !!(pdfjs.title && pdfjs.title.trim().length > 0);
  const titleShown = hasInfoTitle && qpdf.displayDocTitle === true;
  rules.push(
    rule(
      "title",
      "Document",
      "Title",
      "Document title is showing in title bar",
      titleShown ? "passed" : "failed",
      false,
      titleShown
        ? `Title metadata present and DisplayDocTitle is set: "${pdfjs.title}"`
        : hasInfoTitle
          ? `Title metadata present ("${pdfjs.title}") but ViewerPreferences/DisplayDocTitle is not set — viewers show the filename in the title bar. Fix in Acrobat: File → Properties → Initial View → Show: Document Title.`
          : "No /Info/Title string found — screen readers announce the filename instead.",
    ),
  );

  // Bookmarks: Acrobat's rule triggers only for documents of 21+ pages.
  const ADOBE_BOOKMARK_THRESHOLD = 21;
  const needsBookmarks = qpdf.totalPageCount >= ADOBE_BOOKMARK_THRESHOLD;
  rules.push(
    rule(
      "bookmarks",
      "Document",
      "Bookmarks",
      "Bookmarks are present in large documents",
      !needsBookmarks || qpdf.hasOutlines ? "passed" : "failed",
      !needsBookmarks,
      !needsBookmarks
        ? `Document has ${qpdf.totalPageCount} page(s) — Acrobat only requires bookmarks on documents of ${ADOBE_BOOKMARK_THRESHOLD}+ pages.`
        : qpdf.hasOutlines
          ? `${qpdf.outlineCount} bookmark(s) found.`
          : `Document has ${qpdf.totalPageCount} pages but no bookmarks.`,
    ),
  );

  rules.push(
    rule(
      "color_contrast",
      "Document",
      "Color contrast",
      "Document has appropriate color contrast",
      "manual",
      false,
      "Acrobat always marks this as manual. No checker (including this one) performs rendered-contrast analysis on PDF content today.",
    ),
  );

  // ──────────────────────────────────────────────────────────────────
  // Page Content (9 rules)
  // ──────────────────────────────────────────────────────────────────

  // Tagged content: Acrobat passes when MarkInfo/Marked is true, regardless
  // of whether the tree actually contains any tags.
  const taggedContentVacuous =
    qpdf.isMarkedContent && qpdf.paragraphCount === 0 && headingCount === 0;
  rules.push(
    rule(
      "tagged_content",
      "Page Content",
      "Tagged content",
      "All page content is tagged",
      qpdf.isMarkedContent ? "passed" : "failed",
      taggedContentVacuous,
      qpdf.isMarkedContent
        ? taggedContentVacuous
          ? "MarkInfo/Marked=true, but 0 <P> tags and 0 headings — Acrobat's pass is based on the flag, not on whether content is actually tagged."
          : `MarkInfo/Marked=true. ${qpdf.paragraphCount} <P> tag(s) found.`
        : "MarkInfo/Marked is not true — Acrobat treats page content as untagged.",
    ),
  );

  // Tagged annotations. v1.94.0: computed from THREE censuses — pdfjs's link
  // census plus qpdf's widget and other-annotation censuses — so the rule
  // now covers what Acrobat's does (links, comments/markup, form widgets).
  // Reports predating any census fall back to the older narrower wording.
  const linkAnnots = pdfjs.linkAnnotationCount;
  const untaggedLinkAnnots = pdfjs.untaggedLinkAnnotationCount;
  const fullAnnotCensus =
    typeof qpdf.widgetAnnotationCount === "number" && typeof qpdf.otherAnnotationCount === "number";
  const linkScope = "(Only link annotations are checked; comments and form widgets are not.)";
  if (typeof linkAnnots !== "number" || typeof untaggedLinkAnnots !== "number") {
    rules.push(
      rule(
        "tagged_annotations",
        "Page Content",
        "Tagged annotations",
        "All annotations are tagged",
        "not_computed",
        false,
        "This report predates the link-tagging census, so whether every annotation is wrapped in a structural tag was not verified. Compare with Acrobat's Accessibility Checker for this rule specifically.",
      ),
    );
  } else if (fullAnnotCensus) {
    const totalAnnots =
      linkAnnots + (qpdf.widgetAnnotationCount ?? 0) + (qpdf.otherAnnotationCount ?? 0);
    const untaggedTotal =
      untaggedLinkAnnots +
      (qpdf.untaggedWidgetAnnotationCount ?? 0) +
      (qpdf.untaggedOtherAnnotationCount ?? 0);
    const breakdown = `${linkAnnots} link(s), ${qpdf.widgetAnnotationCount} form widget(s), ${qpdf.otherAnnotationCount} other annotation(s)`;
    if (totalAnnots === 0) {
      rules.push(
        rule(
          "tagged_annotations",
          "Page Content",
          "Tagged annotations",
          "All annotations are tagged",
          "passed",
          true,
          "No visible annotations in the document — the rule passes vacuously.",
        ),
      );
    } else if (!qpdf.hasStructTree) {
      rules.push(
        rule(
          "tagged_annotations",
          "Page Content",
          "Tagged annotations",
          "All annotations are tagged",
          "failed",
          false,
          `The document has no structure tree, so none of its ${totalAnnots} visible annotation(s) (${breakdown}) can have a structural parent.`,
        ),
      );
    } else {
      rules.push(
        rule(
          "tagged_annotations",
          "Page Content",
          "Tagged annotations",
          "All annotations are tagged",
          untaggedTotal === 0 ? "passed" : "failed",
          false,
          untaggedTotal === 0
            ? `All ${totalAnnots} visible annotation(s) (${breakdown}) are referenced from the structure tree.`
            : `${untaggedTotal} of ${totalAnnots} visible annotation(s) are not referenced from the structure tree (${untaggedLinkAnnots} link(s), ${qpdf.untaggedWidgetAnnotationCount ?? 0} form widget(s), ${qpdf.untaggedOtherAnnotationCount ?? 0} other).`,
        ),
      );
    }
  } else if (linkAnnots === 0) {
    rules.push(
      rule(
        "tagged_annotations",
        "Page Content",
        "Tagged annotations",
        "All annotations are tagged",
        "passed",
        true,
        `No link annotations in the document — the rule passes vacuously. ${linkScope}`,
      ),
    );
  } else if (!qpdf.hasStructTree) {
    rules.push(
      rule(
        "tagged_annotations",
        "Page Content",
        "Tagged annotations",
        "All annotations are tagged",
        "failed",
        false,
        `The document has no structure tree, so none of its ${linkAnnots} link annotation(s) can have a structural parent. ${linkScope}`,
      ),
    );
  } else {
    rules.push(
      rule(
        "tagged_annotations",
        "Page Content",
        "Tagged annotations",
        "All annotations are tagged",
        untaggedLinkAnnots === 0 ? "passed" : "failed",
        false,
        untaggedLinkAnnots === 0
          ? `All ${linkAnnots} link annotation(s) are wrapped in a <Link> tag. ${linkScope}`
          : `${untaggedLinkAnnots} of ${linkAnnots} link annotation(s) have no <Link> tag in the structure tree. ${linkScope}`,
      ),
    );
  }

  rules.push(
    rule(
      "tab_order",
      "Page Content",
      "Tab order",
      "Tab order is consistent with structure order",
      qpdf.tabOrderPages >= qpdf.totalPageCount ? "passed" : "failed",
      false,
      qpdf.tabOrderPages >= qpdf.totalPageCount
        ? `Tab order set on all ${qpdf.totalPageCount} page(s).`
        : `Tab order set on only ${qpdf.tabOrderPages} of ${qpdf.totalPageCount} page(s).`,
    ),
  );

  // Character encoding: approximate via font embedding — non-embedded fonts
  // often mean unreliable encoding when rendered on systems lacking them.
  // Non-embedded fonts that never paint visible text (whitespace-only runs,
  // invisible OCR layers) are exempt, matching Acrobat's evaluation of fonts
  // actually used for rendering (see splitNonEmbeddedFonts).
  const { flagged: encodingRisks, exempt: whitespaceOnlyFonts } = splitNonEmbeddedFonts(
    qpdf.fonts,
    pdfjs.visibleTextFontNames,
  );
  const allRenderingFontsEmbedded = encodingRisks.length === 0;
  rules.push(
    rule(
      "character_encoding",
      "Page Content",
      "Character encoding",
      "Reliable character encoding is provided",
      allRenderingFontsEmbedded ? "passed" : "not_computed",
      qpdf.fonts.length === 0,
      qpdf.fonts.length === 0
        ? "No font entries found."
        : allRenderingFontsEmbedded
          ? whitespaceOnlyFonts.length === 0
            ? `All ${qpdf.fonts.length} font(s) are embedded.`
            : `All fonts that display visible text are embedded (${whitespaceOnlyFonts.length} non-embedded font(s) are used only for whitespace and cannot affect encoding).`
          : `${encodingRisks.length} of ${qpdf.fonts.length} font(s) are not embedded. Acrobat may still pass this rule — it checks ToUnicode/CMap presence directly, which this tool approximates via embedding.`,
    ),
  );

  // Multimedia / flicker / scripts (v1.92.0): measured from the qpdfService
  // presence censuses instead of "vacuous pass assumed". Absence is now a
  // REAL pass; presence is not_computed (accessibility of media and scripts
  // is a human judgment — presence alone must never fail the rule). The
  // censuses are always present on fresh parser output; the `known` guards
  // only defend against a hand-built fixture omitting them.
  const mediaCounts = qpdf.mediaAnnotationCounts;
  const mediaKnown = !!mediaCounts;
  const mediaTotal = mediaCounts
    ? mediaCounts.screen + mediaCounts.movie + mediaCounts.sound + mediaCounts.richMedia
    : 0;
  const jsKnown = typeof qpdf.jsActionCount === "number";
  const jsSignals = (qpdf.jsActionCount ?? 0) + (qpdf.hasJsNameTree ? 1 : 0);

  rules.push(
    rule(
      "tagged_multimedia",
      "Page Content",
      "Tagged multimedia",
      "All multimedia objects are tagged",
      !mediaKnown || mediaTotal === 0 ? "passed" : "not_computed",
      !mediaKnown,
      !mediaKnown
        ? "Acrobat's rule passes vacuously on PDFs without multimedia objects. This report predates the multimedia census; if media is present, review manually."
        : mediaTotal === 0
          ? "No multimedia annotations (Screen, Movie, Sound, RichMedia) were found — measured, not assumed."
          : `${mediaTotal} multimedia annotation(s) present. Whether each is tagged with an accessible alternative requires manual review.`,
    ),
  );

  rules.push(
    rule(
      "screen_flicker",
      "Page Content",
      "Screen flicker",
      "Page will not cause screen flicker",
      !mediaKnown || !jsKnown || (mediaTotal === 0 && jsSignals === 0) ? "passed" : "not_computed",
      !mediaKnown || !jsKnown,
      !mediaKnown || !jsKnown
        ? "Acrobat's rule flags animations and flashing content. This report predates the media/script censuses; vacuous pass assumed."
        : mediaTotal === 0 && jsSignals === 0
          ? "No multimedia annotations and no JavaScript were found — static page content has no flicker carrier."
          : "Multimedia or JavaScript is present; whether anything flashes or flickers requires manual review.",
    ),
  );

  rules.push(
    rule(
      "scripts",
      "Page Content",
      "Scripts",
      "No inaccessible scripts",
      !jsKnown || jsSignals === 0 ? "passed" : "not_computed",
      !jsKnown,
      !jsKnown
        ? "Acrobat's rule checks for inaccessible JavaScript. This report predates the script census; vacuous pass assumed."
        : jsSignals === 0
          ? "No JavaScript actions or document-level scripts were found — measured, not assumed."
          : `JavaScript is present (${qpdf.jsActionCount ?? 0} action(s)${qpdf.hasJsNameTree ? " + a document-level script tree" : ""}). Whether the scripts are accessible requires manual review.`,
    ),
  );

  rules.push(
    rule(
      "timed_responses",
      "Page Content",
      "Timed responses",
      "Page does not require timed responses",
      "passed",
      true,
      "Acrobat's rule checks for auto-timeout behavior. This tool does not detect these; vacuous pass assumed.",
    ),
  );

  // Navigation links: Acrobat's rule flags repetitive consecutive links
  // with the same destination. Approximate via pdfjs.links.
  const linkCount = pdfjs.links.length;
  let repetitiveNav = false;
  if (linkCount >= 2) {
    let consecutiveDupes = 0;
    for (let i = 1; i < pdfjs.links.length; i++) {
      if (pdfjs.links[i].url === pdfjs.links[i - 1].url) {
        consecutiveDupes++;
        if (consecutiveDupes >= 2) {
          repetitiveNav = true;
          break;
        }
      } else {
        consecutiveDupes = 0;
      }
    }
  }
  rules.push(
    rule(
      "navigation_links",
      "Page Content",
      "Navigation links",
      "Navigation links are not repetitive",
      repetitiveNav ? "failed" : "passed",
      linkCount === 0,
      linkCount === 0
        ? "No links detected — rule passes vacuously."
        : repetitiveNav
          ? `Detected runs of consecutive links with identical destinations — may confuse screen reader navigation.`
          : `${linkCount} link(s) detected, no repetitive navigation patterns.`,
    ),
  );

  // ──────────────────────────────────────────────────────────────────
  // Forms (2 rules)
  // ──────────────────────────────────────────────────────────────────

  const formFieldsVacuous = formFieldCount === 0;
  const untaggedForm = qpdf.formFields.filter((f) => !f.hasTU).length;
  // v1.94.0: the widget census makes this rule COMPUTABLE — a widget is
  // "tagged" when a structure element references it via OBJR. Reports
  // predating the census keep the honest not_computed.
  const widgetCensusKnown = typeof qpdf.untaggedWidgetAnnotationCount === "number";
  rules.push(
    rule(
      "tagged_form_fields",
      "Forms",
      "Tagged form fields",
      "All form fields are tagged",
      formFieldsVacuous
        ? "passed"
        : !widgetCensusKnown
          ? "not_computed"
          : (qpdf.untaggedWidgetAnnotationCount ?? 0) === 0
            ? "passed"
            : "failed",
      formFieldsVacuous,
      formFieldsVacuous
        ? "No form fields found — rule passes vacuously."
        : !widgetCensusKnown
          ? `${formFieldCount} form field(s) detected. This report predates the widget-tagging census; compare with Acrobat's checker for this rule.`
          : (qpdf.untaggedWidgetAnnotationCount ?? 0) === 0
            ? `All ${qpdf.widgetAnnotationCount ?? formFieldCount} visible form-field widget(s) are referenced from the structure tree.`
            : `${qpdf.untaggedWidgetAnnotationCount} of ${qpdf.widgetAnnotationCount ?? formFieldCount} visible form-field widget(s) are not referenced from the structure tree (no OBJR).`,
    ),
  );

  rules.push(
    rule(
      "field_descriptions",
      "Forms",
      "Field descriptions",
      "All form fields have description",
      formFieldsVacuous ? "passed" : untaggedForm === 0 ? "passed" : "failed",
      formFieldsVacuous,
      formFieldsVacuous
        ? "No form fields found — rule passes vacuously."
        : untaggedForm === 0
          ? `All ${formFieldCount} form field(s) have /TU descriptions.`
          : `${untaggedForm} of ${formFieldCount} form field(s) are missing /TU descriptions.`,
    ),
  );

  // ──────────────────────────────────────────────────────────────────
  // Alternate Text (5 rules)
  // ──────────────────────────────────────────────────────────────────

  const figureVacuous = figureCount === 0;
  const figuresMissingAlt = qpdf.images.filter((i) => !i.hasAlt).length;
  const figureNote = figureVacuous
    ? paintedImageCount > 0
      ? `0 <Figure> tags exist — rule passes vacuously. But ${paintedImageCount} raster image(s) were painted on pages without structural tagging. They either need <Figure>+/Alt or /Artifact marking to be accessible.`
      : "0 <Figure> tags and 0 painted images — rule passes vacuously."
    : figuresMissingAlt === 0
      ? `All ${figureCount} <Figure> tag(s) have /Alt text.`
      : `${figuresMissingAlt} of ${figureCount} <Figure> tag(s) are missing /Alt text.`;
  rules.push(
    rule(
      "figures_alternate_text",
      "Alternate Text",
      "Figures alternate text",
      "Figures require alternate text",
      figureVacuous ? "passed" : figuresMissingAlt === 0 ? "passed" : "failed",
      figureVacuous,
      figureNote,
    ),
  );

  rules.push(
    rule(
      "nested_alternate_text",
      "Alternate Text",
      "Nested alternate text",
      "Alternate text that will never be read",
      figureVacuous ? "passed" : "not_computed",
      figureVacuous,
      figureVacuous
        ? "0 <Figure> tags — rule passes vacuously."
        : `${figureCount} <Figure> tag(s) present. This tool does not currently detect nested /Alt text shadowed by parent containers.`,
    ),
  );

  rules.push(
    rule(
      "associated_with_content",
      "Alternate Text",
      "Associated with content",
      "Alternate text must be associated with some content",
      figureVacuous ? "passed" : "not_computed",
      figureVacuous,
      figureVacuous
        ? "0 <Figure> tags — rule passes vacuously."
        : `${figureCount} <Figure> tag(s) present. This tool does not currently verify whether each /Alt attaches to tagged content.`,
    ),
  );

  rules.push(
    rule(
      "hides_annotation",
      "Alternate Text",
      "Hides annotation",
      "Alternate text should not hide annotation",
      figureVacuous ? "passed" : "not_computed",
      figureVacuous,
      figureVacuous
        ? "0 <Figure> tags — rule passes vacuously."
        : `${figureCount} <Figure> tag(s) present. This tool does not currently verify annotation visibility under /Alt.`,
    ),
  );

  rules.push(
    rule(
      "other_elements_alternate_text",
      "Alternate Text",
      "Other elements alternate text",
      "Other elements that require alternate text",
      "not_computed",
      false,
      "Acrobat's rule covers formulas, note links, and other elements requiring /Alt. This tool does not currently enumerate these.",
    ),
  );

  // ──────────────────────────────────────────────────────────────────
  // Tables (5 rules)
  // ──────────────────────────────────────────────────────────────────

  const tablesVacuous = tableCount === 0;
  const tablesWithoutRows = qpdf.tables.filter((t) => !t.hasRowStructure).length;
  const tablesWithoutHeaders = qpdf.tables.filter((t) => !t.hasHeaders).length;
  const tablesInconsistent = qpdf.tables.filter((t) => t.hasConsistentColumns === false).length;

  rules.push(
    rule(
      "rows",
      "Tables",
      "Rows",
      "TR must be a child of Table, THead, TBody, or TFoot",
      tablesVacuous ? "passed" : tablesWithoutRows === 0 ? "passed" : "failed",
      tablesVacuous,
      tablesVacuous
        ? "No tables found — rule passes vacuously."
        : tablesWithoutRows === 0
          ? `All ${tableCount} table(s) have proper <TR> row structure.`
          : `${tablesWithoutRows} of ${tableCount} table(s) have missing or malformed <TR> rows.`,
    ),
  );

  rules.push(
    rule(
      "th_and_td",
      "Tables",
      "TH and TD",
      "TH and TD must be children of TR",
      tablesVacuous ? "passed" : "not_computed",
      tablesVacuous,
      tablesVacuous
        ? "No tables found — rule passes vacuously."
        : `${tableCount} table(s) present. This tool verifies TH/TD presence (see Table Markup category) but does not specifically validate their placement inside <TR>.`,
    ),
  );

  rules.push(
    rule(
      "headers",
      "Tables",
      "Headers",
      "Tables should have headers",
      tablesVacuous ? "passed" : tablesWithoutHeaders === 0 ? "passed" : "failed",
      tablesVacuous,
      tablesVacuous
        ? "No tables found — rule passes vacuously."
        : tablesWithoutHeaders === 0
          ? `All ${tableCount} table(s) contain <TH> header cells.`
          : `${tablesWithoutHeaders} of ${tableCount} table(s) have no <TH> header cells.`,
    ),
  );

  rules.push(
    rule(
      "regularity",
      "Tables",
      "Regularity",
      "Tables must contain the same number of columns in each row and rows in each column",
      tablesVacuous ? "passed" : tablesInconsistent === 0 ? "passed" : "failed",
      tablesVacuous,
      tablesVacuous
        ? "No tables found — rule passes vacuously."
        : tablesInconsistent === 0
          ? `All ${tableCount} table(s) have consistent column counts across rows.`
          : `${tablesInconsistent} of ${tableCount} table(s) have uneven column counts.`,
    ),
  );

  rules.push(
    rule(
      "summary",
      "Tables",
      "Summary",
      "Tables must have a summary",
      "skipped",
      false,
      "Acrobat skips this rule by default (table summaries were deprecated in HTML5 and are rarely required).",
    ),
  );

  // ──────────────────────────────────────────────────────────────────
  // Lists (2 rules)
  // ──────────────────────────────────────────────────────────────────

  const listsVacuous = listCount === 0;
  const listsMalformed = qpdf.lists.filter((l) => !l.isWellFormed).length;
  // LI-placement (LI must be a child of L) is not something this pipeline
  // verifies — the list walker starts FROM <L> elements, so a stray <LI>
  // outside any list is invisible to it. Reporting "passed" here fabricated
  // a verified-sounding verdict; not_computed is the honest status.
  rules.push(
    rule(
      "list_items",
      "Lists",
      "List items",
      "LI must be a child of L",
      listsVacuous ? "passed" : "not_computed",
      listsVacuous,
      listsVacuous
        ? "No lists found — rule passes vacuously."
        : `${listCount} list(s) detected. This tool walks lists from their <L> roots and does not verify the placement of every <LI>; Acrobat checks placement directly.`,
    ),
  );

  rules.push(
    rule(
      "lbl_and_lbody",
      "Lists",
      "Lbl and LBody",
      "Lbl and LBody must be children of LI",
      listsVacuous ? "passed" : listsMalformed === 0 ? "passed" : "failed",
      listsVacuous,
      listsVacuous
        ? "No lists found — rule passes vacuously."
        : listsMalformed === 0
          ? `All ${listCount} list(s) have well-formed <LBody> children (Acrobat's rule checks placement, not <Lbl> presence).`
          : `${listsMalformed} of ${listCount} list(s) have items missing <LBody> elements.`,
    ),
  );

  // ──────────────────────────────────────────────────────────────────
  // Headings (1 rule)
  // ──────────────────────────────────────────────────────────────────

  const headingsVacuous = headingCount === 0;
  // Real Acrobat FAILS Appropriate Nesting on skipped heading levels — a
  // condition this pipeline already detects. Deriving the verdict from the
  // same skip detection keeps the panel from showing "Acrobat: passed"
  // beside this tool's own skipped-level finding.
  let headingSkips = 0;
  const numericLevels = qpdf.headings
    .map((h) => Number(/^H(\d)$/.exec(h.level)?.[1]))
    .filter((n) => Number.isFinite(n));
  for (let i = 1; i < numericLevels.length; i++) {
    if (numericLevels[i] - numericLevels[i - 1] > 1) headingSkips++;
  }
  rules.push(
    rule(
      "appropriate_nesting",
      "Headings",
      "Appropriate nesting",
      "Appropriate nesting",
      headingsVacuous ? "passed" : headingSkips === 0 ? "passed" : "failed",
      headingsVacuous,
      headingsVacuous
        ? "No heading tags found — rule passes vacuously. Acrobat has no 'document must contain headings' rule; this tool scores heading_structure separately for substantive documents without headings."
        : headingSkips === 0
          ? `${headingCount} heading tag(s) found with no skipped levels. Acrobat flags nesting violations only; it does not penalize multiple <H1> tags.`
          : `${headingSkips} skipped heading level(s) detected (e.g. H1 → H3) — Acrobat's Appropriate Nesting rule fails on this.`,
    ),
  );

  // ──────────────────────────────────────────────────────────────────
  // Summary tallies
  // ──────────────────────────────────────────────────────────────────

  const summary: AdobeParitySummary = {
    passed: rules.filter((r) => r.status === "passed").length,
    failed: rules.filter((r) => r.status === "failed").length,
    manual: rules.filter((r) => r.status === "manual").length,
    skipped: rules.filter((r) => r.status === "skipped").length,
    notComputed: rules.filter((r) => r.status === "not_computed").length,
    vacuousPasses: rules.filter((r) => r.status === "passed" && r.vacuous).length,
    total: rules.length,
  };

  return { summary, rules };
}
