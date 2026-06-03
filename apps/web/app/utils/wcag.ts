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
      "Run OCR on scanned pages (Adobe Acrobat: Scan & OCR → Recognize Text), then add tags (Accessibility → Add Tags to Document). Verify the tag structure covers all content.",
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
      "Set the document title in File → Properties → Description. Set the language in File → Properties → Advanced → Language dropdown.",
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
      "Open the Tags panel, identify text that serves as section headings, and change their tag type to H1–H6 in a logical hierarchy. Do not skip levels (e.g., H1 → H3).",
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
      "In the Tags panel, find each <Figure> tag, right-click → Properties, and enter descriptive alt text. Mark decorative images as artifacts instead.",
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
      "Open the Bookmarks panel. Create bookmarks for each major section, or auto-generate from heading tags (Options → New Bookmarks from Structure).",
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
      "In the Tags panel, expand each <Table> tag. Change header cell tags from <TD> to <TH>. Add scope attributes (Row or Column) to header cells.",
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
      "This analyzer does not yet compute PDF text/background contrast automatically. Check low-contrast text manually in Acrobat, source documents, or a PDF accessibility tool that performs rendered color-contrast analysis.",
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
      "Replace raw URLs with descriptive link text in the source document before exporting to PDF. In Acrobat, edit link properties via Edit PDF.",
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
      "Right-click each form field → Properties → General tab → enter a descriptive Tooltip. The tooltip becomes the accessible label announced by screen readers.",
    wcag22Note:
      "New in WCAG 2.2: interactive PDF forms may also implicate Target Size (2.5.8), Redundant Entry (3.3.7), and Accessible Authentication (3.3.8). These are not automatically assessed — confirm by manual review.",
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
      "Use the Reading Order tool (Accessibility → Reading Order) to verify and reorder elements so the tag sequence matches the intended reading flow.",
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
