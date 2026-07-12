/**
 * Assemble syntactically valid `.docx` (OOXML / WordprocessingML) buffers for
 * tests, mirroring `minimalPdf.ts`. A `.docx` is a ZIP archive of XML parts; we
 * build one with jszip from overridable defaults so each test can supply just
 * the part it cares about (usually the `<w:body>` content) and inherit a sane
 * rest.
 *
 * Real Word emits many more parts; these are the minimum the accessibility
 * extractor reads: `[Content_Types].xml`, `word/document.xml`,
 * `word/styles.xml`, `docProps/core.xml`, and (optionally) `word/numbering.xml`,
 * `word/theme/theme1.xml`, and `word/_rels/document.xml.rels`.
 */
import JSZip from "jszip";

export const DOCX_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

/** Wrap raw `<w:body>` inner XML in a full `<w:document>` envelope. */
export function wordDocument(bodyInnerXml: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document ${DOCX_NS}><w:body>${bodyInnerXml}</w:body></w:document>`
  );
}

/** A paragraph carrying a named style (e.g. "Heading1") and plain-text runs. */
export function styledParagraph(styleId: string, text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

/** A plain body paragraph, optionally with run properties (bold, size, color). */
export function paragraph(
  text: string,
  opts: { bold?: boolean; sizeHalfPt?: number; color?: string } = {},
): string {
  const rpr: string[] = [];
  if (opts.bold) rpr.push("<w:b/>");
  if (opts.sizeHalfPt) rpr.push(`<w:sz w:val="${opts.sizeHalfPt}"/>`);
  if (opts.color) rpr.push(`<w:color w:val="${opts.color}"/>`);
  const rprXml = rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : "";
  return `<w:p><w:r>${rprXml}<w:t>${text}</w:t></w:r></w:p>`;
}

const DEFAULT_STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:styles ${DOCX_NS}>` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/>` +
        `<w:pPr><w:outlineLvl w:val="${n - 1}"/></w:pPr></w:style>`,
    )
    .join("") +
  `</w:styles>`;

const DEFAULT_CORE =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
  `xmlns:dc="http://purl.org/dc/elements/1.1/">` +
  `<dc:title>Quarterly Report</dc:title><dc:creator>Jane Author</dc:creator>` +
  `</cp:coreProperties>`;

const DEFAULT_APP =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
  `<Pages>3</Pages><Words>1200</Words></Properties>`;

function contentTypes(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`
  );
}

export interface DocxPartOverrides {
  /** Full `word/document.xml`. Overrides `body`. */
  documentXml?: string;
  /** Inner `<w:body>` XML; wrapped in a default envelope. */
  body?: string;
  stylesXml?: string;
  coreXml?: string;
  appXml?: string;
  numberingXml?: string;
  themeXml?: string;
  documentRels?: string;
  contentTypesXml?: string;
  /** Extra arbitrary zip entries: path -> content. */
  extra?: Record<string, string>;
  /** Omit `[Content_Types].xml` (invalid-package test). */
  omitContentTypes?: boolean;
  /** Omit `word/document.xml` (invalid-package test). */
  omitDocument?: boolean;
}

/** Build a `.docx` Buffer from overridable OOXML parts. */
export async function buildDocx(overrides: DocxPartOverrides = {}): Promise<Buffer> {
  const zip = new JSZip();

  if (!overrides.omitContentTypes) {
    zip.file("[Content_Types].xml", overrides.contentTypesXml ?? contentTypes());
  }
  if (!overrides.omitDocument) {
    const doc =
      overrides.documentXml ??
      wordDocument(overrides.body ?? "<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>");
    zip.file("word/document.xml", doc);
  }
  zip.file("word/styles.xml", overrides.stylesXml ?? DEFAULT_STYLES);
  zip.file("docProps/core.xml", overrides.coreXml ?? DEFAULT_CORE);
  zip.file("docProps/app.xml", overrides.appXml ?? DEFAULT_APP);
  if (overrides.numberingXml) zip.file("word/numbering.xml", overrides.numberingXml);
  if (overrides.themeXml) zip.file("word/theme/theme1.xml", overrides.themeXml);
  if (overrides.documentRels) zip.file("word/_rels/document.xml.rels", overrides.documentRels);
  for (const [p, c] of Object.entries(overrides.extra ?? {})) zip.file(p, c);

  return zip.generateAsync({ type: "nodebuffer" });
}

/** An inline image (drawing) with optional alt text / decorative flag. */
export function inlineImage(
  opts: { descr?: string; title?: string; decorative?: boolean } = {},
): string {
  const descr = opts.descr !== undefined ? ` descr="${opts.descr}"` : "";
  const title = opts.title !== undefined ? ` title="${opts.title}"` : "";
  const decorative = opts.decorative
    ? `<a:extLst><a:ext uri="{C183D7F6}"><adec:decorative ` +
      `xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>`
    : "";
  return (
    `<w:p><w:r><w:drawing><wp:inline>` +
    `<wp:docPr id="1" name="Picture 1"${descr}${title}>${decorative}</wp:docPr>` +
    `<a:graphic><a:graphicData><pic:pic/></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r></w:p>`
  );
}

/** A table with `rows`x`cols` cells; optional header row and one nested table. */
export function table(opts: {
  rows: number;
  cols: number;
  headerRow?: boolean;
  nested?: boolean;
}): string {
  const grid = `<w:tblGrid>${"<w:gridCol/>".repeat(opts.cols)}</w:tblGrid>`;
  let rowsXml = "";
  for (let r = 0; r < opts.rows; r++) {
    const isHeader = opts.headerRow && r === 0;
    const trPr = isHeader ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
    let cells = "";
    for (let c = 0; c < opts.cols; c++) {
      const nested =
        opts.nested && r === 1 && c === 0
          ? `<w:tbl>${grid}<w:tr><w:tc><w:p><w:r><w:t>n</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
          : "";
      cells += `<w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p>${nested}</w:tc>`;
    }
    rowsXml += `<w:tr>${trPr}${cells}</w:tr>`;
  }
  return `<w:tbl>${grid}${rowsXml}</w:tbl>`;
}

/** A real list-item paragraph (`<w:numPr>`). */
export function listItem(text: string, opts: { numId?: number; ilvl?: number } = {}): string {
  const numId = opts.numId ?? 1;
  const ilvl = opts.ilvl ?? 0;
  return (
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
    `<w:r><w:t>${text}</w:t></w:r></w:p>`
  );
}

/** A paragraph containing a hyperlink resolved via `rId`. */
export function hyperlink(rId: string, text: string): string {
  return `<w:p><w:hyperlink r:id="${rId}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p>`;
}

/** A relationships part mapping rId -> hyperlink target. */
export function hyperlinkRels(rels: Array<{ id: string; target: string }>): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    rels
      .map(
        (r) =>
          `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${r.target}" TargetMode="External"/>`,
      )
      .join("") +
    `</Relationships>`
  );
}
