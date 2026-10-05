/**
 * "COULD NOT BE READ" IS NOT "MISSING", IN EVERY OFFICE FORMAT (2026-10-05).
 *
 * Word has always told the two apart (scoreDocxTitleLanguage and the gate's
 * coreUnreadable guard, 2026-09-01): a document-properties part that cannot
 * be parsed says nothing about the title, so the title half is not scored and
 * no 2.4.2 failure is asserted. PowerPoint and Excel read the same part with
 * no such guard, so a corrupt core.xml became a confirmed "has no title in
 * its properties" — WCAG 2.4.2 named against a title the checker never saw.
 *
 * Run end to end through the real parsers: the same corrupt part must produce
 * the same verdict in all three formats, and a part that is merely ABSENT —
 * which really does mean no title — must still be failed.
 */
import { describe, it, expect } from "vitest";
import { analyzeDocument } from "../services/analyzer.js";
import { buildDocx, styledParagraph } from "./helpers/minimalDocx.js";
import { buildPptx } from "./helpers/minimalPptx.js";
import { buildXlsx } from "./helpers/minimalXlsx.js";

const CORRUPT = "<cp:coreProperties <<< this is not XML";

const build = {
  docx: () =>
    buildDocx({ body: styledParagraph("Heading1", "Quarterly Report"), coreXml: CORRUPT }),
  pptx: () => buildPptx({ slides: [{ title: "Welcome" }], coreXml: CORRUPT }),
  xlsx: () => buildXlsx({ sheets: [{ name: "FY26 Grants" }], coreXml: CORRUPT }),
} as const;
type Format = keyof typeof build;
const ALL = Object.keys(build) as Format[];

describe("an unreadable document-properties part is not a missing title", () => {
  it.each(ALL)(
    "%s: no 2.4.2 failure is asserted, and the report says the part could not be read",
    async (fmt) => {
      const r = await analyzeDocument(await build[fmt](), `report.${fmt}`);
      const cat = r.categories.find((c) => c.id === "title_language")!;
      const twoFourTwo = (r.conformance?.failures ?? []).filter(
        (f) => f.sc === "2.4.2" && f.category === "title_language",
      );
      expect(twoFourTwo).toHaveLength(0);
      expect(cat.findings.join(" ")).toMatch(/could not be read/i);
      expect(cat.findings.join(" ")).not.toMatch(
        /no (document|presentation|workbook) title is set/i,
      );
    },
  );
});

describe("a readable properties part with no title is still a missing title", () => {
  const NO_TITLE =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Agency</dc:creator></cp:coreProperties>';
  const noTitle = {
    docx: () =>
      buildDocx({ body: styledParagraph("Heading1", "Quarterly Report"), coreXml: NO_TITLE }),
    pptx: () => buildPptx({ slides: [{ title: "Welcome" }], coreXml: NO_TITLE }),
    xlsx: () => buildXlsx({ sheets: [{ name: "FY26 Grants" }], coreXml: NO_TITLE }),
  } as const;

  it.each(ALL)("%s: 2.4.2 is named — the guard excuses only an unreadable part", async (fmt) => {
    const r = await analyzeDocument(await noTitle[fmt](), `report.${fmt}`);
    expect(
      (r.conformance?.failures ?? []).some(
        (f) => f.sc === "2.4.2" && f.category === "title_language",
      ),
    ).toBe(true);
  });
});
