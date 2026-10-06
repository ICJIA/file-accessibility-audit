/**
 * A SLIDE'S BACKGROUND, FOLLOWED TO ITS LAYOUT AND MASTER (2026-10-06, user
 * decision: "follow it"). A slide with no background of its own shows its
 * layout's, else its master's — the default in PowerPoint's, Google Slides'
 * and python-pptx's templates. The contrast check read only the slide's own,
 * so explicitly coloured text on those slides was never assessed.
 *
 * Following it must never invent a background. The guards here are the ones
 * the 2026-09-01 "else white" bug taught (white titles on dark templates
 * failed at 1:1): the master's COLOUR MAP (a dark template maps bg1 to dk1),
 * gradient and picture backgrounds (still not assessed), shapes the layout or
 * master paints under the text, slides that hide those shapes, and
 * placeholders that inherit their position and fill from the layout.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { analyzePptx } from "../services/pptxService.js";
import { buildPptx } from "./helpers/minimalPptx.js";

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Office's theme, with the background fill styles real themes carry:
 *  1001 = solid phClr, 1002 = a gradient, 1003 = a picture. */
const THEME = `<?xml version="1.0"?><a:theme ${NS} name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="999999"/></a:accent2></a:clrScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs></a:gsLst></a:gradFill><a:blipFill><a:blip r:embed="rIdBg"/></a:blipFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const STD_MAP =
  'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
const DARK_MAP = STD_MAP.replace('bg1="lt1" tx1="dk1"', 'bg1="dk1" tx1="lt1"');

const master = (opts: { bg: string; shapes?: string; clrMap?: string }) =>
  `<?xml version="1.0"?><p:sldMaster ${NS}><p:cSld>${opts.bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${opts.shapes ?? ""}</p:spTree></p:cSld><p:clrMap ${opts.clrMap ?? STD_MAP}/><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
const layout = (opts: { bg?: string; shapes?: string; showMasterSp?: boolean } = {}) =>
  `<?xml version="1.0"?><p:sldLayout ${NS}${opts.showMasterSp === false ? ' showMasterSp="0"' : ""}><p:cSld>${opts.bg ?? ""}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${opts.shapes ?? ""}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const SOLID_BG = (hex: string) =>
  `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
const REF_BG = (idx: number) =>
  `<p:bg><p:bgRef idx="${idx}"><a:schemeClr val="bg1"/></p:bgRef></p:bg>`;

const xfrm = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
/** A text box at explicit bounds with one 18-pt run in the given fill XML. */
const textBox = (
  fill: string,
  text = "Figures in gray are estimates.",
  bounds = xfrm(838200, 2000000, 6000000, 800000),
) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="5" name="TextBox"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${bounds}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="1800">${fill}</a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
const SRGB = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const SCHEME = (name: string) => `<a:solidFill><a:schemeClr val="${name}"/></a:solidFill>`;
/** A non-placeholder rectangle painted on a layout or master. */
const rect = (fill: string, bounds: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="9" name="Band"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${bounds}${fill}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>`;
const FULL_SLIDE = xfrm(0, 0, 12192000, 6858000);

/** One slide on one layout on one master; the slide has no background. */
async function deck(opts: {
  slide: string;
  master: string;
  layout?: string;
  slideShowMasterSp?: boolean;
}): Promise<Buffer> {
  const buf = await buildPptx({
    themeXml: THEME,
    masterXml: opts.master,
    slides: [
      {
        title: null,
        body: opts.slide,
        rels: `<Relationship Id="rIdLayout" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
      },
    ],
  });
  const zip = await JSZip.loadAsync(buf);
  zip.file("ppt/slideLayouts/slideLayout1.xml", opts.layout ?? layout());
  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  );
  if (opts.slideShowMasterSp === false) {
    const s = await zip.file("ppt/slides/slide1.xml")!.async("string");
    zip.file("ppt/slides/slide1.xml", s.replace("<p:sld ", '<p:sld showMasterSp="0" '));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
const contrast = async (buf: Buffer) => (await analyzePptx(buf)).contrast;

describe("the master's background reaches the slide", () => {
  it("a plain white master background: grey text is checked, and fails", async () => {
    const c = await contrast(
      await deck({ master: master({ bg: SOLID_BG("FFFFFF") }), slide: textBox(SRGB("999999")) }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing.map((f) => f.ratio)).toEqual([2.85]);
  });

  it("a theme background reference (bgRef 1001, bg1) resolves through the theme's fill styles", async () => {
    const c = await contrast(
      await deck({ master: master({ bg: REF_BG(1001) }), slide: textBox(SRGB("999999")) }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing[0]!.background).toBe("#FFFFFF");
  });

  it("a dark template's colour map (bg1 = dk1): white text on it passes — never 1:1 against an assumed white", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: REF_BG(1001), clrMap: DARK_MAP }),
        slide: textBox(SRGB("FFFFFF")),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("text coloured by scheme (tx1) follows the same colour map", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: REF_BG(1001), clrMap: DARK_MAP }),
        slide: textBox(SCHEME("tx1")),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  for (const [what, bg] of [
    ["a gradient theme background (bgRef 1002)", REF_BG(1002)],
    ["a picture theme background (bgRef 1003)", REF_BG(1003)],
    [
      "a picture background on the master",
      `<p:bg><p:bgPr><a:blipFill><a:blip r:embed="rIdPic"/></a:blipFill><a:effectLst/></p:bgPr></p:bg>`,
    ],
  ] as const) {
    it(`${what} stays not assessed`, async () => {
      const c = await contrast(
        await deck({ master: master({ bg }), slide: textBox(SRGB("999999")) }),
      );
      expect(c.checkedRuns).toBe(0);
      expect(c.unresolvedRuns).toBe(1);
    });
  }
});

describe("the layout, and what the layout and master paint", () => {
  it("the layout's background beats the master's", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF") }),
        layout: layout({ bg: SOLID_BG("000000") }),
        slide: textBox(SRGB("FFFFFF")),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("a solid band the master paints under the text is the text's background", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF"), shapes: rect(SRGB("1F3864"), FULL_SLIDE) }),
        slide: textBox(SRGB("FFFFFF")),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("a picture the layout paints under the text makes it not assessed", async () => {
    const pic = `<p:pic><p:nvPicPr><p:cNvPr id="8" name="Photo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPic"/></p:blipFill><p:spPr>${FULL_SLIDE}</p:spPr></p:pic>`;
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF") }),
        layout: layout({ shapes: pic }),
        slide: textBox(SRGB("999999")),
      }),
    );
    expect(c.checkedRuns).toBe(0);
  });

  it("a slide that hides its master's shapes sits on the master's background, not on its band", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF"), shapes: rect(SRGB("1F3864"), FULL_SLIDE) }),
        slide: textBox(SRGB("999999")),
        slideShowMasterSp: false,
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing[0]!.background).toBe("#FFFFFF");
  });

  it("a layout that hides the master's shapes hides them from the slide too", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF"), shapes: rect(SRGB("1F3864"), FULL_SLIDE) }),
        layout: layout({ showMasterSp: false }),
        slide: textBox(SRGB("999999")),
      }),
    );
    expect(c.failing[0]!.background).toBe("#FFFFFF");
  });
});

describe("a shape's own fill, read as strictly as the background", () => {
  /** A rectangle filled by its THEME STYLE (p:style fillRef) — how PowerPoint
   *  draws every inserted shape — holding white text. */
  const styledRect = (fillRef: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="6" name="Rectangle 5"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(838200, 2000000, 6000000, 800000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef>${fillRef}<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="1800">${SRGB("FFFFFF")}</a:rPr><a:t>Questions for the board</a:t></a:r></a:p></p:txBody></p:sp>`;

  it("white text in a theme-styled accent rectangle is judged against the accent, not the white slide", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF") }),
        slide: styledRect('<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>'),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("text in a gradient-filled shape stays not assessed", async () => {
    const grad = `<p:sp><p:nvSpPr><p:cNvPr id="6" name="Rectangle 5"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(838200, 2000000, 6000000, 800000)}<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="1F3864"/></a:gs><a:gs pos="100000"><a:srgbClr val="4472C4"/></a:gs></a:gsLst></a:gradFill></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="1800">${SRGB("FFFFFF")}</a:rPr><a:t>Questions for the board</a:t></a:r></a:p></p:txBody></p:sp>`;
    const c = await contrast(
      await deck({ master: master({ bg: SOLID_BG("FFFFFF") }), slide: grad }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });
});

describe("placeholders inherit their position and fill from the layout", () => {
  const titlePh = (fill: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="4000">${fill}</a:rPr><a:t>Program Update</a:t></a:r></a:p></p:txBody></p:sp>`;
  const layoutTitle = (spPr: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${spPr}</p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>`;
  const LOGO_FAR_AWAY = `<p:pic><p:nvPicPr><p:cNvPr id="8" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdPic"/></p:blipFill><p:spPr>${xfrm(10500000, 6000000, 1000000, 500000)}</p:spPr></p:pic>`;

  it("a title with no position of its own takes the layout's, so a logo elsewhere does not hide its background", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF"), shapes: LOGO_FAR_AWAY }),
        layout: layout({ shapes: layoutTitle(xfrm(838200, 365125, 10515600, 1325563)) }),
        slide: titlePh(SRGB("999999")),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing.map((f) => f.ratio)).toEqual([2.85]);
  });

  it("a fill the layout gives the placeholder is the text's background", async () => {
    const c = await contrast(
      await deck({
        master: master({ bg: SOLID_BG("FFFFFF") }),
        layout: layout({
          shapes: layoutTitle(`${xfrm(838200, 365125, 10515600, 1325563)}${SRGB("000000")}`),
        }),
        slide: titlePh(SRGB("FFFFFF")),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });
});
