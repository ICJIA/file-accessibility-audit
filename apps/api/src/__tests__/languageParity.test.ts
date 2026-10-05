/**
 * ONE DECLARATION, ONE VERDICT, IN EVERY FORMAT (2026-10-05).
 *
 * PDF has checked since 2026-08-29 that a declared language is a usable code
 * AND is not contradicted by the text (languagePlausibility.ts — four guards,
 * deliberately hard to trigger). Word and PowerPoint gave full language
 * credit to ANY declaration, so a Spanish document declared en-US, or one
 * declared "english", passed as Office and failed 3.1.1 as its PDF.
 *
 * Office adds one guard of its own, because Office also declares language
 * per run: when the language the text reads as IS declared somewhere in the
 * file — Word's autodetect marks Spanish runs es-ES, PowerPoint stamps a
 * language on every run — a screen reader switches to it there, so no
 * mismatch is asserted. The PDF never carries that evidence at document
 * level, which is exactly how the original syllabus went wrong.
 *
 * Word and PowerPoint run end to end through the real parsers, so the text
 * sample and the declared-language census are exercised, not mocked. Excel
 * is out of scope: a workbook declares no document language at all (3.1.1 is
 * always "not assessed" there).
 */
import { describe, it, expect } from "vitest";
import { analyzeDocument } from "../services/analyzer.js";
import { scoreDocument } from "../services/scorer.js";
import { analyzeDocx } from "../services/docxService.js";
import { buildDocx } from "./helpers/minimalDocx.js";
import { buildPptx, bodyShape, para } from "./helpers/minimalPptx.js";
import { taggedBaseline } from "./helpers/mockResults.js";

const SPANISH = [
  "El departamento publica este programa del curso para los estudiantes que están inscritos en la secuencia de física y para todas las personas que consideran el curso.",
  "El texto explica lo que la clase va a cubrir, cómo se evalúa el trabajo y dónde encontrar ayuda cuando un ejercicio es difícil.",
  "Los estudiantes deben leerlo antes de la primera reunión.",
  "El profesor tiene horas de oficina dos veces por semana y responde a las preguntas por correo en un plazo de dos días hábiles.",
];
const ENGLISH = [
  "The department publishes this course syllabus for students who are enrolled in the introductory physics sequence and for anyone who is considering the course.",
  "The text explains what the class will cover, how the work is graded, and where to find help when a problem set is difficult.",
  "Students should read it before the first meeting.",
  "The instructor holds office hours twice a week and answers questions by email within two working days.",
];

interface Doc {
  /** The document-level declaration. */
  language: string;
  sentences: string[];
  /** Office only: mark every run with this language (Word autodetect,
   *  PowerPoint's per-run stamp). */
  runLanguage?: string;
}

async function pdf(d: Doc) {
  const { qpdf, pdfjs } = taggedBaseline();
  qpdf.displayDocTitle = true;
  qpdf.hasLang = true;
  qpdf.lang = d.language;
  pdfjs.textSample = d.sentences.join(" ");
  return scoreDocument(qpdf, pdfjs);
}

async function docx(d: Doc) {
  const rPr = d.runLanguage ? `<w:rPr><w:lang w:val="${d.runLanguage}"/></w:rPr>` : "";
  const body = d.sentences.map((s) => `<w:p><w:r>${rPr}<w:t>${s}</w:t></w:r></w:p>`).join("");
  return analyzeDocument(await buildDocx({ body, language: d.language }), "report.docx");
}

async function pptx(d: Doc) {
  const paras = d.sentences
    .map((s) => para(s, d.runLanguage ? { lang: d.runLanguage } : {}))
    .join("");
  return analyzeDocument(
    await buildPptx({
      slides: [{ title: "Programa del curso", body: bodyShape(paras) }],
      language: d.language,
    }),
    "deck.pptx",
  );
}

const FORMATS = { pdf, docx, pptx } as const;
type Format = keyof typeof FORMATS;
const ALL = Object.keys(FORMATS) as Format[];
const OFFICE: Format[] = ["docx", "pptx"];

async function verdict(fmt: Format, d: Doc) {
  const r = await FORMATS[fmt](d);
  const cat = r.categories.find((c) => c.id === "title_language")!;
  const lang311 = (r.conformance?.failures ?? []).filter(
    (f) => f.sc === "3.1.1" && f.category === "title_language",
  );
  return { score: cat.score, failed311: lang311.length > 0, findings: cat.findings.join(" ") };
}

describe("language parity — the same declaration on the same text, the same verdict", () => {
  it.each(ALL)(
    "%s: Spanish text declared en-US — half the language credit, 3.1.1 named",
    async (fmt) => {
      const v = await verdict(fmt, { language: "en-US", sentences: SPANISH });
      expect(v.score).toBe(75);
      expect(v.failed311).toBe(true);
      expect(v.findings).toMatch(/reads as Spanish/);
    },
  );

  it.each(ALL)("%s: English text declared en-US — full credit, nothing said", async (fmt) => {
    const v = await verdict(fmt, { language: "en-US", sentences: ENGLISH });
    expect(v.score).toBe(100);
    expect(v.failed311).toBe(false);
  });

  it.each(ALL)(
    '%s: a declaration that is not a language code ("english") — half credit, 3.1.1 named',
    async (fmt) => {
      const v = await verdict(fmt, { language: "english", sentences: ENGLISH });
      expect(v.score).toBe(75);
      expect(v.failed311).toBe(true);
      expect(v.findings).toMatch(/not a usable language code/);
    },
  );

  it.each(ALL)("%s: too little text to judge — silent (guard 1 holds everywhere)", async (fmt) => {
    const v = await verdict(fmt, { language: "en-US", sentences: [SPANISH[2]!] });
    expect(v.score).toBe(100);
    expect(v.failed311).toBe(false);
  });
});

describe("Office's own guard — a language the file declares is never called a mismatch", () => {
  it.each(OFFICE)("%s: Spanish runs marked es-ES under an en-US default — silent", async (fmt) => {
    const v = await verdict(fmt, { language: "en-US", sentences: SPANISH, runLanguage: "es-ES" });
    expect(v.score).toBe(100);
    expect(v.failed311).toBe(false);
  });

  it.each(OFFICE)(
    "%s: Spanish runs marked en-US — the runs themselves are wrong, so it is named",
    async (fmt) => {
      const v = await verdict(fmt, { language: "en-US", sentences: SPANISH, runLanguage: "en-US" });
      expect(v.score).toBe(75);
      expect(v.failed311).toBe(true);
    },
  );
});

// The value judged above must BE the document default. Word's language was
// read from the first w:lang with a value anywhere in styles.xml — any
// style's — so a "French Quote" character style could become the language
// of an English document, and the new mismatch check would then accuse it.
// Now: docDefaults' rPrDefault, else the default paragraph style, else the
// core properties (unchanged).
describe("Word reads its default language from where Word declares it", () => {
  const styles = (inner: string) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:styles>`;
  const body = ENGLISH.map((s) => `<w:p><w:r><w:t>${s}</w:t></w:r></w:p>`).join("");
  const NO_CORE_LANG =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Course Syllabus</dc:title></cp:coreProperties>';

  it("a non-default style's language is not the document's language", async () => {
    const a = await analyzeDocx(
      await buildDocx({
        body,
        coreXml: NO_CORE_LANG,
        stylesXml: styles(
          '<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault></w:docDefaults>' +
            '<w:style w:type="character" w:styleId="FrenchQuote"><w:name w:val="French Quote"/><w:rPr><w:lang w:val="fr-FR"/></w:rPr></w:style>',
        ),
      }),
    );
    expect(a.metadata.language).toBeNull();
  });

  it("the default paragraph style's language is the document's language when docDefaults has none", async () => {
    const a = await analyzeDocx(
      await buildDocx({
        body,
        coreXml: NO_CORE_LANG,
        stylesXml: styles(
          '<w:style w:type="character" w:styleId="FrenchQuote"><w:name w:val="French Quote"/><w:rPr><w:lang w:val="fr-FR"/></w:rPr></w:style>' +
            '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:lang w:val="en-GB"/></w:rPr></w:style>',
        ),
      }),
    );
    expect(a.metadata.language).toBe("en-GB");
  });

  it("docDefaults wins over every style", async () => {
    const a = await analyzeDocx(
      await buildDocx({
        body,
        coreXml: NO_CORE_LANG,
        stylesXml: styles(
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:lang w:val="en-GB"/></w:rPr></w:style>' +
            '<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults>',
        ),
      }),
    );
    expect(a.metadata.language).toBe("en-US");
  });
});
