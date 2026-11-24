/**
 * Which finding is this line? — answered by CODE when the report carries
 * codes, and by the line's wording only when it does not.
 *
 * WHY. Three parts of the web app decide things from the engine's finding
 * lines: the fix-time estimates (fixTime.ts), the action plan's choice of
 * step (actionPlan.ts) and the best-practice rows (bestPractices/*). They used
 * to recognise a line by its English wording alone, so rewording a finding in
 * the engine could silently drop an estimate, pick the wrong step or turn a
 * row grey. Since v1.176.0 every line the engine writes also carries a stable
 * code (`findingDetails`, packages/shared/src/findingCodes.ts), and a code
 * does not change when the words do.
 *
 * THE RULE, the same for every consumer:
 *
 *   - the line has a code                →  the code decides, the words are
 *                                           not looked at;
 *   - the line has no code               →  the wording decides, exactly as
 *     (a report stored before v1.176.0,     it always has. Those reports keep
 *     a shared link to one)                 the words they were written with
 *                                           for as long as they are stored.
 *
 * ONE TABLE. `FINDING` below is the only place a code and its wording are
 * written side by side. A consumer names a rule (`FINDING.pdfNoHeadingTags`)
 * and never a code or a phrase, so the two routes cannot drift apart without
 * this file changing — and findingCodeParity.test.ts fails when they disagree
 * on any real engine result.
 *
 * ADDING OR CHANGING A RULE
 *   1. `codes` — every code whose line the wording matches IN THE PLACE THE
 *      RULE IS USED (a rule is always applied to one category's findings).
 *      The codes are typed: a code the registry does not have fails typecheck.
 *   2. `wording` — leave it alone. It describes reports that are already
 *      stored; it is not a description of what the engine writes today.
 *   3. An empty `codes` list means "the registry has no code for exactly
 *      this" — the rule then goes by wording for every report. Say why at
 *      the rule.
 *
 * NOTHING HERE MAY THROW: /report/[id] renders stored JSON through SSR, so
 * every entry point takes `unknown` and narrows.
 */
import type { FindingCode } from "@file-audit/shared";

export interface FindingRule {
  /** The codes this rule means. Empty: no code exists, wording only. */
  readonly codes: readonly FindingCode[];
  /** The wording test — what decides for a line that carries no code. */
  readonly wording: (line: string) => boolean;
  /** The pattern behind `wording`, when a consumer also reads a number out of
   *  an un-coded line with it (fixTime.ts). */
  readonly pattern?: RegExp;
}

/** What a coded line carries beside its words. */
export interface CodedLine {
  code: string;
  count?: number;
  total?: number;
}

/** A category's coded lines, by the line's text — both as the engine wrote
 *  it and as the report card shows it (see `shownForm`). */
export type CodeIndex = ReadonlyMap<string, readonly CodedLine[]>;

/** Every needle occurs in the line, ignoring case — the matching the
 *  best-practice catalog has always used. */
export function phrase(...needles: string[]): (line: string) => boolean {
  const lowered = needles.map((n) => n.toLowerCase());
  return (line) => {
    const l = line.toLowerCase();
    return lowered.every((n) => l.includes(n));
  };
}

/** The line contains this text, case and all — the action plan's matching. */
export function text(part: string): (line: string) => boolean {
  return (line) => line.includes(part);
}

function rule(
  codes: readonly FindingCode[],
  wording: RegExp | ((line: string) => boolean),
): FindingRule {
  if (wording instanceof RegExp) {
    // No pattern in the table may carry a /g or /y flag: `test` would then
    // remember where the previous line's match ended.
    const pattern = wording;
    return { codes, wording: (line) => pattern.test(line), pattern };
  }
  return { codes, wording };
}

/**
 * The form a line takes once `partitionCardFindings` (utils/findings.ts) has
 * filed it: a `--- Heading ---` divider becomes its bare heading, an indented
 * signal line loses its indent. The catalog reads those forms, so the index
 * knows a line by both. MUST mirror that function — pinned by
 * findingCodeParity.test.ts.
 */
function shownForm(line: string): string {
  if (line.startsWith("---")) {
    return line
      .replace(/^-{3}\s*/, "")
      .replace(/\s*-{3}$/, "")
      .trim();
  }
  if (line.startsWith("  ")) return line.replace(/^\s+/, "");
  return line;
}

/**
 * The codes of one category's lines, or null when it carries none.
 *
 * A detail counts only when it is the twin of the line beside it
 * (`findingDetails[i].text === findings[i]`) and names a real code — the
 * engine's own `….uncoded` placeholder is "no code", and so is anything a
 * forged or damaged report puts there. Such a line simply falls back to its
 * wording; nothing is ever inferred from a detail that does not line up.
 */
export function buildCodeIndex(findings: unknown, findingDetails: unknown): CodeIndex | null {
  if (!Array.isArray(findings) || !Array.isArray(findingDetails)) return null;
  if (findingDetails.length !== findings.length) return null;
  const index = new Map<string, CodedLine[]>();
  const shown: Array<[string, CodedLine]> = [];
  for (let i = 0; i < findings.length; i++) {
    const line: unknown = findings[i];
    const detail: unknown = findingDetails[i];
    if (typeof line !== "string" || !detail || typeof detail !== "object") continue;
    const d = detail as Record<string, unknown>;
    if (typeof d.code !== "string" || d.text !== line || d.code.endsWith(".uncoded")) continue;
    const coded: CodedLine = { code: d.code };
    if (typeof d.count === "number" && Number.isFinite(d.count)) coded.count = d.count;
    if (typeof d.total === "number" && Number.isFinite(d.total)) coded.total = d.total;
    const known = index.get(line);
    if (known) known.push(coded);
    else index.set(line, [coded]);
    const as = shownForm(line);
    if (as !== line) shown.push([as, coded]);
  }
  // The shown forms second, and never over a line's own entry: an indented
  // signal line quotes the document, and must not be able to lend its code to
  // a line of the analyzer's own that happens to read the same.
  const own = new Set(index.keys());
  for (const [as, coded] of shown) {
    if (own.has(as)) continue;
    const known = index.get(as);
    if (known) known.push(coded);
    else index.set(as, [coded]);
  }
  return index.size > 0 ? index : null;
}

/**
 * How a line met a rule: by its code (with the numbers the code carries), by
 * its wording, or not at all (null).
 */
export function findingHit(
  r: FindingRule,
  line: string,
  index: CodeIndex | null | undefined,
): { by: "code"; coded: CodedLine } | { by: "wording" } | null {
  const coded = r.codes.length > 0 ? index?.get(line) : undefined;
  if (coded) {
    const hit = coded.find((c) => (r.codes as readonly string[]).includes(c.code));
    return hit ? { by: "code", coded: hit } : null;
  }
  return r.wording(line) ? { by: "wording" } : null;
}

/** Is this line the finding the rule names? */
export function isFinding(
  r: FindingRule,
  line: string,
  index: CodeIndex | null | undefined,
): boolean {
  return findingHit(r, line, index) !== null;
}

/** One category's lines, for a consumer that only asks "is finding X here?". */
export interface FindingLines {
  has(r: FindingRule): boolean;
}

export function findingLines(findings: unknown, findingDetails?: unknown): FindingLines {
  const lines = Array.isArray(findings)
    ? findings.filter((f): f is string => typeof f === "string")
    : [];
  const index = buildCodeIndex(findings, findingDetails);
  return { has: (r) => lines.some((line) => isFinding(r, line, index)) };
}

/**
 * THE TABLE. Grouped by the consumer that reads the rule; the comment on a
 * group says what its lines are matched against, because a rule's `codes` are
 * only complete for the category it is used in.
 */
export const FINDING = {
  // =========================================================================
  // fixTime.ts — a count read from a category's own scored lines. On a coded
  // line the count is the code's own `count` / `total`; the pattern's capture
  // group is read only from a line that carries no code.
  // =========================================================================
  fixLookalikeHeadings: rule(
    ["docx.heading_structure.lookalike_headings"],
    /(\d+) paragraph\(s\) are formatted to look like headings/,
  ),
  fixEmptyHeadings: rule(
    ["docx.heading_structure.empty_headings"],
    /(\d+) Heading-styled paragraph\(s\) contain no text/,
  ),
  fixTypedBullets: rule(
    ["docx.list_structure.typed_bullets"],
    /(\d+) paragraph\(s\) use typed bullets or numbers/,
  ),
  fixBelowContrastMinimum: rule(
    [
      "docx.color_contrast.runs_checked",
      "pptx.color_contrast.below_minimum",
      "xlsx.color_contrast.below_minimum",
    ],
    /(\d+) below the WCAG (?:contrast )?minimum/,
  ),
  fixTablesNoHeaderRow: rule(
    [
      "docx.table_markup.no_header_row",
      "pptx.table_markup.no_header_row",
      "xlsx.table_markup.no_header_row",
    ],
    /(\d+) (?:data )?table\(s\) have no header row/,
  ),
  fixLinksNoText: rule(
    [
      "docx.link_quality.links_unnamed",
      "pdf.link_quality.links_unnamed",
      "pptx.link_quality.links_unnamed",
      "xlsx.link_quality.links_unnamed",
    ],
    /(\d+) link\(s\) have no link text/,
  ),
  fixImagesMissingAlt: rule(
    [
      "docx.alt_text.images_missing_alt",
      "pptx.alt_text.images_missing_alt",
      "xlsx.alt_text.images_missing_alt",
    ],
    /(\d+) image\(s\) are missing alt text/,
  ),
  fixImagesWithAlt: rule(
    [
      "docx.alt_text.images_with_alt",
      "pdf.alt_text.images_with_alt",
      "pptx.alt_text.images_with_alt",
      "xlsx.alt_text.images_with_alt",
    ],
    /(\d+) of (\d+) (?:meaningful )?image\(s\) have alt(?:ernative)? text/,
  ),

  // =========================================================================
  // actionPlan.ts — which variant of a step a category gets. Matched against
  // EVERY line of the category, signal lines and the Acrobat guide included.
  // =========================================================================
  // text_extractability (PDF)
  planAccessDenied: rule(
    ["pdf.text_extractability.accessibility_denied"],
    text("deny assistive-technology access"),
  ),
  planNotTagged: rule(["pdf.text_extractability.not_tagged"], text("Document is NOT tagged")),
  planStructTreeEmpty: rule(
    ["pdf.text_extractability.struct_tree_empty"],
    text("is present but EMPTY"),
  ),
  planUntaggedContentFix: rule(
    ["pdf.text_extractability.untagged_content_major_fix"],
    text("bring the untagged content into the structure"),
  ),
  planUntaggedContentReview: rule(
    ["pdf.text_extractability.untagged_content_review"],
    text("Review the named pages in Acrobat's Tags panel"),
  ),
  planUnmappedTextEffect: rule(
    ["pdf.text_extractability.unmapped_chars_significant"],
    text("cannot be read aloud or searched"),
  ),
  planUnmappedTextVerify: rule(
    ["pdf.text_extractability.unmapped_chars_moderate"],
    text("Verify the affected passages read correctly"),
  ),
  planTagged: rule(
    ["pdf.text_extractability.tagged", "pdf.text_extractability.tagged_too_little_text"],
    text("Document is tagged (StructTreeRoot present)"),
  ),
  // TWO codes, and the second is not about this document's fonts. The
  // Acrobat guide the engine appends to every text_extractability category
  // scoring under 100 has a step that reads "To fix non-embedded fonts: …",
  // and the wording below has always matched it — so "fonts are not embedded"
  // has, in practice, meant "a font is flagged OR the guide is attached".
  // The guide is appended whole, so naming its step code reproduces exactly
  // that, by code. Narrowing this rule to the first code alone would be a
  // change in behaviour — a decision for the plan's owner, not a refactor.
  planFontsNotEmbedded: rule(
    ["pdf.text_extractability.fonts_not_embedded", "pdf.text_extractability.acrobat_guide_step"],
    /non-embedded font/i,
  ),
  // alt_text (PDF)
  planLetteringNotText: rule(
    ["pdf.alt_text.text_like_images_heading"],
    text("--- Some Lettering May Not Be Real Text ---"),
  ),
  planFiguresContainText: rule(
    ["pdf.alt_text.text_figures_heading"],
    text("--- Figures That Contain Text ---"),
  ),
  // link_quality (PDF)
  planLinksNotTagged: rule(
    ["pdf.link_quality.untagged_list_heading"],
    text("--- Links Not Tagged ---"),
  ),
  // table_markup (PDF)
  planScopeMissing: rule(
    ["pdf.table_markup.scope_missing_complex_tables"],
    text("missing Scope attribute"),
  ),
  // title_language (every format)
  planTitleProblem: rule(
    [
      "docx.title_language.title_missing",
      "docx.title_language.title_tool_generated",
      "pdf.title_language.title_missing",
      "pdf.title_language.title_tool_generated",
      "pptx.title_language.title_missing",
      "pptx.title_language.title_tool_generated",
      "xlsx.title_language.title_missing",
      "xlsx.title_language.title_tool_generated",
    ],
    /No document title found|No (?:document|presentation|workbook) title is set|(?:looks like|is) a filename or tool-generated string/,
  ),
  planTitleNotDisplayed: rule(
    ["pdf.title_language.display_doc_title_off"],
    /DisplayDocTitle viewer preference is (?:off|NOT)/i,
  ),
  planLanguageSet: rule(
    [
      "docx.title_language.language_declared",
      "pdf.title_language.language_declared",
      "pptx.title_language.language_declared",
    ],
    /^(?:Language declared:|Document language:|Presentation language:)/,
  ),
  planExcelNoLanguage: rule(
    ["xlsx.title_language.language_not_stored"],
    /^Excel does not store a document language/,
  ),
  planLanguageProblem: rule(
    [
      "docx.title_language.language_missing",
      "docx.title_language.language_mismatch",
      "docx.title_language.language_unusable",
      "pdf.title_language.language_missing",
      "pdf.title_language.language_mismatch",
      "pdf.title_language.language_unusable",
      "pptx.title_language.language_missing",
      "pptx.title_language.language_mismatch",
      "pptx.title_language.language_unusable",
    ],
    /No language declaration found|No document language is declared|No (?:default )?presentation language is declared|not a usable language code|declares its language as/,
  ),
  planTitleSet: rule(
    [
      "docx.title_language.title_present",
      "pdf.title_language.title_present",
      "pdf.title_language.title_present_displayed",
      "pptx.title_language.title_present",
    ],
    /^(?:Document|Presentation) title: "/,
  ),
  // heading_structure (Word)
  planEmptyHeadings: rule(["docx.heading_structure.empty_headings"], text("contain no text")),
  // The "overwhelmed" line counts the same look-alike paragraphs in other
  // words ("Only 1 real heading(s) against 12 paragraph(s) formatted to look
  // like headings") and has always matched too.
  planLookalikeHeadings: rule(
    [
      "docx.heading_structure.lookalike_headings",
      "docx.heading_structure.headings_overwhelmed",
      "pdf.heading_structure.lookalike_headings",
    ],
    text("formatted to look like headings"),
  ),

  // =========================================================================
  // bestPractices/pdf.ts — each rule is matched against ONE category's lines,
  // named in the group comment. "group" rules name a `--- Heading ---` signal
  // group and are matched against the bare heading; "item" rules are matched
  // against the un-indented lines inside a group.
  // =========================================================================
  // heading_structure
  pdfHeadingTreeGroup: rule(["pdf.heading_structure.tree_heading"], phrase("Heading Tree")),
  // The level line of the Heading Tree group ("H1 → H2 → H2"). The group
  // holds that line and, at most, skip annotations; with no code to go by,
  // the level line is the one that is not a skip annotation.
  pdfHeadingTreeLevelsItem: rule(
    ["pdf.heading_structure.tree_levels"],
    (l) => !l.trim().startsWith("Heading hierarchy skip"),
  ),
  pdfHeadingSkipItem: rule(["pdf.heading_structure.level_skip"], (l) =>
    l.trim().startsWith("Heading hierarchy skip"),
  ),
  pdfHeadingGaps: rule(
    ["pdf.heading_structure.level_order_gaps"],
    phrase("heading tags, but the", "has gaps"),
  ),
  pdfHeadingsLogical: rule(
    ["pdf.heading_structure.headings_found"],
    phrase("heading tags with logical hierarchy"),
  ),
  pdfOnlyGenericHeadings: rule(["pdf.heading_structure.generic_h_only"], phrase("only generic")),
  pdfOnlyGenericHeadingsNotNumbered: rule(
    ["pdf.heading_structure.generic_h_only"],
    phrase("only generic", "not h1–h6"),
  ),
  pdfNoHeadingTags: rule(["pdf.heading_structure.no_heading_tags"], phrase("no heading tags")),
  pdfNoHeadingsFound: rule(
    ["pdf.heading_structure.no_headings", "pdf.heading_structure.no_headings_lone_title"],
    phrase("no headings were found"),
  ),
  pdfMixedHeadingConvention: rule(
    ["pdf.heading_structure.mixed_conventions"],
    phrase("generic <h> heading(s) appear alongside"),
  ),
  pdfHeadingContentGroup: rule(
    ["pdf.heading_structure.content_heading"],
    phrase("Do the Headings Read Like Headings"),
  ),
  pdfHeadingContentCountItem: rule(
    [
      "pdf.heading_structure.content_empty",
      "pdf.heading_structure.content_fragments",
      "pdf.heading_structure.content_paragraphs",
      "pdf.heading_structure.content_usable_share",
    ],
    /^\d/,
  ),
  pdfH1Count: rule(["pdf.heading_structure.multiple_h1"], (l) =>
    /^found \d+ h1 headings\b/i.test(l.trim()),
  ),
  // reading_order
  pdfIsForm: rule(["pdf.reading_order.form_not_scored"], phrase("it is a form")),
  pdfReadingOrderDrift: rule(
    ["pdf.reading_order.order_divergence"],
    phrase("tagged order agreed with the content stream"),
  ),
  pdfReadingOrderFidelity: rule(["pdf.reading_order.fidelity"], phrase("reading-order fidelity")),
  pdfNoStructureTree: rule(
    ["pdf.reading_order.no_struct_tree"],
    phrase("no structure tree present"),
  ),
  pdfFlatStructureTree: rule(["pdf.reading_order.flat_tree"], phrase("structure tree is flat")),
  pdfStructureTreeDepth: rule(["pdf.reading_order.tree_depth"], phrase("structure tree depth")),
  pdfNoTaggedLists: rule(
    ["pdf.reading_order.lists_none_tagged"],
    phrase("no tagged lists detected"),
  ),
  pdfListStructureGroup: rule(
    ["pdf.reading_order.lists_section"],
    phrase("List Structure Analysis"),
  ),
  pdfListItem: rule(["pdf.reading_order.lists_item"], /^List\b/),
  pdfListsNoLbl: rule(["pdf.reading_order.lists_without_labels"], phrase("have no <lbl>")),
  pdfFootnotesGroup: rule(["pdf.reading_order.notes_section"], phrase("Footnotes")),
  pdfNotesNoIdItem: rule(["pdf.reading_order.notes_missing_id"], phrase("note(s) have no /id")),
  pdfNotesReuseIdItem: rule(
    ["pdf.reading_order.notes_duplicate_id"],
    phrase("note(s) reuse another note's /id"),
  ),
  pdfNotesUniqueIdItem: rule(
    ["pdf.reading_order.notes_ids_unique"],
    phrase("all notes carry a unique /id"),
  ),
  // bookmarks
  pdfBookmarksNotRequired: rule(
    ["pdf.bookmarks.not_required_short_document"],
    phrase("bookmarks are not required"),
  ),
  pdfNoBookmarks: rule(
    ["pdf.bookmarks.no_bookmarks", "pdf.bookmarks.outline_empty"],
    phrase("pages", "no bookmarks"),
  ),
  pdfBookmarksFound: rule(["pdf.bookmarks.bookmarks_found"], phrase("bookmark(s) found")),
  pdfBookmarkOutlineGroup: rule(["pdf.bookmarks.outline_heading"], phrase("Bookmark Outline")),
  // text_extractability
  pdfFontsNotEmbedded: rule(
    ["pdf.text_extractability.fonts_not_embedded"],
    phrase("non-embedded font(s)"),
  ),
  pdfFontsAllEmbedded: rule(
    ["pdf.text_extractability.fonts_all_embedded"],
    phrase("all fonts are embedded"),
  ),
  pdfFontsVisibleEmbedded: rule(
    ["pdf.text_extractability.fonts_visible_embedded"],
    phrase("all fonts used to display text are embedded"),
  ),
  pdfFontEmbeddingGroup: rule(["pdf.text_extractability.fonts_heading"], phrase("Font Embedding")),
  pdfCharacterMappingGroup: rule(
    ["pdf.text_extractability.unmapped_chars_heading"],
    phrase("Character Mapping"),
  ),
  pdfUnmappedCharsItem: rule(
    ["pdf.text_extractability.unmapped_chars"],
    /cannot be mapped to readable text/i,
  ),
  pdfSymbolFontBullets: rule(
    [
      "pdf.text_extractability.unmapped_chars_small",
      "pdf.text_extractability.unmapped_chars_moderate",
    ],
    phrase("symbol-font bullets"),
  ),
  pdfUntaggedContentGroup: rule(
    ["pdf.text_extractability.untagged_content_heading"],
    phrase("Content Outside the Tag Structure"),
  ),
  pdfUntaggedCharsItem: rule(
    ["pdf.text_extractability.untagged_content"],
    /visible character\(s\)/,
  ),
  pdfStrayResidueItem: rule(
    ["pdf.text_extractability.untagged_content_small"],
    /stray export residue/i,
  ),
  // title_language
  pdfTitleNotDisplayedScored: rule(
    ["pdf.title_language.display_doc_title_off"],
    phrase("so viewers and screen readers announce the filename instead"),
  ),
  pdfDisplayDocTitleOff: rule(
    ["pdf.title_language.display_doc_title_off"],
    phrase("displaydoctitle viewer preference is"),
  ),
  pdfDisplayDocTitleSet: rule(
    ["pdf.title_language.title_present_displayed"],
    phrase("displaydoctitle is set"),
  ),
  pdfTitleIsFilename: rule(
    ["pdf.title_language.title_tool_generated"],
    phrase("is a filename or tool-generated string rather than a descriptive title"),
  ),
  pdfTitleFilenameShaped: rule(
    ["pdf.title_language.title_filename_shaped"],
    phrase("reads like a filename or export string"),
  ),
  // table_markup
  pdfNoTables: rule(["pdf.table_markup.no_tables"], phrase("no tables detected in this document")),
  pdfOnlyLayoutTables: rule(
    ["pdf.table_markup.only_layout_tables"],
    phrase("detected — treated as layout structures rather than data tables"),
  ),
  pdfScopeNotApplicable: rule(
    ["pdf.table_markup.scope_not_applicable"],
    phrase("scope attributes: n/a"),
  ),
  pdfScopeMissingScored: rule(
    ["pdf.table_markup.scope_missing_complex_tables"],
    phrase("missing scope attribute (with no /headers association either)"),
  ),
  pdfSimpleTablesNoScope: rule(
    ["pdf.table_markup.scope_missing_simple_tables"],
    phrase("header cell(s) across", "have no /scope"),
  ),
  pdfAllThScoped: rule(
    ["pdf.table_markup.all_scope_present"],
    phrase("all <th> cells have scope attributes"),
  ),
  pdfHeadersWithoutScope: rule(
    ["pdf.table_markup.headers_attribute_without_scope"],
    phrase("rely on /headers associations without /scope"),
  ),
  pdfAllTablesAssociated: rule(
    ["pdf.table_markup.all_associated"],
    phrase("all tables associate data cells with headers"),
  ),
  pdfNestedTables: rule(
    ["pdf.table_markup.nested_tables"],
    phrase("a nested table is not a wcag failure"),
  ),
  pdfNoNestedTables: rule(
    ["pdf.table_markup.no_nested_tables"],
    phrase("no nested tables detected"),
  ),
  // link_quality
  pdfNoLinks: rule(["pdf.link_quality.no_links"], phrase("no links found in this document")),
  pdfVagueLinks: rule(["pdf.link_quality.vague_text"], phrase("link(s) use non-descriptive text")),
  pdfVagueLinksGroup: rule(
    ["pdf.link_quality.vague_list_heading"],
    phrase("Links With Non-Descriptive Text"),
  ),
  pdfLinksDescriptive: rule(
    ["pdf.link_quality.all_descriptive", "pdf.link_quality.attributable_all_descriptive"],
    phrase("link(s) use descriptive text"),
  ),
  pdfLinksUnattributable: rule(
    ["pdf.link_quality.text_unattributable"],
    phrase("expose no text this tool could attribute"),
  ),
  pdfRawUrlLinks: rule(
    ["pdf.link_quality.raw_urls"],
    phrase("use the raw url as their visible text"),
  ),
  pdfRawUrlGroup: rule(["pdf.link_quality.raw_urls_heading"], phrase("Raw URL Link Text")),

  // =========================================================================
  // bestPractices/office.ts — Word, PowerPoint and Excel. A rule shared by
  // more than one format lists each format's code; a report only ever carries
  // its own format's.
  // =========================================================================
  // heading_structure (Word)
  docxHeadingOutlineGroup: rule(
    ["docx.heading_structure.outline_heading"],
    phrase("Heading Outline"),
  ),
  docxFirstHeadingNotH1: rule(
    ["docx.heading_structure.first_not_h1"],
    phrase("the first heading is heading"),
  ),
  docxNoHeadingsFound: rule(
    ["docx.heading_structure.no_headings", "docx.heading_structure.no_headings_lone_title"],
    phrase("no headings were found"),
  ),
  docxRealHeadingsFound: rule(
    ["docx.heading_structure.headings_found"],
    phrase("real heading(s) found"),
  ),
  docxHeadingSkips: rule(["docx.heading_structure.skipped_level"], phrase("skip a heading level")),
  // text_extractability (Word)
  docxEmptyParagraphRuns: rule(
    ["docx.text_extractability.empty_paragraph_runs"],
    phrase("consecutive empty paragraphs"),
  ),
  docxTextExtractable: rule(
    ["docx.text_extractability.text_extractable"],
    phrase("fully extractable, selectable text"),
  ),
  // table_markup (Word, PowerPoint)
  officeLayoutGrid: rule(
    ["docx.table_markup.bare_grid_layout", "pptx.table_markup.bare_grid_layout"],
    phrase("bare grid"),
  ),
  officeNoTables: rule(
    ["docx.table_markup.no_tables", "pptx.table_markup.no_tables"],
    phrase("no tables were found"),
  ),
  officeNoHeaderRow: rule(
    ["docx.table_markup.no_header_row", "pptx.table_markup.no_header_row"],
    phrase("data table(s) have no header row"),
  ),
  officeTablesFound: rule(
    ["docx.table_markup.tables_found", "pptx.table_markup.tables_found"],
    phrase("table(s) found"),
  ),
  docxNestedTables: rule(["docx.table_markup.nested_tables"], phrase("nested tables were found")),
  docxMergedCells: rule(
    ["docx.table_markup.merged_cells"],
    phrase("merged cell(s) across the table"),
  ),
  docxEmptyTableRows: rule(["docx.table_markup.empty_rows"], phrase("entirely empty table row")),
  // link_quality (Word, PowerPoint, Excel)
  officeVagueLinks: rule(
    [
      "docx.link_quality.vague_text",
      "pptx.link_quality.vague_text",
      "xlsx.link_quality.vague_text",
    ],
    phrase("non-descriptive text"),
  ),
  officeNoLinks: rule(
    ["docx.link_quality.no_links", "pptx.link_quality.no_links", "xlsx.link_quality.no_links"],
    phrase("no hyperlinks were found"),
  ),
  officeLinksFound: rule(
    ["docx.link_quality.links_assessed", "pptx.link_quality.links_assessed"],
    phrase("link(s) found"),
  ),
  xlsxLinksAssessed: rule(["xlsx.link_quality.links_assessed"], phrase("link(s) assessed")),
  officeRawUrlLinks: rule(
    ["docx.link_quality.raw_urls", "pptx.link_quality.raw_urls", "xlsx.link_quality.raw_urls"],
    phrase("raw url as their visible text"),
  ),
  // slide_titles (PowerPoint)
  pptxHeadingInTextBox: rule(
    ["pptx.slide_titles.typed_headings"],
    phrase("typed into an ordinary text box"),
  ),
  // One finding, two eras of wording: "…no title…" until 2026-11-16, "…no
  // slide title…" since. Both rules name the same code; the first exists for
  // stored reports and never matches a line the engine writes today.
  pptxUntitledSlides: rule(
    ["pptx.slide_titles.untitled_slides"],
    phrase("no title", "use the outline view"),
  ),
  pptxUntitledSlidesCurrent: rule(
    ["pptx.slide_titles.untitled_slides"],
    phrase("no slide title", "use the outline view"),
  ),
  pptxNoSlides: rule(["pptx.slide_titles.no_slides"], phrase("no slides were found")),
  pptxDistinctTitles: rule(["pptx.slide_titles.all_distinct"], phrase("have a distinct title")),
  pptxDuplicateTitle: rule(["pptx.slide_titles.duplicate_title"], /slides? share the title "/i),
  // sheet_names (Excel)
  xlsxDefaultSheetName: rule(
    ["xlsx.sheet_names.default_name"],
    /rename "[^"]+" to describe its contents/i,
  ),
  xlsxNoVisibleSheets: rule(
    ["xlsx.sheet_names.no_visible_sheets"],
    phrase("no visible sheets were found"),
  ),
  xlsxSheetNamesDescriptive: rule(
    ["xlsx.sheet_names.all_descriptive"],
    phrase("visible sheet(s) have descriptive names"),
  ),
  // table_markup (Excel)
  xlsxNoDefinedTable: rule(
    ["xlsx.table_markup.plain_ranges_no_table"],
    phrase("no defined excel table anywhere"),
  ),
  xlsxNoTablesOrRanges: rule(
    ["xlsx.table_markup.no_tables_or_data"],
    phrase("no tables or sizable data ranges were found"),
  ),
  xlsxDefinedTablesFound: rule(
    ["xlsx.table_markup.defined_tables_found"],
    phrase("defined table(s) found"),
  ),
  xlsxDataOutsideTable: rule(
    ["xlsx.table_markup.data_outside_tables"],
    phrase("sits outside the defined table"),
  ),
  xlsxPivotTables: rule(["xlsx.table_markup.pivot_tables"], phrase("contain pivot tables")),
  xlsxDataStartsLate: rule(
    ["xlsx.table_markup.data_starts_far_from_a1"],
    phrase("data begins at row"),
  ),
  xlsxMergedCells: rule(["xlsx.table_markup.merged_cells"], phrase("contain merged cells")),
} as const satisfies Record<string, FindingRule>;
