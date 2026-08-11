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
  /** Dictionary default when the report carries no per-document Acrobat block. */
  acrobat?: string[];
  /** True when `acrobat` has no real PDF-only fix — the steps just explain
   *  that this one has to go back to the source document. The route still
   *  renders (so a reader isn't left silently short a fix), but under
   *  SOURCE_ONLY_LABEL instead of ACROBAT_LABEL so it reads as a straight
   *  answer instead of a dead-end redirect. */
  acrobatIsSourceOnly?: boolean;
}

const SOURCE_LABEL_PDF = "Easiest — fix the source document, then re-export";
const SOURCE_LABEL: Record<PlanFileType, string> = {
  pdf: SOURCE_LABEL_PDF,
  docx: "Fix it in Word",
  pptx: "Fix it in PowerPoint",
  xlsx: "Fix it in Excel",
};
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

export function buildActionPlan(categories: unknown, fileType?: string | null): PlanStep[] {
  if (!Array.isArray(categories)) return [];
  const ft = normalizeFileType(fileType);

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
    const entry = PLAN_COPY[id];

    // Per-document Acrobat steps beat the dictionary default — they're
    // specific to what the analyzer actually saw in this file.
    const reportAcrobat = partitionCardFindings(findings).acrobat;
    const usesDictionaryAcrobat = !reportAcrobat.length;
    const acrobatSteps = reportAcrobat.length ? reportAcrobat : (entry?.acrobat ?? []);
    // A per-document Acrobat block from the report itself is always a real,
    // actionable PDF fix — only the dictionary's generic default can be a
    // "you have to go back to the source" dead end, so acrobatIsSourceOnly
    // only swaps the label when we're actually using that default.
    const acrobatLabel =
      usesDictionaryAcrobat && entry?.acrobatIsSourceOnly ? SOURCE_ONLY_LABEL : ACROBAT_LABEL;

    const routes: FixRoute[] = [];
    if (ft === "pdf") {
      const sourceSteps = entry?.source.pdf ?? [];
      if (sourceSteps.length)
        routes.push({ tool: "source", label: SOURCE_LABEL.pdf, steps: sourceSteps });
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
