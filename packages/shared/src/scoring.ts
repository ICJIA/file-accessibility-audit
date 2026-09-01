/**
 * Scoring constants — moved verbatim from the root audit.config.ts so the
 * web UI can import them directly (the config file itself pulls in Node-side
 * sections like DEPLOY that must never reach the browser bundle).
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
// A 100 IS NOT ALWAYS SILENT (v1.149.0). Some categories are never scored at
// all — bookmarks is the clearest: no WCAG 2.1 criterion requires them inside
// a single document, so a 41-page report with none still scores 100. Its card
// then read "No issues found" directly above its own finding saying the
// document has 41 pages and no bookmarks, and beside a best-practices row
// calling them worth doing. The number was right and the label overstated it,
// which is this comment's own argument used against it. `applyAdvisorySeverity`
// relabels exactly that case "No scored issues" — nothing was counted, and
// something was still reported.
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

/**
 * WCAG "Understanding" page slugs, so every criterion the product mentions
 * can link to the exact, authoritative W3C explanation of the rule.
 *
 * Moved here from the analyzer's conformance module (v1.74.0) so the web
 * app's printable plan can build the same links without a second copy that
 * could drift. Slugs are identical across WCAG 2.1 and 2.2 for
 * carried-forward criteria; the new 2.2 criteria sit at the bottom.
 */
export const WCAG_UNDERSTANDING_SLUGS: Record<string, string> = {
  "1.1.1": "non-text-content",
  "1.2.2": "captions-prerecorded",
  "1.3.1": "info-and-relationships",
  "1.3.2": "meaningful-sequence",
  "1.4.3": "contrast-minimum",
  "2.4.2": "page-titled",
  "2.4.4": "link-purpose-in-context",
  "2.4.5": "multiple-ways",
  "2.4.6": "headings-and-labels",
  "3.1.1": "language-of-page",
  "3.1.2": "language-of-parts",
  "1.3.3": "sensory-characteristics",
  "1.4.1": "use-of-color",
  "1.4.5": "images-of-text",
  "1.4.11": "non-text-contrast",
  "3.3.2": "labels-or-instructions",
  "4.1.2": "name-role-value",
  // New in WCAG 2.2 (form-relevant):
  "2.5.8": "target-size-minimum",
  "3.3.7": "redundant-entry",
  "3.3.8": "accessible-authentication-minimum",
};

/** Slug for a criterion number, or null when unknown — callers fall back to
 *  the version's quick-reference page, exactly as the conformance gate does. */
export function wcagSlugFor(sc: string): string | null {
  return WCAG_UNDERSTANDING_SLUGS[sc] ?? null;
}

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
  // bookmarks carries NO entry: no WCAG 2.1 criterion requires bookmarks in
  // a single document (2.4.5 Multiple Ways is scoped to a SET of documents,
  // per WCAG2ICT), and the category's own finding says so — a 2.4.5 chip
  // rendered beside that sentence contradicted it on one card (2026-09-01).
  table_markup: [{ sc: "1.3.1", name: "Info and Relationships", level: "A" }],
  // 4.1.2 added 2026-08-31: a link with NO text has no accessible name, which
  // is the one link-text defect this tool scores. 2.4.4 stays because the
  // category still REPORTS weak-but-present text (never scored — context can
  // supply a link's purpose, and judging text alone is 2.4.9, Level AAA).
  link_quality: [
    { sc: "2.4.4", name: "Link Purpose (In Context)", level: "A" },
    { sc: "4.1.2", name: "Name, Role, Value", level: "A" },
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
  // Same green: nothing was counted against the document in either case.
  "No scored issues": "#22c55e",
  Minor: "#3b82f6",
  Moderate: "#eab308",
  Critical: "#ef4444",
};

// ---------------------------------------------------------------------------
// LIGHT-MODE PALETTE
// ---------------------------------------------------------------------------
// The colours above are tuned for the dark UI, where they run 5.3–10.3:1
// against #0a0a0a. On the light background they are 1.9–3.8:1 — every one of
// them below the 4.5:1 WCAG AA floor for normal text, in a tool whose entire
// purpose is catching exactly that. Measured 2026-08-07; the worst was
// Moderate yellow at 1.92:1.
//
// One palette cannot serve both: a colour dark enough to pass on white is too
// dark to pass on near-black. So there are two, and CSS picks between them —
// see --grade-* / --sev-* in apps/web/app/assets/css/main.css, which is the
// only place either palette is consumed by the UI.
//
// Mostly the -700 shades of the same hues, clearing 4.5:1 on ALL THREE light
// surfaces (#f9fafb body, #ffffff cards, #f3f4f6 alt) while staying
// recognisably the same colour. The -800 shades score higher but read as
// muddy, and a severity palette nobody can tell apart is its own
// accessibility problem.
//
// Yellow is the exception and is one step darker than the rest: yellow-700
// (#a16207) clears white and the body surface but lands at 4.47:1 on
// #f3f4f6 — caught by test, not by eye, which is why the test measures every
// surface rather than the one that came to mind.
//
// EXPORTS DO NOT USE THESE. A downloaded HTML report carries its own dark
// styling and no CSS variables, so exportFormats/html.ts, the CLI and the
// /status renderer all keep using the hex values above.

export const GRADE_COLORS_LIGHT: Record<string, string> = {
  A: "#15803d",
  B: "#0f766e",
  C: "#946005",
  D: "#c2410c",
  F: "#b91c1c",
};

export const SEVERITY_COLORS_LIGHT: Record<string, string> = {
  Pass: "#15803d",
  "No issues found": "#15803d",
  "No scored issues": "#15803d",
  Minor: "#1d4ed8",
  Moderate: "#946005",
  Critical: "#b91c1c",
};

/** UI theme the colour is being rendered into. */
export type ColorScheme = "dark" | "light";

/**
 * A grade's colour for the given theme.
 *
 * Returns a HEX string, deliberately. The obvious alternative — emitting
 * `var(--grade-a)` and letting CSS pick — was built and rejected: these
 * colours are consumed almost entirely through Vue inline `:style` bindings,
 * and happy-dom drops any inline style containing `var()` or `color-mix()`
 * ENTIRELY, so every existing test asserting a rendered colour would have
 * gone blind at the moment the values started varying. Deriving the hex in JS
 * keeps the tests real and the alpha maths below possible.
 */
export function gradeColorFor(grade: string | null | undefined, scheme: ColorScheme): string {
  if (!grade) return "#666";
  const table = scheme === "light" ? GRADE_COLORS_LIGHT : GRADE_COLORS;
  return table[grade] ?? GRADE_COLORS[grade] ?? "#666";
}

export function severityColorFor(severity: string | null | undefined, scheme: ColorScheme): string {
  if (!severity) return "#999";
  const table = scheme === "light" ? SEVERITY_COLORS_LIGHT : SEVERITY_COLORS;
  return table[severity] ?? SEVERITY_COLORS[severity] ?? "#999";
}

/**
 * A colour at partial opacity, for tinted backgrounds, borders and glows.
 *
 * Replaces hex-alpha suffixes concatenated by hand (`color + "15"`), which
 * were duplicated across 13 sites in 8 files with no shared definition of
 * what "15" meant — and which silently produce nonsense for any colour that
 * is not a 6-digit hex.
 *
 * Percent in, 8-digit hex out, so the result stays a plain colour literal
 * that both browsers and the test DOM handle.
 */
export function withAlpha(color: string, percent: number): string {
  const pct = Math.max(0, Math.min(100, percent));
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return (
    color +
    Math.round((pct / 100) * 255)
      .toString(16)
      .padStart(2, "0")
  );
}

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

/** Lines the analyzer marks as reported-but-never-counted.
 *
 *  ANCHORED TO THE PREFIX IN v1.149.0, AND THAT WAS TOO NARROW. The scorers
 *  say this five ways, and two of them do not start the line:
 *    "Advisory — not scored: …"            "PDF/UA only — not scored: …"
 *    "Advisory — not scored against you: …"
 *    "--- Raw URL Link Text (advisory — not penalized) ---"
 *    "… This satisfies WCAG 2.4.4 … and is not scored against you …"
 *  A 23-page report with ten raw-URL links therefore still read "No issues
 *  found" on Link Quality. Matching the PHRASE rather than the prefix covers
 *  every wording the scorers actually use; the phrase itself is specific
 *  enough that no scored finding says it. */
const NOT_SCORED_LINE = /\bnot (scored|penali[sz]ed)\b/i;

export function hasUnscoredAdvisory(findings: readonly string[] | undefined): boolean {
  return (findings ?? []).some((f) => NOT_SCORED_LINE.test(String(f).trim()));
}

/** "No issues found" → "No scored issues" for a perfect category that still
 *  reported something. Runs as a post-pass over finished categories so it
 *  catches the severities the scorers hardcode as well as the computed ones. */
export function applyAdvisorySeverity(
  categories: Array<{ score?: number | null; severity?: string | null; findings?: string[] }>,
): void {
  for (const c of categories) {
    if (c.score === 100 && c.severity === "No issues found" && hasUnscoredAdvisory(c.findings)) {
      c.severity = "No scored issues";
    }
  }
}

export function severityColor(severity: string | null | undefined): string {
  return (severity && SEVERITY_COLORS[severity]) || "#999";
}

// ---------------------------------------------------------------------------
// SEVERITY SCORE CAP
// ---------------------------------------------------------------------------
// A document's score may never outrank its worst unresolved finding.
//
// WHY THIS EXISTS. The overall score is a weighted average over only the
// categories that produced a score; anything unassessable is dropped and the
// remaining weights renormalized (aggregateScore, packages/analyzer). Two
// consequences made the tool contradict itself in the field, both confirmed
// against a 31-document corpus on 2026-08-07:
//
//   1. A single failure DOMINATES a sparse document and is DILUTED in a rich
//      one. Two Word files with the identical defect — no document title,
//      language present, so "Title & Language" scored 50/Moderate in both —
//      graded B (87) and C (71), because the first had 7 of 10 categories to
//      average against and the second only 3. Same fault, different letter.
//
//   2. Four perfect categories could outvote one catastrophic one. Two PDFs
//      missing BOTH title and language (0/Critical, two WCAG failures each)
//      graded B — better than the Word file above, which had strictly the
//      milder defect. Corpus-wide, 4 documents held an A while carrying an
//      unresolved Moderate finding, and 2 held a B while carrying a Critical.
//
// WHY THE SCORE AND NOT THE LETTER. v1.58.0 capped the LETTER instead, which
// fixed both of the above and broke something more basic: it severed the
// score from the grade, so a report read "D" above "80/100". Readers apply
// the school-grading reflex — 80 is a B, why does this say D? — and reported
// it twice, in those words, as more confusing than the problem being fixed.
// A figure out of 100 beside a letter grade is READ as the grade no matter
// what label it carries.
//
// Capping the score instead keeps GRADE_THRESHOLDS the single, published,
// consistent scale (90 = A, 80 = B, 70 = C, 60 = D, below that F): the letter
// is still derived from the number, exactly as before, so the two can never
// disagree. What changes is the number — a document carrying a Critical
// cannot climb past the top of the D band however well the rest of it scores.
//
// The ceilings are DERIVED from GRADE_THRESHOLDS rather than written out, so
// moving a band boundary moves the caps with it and the two cannot drift.
//
// This is a PURE function of the stored category severities, which is what
// lets already-shared reports self-correct at render time rather than needing
// a database migration — see regradeStoredReport's callers.
//
// SAFE TO CHANGE: Carefully. Raising a cap re-scores every document in the
// corpus and every historical shared report at once. Keep it sorted
// worst-first.
// ---------------------------------------------------------------------------

/** The best grade a document carrying each severity may reach. */
export const SEVERITY_GRADE_CAPS = [
  { severity: "Critical", maxGrade: "D" as const },
  { severity: "Moderate", maxGrade: "C" as const },
  { severity: "Minor", maxGrade: "B" as const },
] as const;

/** Highest score that still lands in `grade`, i.e. one below the next band up.
 *  Derived so a change to GRADE_THRESHOLDS carries automatically. */
export function maxScoreForGrade(grade: string): number | null {
  const idx = GRADE_THRESHOLDS.findIndex((t) => t.grade === grade);
  if (idx === -1) return null;
  // GRADE_THRESHOLDS is sorted best-first, so the band ABOVE is the previous
  // entry. The top band has no ceiling.
  const above = GRADE_THRESHOLDS[idx - 1];
  return above ? above.min - 1 : 100;
}

interface SeverityBearing {
  score?: number | null;
  severity?: string | null;
}

/** The worst severity among categories that were actually scored, or null.
 *
 *  Unassessed categories (`score === null`) are skipped: "no images were
 *  found" is not a finding, and letting it cap a score would punish a
 *  document for what it does not contain. */
export function worstSeverity(
  categories: ReadonlyArray<SeverityBearing> | null | undefined,
): string | null {
  if (!Array.isArray(categories)) return null;
  for (const { severity } of SEVERITY_GRADE_CAPS) {
    if (categories.some((c) => c && c.score !== null && c.severity === severity)) return severity;
  }
  return null;
}

/**
 * The score, lowered to the ceiling of the band its worst finding allows.
 * Never RAISES a score — a document already below the ceiling keeps its own
 * lower number.
 *
 * Idempotent by construction, so it is safe to apply at the source AND again
 * at render on a stored report that was already capped.
 */
export function capScoreBySeverity(
  score: number | null | undefined,
  categories: ReadonlyArray<SeverityBearing> | null | undefined,
): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return score ?? null;
  const worst = worstSeverity(categories);
  if (worst === null) return score;
  const cap = SEVERITY_GRADE_CAPS.find((c) => c.severity === worst)?.maxGrade;
  if (!cap) return score;
  const ceiling = maxScoreForGrade(cap);
  if (ceiling === null) return score;
  return Math.min(score, ceiling);
}

/**
 * The ceiling a document's worst finding imposes — reported whenever the score
 * is sitting AT it, which is what "the cap is holding this back" means.
 *
 * Deliberately not a raw-vs-capped comparison: every consumer (both report
 * views, exports, stored reports) only ever has the ALREADY-CAPPED score, so
 * a function needing the raw average could never fire where it matters. A
 * score at the ceiling is the observable, and it is the honest claim either
 * way — a document whose average happens to land exactly on 79 with a
 * Moderate open still cannot climb past it until that finding is fixed.
 *
 * Returns null when the score is below the ceiling (nothing is being held
 * back) or when there is no finding to impose one.
 */
export function scoreCapReason(
  score: number | null | undefined,
  categories: ReadonlyArray<SeverityBearing> | null | undefined,
): { cappedScore: number; severity: string; cappedGrade: string } | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const worst = worstSeverity(categories);
  if (worst === null) return null;
  const cap = SEVERITY_GRADE_CAPS.find((c) => c.severity === worst)?.maxGrade;
  if (!cap) return null;
  const ceiling = maxScoreForGrade(cap);
  if (ceiling === null || score < ceiling) return null;
  return { cappedScore: ceiling, severity: worst, cappedGrade: cap };
}
