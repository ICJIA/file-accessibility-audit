// apps/web/app/components/pdfUaCategory.ts
//
// Co-located with ActionPlan.vue (NOT app/utils/) for the same reason as
// pdfUaFixHint.ts: it must never be swept up by Nuxt's auto-import scanning.
//
// Maps a veraPDF PDF/UA-1 failed checkpoint to the action-plan category it
// corroborates, so a fix step can show that an INDEPENDENT validator flagged
// the same defect on this same document.
//
// WHY THIS EXISTS (2026-08-29): a reviewer looking at a fix step is entitled
// to ask "says who?" — and for the machine-checkable defects the honest and
// far stronger answer is "not us: veraPDF, built by the PDF Association,
// which we did not write." The report already carries veraPDF's verdict in
// its own panel; this puts the relevant line of it where the doubt actually
// occurs.
//
// MATCHING IS ON THE RULE ID (clause + test number), never on description
// keywords. Keyword matching collided with ISO cross-references inside
// veraPDF's own rule text (found 2026-09-01 on real documents): the
// figure-alt rule 7.3-1 cites "ISO 32000-1:2008, 14.7.2, Table 323" and was
// filed under table_markup — so the Tables step read "independently
// confirmed" over a figure rule, ×16 on a real annual report — and the
// annotation rule 7.18.1-2 ("except Widget annotations…") landed on
// alt_text. Rule ids are stable within a veraPDF release; the vendored
// profile's README already requires re-fetching profiles on an engine
// upgrade, and that is the moment to re-verify this map (both profile rule
// lists were enumerated against 1.30.1 when it was written).
//
// DELIBERATELY CONSERVATIVE: a failure that does not map cleanly onto one of
// our categories returns null and is shown only in veraPDF's own panel. An
// over-eager mapping would put words in the referee's mouth, which is the one
// thing this feature must never do. 7.18.1-2 in particular is left unmapped:
// it spans link, media, and file-attachment annotations at once, so no one
// category of ours is "the same point".

export interface PdfUaFailureLike {
  ruleId?: string;
  clause?: string;
  description?: string;
  count?: number;
}

/** Exact rule id → category. Grouped by the category each corroborates. */
const RULE_CATEGORY: Record<string, string> = {
  // Real content vs artifacts; structure tree presence; AT-blocking security.
  "7.1-1": "text_extractability",
  "7.1-2": "text_extractability",
  "7.1-3": "text_extractability",
  "7.1-4": "text_extractability",
  "7.1-11": "text_extractability",
  "7.16-1": "text_extractability",
  // Title and natural language — the two things a reader hears first.
  "7.1-9": "title_language",
  "7.1-10": "title_language",
  "7.2-2": "title_language",
  "7.2-21": "title_language",
  "7.2-22": "title_language",
  "7.2-23": "title_language",
  "7.2-24": "title_language",
  "7.2-25": "title_language",
  "7.2-29": "title_language",
  "7.2-30": "title_language",
  "7.2-31": "title_language",
  "7.2-32": "title_language",
  "7.2-33": "title_language",
  "7.2-34": "title_language",
  // Table structure (containment, grouping, regularity).
  "7.2-3": "table_markup",
  "7.2-4": "table_markup",
  "7.2-5": "table_markup",
  "7.2-6": "table_markup",
  "7.2-7": "table_markup",
  "7.2-8": "table_markup",
  "7.2-9": "table_markup",
  "7.2-10": "table_markup",
  "7.2-11": "table_markup",
  "7.2-12": "table_markup",
  "7.2-13": "table_markup",
  "7.2-14": "table_markup",
  "7.2-15": "table_markup",
  "7.2-16": "table_markup",
  "7.2-36": "table_markup",
  "7.2-37": "table_markup",
  "7.2-38": "table_markup",
  "7.2-39": "table_markup",
  "7.2-41": "table_markup",
  "7.2-42": "table_markup",
  "7.2-43": "table_markup",
  // Lists and the role map — both live in our reading_order card.
  "7.2-17": "reading_order",
  "7.2-18": "reading_order",
  "7.2-19": "reading_order",
  "7.2-20": "reading_order",
  "7.2-40": "reading_order",
  "7.1-5": "reading_order",
  // Links tagged as Link elements / carrying a described destination.
  "7.18.5-1": "link_quality",
  "7.18.5-2": "link_quality",
  "2.4.9-1": "link_quality",
  // Fonts: ONLY the ToUnicode rule is a point this checker makes (the
  // character-mapping census). Embedding, glyph-width and CMap rules were
  // removed from scoring as non-legal in v1.131, and routing them here read
  // "it failed the same point" under a step about untagged text (2026-09-02).
  "7.21.7-1": "text_extractability",
  "7.21.7-2": "text_extractability",
  // Form fields.
  "7.15-1": "form_accessibility",
  "7.18.1-3": "form_accessibility",
  "7.18.4-1": "form_accessibility",
  "7.18.4-2": "form_accessibility",
};

/** Clause-prefix fallbacks for families that are uniform per category.
 *  Ordered longest-first so "7.21.4.1" wins over a would-be "7.2". */
const CLAUSE_CATEGORY: ReadonlyArray<[prefix: string, category: string]> = [
  ["7.4.2", "heading_structure"],
  ["7.4.4", "heading_structure"],
  ["7.5", "table_markup"], // TH Scope / Headers association
  ["7.3", "alt_text"], // figures
  ["7.7", "alt_text"], // formulas — our alt census covers them
];

export function pdfUaCategoryFor(f: PdfUaFailureLike): string | null {
  const ruleId = (f.ruleId ?? "").trim();
  if (!ruleId) return null;
  const exact = RULE_CATEGORY[ruleId];
  if (exact) return exact;
  const clause = ruleId.includes("-") ? ruleId.slice(0, ruleId.lastIndexOf("-")) : ruleId;
  for (const [prefix, category] of CLAUSE_CATEGORY) {
    if (clause === prefix || clause.startsWith(`${prefix}.`)) return category;
  }
  return null;
}

/** The document's OWN failures, grouped by the category each corroborates.
 *  Empty when veraPDF did not run, or ran and flagged nothing we map. */
export function pdfUaFailuresByCategory(
  verdict: { available?: boolean; failures?: PdfUaFailureLike[] } | null | undefined,
): Record<string, PdfUaFailureLike[]> {
  const out: Record<string, PdfUaFailureLike[]> = {};
  if (!verdict?.available || !Array.isArray(verdict.failures)) return out;
  for (const f of verdict.failures) {
    const cat = pdfUaCategoryFor(f);
    if (!cat) continue;
    (out[cat] ??= []).push(f);
  }
  return out;
}
