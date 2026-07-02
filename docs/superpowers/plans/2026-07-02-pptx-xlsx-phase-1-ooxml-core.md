# Phase 1: Shared OOXML Core (`services/ooxml.ts`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the format-agnostic OOXML machinery from `docxService.ts` into `services/ooxml.ts` with zero behavior change, so the PPTX (Phase 2) and XLSX (Phase 3) extractors can build on it.

**Architecture:** Two moves. First, create `ooxml.ts` + its test file (TDD: the tests define the shared contract and fail until the module exists) — the module's code is the *verbatim* docxService code plus three tiny extractions of currently-inline logic (`parseRelationships`, `corePropertyText`, `drawingAltText`) and a `makeError`-parameterized `readCapped`. Second, rewire `docxService.ts` to import from `ooxml.js` and delete the moved code; the four existing DOCX test suites pass **unchanged** — that is the behavior-preservation proof.

**Tech Stack:** TypeScript, jszip, fast-xml-parser, Vitest. No new dependencies.

**Master plan:** `docs/superpowers/plans/2026-07-02-pptx-xlsx-checkers.md` (Global Constraints apply — notably: no edits to `docxService.test.ts` / `docxScorer.test.ts` / `docxConformance.test.ts` / `docxIntegration.test.ts`, and no AI-attribution trailers on commits).

## Global Constraints

- `docxService.ts`'s **public surface is unchanged**: `DocxMetadata`, `DocxAnalysis`, `DocxParseError`, `readCapped(f, cap, partName)`, `analyzeDocx(buffer)` keep their exact signatures. `analyzer.ts` keeps importing `readCapped` from `./docxService.js` and is not edited in this phase.
- All error **message strings are preserved byte-for-byte** (tests and users see identical text).
- The Word-specific constants `LARGE_HALF_PT` / `LARGE_BOLD_HALF_PT` and helpers `shdFill` / `isLargeRun` / `extractContrast` **stay in docxService.ts** (half-point units are WordprocessingML-specific).

---

### Task 1: Create `ooxml.ts` via TDD

**Files:**
- Create: `apps/api/src/services/ooxml.ts`
- Test: `apps/api/src/__tests__/ooxml.test.ts`

**Interfaces:**
- Consumes: nothing (first task of the feature).
- Produces (used by docxService after Task 2 and by pptxService/xlsxService in Phases 2–3): every export listed in the master plan's "Phase 1 produces" contract — `PONode`, `parseXml`, `tagOf`, `childrenOf`, `attrOf`, `firstChild`, `descendants`, `rawText`, `textOf`, `rootElement`, `parseRelationships`, `corePropertyText`, `drawingAltText`, `MANUAL_BULLET_RE`, `CONTRAST_MIN_NORMAL`, `CONTRAST_MIN_LARGE`, `normalizeHex`, `hexToRgb`, `relLuminance`, `contrastRatio`, `readCapped(f, cap, partName, makeError)`.

- [ ] **Step 1: Write the failing test file**

Create `apps/api/src/__tests__/ooxml.test.ts` with exactly:

```ts
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
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
  type PONode,
} from '../services/ooxml.js'

// ---------------------------------------------------------------------------
// The shared OOXML core extracted from docxService in v1.33.0. These tests pin
// the format-agnostic contract that docxService, pptxService, and xlsxService
// all build on. Behavior must match the pre-extraction docxService exactly.
// ---------------------------------------------------------------------------

const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p w:someAttr="yes">
      <w:r><w:t>Hello </w:t></w:r>
      <w:r><w:t>world</w:t></w:r>
    </w:p>
    <a:p><a:r><a:t>DrawingML text</a:t></a:r></a:p>
  </w:body>
</w:document>`

function bodyOf(xml: string): PONode {
  const root = rootElement(parseXml(xml), 'document')!
  return firstChild(root, 'body')!
}

describe('XML walker helpers', () => {
  it('parseXml returns [] for null and for invalid XML', () => {
    expect(parseXml(null)).toEqual([])
    expect(parseXml('<unclosed')).toEqual([])
  })

  it('rootElement skips the xml declaration and finds the root by local name', () => {
    const root = rootElement(parseXml(SAMPLE), 'document')
    expect(root).toBeDefined()
    expect(tagOf(root!)).toBe('document')
  })

  it('namespace prefixes are stripped: w:p and a:p both walk as "p"', () => {
    const body = bodyOf(SAMPLE)
    expect(descendants(body, 'p')).toHaveLength(2)
  })

  it('textOf joins all local-name "t" descendants (w:t and a:t alike)', () => {
    const body = bodyOf(SAMPLE)
    const [wordPara, drawingPara] = descendants(body, 'p')
    expect(textOf(wordPara)).toBe('Hello world')
    expect(textOf(drawingPara)).toBe('DrawingML text')
  })

  it('attrOf reads attributes; firstChild/childrenOf walk direct children', () => {
    const body = bodyOf(SAMPLE)
    const p = firstChild(body, 'p')!
    expect(attrOf(p, 'someAttr')).toBe('yes')
    expect(attrOf(p, 'missing')).toBeUndefined()
    expect(childrenOf(p).length).toBeGreaterThan(0)
  })

  it('rawText concatenates every #text under a node', () => {
    const p = firstChild(bodyOf(SAMPLE), 'p')!
    expect(rawText(p)).toBe('Hello world')
  })
})

describe('parseRelationships', () => {
  const RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../hyperlink" Target="https://example.gov/a"/>
  <Relationship Id="rId2" Type=".../image" Target="media/image1.png"/>
</Relationships>`

  it('maps Id -> Target', () => {
    const map = parseRelationships(RELS)
    expect(map.get('rId1')).toBe('https://example.gov/a')
    expect(map.get('rId2')).toBe('media/image1.png')
    expect(map.size).toBe(2)
  })

  it('returns an empty map for null / unparseable input', () => {
    expect(parseRelationships(null).size).toBe(0)
    expect(parseRelationships('<nope').size).toBe(0)
  })
})

describe('corePropertyText', () => {
  const CORE = `<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Quarterly Report</dc:title>
  <dc:creator>  </dc:creator>
</cp:coreProperties>`

  it('returns trimmed text for a present property and null for empty/missing', () => {
    const root = rootElement(parseXml(CORE), 'coreProperties')
    expect(corePropertyText(root, 'title')).toBe('Quarterly Report')
    expect(corePropertyText(root, 'creator')).toBeNull() // whitespace-only
    expect(corePropertyText(root, 'language')).toBeNull() // absent
    expect(corePropertyText(undefined, 'title')).toBeNull()
  })
})

describe('drawingAltText', () => {
  function props(xml: string): PONode {
    return rootElement(parseXml(xml), 'docPr')!
  }

  it('prefers descr, falls back to title, null when both empty', () => {
    expect(
      drawingAltText(props('<wp:docPr xmlns:wp="x" descr="A chart" title="T"/>')),
    ).toEqual({ altText: 'A chart', decorative: false })
    expect(
      drawingAltText(props('<wp:docPr xmlns:wp="x" descr="  " title="Fallback"/>')),
    ).toEqual({ altText: 'Fallback', decorative: false })
    expect(drawingAltText(props('<wp:docPr xmlns:wp="x"/>'))).toEqual({
      altText: null,
      decorative: false,
    })
  })

  it('reads the decorative extension at any depth', () => {
    const xml = `<wp:docPr xmlns:wp="x" xmlns:adec="y">
      <a:extLst xmlns:a="z"><a:ext><adec:decorative val="1"/></a:ext></a:extLst>
    </wp:docPr>`
    expect(drawingAltText(props(xml)).decorative).toBe(true)
  })
})

describe('contrast math', () => {
  it('normalizeHex handles #-prefix, case, and rejects non-6-digit values', () => {
    expect(normalizeHex('#1a2b3c')).toBe('1A2B3C')
    expect(normalizeHex('FF0000')).toBe('FF0000')
    expect(normalizeHex('fff')).toBeNull()
    expect(normalizeHex(undefined)).toBeNull()
    expect(normalizeHex(null)).toBeNull()
  })

  it('contrastRatio: black/white is 21:1, identical colors are 1:1', () => {
    expect(contrastRatio('000000', 'FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('777777', '777777')).toBeCloseTo(1, 5)
  })

  it('contrastRatio matches the known WCAG value for #767676 on white', () => {
    expect(contrastRatio('767676', 'FFFFFF')).toBeCloseTo(4.54, 2)
  })
})

describe('MANUAL_BULLET_RE', () => {
  it('matches literal bullets and enumerators, not ordinary text', () => {
    for (const s of ['• item', '- item', '* item', '1. item', '2) item']) {
      expect(MANUAL_BULLET_RE.test(s)).toBe(true)
    }
    for (const s of ['item', 'Version 2 notes', '10x faster']) {
      expect(MANUAL_BULLET_RE.test(s)).toBe(false)
    }
  })
})

describe('readCapped', () => {
  class FakeError extends Error {}
  const make = (m: string): Error => new FakeError(m)

  async function zipWith(name: string, content: string): Promise<JSZip> {
    const zip = new JSZip()
    zip.file(name, content)
    // Round-trip so entries carry real compressed data + declared sizes.
    return JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }))
  }

  it('reads a small part fully', async () => {
    const zip = await zipWith('part.xml', '<a>ok</a>')
    const text = await readCapped(zip.file('part.xml')!, 1024, 'part.xml', make)
    expect(text).toBe('<a>ok</a>')
  })

  it('rejects with the injected error type when a part exceeds the cap', async () => {
    const big = 'x'.repeat(5000)
    const zip = await zipWith('big.xml', big)
    await expect(
      readCapped(zip.file('big.xml')!, 1024, 'big.xml', make),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof FakeError && (e as Error).message.includes('big.xml'),
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run src/__tests__/ooxml.test.ts
```

Expected: FAIL — the file cannot be collected because `../services/ooxml.js` does not exist ("Failed to resolve import" / "Cannot find module"). Any other failure mode (e.g. a typo inside the test file) must be fixed before proceeding.

- [ ] **Step 3: Create `apps/api/src/services/ooxml.ts`**

The walker/contrast/readCapped bodies below are **verbatim moves** from `docxService.ts` (only comments generalized); `parseRelationships` / `corePropertyText` / `drawingAltText` are extractions of logic currently inline in `analyzeDocx` / `extractImages`; `readCapped` gains the `makeError` parameter. Create the file with exactly:

```ts
/**
 * Shared OOXML (Office Open XML / OPC) machinery used by the docx, pptx,
 * and xlsx extractors. Everything here is format-agnostic: ZIP part reading
 * with a decompression-bomb cap, fast-xml-parser preserveOrder walking,
 * OPC relationship + core-properties parsing, the DrawingML alt-text
 * convention, and WCAG contrast math.
 *
 * Extracted verbatim from docxService.ts in v1.33.0 — behavior is pinned by
 * ooxml.test.ts and, transitively, by the docx suites which must pass
 * unchanged against the extraction.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// preserveOrder walker utilities
// ---------------------------------------------------------------------------
// fast-xml-parser's preserveOrder mode returns each element as an object with
// a single tag key mapping to its ordered child array, plus an optional `:@`
// attribute bag. removeNSPrefix strips `w:`/`a:`/`p:`/`xdr:`/etc. so we match
// local names across every OOXML vocabulary.

export type PONode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  preserveOrder: true,
  trimValues: false,
});

export function parseXml(xml: string | null): PONode[] {
  if (!xml) return [];
  try {
    return parser.parse(xml) as PONode[];
  } catch {
    return [];
  }
}

export function tagOf(node: PONode): string | null {
  for (const k of Object.keys(node)) {
    if (k === ":@" || k === "#text") continue;
    return k;
  }
  return "#text" in node ? "#text" : null;
}

export function childrenOf(node: PONode): PONode[] {
  const t = tagOf(node);
  if (!t || t === "#text") return [];
  const v = node[t];
  return Array.isArray(v) ? (v as PONode[]) : [];
}

export function attrOf(node: PONode, name: string): string | undefined {
  const bag = node[":@"] as Record<string, unknown> | undefined;
  const v = bag?.[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
}

/** First direct child with the given local tag name. */
export function firstChild(node: PONode, tag: string): PONode | undefined {
  return childrenOf(node).find((c) => tagOf(c) === tag);
}

/** All descendants (any depth) with the given local tag name. */
export function descendants(node: PONode, tag: string): PONode[] {
  const out: PONode[] = [];
  const visit = (n: PONode): void => {
    for (const c of childrenOf(n)) {
      if (tagOf(c) === tag) out.push(c);
      visit(c);
    }
  };
  visit(node);
  return out;
}

/** Concatenate every `#text` under a node. */
export function rawText(node: PONode): string {
  let s = "";
  const visit = (n: PONode): void => {
    for (const c of childrenOf(n)) {
      if (tagOf(c) === "#text") s += String(c["#text"] ?? "");
      else visit(c);
    }
  };
  visit(node);
  return s;
}

/**
 * Text of a node from its local-name `t` descendants. Covers `w:t` (Word),
 * `a:t` (DrawingML — PowerPoint text runs), and `t` (Excel shared strings).
 */
export function textOf(node: PONode): string {
  return descendants(node, "t")
    .map((t) => rawText(t))
    .join("");
}

/** The single root element of a parsed part (skips the xml declaration node). */
export function rootElement(nodes: PONode[], tag: string): PONode | undefined {
  return nodes.find((n) => tagOf(n) === tag);
}

// ---------------------------------------------------------------------------
// OPC conventions shared by every OOXML package
// ---------------------------------------------------------------------------

/** Parse an OPC `.rels` part into a Relationship Id -> Target map. */
export function parseRelationships(relsXml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  const relsRoot = rootElement(parseXml(relsXml), "Relationships");
  if (!relsRoot) return map;
  for (const rel of childrenOf(relsRoot)) {
    if (tagOf(rel) !== "Relationship") continue;
    const id = attrOf(rel, "Id");
    const target = attrOf(rel, "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

/** Trimmed text of a `docProps/core.xml` property (title, creator, …), or null. */
export function corePropertyText(
  coreRoot: PONode | undefined,
  tag: string,
): string | null {
  if (!coreRoot) return null;
  const node = firstChild(coreRoot, tag);
  const t = node ? rawText(node).trim() : "";
  return t.length > 0 ? t : null;
}

/**
 * Alt text + decorative flag from a DrawingML properties node — `wp:docPr`
 * (Word), `p:cNvPr` (PowerPoint), or `xdr:cNvPr` (Excel drawings). All three
 * carry the same `descr` / `title` attributes and `adec:decorative` extension.
 */
export function drawingAltText(propsNode: PONode): {
  altText: string | null;
  decorative: boolean;
} {
  const descr = attrOf(propsNode, "descr")?.trim();
  const title = attrOf(propsNode, "title")?.trim();
  let altText: string | null = null;
  if (descr) altText = descr;
  else if (title) altText = title;
  const decorative = descendants(propsNode, "decorative").some(
    (d) => attrOf(d, "val") === "1",
  );
  return { altText, decorative };
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** A paragraph that starts with a literal bullet or "1." / "2)" enumerator. */
export const MANUAL_BULLET_RE = /^\s*([••‣◦⁃∙*-]|\d+[.)])\s+/;

// ---------------------------------------------------------------------------
// Color contrast (WCAG 1.4.3)
// ---------------------------------------------------------------------------
// 4.5:1 / 3:1 are the fixed definition of SC 1.4.3, not tunable policy, so they
// live here rather than in audit.config.ts.

export const CONTRAST_MIN_NORMAL = 4.5;
export const CONTRAST_MIN_LARGE = 3.0;

export function normalizeHex(hex: string | undefined | null): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? m[1].toUpperCase() : null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relLuminance([r, g, b]: [number, number, number]): number {
  const ch = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relLuminance(hexToRgb(fg));
  const l2 = relLuminance(hexToRgb(bg));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Capped ZIP part reading
// ---------------------------------------------------------------------------

/**
 * Read a ZIP entry to a string with a HARD uncompressed-byte cap enforced
 * during decompression, so a "zip bomb" (a tiny compressed part that inflates
 * to gigabytes) is aborted early instead of OOM-ing the process. The ZIP's
 * declared uncompressed size is checked first as a cheap fast-reject, but it is
 * attacker-controlled, so the streaming cap is the real guard.
 *
 * `makeError` supplies the per-format error type (DocxParseError,
 * PptxParseError, XlsxParseError) so route-level error mapping keeps working.
 */
export function readCapped(
  f: JSZip.JSZipObject,
  cap: number,
  partName: string,
  makeError: (message: string) => Error,
): Promise<string> {
  const declared =
    (f as unknown as { _data?: { uncompressedSize?: number } })._data
      ?.uncompressedSize ?? 0;
  const overLimit = (): Error =>
    makeError(
      `A document part (${partName}) exceeds the ${Math.round(
        cap / (1024 * 1024),
      )} MB uncompressed size limit.`,
    );
  if (declared > cap) return Promise.reject(overLimit());

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    // jszip types nodeStream as NodeJS.ReadableStream (no destroy); the runtime
    // object is a Node Readable, so cast to get the abort method.
    const stream = f.nodeStream("nodebuffer") as unknown as Readable;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > cap) {
        stream.destroy();
        reject(overLimit());
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", () =>
      reject(makeError(`A document part (${partName}) could not be read.`)),
    );
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}
```

- [ ] **Step 4: Run the ooxml tests to verify they pass**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run src/__tests__/ooxml.test.ts
```

Expected: PASS (all tests). Note `docxService.ts` still contains its own copies at this point — that's intended; both compile side by side until Task 2 removes the duplicates.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/api/src/services/ooxml.ts apps/api/src/__tests__/ooxml.test.ts
git commit -m "feat(api): shared OOXML core module (ooxml.ts) with pinned contract tests"
```

---

### Task 2: Rewire `docxService.ts` onto `ooxml.ts`

**Files:**
- Modify: `apps/api/src/services/docxService.ts`
- Test: the four existing docx suites, **unchanged** — `apps/api/src/__tests__/docxService.test.ts`, `docxScorer.test.ts`, `docxConformance.test.ts`, `docxIntegration.test.ts`

**Interfaces:**
- Consumes: every `ooxml.js` export from Task 1.
- Produces: `docxService.ts` with an unchanged public surface — `DocxMetadata`, `DocxAnalysis`, `DocxParseError`, `readCapped(f, cap, partName)` (now a wrapper), `analyzeDocx(buffer)`.

- [ ] **Step 1: Replace the import block and delete the moved code**

In `apps/api/src/services/docxService.ts`:

1. Replace the current imports (`JSZip`, `XMLParser`, `Readable`, `#config`) with:

```ts
import JSZip from "jszip";
import { DOCX } from "#config";
import {
  type PONode,
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
  CONTRAST_MIN_NORMAL,
  CONTRAST_MIN_LARGE,
  normalizeHex,
  contrastRatio,
  readCapped as ooxmlReadCapped,
} from "./ooxml.js";
```

(`XMLParser` and `Readable` imports are removed — nothing in the remaining file uses them. `hexToRgb`/`relLuminance` are not imported: only `contrastRatio` and `normalizeHex` are called directly in the remaining Word-specific code.)

2. Delete these now-duplicated blocks entirely (they moved to ooxml.ts):
   - the "preserveOrder walker utilities" section: `type PONode`, `const parser`, `parseXml`, `tagOf`, `childrenOf`, `attrOf`, `firstChild`, `descendants`, `rawText`, `textOf`, `rootElement` (currently lines ~74–162)
   - `const MANUAL_BULLET_RE = …` (line ~314)
   - the contrast-math block: `CONTRAST_MIN_NORMAL`, `CONTRAST_MIN_LARGE`, `normalizeHex`, `hexToRgb`, `relLuminance`, `contrastRatio` (lines ~340–370). **Keep** `LARGE_HALF_PT`, `LARGE_BOLD_HALF_PT`, `shdFill`, `isLargeRun`, `extractContrast` — Word-specific.

- [ ] **Step 2: Convert the exported `readCapped` into the DocxParseError-bound wrapper**

Replace the whole exported `readCapped` function body (keeping its doc comment location) with:

```ts
/**
 * DOCX-flavored wrapper over the shared capped ZIP reader — errors surface
 * as DocxParseError so route-level DOCX_PARSE_FAILED mapping keeps working.
 * (analyzer.ts imports this for [Content_Types].xml detection reads too.)
 */
export function readCapped(
  f: JSZip.JSZipObject,
  cap: number,
  partName: string,
): Promise<string> {
  return ooxmlReadCapped(f, cap, partName, (m) => new DocxParseError(m));
}
```

- [ ] **Step 3: Replace the inline rels/core logic in `analyzeDocx` with the shared helpers**

In `analyzeDocx`, replace:

```ts
  const relMap = new Map<string, string>();
  const relsRoot = rootElement(parseXml(relsXml), "Relationships");
  if (relsRoot) {
    for (const rel of childrenOf(relsRoot)) {
      if (tagOf(rel) !== "Relationship") continue;
      const id = attrOf(rel, "Id");
      const target = attrOf(rel, "Target");
      if (id && target) relMap.set(id, target);
    }
  }
```

with:

```ts
  const relMap = parseRelationships(relsXml);
```

and replace:

```ts
  const coreText = (tag: string): string | null => {
    if (!coreRoot) return null;
    const node = firstChild(coreRoot, tag);
    const t = node ? rawText(node).trim() : "";
    return t.length > 0 ? t : null;
  };
```

with:

```ts
  const coreText = (tag: string): string | null =>
    corePropertyText(coreRoot, tag);
```

- [ ] **Step 4: Replace the inline alt-text logic in `extractImages`**

Replace the body of `extractImages` with:

```ts
function extractImages(body: PONode): DocxAnalysis["images"] {
  const images: DocxAnalysis["images"] = [];
  for (const drawing of descendants(body, "drawing")) {
    const docPr = descendants(drawing, "docPr")[0];
    if (!docPr) continue;
    images.push(drawingAltText(docPr));
  }
  return images;
}
```

(`drawingAltText` returns `{ altText, decorative }` — exactly the object shape pushed before.)

- [ ] **Step 5: Run the docx suites — they must pass with zero edits**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run src/__tests__/docxService.test.ts src/__tests__/docxScorer.test.ts src/__tests__/docxConformance.test.ts src/__tests__/docxIntegration.test.ts src/__tests__/ooxml.test.ts
```

Expected: PASS, all files. If any docx test fails, the extraction changed behavior — fix `ooxml.ts`/`docxService.ts`, never the tests.

- [ ] **Step 6: Run the full API suite and typecheck**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run && pnpm build
```

Expected: all tests pass (analyzer/routes suites prove `readCapped`'s wrapper still satisfies `analyzer.ts`); `tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/api/src/services/docxService.ts
git commit -m "refactor(api): docxService builds on the shared OOXML core (behavior-preserving)"
```

---

### Task 3: Phase gate

- [ ] **Step 1: Full repo verification**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm build
cd apps/api && npx vitest run
cd ../web && npx vitest run
```

Expected: build green; API suite green (previous count + the new ooxml tests); web suite green and untouched (319 as of v1.32.1).

- [ ] **Step 2: Confirm no test files were modified**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git diff v1.32.1 --stat -- apps/api/src/__tests__/docxService.test.ts apps/api/src/__tests__/docxScorer.test.ts apps/api/src/__tests__/docxConformance.test.ts apps/api/src/__tests__/docxIntegration.test.ts
```

Expected: **empty output** — the four docx suites are byte-identical to v1.32.1. This is the behavior-preservation proof; Phase 2 may begin.
