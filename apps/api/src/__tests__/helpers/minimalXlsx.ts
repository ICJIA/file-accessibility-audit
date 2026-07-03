/** Builds real minimal .xlsx bytes with jszip for tests — mirrors minimalDocx/minimalPptx. */
import JSZip from "jszip";

export interface SheetOpts {
  name: string;
  hidden?: boolean;
  /** dimension ref, e.g. "A1:D20"; omit for an empty sheet (no dimension). */
  dimensionRef?: string;
  /** Number of <mergeCell> entries. */
  mergeCount?: number;
  /** Hyperlinks: display may be omitted to exercise the ""-text path. */
  hyperlinks?: Array<{ id: string; target: string; display?: string }>;
  /** Defined tables attached to this sheet. headerRowCount: undefined = attr absent (header ON). */
  tables?: Array<{ name: string; headerRowCount?: 0 | 1 }>;
  /** Drawing objects on this sheet. anchor defaults to "oneCell". */
  drawings?: Array<{
    kind: "pic" | "chart";
    descr?: string;
    decorative?: boolean;
    anchor?: "oneCell" | "twoCell";
  }>;
  /** Raw anchor XML appended verbatim inside the generated <xdr:wsDr>
   *  (the drawing part + rel are created when set, even if drawings is empty). */
  rawDrawings?: string;
  /** Real cells placed in <sheetData>, grouped into <row> elements by the row
   *  number parsed out of `ref` (e.g. "A1" → row 1). Each entry renders as
   *  `<c r="{ref}" s="{styleIndex}"><v>{value}</v></c>` (or the inline-string
   *  / formula form per `kind`, or a bare self-closing `<c r="{ref}" s="N"/>`
   *  when `empty: true`). Omit entirely for the default empty `<sheetData/>`.
   *  Drives (a) the real-<c>-based MAX_CELLS cap and (b) which cellXfs style
   *  indices count as "applied" for contrast — only a cell with a value child
   *  (`<v>`/`<is>`/`<f>`) counts as non-empty. */
  cells?: Array<{
    ref: string;
    styleIndex?: number;
    value?: string;
    /** v = <v> value (default), is = inline string, f = formula. */
    kind?: "v" | "is" | "f";
    /** Emit a bare `<c r="{ref}" s="N"/>` with no value child. */
    empty?: boolean;
  }>;
}

export interface BuildXlsxOpts {
  sheets: SheetOpts[];
  coreXml?: string; // default carries a dc:title + dc:creator
  /** cellXfs entries: font color/size/bold × solid-fill color (both ARGB or 6-hex). */
  styles?: Array<{ fontRgb?: string; fontTheme?: boolean; sz?: number; bold?: boolean; fillRgb?: string }>;
}

const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function rowNumOfCellRef(ref: string): number {
  const m = /^[A-Z]+(\d+)$/.exec(ref);
  return m ? Number(m[1]) : 1;
}

function renderCell(c: NonNullable<SheetOpts["cells"]>[number]): string {
  const sAttr = c.styleIndex !== undefined ? ` s="${c.styleIndex}"` : "";
  if (c.empty) return `<c r="${c.ref}"${sAttr}/>`;
  const kind = c.kind ?? "v";
  const value = c.value ?? "1";
  if (kind === "f") return `<c r="${c.ref}"${sAttr}><f>${value}</f></c>`;
  if (kind === "is") return `<c r="${c.ref}"${sAttr} t="inlineStr"><is><t>${value}</t></is></c>`;
  return `<c r="${c.ref}"${sAttr}><v>${value}</v></c>`;
}

/** Renders <sheetData/> (empty, the historical default) or a populated
 *  <sheetData> with cells grouped into <row> elements by ref row number. */
function renderSheetData(cells: SheetOpts["cells"]): string {
  if (!cells?.length) return "<sheetData/>";
  const byRow = new Map<number, string[]>();
  for (const c of cells) {
    const row = rowNumOfCellRef(c.ref);
    const arr = byRow.get(row) ?? [];
    arr.push(renderCell(c));
    byRow.set(row, arr);
  }
  const rows = [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, cellsXml]) => `<row r="${row}">${cellsXml.join("")}</row>`)
    .join("");
  return `<sheetData>${rows}</sheetData>`;
}

export async function buildXlsx(opts: BuildXlsxOpts): Promise<Buffer> {
  const zip = new JSZip();
  let tableIdx = 0;
  let drawingIdx = 0;
  const overrides: string[] = [];

  zip.file(
    "docProps/core.xml",
    opts.coreXml ??
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Grant Ledger</dc:title><dc:creator>ICJIA</dc:creator></cp:coreProperties>`,
  );

  const sheetEls = opts.sheets
    .map(
      (s, i) =>
        `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"${s.hidden ? ' state="hidden"' : ""}/>`,
    )
    .join("");
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ${R}><sheets>${sheetEls}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${opts.sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}</Relationships>`,
  );

  // styles.xml — index 0 font/fill are the Excel defaults; test styles follow.
  const styles = opts.styles ?? [];
  const fonts = [`<font><sz val="11"/><name val="Calibri"/></font>`]
    .concat(
      styles.map((st) => {
        const color = st.fontTheme
          ? `<color theme="1"/>`
          : st.fontRgb
            ? `<color rgb="${st.fontRgb}"/>`
            : "";
        return `<font><sz val="${st.sz ?? 11}"/>${st.bold ? "<b/>" : ""}${color}</font>`;
      }),
    )
    .join("");
  const fills = [`<fill><patternFill patternType="none"/></fill>`, `<fill><patternFill patternType="gray125"/></fill>`]
    .concat(
      styles.map((st) =>
        st.fillRgb
          ? `<fill><patternFill patternType="solid"><fgColor rgb="${st.fillRgb}"/></patternFill></fill>`
          : `<fill><patternFill patternType="none"/></fill>`,
      ),
    )
    .join("");
  const xfs = [`<xf fontId="0" fillId="0"/>`]
    .concat(styles.map((_, i) => `<xf fontId="${i + 1}" fillId="${i + 2}"/>`))
    .join("");
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts>${fonts}</fonts><fills>${fills}</fills><cellXfs>${xfs}</cellXfs></styleSheet>`,
  );

  opts.sheets.forEach((s, i) => {
    const rels: string[] = [];
    const dim = s.dimensionRef ? `<dimension ref="${s.dimensionRef}"/>` : "";
    const merges = s.mergeCount
      ? `<mergeCells count="${s.mergeCount}">${Array.from(
          { length: s.mergeCount },
          (_, m) => `<mergeCell ref="A${m + 1}:B${m + 1}"/>`,
        ).join("")}</mergeCells>`
      : "";
    const links = s.hyperlinks?.length
      ? `<hyperlinks>${s.hyperlinks
          .map(
            (h) =>
              `<hyperlink ref="A1" r:id="${h.id}"${h.display !== undefined ? ` display="${h.display}"` : ""}/>`,
          )
          .join("")}</hyperlinks>`
      : "";
    s.hyperlinks?.forEach((h) =>
      rels.push(
        `<Relationship Id="${h.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${h.target}" TargetMode="External"/>`,
      ),
    );
    s.tables?.forEach((t) => {
      tableIdx++;
      const hdr = t.headerRowCount === undefined ? "" : ` headerRowCount="${t.headerRowCount}"`;
      zip.file(
        `xl/tables/table${tableIdx}.xml`,
        `<?xml version="1.0"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tableIdx}" name="${t.name}" displayName="${t.name}" ref="A1:C4"${hdr}/>`,
      );
      overrides.push(
        `<Override PartName="/xl/tables/table${tableIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
      );
      rels.push(
        `<Relationship Id="rIdT${tableIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${tableIdx}.xml"/>`,
      );
    });
    if (s.drawings?.length || s.rawDrawings) {
      drawingIdx++;
      const parts = (s.drawings ?? [])
        .map((d, di) => {
          const descr = d.descr !== undefined ? ` descr="${d.descr}"` : "";
          const dec = d.decorative
            ? `<a:extLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:ext uri="{X}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>`
            : "";
          const cNvPr = `<xdr:cNvPr id="${di + 2}" name="obj"${descr}>${dec}</xdr:cNvPr>`;
          const shape =
            d.kind === "pic"
              ? `<xdr:pic><xdr:nvPicPr>${cNvPr}<xdr:cNvPicPr/></xdr:nvPicPr></xdr:pic>`
              : `<xdr:graphicFrame><xdr:nvGraphicFramePr>${cNvPr}<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr></xdr:graphicFrame>`;
          return d.anchor === "twoCell"
            ? `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>10</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>${shape}</xdr:twoCellAnchor>`
            : `<xdr:oneCellAnchor>${shape}</xdr:oneCellAnchor>`;
        })
        .join("");
      zip.file(
        `xl/drawings/drawing${drawingIdx}.xml`,
        `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">${parts}${s.rawDrawings ?? ""}</xdr:wsDr>`,
      );
      rels.push(
        `<Relationship Id="rIdD${drawingIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingIdx}.xml"/>`,
      );
    }
    zip.file(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ${R}>${dim}${renderSheetData(s.cells)}${merges}${links}</worksheet>`,
    );
    if (rels.length) {
      zip.file(
        `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
      );
    }
  });

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${opts.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
  ${overrides.join("")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  );

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}
