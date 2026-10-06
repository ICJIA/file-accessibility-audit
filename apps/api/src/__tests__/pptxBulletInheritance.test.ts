/**
 * WHERE A SLIDE PARAGRAPH'S BULLET COMES FROM (2026-10-06, plan step 3 —
 * producer-shaped traps). PowerPoint resolves a placeholder paragraph's bullet
 * through a chain: the paragraph itself, its shape's own list style, the
 * matching placeholder on the slide's LAYOUT, and only then the master's body
 * text style. The parser read the master alone, so:
 *
 *   - the Title Slide layout's subtitle — bullets switched off in the layout
 *     (`<a:buNone/>`), as in PowerPoint's own and python-pptx's default
 *     template — was counted as a real list item;
 *   - footer, date and slide-number placeholders, which take the master's
 *     "other" text style (no bullets), were counted as list items too.
 *
 * Found by building the gate's report with python-pptx 1.0.2: three bullets
 * read as "4 real" list items.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { analyzePptx } from "../services/pptxService.js";
import { buildPptx } from "./helpers/minimalPptx.js";

const P_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

/** A master whose body text style bullets every level, as PowerPoint's does. */
const MASTER = `<?xml version="1.0"?><p:sldMaster ${P_NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:txStyles><p:titleStyle><a:lvl1pPr><a:buNone/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:lvl1pPr><a:lvl2pPr><a:buChar char="–"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr/></p:otherStyle></p:txStyles></p:sldMaster>`;

/** A layout holding the given placeholder shapes. */
const layout = (shapes: string) =>
  `<?xml version="1.0"?><p:sldLayout ${P_NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sldLayout>`;
const layoutPh = (ph: string, lstStyle = "") =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Placeholder"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle>${lstStyle}</a:lstStyle><a:p/></p:txBody></p:sp>`;
/** A slide placeholder shape with plain paragraphs (no bullet marks of their own). */
const slidePh = (ph: string, paragraphs: string[], id = 3) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Placeholder ${id}"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paragraphs.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
const LAYOUT_REL =
  '<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>';

/** One slide on one layout, the master above. */
async function deck(slideBody: string, layoutXml: string): Promise<Buffer> {
  const buf = await buildPptx({
    masterXml: MASTER,
    slides: [{ title: "Program Update", body: slideBody, rels: LAYOUT_REL }],
  });
  const zip = await JSZip.loadAsync(buf);
  zip.file("ppt/slideLayouts/slideLayout1.xml", layoutXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("PowerPoint list items: a placeholder's bullet resolved through its layout", () => {
  it("a subtitle whose layout switches bullets off is not a list item", async () => {
    const a = await analyzePptx(
      await deck(
        slidePh('<p:ph type="subTitle" idx="1"/>', ["Fiscal year 2026 results for the board"]),
        layout(
          layoutPh(
            '<p:ph type="subTitle" idx="1"/>',
            '<a:lvl1pPr marL="0" indent="0" algn="ctr"><a:buNone/></a:lvl1pPr>',
          ),
        ),
      ),
    );
    expect(a.lists.realListItems).toBe(0);
  });

  it("a body placeholder its layout leaves alone still inherits the master's bullets", async () => {
    const a = await analyzePptx(
      await deck(
        slidePh('<p:ph idx="1"/>', ["Job training", "Housing support", "Reviewed awards"]),
        layout(layoutPh('<p:ph idx="1"/>')),
      ),
    );
    expect(a.lists.realListItems).toBe(3);
  });

  it("a layout that adds bullets where the master has none makes them list items", async () => {
    // Level 3 (lvl="2"): the master's body style bullets levels 1 and 2 only.
    const steps = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="2"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${["First step", "Second step"].map((t) => `<a:p><a:pPr lvl="2"/><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
    const a = await analyzePptx(
      await deck(
        steps,
        layout(
          layoutPh(
            '<p:ph type="body" idx="2"/>',
            '<a:lvl3pPr><a:buAutoNum type="arabicPeriod"/></a:lvl3pPr>',
          ),
        ),
      ),
    );
    expect(a.lists.realListItems).toBe(2);
  });

  it("the slide's own list style beats its layout's", async () => {
    const own = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:buNone/></a:lvl1pPr></a:lstStyle><a:p><a:r><a:t>A caption under the chart</a:t></a:r></a:p></p:txBody></p:sp>`;
    const a = await analyzePptx(await deck(own, layout(layoutPh('<p:ph idx="1"/>'))));
    expect(a.lists.realListItems).toBe(0);
  });

  for (const type of ["sldNum", "ftr", "dt"]) {
    it(`a ${type} placeholder takes the master's "other" style: no bullet, not a list item`, async () => {
      const a = await analyzePptx(
        await deck(
          slidePh(`<p:ph type="${type}" sz="quarter" idx="12"/>`, [
            type === "sldNum" ? "7" : "Program Office",
          ]),
          layout(layoutPh(`<p:ph type="${type}" sz="quarter" idx="12"/>`)),
        ),
      );
      expect(a.lists.realListItems).toBe(0);
    });
  }

  it("with no layout part at all, a body placeholder still falls back to the master", async () => {
    const buf = await buildPptx({
      masterXml: MASTER,
      slides: [
        { title: "Program Update", body: slidePh('<p:ph type="body" idx="1"/>', ["One", "Two"]) },
      ],
    });
    expect((await analyzePptx(buf)).lists.realListItems).toBe(2);
  });
});
