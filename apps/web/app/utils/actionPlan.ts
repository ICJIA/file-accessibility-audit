/**
 * Action Plan mapper — the heart of the Visual report view.
 *
 * Turns the stored `categories[]` of any report (including reports shared
 * years ago — they all carry id/label/severity/findings) into an ordered,
 * plain-language to-do list for non-technical document authors. Wording
 * lives here, in the web app, so old stored reports get the new UI with no
 * analyzer/API change (spec: 2026-08-06-report-visual-redesign-design.md).
 */
import { WCAG_CATEGORY_MAP } from "@file-audit/shared";
import { firstActionableFinding, partitionCardFindings } from "~/utils/findings";
import { tallySeverity } from "~/utils/severityTally";

export type PlanSeverity = "Critical" | "Moderate" | "Minor";
export type PlanFileType = "pdf" | "docx" | "pptx" | "xlsx";

export interface FixRoute {
  /** "source" = fix the original document (Word/PowerPoint/Excel); "acrobat" = fix the PDF directly. */
  tool: "source" | "acrobat";
  label: string;
  steps: string[];
}

export interface PlanStep {
  rank: number;
  categoryId: string;
  title: string;
  why: string;
  severity: PlanSeverity;
  wcagRefs: { sc: string; name: string }[];
  routes: FixRoute[];
  /** Anchor of the category's evidence card inside the technical report. */
  detailAnchor: string;
}

interface PlanCopyEntry {
  title: string;
  why: string;
  /** Steps for fixing the ORIGINAL document, keyed by uploaded file type.
   *  For "pdf" these describe the source app the PDF usually came from. */
  source: Partial<Record<PlanFileType, string[]>>;
  /** Steps for a PDF whose stored Creator metadata says Adobe InDesign made
   *  it (annual reports usually do) — `source.pdf`'s Word menus don't exist
   *  there. Only consulted when the report's creator matches; required
   *  whenever `source.pdf` exists (pinned by the completeness test). */
  sourceInDesign?: string[];
  /** Dictionary default when the report carries no per-document Acrobat block. */
  acrobat?: string[];
  /** True when `acrobat` has no real PDF-only fix — the steps just explain
   *  that this one has to go back to the source document. The route still
   *  renders (so a reader isn't left silently short a fix), but under
   *  SOURCE_ONLY_LABEL instead of ACROBAT_LABEL so it reads as a straight
   *  answer instead of a dead-end redirect. */
  acrobatIsSourceOnly?: boolean;
  /** Lines PREPENDED to the Acrobat route even when the report carries its
   *  own per-document Acrobat block.
   *
   *  Normally the per-document block wins outright, because it describes what
   *  the analyzer actually saw. That rule breaks for a defect whose per-
   *  document advice is wrong: a document whose words were flattened into
   *  pictures gets the stock "Add alternate text — Acrobat detects all
   *  figures and walks through them", which is precisely what the step is
   *  telling the author NOT to do. Prepending rather than replacing keeps the
   *  block's still-valid parts (the real photo does need a description, the
   *  decorative one does need marking) while making sure the caveat is read
   *  first. */
  acrobatLead?: string[];
}

const SOURCE_LABEL_PDF = "Easiest — fix the source document, then re-export";
const SOURCE_LABEL: Record<PlanFileType, string> = {
  pdf: SOURCE_LABEL_PDF,
  docx: "Fix it in Word",
  pptx: "Fix it in PowerPoint",
  xlsx: "Fix it in Excel",
};
/** Replaces SOURCE_LABEL.pdf when the report's Creator metadata says the PDF
 *  came from InDesign — the label names the app so the reader knows why these
 *  steps differ from a colleague's Word-centric card. */
const SOURCE_LABEL_INDESIGN = "Easiest — fix the InDesign file, then re-export";
const ACROBAT_LABEL = "No source file? Fix the PDF in Acrobat Pro";
/** Swapped in for ACROBAT_LABEL when a category has no PDF-only remedy — the
 *  dictionary's "acrobat" steps just explain that this one has to go back to
 *  the source document. Labeling that route "Fix the PDF in Acrobat" would
 *  redirect a reader who just told us they have no source file straight back
 *  to needing one. Set via the matching PLAN_COPY entry's
 *  `acrobatIsSourceOnly` flag. */
const SOURCE_ONLY_LABEL = "Only fixable in the source document";

/** Exported for the dictionary-completeness test. */
export const PLAN_COPY: Record<string, PlanCopyEntry> = {
  text_extractability: {
    title: "Make the text readable by screen readers",
    why: "Screen readers can only read real text — right now some or all of this document is a picture of text.",
    source: {
      pdf: [
        "Open the original Word (or Google Docs) file",
        'In Word: File → Save As → PDF → Options → check "Document structure tags for accessibility" (the hidden labels that tell a screen reader what\'s a heading, a list, a table), then save',
      ],
    },
    sourceInDesign: [
      "Open the original InDesign file and make sure the text is live, selectable text — not outlined letters or a placed image of a page",
      'File → Export → Adobe PDF (Print) → General tab → check "Create Tagged PDF" (the hidden labels that tell a screen reader what\'s a heading, a list, a table), then export',
    ],
    acrobat: [
      "All tools → Scan & OCR → Recognize Text → In this file (runs OCR, which turns a picture of text into real, readable text; classic UI: Tools → Scan & OCR)",
      "Then: All tools → Prepare for accessibility → Automatically tag PDF (classic UI: Tools → Accessibility → Autotag Document)",
    ],
  },
  title_language: {
    title: "Give the document a title and set its language",
    why: "Without these, screen readers announce the raw filename and guess the wrong language.",
    source: {
      pdf: ["In Word: File → Info → set Title", "Re-export the PDF (File → Save As → PDF)"],
      docx: ["File → Info → set Title", "Review → Language → Set Proofing Language"],
      pptx: ["File → Info → set Title", "Review → Language → Set Proofing Language"],
      xlsx: ["File → Info → set Title", "Review → Language → Set Proofing Language"],
    },
    sourceInDesign: [
      "In InDesign: File → File Info → enter a descriptive Document Title",
      'When exporting (File → Export → Adobe PDF (Print)): on the Advanced tab, set the document\'s Language and set Display Title to "Document Title"',
    ],
    acrobat: [
      "Open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties)",
      "Description tab → enter a descriptive Title",
      "Advanced tab → Reading Options → set the Language dropdown",
      "Initial View tab → set Show: Document Title",
    ],
  },
  heading_structure: {
    title: "Use real heading styles so readers can navigate",
    why: "Screen-reader users jump between headings; text that is merely bold or large is invisible to that navigation.",
    source: {
      pdf: [
        "In Word, apply Heading 1 / Heading 2 / Heading 3 styles from the Styles gallery (don't just bold the text)",
        "Keep levels in order — don't skip from Heading 1 to Heading 3",
        "Re-export the PDF with structure tags",
      ],
      docx: [
        "Apply Heading 1 / Heading 2 / Heading 3 styles from the Styles gallery (don't just bold the text)",
        "Keep levels in order — don't skip from Heading 1 to Heading 3",
      ],
    },
    sourceInDesign: [
      "Map each heading paragraph style to a real heading tag: Paragraph Styles panel menu → Edit All Export Tags → Show: PDF → set the style to H1, H2, H3…",
      "Keep levels in order — don't skip from H1 to H3",
      'Re-export with "Create Tagged PDF" checked (File → Export → Adobe PDF (Print) → General tab)',
    ],
    acrobat: [
      "Open the Tags panel (☰ Menu on Windows or View menu on Mac → Show/Hide → Side panels → Accessibility tags; classic UI: View → Show/Hide → Navigation Panes → Tags)",
      "Change each heading's tag to the matching level (H1, H2, H3…) so the visual hierarchy is in the tags",
    ],
  },
  alt_text: {
    title: "Describe images with alt text",
    why: 'People who can\'t see an image rely on its description; without one they hear only "graphic".',
    source: {
      pdf: [
        "In Word: right-click each image → View Alt Text (some Word versions call it Edit Alt Text) → write a short description (or mark it decorative)",
        "Re-export the PDF",
      ],
      docx: [
        "Right-click each image → View Alt Text (some Word versions call it Edit Alt Text) → write a short description (or mark it decorative)",
      ],
      pptx: [
        "Right-click each picture → View Alt Text (some versions call it Edit Alt Text) → write a short description (or mark it decorative)",
      ],
      xlsx: [
        "Right-click each chart/image → View Alt Text (some versions call it Edit Alt Text) → write a short description",
      ],
    },
    sourceInDesign: [
      "Select each image → Object → Object Export Options → Alt Text tab → set Alt Text Source to Custom and write a short description",
      'Re-export with "Create Tagged PDF" checked',
    ],
    acrobat: [
      "All tools → Prepare for accessibility → Add alternate text — Acrobat finds every figure and walks you through describing them (classic UI: Tools → Accessibility → Set Alternate Text)",
      "Or one image at a time: Fix reading order → right-click the figure → Edit Alternate Text",
    ],
  },
  color_contrast: {
    title: "Increase the contrast between text and background",
    why: "Low-contrast text is unreadable for low-vision readers.",
    source: {
      pdf: [
        "In the original document, darken the text color or lighten the background",
        "Check each color pair with the WebAIM Contrast Checker (webaim.org/resources/contrastchecker)",
        "Re-export the PDF",
      ],
      docx: [
        "Darken the text color or lighten the background",
        "Check pairs with the WebAIM Contrast Checker",
      ],
      pptx: [
        "Darken the text color or lighten the background on each slide",
        "Check pairs with the WebAIM Contrast Checker",
      ],
      xlsx: [
        "Darken cell text or lighten cell fills",
        "Check pairs with the WebAIM Contrast Checker",
      ],
    },
    sourceInDesign: [
      "In the InDesign file, darken the text color or lighten the background",
      "Check each color pair with the WebAIM Contrast Checker (webaim.org/resources/contrastchecker)",
      "Re-export the PDF",
    ],
    acrobat: [
      "Color is a design property — Acrobat can't restyle text reliably. This one has to be fixed in the original document and re-exported.",
    ],
    acrobatIsSourceOnly: true,
  },
  bookmarks: {
    title: "Add bookmarks so the document is navigable",
    why: "Bookmarks are the table of contents that keyboard and screen-reader users navigate long PDFs with.",
    source: {
      pdf: [
        'Use Heading styles in Word, then File → Save As → PDF → Options → check "Create bookmarks using: Headings"',
      ],
    },
    sourceInDesign: [
      'Add a table of contents (Layout → Table of Contents) with "Create PDF Bookmarks" checked — or add entries by hand in the Bookmarks panel (Window → Interactive → Bookmarks)',
      "When exporting (File → Export → Adobe PDF (Print) → General tab), check Include → Bookmarks",
    ],
    acrobat: [
      "Open the Bookmarks panel (the bookmark icon in the right-side panel; classic UI: View → Show/Hide → Navigation Panes → Bookmarks)",
      "Add a bookmark for each major section (with a tagged PDF, use the panel's Options menu → New Bookmarks From Structure)",
    ],
  },
  table_markup: {
    title: "Make tables real tables with a marked header row",
    why: "Screen readers speak tables cell by cell; without marked headers the numbers lose their meaning.",
    source: {
      pdf: [
        "In Word: build tables with Insert → Table (never tabs or spaces)",
        "Select the header row → Table Design → check Header Row, and Table Layout → Repeat Header Rows (in older Word these two tabs sit under Table Tools)",
        "Re-export the PDF",
      ],
      docx: [
        "Build tables with Insert → Table (never tabs or spaces)",
        "Select the header row → Table Design → check Header Row, and Table Layout → Repeat Header Rows (in older Word these two tabs sit under Table Tools)",
      ],
      pptx: ["Use Insert → Table on the slide", "Table Design → check Header Row"],
      xlsx: ['Select the data → Insert → Table → check "My table has headers"'],
    },
    sourceInDesign: [
      "Build tables with InDesign's table tool (Table → Insert Table), never tabs or spaces",
      "Click in the header row → Table → Convert Rows → To Header",
      'Re-export with "Create Tagged PDF" checked',
    ],
    acrobat: [
      "Open the Tags panel and confirm each table uses <Table>/<TR>/<TH>/<TD> (TH = header cell, TD = data cell)",
      "Use All tools → Prepare for accessibility → Fix reading order → select the table → Table Editor to mark the header cells as header cells (classic UI: Tools → Accessibility → Reading Order)",
    ],
  },
  link_quality: {
    title: "Give links text that says where they go",
    why: '"Click here" and raw URLs are meaningless when a screen reader lists the page\'s links out of context.',
    source: {
      pdf: [
        'In the original document, rewrite each link\'s visible text to describe the destination (e.g., "2024 crime statistics report")',
        "Re-export the PDF",
      ],
      docx: [
        'Rewrite each link\'s visible text to describe the destination (e.g., "2024 crime statistics report")',
      ],
      pptx: ["Rewrite each link's visible text to describe the destination"],
      xlsx: ["Rewrite each link's cell text to describe the destination"],
    },
    sourceInDesign: [
      'Rewrite each link\'s visible text in the InDesign file to describe the destination (e.g., "2024 crime statistics report")',
      "Re-export the PDF",
    ],
    acrobat: [
      "Link text lives in the document itself — Acrobat can't rewrite it for you. This one has to be fixed in the original document and re-exported.",
    ],
    acrobatIsSourceOnly: true,
  },
  form_accessibility: {
    title: "Label every form field",
    why: "Unlabeled fields leave screen-reader users guessing what to type in each box.",
    source: {
      pdf: [
        "If the form came from Word, put a clear text label next to every field, re-export, and re-create the fields",
      ],
      docx: ["Put a clear text label next to every form control"],
      pptx: ["Put a clear text label next to every interactive element"],
      xlsx: ["Put a clear label in the cell next to every input area"],
    },
    sourceInDesign: [
      "Select each form field → Window → Interactive → Buttons and Forms → fill in Description with the field's visible label (it becomes the tooltip screen readers announce)",
      "Export with File → Export → Adobe PDF (Interactive) so the fields stay fillable",
    ],
    acrobat: [
      "All tools → Prepare a form (classic UI: Tools → Prepare Form)",
      "Right-click each field → Properties → General → Tooltip: enter the field's visible label",
    ],
  },
  reading_order: {
    title: "Fix the order the document is read in",
    why: "Screen readers follow the tag order, not the visual layout — columns and floating boxes can read out of sequence.",
    source: {
      pdf: [
        "In Word, avoid floating text boxes; use a simple top-to-bottom flow or real columns (Layout → Columns)",
        "Re-export the PDF with structure tags",
      ],
      docx: [
        "Avoid floating text boxes; use a simple top-to-bottom flow or real columns (Layout → Columns)",
      ],
      pptx: [
        "On each slide: Home → Arrange → Selection Pane, and order objects bottom-to-top in reading order",
      ],
    },
    sourceInDesign: [
      'Open the Articles panel (Window → Articles), drag the stories and images in — in reading order — and check "Use for Reading Order in Tagged PDF" in the panel menu',
      "Anchor images into the text flow (drag the small square on a frame's top edge into the text) so each one is read at the right point",
      'Re-export with "Create Tagged PDF" checked',
    ],
    acrobat: [
      "All tools → Prepare for accessibility → Fix reading order (classic UI: Tools → Accessibility → Reading Order)",
      "Drag the numbered regions into the order the page should be read",
    ],
  },
  list_structure: {
    title: "Use real bullet and numbered lists",
    why: 'Hand-typed dashes aren\'t lists to a screen reader — users lose the "item 3 of 7" context.',
    source: {
      pdf: [
        "In Word: select the items → Home → Bullets or Numbering (delete any hand-typed dashes/numbers first)",
        "Re-export the PDF",
      ],
      docx: [
        "Select the items → Home → Bullets or Numbering (delete any hand-typed dashes/numbers first)",
      ],
      pptx: ["Use the layout's content placeholder bullets instead of typing dashes"],
    },
    sourceInDesign: [
      "Format lists with real Bullets and Numbering (in the paragraph style or the Paragraph panel) — delete any hand-typed dashes or numbers first",
      'Re-export with "Create Tagged PDF" checked — InDesign tags real lists automatically',
    ],
    acrobat: [
      "In the Tags panel, ensure each list uses <L> with <LI> items, each containing an <LBody> (L = list, LI = list item, LBody = item text)",
    ],
  },
  slide_titles: {
    title: "Give every slide a unique title",
    why: "Slide titles are how screen-reader users know where they are in the deck.",
    source: {
      pptx: [
        "Use each slide's built-in Title placeholder (if a layout has none: View → Outline and type the title there)",
        "View → Outline to spot untitled slides quickly",
        "Make every title unique",
      ],
    },
  },
  sheet_names: {
    title: "Name every worksheet tab",
    why: '"Sheet1" tells a screen-reader user nothing about what the tab contains.',
    source: {
      xlsx: ["Double-click each sheet tab and type a short, descriptive name"],
    },
  },
};

/**
 * text_extractability is one category id covering four different problems:
 * a scanned picture-of-text, a security setting that locks assistive
 * technology out, real text with no (or an empty) tag structure, and —
 * mildest of all — non-embedded fonts on an otherwise clean text layer.
 * PLAN_COPY's single entry describes only the scanned case, which turned a
 * Minor font advisory into "some or all of this document is a picture of
 * text" (user report 2026-08-15, ARI fact sheet: 5,447 chars extracted,
 * fully tagged, 85/Minor for three unembedded fonts).
 *
 * Detection keys on finding strings the analyzer has emitted verbatim for
 * every stored report. Menu paths below reuse strings already verified in
 * docs/fix-step-accuracy-2026-08.md and the analyzer's own findings
 * (packages/analyzer/src/scoring/pdf.ts, supplementary.ts). Anything
 * unrecognized — old reports, other formats — keeps the PLAN_COPY default,
 * so a failed match can only ever reproduce today's behavior.
 */
const TEXT_EXTRACTABILITY_VARIANTS: Array<{
  matches: (findings: string[]) => boolean;
  entry: PlanCopyEntry;
}> = [
  {
    // AT access denied by security settings — nothing else matters until
    // this is lifted, and OCR/tagging advice would be actively wrong.
    matches: (f) => f.some((s) => s.includes("deny assistive-technology access")),
    entry: {
      title: "Allow screen readers in the document's security settings",
      why: "This PDF's security settings switch off assistive-technology access — screen readers in conforming viewers can't read any of it, no matter how good the content is.",
      source: {
        pdf: [
          "Re-export or re-save the PDF without security restrictions, or with security that permits accessibility (modern AES-256 encryption always does)",
        ],
      },
      sourceInDesign: [
        "Re-export from InDesign without security restrictions: in the Export Adobe PDF dialog's Security panel, clear the permissions settings, then export",
      ],
      acrobat: [
        "Open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties) → Security tab",
        'Either remove security or enable "Enable text access for screen reader devices for the visually impaired", then re-save',
      ],
    },
  },
  {
    // Real text, but no usable tag structure (missing or empty tree).
    // Checked before the fonts variant: a file can carry both problems, and
    // tagging is the more fundamental barrier.
    matches: (f) =>
      f.some((s) => s.includes("Document is NOT tagged") || s.includes("is present but EMPTY")),
    entry: {
      title: "Add the hidden accessibility tags to the PDF",
      why: "The text itself is real and readable — but the document has no working tag structure, the hidden layer that tells a screen reader the reading order, headings, and other elements.",
      source: {
        pdf: [
          "Open the original Word (or Google Docs) file",
          'In Word: File → Save As → PDF → Options → check "Document structure tags for accessibility" (the hidden labels that tell a screen reader what\'s a heading, a list, a table), then save',
        ],
      },
      sourceInDesign: [
        "Open the original InDesign file",
        'File → Export → Adobe PDF (Print) → General tab → check "Create Tagged PDF" (the hidden labels that tell a screen reader what\'s a heading, a list, a table), then export',
      ],
      acrobat: [
        "All tools → Prepare for accessibility → Automatically tag PDF (classic UI: Tools → Accessibility → Autotag Document)",
        "Then open the Tags panel (☰ Menu on Windows or View menu on Mac → Show/Hide → Side panels → Accessibility tags) and confirm the body content appears beneath the tags",
      ],
    },
  },
  {
    // v1.94.0 (RB-review F5): visible text painted OUTSIDE the tag
    // structure — a tagged document, so the "picture of text → OCR" default
    // is the wrong story. Keyed on the SCORED-branch sentences only; the
    // advisory tier ("often stray export residue", score untouched) never
    // brings this category into the plan by itself.
    matches: (f) =>
      f.some(
        (s) =>
          s.includes("bring the untagged content into the structure") ||
          s.includes("Review the named pages in Acrobat's Tags panel"),
      ),
    entry: {
      title: "Bring the untagged text into the tag structure",
      why: "The document is tagged, but part of its visible text is painted outside the tag structure — a screen reader following the tags never encounters those passages.",
      source: {
        pdf: [
          'Open the original file and re-export the PDF with accessibility tags enabled (in Word: File → Save As → PDF → Options → check "Document structure tags for accessibility") — a clean re-export usually tags everything',
        ],
      },
      sourceInDesign: [
        'In InDesign, make sure the affected frames are in the Articles panel (or anchored in the main story), then re-export with "Create Tagged PDF" checked',
      ],
      acrobat: [
        "All tools → Prepare for accessibility → Automatically tag PDF picks up untagged content (classic UI: Tools → Accessibility → Autotag Document)",
        "Then open the Tags panel on the pages named in the finding and confirm the passages now appear beneath tags — or mark genuinely decorative runs as artifacts",
      ],
    },
  },
  {
    // v1.94.0 (RB-review F5): characters that extract as unreadable symbols
    // (missing character maps). The text LOOKS fine — OCR advice would be
    // wrong; the fix is fonts at the source. Keyed on the SCORED-branch
    // sentences only, same rule as above.
    matches: (f) =>
      f.some(
        (s) =>
          s.includes("cannot be read aloud or searched") ||
          s.includes("Verify the affected passages read correctly"),
      ),
    entry: {
      title: "Fix the fonts so the text reads as real words",
      why: "The page looks fine, but some of its characters extract as unreadable symbols — the fonts don't carry a usable map from glyphs to text, so a screen reader gets nothing it can pronounce.",
      source: {
        pdf: [
          "Re-export the PDF from the original application using standard fonts (or with font embedding enabled) — modern exports write the character maps screen readers need",
        ],
      },
      sourceInDesign: [
        'Replace any decorative or converted font on the affected passages with a standard OpenType font, then re-export (File → Export → Adobe PDF (Print)) with "Create Tagged PDF" checked',
      ],
      acrobat: [
        "If the affected passages came from a scan, run All tools → Scan & OCR → Recognize Text over those pages",
        "Otherwise the fix is at the source: re-export with standard fonts — Acrobat cannot rebuild a missing character map in place",
      ],
    },
  },
  {
    // Non-embedded fonts on an otherwise clean text layer. "Document is
    // tagged (StructTreeRoot present)" is emitted only on the no-deduction
    // path, so if this category is flagged at all alongside it, fonts are
    // the reason.
    matches: (f) =>
      f.some((s) => s.includes("Document is tagged (StructTreeRoot present)")) &&
      f.some((s) => /non-embedded font/i.test(s)),
    entry: {
      title: "Embed the fonts so the text stays correct everywhere",
      why: "The text itself is readable by screen readers — this is a smaller finish item. Some fonts aren't embedded in the file, and on a computer without them the text can display, print, or be read back with wrong or garbled characters.",
      source: {
        pdf: [
          "In the source application (Word, InDesign), enable font embedding before exporting to PDF",
          'Re-export, then confirm in Acrobat: Document properties (☰ Menu on Windows, File menu on Mac) → Fonts tab — every font should say "(Embedded)" or "(Embedded Subset)"',
        ],
      },
      sourceInDesign: [
        "InDesign embeds fonts automatically when exporting to PDF — a font that ends up unembedded almost always has a license that forbids embedding; replace it with a font that allows embedding",
        'Re-export, then confirm in Acrobat: Document properties (☰ Menu on Windows, File menu on Mac) → Fonts tab — every font should say "(Embedded)" or "(Embedded Subset)"',
      ],
      acrobat: [
        "Check which fonts are affected: Document properties (☰ Menu on Windows, File menu on Mac) → Fonts tab shows embedding status",
        "Use Preflight (All tools → Use print production; classic UI: Tools → Print Production) → Fix → Embed missing fonts",
      ],
    },
  },
];

/**
 * alt_text's variants, FIRST MATCH WINS — so the order below is the decision.
 *
 * "Text turned into pictures" is checked first because it is the one an
 * author cannot otherwise work out. The report says a document has images;
 * the author knows they never inserted one; nothing in Word looks wrong. The
 * step has to answer "what images?" before it asks for anything, or it reads
 * as the tool being broken. It also outranks the text-box variant below on
 * severity: a text box at least keeps its words inside the file, where a
 * flattened line of type has no words left at all. When a document has both,
 * this copy still points at the real pictures so the alt-text instruction is
 * never lost.
 *
 * Both variants exist because "add a description" is the WRONG fix for their
 * defect, and the stock step would send the author to do exactly that.
 */

/**
 * alt_text has one findings-keyed variant: figures that are really text.
 * Word exports text boxes, sidebars, SmartArt and chart title bars as
 * <Figure> with the text nested inside, and a Figure's alt text REPLACES its
 * contents for a screen reader — so the stock "describe every image" step
 * would have the author hide the very text those boxes hold (FFY24 SCIP
 * Plan, 2026-08-20: 16 of 26 alt-less figures were text). Keyed on the
 * analyzer's "--- Figures That Contain Text ---" block (pdf.ts), which is
 * emitted only when such figures lack alt text. Anything else keeps the
 * default copy.
 */
const ALT_TEXT_VARIANTS: Array<{
  matches: (findings: string[]) => boolean;
  entry: PlanCopyEntry;
}> = [
  {
    matches: (f) => f.some((s) => s.includes("--- Some Lettering May Not Be Real Text ---")),
    entry: {
      title: "Check whether some lettering here is artwork instead of text",
      why: 'This document contains "images" you may never have added knowingly. Graphics shaped like lines of writing usually mean words have been baked into artwork — most often a letterhead or a banner heading. On screen they look perfect, which is why it goes unnoticed, and no checker inside Word or InDesign can warn you, because the source file looks fine there. But a picture of a word is not a word: a screen reader has nothing to read out, nobody can search for it, and it can blur when zoomed. Check it in ten seconds — try to select those words in the PDF with your mouse. If they highlight, they are real text and you can skip this step.',
      source: {
        pdf: [
          "Find the words that would not highlight in the PDF — usually the letterhead or a banner heading",
          "If they are part of a logo or letterhead picture, those words were never text and cannot be recovered. Instead make sure the same wording also appears as ordinary text on the page — the organisation's name in the body or the footer — and mark the graphic itself as decorative (right-click → View Alt Text → Mark as decorative)",
          "If instead they are words you typed that carry an effect — a shadow, outline, glow, reflection, or a colour that fades — select that text → Font → Text Effects → remove the effect, or retype it as plain text in a solid colour. That kind does come through as real text once the effect is gone",
          "While you are there, give any real photo or chart a short description: right-click → View Alt Text (some Word versions call it Edit Alt Text)",
          "Save as PDF again, then re-upload here — anything that was fixable should now be selectable",
        ],
      },
      sourceInDesign: [
        "Find the words that would not highlight in the PDF — usually a letterhead or banner heading",
        "If the lettering sits inside placed artwork (a logo, an EPS, or type that was converted to outlines), those words are shapes, not text. Make sure the same wording also appears as live text on the page, and mark the artwork as decorative via Object → Object Export Options → Alt Text",
        "If it is live type carrying an effect or transparency (Effects panel: drop shadow, glow, feather; or a gradient or partly transparent fill), remove that from the type — those force the exporter to flatten it",
        'Re-export with "Create Tagged PDF" checked',
      ],
      acrobat: [
        "Acrobat cannot turn artwork back into text — once the letters are shapes or pixels, the words are gone from the file. Anything repairable has to be repaired in the source document and exported again",
        'What you CAN do here: make sure the same wording exists as real text on the page, then select the graphic with All tools → Prepare for accessibility → Fix reading order and mark it "Background/Artifact" so a screen reader skips it rather than announcing an unexplained image',
      ],
      // The per-document block below this offers "add alternate text to every
      // figure". For the graphics that are really words that is the wrong
      // move, so the caveat has to be read first.
      acrobatLead: [
        "First — do not describe the graphics that are really words. A description stands in for the wording rather than restoring it, and leaves it unsearchable. Acrobat cannot turn artwork back into letters: anything repairable belongs in the source document. The steps below still apply to any real photo, logo, or chart in this document",
      ],
    },
  },
  {
    matches: (f) => f.some((s) => s.includes("--- Figures That Contain Text ---")),
    entry: {
      title: "Describe the pictures — and turn the text boxes back into text",
      why: "People who can't see an image rely on its description. But some of this file's \"images\" are really boxes of text (Word exports text boxes, sidebars, and chart titles that way), and describing those would hide the text inside them — they need their tag changed, not a description.",
      source: {
        pdf: [
          "In Word: right-click each real picture or chart → View Alt Text (some Word versions call it Edit Alt Text) → write a short description (or mark it decorative)",
          "Move the text that sits in text boxes, shapes, or SmartArt into ordinary paragraphs, headings, and lists — Word exports those boxes as images, so the text inside is read as a picture",
          "Re-export the PDF",
        ],
      },
      sourceInDesign: [
        "Select each real image → Object → Object Export Options → Alt Text tab → set Alt Text Source to Custom and write a short description",
        "Keep body text in ordinary text frames — a text frame that is grouped with a graphic, or anchored as an image, exports as a figure and its text is read as a picture",
        'Re-export with "Create Tagged PDF" checked',
      ],
      acrobat: [
        "All tools → Prepare for accessibility → Add alternate text — describe the real pictures and charts (classic UI: Tools → Accessibility → Set Alternate Text)",
        'For a figure that is really a text box (the report lists them under "Figures That Contain Text"): open the Tags panel → right-click the <Figure> tag → Properties → Type → "Section", so the text inside is read directly instead of being hidden behind a description',
      ],
    },
  },
];

/**
 * link_quality has one findings-keyed variant: links with no <Link> tag.
 * A screen reader following the tags never meets them, and with the tab
 * order following the tags they can't be tabbed to either (FFY24 SCIP Plan,
 * 2026-08-20: six links inside a Word text box). The stock entry says
 * Acrobat can't help — true for link WORDING, false for tagging, which the
 * Tags panel's "Unmarked Links" finder handles — so this variant restores a
 * real Acrobat route and keeps the wording advice, since the two problems
 * usually travel together. Keyed on the analyzer's "--- Links Not Tagged ---"
 * block (pdf.ts).
 */
const LINK_QUALITY_VARIANTS: Array<{
  matches: (findings: string[]) => boolean;
  entry: PlanCopyEntry;
}> = [
  {
    matches: (f) => f.some((s) => s.includes("--- Links Not Tagged ---")),
    entry: {
      title: "Tag the links so screen readers can find them",
      why: "Some links in this file have no tag, so a screen reader following the document's tags never meets them — and with the tab order following the tags, they can't be tabbed to either. Links whose text doesn't say where they go need rewording as well.",
      source: {
        pdf: [
          "In Word, move links out of text boxes, shapes, and SmartArt into the main text (or a table) — links inside those export without tags",
          'Rewrite each link\'s visible text to describe the destination (e.g., "2024 crime statistics report")',
          "Re-export the PDF",
        ],
      },
      sourceInDesign: [
        "Keep hyperlinks in the main story text — a link inside a grouped or anchored graphic frame can export without a tag",
        'Rewrite each link\'s visible text in the InDesign file to describe the destination (e.g., "2024 crime statistics report")',
        "Re-export the PDF",
      ],
      acrobat: [
        'Open the Tags panel → Options menu (⋮) → Find → choose "Unmarked Links" → Find → Tag Element; repeat until no unmarked links remain',
        "Link wording itself has to be fixed in the source document and re-exported — Acrobat can't rewrite it for you",
      ],
    },
  },
];

const FINDINGS_VARIANTS: Record<
  string,
  Array<{ matches: (findings: string[]) => boolean; entry: PlanCopyEntry }>
> = {
  text_extractability: TEXT_EXTRACTABILITY_VARIANTS,
  alt_text: ALT_TEXT_VARIANTS,
  link_quality: LINK_QUALITY_VARIANTS,
};

/**
 * The copy entry for a step, picked by what the analyzer actually found.
 * text_extractability, alt_text and link_quality have findings-keyed
 * variants; every other id resolves straight from PLAN_COPY. A variant
 * that does not match keeps the default, so an unrecognized report can only
 * ever reproduce today's copy.
 */
function planCopyFor(id: string, findings: string[]): PlanCopyEntry | undefined {
  const variants = FINDINGS_VARIANTS[id];
  if (variants) {
    const strs = findings.filter((f): f is string => typeof f === "string");
    for (const variant of variants) {
      if (variant.matches(strs)) return variant.entry;
    }
  }
  return PLAN_COPY[id];
}

/** The one definition of "this PDF says InDesign made it" — used by the
 *  plan's route swap AND the metadata card's tie-in line, exported so the
 *  two surfaces can never disagree. */
export function isInDesignCreator(creator?: string | null): boolean {
  return typeof creator === "string" && /indesign/i.test(creator);
}

const SEVERITY_ORDER: Record<PlanSeverity, number> = { Critical: 0, Moderate: 1, Minor: 2 };

function isPlanSeverity(s: unknown): s is PlanSeverity {
  return s === "Critical" || s === "Moderate" || s === "Minor";
}

function normalizeFileType(fileType?: string | null): PlanFileType {
  // Old stored reports may lack fileType entirely — they predate multi-format
  // support, so PDF is the correct assumption (matches ReportContent's
  // metadata-panel fallback).
  return fileType === "docx" || fileType === "pptx" || fileType === "xlsx" ? fileType : "pdf";
}

export type VerdictTone = "critical" | "moderate" | "ok";

/**
 * The hero's publication verdict — text AND the tone that must colour it.
 *
 * The grade is a WEIGHTED AVERAGE; this verdict is a SEVERITY TALLY, and the
 * two genuinely disagree on real inputs: with the strict weights, a single
 * Critical in a 0.05-weight category (bookmarks at 39, everything else 100)
 * still averages 96.95 — an "A". Pairing them blindly produced
 * "Excellent — not ready to publish", rendered in grade-green, which teaches
 * a reader to distrust the headline.
 *
 * So when something blocks publication, the blocker leads and the flattering
 * adjective is dropped entirely; the grade letter still tells the truth in the
 * circle above. Moderate and clean states keep the familiar
 * "<adjective> — <clause>" shape.
 */
export function publicationVerdict(
  categories: Array<{ severity?: string | null }> | null | undefined,
): { text: string; tone: VerdictTone } {
  const t = tallySeverity(Array.isArray(categories) ? categories : []);
  if (t.critical > 0) {
    const n = t.critical;
    return {
      text: `Not ready to publish — ${n} critical issue${n === 1 ? "" : "s"}`,
      tone: "critical",
    };
  }
  if (t.moderate > 0) return { text: "fix recommended before publishing", tone: "moderate" };
  return { text: "ready to publish", tone: "ok" };
}

export function buildActionPlan(
  categories: unknown,
  fileType?: string | null,
  /** The report's stored PDF Creator metadata (`pdfMetadata.creator`).
   *  InDesign stamps "Adobe InDesign <version>" on every direct export;
   *  when it matches, the source route swaps to InDesign steps. Any other
   *  value — Word, a scanner, null, old reports — leaves today's copy
   *  untouched, so a missed match can only reproduce the status quo. */
  creator?: string | null,
): PlanStep[] {
  if (!Array.isArray(categories)) return [];
  const ft = normalizeFileType(fileType);
  const fromInDesign = ft === "pdf" && isInDesignCreator(creator);

  const issues = categories.filter(
    (c): c is { id: string; label: string; severity: PlanSeverity; findings?: unknown } =>
      !!c && typeof c === "object" && isPlanSeverity((c as { severity?: unknown }).severity),
  );

  // Array.prototype.sort is stable — equal severities keep analyzer order.
  const ordered = [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return ordered.map((c, i) => {
    const id = String(c.id ?? "");
    const label = String(c.label ?? id);
    const findings = Array.isArray(c.findings) ? (c.findings as string[]) : [];
    const entry = planCopyFor(id, findings);

    // Per-document Acrobat steps beat the dictionary default — they're
    // specific to what the analyzer actually saw in this file.
    const reportAcrobat = partitionCardFindings(findings).acrobat;
    const usesDictionaryAcrobat = !reportAcrobat.length;
    const acrobatBody = reportAcrobat.length ? reportAcrobat : (entry?.acrobat ?? []);
    // A variant's lead-in goes first even ahead of a per-document block — see
    // acrobatLead. Skipped when the dictionary default is already in use,
    // since that copy carries the caveat itself and would say it twice.
    const acrobatSteps =
      entry?.acrobatLead && !usesDictionaryAcrobat
        ? [...entry.acrobatLead, ...acrobatBody]
        : acrobatBody;
    // A per-document Acrobat block from the report itself is always a real,
    // actionable PDF fix — only the dictionary's generic default can be a
    // "you have to go back to the source" dead end, so acrobatIsSourceOnly
    // only swaps the label when we're actually using that default.
    const acrobatLabel =
      usesDictionaryAcrobat && entry?.acrobatIsSourceOnly ? SOURCE_ONLY_LABEL : ACROBAT_LABEL;

    const routes: FixRoute[] = [];
    if (ft === "pdf") {
      const inDesignSteps = fromInDesign ? entry?.sourceInDesign : undefined;
      const sourceSteps = inDesignSteps ?? entry?.source.pdf ?? [];
      if (sourceSteps.length)
        routes.push({
          tool: "source",
          label: inDesignSteps ? SOURCE_LABEL_INDESIGN : SOURCE_LABEL.pdf,
          steps: sourceSteps,
        });
      if (acrobatSteps.length)
        routes.push({ tool: "acrobat", label: acrobatLabel, steps: acrobatSteps });
    } else {
      const sourceSteps = entry?.source[ft] ?? [];
      if (sourceSteps.length)
        routes.push({ tool: "source", label: SOURCE_LABEL[ft], steps: sourceSteps });
    }
    // Never leave a step with no route at all (unknown id, or an OOXML
    // category the dictionary has no steps for): fall back to whatever the
    // report itself said, then to the category's own findings text.
    if (!routes.length) {
      const fallback = acrobatSteps.length
        ? acrobatSteps
        : [firstActionableFinding(findings) || label];
      routes.push({
        tool: ft === "pdf" ? "acrobat" : "source",
        label: ft === "pdf" ? ACROBAT_LABEL : SOURCE_LABEL[ft],
        steps: fallback,
      });
    }

    return {
      rank: i + 1,
      categoryId: id,
      title: entry?.title ?? `Fix: ${label}`,
      why: entry?.why ?? (firstActionableFinding(findings) || label),
      severity: c.severity,
      wcagRefs: (WCAG_CATEGORY_MAP[id] ?? []).map(({ sc, name }) => ({ sc, name })),
      routes,
      detailAnchor: `#cat-${id}`,
    };
  });
}
