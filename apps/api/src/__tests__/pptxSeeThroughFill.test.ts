/**
 * Text on a see-through fill is judged against what is actually drawn
 * (2026-11-16, user decision — the "PowerPoint shades" question, the
 * see-through half).
 *
 * A fill at 20% opacity over a white slide draws ONE colour: each channel is
 * fill·α + beneath·(1−α). Until now any colour carrying a modifier was
 * unknown, so a 16-point link at 3.77:1 on a tinted panel was never judged
 * (a real flyer, 2026-11-16). The strict rules stay:
 *   - only `alpha`, on a shape's own solid fill — alone, or after lumMod /
 *     lumOff (computed since the shaded-colours change); tint, shade and the
 *     rest are still unknown;
 *   - only over ONE stated colour — the slide background, or a solid shape
 *     that fully contains the panel. Over a picture, a gradient or a partial
 *     cover the result is not one colour and stays unknown;
 *   - where rounding the blend up or down would change pass/fail, unknown.
 *
 * And a link that asks for its text colour (PowerPoint 2019's mark, ignored
 * by earlier versions) is drawn in one of two colours. It was unknown unless
 * the two were equal; it is now also known when both give the same verdict.
 */
import { describe, it, expect } from "vitest";
import { buildPptx, bodyShape, para, rectShape } from "./helpers/minimalPptx.js";
import { analyzePptx } from "../services/pptxService.js";

const PANEL = { x: 5000000, y: 2000000, cx: 4000000, cy: 3000000 };
const INSIDE = { x: 5200000, y: 2200000, cx: 3400000, cy: 1000000 };

/** A text-free rectangle whose solid fill carries the given modifiers. */
const panel = (hex: string, modifiers: string, bounds = PANEL, id = 21) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Panel"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${bounds.x}" y="${bounds.y}"/><a:ext cx="${bounds.cx}" cy="${bounds.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${hex}">${modifiers}</a:srgbClr></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>`;
const ALPHA_20 = '<a:alpha val="20000"/>';
const text = (colorHex: string, sizeHundredthsPt = 1600) =>
  bodyShape(para("Email the project team to take part.", { colorHex, sizeHundredthsPt }), {
    bounds: INSIDE,
  });

/** A theme with a link colour — the minimal default theme has none. */
const THEME = `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="156082"/></a:accent1><a:hlink><a:srgbClr val="467886"/></a:hlink></a:clrScheme></a:themeElements></a:theme>`;

/** `slideBgHex: null` = the slide states no background at all. */
const contrastOf = async (body: string, slideBgHex: string | null = "FFFFFF") =>
  (
    await analyzePptx(
      await buildPptx({
        slides: [{ title: null, body }],
        themeXml: THEME,
        ...(slideBgHex ? { slideBgHex } : {}),
      }),
    )
  ).contrast;

describe("pptx contrast: a see-through fill over one stated colour is one colour", () => {
  it("blue text on a 20% panel over white fails at the blended colour", async () => {
    const c = await contrastOf(panel("156082", ALPHA_20) + text("0070C0"));
    expect(c.unresolvedRuns).toBe(0);
    expect(c.checkedRuns).toBe(1);
    expect(c.failing).toHaveLength(1);
    expect(c.failing[0].background).toBe("#D0DFE6");
    expect(c.failing[0].ratio).toBe(3.77);
  });

  it("black text on the same panel passes", async () => {
    const c = await contrastOf(panel("156082", ALPHA_20) + text("000000"));
    expect(c).toMatchObject({ checkedRuns: 1, unresolvedRuns: 0, failing: [] });
  });

  it("the Strict spelling of the same opacity (20%) reads the same", async () => {
    const c = await contrastOf(panel("156082", '<a:alpha val="20%"/>') + text("0070C0"));
    expect(c.failing[0]?.background).toBe("#D0DFE6");
  });

  it("text typed in the see-through shape itself is judged the same way", async () => {
    const own = `<p:sp><p:nvSpPr><p:cNvPr id="22" name="Card"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="4000000" cy="1000000"/></a:xfrm><a:solidFill><a:srgbClr val="156082">${ALPHA_20}</a:srgbClr></a:solidFill></p:spPr><p:txBody><a:bodyPr/>${para("Take part", { colorHex: "0070C0", sizeHundredthsPt: 1600 })}</p:txBody></p:sp>`;
    const c = await contrastOf(own);
    expect(c.failing[0]?.background).toBe("#D0DFE6");
  });

  it("blends over a solid card that contains it, not over the slide", async () => {
    const card = rectShape({
      fillHex: "000000",
      bounds: { x: 4000000, y: 1000000, cx: 6000000, cy: 5000000 },
    });
    // 20% of #156082 over black is #041319: white text passes, and the white
    // slide beneath the card plays no part.
    const c = await contrastOf(card + panel("156082", ALPHA_20) + text("FFFFFF"));
    expect(c).toMatchObject({ checkedRuns: 1, unresolvedRuns: 0, failing: [] });
  });

  it("one see-through panel on another blends twice", async () => {
    const inner = { x: 5100000, y: 2100000, cx: 3700000, cy: 2000000 };
    const c = await contrastOf(
      panel("156082", ALPHA_20) +
        panel("000000", '<a:alpha val="50000"/>', inner, 23) +
        text("FFFFFF"),
    );
    // #D0DFE6 then 50% black: #687073 — white on it is 5.0:1.
    expect(c).toMatchObject({ checkedRuns: 1, unresolvedRuns: 0, failing: [] });
  });
});

describe("pptx contrast: what a see-through fill still cannot tell", () => {
  it("over a gradient it is not one colour", async () => {
    const c = await contrastOf(
      rectShape({ gradient: true, bounds: { x: 4000000, y: 1000000, cx: 6000000, cy: 5000000 } }) +
        panel("156082", ALPHA_20) +
        text("0070C0"),
    );
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });

  it("over a slide whose background is not stated it is not known", async () => {
    const c = await contrastOf(panel("156082", ALPHA_20) + text("0070C0"), null);
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });

  it("partly over a solid card it is two colours", async () => {
    const half = rectShape({
      fillHex: "000000",
      bounds: { x: 4000000, y: 1000000, cx: 3000000, cy: 5000000 },
    });
    const c = await contrastOf(half + panel("156082", ALPHA_20) + text("0070C0"));
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });

  it("a tinted fill is still not guessed at", async () => {
    // lumMod / lumOff are computed since the shaded-colours change (see
    // pptxShadedColours.test.ts); tint, shade and the rest are not.
    const c = await contrastOf(panel("156082", '<a:tint val="75000"/>') + text("FFFFFF"));
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });

  it("a fill both tinted and see-through is still not guessed at", async () => {
    const c = await contrastOf(
      panel("156082", '<a:tint val="75000"/><a:alpha val="20000"/>') + text("0070C0"),
    );
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });

  it("when rounding the blend decides pass or fail, it is unknown", async () => {
    // 50% black over white is 127.5 per channel: #7F7F7F or #808080. Text at
    // #171717 is just over 4.5:1 on the lighter and just under on the darker
    // — the bar falls between them.
    const c = await contrastOf(panel("000000", '<a:alpha val="50000"/>') + text("171717"));
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });
});

describe("pptx contrast: a link drawn in one of two colours", () => {
  const LINK_TX =
    '<a:hlinkClick r:id="rId9"><a:extLst><a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}"><ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/></a:ext></a:extLst></a:hlinkClick>';
  const link = (colorHex: string, bounds = INSIDE) =>
    bodyShape(
      `<a:p><a:r><a:rPr lang="en-US" sz="1600"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill>${LINK_TX}</a:rPr><a:t>project@example.org</a:t></a:r></a:p>`,
      { bounds },
    );

  it("is known when both colours pass", async () => {
    const c = await contrastOf(link("0070C0"));
    expect(c).toMatchObject({ checkedRuns: 1, unresolvedRuns: 0, failing: [] });
  });

  it("is known when both colours fail", async () => {
    // Text colour #0070C0 (3.77:1) or the theme's link colour #467886
    // (3.58:1) — both under 4.5:1 on the tinted panel.
    const c = await contrastOf(panel("156082", ALPHA_20) + link("0070C0"));
    expect(c.unresolvedRuns).toBe(0);
    expect(c.failing).toHaveLength(1);
    expect(c.failing[0].foreground).toBe("#0070C0");
  });

  it("is still unknown when one colour passes and the other fails", async () => {
    // White text on a white slide is 1:1; the theme's link colour #467886
    // on white is 4.9:1. Which is drawn depends on who opens the file.
    const c = await contrastOf(link("FFFFFF"));
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });
});
