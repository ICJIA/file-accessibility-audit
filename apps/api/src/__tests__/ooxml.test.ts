import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  parseXml,
  tagOf,
  childrenOf,
  attrOf,
  firstChild,
  descendants,
  rawText,
  textOf,
  rootElement,
  parseRelationships,
  corePropertyText,
  drawingAltText,
  MANUAL_BULLET_RE,
  normalizeHex,
  contrastRatio,
  readCapped,
  resolveSchemeColor,
  buildSchemeColorMap,
  parseRelationshipEntries,
  assertZipWithinLimits,
  type PONode,
} from "../services/ooxml.js";

// ---------------------------------------------------------------------------
// The shared OOXML core extracted from docxService in v1.33.0. These tests pin
// the format-agnostic contract that docxService, pptxService, and xlsxService
// all build on. Behavior must match the pre-extraction docxService exactly.
// ---------------------------------------------------------------------------

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p w:someAttr="yes"><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>
    <a:p><a:r><a:t>DrawingML text</a:t></a:r></a:p>
  </w:body>
</w:document>`;

function bodyOf(xml: string): PONode {
  const root = rootElement(parseXml(xml), "document")!;
  return firstChild(root, "body")!;
}

describe("XML walker helpers", () => {
  it("parseXml returns [] for null and for invalid XML", () => {
    expect(parseXml(null)).toEqual([]);
    expect(parseXml("<unclosed")).toEqual([]);
  });

  describe("parseXml: DOCTYPE rejection + entity handling (C2 XXE/entity hardening)", () => {
    it("rejects (returns []) a part carrying a <!DOCTYPE with an internal entity — the entity is never expanded into the output", () => {
      // Proven exploitable against this exact parser config (verified against
      // the installed fast-xml-parser@5.9.3 before this guard existed):
      // fast-xml-parser happily parses this and expands &xxe; to
      // "INJECTED-VALUE". OOXML parts never legitimately carry a DOCTYPE, so
      // parseXml now rejects any part containing one, treating it exactly
      // like any other unparseable input (the existing [] contract above).
      const payload =
        `<?xml version="1.0"?>` +
        `<!DOCTYPE root [<!ENTITY xxe "INJECTED-VALUE">]>` +
        `<root>&xxe;</root>`;
      const result = parseXml(payload);
      expect(result).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("INJECTED-VALUE");
    });

    it("rejects DOCTYPE case-insensitively", () => {
      const payload = `<?xml version="1.0"?><!doctype root []><root>x</root>`;
      expect(parseXml(payload)).toEqual([]);
    });

    it("still decodes the five built-in XML entities in ordinary text — processEntities stayed enabled", () => {
      // Companion to the DOCTYPE tests above: proves the DOCTYPE guard did
      // NOT come at the cost of processEntities:false, which would leave
      // &amp; etc. undecoded in every legitimate document (verified against
      // fast-xml-parser@5.9.3's replaceEntitiesValue, which short-circuits
      // ALL entity decoding — including the five XML built-ins — when
      // processEntities.enabled is false).
      const xml = `<root><t>Smith &amp; Co. says &lt;hello&gt; &quot;world&quot; &apos;now&apos;</t></root>`;
      const root = rootElement(parseXml(xml), "root")!;
      const t = firstChild(root, "t")!;
      expect(rawText(t)).toBe(`Smith & Co. says <hello> "world" 'now'`);
    });
  });

  it("rootElement skips the xml declaration and finds the root by local name", () => {
    const root = rootElement(parseXml(SAMPLE), "document");
    expect(root).toBeDefined();
    expect(tagOf(root!)).toBe("document");
  });

  it('namespace prefixes are stripped: w:p and a:p both walk as "p"', () => {
    const body = bodyOf(SAMPLE);
    expect(descendants(body, "p")).toHaveLength(2);
  });

  it('textOf joins all local-name "t" descendants (w:t and a:t alike)', () => {
    const body = bodyOf(SAMPLE);
    const [wordPara, drawingPara] = descendants(body, "p");
    expect(textOf(wordPara)).toBe("Hello world");
    expect(textOf(drawingPara)).toBe("DrawingML text");
  });

  it("attrOf reads attributes; firstChild/childrenOf walk direct children", () => {
    const body = bodyOf(SAMPLE);
    const p = firstChild(body, "p")!;
    expect(attrOf(p, "someAttr")).toBe("yes");
    expect(attrOf(p, "missing")).toBeUndefined();
    expect(childrenOf(p).length).toBeGreaterThan(0);
  });

  it("rawText concatenates every #text under a node", () => {
    const p = firstChild(bodyOf(SAMPLE), "p")!;
    expect(rawText(p)).toBe("Hello world");
  });

  it("preserves whitespace-only leaf text (space-only <w:t> runs are kept)", () => {
    const xml = `<w:p xmlns:w="x"><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>world</w:t></w:r></w:p>`;
    const p = rootElement(parseXml(xml), "p")!;
    expect(textOf(p)).toBe("Hello world");
    expect(rawText(p)).toBe("Hello world");
  });
});

describe("mc:AlternateContent flattening", () => {
  it("walks the Choice branch only — Fallback duplicates are invisible", () => {
    const xml =
      `<w:body xmlns:w="a" xmlns:mc="b">` +
      `<w:p><w:r><mc:AlternateContent>` +
      `<mc:Choice Requires="wps"><w:t>modern</w:t></mc:Choice>` +
      `<mc:Fallback><w:t>legacy duplicate</w:t></mc:Fallback>` +
      `</mc:AlternateContent></w:r></w:p></w:body>`;
    const body = rootElement(parseXml(xml), "body")!;
    const texts = descendants(body, "t").map((t) => rawText(t));
    expect(texts).toEqual(["modern"]);
  });

  it("uses the Fallback when no Choice exists", () => {
    const xml =
      `<w:body xmlns:w="a" xmlns:mc="b">` +
      `<w:p><mc:AlternateContent><mc:Fallback><w:t>only branch</w:t></mc:Fallback>` +
      `</mc:AlternateContent></w:p></w:body>`;
    const body = rootElement(parseXml(xml), "body")!;
    expect(descendants(body, "t").map((t) => rawText(t))).toEqual(["only branch"]);
  });
});

describe("parseRelationships", () => {
  const RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../hyperlink" Target="https://example.gov/a"/>
  <Relationship Id="rId2" Type=".../image" Target="media/image1.png"/>
</Relationships>`;

  it("maps Id -> Target", () => {
    const map = parseRelationships(RELS);
    expect(map.get("rId1")).toBe("https://example.gov/a");
    expect(map.get("rId2")).toBe("media/image1.png");
    expect(map.size).toBe(2);
  });

  it("returns an empty map for null / unparseable input", () => {
    expect(parseRelationships(null).size).toBe(0);
    expect(parseRelationships("<nope").size).toBe(0);
  });
});

describe("corePropertyText", () => {
  const CORE = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Quarterly Report</dc:title>
  <dc:creator>  </dc:creator>
</cp:coreProperties>`;

  it("returns trimmed text for a present property and null for empty/missing", () => {
    const root = rootElement(parseXml(CORE), "coreProperties");
    expect(corePropertyText(root, "title")).toBe("Quarterly Report");
    expect(corePropertyText(root, "creator")).toBeNull(); // whitespace-only
    expect(corePropertyText(root, "language")).toBeNull(); // absent
    expect(corePropertyText(undefined, "title")).toBeNull();
  });
});

describe("drawingAltText", () => {
  function props(xml: string): PONode {
    return rootElement(parseXml(xml), "docPr")!;
  }

  it("takes descr as alt; a title alone is NOT alt (flagged titleOnly)", () => {
    // Assistive technology reads the Description (descr) field. A Title-only
    // image is unread by most screen readers, so it must count as missing
    // alt — with the titleOnly flag so scorers can point at the fix.
    expect(drawingAltText(props('<wp:docPr xmlns:wp="x" descr="A chart" title="T"/>'))).toEqual({
      altText: "A chart",
      decorative: false,
      titleOnly: false,
    });
    expect(drawingAltText(props('<wp:docPr xmlns:wp="x" descr="  " title="Old style"/>'))).toEqual({
      altText: null,
      decorative: false,
      titleOnly: true,
    });
    expect(drawingAltText(props('<wp:docPr xmlns:wp="x"/>'))).toEqual({
      altText: null,
      decorative: false,
      titleOnly: false,
    });
  });

  it("reads the decorative extension at any depth", () => {
    const xml = `<wp:docPr xmlns:wp="x" xmlns:adec="y">
      <a:extLst xmlns:a="z"><a:ext><adec:decorative val="1"/></a:ext></a:extLst>
    </wp:docPr>`;
    expect(drawingAltText(props(xml)).decorative).toBe(true);
  });
});

describe("contrast math", () => {
  it("normalizeHex handles #-prefix, case, and rejects non-6-digit values", () => {
    expect(normalizeHex("#1a2b3c")).toBe("1A2B3C");
    expect(normalizeHex("FF0000")).toBe("FF0000");
    expect(normalizeHex("fff")).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });

  it("contrastRatio: black/white is 21:1, identical colors are 1:1", () => {
    expect(contrastRatio("000000", "FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("777777", "777777")).toBeCloseTo(1, 5);
  });

  it("contrastRatio matches the known WCAG value for #767676 on white", () => {
    expect(contrastRatio("767676", "FFFFFF")).toBeCloseTo(4.54, 2);
  });
});

describe("MANUAL_BULLET_RE", () => {
  it("matches literal bullets and enumerators, not ordinary text", () => {
    for (const s of ["• item", "- item", "* item", "1. item", "2) item"]) {
      expect(MANUAL_BULLET_RE.test(s)).toBe(true);
    }
    for (const s of ["item", "Version 2 notes", "10x faster"]) {
      expect(MANUAL_BULLET_RE.test(s)).toBe(false);
    }
  });
});

describe("readCapped", () => {
  class FakeError extends Error {}
  const make = (m: string): Error => new FakeError(m);

  async function zipWith(name: string, content: string): Promise<JSZip> {
    const zip = new JSZip();
    zip.file(name, content);
    // Round-trip so entries carry real compressed data + declared sizes.
    return JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
  }

  it("reads a small part fully", async () => {
    const zip = await zipWith("part.xml", "<a>ok</a>");
    const text = await readCapped(zip.file("part.xml")!, 1024, "part.xml", make);
    expect(text).toBe("<a>ok</a>");
  });

  it("rejects with the injected error type when a part exceeds the cap", async () => {
    const big = "x".repeat(5000);
    const zip = await zipWith("big.xml", big);
    await expect(readCapped(zip.file("big.xml")!, 1024, "big.xml", make)).rejects.toSatisfy(
      (e: unknown) => e instanceof FakeError && (e as Error).message.includes("big.xml"),
    );
  });
});

describe("assertZipWithinLimits", () => {
  class FakeError extends Error {}
  const make = (m: string): Error => new FakeError(m);

  async function zipOfEntryCount(n: number): Promise<JSZip> {
    const zip = new JSZip();
    for (let i = 0; i < n; i++) {
      zip.file(`f${i}.xml`, "x", { compression: "STORE" });
    }
    return JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }));
  }

  async function zipOfTotalUncompressed(sizes: number[]): Promise<JSZip> {
    const zip = new JSZip();
    sizes.forEach((size, i) => {
      // Highly compressible content (repeated byte) keeps the actual
      // buffer small even though the DECLARED uncompressed size is large —
      // exactly the shape of a real decompression-bomb entry.
      zip.file(`part${i}.xml`, "A".repeat(size));
    });
    return JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
  }

  it("passes a package within both limits", async () => {
    const zip = await zipOfEntryCount(3);
    expect(() =>
      assertZipWithinLimits(zip, { maxEntries: 10, maxTotalUncompressedBytes: 1_000_000 }, make),
    ).not.toThrow();
  });

  it("rejects a package with more entries than maxEntries", async () => {
    const zip = await zipOfEntryCount(11);
    expect(() =>
      assertZipWithinLimits(zip, { maxEntries: 10, maxTotalUncompressedBytes: 1_000_000 }, make),
    ).toThrow(FakeError);
  });

  it("accepts a package at exactly maxEntries (boundary)", async () => {
    const zip = await zipOfEntryCount(10);
    expect(() =>
      assertZipWithinLimits(zip, { maxEntries: 10, maxTotalUncompressedBytes: 1_000_000 }, make),
    ).not.toThrow();
  });

  it("rejects when the SUM of declared uncompressed sizes exceeds the cap, even though no single entry does", async () => {
    // Three entries at 400 bytes each (well under a per-part cap) sum to
    // 1200 > the 1000-byte aggregate cap injected here.
    const zip = await zipOfTotalUncompressed([400, 400, 400]);
    await expect(
      Promise.resolve().then(() =>
        assertZipWithinLimits(zip, { maxEntries: 100, maxTotalUncompressedBytes: 1_000 }, make),
      ),
    ).rejects.toThrow(FakeError);
  });

  it("passes when the sum is within the aggregate cap", async () => {
    const zip = await zipOfTotalUncompressed([400, 400]);
    expect(() =>
      assertZipWithinLimits(zip, { maxEntries: 100, maxTotalUncompressedBytes: 1_000 }, make),
    ).not.toThrow();
  });

  it("error message includes the offending count/size so route mapping stays informative", async () => {
    const zip = await zipOfEntryCount(11);
    try {
      assertZipWithinLimits(zip, { maxEntries: 10, maxTotalUncompressedBytes: 1_000_000 }, make);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain("11");
    }
  });
});

describe("resolveSchemeColor", () => {
  const THEME = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements>
</a:theme>`;
  const root = rootElement(parseXml(THEME), "theme");

  it("resolves srgbClr and sysClr(lastClr) scheme entries", () => {
    expect(resolveSchemeColor(root, "accent1")).toBe("4472C4");
    expect(resolveSchemeColor(root, "dk1")).toBe("000000");
    expect(resolveSchemeColor(root, "lt1")).toBe("FFFFFF");
  });

  it("maps the tx/bg aliases onto dk/lt and returns null for unknowns", () => {
    expect(resolveSchemeColor(root, "tx1")).toBe("000000");
    expect(resolveSchemeColor(root, "bg1")).toBe("FFFFFF");
    expect(resolveSchemeColor(root, "tx2")).toBe("44546A");
    expect(resolveSchemeColor(root, "bg2")).toBe("E7E6E6");
    expect(resolveSchemeColor(root, "nope")).toBeNull();
    expect(resolveSchemeColor(undefined, "accent1")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // V3 DoS hardening: resolveSchemeColor re-walks descendants(themeRoot,
  // "clrScheme") on EVERY call, so calling it once per text run is O(runs x
  // theme size) — a large theme part with many runs can freeze the event
  // loop. buildSchemeColorMap resolves every scheme name ONCE per analysis
  // into a plain Map so per-run lookups are O(1) and can't re-walk the theme.
  // Nested here (not a sibling describe) to reuse the same theme fixture.
  // -------------------------------------------------------------------------
  describe("buildSchemeColorMap", () => {
    it("resolves scheme + alias names once into a plain Map, matching resolveSchemeColor", () => {
      const map = buildSchemeColorMap(root);
      expect(map.get("accent1")).toBe("4472C4");
      expect(map.get("dk1")).toBe("000000");
      expect(map.get("lt1")).toBe("FFFFFF");
      expect(map.get("dk2")).toBe("44546A");
      expect(map.get("lt2")).toBe("E7E6E6");
      // tx/bg aliases must resolve too — real DrawingML runs commonly
      // reference these directly (a:schemeClr val="tx1"), not just dk/lt.
      expect(map.get("tx1")).toBe("000000");
      expect(map.get("bg1")).toBe("FFFFFF");
      expect(map.get("tx2")).toBe("44546A");
      expect(map.get("bg2")).toBe("E7E6E6");
      expect(map.get("nope")).toBeUndefined();
    });

    it("returns an empty map when there is no theme", () => {
      expect(buildSchemeColorMap(undefined).size).toBe(0);
    });
  });
});

describe("parseRelationshipEntries", () => {
  it("returns id/target/type triples; empty for null input", () => {
    const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="media/movie1.mp4"/>
</Relationships>`;
    expect(parseRelationshipEntries(rels)).toEqual([
      {
        id: "rId1",
        target: "media/movie1.mp4",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video",
      },
    ]);
    expect(parseRelationshipEntries(null)).toEqual([]);
  });
});
