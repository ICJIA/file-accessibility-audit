/**
 * Builds real minimal .pptx bytes with jszip for tests — the PPTX analogue of
 * minimalDocx. Every part is genuine PresentationML so the extractor exercises
 * the same code paths as PowerPoint output.
 */
import JSZip from "jszip";

export interface SlideOpts {
  /** Title placeholder text; null = no title placeholder on the slide. */
  title?: string | null;
  /** Emit show="0" on the slide (hidden slide). */
  hidden?: boolean;
  /** Raw <p:sp>/<p:pic>/<p:graphicFrame> XML inserted BEFORE the title shape. */
  beforeTitle?: string;
  /** Raw shape XML inserted after the title shape. */
  body?: string;
  /** Extra rels XML entries for this slide (hyperlinks, media). */
  rels?: string;
  /** Raw XML inserted inside <p:cSld> as a SIBLING of <p:spTree> (i.e. OUTSIDE
   *  the shape tree). Test infra for the out-of-spTree text-element cap bypass:
   *  slideRoot ⊇ spTree, so p/r placed here are walked by the links/lists
   *  passes (descendants(slideRoot,…)) but were not counted by the spTree-only
   *  tally. Not schema-valid for real PowerPoint, but a hostile ZIP is not
   *  bound by the schema — that's the point. */
  extraCSldXml?: string;
}

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function titleShape(text: string, type: "title" | "ctrTitle" = "title"): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr>
    <p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

/** A BODY PLACEHOLDER shape (p:ph type="body") — inherits the master's body
 *  list styles, unlike the plain bodyShape below. */
export function bodyPlaceholderShape(paragraphs: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Content Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
    <p:spPr/><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`;
}

export function bodyShape(paragraphs: string, opts: { fillHex?: string } = {}): string {
  const fill = opts.fillHex ? `<a:solidFill><a:srgbClr val="${opts.fillHex}"/></a:solidFill>` : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr>${fill}</p:spPr><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`;
}

/** An a:p paragraph. bullet: 'char' | 'auto' | 'none' | undefined (no pPr). */
export function para(
  text: string,
  opts: {
    bullet?: "char" | "auto" | "none";
    colorHex?: string;
    schemeColor?: string;
    sizeHundredthsPt?: number;
    bold?: boolean;
    linkRelId?: string;
    /** Run language: string forces an a:rPr with that lang; null renders any rPr without a lang attr; undefined keeps the legacy default (lang="en-US" whenever an rPr is emitted for other reasons). */
    lang?: string | null;
  } = {},
): string {
  const bu =
    opts.bullet === "char"
      ? '<a:buChar char="•"/>'
      : opts.bullet === "auto"
        ? '<a:buAutoNum type="arabicPeriod"/>'
        : opts.bullet === "none"
          ? "<a:buNone/>"
          : "";
  const pPr = bu ? `<a:pPr>${bu}</a:pPr>` : "";
  const fill = opts.colorHex
    ? `<a:solidFill><a:srgbClr val="${opts.colorHex}"/></a:solidFill>`
    : opts.schemeColor
      ? `<a:solidFill><a:schemeClr val="${opts.schemeColor}"/></a:solidFill>`
      : "";
  const link = opts.linkRelId ? `<a:hlinkClick r:id="${opts.linkRelId}"/>` : "";
  const attrs =
    (opts.sizeHundredthsPt ? ` sz="${opts.sizeHundredthsPt}"` : "") + (opts.bold ? ' b="1"' : "");
  const langAttr = opts.lang === null ? "" : ` lang="${opts.lang ?? "en-US"}"`;
  const rPr =
    fill || link || attrs || opts.lang !== undefined
      ? `<a:rPr${langAttr}${attrs}>${fill}${link}</a:rPr>`
      : "";
  return `<a:p>${pPr}<a:r>${rPr}<a:t>${text}</a:t></a:r></a:p>`;
}

export function picture(opts: { descr?: string; decorative?: boolean } = {}): string {
  const descr = opts.descr !== undefined ? ` descr="${opts.descr}"` : "";
  const dec = opts.decorative
    ? '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>'
    : "";
  return `<p:pic><p:nvPicPr><p:cNvPr id="9" name="Picture"${descr}>${dec}</p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="rIdImg"/></p:blipFill><p:spPr/></p:pic>`;
}

export function pptTable(opts: { firstRow?: boolean; rows?: number; cols?: number } = {}): string {
  const rows = opts.rows ?? 2;
  const cols = opts.cols ?? 2;
  const grid = `<a:tblGrid>${'<a:gridCol w="1000"/>'.repeat(cols)}</a:tblGrid>`;
  const cell = "<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>c</a:t></a:r></a:p></a:txBody></a:tc>";
  const tr = `<a:tr h="370">${cell.repeat(cols)}</a:tr>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
    <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
    <a:tbl><a:tblPr${opts.firstRow ? ' firstRow="1"' : ""}/>${grid}${tr.repeat(rows)}</a:tbl>
    </a:graphicData></a:graphic></p:graphicFrame>`;
}

export function hyperlinkRels(entries: Array<{ id: string; target: string }>): string {
  return entries
    .map(
      (e) =>
        `<Relationship Id="${e.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${e.target}" TargetMode="External"/>`,
    )
    .join("");
}

export function videoRel(id: string): string {
  return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="media/movie1.mp4"/>`;
}

export interface BuildPptxOpts {
  slides: SlideOpts[];
  /** Override docProps/core.xml entirely (default has title + creator). */
  coreXml?: string;
  /** Default-language declaration on the presentation part. true by default. */
  declareLanguage?: boolean;
  /** Slide background solid fill hex (applied to every slide). */
  slideBgHex?: string;
  /** Override ppt/theme/theme1.xml (default = Office scheme from Task 2's test). */
  themeXml?: string;
  /** Write ppt/slideMasters/slideMaster1.xml (absent by default). */
  masterXml?: string;
}

export async function buildPptx(opts: BuildPptxOpts): Promise<Buffer> {
  const zip = new JSZip();

  const slideOverrides = opts.slides
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("");
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slideOverrides}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  );

  zip.file(
    "docProps/core.xml",
    opts.coreXml ??
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Quarterly Briefing</dc:title><dc:creator>ICJIA</dc:creator></cp:coreProperties>`,
  );

  const lang =
    opts.declareLanguage === false
      ? ""
      : `<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle>`;
  const sldIds = opts.slides
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join("");
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${sldIds}</p:sldIdLst>${lang}</p:presentation>`,
  );

  zip.file(
    "ppt/theme/theme1.xml",
    opts.themeXml ??
      `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office">
  <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
  <a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
  <a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`,
  );

  if (opts.masterXml) zip.file("ppt/slideMasters/slideMaster1.xml", opts.masterXml);

  const bg = opts.slideBgHex
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${opts.slideBgHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    : "";
  opts.slides.forEach((s, i) => {
    const title =
      s.title === null || s.title === undefined
        ? s.title === null
          ? ""
          : titleShape("")
        : titleShape(s.title);
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?><p:sld ${NS}${s.hidden ? ' show="0"' : ""}><p:cSld>${bg}<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
${s.beforeTitle ?? ""}${title}${s.body ?? ""}
</p:spTree>${s.extraCSldXml ?? ""}</p:cSld></p:sld>`,
    );
    if (s.rels) {
      zip.file(
        `ppt/slides/_rels/slide${i + 1}.xml.rels`,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${s.rels}</Relationships>`,
      );
    }
  });

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}
