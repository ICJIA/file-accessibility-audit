export interface WcagCriterion {
  id: string;
  name: string;
  level: "A" | "AA" | "AAA";
  /** W3C "Understanding" page slug (version-agnostic; identical in 2.1 and 2.2). */
  slug: string;
}

export interface CategoryWcagMeta {
  criteria: WcagCriterion[];
  principle: string;
  remediation: string;
  /** Optional note rendered when the app is on WCAG 2.2 (manual-review hint). */
  wcag22Note?: string;
}

export const WCAG_MAP: Record<string, CategoryWcagMeta> = {
  text_extractability: {
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
      {
        // 1.1.1, not 1.4.5 (corrected 2026-08-31). conformance.ts:125 lists
        // 1.4.5 Images of Text among the criteria this tool explicitly does
        // NOT assess — "not reliably determinable" — so the card was citing a
        // rule the same report says it never checked, while omitting the one
        // it does. packages/shared/src/scoring.ts has always had this right.
        id: "1.1.1",
        name: "Non-text Content",
        level: "A",
        slug: "non-text-content",
      },
    ],
    principle: "Perceivable",
    remediation:
      "Run OCR on scanned pages (Adobe Acrobat: All tools → Scan & OCR → Recognize Text → In this file), then add tags (All tools → Prepare for accessibility → Automatically tag PDF; classic UI: Tools → Accessibility → Autotag Document). Verify the tag structure covers all content. This applies to scanned PDFs; Word, PowerPoint, and Excel files always store real, extractable text, so this category does not apply to them.",
  },
  title_language: {
    criteria: [
      { id: "2.4.2", name: "Page Titled", level: "A", slug: "page-titled" },
      {
        id: "3.1.1",
        name: "Language of Page",
        level: "A",
        slug: "language-of-page",
      },
    ],
    principle: "Operable / Understandable",
    remediation:
      "In Acrobat: open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties), set the title on the Description tab and the language on the Advanced tab under Reading Options. In Word, PowerPoint, or Excel: set the title in File → Info → Properties → Title. In Word, set the language via Review → Language → Set Proofing Language; PowerPoint uses its presentation-wide default language setting. Excel workbooks do not store a document language.",
  },
  heading_structure: {
    // 2.4.6 removed 2026-09-02: no gate asserts it (Understanding 2.4.6 "does
    // not require headings or labels"); it is disclosed as not assessed on
    // every verdict instead. Mirrors packages/shared WCAG_CATEGORY_MAP — the
    // docsCurrency test fails if the two maps drift.
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
    ],
    principle: "Perceivable / Operable",
    remediation:
      "In Acrobat: open the Tags panel (☰ Menu on Windows or View menu on Mac → Show/Hide → Side panels → Accessibility tags; classic UI: View → Show/Hide → Navigation Panes → Tags), identify text that serves as section headings, and change their tag type to H1–H6 in a logical hierarchy. Do not skip levels (e.g., H1 → H3). In Word: apply the built-in Heading 1–6 styles (Home tab → Styles gallery) instead of manually bolding or enlarging text, and keep the same no-skipping rule. (PowerPoint and Excel do not use this heading-hierarchy category — they are checked on slide titles and sheet names instead.)",
  },
  alt_text: {
    criteria: [
      {
        id: "1.1.1",
        name: "Non-text Content",
        level: "A",
        slug: "non-text-content",
      },
    ],
    principle: "Perceivable",
    remediation:
      "In Acrobat: find each <Figure> tag in the Tags panel, right-click → Properties, and enter descriptive alt text; mark decorative images as artifacts instead. In Word, PowerPoint, or Excel: right-click the image and choose View/Edit Alt Text to add a description, or mark it as decorative in the same pane.",
  },
  bookmarks: {
    // NO criteria: no WCAG 2.1 criterion requires bookmarks in a single
    // document (2.4.5 Multiple Ways is scoped to a SET of documents, per
    // WCAG2ICT), and the category's own finding says so — citing 2.4.5
    // beside that sentence contradicted it on one card (2026-09-01).
    criteria: [],
    principle: "Operable",
    remediation:
      "Open the Bookmarks panel. Create bookmarks for each major section, or auto-generate from heading tags (Options → New Bookmarks from Structure). This is a PDF-specific navigation feature — Word, PowerPoint, and Excel files are not scored on bookmarks.",
  },
  table_markup: {
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
    ],
    principle: "Perceivable",
    remediation:
      'In Acrobat: expand each <Table> tag in the Tags panel, change header cell tags from <TD> to <TH>, and add scope attributes (Row or Column) to header cells. In Word: select the header row → Table Layout → Repeat Header Rows. In PowerPoint or Excel: select the table → Table Design → check "Header Row".',
  },
  color_contrast: {
    criteria: [
      {
        id: "1.4.3",
        name: "Contrast (Minimum)",
        level: "AA",
        slug: "contrast-minimum",
      },
    ],
    principle: "Perceivable",
    remediation:
      "For PDFs, this analyzer does not yet compute rendered text/background contrast automatically — check low-contrast text manually in Acrobat, the source document, or a PDF accessibility tool that performs rendered color-contrast analysis. For Word, PowerPoint, and Excel files, contrast is checked automatically from the document's explicitly-set colors; adjust the flagged text or fill color in the source application.",
  },
  link_quality: {
    // The gate asserts 1.3.1 (a link annotation no <Link> tag wraps) and
    // 4.1.2 (a link with no text at all); 2.4.4 is reported, never scored,
    // because context may supply a vague link's purpose.
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
      {
        id: "2.4.4",
        name: "Link Purpose (In Context)",
        level: "A",
        slug: "link-purpose-in-context",
      },
      {
        id: "4.1.2",
        name: "Name, Role, Value",
        level: "A",
        slug: "name-role-value",
      },
    ],
    principle: "Operable",
    remediation:
      'Replace raw URLs and vague phrases like "click here" with descriptive link text. In Word, PowerPoint, or Excel, edit the link text directly in the source file (Insert → Link, or right-click the link → Edit Hyperlink). For a PDF, fix the link text in the source document before export, or edit the text directly in Acrobat (All tools → Edit a PDF).',
  },
  form_accessibility: {
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
      {
        // Added 2026-08-31: shared/scoring.ts, the README rubric and the
        // analyzer's own help link all carry 3.3.2 for this category — the
        // criterion whose subject IS form labels. Only this map omitted it.
        id: "3.3.2",
        name: "Labels or Instructions",
        level: "A",
        slug: "labels-or-instructions",
      },
      {
        id: "4.1.2",
        name: "Name, Role, Value",
        level: "A",
        slug: "name-role-value",
      },
    ],
    principle: "Perceivable / Robust",
    remediation:
      "In Acrobat: open All tools → Prepare a form (classic UI: Tools → Prepare Form), then right-click each form field → Properties → General tab → enter a descriptive Tooltip; the tooltip becomes the accessible label announced by screen readers. Word and Excel form controls (Developer-tab content controls, legacy form fields, form/OLE controls) are detected and disclosed on the report but not automatically assessed — give each one a descriptive title or accessible name; PowerPoint form fields are uncommon and are not assessed there.",
    wcag22Note:
      "New in WCAG 2.2: interactive forms may also implicate Target Size (2.5.8), Redundant Entry (3.3.7), and Accessible Authentication (3.3.8). These are not automatically assessed — confirm by manual review.",
  },
  reading_order: {
    criteria: [
      {
        id: "1.3.2",
        name: "Meaningful Sequence",
        level: "A",
        slug: "meaningful-sequence",
      },
    ],
    principle: "Perceivable",
    remediation:
      "In Acrobat: use the Reading Order tool (All tools → Prepare for accessibility → Fix reading order; classic UI: Tools → Accessibility → Reading Order) to verify and reorder elements so the tag sequence matches the intended reading flow. In PowerPoint: use the Selection Pane (Home → Arrange → Selection Pane) to reorder shapes so each slide's title reads first. In Word, reading order generally follows the document's linear flow — check floating objects, text boxes, and wrapped images manually.",
  },

  // Office-only categories (2026-09-02): these carried no entry, so their
  // cards rendered no references block at all.
  list_structure: {
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
    ],
    principle: "Perceivable",
    remediation:
      "In Word or PowerPoint, select the typed bullets or numbers and apply the Bullets or Numbering button so the list is announced as a list. Screen readers then report the item count and position.",
  },
  slide_titles: {
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
    ],
    principle: "Perceivable",
    remediation:
      "In PowerPoint: Home → Layout → choose a layout with a Title placeholder, then move the heading text into it. A heading typed into an ordinary text box is visible but not programmatically a heading; whether every slide has a title at all is WCAG 2.4.10 (Level AAA) and is reported, never scored.",
  },
  sheet_names: {
    // No criterion: default "Sheet1" tab names are an unscored advisory.
    criteria: [],
    principle: "Operable",
    remediation:
      'In Excel: right-click each sheet tab → Rename, and give every visible sheet a name that says what it holds. Remove empty sheets. Whether a name is descriptive is a human judgment (WCAG 2.4.6), listed as "not assessed" on every report.',
  },
};

export function getWcagMeta(catId: string): CategoryWcagMeta | undefined {
  return WCAG_MAP[catId];
}

export function getWcagCriteria(catId: string): WcagCriterion[] {
  return WCAG_MAP[catId]?.criteria ?? [];
}

export function formatCriterion(c: WcagCriterion): string {
  return `${c.id} ${c.name} (Level ${c.level})`;
}

export function getWcagCriteriaStrings(catId: string): string[] {
  return getWcagCriteria(catId).map(formatCriterion);
}
