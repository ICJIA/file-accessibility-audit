export interface WcagCriterion {
  id: string
  name: string
  level: 'A' | 'AA' | 'AAA'
  url: string
}

export interface CategoryWcagMeta {
  criteria: WcagCriterion[]
  principle: string
  remediation: string
}

const U = (slug: string) => `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`

export const WCAG_MAP: Record<string, CategoryWcagMeta> = {
  text_extractability: {
    criteria: [
      { id: '1.3.1', name: 'Info and Relationships', level: 'A', url: U('info-and-relationships') },
      { id: '1.4.5', name: 'Images of Text', level: 'AA', url: U('images-of-text') },
    ],
    principle: 'Perceivable',
    remediation: 'Run OCR on scanned pages (Adobe Acrobat: Scan & OCR → Recognize Text), then add tags (Accessibility → Add Tags to Document). Verify the tag structure covers all content.',
  },
  title_language: {
    criteria: [
      { id: '2.4.2', name: 'Page Titled', level: 'A', url: U('page-titled') },
      { id: '3.1.1', name: 'Language of Page', level: 'A', url: U('language-of-page') },
    ],
    principle: 'Operable / Understandable',
    remediation: 'Set the document title in File → Properties → Description. Set the language in File → Properties → Advanced → Language dropdown.',
  },
  heading_structure: {
    criteria: [
      { id: '1.3.1', name: 'Info and Relationships', level: 'A', url: U('info-and-relationships') },
      { id: '2.4.6', name: 'Headings and Labels', level: 'AA', url: U('headings-and-labels') },
    ],
    principle: 'Perceivable / Operable',
    remediation: 'Open the Tags panel, identify text that serves as section headings, and change their tag type to H1–H6 in a logical hierarchy. Do not skip levels (e.g., H1 → H3).',
  },
  alt_text: {
    criteria: [
      { id: '1.1.1', name: 'Non-text Content', level: 'A', url: U('non-text-content') },
    ],
    principle: 'Perceivable',
    remediation: 'In the Tags panel, find each <Figure> tag, right-click → Properties, and enter descriptive alt text. Mark decorative images as artifacts instead.',
  },
  bookmarks: {
    criteria: [
      { id: '2.4.5', name: 'Multiple Ways', level: 'AA', url: U('multiple-ways') },
    ],
    principle: 'Operable',
    remediation: 'Open the Bookmarks panel. Create bookmarks for each major section, or auto-generate from heading tags (Options → New Bookmarks from Structure).',
  },
  table_markup: {
    criteria: [
      { id: '1.3.1', name: 'Info and Relationships', level: 'A', url: U('info-and-relationships') },
    ],
    principle: 'Perceivable',
    remediation: 'In the Tags panel, expand each <Table> tag. Change header cell tags from <TD> to <TH>. Add scope attributes (Row or Column) to header cells.',
  },
  link_quality: {
    criteria: [
      { id: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', url: U('link-purpose-in-context') },
    ],
    principle: 'Operable',
    remediation: 'Replace raw URLs with descriptive link text in the source document before exporting to PDF. In Acrobat, edit link properties via Edit PDF.',
  },
  form_accessibility: {
    criteria: [
      { id: '1.3.1', name: 'Info and Relationships', level: 'A', url: U('info-and-relationships') },
      { id: '4.1.2', name: 'Name, Role, Value', level: 'A', url: U('name-role-value') },
    ],
    principle: 'Perceivable / Robust',
    remediation: 'Right-click each form field → Properties → General tab → enter a descriptive Tooltip. The tooltip becomes the accessible label announced by screen readers.',
  },
  reading_order: {
    criteria: [
      { id: '1.3.2', name: 'Meaningful Sequence', level: 'A', url: U('meaningful-sequence') },
    ],
    principle: 'Perceivable',
    remediation: 'Use the Reading Order tool (Accessibility → Reading Order) to verify and reorder elements so the tag sequence matches the intended reading flow.',
  },
}

export function getWcagMeta(catId: string): CategoryWcagMeta | undefined {
  return WCAG_MAP[catId]
}

export function getWcagCriteria(catId: string): WcagCriterion[] {
  return WCAG_MAP[catId]?.criteria ?? []
}

export function formatCriterion(c: WcagCriterion): string {
  return `${c.id} ${c.name} (Level ${c.level})`
}

export function getWcagCriteriaStrings(catId: string): string[] {
  return getWcagCriteria(catId).map(formatCriterion)
}
