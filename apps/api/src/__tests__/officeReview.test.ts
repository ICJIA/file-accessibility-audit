/**
 * The 2026-11-12 review of the Office (Word / PowerPoint / Excel) paths.
 * Every test here is behavioural: real package bytes through analyze* and
 * score*, asserting the category score, its severity, and the conformance
 * verdict — the three things a report shows.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildDocx, DOCX_NS, paragraph, inlineImage } from "./helpers/minimalDocx.js";
import {
  buildPptx,
  bodyShape,
  para,
  picture,
  pptTable,
  groupShape,
  hyperlinkRels,
} from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";
import { analyzeDocx } from "../services/docxService.js";
import { analyzePptx } from "../services/pptxService.js";
import { analyzeXlsx } from "../services/xlsxService.js";
import { scoreDocx, scorePptx, scoreXlsx } from "../services/scorer.js";
import type { ScoringResult } from "../services/scorer.js";

/** Replace (or add) parts of a built package. */
async function patchZip(buffer: Buffer, parts: Record<string, string | null>): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const [name, content] of Object.entries(parts)) {
    if (content === null) zip.remove(name);
    else zip.file(name, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

const cat = (r: ScoringResult, id: string) => r.categories.find((c) => c.id === id)!;
const failed = (r: ScoringResult, sc: string, category?: string) =>
  r.conformance.failures.filter((f) => f.sc === sc && (!category || f.category === category));

const NOT_PARSEABLE = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e "v">]><x/>`;

// ---------------------------------------------------------------------------
// 1. A linked text box is named by its own text
// ---------------------------------------------------------------------------
describe("pptx: a shape-level link takes the shape's text as its name", () => {
  const linkedBox = (text: string, descr = "") =>
    `<p:sp><p:nvSpPr><p:cNvPr id="5" name="TextBox 4"${descr ? ` descr="${descr}"` : ""}><a:hlinkClick r:id="rIdL"/></p:cNvPr><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr/><p:txBody><a:bodyPr/><a:p>${text ? `<a:r><a:t>${text}</a:t></a:r>` : ""}</a:p></p:txBody></p:sp>`;
  const deck = (shape: string) =>
    buildPptx({
      slides: [
        {
          title: "Grants",
          body: shape,
          rels: hyperlinkRels([{ id: "rIdL", target: "https://example.gov/grants" }]),
        },
      ],
    });

  it("a linked text box with text and no alt text is a named link", async () => {
    const a = await analyzePptx(await deck(linkedBox("Visit the grants portal")));
    expect(a.links).toEqual([
      { text: "Visit the grants portal", url: "https://example.gov/grants" },
    ]);
    const r = scorePptx(a);
    expect(cat(r, "link_quality").score).toBe(100);
    expect(failed(r, "4.1.2")).toHaveLength(0);
  });

  it("alt text still comes first", async () => {
    const a = await analyzePptx(await deck(linkedBox("Go", "Open the grants portal")));
    expect(a.links[0].text).toBe("Open the grants portal");
  });

  it("a linked shape with neither text nor alt text is still an unnamed link", async () => {
    const r = scorePptx(await analyzePptx(await deck(linkedBox(""))));
    expect(cat(r, "link_quality").score).toBe(0);
    expect(failed(r, "4.1.2")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Hidden slides contribute to no scored category
// ---------------------------------------------------------------------------
describe("pptx: hidden slides are not checked, and the report says so", () => {
  const defects =
    picture() +
    pptTable({ rows: 3, cols: 3 }) +
    bodyShape(
      para("- first typed item") +
        para("- second typed item") +
        para("faint", { colorHex: "EEEEEE" }) +
        `<a:p><a:r><a:rPr lang="en-US"><a:hlinkClick r:id="rIdL"/></a:rPr><a:t> </a:t></a:r></a:p>`,
      { fillHex: "FFFFFF" },
    );
  const rels = hyperlinkRels([{ id: "rIdL", target: "https://example.gov" }]);

  it("the same defects on a visible slide ARE scored (control)", async () => {
    const r = scorePptx(
      await analyzePptx(
        await buildPptx({
          slides: [{ title: "Visible", body: defects, rels }],
          slideBgHex: "FFFFFF",
        }),
      ),
    );
    expect(cat(r, "alt_text").score).toBe(0);
    expect(cat(r, "table_markup").score).toBe(45);
    expect(failed(r, "1.1.1")).toHaveLength(1);
  });

  it("on a hidden slide they drive no category and no failure", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [
          { title: "Shown", body: bodyShape(para("Welcome", { colorHex: "000000" })) },
          { title: "Backup", hidden: true, body: defects, rels },
        ],
        slideBgHex: "FFFFFF",
      }),
    );
    expect(a.images).toEqual([]);
    expect(a.tables).toEqual([]);
    expect(a.links).toEqual([]);
    expect(a.lists.manualBulletParagraphs).toBe(0);
    expect(a.contrast.failing).toEqual([]);
    const r = scorePptx(a);
    for (const id of ["alt_text", "table_markup", "link_quality", "list_structure"]) {
      expect(cat(r, id).score, id).toBeNull();
    }
    expect(cat(r, "color_contrast").score).toBe(100);
    expect(r.conformance.status).toBe("no-automated-failures");
    expect(r.categories.flatMap((c) => c.findings).join(" ")).toMatch(
      /1 hidden slide\(s\) were excluded from this audit/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Word highlight and run shading are the run's background
// ---------------------------------------------------------------------------
describe("docx: highlighted text is judged against its highlight", () => {
  const run = (rPr: string, text = "Marked text") =>
    `<w:p><w:r><w:rPr>${rPr}</w:rPr><w:t>${text}</w:t></w:r></w:p>`;
  const contrastOf = async (body: string) => {
    const a = await analyzeDocx(await buildDocx({ body }));
    return { a, r: scoreDocx(a) };
  };

  it("white text on a black highlight passes (it was 1:1 against white)", async () => {
    const { a, r } = await contrastOf(run('<w:color w:val="FFFFFF"/><w:highlight w:val="black"/>'));
    expect(a.contrast.checkedRuns).toBe(1);
    expect(a.contrast.failing).toEqual([]);
    expect(cat(r, "color_contrast").score).toBe(100);
    expect(failed(r, "1.4.3")).toHaveLength(0);
  });

  it("dark text on a dark highlight fails, naming the highlight colour", async () => {
    const { a, r } = await contrastOf(
      run('<w:color w:val="000000"/><w:highlight w:val="darkBlue"/>'),
    );
    expect(a.contrast.failing).toHaveLength(1);
    expect(a.contrast.failing[0].background).toBe("#000080");
    expect(failed(r, "1.4.3")).toHaveLength(1);
  });

  it('highlight "none" is no highlight — the page shows through', async () => {
    const { a } = await contrastOf(run('<w:color w:val="FFFFFF"/><w:highlight w:val="none"/>'));
    expect(a.contrast.failing).toHaveLength(1);
    expect(a.contrast.failing[0].background).toBe("#FFFFFF");
  });

  it("a highlight name this checker does not know is unresolved, never a failure", async () => {
    const { a } = await contrastOf(run('<w:color w:val="FFFFFF"/><w:highlight w:val="plaid"/>'));
    expect(a.contrast.failing).toEqual([]);
    expect(a.contrast.unresolvedRuns).toBe(1);
  });

  it("run shading: a solid PATTERN paints w:color, not w:fill", async () => {
    const { a } = await contrastOf(
      run(
        '<w:color w:val="FFFFFF"/><w:shd w:val="solid" w:color="000000" w:fill="FFFFFF"/>',
        "White on a solid black pattern",
      ),
    );
    expect(a.contrast.failing).toEqual([]);
    expect(a.contrast.checkedRuns).toBe(1);
  });

  it("run shading: a percentage pattern mixes two colours — unresolved", async () => {
    const { a } = await contrastOf(
      run('<w:color w:val="777777"/><w:shd w:val="pct50" w:color="000000" w:fill="FFFFFF"/>'),
    );
    expect(a.contrast.failing).toEqual([]);
    expect(a.contrast.unresolvedRuns).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. A data table nested in a layout table is judged
// ---------------------------------------------------------------------------
describe("docx: nested tables are judged in their own right", () => {
  const BORDERS =
    '<w:tblPr><w:tblBorders><w:top w:val="single"/><w:insideH w:val="single"/></w:tblBorders></w:tblPr>';
  const dataTable = (header: boolean) =>
    `<w:tbl>${BORDERS}<w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
    [0, 1, 2]
      .map(
        (r) =>
          `<w:tr>${header && r === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}` +
          `<w:tc><w:tcPr><w:shd w:val="clear" w:fill="DDDDDD"/></w:tcPr><w:p><w:r><w:t>a${r}</w:t></w:r></w:p></w:tc>` +
          `<w:tc><w:p><w:r><w:t>b${r}</w:t></w:r></w:p></w:tc></w:tr>`,
      )
      .join("") +
    `</w:tbl>`;
  const cell = (inner: string) => `<w:tc>${inner}<w:p/></w:tc>`;
  const bareGrid = (inner: string) =>
    `<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
    `<w:tr>${cell(inner)}${cell("<w:p><w:r><w:t>side</w:t></w:r></w:p>")}</w:tr>` +
    `<w:tr>${cell("<w:p><w:r><w:t>x</w:t></w:r></w:p>")}${cell("<w:p><w:r><w:t>y</w:t></w:r></w:p>")}</w:tr></w:tbl>`;
  const wrapper = (inner: string) =>
    `<w:tbl><w:tblGrid><w:gridCol/></w:tblGrid><w:tr>${cell(inner)}</w:tr></w:tbl>`;
  const score = async (body: string) => {
    const a = await analyzeDocx(await buildDocx({ body: paragraph("Intro") + body }));
    return { a, r: scoreDocx(a) };
  };

  it("top-level: an unheadered data table scores 45 (control)", async () => {
    const { r } = await score(dataTable(false));
    expect(cat(r, "table_markup").score).toBe(45);
  });

  it("inside a bare 2×2 layout grid it scores the same, and the grid is not a failure", async () => {
    const { a, r } = await score(bareGrid(dataTable(false)));
    expect(a.tables).toHaveLength(2);
    expect(a.tables[0].looksLikeLayout).toBe(true); // the nested table's shading is not the grid's
    expect(cat(r, "table_markup").score).toBe(45);
    expect(cat(r, "table_markup").findings.join(" ")).toMatch(
      /1 data table\(s\) have no header row/,
    );
    const f = failed(r, "1.3.1", "table_markup");
    expect(f).toHaveLength(1);
    expect(f[0].issue).toMatch(/^1 data table/);
  });

  it("inside a 1×1 wrapper it scores the same", async () => {
    const { r } = await score(wrapper(dataTable(false)));
    expect(cat(r, "table_markup").score).toBe(45);
    expect(failed(r, "1.3.1", "table_markup")).toHaveLength(1);
  });

  it("a nested table WITH a header row passes", async () => {
    const { r } = await score(bareGrid(dataTable(true)));
    expect(cat(r, "table_markup").score).toBe(100);
    expect(failed(r, "1.3.1", "table_markup")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. No text at all + images: extractable text is not claimed
// ---------------------------------------------------------------------------
describe("text extractability is keyed to evidence in Word and PowerPoint", () => {
  it("docx: ten page-scan pictures and no text is not assessed, not 100", async () => {
    const a = await analyzeDocx(await buildDocx({ body: inlineImage({}).repeat(10) }));
    const r = scoreDocx(a);
    const text = cat(r, "text_extractability");
    expect(text.score).toBeNull();
    expect(text.notAssessed).toBe(true);
    expect(text.findings.join(" ")).not.toMatch(/fully extractable/);
    expect(text.findings.join(" ")).toMatch(/No text was found/);
    expect(cat(r, "alt_text").score).toBe(0);
    expect(r.grade).toBe("D"); // it was 100/A
  });

  it("docx: a document with real text is unchanged", async () => {
    const r = scoreDocx(
      await analyzeDocx(await buildDocx({ body: paragraph("Some words") + inlineImage({}) })),
    );
    expect(cat(r, "text_extractability").score).toBe(100);
    expect(cat(r, "text_extractability").findings[0]).toMatch(/fully extractable/);
  });

  it("docx: an empty document with no images is unchanged", async () => {
    const r = scoreDocx(await analyzeDocx(await buildDocx({ body: "<w:p/>" })));
    expect(cat(r, "text_extractability").score).toBe(100);
  });

  it("pptx: a one-picture deck with no text is not assessed", async () => {
    const r = scorePptx(
      await analyzePptx(await buildPptx({ slides: [{ title: null, body: picture() }] })),
    );
    const text = cat(r, "text_extractability");
    expect(text.score).toBeNull();
    expect(text.notAssessed).toBe(true);
    expect(text.findings.join(" ")).not.toMatch(/fully extractable/);
  });

  it("pptx: an image-light deck with text is unchanged", async () => {
    const r = scorePptx(
      await analyzePptx(
        await buildPptx({ slides: [{ title: "Results", body: picture({ descr: "Chart" }) }] }),
      ),
    );
    expect(cat(r, "text_extractability").score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 6. Drawn shapes and groups: one rule in three formats
// ---------------------------------------------------------------------------
describe("pictures, picture-filled shapes and groups are judged alike in every format", () => {
  const BLIP = '<a:blipFill><a:blip r:embed="rIdImg"/><a:stretch/></a:blipFill>';
  const pptShape = (o: { descr?: string; fill?: string; text?: string; ph?: boolean }) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="30" name="Shape"${o.descr ? ` descr="${o.descr}"` : ""}/><p:cNvSpPr/><p:nvPr>${o.ph ? '<p:ph type="body" idx="1"/>' : ""}</p:nvPr></p:nvSpPr>` +
    `<p:spPr>${o.fill ?? ""}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:p>${o.text ? `<a:r><a:t>${o.text}</a:t></a:r>` : ""}</a:p></p:txBody></p:sp>`;
  const pptAlt = async (body: string) => {
    const a = await analyzePptx(await buildPptx({ slides: [{ title: "Slide", body }] }));
    return { a, r: scorePptx(a) };
  };

  it("pptx: a picture-filled shape without alt text is a picture without alt text", async () => {
    const { a, r } = await pptAlt(pptShape({ fill: BLIP }));
    expect(a.images).toHaveLength(1);
    expect(cat(r, "alt_text").score).toBe(0);
    expect(failed(r, "1.1.1")).toHaveLength(1);
  });

  it("pptx: with alt text it passes; with text it is a text shape, not an image", async () => {
    expect(
      cat((await pptAlt(pptShape({ fill: BLIP, descr: "Aerial photo" }))).r, "alt_text").score,
    ).toBe(100);
    expect((await pptAlt(pptShape({ fill: BLIP, text: "Caption" }))).a.images).toEqual([]);
  });

  it("pptx: an empty placeholder and an empty text box are not images", async () => {
    expect((await pptAlt(pptShape({ ph: true }))).a.images).toEqual([]);
    const emptyBox = pptShape({}).replace("<p:cNvSpPr/>", '<p:cNvSpPr txBox="1"/>');
    expect((await pptAlt(emptyBox)).a.images).toEqual([]);
  });

  it("pptx: members' own alt text satisfies a group that has none", async () => {
    const { a, r } = await pptAlt(
      groupShape(picture({ descr: "County map" }) + picture({ descr: "Legend" })),
    );
    expect(a.images).toHaveLength(2);
    expect(cat(r, "alt_text").score).toBe(100);
  });

  // --- Word -----------------------------------------------------------------
  const WPG = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup";
  const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
  const wordPic = (descr?: string) =>
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="3" name="Picture 3"${descr ? ` descr="${descr}"` : ""}/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill><pic:spPr/></pic:pic>`;
  const wordGroup = (members: string, groupDescr?: string) =>
    `<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="1" name="Group 1"${groupDescr ? ` descr="${groupDescr}"` : ""}/>` +
    `<a:graphic><a:graphicData uri="${WPG}"><wpg:wgp xmlns:wpg="${WPG}" xmlns:wps="${WPS}"><wpg:cNvGrpSpPr/><wpg:grpSpPr/>${members}</wpg:wgp></a:graphicData></a:graphic>` +
    `</wp:anchor></w:drawing></w:r></w:p>`;
  const wordAlt = async (body: string) => {
    const a = await analyzeDocx(await buildDocx({ body: paragraph("Text") + body }));
    return { a, r: scoreDocx(a) };
  };

  it("docx: a group whose member pictures each carry alt text passes (it scored 0 of 1)", async () => {
    const { a, r } = await wordAlt(wordGroup(wordPic("County map") + wordPic("Legend")));
    expect(a.images.map((i) => i.altText)).toEqual(["County map", "Legend"]);
    expect(cat(r, "alt_text").score).toBe(100);
    expect(failed(r, "1.1.1")).toHaveLength(0);
  });

  it("docx: a group's own alt text covers its members", async () => {
    const { a, r } = await wordAlt(wordGroup(wordPic() + wordPic(), "Map with its legend"));
    expect(a.images).toHaveLength(1);
    expect(cat(r, "alt_text").score).toBe(100);
  });

  it("docx: a group with no alt text anywhere fails once per picture", async () => {
    const { a, r } = await wordAlt(wordGroup(wordPic() + wordPic("Legend")));
    expect(a.images).toHaveLength(2);
    expect(cat(r, "alt_text").score).toBe(50);
    expect(failed(r, "1.1.1")).toHaveLength(1);
  });

  it("docx: a group of text boxes is still not an image", async () => {
    const box = `<wps:wsp><wps:cNvPr id="4" name="Text Box 4"/><wps:spPr/><wps:txbx><w:txbxContent><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>`;
    expect((await wordAlt(wordGroup(box + box))).a.images).toEqual([]);
  });

  // --- Excel ----------------------------------------------------------------
  const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const xPic = (descr?: string) =>
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="3" name="Picture"${descr ? ` descr="${descr}"` : ""}/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill/><xdr:spPr/></xdr:pic>`;
  const xShape = (o: { descr?: string; fill?: string; text?: string }) =>
    `<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="4" name="Shape"${o.descr ? ` descr="${o.descr}"` : ""}/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr>${o.fill ?? ""}</xdr:spPr>` +
    `<xdr:txBody><a:bodyPr ${A}/><a:p ${A}>${o.text ? `<a:r><a:t>${o.text}</a:t></a:r>` : ""}</a:p></xdr:txBody></xdr:sp>`;
  const xGroup = (members: string, descr?: string) =>
    `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="2" name="Group"${descr ? ` descr="${descr}"` : ""}/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${members}</xdr:grpSp>`;
  const xAlt = async (objects: string) => {
    const a = await analyzeXlsx(
      await buildXlsx({
        sheets: [
          {
            name: "Data",
            cells: [{ ref: "A1", value: "1" }],
            rawDrawings: `<xdr:oneCellAnchor>${objects}</xdr:oneCellAnchor>`,
          },
        ],
      }),
    );
    return { a, r: scoreXlsx(a) };
  };

  it("xlsx: a group's alt text covers its members (each was counted alone)", async () => {
    const { a, r } = await xAlt(xGroup(xPic() + xPic(), "Process diagram"));
    expect(a.images).toHaveLength(1);
    expect(cat(r, "alt_text").score).toBe(100);
    expect(failed(r, "1.1.1")).toHaveLength(0);
  });

  it("xlsx: without group alt text the members are judged one by one", async () => {
    const { a, r } = await xAlt(xGroup(xPic("Map") + xPic()));
    expect(a.images).toHaveLength(2);
    expect(cat(r, "alt_text").score).toBe(50);
  });

  it("xlsx: a picture-filled shape needs alt text; a text box is not an image", async () => {
    const blip = `<a:blipFill ${A}><a:blip/></a:blipFill>`;
    expect(cat((await xAlt(xShape({ fill: blip }))).r, "alt_text").score).toBe(0);
    expect(cat((await xAlt(xShape({ fill: blip, descr: "Site photo" }))).r, "alt_text").score).toBe(
      100,
    );
    expect((await xAlt(xShape({ text: "Note" }))).a.images).toEqual([]);
  });

  it("docx: plain and picture-filled textless shapes in a group each need alt text", async () => {
    const plain = `<wps:wsp><wps:cNvPr id="5" name="Rectangle 5"/><wps:spPr/></wps:wsp>`;
    const filled = `<wps:wsp><wps:cNvPr id="6" name="Rectangle 6"/><wps:spPr><a:blipFill><a:blip r:embed="rId9"/></a:blipFill></wps:spPr></wps:wsp>`;
    expect((await wordAlt(wordGroup(plain + plain))).a.images).toHaveLength(2);
    expect((await wordAlt(wordGroup(plain + filled))).a.images).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Only header/footer parts a section actually uses are audited
// ---------------------------------------------------------------------------
describe("docx: header and footer parts are chosen by section reference", () => {
  const hdr = (inner: string) => `<?xml version="1.0"?><w:hdr ${DOCX_NS}>${inner}</w:hdr>`;
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const rels =
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    [1, 2, 3]
      .map((n) => `<Relationship Id="rIdH${n}" Type="${REL}/header" Target="header${n}.xml"/>`)
      .join("") +
    `</Relationships>`;
  const refs =
    '<w:headerReference w:type="default" r:id="rIdH1"/>' +
    '<w:headerReference w:type="first" r:id="rIdH2"/>' +
    '<w:headerReference w:type="even" r:id="rIdH3"/>';
  const doc = (sectExtra: string, settings?: string) =>
    buildDocx({
      body: paragraph("Body text") + `<w:sectPr>${refs}${sectExtra}</w:sectPr>`,
      documentRels: rels,
      extra: {
        "word/header1.xml": hdr(inlineImage({})),
        "word/header2.xml": hdr(inlineImage({})),
        "word/header3.xml": hdr(inlineImage({})),
        ...(settings ? { "word/settings.xml": settings } : {}),
      },
    });

  it("an unused first-page and even-page header do not triple the logo", async () => {
    const a = await analyzeDocx(await doc(""));
    expect(a.images).toHaveLength(1);
    expect(a.images[0].location).toBe("header");
    const r = scoreDocx(a);
    expect(cat(r, "alt_text").findings[0]).toBe("0 of 1 meaningful image(s) have alt text.");
    expect(failed(r, "1.1.1")[0].issue).toMatch(/^1 image/);
  });

  it("w:titlePg puts the first-page header in use", async () => {
    expect((await analyzeDocx(await doc("<w:titlePg/>"))).images).toHaveLength(2);
    expect((await analyzeDocx(await doc('<w:titlePg w:val="0"/>'))).images).toHaveLength(1);
  });

  it("w:evenAndOddHeaders in settings puts the even-page header in use", async () => {
    const settings = `<?xml version="1.0"?><w:settings ${DOCX_NS}><w:evenAndOddHeaders/></w:settings>`;
    expect((await analyzeDocx(await doc("", settings))).images).toHaveLength(2);
    expect((await analyzeDocx(await doc("<w:titlePg/>", settings))).images).toHaveLength(3);
  });

  it("a header part no section references is not audited", async () => {
    const buf = await buildDocx({
      body: paragraph("Body text"),
      extra: { "word/header1.xml": hdr(inlineImage({})) },
    });
    expect((await analyzeDocx(buf)).images).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. Embedded OLE objects are images
// ---------------------------------------------------------------------------
describe("docx: an embedded OLE object is counted as an image", () => {
  const V =
    'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';
  const ole = (alt?: string) =>
    `<w:p><w:r><w:object ${V}><v:shape id="_x0000_i1025" type="#_x0000_t75"${alt ? ` alt="${alt}"` : ""} style="width:200pt;height:100pt" o:ole="">` +
    `<v:imagedata r:id="rId8" o:title=""/></v:shape>` +
    `<o:OLEObject Type="Embed" ProgID="Excel.Sheet.12" ShapeID="_x0000_i1025" DrawAspect="Content" ObjectID="_1" r:id="rId9"/></w:object></w:r></w:p>`;

  it("without alt text it is a missing-alt image (it was 'No images were found')", async () => {
    const a = await analyzeDocx(await buildDocx({ body: paragraph("Budget:") + ole() }));
    expect(a.images).toEqual([{ altText: null, decorative: false, titleOnly: false }]);
    const r = scoreDocx(a);
    expect(cat(r, "alt_text").score).toBe(0);
    expect(failed(r, "1.1.1")).toHaveLength(1);
  });

  it("the v:shape alt attribute is its alt text", async () => {
    const a = await analyzeDocx(
      await buildDocx({ body: paragraph("Budget:") + ole("FY26 budget worksheet") }),
    );
    expect(a.images[0].altText).toBe("FY26 budget worksheet");
    expect(cat(scoreDocx(a), "alt_text").score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 9. A body that could not be read is never graded as clean
// ---------------------------------------------------------------------------
describe("an unparseable main body is not assessed, in every Office format", () => {
  const COULD_NOT_RUN = /This check could not run/;

  it("docx: a stored analysis whose body was not read withholds its content categories", () => {
    // analyzeDocx now refuses such a file outright (see the next describe);
    // the scorer keeps the guard for payloads recorded before it did.
    const r = scoreDocx({
      metadata: { title: "T", creator: null, language: "en-US", pageCount: 1, wordCount: 0 },
      headings: [],
      fakeHeadings: [],
      emptyHeadingCount: 0,
      images: [],
      tables: [],
      links: [],
      lists: { realListItems: 0, manualBulletParagraphs: 0 },
      contrast: { checkedRuns: 0, unresolvedRuns: 0, failing: [] },
      paragraphCount: 0,
      parse: { documentOk: false, stylesState: "ok", coreState: "ok" },
    });
    expect(r.conformance.status).toBe("incomplete");
    for (const id of ["text_extractability", "alt_text", "table_markup", "link_quality"]) {
      const c = cat(r, id);
      expect(c.score, id).toBeNull();
      expect(c.notAssessed, id).toBe(true);
      expect(c.findings.join(" "), id).toMatch(COULD_NOT_RUN);
    }
    expect(r.warnings.join(" ")).toMatch(/could not be completed/);
  });

  const twoSlides = () =>
    buildPptx({
      slides: [
        { title: "One", body: bodyShape(para("Hello", { colorHex: "000000" })) },
        { title: "Two", body: bodyShape(para("World", { colorHex: "000000" })) },
      ],
      slideBgHex: "FFFFFF",
    });

  it("pptx: an unparseable slide is recorded and the deck is not graded clean", async () => {
    const a = await analyzePptx(
      await patchZip(await twoSlides(), { "ppt/slides/slide2.xml": NOT_PARSEABLE }),
    );
    expect(a.unparsedSlides).toEqual([2]);
    const r = scorePptx(a);
    expect(r.conformance.status).toBe("incomplete");
    expect(r.conformance.headline).toMatch(/Slide 2 could not be read/);
    for (const id of ["text_extractability", "alt_text", "table_markup", "color_contrast"]) {
      const c = cat(r, id);
      expect(c.score, id).toBeNull();
      expect(c.notAssessed, id).toBe(true);
      expect(c.findings.join(" "), id).toMatch(COULD_NOT_RUN);
    }
    expect(cat(r, "slide_titles").findings.join(" ")).not.toMatch(/slide 2 has no title/);
    expect(r.warnings.join(" ")).toMatch(/could not be completed/);
  });

  it("pptx: a failure measured on a readable slide is kept beside the unread one", async () => {
    const buf = await buildPptx({
      slides: [{ title: "One", body: picture() }, { title: "Two" }],
    });
    const r = scorePptx(
      await analyzePptx(await patchZip(buf, { "ppt/slides/slide2.xml": NOT_PARSEABLE })),
    );
    expect(cat(r, "alt_text").score).toBe(0);
    expect(cat(r, "alt_text").findings.join(" ")).toMatch(/could not be read/);
    expect(r.conformance.status).toBe("fail");
    expect(failed(r, "1.1.1")).toHaveLength(1);
  });

  it("pptx: a readable deck is unchanged", async () => {
    const a = await analyzePptx(await twoSlides());
    expect(a.unparsedSlides ?? []).toEqual([]);
    const r = scorePptx(a);
    expect(r.conformance.status).toBe("no-automated-failures");
    expect(r.warnings).toEqual([]);
  });

  const workbook = () =>
    buildXlsx({
      sheets: [
        { name: "Summary", cells: [{ ref: "A1", value: "1" }] },
        { name: "Detail", cells: [{ ref: "A1", value: "2" }] },
      ],
    });

  it("xlsx: an unparseable sheet is recorded and the workbook is not graded clean", async () => {
    const a = await analyzeXlsx(
      await patchZip(await workbook(), { "xl/worksheets/sheet2.xml": NOT_PARSEABLE }),
    );
    expect(a.unparsedSheets).toEqual(["Detail"]);
    const r = scoreXlsx(a);
    expect(r.conformance.status).toBe("incomplete");
    expect(r.conformance.headline).toMatch(/Detail/);
    for (const id of ["text_extractability", "table_markup", "alt_text", "color_contrast"]) {
      const c = cat(r, id);
      expect(c.score, id).toBeNull();
      expect(c.notAssessed, id).toBe(true);
      expect(c.findings.join(" "), id).toMatch(COULD_NOT_RUN);
    }
    expect(r.warnings.join(" ")).toMatch(/could not be completed/);
  });

  it("xlsx: a readable workbook is unchanged", async () => {
    const a = await analyzeXlsx(await workbook());
    expect(a.unparsedSheets ?? []).toEqual([]);
    const r = scoreXlsx(a);
    expect(r.conformance.status).toBe("no-automated-failures");
    expect(r.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. Excel: a no-fill cell inside a styled table is not on the white grid
// ---------------------------------------------------------------------------
describe("xlsx: a table style may paint behind a no-fill cell", () => {
  const TABLE_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const tablePart = (style: string | null) =>
    `<?xml version="1.0"?><table xmlns="${TABLE_NS}" id="1" name="Grants" displayName="Grants" ref="A1:C4">` +
    `<tableColumns count="3"><tableColumn id="1" name="Grantee"/><tableColumn id="2" name="County"/><tableColumn id="3" name="Award"/></tableColumns>` +
    (style === null
      ? ""
      : `<tableStyleInfo${style ? ` name="${style}"` : ""} showRowStripes="1"/>`) +
    `</table>`;
  const book = async (style: string | null, ref = "A1") =>
    patchZip(
      await buildXlsx({
        sheets: [
          {
            name: "Grants",
            tables: [{ name: "Grants" }],
            cells: [{ ref, styleIndex: 1, value: "5" }],
          },
        ],
        styles: [{ fontRgb: "FFFFFFFF" }], // white ink, no fill
      }),
      { "xl/tables/table1.xml": tablePart(style) },
    );

  it("white text in a dark-styled table is unresolved, not a 1:1 failure", async () => {
    const a = await analyzeXlsx(await book("TableStyleDark1"));
    expect(a.contrast.failing).toEqual([]);
    expect(a.contrast.unresolvedRuns).toBe(1);
    const r = scoreXlsx(a);
    expect(cat(r, "color_contrast").score).toBeNull();
    expect(cat(r, "color_contrast").notAssessed).toBe(true);
    expect(failed(r, "1.4.3")).toHaveLength(0);
  });

  it("the same cell outside the table's range is on the white grid and fails", async () => {
    const a = await analyzeXlsx(await book("TableStyleDark1", "F9"));
    expect(a.contrast.failing).toHaveLength(1);
    expect(failed(scoreXlsx(a), "1.4.3")).toHaveLength(1);
  });

  it("a table with no style paints nothing, so the white grid still applies", async () => {
    expect((await analyzeXlsx(await book(null))).contrast.failing).toHaveLength(1);
    expect((await analyzeXlsx(await book(""))).contrast.failing).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PowerPoint text in tables and groups is counted as unresolved
// ---------------------------------------------------------------------------
describe("pptx: text in tables and groups is not silently skipped by the contrast check", () => {
  it("table cell text counts as unresolved", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [{ title: null, body: pptTable({ rows: 2, cols: 2, firstRow: true }) }],
        slideBgHex: "FFFFFF",
      }),
    );
    expect(a.contrast.checkedRuns).toBe(0);
    expect(a.contrast.unresolvedRuns).toBe(4);
    const c = cat(scorePptx(a), "color_contrast");
    expect(c.score).toBeNull();
    expect(c.notAssessed).toBe(true);
  });

  it("text in a grouped shape counts as unresolved", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [
          {
            title: null,
            body: groupShape(bodyShape(para("Grouped words", { colorHex: "EEEEEE" }))),
          },
        ],
        slideBgHex: "FFFFFF",
      }),
    );
    expect(a.contrast.failing).toEqual([]);
    expect(a.contrast.unresolvedRuns).toBe(1);
  });
});

// ===========================================================================
// Follow-up (2026-11-12, second pass)
// ===========================================================================

async function partOf(buffer: Buffer, name: string): Promise<string> {
  return (await JSZip.loadAsync(buffer)).file(name)!.async("string");
}
/** Cut a part right after an element boundary, as a truncated save leaves it. */
const cutAfter = (xml: string, marker: string) => xml.slice(0, xml.indexOf(marker) + marker.length);

const deckOfTwo = () =>
  buildPptx({
    slides: [
      { title: "One", body: bodyShape(para("Hello", { colorHex: "000000" })) },
      { title: "Two", body: bodyShape(para("World", { colorHex: "000000" })) },
    ],
    slideBgHex: "FFFFFF",
  });
const bookOfTwo = () =>
  buildXlsx({
    sheets: [
      { name: "Summary", cells: [{ ref: "A1", value: "1" }] },
      { name: "Detail", cells: [{ ref: "A1", value: "2" }] },
    ],
  });

// A. Nothing readable → no grade at all
describe("a main body that cannot be read at all is refused, not graded", () => {
  it("docx: an unparseable document.xml throws DocxParseError", async () => {
    await expect(
      analyzeDocx(await buildDocx({ documentXml: NOT_PARSEABLE })),
    ).rejects.toMatchObject({ code: "DOCX_PARSE_FAILED" });
  });

  it("pptx: every slide unparseable throws PptxParseError", async () => {
    const buf = await patchZip(await deckOfTwo(), {
      "ppt/slides/slide1.xml": NOT_PARSEABLE,
      "ppt/slides/slide2.xml": NOT_PARSEABLE,
    });
    await expect(analyzePptx(buf)).rejects.toMatchObject({ code: "PPTX_PARSE_FAILED" });
  });

  it("xlsx: every visible sheet unparseable throws XlsxParseError", async () => {
    const buf = await patchZip(await bookOfTwo(), {
      "xl/worksheets/sheet1.xml": NOT_PARSEABLE,
      "xl/worksheets/sheet2.xml": NOT_PARSEABLE,
    });
    await expect(analyzeXlsx(buf)).rejects.toMatchObject({ code: "XLSX_PARSE_FAILED" });
  });
});

// B. Truncated XML is not a shorter document
describe("a main-body part cut short is unparseable, not a shorter document", () => {
  it("docx: a document.xml cut at a paragraph boundary is refused", async () => {
    const whole = await buildDocx({ body: paragraph("First") + paragraph("Second") });
    expect((await analyzeDocx(whole)).paragraphCount).toBe(2);
    const cut = cutAfter(await partOf(whole, "word/document.xml"), "</w:p>");
    await expect(
      analyzeDocx(await patchZip(whole, { "word/document.xml": cut })),
    ).rejects.toMatchObject({ code: "DOCX_PARSE_FAILED" });
  });

  it("docx: trailing whitespace or a comment after the root is still a whole document", async () => {
    const whole = await buildDocx({ body: paragraph("First") });
    const xml = await partOf(whole, "word/document.xml");
    const a = await analyzeDocx(
      await patchZip(whole, { "word/document.xml": `${xml}\n<!-- saved -->\n` }),
    );
    expect(a.parse.documentOk).toBe(true);
  });

  it("pptx: a slide cut at a shape boundary is an unparsed slide", async () => {
    const whole = await deckOfTwo();
    const cut = cutAfter(await partOf(whole, "ppt/slides/slide2.xml"), "</p:sp>");
    const a = await analyzePptx(await patchZip(whole, { "ppt/slides/slide2.xml": cut }));
    expect(a.unparsedSlides).toEqual([2]);
    expect(scorePptx(a).conformance.status).toBe("incomplete");
  });

  it("xlsx: a sheet cut at a row boundary is an unparsed sheet", async () => {
    const whole = await bookOfTwo();
    const cut = cutAfter(await partOf(whole, "xl/worksheets/sheet2.xml"), "</row>");
    const a = await analyzeXlsx(await patchZip(whole, { "xl/worksheets/sheet2.xml": cut }));
    expect(a.unparsedSheets).toEqual(["Detail"]);
  });
});

// C. Listed but missing from the package
describe("a slide or sheet the package lists but does not contain is unparsed", () => {
  it("pptx: a slide in sldIdLst and the rels with no part", async () => {
    const whole = await deckOfTwo();
    const rels =
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      [1, 2]
        .map(
          (n) =>
            `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`,
        )
        .join("") +
      `</Relationships>`;
    const a = await analyzePptx(
      await patchZip(whole, {
        "ppt/_rels/presentation.xml.rels": rels,
        "ppt/slides/slide2.xml": null,
      }),
    );
    expect(a.metadata.slideCount).toBe(2);
    expect(a.unparsedSlides).toEqual([2]);
    expect(scorePptx(a).conformance.status).toBe("incomplete");
  });

  it("xlsx: a sheet in workbook.xml with no part", async () => {
    const a = await analyzeXlsx(
      await patchZip(await bookOfTwo(), { "xl/worksheets/sheet2.xml": null }),
    );
    expect(a.unparsedSheets).toEqual(["Detail"]);
    expect(scoreXlsx(a).conformance.status).toBe("incomplete");
  });
});

// D. A deck of nothing but hidden slides is audited as it is
describe("pptx: when every slide is hidden the slides are still checked", () => {
  it("an undescribed picture on an all-hidden deck fails, and the report says all are hidden", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [
          { title: "Backup A", hidden: true, body: picture() },
          { title: "Backup B", hidden: true },
        ],
      }),
    );
    expect(a.images).toHaveLength(1);
    expect(a.allSlidesHidden).toBe(true);
    const r = scorePptx(a);
    expect(cat(r, "alt_text").score).toBe(0);
    expect(failed(r, "1.1.1")).toHaveLength(1);
    expect(r.grade).not.toBe("A");
    expect(r.categories.flatMap((c) => c.findings).join(" ")).toMatch(
      /All 2 slide\(s\) in this presentation are hidden/,
    );
  });
});

// E. Group links, and one link counted once
describe("pptx: a linked group is named by its alt text or its members' text", () => {
  const rels = hyperlinkRels([{ id: "rIdL", target: "https://example.gov/grants" }]);
  const linkedGroup = (members: string, descr = "") =>
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="Group"${descr ? ` descr="${descr}"` : ""}><a:hlinkClick r:id="rIdL"/></p:cNvPr><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${members}</p:grpSp>`;
  const links = async (body: string) => {
    const a = await analyzePptx(await buildPptx({ slides: [{ title: "Grants", body, rels }] }));
    return { a, r: scorePptx(a) };
  };

  it("the member text box's words name the link", async () => {
    const { a, r } = await links(linkedGroup(bodyShape(para("Apply for a grant"))));
    expect(a.links).toEqual([{ text: "Apply for a grant", url: "https://example.gov/grants" }]);
    expect(cat(r, "link_quality").score).toBe(100);
    expect(failed(r, "4.1.2")).toHaveLength(0);
  });

  it("the group's alt text comes first", async () => {
    const { a } = await links(linkedGroup(bodyShape(para("Go")), "Open the grants portal"));
    expect(a.links[0].text).toBe("Open the grants portal");
  });

  it("a shape link and a run link on the same box to the same target are one link", async () => {
    const box =
      `<p:sp><p:nvSpPr><p:cNvPr id="5" name="TextBox 4"><a:hlinkClick r:id="rIdL"/></p:cNvPr><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr/><p:txBody><a:bodyPr/>${para("Visit the grants portal", { linkRelId: "rIdL" })}</p:txBody></p:sp>`;
    const { a } = await links(box);
    expect(a.links).toEqual([
      { text: "Visit the grants portal", url: "https://example.gov/grants" },
    ]);
  });
});

// F. Highlight and shading carried by styles
describe("docx: a background set by a character or paragraph style is the run's background", () => {
  const styles = (extra: string) =>
    `<?xml version="1.0"?><w:styles ${DOCX_NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    extra +
    `</w:styles>`;
  const charStyle = (id: string, rPr: string, basedOn = "") =>
    `<w:style w:type="character" w:styleId="${id}"><w:name w:val="${id}"/>${basedOn ? `<w:basedOn w:val="${basedOn}"/>` : ""}<w:rPr>${rPr}</w:rPr></w:style>`;
  const whiteRun = (rStyle: string, pStyle = "") =>
    `<w:p>${pStyle ? `<w:pPr><w:pStyle w:val="${pStyle}"/></w:pPr>` : ""}<w:r><w:rPr>${rStyle ? `<w:rStyle w:val="${rStyle}"/>` : ""}<w:color w:val="FFFFFF"/></w:rPr><w:t>Marked</w:t></w:r></w:p>`;
  const contrast = async (stylesXml: string, body: string) =>
    (await analyzeDocx(await buildDocx({ stylesXml, body }))).contrast;

  it("a character style's highlight", async () => {
    const c = await contrast(
      styles(charStyle("Mark", '<w:highlight w:val="black"/>')),
      whiteRun("Mark"),
    );
    expect(c.failing).toEqual([]);
    expect(c.checkedRuns).toBe(1);
  });

  it("a character style's shading, inherited through basedOn", async () => {
    const c = await contrast(
      styles(
        charStyle("Base", '<w:shd w:val="clear" w:fill="000000"/>') + charStyle("Mark", "", "Base"),
      ),
      whiteRun("Mark"),
    );
    expect(c.failing).toEqual([]);
    expect(c.checkedRuns).toBe(1);
  });

  it("the paragraph style's run properties", async () => {
    const para2 = `<w:style w:type="paragraph" w:styleId="Banner"><w:name w:val="Banner"/><w:rPr><w:shd w:val="clear" w:fill="1F3864"/></w:rPr></w:style>`;
    const c = await contrast(styles(para2), whiteRun("", "Banner"));
    expect(c.failing).toEqual([]);
    expect(c.checkedRuns).toBe(1);
  });

  it("a style background that fails is reported with the style's colour", async () => {
    const c = await contrast(
      styles(charStyle("Mark", '<w:highlight w:val="yellow"/>')),
      whiteRun("Mark"),
    );
    expect(c.failing).toHaveLength(1);
    expect(c.failing[0].background).toBe("#FFFF00");
  });

  it("a style chain that loops cannot be resolved — unresolved, never white", async () => {
    const c = await contrast(
      styles(charStyle("A", "", "B") + charStyle("B", "", "A")),
      whiteRun("A"),
    );
    expect(c.failing).toEqual([]);
    expect(c.unresolvedRuns).toBe(1);
  });

  it("a style with no background still leaves the page white (control)", async () => {
    const c = await contrast(styles(charStyle("Plain", "<w:b/>")), whiteRun("Plain"));
    expect(c.failing).toHaveLength(1);
    expect(c.failing[0].background).toBe("#FFFFFF");
  });
});

// G. An ActiveX control is not an image
describe("docx: a legacy ActiveX control is not an image", () => {
  it("w:object holding w:control is not counted", async () => {
    const V =
      'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"';
    const control =
      `<w:p><w:r><w:object ${V}><v:shape id="_x0000_i1026" type="#_x0000_t75" style="width:100pt;height:20pt">` +
      `<v:imagedata r:id="rId8" o:title=""/></v:shape><w:control r:id="rId9" w:name="CheckBox1" w:shapeid="_x0000_i1026"/></w:object></w:r></w:p>`;
    const a = await analyzeDocx(await buildDocx({ body: paragraph("Agree:") + control }));
    expect(a.images).toEqual([]);
    expect(cat(scoreDocx(a), "alt_text").score).toBeNull();
  });
});

// H. What "no text" means
describe("text extractability: field text counts, page furniture does not", () => {
  it("pptx: text that lives only in a field is text", async () => {
    const fieldBox =
      `<p:sp><p:nvSpPr><p:cNvPr id="6" name="Date"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/>` +
      `<p:txBody><a:bodyPr/><a:p><a:fld id="{1}" type="datetime1"><a:rPr lang="en-US"/><a:t>11/12/2026</a:t></a:fld></a:p></p:txBody></p:sp>`;
    const a = await analyzePptx(
      await buildPptx({ slides: [{ title: null, body: picture() + fieldBox }] }),
    );
    expect(a.textCharCount).toBeGreaterThan(0);
    expect(cat(scorePptx(a), "text_extractability").score).toBe(100);
  });

  it("docx: a footer reading 'Page 1' does not make a scan-only document extractable", async () => {
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const a = await analyzeDocx(
      await buildDocx({
        body:
          inlineImage({}).repeat(3) +
          '<w:sectPr><w:footerReference w:type="default" r:id="rIdF1"/></w:sectPr>',
        documentRels: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdF1" Type="${REL}/footer" Target="footer1.xml"/></Relationships>`,
        extra: {
          "word/footer1.xml": `<?xml version="1.0"?><w:ftr ${DOCX_NS}>${paragraph("Page 1")}</w:ftr>`,
        },
      }),
    );
    expect(a.textCharCount).toBe(0);
    const text = cat(scoreDocx(a), "text_extractability");
    expect(text.score).toBeNull();
    expect(text.notAssessed).toBe(true);
  });
});

// I. A group of text boxes is not an image, alt text or not
describe("a group of text boxes with alt text is not an image in any format", () => {
  it("pptx", async () => {
    const group = groupShape(bodyShape(para("One")) + bodyShape(para("Two"))).replace(
      'name="Group"',
      'name="Group" descr="Two notes"',
    );
    const a = await analyzePptx(await buildPptx({ slides: [{ title: "S", body: group }] }));
    expect(a.images).toEqual([]);
  });

  it("pptx: a group with alt text that holds a picture is still one image", async () => {
    const group = groupShape(bodyShape(para("Caption")) + picture()).replace(
      'name="Group"',
      'name="Group" descr="Photo with caption"',
    );
    const a = await analyzePptx(await buildPptx({ slides: [{ title: "S", body: group }] }));
    expect(a.images.map((i) => i.altText)).toEqual(["Photo with caption"]);
  });

  it("xlsx", async () => {
    const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
    const box = `<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="4" name="TextBox"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr/><xdr:txBody><a:bodyPr ${A}/><a:p ${A}><a:r><a:t>Note</a:t></a:r></a:p></xdr:txBody></xdr:sp>`;
    const group = `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="2" name="Group" descr="Two notes"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${box}${box}</xdr:grpSp>`;
    const a = await analyzeXlsx(
      await buildXlsx({
        sheets: [
          {
            name: "Data",
            cells: [{ ref: "A1", value: "1" }],
            rawDrawings: `<xdr:oneCellAnchor>${group}</xdr:oneCellAnchor>`,
          },
        ],
      }),
    );
    expect(a.images).toEqual([]);
  });

  it("docx: a group with alt text holding a plain drawn shape beside its text box is one image", async () => {
    const WPG = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup";
    const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
    const box = `<wps:wsp><wps:cNvPr id="4" name="Text Box 4"/><wps:spPr/><wps:txbx><w:txbxContent><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>`;
    const arrow = `<wps:wsp><wps:cNvPr id="5" name="Arrow 5"/><wps:spPr/></wps:wsp>`;
    const group = (members: string) =>
      `<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="1" name="Group 1" descr="Flow from intake to award"/>` +
      `<a:graphic><a:graphicData uri="${WPG}"><wpg:wgp xmlns:wpg="${WPG}" xmlns:wps="${WPS}"><wpg:cNvGrpSpPr/><wpg:grpSpPr/>${members}</wpg:wgp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
    const images = async (members: string) =>
      (await analyzeDocx(await buildDocx({ body: paragraph("Text") + group(members) }))).images;
    expect(await images(box + box)).toEqual([]);
    expect((await images(box + arrow)).map((i) => i.altText)).toEqual([
      "Flow from intake to award",
    ]);
  });
});

// ===========================================================================
// Owner decision 2026-11-12: a plain drawn shape with no text needs a
// description or the decorative mark — in Word, PowerPoint AND Excel.
// ===========================================================================
describe("a plain textless drawn shape needs alt text or the decorative mark, in every format", () => {
  const DEC =
    '<a:extLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>';
  type Opt = { descr?: string; decorative?: boolean };
  const props = (tag: string, name: string, o: Opt) =>
    `<${tag} id="40" name="${name}"${o.descr ? ` descr="${o.descr}"` : ""}>${o.decorative ? DEC : ""}</${tag}>`;
  const expectFails = (r: ScoringResult, route: RegExp) => {
    const alt = cat(r, "alt_text");
    expect(alt.score).toBe(0);
    expect(alt.severity).toBe("Critical");
    const text = alt.findings.join(" ");
    expect(text).toMatch(/1 of them is a drawn shape with no text/);
    expect(text).toMatch(/Mark as decorative/);
    expect(text).toMatch(route);
    expect(failed(r, "1.1.1", "alt_text")).toHaveLength(1);
  };
  const expectClean = (r: ScoringResult, score: number | null) => {
    expect(cat(r, "alt_text").score).toBe(score);
    expect(failed(r, "1.1.1")).toHaveLength(0);
  };

  // --- PowerPoint -----------------------------------------------------------
  const pRect = (o: Opt = {}) =>
    `<p:sp><p:nvSpPr>${props("p:cNvPr", "Rectangle 3", o)}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p/></p:txBody></p:sp>`;
  const pLine = (o: Opt = {}) =>
    `<p:cxnSp><p:nvCxnSpPr>${props("p:cNvPr", "Straight Connector 4", o)}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:prstGeom prst="line"><a:avLst/></a:prstGeom></p:spPr></p:cxnSp>`;
  const deck = async (body: string) =>
    scorePptx(await analyzePptx(await buildPptx({ slides: [{ title: "Slide", body }] })));

  it("pptx: without alt text it fails 1.1.1, and the finding names both fixes", async () => {
    expectFails(await deck(pRect()), /In PowerPoint: right-click the shape → View Alt Text/);
  });
  it("pptx: described, decorative, or inside a described group it passes", async () => {
    expectClean(await deck(pRect({ descr: "Arrow from intake to review" })), 100);
    expectClean(await deck(pRect({ decorative: true })), null);
    expectClean(
      await deck(
        groupShape(pRect() + pRect()).replace('name="Group"', 'name="Group" descr="Process flow"'),
      ),
      100,
    );
  });
  it("pptx: a connector line follows the same rule", async () => {
    expectFails(await deck(pLine()), /In PowerPoint/);
    expectClean(await deck(pLine({ decorative: true })), null);
  });

  // --- Excel ----------------------------------------------------------------
  const xRect = (o: Opt = {}) =>
    `<xdr:sp><xdr:nvSpPr>${props("xdr:cNvPr", "Rectangle 3", o)}<xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr/></xdr:sp>`;
  const xLine = (o: Opt = {}) =>
    `<xdr:cxnSp><xdr:nvCxnSpPr>${props("xdr:cNvPr", "Straight Connector 4", o)}<xdr:cNvCxnSpPr/></xdr:nvCxnSpPr><xdr:spPr/></xdr:cxnSp>`;
  const book = async (objects: string) =>
    scoreXlsx(
      await analyzeXlsx(
        await buildXlsx({
          sheets: [
            {
              name: "Data",
              cells: [{ ref: "A1", value: "1" }],
              rawDrawings: `<xdr:oneCellAnchor>${objects}</xdr:oneCellAnchor>`,
            },
          ],
        }),
      ),
    );

  it("xlsx: without alt text it fails 1.1.1, and the finding names both fixes", async () => {
    expectFails(await book(xRect()), /In Excel: right-click the shape → View Alt Text/);
  });
  it("xlsx: described, decorative, or inside a described group it passes", async () => {
    expectClean(await book(xRect({ descr: "Arrow to the totals row" })), 100);
    expectClean(await book(xRect({ decorative: true })), null);
    expectClean(
      await book(
        `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="2" name="Group" descr="Process flow"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr/>${xRect()}${xRect()}</xdr:grpSp>`,
      ),
      100,
    );
  });
  it("xlsx: a connector line follows the same rule", async () => {
    expectFails(await book(xLine()), /In Excel/);
    expectClean(await book(xLine({ decorative: true })), null);
  });

  // --- Word -----------------------------------------------------------------
  const WPG = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup";
  const WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
  const wRect = (o: Opt = {}) =>
    `<w:p><w:r><w:drawing><wp:inline>${props("wp:docPr", "Rectangle 3", o)}` +
    `<a:graphic><a:graphicData uri="${WPS}"><wps:wsp xmlns:wps="${WPS}"><wps:cNvSpPr/><wps:spPr/></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const wGroup = (descr: string) =>
    `<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="1" name="Group 1" descr="${descr}"/>` +
    `<a:graphic><a:graphicData uri="${WPG}"><wpg:wgp xmlns:wpg="${WPG}" xmlns:wps="${WPS}"><wpg:cNvGrpSpPr/><wpg:grpSpPr/>` +
    `<wps:wsp><wps:cNvPr id="5" name="Rectangle 5"/><wps:spPr/></wps:wsp><wps:wsp><wps:cNvPr id="6" name="Arrow 6"/><wps:spPr/></wps:wsp>` +
    `</wpg:wgp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
  const doc = async (body: string) =>
    scoreDocx(await analyzeDocx(await buildDocx({ body: paragraph("Text") + body })));

  it("docx: without alt text it fails 1.1.1, and the finding names both fixes", async () => {
    expectFails(await doc(wRect()), /In Word: right-click the shape → View Alt Text/);
  });
  it("docx: described, decorative, or inside a described group it passes", async () => {
    expectClean(await doc(wRect({ descr: "Arrow from intake to review" })), 100);
    expectClean(await doc(wRect({ decorative: true })), null);
    expectClean(await doc(wGroup("Process flow")), 100);
  });

  it("a missing picture is not described as a drawn shape", async () => {
    const r = await deck(picture());
    expect(cat(r, "alt_text").findings.join(" ")).not.toMatch(/drawn shape/);
  });
});
