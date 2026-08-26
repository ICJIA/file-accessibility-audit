/**
 * v1.94.0 — the pdfjs text censuses (Matterhorn 10 + 01), unit-tested with
 * synthetic getTextContent({ includeMarkedContent: true }) item streams (the
 * pdfjsHeadingOutline.test.ts pattern). These run on every PDF audit, so the
 * classification rules matter: artifact runs are ignored entirely, MCID-
 * bearing runs make text "tagged", whitespace never counts as visible, and
 * PUA/replacement characters are the unmapped-glyph signal.
 *
 * Also covers detectPdfUaFlavour — the byte sniff that picks veraPDF's ua2
 * profile for PDF/UA-2 documents (wrong-negative keeps ua1, never worse).
 */
import { describe, it, expect } from "vitest";
import { censusTextItems, isUnmappedChar } from "../services/pdfjsService.js";
import { detectPdfUaFlavour } from "../services/veraPdfBuffer.js";

const begin = (id: string | null, tag?: string) => ({
  type: "beginMarkedContentProps",
  id: id ?? undefined,
  tag: tag ?? "P",
});
const end = () => ({ type: "endMarkedContent" });
const str = (s: string) => ({ str: s });

describe("censusTextItems — tagged vs untagged visible text (Matterhorn 01)", () => {
  it("classifies text inside an MCID-bearing run as tagged, outside as untagged", () => {
    const c = censusTextItems([begin("p1_mc0"), str("Tagged four"), end(), str("Loose")]);
    expect(c.taggedVisibleChars).toBe("Taggedfour".length);
    expect(c.untaggedVisibleChars).toBe("Loose".length);
  });

  it("ignores artifact runs entirely — headers and footers are deliberately outside the reading order", () => {
    const c = censusTextItems([
      begin(null, "Artifact"),
      str("Page 4 of 9"),
      end(),
      begin("p1_mc1"),
      str("Body"),
      end(),
    ]);
    expect(c.untaggedVisibleChars).toBe(0);
    expect(c.taggedVisibleChars).toBe(4);
  });

  it("a nested run inherits taggedness from any enclosing MCID frame (Span-inside-P)", () => {
    const c = censusTextItems([
      begin("p1_mc0"),
      begin(null, "Span"), // a Lang span with no MCID of its own
      str("inner"),
      end(),
      end(),
    ]);
    expect(c.taggedVisibleChars).toBe(5);
    expect(c.untaggedVisibleChars).toBe(0);
  });

  it("whitespace is never visible text", () => {
    const c = censusTextItems([str("   \t  ")]);
    expect(c.taggedVisibleChars).toBe(0);
    expect(c.untaggedVisibleChars).toBe(0);
  });
});

describe("censusTextItems — unmapped characters (Matterhorn 10)", () => {
  it("counts PUA and replacement characters outside artifacts", () => {
    const c = censusTextItems([
      begin("p1_mc0"),
      str("ok"),
      end(),
      str("�"),
      begin(null, "Artifact"),
      str(""), // artifact — ignored
      end(),
    ]);
    expect(c.unmappedChars).toBe(3);
  });

  it("isUnmappedChar covers the three PUA planes and U+FFFD, and nothing ordinary", () => {
    expect(isUnmappedChar(0xe000)).toBe(true);
    expect(isUnmappedChar(0xf8ff)).toBe(true);
    expect(isUnmappedChar(0xf0000)).toBe(true);
    expect(isUnmappedChar(0x10fffd)).toBe(true);
    expect(isUnmappedChar(0xfffd)).toBe(true);
    expect(isUnmappedChar("A".codePointAt(0)!)).toBe(false);
    expect(isUnmappedChar("é".codePointAt(0)!)).toBe(false);
    expect(isUnmappedChar("中".codePointAt(0)!)).toBe(false);
  });
});

describe("detectPdfUaFlavour — the ua2 byte sniff (v1.94.0)", () => {
  it("picks ua2 for attribute-form and element-form part 2 declarations", () => {
    expect(detectPdfUaFlavour(Buffer.from('<rdf:Description pdfuaid:part="2"/>', "latin1"))).toBe(
      "ua2",
    );
    expect(detectPdfUaFlavour(Buffer.from("<pdfuaid:part>2</pdfuaid:part>", "latin1"))).toBe("ua2");
  });

  it("stays ua1 for part 1, for no identifier at all, and for unrelated pdfuaid mentions", () => {
    expect(detectPdfUaFlavour(Buffer.from('<rdf:Description pdfuaid:part="1"/>', "latin1"))).toBe(
      "ua1",
    );
    expect(detectPdfUaFlavour(Buffer.from("%PDF-1.7 no xmp here", "latin1"))).toBe("ua1");
    expect(
      detectPdfUaFlavour(Buffer.from('xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"', "latin1")),
    ).toBe("ua1");
  });

  it("finds a part-2 declaration after an earlier unrelated pdfuaid occurrence", () => {
    const buf = Buffer.from(
      'xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/" …………… <pdfuaid:part>2</pdfuaid:part>',
      "latin1",
    );
    expect(detectPdfUaFlavour(buf)).toBe("ua2");
  });
});
