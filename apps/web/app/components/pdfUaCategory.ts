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
// Matching is on keywords in the lowercased `description`, NOT on
// `clause`/`ruleId` numbers — the same ISO clause carries different concrete
// rules across veraPDF versions while the English description stays stable.
// (Same doctrine as pdfUaFixHint.ts; order is significant for the same
// reason — Scope text also names TH, so it must be tested before the generic
// table rule.)
//
// DELIBERATELY CONSERVATIVE: a failure that does not map cleanly onto one of
// our categories returns null and is shown only in veraPDF's own panel. An
// over-eager mapping would put words in the referee's mouth, which is the one
// thing this feature must never do.

export interface PdfUaFailureLike {
  ruleId?: string;
  clause?: string;
  description?: string;
  count?: number;
}

export function pdfUaCategoryFor(f: PdfUaFailureLike): string | null {
  const d = (f.description ?? "").toLowerCase();

  // Scope / header association — must precede the generic table rule, whose
  // TH match this text would otherwise satisfy.
  if (d.includes("scope") || (d.includes("headers") && d.includes("table"))) {
    return "table_markup";
  }

  // Table structure (TR/TH/TD nesting, row grouping).
  if (
    d.includes("tr element") ||
    d.includes("th and td") ||
    /\btr\b/.test(d) ||
    /\btd\b/.test(d) ||
    d.includes("table")
  ) {
    return "table_markup";
  }

  // Figures and their text alternatives. Checked before the link rule
  // because link failures also mention "alternate description".
  if (d.includes("figure") || (d.includes("alt") && !d.includes("link"))) {
    return "alt_text";
  }

  // Links: veraPDF asks for a Contents entry describing the destination.
  if (d.includes("link")) return "link_quality";

  // Headings: numbering, nesting, and the H1..H6 ladder.
  if (d.includes("heading") || /\bh[1-6]\b/.test(d)) return "heading_structure";

  // Lists.
  if (d.includes("list") || d.includes("lbody") || d.includes("lbl")) return "reading_order";

  // Natural language and document title — the two things a reader hears first.
  if (d.includes("lang") || d.includes("natural language") || d.includes("title")) {
    return "title_language";
  }

  // Form fields.
  if (d.includes("widget") || d.includes("form field") || d.includes("acroform")) {
    return "form_accessibility";
  }

  // Real content vs artifacts, and text that never made it into the tag tree.
  if (
    d.includes("artifact") ||
    d.includes("real content") ||
    d.includes("tagged") ||
    d.includes("font")
  ) {
    return "text_extractability";
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
