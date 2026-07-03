/**
 * Single source of truth for the publist category id list + human labels,
 * shared by cache.ts (DB columns), csv.ts (CSV headers/rows), and html.ts
 * (HTML report headers + per-row category data).
 *
 * RB3-1 [IMPORTANT, pre-merge re-audit]: before this file existed, cache.ts
 * and csv.ts each kept their OWN hand-synced copy of CATEGORY_IDS. Neither
 * copy was updated when the pptx/xlsx checkers landed, so `slide_titles`
 * (PPTX) and `sheet_names` (XLSX) — each the HIGHEST-weighted category for
 * its format — were silently dropped from the cache DB, the CSV, and the
 * HTML report. Consolidating into one exported constant (imported by both
 * cache.ts and csv.ts/html.ts) means a future format's categories only need
 * to be added ONCE.
 *
 * Ids/labels mirror the format-specific category builders in
 * apps/api/src/services/scorer.ts (buildCategories / buildDocxCategories /
 * buildPptxCategories / buildXlsxCategories).
 */
export const CATEGORY_IDS = [
  "text_extractability",
  "title_language",
  "heading_structure",
  "alt_text",
  "pdf_ua_compliance",
  "bookmarks",
  "table_markup",
  "color_contrast",
  "link_quality",
  "reading_order",
  "form_accessibility",
  "supplementary",
  "slide_titles",
  "sheet_names",
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  text_extractability: "Text Extractability",
  title_language: "Title & Language",
  heading_structure: "Heading Structure",
  alt_text: "Alt Text",
  pdf_ua_compliance: "PDF/UA Compliance",
  bookmarks: "Bookmarks",
  table_markup: "Table Markup",
  color_contrast: "Color Contrast",
  link_quality: "Link Quality",
  reading_order: "Reading Order",
  form_accessibility: "Form Accessibility",
  supplementary: "Supplementary",
  slide_titles: "Slide Titles",
  sheet_names: "Sheet Names",
};
