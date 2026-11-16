/**
 * PowerPoint's shaded colours are computed, not skipped (2026-11-16, user
 * decision — the second half of the "PowerPoint shades" question).
 *
 * "Blue, Accent 1, Darker 25%" is written as the accent colour with
 * `lumMod 75000`; "Lighter 40%" as `lumMod 60000` + `lumOff 40000`. Both
 * change the colour's lightness in HSL and nothing else, so the result can
 * be worked out. Until now any modifier meant unknown: white titles on a
 * darker band were never judged, though they pass at about 4.85:1.
 *
 * The expected colours below are the ones PowerPoint's own palette shows for
 * the Office theme's Accent 1 (#4472C4). A computed channel can land one
 * step either side of what a given program draws, so every shaded colour
 * carries that range, and a verdict that differs across it is not given.
 * Still unknown, by design: tint, shade, satMod, hueMod and the rest, and a
 * see-through TEXT colour.
 */
import { describe, it, expect } from "vitest";
import { buildPptx, bodyShape, para } from "./helpers/minimalPptx.js";
import { analyzePptx } from "../services/pptxService.js";

const BAND = { x: 1000000, y: 1000000, cx: 8000000, cy: 2000000 };
const INSIDE = { x: 1200000, y: 1200000, cx: 6000000, cy: 1000000 };
const band = (colorXml: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="21" name="Band"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${BAND.x}" y="${BAND.y}"/><a:ext cx="${BAND.cx}" cy="${BAND.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill>${colorXml}</a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>`;
const accent1 = (mods: string) => `<a:schemeClr val="accent1">${mods}</a:schemeClr>`;
const text = (colorHex: string, sizeHundredthsPt = 1200) =>
  bodyShape(para("Quarterly results", { colorHex, sizeHundredthsPt }), { bounds: INSIDE });
/** A run whose colour is itself a modified colour. */
const shadedText = (colorXml: string, sz = 1200) =>
  bodyShape(
    `<a:p><a:r><a:rPr lang="en-US" sz="${sz}"><a:solidFill>${colorXml}</a:solidFill></a:rPr><a:t>Quarterly results</a:t></a:r></a:p>`,
    { bounds: { x: 1200000, y: 4000000, cx: 6000000, cy: 1000000 } },
  );

const contrastOf = async (body: string) =>
  (await analyzePptx(await buildPptx({ slides: [{ title: null, body }], slideBgHex: "FFFFFF" })))
    .contrast;

/** Within one step per channel of what PowerPoint's palette shows. */
const near = (actual: string, expected: string) => {
  const ch = (h: string, i: number) => parseInt(h.replace("#", "").slice(i * 2, i * 2 + 2), 16);
  return [0, 1, 2].every((i) => Math.abs(ch(actual, i) - ch(expected, i)) <= 1);
};

describe("pptx: lumMod / lumOff are computed to PowerPoint's own palette", () => {
  it.each([
    ["Darker 25%", '<a:lumMod val="75000"/>', "2F5597"],
    ["Darker 50%", '<a:lumMod val="50000"/>', "1F3864"],
    ["Lighter 40%", '<a:lumMod val="60000"/><a:lumOff val="40000"/>', "8FAADC"],
    ["Lighter 60%", '<a:lumMod val="40000"/><a:lumOff val="60000"/>', "B4C7E7"],
    ["Lighter 80%", '<a:lumMod val="20000"/><a:lumOff val="80000"/>', "DAE3F3"],
  ])("Accent 1, %s", async (_name, mods, expected) => {
    // Text in the palette's own colour sits at about 1:1 on the band: it
    // fails whichever way the band rounds, and the finding shows the band.
    const c = await contrastOf(band(accent1(mods)) + text(expected));
    expect(c.unresolvedRuns).toBe(0);
    expect(c.failing).toHaveLength(1);
    expect(near(c.failing[0]!.background, expected)).toBe(true);
  });

  it("white text on a band shaded 25% darker is checked, and passes", async () => {
    const c = await contrastOf(band(accent1('<a:lumMod val="75000"/>')) + text("FFFFFF"));
    expect(c).toMatchObject({ checkedRuns: 1, unresolvedRuns: 0, failing: [] });
  });

  it("the Strict spelling (75%) reads the same", async () => {
    const c = await contrastOf(band(accent1('<a:lumMod val="75%"/>')) + text("2F5597"));
    expect(near(c.failing[0]!.background, "2F5597")).toBe(true);
  });

  it("a shaded TEXT colour is computed too", async () => {
    // "Text 1, Lighter 50%": black, lumMod 50% + lumOff 50% — mid grey,
    // about 3.9:1 on white at 12 point.
    const c = await contrastOf(
      shadedText(
        '<a:srgbClr val="000000"><a:lumMod val="50000"/><a:lumOff val="50000"/></a:srgbClr>',
      ),
    );
    expect(c.unresolvedRuns).toBe(0);
    expect(c.failing).toHaveLength(1);
    expect(near(c.failing[0]!.foreground, "7F7F7F")).toBe(true);
  });

  it("a shaded fill that is also see-through is shaded, then blended", async () => {
    // Accent 1 darker 25% (#2F5597) at 20% over white is about #D5DDEA.
    const c = await contrastOf(
      band(accent1('<a:lumMod val="75000"/><a:alpha val="20000"/>')) + text("D5DDEA"),
    );
    expect(c.unresolvedRuns).toBe(0);
    expect(near(c.failing[0]!.background, "D5DDEA")).toBe(true);
  });
});

describe("pptx: what a shaded colour still cannot tell", () => {
  it("when one step of rounding decides pass or fail, it is unknown", async () => {
    // Black with lumOff 46.471% is grey level 118.5: #767676 (4.54:1 on
    // white) or #777777 (4.48:1). The 4.5 bar falls between them.
    const c = await contrastOf(
      shadedText('<a:srgbClr val="000000"><a:lumOff val="46471"/></a:srgbClr>'),
    );
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });

  it.each(["tint", "shade", "satMod", "hueMod", "lumMod-then-tint"])(
    "%s is still not guessed at",
    async (kind) => {
      const mods =
        kind === "lumMod-then-tint"
          ? '<a:lumMod val="75000"/><a:tint val="50000"/>'
          : `<a:${kind} val="50000"/>`;
      const c = await contrastOf(band(accent1(mods)) + text("FFFFFF"));
      expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
    },
  );

  it("a see-through text colour is still not guessed at", async () => {
    const c = await contrastOf(
      shadedText('<a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr>'),
    );
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });

  it("a modifier after the opacity is not a form PowerPoint writes", async () => {
    const c = await contrastOf(
      band(accent1('<a:alpha val="20000"/><a:lumMod val="75000"/>')) + text("FFFFFF"),
    );
    expect(c).toMatchObject({ checkedRuns: 0, unresolvedRuns: 1, failing: [] });
  });
});
