/**
 * HEADERS THAT LABEL NOTHING (2026-10-06, user decision: report, don't score).
 *
 * A table can have its header row marked and still give a screen reader
 * nothing to announce: the header cells are empty, or — in Excel — they still
 * carry the names Excel invents when an author converts a range to a table
 * without one ("Column1", "Column2" …). WCAG 1.3.1 is met on paper (the header
 * structure exists), so neither is scored; both are reported as advisories,
 * in every format that can have them, so the author learns the header row
 * says nothing.
 */
import { describe, it, expect } from "vitest";
import { analyzeDocx } from "../services/docxService.js";
import { analyzePptx } from "../services/pptxService.js";
import { analyzeXlsx } from "../services/xlsxService.js";
import { scoreDocx, scorePptx, scoreXlsx, scoreDocument } from "../services/scorer.js";
import { tableRegionsForPage } from "../services/pdfjsService.js";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildPptx, pptTable } from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";
import { taggedBaseline } from "./helpers/mockResults.js";

const tableFindings = (r: {
  categories: Array<{ id: string; score: number | null; findings: string[] }>;
}) => r.categories.find((c) => c.id === "table_markup")!;

describe("Excel: tables still headed with Excel's default names", () => {
  const book = (columns: string[], headerRowCount?: 0 | 1) =>
    buildXlsx({
      sheets: [
        {
          name: "FY26 Grants",
          dimensionRef: "A1:C4",
          tables: [{ name: "Grants", headerRowCount, columns }],
        },
      ],
    });

  it("records the default names a table still carries", async () => {
    const a = await analyzeXlsx(await book(["Column1", "Award", "Column3"]));
    expect(a.tables[0]!.defaultHeaderNames).toEqual(["Column1", "Column3"]);
  });

  it("reports them as an advisory and keeps the score", async () => {
    const r = scoreXlsx(await analyzeXlsx(await book(["Column1", "Column2", "Column3"])));
    const t = tableFindings(r);
    expect(t.score).toBe(100);
    expect(t.findings.join(" ")).toMatch(/^.*Advisory — not scored:.*default header names/);
    expect(t.findings.join(" ")).toMatch(/Column1/);
  });

  it("says nothing when every header is a real name", async () => {
    const r = scoreXlsx(await analyzeXlsx(await book(["Program", "Award", "Sites"])));
    expect(tableFindings(r).findings.join(" ")).not.toMatch(/default header names/);
  });

  it("a table with no header row is not also told its headers are defaults", async () => {
    const r = scoreXlsx(await analyzeXlsx(await book(["Column1", "Column2", "Column3"], 0)));
    expect(tableFindings(r).findings.join(" ")).not.toMatch(/default header names/);
  });
});

describe("Word: a marked header row whose cells are empty", () => {
  const LOOK_ON =
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>';
  const BORDERS = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((x) => `<w:${x} w:val="single" w:sz="4"/>`).join("")}</w:tblBorders>`;
  const doc = (header: [string, string]) =>
    buildDocx({
      body:
        `<w:tbl><w:tblPr>${BORDERS}${LOOK_ON}</w:tblPr><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
        `<w:tr>${header.map((h) => `<w:tc>${h ? `<w:p><w:r><w:t>${h}</w:t></w:r></w:p>` : "<w:p/>"}</w:tc>`).join("")}</w:tr>` +
        `<w:tr><w:tc><w:p><w:r><w:t>Job Training</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>412,000</w:t></w:r></w:p></w:tc></w:tr>` +
        `</w:tbl>`,
    });

  it("is recorded and reported as an advisory; the score is unchanged", async () => {
    const a = await analyzeDocx(await doc(["", ""]));
    expect(a.tables[0]!.emptyHeaderRow).toBe(true);
    const t = tableFindings(scoreDocx(a));
    expect(t.score).toBe(100);
    expect(t.findings.join(" ")).toMatch(/Advisory — not scored:.*header row.*empty/);
  });

  it("a header row with any label is not empty", async () => {
    const a = await analyzeDocx(await doc(["Program", ""]));
    expect(a.tables[0]!.emptyHeaderRow).toBeFalsy();
  });
});

describe("PowerPoint: a marked header row whose cells are empty", () => {
  it("is recorded and reported as an advisory; the score is unchanged", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [
          { title: "Grants", body: pptTable({ firstRow: true, rows: 3, emptyFirstRow: true }) },
        ],
      }),
    );
    expect(a.tables[0]!.emptyHeaderRow).toBe(true);
    const t = tableFindings(scorePptx(a));
    expect(t.score).toBe(100);
    expect(t.findings.join(" ")).toMatch(/Advisory — not scored:.*header row.*empty/);
  });

  it("a labelled header row is not empty", async () => {
    const a = await analyzePptx(
      await buildPptx({
        slides: [{ title: "Grants", body: pptTable({ firstRow: true, rows: 3 }) }],
      }),
    );
    expect(a.tables[0]!.emptyHeaderRow).toBeFalsy();
  });
});

describe("PDF: header cells (<TH>) with no text", () => {
  const tree = () => ({
    children: [
      {
        role: "Table",
        children: [
          {
            role: "TR",
            children: [
              { role: "TH", children: [{ type: "content", id: "p3R_mc1" }] },
              { role: "TH", children: [{ type: "content", id: "p3R_mc2" }] },
            ],
          },
          {
            role: "TR",
            children: [
              { role: "TD", children: [{ type: "content", id: "p3R_mc3" }] },
              { role: "TD", children: [{ type: "content", id: "p3R_mc4" }] },
            ],
          },
        ],
      },
    ],
  });
  const boxes = (thText: boolean) =>
    new Map<string, number[]>([
      ...(thText
        ? ([
            ["p3R_mc1", [72, 720, 140, 732]],
            ["p3R_mc2", [220, 720, 300, 732]],
          ] as Array<[string, number[]]>)
        : []),
      ["p3R_mc3", [72, 700, 150, 712]],
      ["p3R_mc4", [220, 700, 300, 712]],
    ]);

  it("a region whose every header cell is empty is marked", () => {
    expect(tableRegionsForPage(tree(), boxes(false), [], 1)[0]!.emptyHeaders).toBe(true);
    expect(tableRegionsForPage(tree(), boxes(true), [], 1)[0]!.emptyHeaders).toBeFalsy();
  });

  it("the scorer reports it as an advisory and keeps the score", () => {
    const { qpdf, pdfjs } = taggedBaseline();
    qpdf.tables = [
      {
        hasHeaders: true,
        headerCount: 2,
        dataCellCount: 2,
        hasScope: false,
        scopeMissingCount: 2,
        hasRowStructure: true,
        rowCount: 2,
        hasNestedTable: false,
        hasCaption: false,
        hasConsistentColumns: true,
        columnCounts: [2, 2],
        simpleHeaderLayout: true,
        hasHeaderAssociation: false,
        contentIds: ["p3R_mc1", "p3R_mc2", "p3R_mc3", "p3R_mc4"],
      },
    ];
    pdfjs.tableRegions = [{ ids: ["p3R_mc3"], page: 1, drawn: true, emptyHeaders: true }];
    const t = tableFindings(scoreDocument(qpdf, pdfjs));
    expect(t.score).toBe(100);
    expect(t.findings.join(" ")).toMatch(/Advisory — not scored:.*header cells.*no text/);
  });
});
