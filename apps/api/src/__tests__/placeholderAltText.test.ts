/**
 * ALT TEXT THAT IS NOT A DESCRIPTION (2026-10-06, user decision: "count it as
 * missing"). WCAG lists it as a failure of 1.1.1 — F30, text alternatives
 * that are not alternatives, such as file names or placeholder text.
 * Producers write it when the author writes nothing: Google Slides and
 * python-pptx put the image's file name in the description (a real Google
 * Slides export in the test set; python-pptx 1.0.2), openpyxl writes
 * "Picture" on every image (its own source, 3.1.5). Exact matches only — the
 * WHOLE description must be an image file name or one placeholder word,
 * optionally numbered; a real description that mentions a picture stands.
 */
import { describe, it, expect } from "vitest";
import { isPlaceholderAltText } from "@file-audit/analyzer/placeholderAlt";
import { analyzeDocx } from "../services/docxService.js";
import { analyzePptx } from "../services/pptxService.js";
import { analyzeXlsx } from "../services/xlsxService.js";
import { scoreDocx, scorePptx, scoreXlsx } from "../services/scorer.js";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildPptx, picture } from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";

describe("isPlaceholderAltText — the whole description is a file name or a placeholder word", () => {
  for (const t of [
    "chart.png",
    "GA details.png",
    "IMG_1234.JPG",
    "Map of Illinois coverage by Megs and TFs.jpg",
    "C:\\Users\\staff\\Pictures\\chart.png",
    "Picture",
    "picture 1",
    "Image1",
    "image_3",
    "Graphic",
    "Photo 12",
    "spacer",
    "  image 2  ",
    // An auto-tagger's page labels (OpenDataLoader, the remediation
    // pipeline's tagger — user decision 2026-10-06, "count it as missing").
    "Table (page 30)",
    "Image (page 1)",
    "figure (page 12)",
    // The same labels as real files in the test set carry them: a
    // remediated report's "Illustration (page 1)", and "Illustration on
    // page 32" in two agency reports.
    "Illustration (page 1)",
    "Illustration on page 32",
    "Table on page 3",
  ]) {
    it(`${JSON.stringify(t)} is not a description`, () =>
      expect(isPlaceholderAltText(t)).toBe(true));
  }
  for (const t of [
    "Bar chart of awards by program",
    "A picture containing text Description automatically generated",
    "Image related to 2008",
    "Image result for anger clipart",
    "Photo of the board members",
    "Logo",
    "Chart",
    "Figure 3 shows the rise in awards",
    "The map, saved as map.png",
    "Table 3 (page 30) shows awards by county",
    "Illustration of the courthouse on page 3",
    "Illustration on page 32 of the 2011 report: drug arrests by county",
    "",
  ]) {
    it(`${JSON.stringify(t)} stands`, () => expect(isPlaceholderAltText(t)).toBe(false));
  }
});

const altCategory = (r: {
  categories: Array<{ id: string; score: number | null; findings: string[] }>;
}) => r.categories.find((c) => c.id === "alt_text")!;

describe("each Office format counts such a picture as undescribed and names what it carries", () => {
  it("Word: a drawing whose description is its file name", async () => {
    const body = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905000" cy="1905000"/><wp:docPr id="1" name="Picture 1" descr="chart.png"/></wp:inline></w:drawing></w:r></w:p>`;
    const a = await analyzeDocx(await buildDocx({ body }));
    expect(a.images[0]).toMatchObject({ altText: null, placeholderAlt: "chart.png" });
    const c = altCategory(scoreDocx(a));
    expect(c.score).toBe(0);
    expect(c.findings.join(" ")).toMatch(/chart\.png/);
  });

  it("Word: a legacy VML picture whose alt is a placeholder word", async () => {
    const body = `<w:p><w:r><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" id="_x0000_i1025" alt="Picture"><v:imagedata r:id="rId9"/></v:shape></w:pict></w:r></w:p>`;
    const a = await analyzeDocx(await buildDocx({ body }));
    expect(a.images[0]).toMatchObject({ altText: null, placeholderAlt: "Picture" });
  });

  it("PowerPoint: Google Slides' file-name description", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [{ title: "Reports", body: picture({ descr: "GA details.png" }) }],
      }),
    );
    expect(a.images[0]).toMatchObject({ altText: null, placeholderAlt: "GA details.png" });
    const c = altCategory(scorePptx(a));
    expect(c.score).toBe(0);
    expect(c.findings.join(" ")).toMatch(/GA details\.png/);
  });

  it('Excel: openpyxl\'s "Picture"', async () => {
    const a = await analyzeXlsx(
      await buildXlsx({
        sheets: [{ name: "Awards", drawings: [{ kind: "pic", descr: "Picture" }] }],
      }),
    );
    expect(a.images[0]).toMatchObject({ altText: null, placeholderAlt: "Picture" });
    const c = altCategory(scoreXlsx(a));
    expect(c.score).toBe(0);
    expect(c.findings.join(" ")).toMatch(/Picture/);
  });

  it("a real description is untouched, and carries no placeholder field", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [{ title: "Reports", body: picture({ descr: "Bar chart of awards by program" }) }],
      }),
    );
    expect(a.images[0]!.altText).toBe("Bar chart of awards by program");
    expect(a.images[0]).not.toHaveProperty("placeholderAlt");
  });
});
