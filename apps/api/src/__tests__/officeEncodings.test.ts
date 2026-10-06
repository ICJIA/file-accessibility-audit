/**
 * THE SAME OFFICE DOCUMENT, WRITTEN ANOTHER LEGAL WAY (2026-10-06).
 *
 * Every case here is a divergence the Office encoding-invariance gate found on
 * its first run (scripts/office-encoding-invariance.ts). That gate re-writes one
 * Word document, one deck and one workbook in every legal encoding of the same
 * meaning and requires the same verdict. Each test below builds a document,
 * changes ONE encoding, and requires that the parser reads the same meaning:
 *
 *   - numeric character references (&#xA; in PowerPoint's alt text) decoded
 *   - parts encoded as UTF-16, which OPC allows, read at all
 *   - bold switched OFF (w:val="0" — python-docx's run.bold = False) not bold
 *   - xsd:boolean "true"/"false", not only "1"/"0", in PowerPoint and DrawingML
 *   - a slide's relationship id found whatever the attribute order
 *   - absolute relationship targets resolved
 *   - Excel rows and cells without r= positioned by order
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseXml, rootElement, attrOf, textOf, drawingAltText } from "@file-audit/analyzer/ooxml";
import { detectFileType } from "../services/analyzer.js";
import { analyzeDocx } from "../services/docxService.js";
import { analyzePptx } from "../services/pptxService.js";
import { analyzeXlsx } from "../services/xlsxService.js";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildPptx, bodyShape, para, picture } from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";

/** Re-zip a package with every XML part passed through `f`, plus `add`. */
async function rewrite(
  buf: Buffer,
  f: (name: string, xml: string) => string | Buffer = (_n, x) => x,
  add: Record<string, string> = {},
): Promise<Buffer> {
  const src = await JSZip.loadAsync(buf);
  const out = new JSZip();
  for (const [name, entry] of Object.entries(src.files)) {
    if (entry.dir) continue;
    if (/\.(xml|rels)$/.test(name)) out.file(name, f(name, await entry.async("string")));
    else out.file(name, await entry.async("nodebuffer"));
  }
  for (const [name, xml] of Object.entries(add)) out.file(name, f(name, xml));
  return out.generateAsync({ type: "nodebuffer" });
}

describe("numeric character references are decoded, as XML requires", () => {
  it("in text and in attribute values; an escaped ampersand stays literal", () => {
    const root = rootElement(
      parseXml(
        `<r a="x&#xA;&#xA;y &#233;"><t>caf&#233; &#x2019; &amp;#233; &amp;amp; &lt;b&gt;</t></r>`,
      ),
      "r",
    )!;
    expect(attrOf(root, "a")).toBe("x\n\ny é");
    expect(textOf(root)).toBe("café ’ &#233; &amp; <b>");
  });

  it("a reference to a character XML forbids is left as written, never invented", () => {
    const root = rootElement(parseXml("<r><t>a&#0;b&#xD800;c&#x110000;d</t></r>"), "r")!;
    expect(textOf(root)).toBe("a&#0;b&#xD800;c&#x110000;d");
  });

  it("PowerPoint's line breaks in alt text arrive as line breaks", async () => {
    // Real PowerPoint writes descr="…&#xA;&#xA;Description automatically generated".
    const a = await analyzePptx(
      await buildPptx({
        slides: [
          {
            title: "Chart",
            body: picture({ descr: "A bar chart&#xA;&#xA;Description automatically generated" }),
          },
        ],
      }),
    );
    expect(a.images[0]!.altText).toBe("A bar chart\n\nDescription automatically generated");
  });
});

describe("parts encoded as UTF-16 — OPC allows UTF-8 or UTF-16", () => {
  const utf16le = (xml: string) =>
    Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(xml.replace(/encoding="UTF-8"/i, 'encoding="UTF-16"'), "utf16le"),
    ]);
  const utf16be = (xml: string) => {
    const le = Buffer.from(xml.replace(/encoding="UTF-8"/i, 'encoding="UTF-16"'), "utf16le");
    return Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(le).swap16()]);
  };

  it("a Word file whose every part is UTF-16 is recognized and read", async () => {
    const buf = await rewrite(await buildDocx(), (_n, xml) => utf16le(xml));
    expect(await detectFileType(buf)).toBe("docx");
    const a = await analyzeDocx(buf);
    expect(a.metadata.title).toBe("Quarterly Report");
    expect(a.metadata.language).toBe("en-US");
  });

  it("big-endian UTF-16 too", async () => {
    const a = await analyzeDocx(await rewrite(await buildDocx(), (_n, xml) => utf16be(xml)));
    expect(a.metadata.title).toBe("Quarterly Report");
  });
});

describe("Word: bold switched off is not bold (ST_OnOff)", () => {
  const line = (b: string, color = "") =>
    buildDocx({
      body: `<w:p><w:r><w:rPr>${b}${color}<w:sz w:val="28"/></w:rPr><w:t>Totals exclude pending awards.</w:t></w:r></w:p>`,
    });

  for (const val of ["0", "false", "off"]) {
    it(`a short 14 pt line with <w:b w:val="${val}"/> is not a typed heading`, async () => {
      // w:val="0" is what python-docx writes for run.bold = False (1.2.0).
      const a = await analyzeDocx(await line(`<w:b w:val="${val}"/>`));
      expect(a.fakeHeadings).toEqual([]);
    });
  }

  it('<w:b w:val="off"/> does not make 14 pt grey text large', async () => {
    const a = await analyzeDocx(await line('<w:b w:val="off"/>', '<w:color w:val="808080"/>'));
    expect(a.contrast.failing.map((f) => f.large)).toEqual([false]);
  });

  it('a paragraph style with <w:b w:val="off"/> hands its runs no bold', async () => {
    const stylesXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:rPr><w:b w:val="off"/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`;
    const a = await analyzeDocx(
      await buildDocx({
        stylesXml,
        body: `<w:p><w:pPr><w:pStyle w:val="Note"/></w:pPr><w:r><w:rPr><w:color w:val="808080"/></w:rPr><w:t>Totals exclude pending awards.</w:t></w:r></w:p>`,
      }),
    );
    expect(a.contrast.failing.map((f) => f.large)).toEqual([false]);
  });
});

describe("Excel: bold switched off is not bold", () => {
  for (const val of ["0", "false"]) {
    it(`<b val="${val}"/> does not make 14 pt grey text large`, async () => {
      const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b val="${val}"/><sz val="14"/><color rgb="FF808080"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>`;
      const a = await analyzeXlsx(
        await buildXlsx({
          stylesXml,
          sheets: [
            {
              name: "Notes",
              dimensionRef: "A1:A1",
              cells: [
                { ref: "A1", styleIndex: 1, kind: "is", value: "Totals exclude pending awards." },
              ],
            },
          ],
        }),
      );
      expect(a.contrast.failing.map((f) => f.large)).toEqual([false]);
    });
  }
});

describe("PowerPoint and DrawingML: xsd:boolean is true/false as well as 1/0", () => {
  it('a slide with show="false" is hidden', async () => {
    const buf = await rewrite(
      await buildPptx({ slides: [{ title: "Visible" }, { title: null, hidden: true }] }),
      (_n, x) => x.replace('show="0"', 'show="false"'),
    );
    const a = await analyzePptx(buf);
    expect(a.slides[1]!.hidden).toBe(true);
  });

  it('b="true" is bold: a 16 pt bold line on an untitled slide is a typed heading', async () => {
    const box = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="TextBox 2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="1600" b="true"/><a:t>Draft notes for the board</a:t></a:r></a:p></p:txBody></p:sp>`;
    const a = await analyzePptx(await buildPptx({ slides: [{ title: null, body: box }] }));
    expect(a.fakeHeadings).toEqual([{ slide: 1, text: "Draft notes for the board" }]);
  });

  it('b="true" makes 14 pt grey text large', async () => {
    const buf = await rewrite(
      await buildPptx({
        slideBgHex: "FFFFFF",
        slides: [
          {
            title: "Notes",
            body: bodyShape(
              para("Bold notes are large text.", {
                colorHex: "808080",
                sizeHundredthsPt: 1400,
                bold: true,
              }),
            ),
          },
        ],
      }),
      (_n, x) => x.replace('b="1"', 'b="true"'),
    );
    const a = await analyzePptx(buf);
    expect(a.contrast.checkedRuns).toBe(1);
    expect(a.contrast.failing).toEqual([]);
  });

  it('the decorative mark as val="true" is decorative', () => {
    const cNvPr = rootElement(
      parseXml(
        `<p:cNvPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" id="9" name="Picture"><a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="true"/></a:ext></a:extLst></p:cNvPr>`,
      ),
      "cNvPr",
    )!;
    expect(drawingAltText(cNvPr).decorative).toBe(true);
  });
});

describe("PowerPoint: the presentation's slide list decides the order, however it is written", () => {
  // Two slides whose part names run opposite to the order shown: slide2.xml
  // is the first slide. Only presentation.xml + its rels say so.
  const RELS = (target: (n: number) => string) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[
      1, 2,
    ]
      .map(
        (n) =>
          `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target(n)}"/>`,
      )
      .join("")}</Relationships>`;
  const deck = async (sldIds: string, target: (n: number) => string) =>
    rewrite(
      await buildPptx({ slides: [{ title: "Shown second" }, { title: "Shown first" }] }),
      (n, x) =>
        n === "ppt/presentation.xml"
          ? x.replace(/<p:sldIdLst>.*<\/p:sldIdLst>/s, `<p:sldIdLst>${sldIds}</p:sldIdLst>`)
          : x,
      { "ppt/_rels/presentation.xml.rels": RELS(target) },
    );
  const titles = async (buf: Buffer) => (await analyzePptx(buf)).slides.map((s) => s.title);
  const ID_FIRST = '<p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/>';

  it("baseline: id before r:id, relative targets", async () => {
    expect(await titles(await deck(ID_FIRST, (n) => `slides/slide${n}.xml`))).toEqual([
      "Shown first",
      "Shown second",
    ]);
  });

  it("r:id written before id — attribute order carries no meaning in XML", async () => {
    const rFirst = '<p:sldId r:id="rId3" id="256"/><p:sldId r:id="rId2" id="257"/>';
    expect(await titles(await deck(rFirst, (n) => `slides/slide${n}.xml`))).toEqual([
      "Shown first",
      "Shown second",
    ]);
  });

  it("absolute relationship targets (/ppt/slides/slide1.xml)", async () => {
    expect(await titles(await deck(ID_FIRST, (n) => `/ppt/slides/slide${n}.xml`))).toEqual([
      "Shown first",
      "Shown second",
    ]);
  });
});

describe("Excel: rows and cells without r= are positioned by order", () => {
  const stripRefs = (n: string, x: string) =>
    n.startsWith("xl/worksheets/sheet")
      ? x.replace(/ r="[A-Z]+\d+"/g, "").replace(/<row r="\d+"/g, "<row")
      : x;

  it("a hyperlink's text is read from the cell it points at, and the first data cell is found", async () => {
    const buf = await rewrite(
      await buildXlsx({
        sheets: [
          {
            name: "Links",
            dimensionRef: "A1:A2",
            cells: [
              { ref: "A1", kind: "is", value: "Program" },
              { ref: "A2", kind: "is", value: "Read the guidelines" },
            ],
            hyperlinks: [{ id: "rIdL", target: "https://example.org/guidelines", ref: "A2" }],
          },
        ],
      }),
      stripRefs,
    );
    const a = await analyzeXlsx(buf);
    expect(a.links[0]).toMatchObject({ text: "Read the guidelines", resolved: true });
    expect(a.sheets[0]).toMatchObject({ firstDataRow: 1, firstDataCol: 1 });
  });

  it("a row or cell that states its own r= moves the position; the next one follows it", async () => {
    const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData><row r="3"><c t="inlineStr"><is><t>skip</t></is></c><c r="D3" t="inlineStr"><is><t>D</t></is></c><c t="inlineStr"><is><t>Read the guidelines</t></is></c></row></sheetData><hyperlinks><hyperlink ref="E3" r:id="rIdL"/></hyperlinks></worksheet>`;
    const buf = await rewrite(
      await buildXlsx({
        sheets: [
          {
            name: "Links",
            hyperlinks: [{ id: "rIdL", target: "https://example.org/guidelines", ref: "E3" }],
          },
        ],
      }),
      (n, x) => (n === "xl/worksheets/sheet1.xml" ? sheet : x),
    );
    const a = await analyzeXlsx(buf);
    expect(a.links[0]).toMatchObject({ text: "Read the guidelines", resolved: true });
    expect(a.sheets[0]).toMatchObject({ firstDataRow: 3, firstDataCol: 1 });
  });
});
