/**
 * Scoring constants — moved verbatim from the root audit.config.ts so the
 * web UI can import them directly (the config file itself pulls in Node-side
 * sections like EMAIL/AUTH/DEPLOY that must never reach the browser bundle).
 * audit.config.ts re-exports everything here, so `#config` consumers in the
 * API and CLI are unaffected. Edit values HERE.
 */

export const SCORING_PROFILES = {
  strict: {
    label: "Strict semantic score (WCAG + IITAA §E205.4)",
    // Origin tag surfaced in JSON exports so downstream consumers can tell
    // which profile produced a given score.
    origin: "wcag.iitaa.strict",
    originLabel: "WCAG + IITAA §E205.4",
    description:
      "WCAG-based scoring methodology. Anchored to WCAG 2.1 Level AA and Illinois IITAA §E205.4 for non-web documents. Nine categories, no PDF/UA category. Requires explicit heading and table semantics rather than visual or bookmark-only cues.",
    weights: {
      /** Is the PDF text-based (not scanned) and tagged? Highest weight because
       *  a scanned PDF is fundamentally inaccessible — nothing else matters. */
      text_extractability: 0.2,

      /** Does the PDF have a meaningful title and a declared language?
       *  Screen readers announce both on document open. */
      title_language: 0.15,

      /** Are H1–H6 heading tags present with a logical hierarchy?
       *  Headings are the primary navigation mechanism for screen reader users. */
      heading_structure: 0.15,

      /** Do images have alternative text descriptions?
       *  Required by WCAG 1.1.1 for all non-decorative images. */
      alt_text: 0.15,

      /** Does the document have bookmarks/outlines for navigation?
       *  Maps to WCAG 2.4.5 Multiple Ways (Level AA) — one of several ways to
       *  navigate; a clear heading structure is a partial alternative, so it is
       *  weighted below the Level-A categories. Only assessed for documents
       *  with 10+ pages (see ANALYSIS.BOOKMARKS_PAGE_THRESHOLD). */
      bookmarks: 0.05,

      /** Are data tables marked up with /Table, /TH, and /TD tags?
       *  Without these, screen readers can't convey table structure. */
      table_markup: 0.1,

      /** Are hyperlinks descriptive (not raw URLs or vague phrases)?
       *  "Click here", "read more", and raw URLs are unhelpful to screen
       *  reader users. */
      link_quality: 0.05,

      /** Strict mode does not use PDF/UA/Matterhorn conformance as the primary
       *  document-level score. The category is surfaced as N/A guidance only. */
      pdf_ua_compliance: 0,

      /** PDF color-contrast analysis is not implemented yet. The category is
       *  surfaced as "Not Assessed" (distinct from "Not Applicable") so the
       *  report never implies contrast was checked. */
      color_contrast: 0,

      /** Do form fields have accessible labels (/TU tooltip)?
       *  Unlabeled form fields are unusable with assistive technology. */
      form_accessibility: 0.05,

      /** Does the structure tree define a correct reading order?
       *  Maps to WCAG 1.3.2 Meaningful Sequence (Level A) — out-of-order content
       *  makes a document unusable, so it is weighted as a Level-A essential.
       *  Distinct from text_extractability: this checks ORDER quality, not just
       *  whether the StructTree exists. */
      reading_order: 0.1,
    },
  },

  remediation: {
    label: "Practical readiness score (WCAG + PDF/UA)",
    // WCAG-based with an added PDF/UA Compliance Signals category.
    // Weights and partial-credit floors below are judgment calls built
    // into this tool, not a vendor standard.
    origin: "wcag.pdfua.practical",
    originLabel: "WCAG + PDF/UA signals",
    description:
      "WCAG-based scoring methodology with different category weights than Strict and an added PDF/UA Compliance Signals category (MarkInfo, tab order, PDF/UA identifiers, list/table legality). Applies partial-credit floors on heading and table structure. PDF/UA is referenced in IITAA §504.2.2 for authoring-tool export capability, while §E205.4 frames final-document accessibility through WCAG 2.1. Diagnostic only — not a WCAG, ADA, ITTAA, PDF/UA, or Matterhorn conformance claim.",
    weights: {
      text_extractability: 0.175,
      title_language: 0.13,
      heading_structure: 0.13,
      alt_text: 0.13,
      pdf_ua_compliance: 0.095,
      bookmarks: 0.085,
      table_markup: 0.085,
      color_contrast: 0.045,
      link_quality: 0.045,
      reading_order: 0.04,
      form_accessibility: 0.04,
    },
  },
} as const;

export const SCORING_WEIGHTS = SCORING_PROFILES.strict.weights;

// ---------------------------------------------------------------------------
// GRADE THRESHOLDS
// ---------------------------------------------------------------------------
// Map an overall score (0–100) to a letter grade, display color, and label.
// Array must be sorted descending by `min`. The first matching entry wins.
//
// SAFE TO CHANGE:
// - `min` thresholds: Yes — e.g., making A require 95+ instead of 90+.
// - `color`: Yes — these are Tailwind-compatible hex colors used in the UI.
// - `label`: Yes — these appear in the ScoreCard summary text.
// - `grade` letters: No — changing "A" to "S" would break stored audit data
//   and shared reports that reference grade letters. Don't do this.
// ---------------------------------------------------------------------------

export const GRADE_THRESHOLDS = [
  { min: 90, grade: "A" as const, color: "#22c55e", label: "Excellent" },
  { min: 80, grade: "B" as const, color: "#14b8a6", label: "Good" },
  {
    min: 70,
    grade: "C" as const,
    color: "#eab308",
    label: "Needs Improvement",
  },
  { min: 60, grade: "D" as const, color: "#f97316", label: "Poor" },
  { min: 0, grade: "F" as const, color: "#ef4444", label: "Failing" },
] as const;

// ---------------------------------------------------------------------------
// SEVERITY THRESHOLDS
// ---------------------------------------------------------------------------
// Map a per-category score (0–100) to a severity label. Used in the category
// breakdown UI and API response. Array must be sorted descending by `min`.
//
// "No issues found" is intentionally reserved for a perfect 100. A category
// scoring 90–99 still has at least one automated finding, so labelling it
// issue-free would be inaccurate; 70–99 is "Minor". The document-level WCAG
// verdict is carried by the separate conformance gate, never by this label.
//
// SAFE TO CHANGE:
// - `min` thresholds: Yes — adjusts when a category flips between severities.
// - `severity` labels: Carefully — these appear in API responses and may be
//   consumed by external scripts or CSV exports. Change only if you also
//   update the frontend rendering.
// ---------------------------------------------------------------------------

export const SEVERITY_THRESHOLDS = [
  { min: 100, severity: "No issues found" as const },
  { min: 70, severity: "Minor" as const },
  { min: 40, severity: "Moderate" as const },
  { min: 0, severity: "Critical" as const },
] as const;

// ---------------------------------------------------------------------------
// WCAG SUCCESS-CRITERIA MAP (operative version set by WCAG.VERSION in
// audit.config.ts)
// ---------------------------------------------------------------------------
// Explicit, published mapping of each scoring category to the WCAG 2.1
// success criteria it evaluates, with conformance level (A or AA). This is
// the auditable "what standard does each category implement" reference: it
// is surfaced in the methodology UI and underpins the conformance gate.
//
// IITAA 2.1 and the 2024 ADA Title II rule both adopt WCAG 2.1 Level AA. The
// criteria below are all carried forward UNCHANGED into WCAG 2.2 (their numbers
// and slugs are identical), so this map is correct under both versions; the new
// 2.2 criteria (see WCAG_22_NEW_AA) are manual/interactive and not mapped here.
//
// SAFE TO CHANGE: Yes — but keep it accurate; a wrong citation is a
// credibility problem. Keys MUST match the SCORING category IDs above.
// ---------------------------------------------------------------------------

export const WCAG_CATEGORY_MAP: Record<
  string,
  ReadonlyArray<{ sc: string; name: string; level: "A" | "AA" }>
> = {
  text_extractability: [
    { sc: "1.1.1", name: "Non-text Content", level: "A" },
    { sc: "1.3.1", name: "Info and Relationships", level: "A" },
  ],
  title_language: [
    { sc: "2.4.2", name: "Page Titled", level: "A" },
    { sc: "3.1.1", name: "Language of Page", level: "A" },
  ],
  heading_structure: [
    { sc: "1.3.1", name: "Info and Relationships", level: "A" },
    { sc: "2.4.6", name: "Headings and Labels", level: "AA" },
  ],
  alt_text: [{ sc: "1.1.1", name: "Non-text Content", level: "A" }],
  bookmarks: [{ sc: "2.4.5", name: "Multiple Ways", level: "AA" }],
  table_markup: [{ sc: "1.3.1", name: "Info and Relationships", level: "A" }],
  link_quality: [
    { sc: "2.4.4", name: "Link Purpose (In Context)", level: "A" },
  ],
  reading_order: [{ sc: "1.3.2", name: "Meaningful Sequence", level: "A" }],
  form_accessibility: [
    { sc: "1.3.1", name: "Info and Relationships", level: "A" },
    { sc: "3.3.2", name: "Labels or Instructions", level: "A" },
    { sc: "4.1.2", name: "Name, Role, Value", level: "A" },
  ],
  color_contrast: [{ sc: "1.4.3", name: "Contrast (Minimum)", level: "AA" }],
  // DOCX-specific category (real lists vs manually-typed bullets).
  list_structure: [{ sc: "1.3.1", name: "Info and Relationships", level: "A" }],
  slide_titles: [
    { sc: "1.3.1", name: "Info and Relationships", level: "A" },
    { sc: "2.4.6", name: "Headings and Labels", level: "AA" },
  ],
  sheet_names: [{ sc: "2.4.6", name: "Headings and Labels", level: "AA" }],
} as const;

// ---------------------------------------------------------------------------
// DERIVED HELPERS (single home for grade/severity → label/color logic that
// was previously hand-copied across the web app)
// ---------------------------------------------------------------------------

export type ScoringMode = keyof typeof SCORING_PROFILES;

/** Grade letter → hex color, derived from GRADE_THRESHOLDS. */
export const GRADE_COLORS: Record<string, string> = Object.fromEntries(
  GRADE_THRESHOLDS.map((t) => [t.grade, t.color]),
);

/**
 * Severity label → hex color. Includes both the API label for a perfect
 * category ("No issues found") and the UI legend label ("Pass") — the two
 * render identically.
 */
export const SEVERITY_COLORS: Record<string, string> = {
  Pass: "#22c55e",
  "No issues found": "#22c55e",
  Minor: "#3b82f6",
  Moderate: "#eab308",
  Critical: "#ef4444",
};

export function gradeForScore(score: number | null): string | null {
  if (score === null) return null;
  for (const t of GRADE_THRESHOLDS) {
    if (score >= t.min) return t.grade;
  }
  return "F";
}

export function severityForScore(score: number | null): string | null {
  if (score === null) return null;
  for (const t of SEVERITY_THRESHOLDS) {
    if (score >= t.min) return t.severity;
  }
  return "Critical";
}

export function gradeColor(grade: string | null | undefined): string {
  return (grade && GRADE_COLORS[grade]) || "#666";
}

export function severityColor(severity: string | null | undefined): string {
  return (severity && SEVERITY_COLORS[severity]) || "#999";
}
