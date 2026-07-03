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
        id: "1.4.5",
        name: "Images of Text",
        level: "AA",
        slug: "images-of-text",
      },
    ],
    principle: "Perceivable",
    remediation:
      "Run OCR on scanned pages (Adobe Acrobat: Scan & OCR → Recognize Text), then add tags (Accessibility → Add Tags to Document). Verify the tag structure covers all content. This applies to scanned PDFs; Word, PowerPoint, and Excel files always store real, extractable text, so this category does not apply to them.",
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
      "In Acrobat: set the document title in File → Properties → Description, and the language in File → Properties → Advanced → Language dropdown. In Word, PowerPoint, or Excel: set the title in File → Info → Properties → Title. In Word, set the language via Review → Language → Set Proofing Language; PowerPoint uses its presentation-wide default language setting. Excel workbooks do not store a document language.",
  },
  heading_structure: {
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
      {
        id: "2.4.6",
        name: "Headings and Labels",
        level: "AA",
        slug: "headings-and-labels",
      },
    ],
    principle: "Perceivable / Operable",
    remediation:
      "In Acrobat: open the Tags panel, identify text that serves as section headings, and change their tag type to H1–H6 in a logical hierarchy. Do not skip levels (e.g., H1 → H3). In Word: apply the built-in Heading 1–6 styles (Home tab → Styles gallery) instead of manually bolding or enlarging text, and keep the same no-skipping rule. (PowerPoint and Excel do not use this heading-hierarchy category — they are checked on slide titles and sheet names instead.)",
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
  pdf_ua_compliance: {
    criteria: [
      {
        id: "1.3.1",
        name: "Info and Relationships",
        level: "A",
        slug: "info-and-relationships",
      },
    ],
    principle: "Robust / Perceivable",
    remediation:
      "Use PAC or Acrobat to review tagging, MarkInfo, tab order, PDF/UA metadata, and list/table legality. In this app, treat this as a Practical-mode PDF/UA-oriented readiness category rather than a final conformance verdict.",
  },
  bookmarks: {
    criteria: [
      {
        id: "2.4.5",
        name: "Multiple Ways",
        level: "AA",
        slug: "multiple-ways",
      },
    ],
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
      "In Acrobat: expand each <Table> tag in the Tags panel, change header cell tags from <TD> to <TH>, and add scope attributes (Row or Column) to header cells. In Word: select the header row → Table Layout → Repeat Header Rows. In PowerPoint or Excel: select the table → Table Design → check \"Header Row\".",
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
    criteria: [
      {
        id: "2.4.4",
        name: "Link Purpose (In Context)",
        level: "A",
        slug: "link-purpose-in-context",
      },
    ],
    principle: "Operable",
    remediation:
      "Replace raw URLs and vague phrases like \"click here\" with descriptive link text. In Word, PowerPoint, or Excel, edit the link text directly in the source file (Insert → Link, or right-click → Edit Link). For a PDF, fix the link text in the source document before export, or edit link properties directly in Acrobat (Edit PDF → Links).",
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
        id: "4.1.2",
        name: "Name, Role, Value",
        level: "A",
        slug: "name-role-value",
      },
    ],
    principle: "Perceivable / Robust",
    remediation:
      "In Acrobat: right-click each form field → Properties → General tab → enter a descriptive Tooltip; the tooltip becomes the accessible label announced by screen readers. Interactive form fields are uncommon in Word, PowerPoint, and Excel and are not automatically assessed there — if present (e.g. Word/Excel Developer-tab content controls), give each one a descriptive title or accessible name.",
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
      "In Acrobat: use the Reading Order tool (Accessibility → Reading Order) to verify and reorder elements so the tag sequence matches the intended reading flow. In PowerPoint: use the Selection Pane (Home → Arrange → Selection Pane) to reorder shapes so each slide's title reads first. In Word, reading order generally follows the document's linear flow — check floating objects, text boxes, and wrapped images manually.",
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
