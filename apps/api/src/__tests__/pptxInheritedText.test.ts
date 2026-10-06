/**
 * A RUN'S COLOUR, SIZE AND WEIGHT, FOLLOWED THROUGH THE TEXT STYLES
 * (2026-10-06, user decision: "follow it"). Most PowerPoint text sets no
 * colour of its own: it takes it from its shape's list style, the layout's
 * and master's matching placeholder, and finally the master's title, body or
 * "other" text style. The contrast walk read only a colour set on the run
 * itself, so most of the text in a real deck was never checked.
 *
 * Same strict rules as the backgrounds: one stated colour (theme colours
 * under the colour map), no modifier (lighter/darker, transparency, tint …)
 * and no gradient guessed at. Where PowerPoint's own precedence is not
 * certain — a paragraph's default run properties, a text box's two possible
 * defaults, a slide that re-maps the theme colours — two sources that
 * disagree leave the run unknown, never guessed.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { analyzePptx } from "../services/pptxService.js";
import { buildPptx } from "./helpers/minimalPptx.js";

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const THEME = `<?xml version="1.0"?><a:theme ${NS} name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:hlink><a:srgbClr val="0563C1"/></a:hlink></a:clrScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const STD_MAP =
  'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
const DARK_MAP = STD_MAP.replace('bg1="lt1" tx1="dk1"', 'bg1="dk1" tx1="lt1"');
const SRGB = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const SCHEME = (name: string, mods = "") =>
  `<a:solidFill><a:schemeClr val="${name}">${mods}</a:schemeClr></a:solidFill>`;
const WHITE_BG = `<p:bg><p:bgPr>${SRGB("FFFFFF")}<a:effectLst/></p:bgPr></p:bg>`;
/** A list style (a:lstStyle or a txStyles child) setting level 1's run defaults. */
const lvl1 = (attrs: string, fill = "") =>
  `<a:lvl1pPr><a:defRPr${attrs}>${fill}</a:defRPr></a:lvl1pPr>`;
/** What PowerPoint writes in both the master's other style and the
 *  presentation's defaults: 18-pt text in tx1. */
const TEXT_DEFAULTS = lvl1(' sz="1800"', SCHEME("tx1"));

const master = (
  opts: { title?: string; body?: string; other?: string; bg?: string; shapes?: string } = {},
) =>
  `<?xml version="1.0"?><p:sldMaster ${NS}><p:cSld>${opts.bg ?? WHITE_BG}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${opts.shapes ?? ""}</p:spTree></p:cSld><p:clrMap ${STD_MAP}/><p:txStyles><p:titleStyle>${opts.title ?? ""}</p:titleStyle><p:bodyStyle>${opts.body ?? ""}</p:bodyStyle><p:otherStyle>${opts.other ?? TEXT_DEFAULTS}</p:otherStyle></p:txStyles></p:sldMaster>`;
const layout = (shapes = "", bg = "") =>
  `<?xml version="1.0"?><p:sldLayout ${NS}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const xfrm = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
const BOUNDS = xfrm(838200, 2000000, 6000000, 800000);
const WIDE = xfrm(0, 1000000, 12192000, 3000000);

/** A shape holding one run. rPr is the run's properties after its opening
 *  tag's attributes: ">" alone = a run that states nothing. */
const shape = (opts: {
  ph?: string;
  rPr?: string;
  lstStyle?: string;
  style?: string;
  bodyPr?: string;
  pPr?: string;
  spPr?: string;
  text?: string;
}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Shape 2"/><p:cNvSpPr${opts.ph ? "" : ' txBox="1"'}/><p:nvPr>${opts.ph ?? ""}</p:nvPr></p:nvSpPr><p:spPr>${opts.spPr ?? BOUNDS}</p:spPr>${opts.style ?? ""}<p:txBody>${opts.bodyPr ?? "<a:bodyPr/>"}<a:lstStyle>${opts.lstStyle ?? ""}</a:lstStyle><a:p>${opts.pPr ?? ""}<a:r><a:rPr lang="en-US"${opts.rPr ?? ">"}</a:rPr><a:t>${opts.text ?? "Totals exclude pending awards."}</a:t></a:r></a:p></p:txBody></p:sp>`;
/** A text-free rectangle on the slide. */
const rect = (fill: string, bounds = WIDE, style = "") =>
  `<p:sp><p:nvSpPr><p:cNvPr id="9" name="Band"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${bounds}${fill}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${style}</p:sp>`;
/** The theme-styled look PowerPoint gives an inserted shape: accent fill,
 *  white (lt1) text. */
const SHAPE_STYLE = `<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>`;

async function deck(opts: {
  slide: string;
  master: string;
  layout?: string;
  /** p:defaultTextStyle content; defaults to what PowerPoint writes. */
  defaultTextStyle?: string;
  /** The slide's own colour-map override. */
  slideClrMap?: string;
}) {
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
  const pres = await zip.file("ppt/presentation.xml")!.async("string");
  zip.file(
    "ppt/presentation.xml",
    pres.replace(
      /<p:defaultTextStyle>.*<\/p:defaultTextStyle>/s,
      `<p:defaultTextStyle>${opts.defaultTextStyle ?? TEXT_DEFAULTS}</p:defaultTextStyle>`,
    ),
  );
  if (opts.slideClrMap) {
    const s = await zip.file("ppt/slides/slide1.xml")!.async("string");
    zip.file(
      "ppt/slides/slide1.xml",
      s.replace(
        "</p:cSld>",
        `</p:cSld><p:clrMapOvr><a:overrideClrMapping ${opts.slideClrMap}/></p:clrMapOvr>`,
      ),
    );
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
const contrast = async (buf: Buffer) => (await analyzePptx(buf)).contrast;

describe("a placeholder's colour, from the layout and the master's text styles", () => {
  it("a title with no colour of its own takes the master's title style (tx1) — checked", async () => {
    const c = await contrast(
      await deck({
        master: master({ title: lvl1(' sz="4400"', SCHEME("tx1")) }),
        slide: shape({ ph: '<p:ph type="title"/>' }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("body text the master's body style colours light grey is caught", async () => {
    const c = await contrast(
      await deck({
        master: master({ body: lvl1(' sz="2400"', SRGB("999999")) }),
        slide: shape({ ph: '<p:ph idx="1"/>' }),
      }),
    );
    expect(c.failing.map((f) => [f.foreground, f.ratio])).toEqual([["#999999", 2.85]]);
  });

  it("the layout's placeholder colour beats the master's: white on the layout's black", async () => {
    const c = await contrast(
      await deck({
        master: master({ body: lvl1(' sz="2400"', SCHEME("tx1")) }),
        layout: layout(
          `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Content"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr>${BOUNDS}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle>${lvl1("", SRGB("FFFFFF"))}</a:lstStyle><a:p/></p:txBody></p:sp>`,
          `<p:bg><p:bgPr>${SRGB("000000")}<a:effectLst/></p:bgPr></p:bg>`,
        ),
        slide: shape({ ph: '<p:ph idx="1"/>' }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("the shape's own list style beats both", async () => {
    const c = await contrast(
      await deck({
        master: master({ body: lvl1(' sz="2400"', SCHEME("tx1")) }),
        slide: shape({ ph: '<p:ph idx="1"/>', lstStyle: lvl1("", SRGB("999999")) }),
      }),
    );
    expect(c.failing.map((f) => f.ratio)).toEqual([2.85]);
  });

  it("a colour on the run itself still wins", async () => {
    const c = await contrast(
      await deck({
        master: master({ body: lvl1(' sz="2400"', SRGB("999999")) }),
        slide: shape({ ph: '<p:ph idx="1"/>', rPr: `>${SRGB("000000")}` }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });
});

describe("a text box's colour, from the master's other style and the presentation defaults", () => {
  it("when the two agree (as PowerPoint writes them), a text box is checked", async () => {
    const c = await contrast(await deck({ master: master(), slide: shape({}) }));
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("when they disagree, the colour is unknown — not guessed", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        defaultTextStyle: lvl1(' sz="1800"', SRGB("999999")),
        slide: shape({}),
      }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });

  it("when only one of them states a colour, the colour is unknown", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        defaultTextStyle: '<a:defPPr><a:defRPr lang="en-US"/></a:defPPr>',
        slide: shape({}),
      }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });

  it("an inserted shape's theme style (white text, fontRef lt1) on its accent fill is checked", async () => {
    // 11 pt, so the colour decides: white on #4472C4 is 4.72:1 and passes;
    // the defaults' black would be 4.45:1 and fail.
    const c = await contrast(
      await deck({ master: master(), slide: shape({ style: SHAPE_STYLE, rPr: ' sz="1100">' }) }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });
});

describe("a paragraph's own default run properties", () => {
  it("agreeing with what the text inherits: checked", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide: shape({ pPr: `<a:pPr><a:defRPr sz="1800">${SCHEME("tx1")}</a:defRPr></a:pPr>` }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
  });

  it("disagreeing with it: unknown (PowerPoint's precedence here is not certain)", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide: shape({ pPr: `<a:pPr><a:defRPr>${SRGB("999999")}</a:defRPr></a:pPr>` }),
      }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });
});

describe("modified colours are not guessed at (the backgrounds' rule)", () => {
  it("Text 1, lighter 50% (lumMod/lumOff) is not read as plain black", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide: shape({
          rPr: ` sz="1100">${SCHEME("tx1", '<a:lumMod val="50000"/><a:lumOff val="50000"/>')}`,
        }),
      }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });

  it("nor is text with transparency (alpha)", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide: shape({ rPr: ` sz="1100">${SCHEME("tx1", '<a:alpha val="50000"/>')}` }),
      }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });

  it("a band filled 'Accent 1, lighter 60%' beneath black text is not read as plain Accent 1 (which would fail it)", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide:
          rect(SCHEME("accent1", '<a:lumMod val="40000"/><a:lumOff val="60000"/>')) +
          shape({ rPr: ` sz="1100">${SRGB("000000")}` }),
      }),
    );
    expect(c.failing).toEqual([]);
    expect(c.unresolvedRuns).toBe(1);
  });
});

describe("what is behind the text", () => {
  it("a shape PowerPoint styled (accent fill via the theme) is the background of a text box laid on it", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide: rect("", WIDE, SHAPE_STYLE) + shape({ rPr: ` sz="1800">${SRGB("FFFFFF")}` }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("a placeholder's fill inherited from the layout is the background of a text box laid on it", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        layout: layout(
          `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${WIDE}${SRGB("000000")}</p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>`,
        ),
        slide:
          `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>` +
          shape({ rPr: ` sz="1800">${SRGB("FFFFFF")}` }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("a shape set to show the slide's background (useBgFill) paints that background, not its theme style's accent", async () => {
    // PowerPoint's designer lays a full-slide rectangle like this under the
    // content; its style still names the accent fill it would otherwise use.
    const backdrop = rect("", xfrm(0, 0, 12192000, 6858000), SHAPE_STYLE).replace(
      "<p:sp>",
      '<p:sp useBgFill="1">',
    );
    const c = await contrast(
      await deck({
        master: master(),
        slide: backdrop + shape({ rPr: ` sz="1100">${SRGB("000000")}` }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("such a shape that ALSO states a fill of its own (black) is unknown — which one PowerPoint shows is not certain", async () => {
    // A real designer slide: the backdrop marked useBgFill also carries an
    // explicit tx1 fill; LibreOffice draws it black, and the link on it.
    const backdrop = rect(SCHEME("tx1"), xfrm(0, 0, 12192000, 6858000), SHAPE_STYLE).replace(
      "<p:sp>",
      '<p:sp useBgFill="1">',
    );
    const c = await contrast(
      await deck({
        master: master(),
        slide: backdrop + shape({ rPr: ` sz="1100">${SRGB("000000")}` }),
      }),
    );
    expect(c.failing).toEqual([]);
    expect(c.unresolvedRuns).toBe(1);
  });

  it("text in such a shape is judged against the slide's background too", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide: shape({ style: SHAPE_STYLE, rPr: ` sz="1100">${SRGB("000000")}` }).replace(
          "<p:sp>",
          '<p:sp useBgFill="1">',
        ),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("a highlighted run is judged against its highlight", async () => {
    const c = await contrast(
      await deck({
        master: master(),
        slide: shape({
          rPr: ` sz="1800">${SRGB("FFFFFF")}<a:highlight><a:srgbClr val="000000"/></a:highlight>`,
        }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("a slide that re-maps the theme colours (dark slide, light master) never fails white text against the master's background read under the master's map", async () => {
    const c = await contrast(
      await deck({
        master: master({
          bg: `<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>`,
        }),
        slideClrMap: DARK_MAP,
        slide: shape({ rPr: ` sz="1800">${SCHEME("tx1")}` }),
      }),
    );
    expect(c.failing).toEqual([]);
    expect(c.unresolvedRuns).toBe(1);
  });
});

describe("link text", () => {
  // The theme's hyperlink colour here is Office's #0563C1, laid on a band
  // of #4472C4 the master paints.
  const LINK_THEME_MASTER = master({
    shapes: rect(SRGB("4472C4")),
  });
  const LINK_RUN = (fill = "", ext = "") =>
    ` sz="1800">${fill}<a:hlinkClick r:id="rIdLink">${ext}</a:hlinkClick>`;
  const TX_EXT =
    '<a:extLst><a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}"><ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/></a:ext></a:extLst>';

  it("a link is drawn in the theme's hyperlink colour, not the text colour it inherits", async () => {
    const c = await contrast(
      await deck({ master: LINK_THEME_MASTER, slide: shape({ rPr: LINK_RUN() }) }),
    );
    expect(c.failing.map((f) => [f.foreground, f.background])).toEqual([["#0563C1", "#4472C4"]]);
  });

  it("…even when the run states a colour of its own (PowerPoint draws links in the theme's colour)", async () => {
    const c = await contrast(
      await deck({ master: LINK_THEME_MASTER, slide: shape({ rPr: LINK_RUN(SRGB("FFFFFF")) }) }),
    );
    expect(c.failing.map((f) => f.foreground)).toEqual(["#0563C1"]);
  });

  it("a link marked to use its text colour (PowerPoint 2019+; earlier versions ignore the mark) is unknown when the two differ", async () => {
    const c = await contrast(
      await deck({
        master: LINK_THEME_MASTER,
        slide: shape({ rPr: LINK_RUN(SRGB("FFFFFF"), TX_EXT) }),
      }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });
});

describe("size and weight follow the same chain", () => {
  const GREY_BODY = (attrs: string) => master({ body: lvl1(attrs, SRGB("808080")) });

  it("28-pt body text from the master is large: #808080 (3.95:1) passes", async () => {
    const c = await contrast(
      await deck({ master: GREY_BODY(' sz="2800"'), slide: shape({ ph: '<p:ph idx="1"/>' }) }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("shrunk by autofit to 14 pt, the same text is normal size and fails", async () => {
    const c = await contrast(
      await deck({
        master: GREY_BODY(' sz="2800"'),
        slide: shape({
          ph: '<p:ph idx="1"/>',
          bodyPr: '<a:bodyPr><a:normAutofit fontScale="50000"/></a:bodyPr>',
        }),
      }),
    );
    expect(c.failing.map((f) => [f.ratio, f.large])).toEqual([[3.95, false]]);
  });

  it("14-pt text the master makes bold is large", async () => {
    const c = await contrast(
      await deck({
        master: GREY_BODY(' sz="1400" b="1"'),
        slide: shape({ ph: '<p:ph idx="1"/>' }),
      }),
    );
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toEqual([]);
  });

  it("14-pt text whose weight is uncertain stays unknown in the band where weight decides", async () => {
    const c = await contrast(
      await deck({
        master: GREY_BODY(' sz="1400"'),
        slide: shape({ ph: '<p:ph idx="1"/>', pPr: '<a:pPr><a:defRPr b="1"/></a:pPr>' }),
      }),
    );
    expect(c.checkedRuns).toBe(0);
    expect(c.unresolvedRuns).toBe(1);
  });
});
