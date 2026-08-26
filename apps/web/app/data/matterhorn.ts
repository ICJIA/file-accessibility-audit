/**
 * The Matterhorn Protocol checklist rendered on the landing page.
 *
 * The Matterhorn Protocol (PDF Association) is the industry test model for
 * PDF/UA-1 (ISO 14289-1): 31 checkpoints comprising 136 failure conditions,
 * of which 87 are machine-checkable, 47 require human judgment, and 2 have
 * no defined test (23-001, 27-001). It is the model professional checkers —
 * PAC included — are built on, which is why the landing page discloses this
 * tool's coverage checkpoint by checkpoint.
 *
 * COVERAGE VALUES ARE A PUBLIC CLAIM — keep them true to the shipped code:
 *   "engine"         — packages/analyzer checks this substantially on every
 *                      PDF audit (the score-affecting categories and/or the
 *                      conformance gate).
 *   "engine-partial" — the analyzer checks the frequent failure modes; the
 *                      veraPDF pass covers the remaining machine-testable
 *                      conditions.
 *   "verapdf"        — not checked in-house; covered by the veraPDF PDF/UA-1
 *                      pass that runs alongside every PDF audit (and whose
 *                      absence a report now DISCLOSES — see PdfUaVerdict.vue's
 *                      "Did not run" state, v1.91.0).
 *   "human"          — not machine-checkable by any tool (this one, PAC, or
 *                      veraPDF); the report's manual-review card carries it.
 *
 * Statuses reflect the 2026-08-25 completeness audit of packages/analyzer
 * against Matterhorn 1.1, updated as gaps ship. v1.92.0 promoted 17/19
 * (Formula alt + Note /ID censuses) and 20 (OCG /Name + /AS). v1.94.0
 * promoted 10 (the unmapped-glyph census — PUA/replacement characters in
 * the extracted text), 21 (the /Filespec /Desc census), and 30 (the
 * reference-XObject census); 01 and 28 stay engine-partial but gained the
 * partial-tagging text census and the widget/annotation OBJR censuses.
 * When a further gap ships, PROMOTE that checkpoint's coverage here in the
 * same release — matterhornChecklist.test.ts pins the honesty-critical
 * entries.
 */

export type MatterhornCoverage = "engine" | "engine-partial" | "verapdf" | "human";

export interface MatterhornCheckpoint {
  /** Two-digit checkpoint number exactly as the protocol prints it. */
  id: string;
  /** Checkpoint title from Matterhorn Protocol 1.1. */
  name: string;
  coverage: MatterhornCoverage;
  /** One-line plain-language reading of what the checkpoint demands. */
  summary: string;
}

/** Headline figures from Matterhorn Protocol 1.1 (PDF Association). */
export const MATTERHORN_FACTS = {
  checkpoints: 31,
  failureConditions: 136,
  machineCheckable: 87,
  humanJudgment: 47,
  noDefinedTest: 2,
} as const;

export const MATTERHORN_CHECKPOINTS: MatterhornCheckpoint[] = [
  {
    id: "01",
    name: "Real content tagged",
    coverage: "engine-partial",
    summary: "Every piece of real content is in the tag tree; decorations are artifacts.",
  },
  {
    id: "02",
    name: "Role Mapping",
    coverage: "engine-partial",
    summary: "Custom tag names map to standard PDF structure types.",
  },
  {
    id: "03",
    name: "Flicker",
    coverage: "human",
    summary: "Nothing flashes or flickers — a judgment no software can make.",
  },
  {
    id: "04",
    name: "Color and Contrast",
    coverage: "human",
    summary: "Color is never the only carrier of meaning; contrast is sufficient.",
  },
  {
    id: "05",
    name: "Sound",
    coverage: "verapdf",
    summary: "Audio content carries text alternatives.",
  },
  {
    id: "06",
    name: "Metadata",
    coverage: "engine",
    summary: "XMP metadata declares the document title and any PDF/UA claim.",
  },
  {
    id: "07",
    name: "Dictionary",
    coverage: "engine",
    summary: "Viewer preferences show the document title, not the filename.",
  },
  {
    id: "08",
    name: "OCR-generated content",
    coverage: "engine-partial",
    summary: "Scanned pages carry recognized text, not just pictures of words.",
  },
  {
    id: "09",
    name: "Appropriate Tags",
    coverage: "engine-partial",
    summary: "Tags mean what they say — headings are headings, figures are figures.",
  },
  {
    id: "10",
    name: "Character Mappings",
    coverage: "engine-partial",
    summary: "Every glyph maps to real Unicode text a screen reader can speak.",
  },
  {
    id: "11",
    name: "Declared Natural Language",
    coverage: "engine",
    summary: "The document declares its language; foreign passages are marked.",
  },
  {
    id: "12",
    name: "Stretchable Characters",
    coverage: "engine-partial",
    summary: "Glyphs assembled from pieces carry replacement text (ActualText).",
  },
  {
    id: "13",
    name: "Graphics",
    coverage: "engine",
    summary: "Figures carry alternative text; decorative graphics are artifacts.",
  },
  {
    id: "14",
    name: "Headings",
    coverage: "engine",
    summary: "Heading levels are real H1–H6 tags, nested without skips.",
  },
  {
    id: "15",
    name: "Tables",
    coverage: "engine",
    summary: "Tables declare header cells and associate data cells with them.",
  },
  {
    id: "16",
    name: "Lists",
    coverage: "engine",
    summary: "Lists use real list structure (L, LI, LBody).",
  },
  {
    id: "17",
    name: "Mathematical Expressions",
    coverage: "engine-partial",
    summary: "Formulas are tagged and carry a readable alternative.",
  },
  {
    id: "18",
    name: "Page Headers and Footers",
    coverage: "engine-partial",
    summary: "Running headers and footers are artifacts, not repeated content.",
  },
  {
    id: "19",
    name: "Notes and References",
    coverage: "engine-partial",
    summary: "Footnotes and endnotes use Note tags with unique IDs.",
  },
  {
    id: "20",
    name: "Optional Content",
    coverage: "engine",
    summary: "Layer configurations are named and never auto-switch content.",
  },
  {
    id: "21",
    name: "Embedded Files",
    coverage: "engine-partial",
    summary: "Attachments carry filenames and descriptions.",
  },
  {
    id: "22",
    name: "Article Threads",
    coverage: "human",
    summary: "Reading threads, where used, follow a sensible order.",
  },
  {
    id: "23",
    name: "Digital Signatures",
    coverage: "engine-partial",
    summary: "Signature fields are labeled and reachable.",
  },
  {
    id: "24",
    name: "Non-Interactive Forms",
    coverage: "verapdf",
    summary: "Print-and-fill form layouts are marked as such.",
  },
  {
    id: "25",
    name: "XFA",
    coverage: "engine",
    summary: "Dynamic XFA forms — invisible to assistive tech — are flagged.",
  },
  {
    id: "26",
    name: "Security",
    coverage: "engine",
    summary: "Encryption settings permit assistive technology to read the document.",
  },
  {
    id: "27",
    name: "Navigation",
    coverage: "engine-partial",
    summary: "Bookmarks and outlines support moving through long documents.",
  },
  {
    id: "28",
    name: "Annotations",
    coverage: "engine-partial",
    summary: "Links and annotations are tagged so assistive tech can reach them.",
  },
  {
    id: "29",
    name: "Actions",
    coverage: "verapdf",
    summary: "Scripted actions stay accessible.",
  },
  {
    id: "30",
    name: "XObjects",
    coverage: "engine-partial",
    summary: "No prohibited reference XObjects.",
  },
  {
    id: "31",
    name: "Fonts",
    coverage: "engine",
    summary: "Fonts are embedded so text renders and extracts reliably.",
  },
];
