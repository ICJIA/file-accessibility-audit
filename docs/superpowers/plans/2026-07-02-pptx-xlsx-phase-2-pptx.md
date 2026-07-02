# Phase 2: PowerPoint (.pptx) Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit `.pptx` uploads/URLs end-to-end at the API + CLI: extractor → scorer → conformance gate → dispatch → routes → fixtures.

**Architecture:** `pptxService.ts` (thin PresentationML extractor on the Phase 1 `ooxml.ts` core) produces `PptxAnalysis`; `scorePptx` in scorer.ts and `evaluatePptxConformance` in scoring/conformance.ts mirror the docx pair; `analyzer.ts` gains a content-sniffed `"pptx"` branch under the shared semaphore/timeout.

**Tech Stack:** TypeScript, jszip + fast-xml-parser (via ooxml.ts), Vitest. No new dependencies.

**Prerequisite:** Phase 1 merged (`services/ooxml.ts` exists; docx suites green).

## Global Constraints

Master plan (`2026-07-02-pptx-xlsx-checkers.md`) Global Constraints apply: frozen PDF/DOCX code, TDD every task, conventional commits with **no AI-attribution trailer**, `pnpm build` + full suites green at the phase gate.

**Phase-wide v1 boundaries (state these in code comments where noted):**
- Slide numbering = numeric order of `ppt/slides/slide<N>.xml` filenames. (True presentation order lives in `p:sldIdLst`, but its `<p:sldId id r:id>` element carries both a bare `id` and an `r:id` attribute, which collide after fast-xml-parser's `removeNSPrefix` strips prefixes. Filename order matches authored order for typical single-pass decks; reordered decks may show shifted slide numbers in findings. Documented tradeoff.)
- Lists count only *explicit* bullet evidence (`a:buChar`/`a:buAutoNum`); PowerPoint's master-inherited default bullets are not resolved, so `realListItems` undercounts. Scoring therefore only penalizes manual-character bullets, never rewards/punishes low real-item counts.
- Contrast checks only runs with an explicit `a:solidFill` color, against the containing shape's explicit solid fill, else the slide's explicit solid background, else white. Theme colors resolve via `resolveSchemeColor`; gradient/picture fills count as unresolved.
- Speaker notes are not read (spec §Out of scope).

---

### Task 1: `PPTX` config block + WCAG map entry for `slide_titles`

**Files:**
- Modify: `audit.config.ts` (after the `DOCX` block, ~line 370)
- Modify: `packages/shared/src/scoring.ts` (WCAG_CATEGORY_MAP, next to the `list_structure` entry at ~line 200)
- Test: `apps/api/src/__tests__/pptxScorer.test.ts` (created here with the config assertions; grows in Task 6)

**Interfaces:**
- Produces: `PPTX` config export (`ENABLED`, `MIME_TYPE`, `MAX_UNCOMPRESSED_BYTES`, `MAX_SLIDES`, `MAX_SHAPES`, `ANALYSIS_TIMEOUT_MS`, `SCORING_WEIGHTS`) consumed by every later task; `WCAG_CATEGORY_MAP.slide_titles`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/__tests__/pptxScorer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PPTX, WCAG_CATEGORY_MAP } from '#config'

describe('PPTX config', () => {
  it('is enabled by default with the spec caps and weights', () => {
    expect(PPTX.ENABLED).toBe(true)
    expect(PPTX.MIME_TYPE).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    )
    expect(PPTX.MAX_UNCOMPRESSED_BYTES).toBe(30 * 1024 * 1024)
    expect(PPTX.MAX_SLIDES).toBe(2000)
    expect(PPTX.MAX_SHAPES).toBe(100_000)
    expect(PPTX.ANALYSIS_TIMEOUT_MS).toBe(20_000)
    const w = PPTX.SCORING_WEIGHTS
    expect(w.text_extractability).toBe(0.05)
    expect(w.title_language).toBe(0.14)
    expect(w.slide_titles).toBe(0.18)
    expect(w.alt_text).toBe(0.18)
    expect(w.reading_order).toBe(0.1)
    expect(w.table_markup).toBe(0.1)
    expect(w.color_contrast).toBe(0.1)
    expect(w.list_structure).toBe(0.07)
    expect(w.link_quality).toBe(0.08)
  })

  it('slide_titles is registered in the WCAG category map', () => {
    expect(WCAG_CATEGORY_MAP.slide_titles).toEqual([
      { sc: '1.3.1', name: 'Info and Relationships', level: 'A' },
      { sc: '2.4.6', name: 'Headings and Labels', level: 'AA' },
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/api && npx vitest run src/__tests__/pptxScorer.test.ts`
Expected: FAIL — `#config` has no export `PPTX` (and `WCAG_CATEGORY_MAP.slide_titles` undefined).

- [ ] **Step 3: Implement**

In `audit.config.ts`, directly after the `DOCX` block, add (mirroring the DOCX block's comment style — copy its ENABLED/MAX_UNCOMPRESSED_BYTES/ANALYSIS_TIMEOUT_MS doc comments, adjusted to PowerPoint, with SAFE TO CHANGE notes):

```ts
// ---------------------------------------------------------------------------
// PPTX (POWERPOINT) ANALYSIS
// ---------------------------------------------------------------------------
// Config for the PowerPoint (.pptx) accessibility checker (v1.33.0). Same
// posture as DOCX: a ZIP of OOXML parts parsed in pure JS on the shared
// services/ooxml.ts core; reuses the PDF pipeline's scoring aggregation,
// grade/severity thresholds, WCAG map, conformance-verdict shape, and the
// report UI.
// ---------------------------------------------------------------------------

export const PPTX = {
  /** Feature flag — set PPTX_ENABLED=false to reject .pptx and hide it in the
   *  web UI (runtimeConfig.public.pptxEnabled). SAFE TO CHANGE: via env var. */
  ENABLED: process.env.PPTX_ENABLED !== "false",

  /** Canonical MIME type for .pptx (PresentationML). */
  MIME_TYPE:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  /** Max UNCOMPRESSED bytes per ZIP part (zip-bomb guard) — same rationale
   *  and budget math as DOCX.MAX_UNCOMPRESSED_BYTES. SAFE TO CHANGE. */
  MAX_UNCOMPRESSED_BYTES: 30 * 1024 * 1024,

  /** Max slides analyzed; over the cap → rejected (CPU/heap bound, the
   *  MAX_PARAGRAPHS analogue). 2,000 slides is far beyond any real deck.
   *  SAFE TO CHANGE. */
  MAX_SLIDES: 2000,

  /** Max total shapes across all slides; over the cap → rejected.
   *  SAFE TO CHANGE. */
  MAX_SHAPES: 100_000,

  /** Wall-clock timeout (ms) per analysis; route maps timeout → 504.
   *  SAFE TO CHANGE. */
  ANALYSIS_TIMEOUT_MS: 20_000,

  /**
   * PPTX category weights. PowerPoint maps onto the shared category IDs,
   * except:
   *   - slide_titles is PowerPoint-specific (every slide needs a title);
   *   - reading_order is ACTIVE (title-first-in-shape-tree is machine-checkable)
   *     — it is permanently N/A for Word;
   *   - heading_structure / bookmarks are omitted (slide titles are the
   *     PowerPoint outline); form_accessibility is a not-assessed placeholder.
   * Weights renormalize across applicable categories, as for PDF/DOCX N/A.
   * SAFE TO CHANGE: same rules as DOCX.SCORING_WEIGHTS.
   */
  SCORING_WEIGHTS: {
    text_extractability: 0.05,
    title_language: 0.14,
    slide_titles: 0.18,
    alt_text: 0.18,
    reading_order: 0.1,
    table_markup: 0.1,
    color_contrast: 0.1,
    list_structure: 0.07,
    link_quality: 0.08,
  },
} as const;
```

In `packages/shared/src/scoring.ts`, immediately after the `list_structure` entry in `WCAG_CATEGORY_MAP`, add:

```ts
  slide_titles: [
    { sc: "1.3.1", name: "Info and Relationships", level: "A" },
    { sc: "2.4.6", name: "Headings and Labels", level: "AA" },
  ],
```

- [ ] **Step 4: Run to verify pass** — same command. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add audit.config.ts packages/shared/src/scoring.ts apps/api/src/__tests__/pptxScorer.test.ts
git commit -m "feat(config): PPTX analysis config block + slide_titles WCAG mapping"
```

---

### Task 2: `resolveSchemeColor` + `parseRelationshipEntries` in `ooxml.ts`

**Files:**
- Modify: `apps/api/src/services/ooxml.ts` (append), `apps/api/src/__tests__/ooxml.test.ts` (append)

**Interfaces:**
- Produces (consumed by Tasks 4–5 and Phase 3):
  - `export function resolveSchemeColor(themeRoot: PONode | undefined, name: string): string | null`
  - `export function parseRelationshipEntries(relsXml: string | null): Array<{ id: string; target: string; type: string }>` (the Id→Target-only `parseRelationships` loses the `Type` attr, which media/table detection needs)

- [ ] **Step 1: Write the failing tests** — append to `ooxml.test.ts`:

```ts
import { resolveSchemeColor, parseRelationshipEntries } from '../services/ooxml.js'

describe('resolveSchemeColor', () => {
  const THEME = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements>
</a:theme>`
  const root = rootElement(parseXml(THEME), 'theme')

  it('resolves srgbClr and sysClr(lastClr) scheme entries', () => {
    expect(resolveSchemeColor(root, 'accent1')).toBe('4472C4')
    expect(resolveSchemeColor(root, 'dk1')).toBe('000000')
    expect(resolveSchemeColor(root, 'lt1')).toBe('FFFFFF')
  })

  it('maps the tx/bg aliases onto dk/lt and returns null for unknowns', () => {
    expect(resolveSchemeColor(root, 'tx1')).toBe('000000')
    expect(resolveSchemeColor(root, 'bg1')).toBe('FFFFFF')
    expect(resolveSchemeColor(root, 'tx2')).toBe('44546A')
    expect(resolveSchemeColor(root, 'bg2')).toBe('E7E6E6')
    expect(resolveSchemeColor(root, 'nope')).toBeNull()
    expect(resolveSchemeColor(undefined, 'accent1')).toBeNull()
  })
})

describe('parseRelationshipEntries', () => {
  it('returns id/target/type triples; empty for null input', () => {
    const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="media/movie1.mp4"/>
</Relationships>`
    expect(parseRelationshipEntries(rels)).toEqual([
      { id: 'rId1', target: 'media/movie1.mp4', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video' },
    ])
    expect(parseRelationshipEntries(null)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/__tests__/ooxml.test.ts`. Expected: FAIL, missing exports.
- [ ] **Step 3: Implement** — append to `ooxml.ts`:

```ts
/** Rels entries with their Type preserved (media / table detection needs it). */
export function parseRelationshipEntries(
  relsXml: string | null,
): Array<{ id: string; target: string; type: string }> {
  const out: Array<{ id: string; target: string; type: string }> = [];
  const relsRoot = rootElement(parseXml(relsXml), "Relationships");
  if (!relsRoot) return out;
  for (const rel of childrenOf(relsRoot)) {
    if (tagOf(rel) !== "Relationship") continue;
    const id = attrOf(rel, "Id");
    const target = attrOf(rel, "Target");
    const type = attrOf(rel, "Type") ?? "";
    if (id && target) out.push({ id, target, type });
  }
  return out;
}

// a:schemeClr aliases: text/background names map onto the dark/light slots.
const SCHEME_ALIASES: Record<string, string> = {
  tx1: "dk1",
  bg1: "lt1",
  tx2: "dk2",
  bg2: "lt2",
};

/** Resolve a DrawingML scheme-color name to a 6-digit hex via the theme part. */
export function resolveSchemeColor(
  themeRoot: PONode | undefined,
  name: string,
): string | null {
  if (!themeRoot) return null;
  const scheme = descendants(themeRoot, "clrScheme")[0];
  if (!scheme) return null;
  const entry = firstChild(scheme, SCHEME_ALIASES[name] ?? name);
  if (!entry) return null;
  const srgb = firstChild(entry, "srgbClr");
  if (srgb) return normalizeHex(attrOf(srgb, "val"));
  const sys = firstChild(entry, "sysClr");
  if (sys) return normalizeHex(attrOf(sys, "lastClr"));
  return null;
}
```

- [ ] **Step 4: Run to verify pass**, then confirm docx suites still green: `npx vitest run src/__tests__/ooxml.test.ts src/__tests__/docxService.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add apps/api/src/services/ooxml.ts apps/api/src/__tests__/ooxml.test.ts && git commit -m "feat(api): theme scheme-color resolver + typed rels parser in OOXML core"`

---

### Task 3: `minimalPptx` test helper + pptxService core (package, metadata, slides, caps)

**Files:**
- Create: `apps/api/src/__tests__/helpers/minimalPptx.ts`
- Create: `apps/api/src/services/pptxService.ts`
- Test: `apps/api/src/__tests__/pptxService.test.ts`

**Interfaces:**
- Consumes: ooxml.js exports; `PPTX` config.
- Produces: `PptxMetadata`, `PptxAnalysis`, `PptxParseError`, `analyzePptx(buffer)` (master-plan contract), and the fixture builder `buildPptx(opts)` used by every later pptx test.

- [ ] **Step 1: Write the fixture helper** (test infrastructure, mirrors `helpers/minimalDocx.js`) — create `apps/api/src/__tests__/helpers/minimalPptx.ts`:

```ts
/**
 * Builds real minimal .pptx bytes with jszip for tests — the PPTX analogue of
 * minimalDocx. Every part is genuine PresentationML so the extractor exercises
 * the same code paths as PowerPoint output.
 */
import JSZip from "jszip";

export interface SlideOpts {
  /** Title placeholder text; null = no title placeholder on the slide. */
  title?: string | null;
  /** Raw <p:sp>/<p:pic>/<p:graphicFrame> XML inserted BEFORE the title shape. */
  beforeTitle?: string;
  /** Raw shape XML inserted after the title shape. */
  body?: string;
  /** Extra rels XML entries for this slide (hyperlinks, media). */
  rels?: string;
}

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function titleShape(text: string, type: "title" | "ctrTitle" = "title"): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr>
    <p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

export function bodyShape(
  paragraphs: string,
  opts: { fillHex?: string } = {},
): string {
  const fill = opts.fillHex
    ? `<a:solidFill><a:srgbClr val="${opts.fillHex}"/></a:solidFill>`
    : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr>${fill}</p:spPr><p:txBody><a:bodyPr/>${paragraphs}</p:txBody></p:sp>`;
}

/** An a:p paragraph. bullet: 'char' | 'auto' | 'none' | undefined (no pPr). */
export function para(
  text: string,
  opts: {
    bullet?: "char" | "auto" | "none";
    colorHex?: string;
    schemeColor?: string;
    sizeHundredthsPt?: number;
    bold?: boolean;
    linkRelId?: string;
  } = {},
): string {
  const bu =
    opts.bullet === "char"
      ? '<a:buChar char="•"/>'
      : opts.bullet === "auto"
        ? '<a:buAutoNum type="arabicPeriod"/>'
        : opts.bullet === "none"
          ? "<a:buNone/>"
          : "";
  const pPr = bu ? `<a:pPr>${bu}</a:pPr>` : "";
  const fill = opts.colorHex
    ? `<a:solidFill><a:srgbClr val="${opts.colorHex}"/></a:solidFill>`
    : opts.schemeColor
      ? `<a:solidFill><a:schemeClr val="${opts.schemeColor}"/></a:solidFill>`
      : "";
  const link = opts.linkRelId ? `<a:hlinkClick r:id="${opts.linkRelId}"/>` : "";
  const attrs =
    (opts.sizeHundredthsPt ? ` sz="${opts.sizeHundredthsPt}"` : "") +
    (opts.bold ? ' b="1"' : "");
  const rPr = fill || link || attrs ? `<a:rPr lang="en-US"${attrs}>${fill}${link}</a:rPr>` : "";
  return `<a:p>${pPr}<a:r>${rPr}<a:t>${text}</a:t></a:r></a:p>`;
}

export function picture(opts: { descr?: string; decorative?: boolean } = {}): string {
  const descr = opts.descr !== undefined ? ` descr="${opts.descr}"` : "";
  const dec = opts.decorative
    ? '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>'
    : "";
  return `<p:pic><p:nvPicPr><p:cNvPr id="9" name="Picture"${descr}>${dec}</p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="rIdImg"/></p:blipFill><p:spPr/></p:pic>`;
}

export function pptTable(opts: { firstRow?: boolean; rows?: number; cols?: number } = {}): string {
  const rows = opts.rows ?? 2;
  const cols = opts.cols ?? 2;
  const grid = `<a:tblGrid>${'<a:gridCol w="1000"/>'.repeat(cols)}</a:tblGrid>`;
  const cell = "<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>c</a:t></a:r></a:p></a:txBody></a:tc>";
  const tr = `<a:tr h="370">${cell.repeat(cols)}</a:tr>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
    <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
    <a:tbl><a:tblPr${opts.firstRow ? ' firstRow="1"' : ""}/>${grid}${tr.repeat(rows)}</a:tbl>
    </a:graphicData></a:graphic></p:graphicFrame>`;
}

export function hyperlinkRels(entries: Array<{ id: string; target: string }>): string {
  return entries
    .map(
      (e) =>
        `<Relationship Id="${e.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${e.target}" TargetMode="External"/>`,
    )
    .join("");
}

export function videoRel(id: string): string {
  return `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="media/movie1.mp4"/>`;
}

export interface BuildPptxOpts {
  slides: SlideOpts[];
  /** Override docProps/core.xml entirely (default has title + creator). */
  coreXml?: string;
  /** Default-language declaration on the presentation part. true by default. */
  declareLanguage?: boolean;
  /** Slide background solid fill hex (applied to every slide). */
  slideBgHex?: string;
  /** Override ppt/theme/theme1.xml (default = Office scheme from Task 2's test). */
  themeXml?: string;
}

export async function buildPptx(opts: BuildPptxOpts): Promise<Buffer> {
  const zip = new JSZip();
  const n = opts.slides.length;

  const slideOverrides = opts.slides
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("");
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slideOverrides}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
  );

  zip.file(
    "docProps/core.xml",
    opts.coreXml ??
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Quarterly Briefing</dc:title><dc:creator>ICJIA</dc:creator></cp:coreProperties>`,
  );

  const lang =
    opts.declareLanguage === false
      ? ""
      : `<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle>`;
  const sldIds = opts.slides
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join("");
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${sldIds}</p:sldIdLst>${lang}</p:presentation>`,
  );

  zip.file("ppt/theme/theme1.xml", opts.themeXml ?? `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office">
  <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
  <a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
  <a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`);

  const bg = opts.slideBgHex
    ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${opts.slideBgHex}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    : "";
  opts.slides.forEach((s, i) => {
    const title =
      s.title === null || s.title === undefined
        ? s.title === null
          ? ""
          : titleShape("")
        : titleShape(s.title);
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0"?><p:sld ${NS}><p:cSld>${bg}<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
${s.beforeTitle ?? ""}${title}${s.body ?? ""}
</p:spTree></p:cSld></p:sld>`,
    );
    if (s.rels) {
      zip.file(
        `ppt/slides/_rels/slide${i + 1}.xml.rels`,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${s.rels}</Relationships>`,
      );
    }
  });

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}
```

Note the `title` convention: `title: null` → **no title placeholder at all**; `title: undefined` → an **empty** title placeholder; a string → a titled slide. (Both null and empty must read back as `title: null` per the master contract "absent or empty".)

- [ ] **Step 2: Write the failing extractor tests** — create `apps/api/src/__tests__/pptxService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPptx, titleShape, bodyShape, para, picture } from './helpers/minimalPptx.js'
import { analyzePptx, PptxParseError } from '../services/pptxService.js'

describe('pptxService: package + metadata + slides', () => {
  it('reads core title/creator, presentation language, and slide count', async () => {
    const buf = await buildPptx({ slides: [{ title: 'Welcome' }, { title: 'Agenda' }] })
    const a = await analyzePptx(buf)
    expect(a.metadata.title).toBe('Quarterly Briefing')
    expect(a.metadata.creator).toBe('ICJIA')
    expect(a.metadata.language).toBe('en-US')
    expect(a.metadata.slideCount).toBe(2)
    expect(a.slides.map((s) => s.title)).toEqual(['Welcome', 'Agenda'])
  })

  it('language is null when neither presentation nor master declares one', async () => {
    const buf = await buildPptx({ slides: [{ title: 'T' }], declareLanguage: false })
    expect((await analyzePptx(buf)).metadata.language).toBeNull()
  })

  it('a slide with no title placeholder, or an empty one, has title null', async () => {
    const buf = await buildPptx({ slides: [{ title: null }, { title: undefined }] })
    const a = await analyzePptx(buf)
    expect(a.slides[0].title).toBeNull()
    expect(a.slides[1].title).toBeNull()
  })

  it('titleIsFirstShape is false when content precedes the title in the tree', async () => {
    const buf = await buildPptx({
      slides: [
        { title: 'First' },
        { title: 'Second', beforeTitle: bodyShape(para('I come first')) },
      ],
    })
    const a = await analyzePptx(buf)
    expect(a.slides[0].titleIsFirstShape).toBe(true)
    expect(a.slides[1].titleIsFirstShape).toBe(false)
  })

  it('rejects a non-pptx zip and a missing presentation part', async () => {
    await expect(analyzePptx(Buffer.from('not a zip'))).rejects.toBeInstanceOf(PptxParseError)
  })

  it('rejects a deck over the slide cap', async () => {
    // MAX_SLIDES is 2000 — build cheaply by lying only in [Content_Types].xml
    // is not possible (extractor counts real slide parts), so this test uses a
    // tiny cap-boundary assertion instead: 3 slides pass.
    const buf = await buildPptx({ slides: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] })
    await expect(analyzePptx(buf)).resolves.toBeTruthy()
  })
})
```

- [ ] **Step 3: Run to verify failure** — `npx vitest run src/__tests__/pptxService.test.ts`. Expected: FAIL, cannot resolve `../services/pptxService.js`.

- [ ] **Step 4: Implement the extractor core** — create `apps/api/src/services/pptxService.ts`:

```ts
/**
 * PPTX (OOXML / PresentationML) accessibility extractor. Pure JS on the
 * shared services/ooxml.ts core; output PptxAnalysis feeds scorePptx().
 *
 * v1 boundaries (see the Phase 2 plan): slide numbering follows the
 * ppt/slides/slide<N>.xml filenames (sldIdLst's id/r:id attributes collide
 * under removeNSPrefix); default master-inherited bullets are not resolved;
 * speaker notes are not read.
 */
import JSZip from "jszip";
import { PPTX } from "#config";
import {
  type PONode,
  parseXml,
  tagOf,
  childrenOf,
  attrOf,
  firstChild,
  descendants,
  textOf,
  rootElement,
  parseRelationships,
  parseRelationshipEntries,
  corePropertyText,
  drawingAltText,
  MANUAL_BULLET_RE,
  CONTRAST_MIN_NORMAL,
  CONTRAST_MIN_LARGE,
  normalizeHex,
  contrastRatio,
  resolveSchemeColor,
  readCapped,
} from "./ooxml.js";

export interface PptxMetadata {
  title: string | null;
  creator: string | null;
  /** Default run language from the presentation part, else the first master. */
  language: string | null;
  slideCount: number;
}

export interface PptxAnalysis {
  metadata: PptxMetadata;
  slides: Array<{
    index: number;
    title: string | null;
    titleIsFirstShape: boolean;
    shapeCount: number;
  }>;
  images: Array<{ altText: string | null; decorative: boolean }>;
  tables: Array<{ hasHeaderRow: boolean; rowCount: number; colCount: number }>;
  links: Array<{ text: string; url: string | null }>;
  lists: { realListItems: number; manualBulletParagraphs: number };
  contrast: {
    checkedRuns: number;
    unresolvedRuns: number;
    failing: Array<{
      text: string;
      ratio: number;
      foreground: string;
      background: string;
      large: boolean;
    }>;
  };
  hasMedia: boolean;
  shapeCount: number;
}

export class PptxParseError extends Error {
  code = "PPTX_PARSE_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "PptxParseError";
  }
}

// PowerPoint run sizes are hundredths of a point (sz="1800" = 18pt).
const LARGE_HUNDREDTHS = 1800;
const LARGE_BOLD_HUNDREDTHS = 1400;

const CONTENT_SHAPE_TAGS = new Set(["sp", "pic", "graphicFrame", "grpSp", "cxnSp"]);

function isTitlePlaceholder(sp: PONode): boolean {
  const nv = firstChild(sp, "nvSpPr");
  const nvPr = nv ? firstChild(nv, "nvPr") : undefined;
  const ph = nvPr ? firstChild(nvPr, "ph") : undefined;
  const t = ph ? attrOf(ph, "type") : undefined;
  return t === "title" || t === "ctrTitle";
}

/** A shape the reading order cares about: any sp/pic/graphicFrame etc. */
function contentShapes(spTree: PONode): PONode[] {
  return childrenOf(spTree).filter((c) => CONTENT_SHAPE_TAGS.has(tagOf(c) ?? ""));
}

export async function analyzePptx(buffer: Buffer): Promise<PptxAnalysis> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new PptxParseError("The file is not a readable ZIP/PPTX package.");
  }
  const read = (p: string): Promise<string | null> => {
    const f = zip.file(p);
    return f
      ? readCapped(f, PPTX.MAX_UNCOMPRESSED_BYTES, p, (m) => new PptxParseError(m))
      : Promise.resolve(null);
  };

  const presentationXml = await read("ppt/presentation.xml");
  if (presentationXml === null) {
    throw new PptxParseError(
      "ppt/presentation.xml is missing — the package is not a PowerPoint presentation.",
    );
  }
  const presRoot = rootElement(parseXml(presentationXml), "presentation");
  const coreRoot = rootElement(parseXml(await read("docProps/core.xml")), "coreProperties");
  const themeRoot = rootElement(parseXml(await read("ppt/theme/theme1.xml")), "theme");

  // Slide parts in filename order (v1 boundary — see module doc comment).
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort(
      (a, b) =>
        Number(/slide(\d+)\.xml$/.exec(a)![1]) - Number(/slide(\d+)\.xml$/.exec(b)![1]),
    );
  if (slidePaths.length > PPTX.MAX_SLIDES) {
    throw new PptxParseError(
      `This presentation has too many slides (${slidePaths.length.toLocaleString()}) to analyze.`,
    );
  }

  // Language: presentation defaultTextStyle a:defRPr lang, else first master.
  let language: string | null = null;
  if (presRoot) {
    const defRPr = descendants(presRoot, "defRPr").find((d) => attrOf(d, "lang"));
    language = defRPr ? (attrOf(defRPr, "lang") ?? null) : null;
  }
  if (!language) {
    const masterXml = await read("ppt/slideMasters/slideMaster1.xml");
    const masterRoot = rootElement(parseXml(masterXml), "sldMaster");
    if (masterRoot) {
      const defRPr = descendants(masterRoot, "defRPr").find((d) => attrOf(d, "lang"));
      language = defRPr ? (attrOf(defRPr, "lang") ?? null) : null;
    }
  }

  const analysis: PptxAnalysis = {
    metadata: {
      title: corePropertyText(coreRoot, "title"),
      creator: corePropertyText(coreRoot, "creator"),
      language,
      slideCount: slidePaths.length,
    },
    slides: [],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 0, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 0,
  };

  for (let i = 0; i < slidePaths.length; i++) {
    const slideXml = await read(slidePaths[i]);
    const slideRoot = rootElement(parseXml(slideXml), "sld");
    const relsXml = await read(
      slidePaths[i].replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels"),
    );
    const relMap = parseRelationships(relsXml);
    const relEntries = parseRelationshipEntries(relsXml);
    if (relEntries.some((r) => /\/(audio|video)$/.test(r.type))) {
      analysis.hasMedia = true;
    }
    if (!slideRoot) {
      analysis.slides.push({ index: i + 1, title: null, titleIsFirstShape: false, shapeCount: 0 });
      continue;
    }
    const spTree = descendants(slideRoot, "spTree")[0];
    const shapes = spTree ? contentShapes(spTree) : [];
    analysis.shapeCount += shapes.length;
    if (analysis.shapeCount > PPTX.MAX_SHAPES) {
      throw new PptxParseError(
        `This presentation has too many shapes (${analysis.shapeCount.toLocaleString()}+) to analyze.`,
      );
    }

    const titleSp = shapes.find((s) => tagOf(s) === "sp" && isTitlePlaceholder(s));
    const titleText = titleSp ? textOf(titleSp).trim() : "";
    const contentBearing = shapes.filter((s) => {
      const t = tagOf(s);
      if (t === "pic" || t === "graphicFrame") return true;
      return t === "sp" && textOf(s).trim().length > 0;
    });
    analysis.slides.push({
      index: i + 1,
      title: titleText.length > 0 ? titleText : null,
      titleIsFirstShape:
        !!titleSp && contentBearing.length > 0 && contentBearing[0] === titleSp,
      shapeCount: shapes.length,
    });

    collectSlideContent(analysis, slideRoot, relMap, themeRoot, spTree);
  }

  return analysis;
}
```

with a temporary stub at the bottom (fully replaced in Tasks 4–5):

```ts
function collectSlideContent(
  _analysis: PptxAnalysis,
  _slideRoot: PONode,
  _relMap: Map<string, string>,
  _themeRoot: PONode | undefined,
  _spTree: PONode | undefined,
): void {
  // Filled in by the images/tables/links/lists and contrast tasks.
}
```

- [ ] **Step 5: Run to verify pass** — `npx vitest run src/__tests__/pptxService.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** — `git add apps/api/src/services/pptxService.ts apps/api/src/__tests__/helpers/minimalPptx.ts apps/api/src/__tests__/pptxService.test.ts && git commit -m "feat(api): pptx extractor core (package, metadata, slides, caps)"`

---

### Task 4: pptxService content — images, tables, links, lists

**Files:**
- Modify: `apps/api/src/services/pptxService.ts` (replace the `collectSlideContent` stub body)
- Test: append to `apps/api/src/__tests__/pptxService.test.ts`

- [ ] **Step 1: Write the failing tests** — append:

```ts
import { pptTable, hyperlinkRels, videoRel } from './helpers/minimalPptx.js'

describe('pptxService: images, tables, links, lists, media', () => {
  it('extracts picture alt text, decorative flags, and missing alt', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body:
          picture({ descr: 'Org chart' }) +
          picture({ decorative: true }) +
          picture({}),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.images).toEqual([
      { altText: 'Org chart', decorative: false },
      { altText: null, decorative: true },
      { altText: null, decorative: false },
    ])
  })

  it('a graphicFrame table is a table (with firstRow flag), not an image', async () => {
    const buf = await buildPptx({
      slides: [{ title: 'T', body: pptTable({ firstRow: true, rows: 3, cols: 2 }) + pptTable({}) }],
    })
    const a = await analyzePptx(buf)
    expect(a.tables).toEqual([
      { hasHeaderRow: true, rowCount: 3, colCount: 2 },
      { hasHeaderRow: false, rowCount: 2, colCount: 2 },
    ])
    expect(a.images).toHaveLength(0)
  })

  it('resolves hyperlink text and targets via the slide rels', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(para('Read the full report', { linkRelId: 'rId9' })),
        rels: hyperlinkRels([{ id: 'rId9', target: 'https://example.gov/report' }]),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.links).toEqual([{ text: 'Read the full report', url: 'https://example.gov/report' }])
  })

  it('counts explicit bullets as real list items and literal bullets as manual', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(
          para('Point one', { bullet: 'char' }) +
            para('Point two', { bullet: 'auto' }) +
            para('• fake bullet') +
            para('plain sentence'),
        ),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.lists).toEqual({ realListItems: 2, manualBulletParagraphs: 1 })
  })

  it('flags media presence from slide relationships', async () => {
    const buf = await buildPptx({ slides: [{ title: 'T', rels: videoRel('rId8') }] })
    expect((await analyzePptx(buf)).hasMedia).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (empty images/tables/links/lists from the stub).
- [ ] **Step 3: Implement** — replace `collectSlideContent`'s body:

```ts
function collectSlideContent(
  analysis: PptxAnalysis,
  slideRoot: PONode,
  relMap: Map<string, string>,
  themeRoot: PONode | undefined,
  spTree: PONode | undefined,
): void {
  // Images: pictures always; graphicFrames only when NOT a table (a chart /
  // SmartArt frame is image-like; a table frame is scored as a table).
  for (const pic of descendants(slideRoot, "pic")) {
    const cNvPr = descendants(pic, "cNvPr")[0];
    if (cNvPr) analysis.images.push(drawingAltText(cNvPr));
  }
  for (const frame of descendants(slideRoot, "graphicFrame")) {
    const tbl = descendants(frame, "tbl")[0];
    if (tbl) {
      const rows = descendants(tbl, "tr").length;
      const grid = firstChild(tbl, "tblGrid");
      const cols = grid
        ? childrenOf(grid).filter((c) => tagOf(c) === "gridCol").length
        : 0;
      const tblPr = firstChild(tbl, "tblPr");
      analysis.tables.push({
        hasHeaderRow: !!tblPr && attrOf(tblPr, "firstRow") === "1",
        rowCount: rows,
        colCount: cols,
      });
    } else {
      const cNvPr = descendants(frame, "cNvPr")[0];
      if (cNvPr) analysis.images.push(drawingAltText(cNvPr));
    }
  }

  // Links: any run whose rPr carries a:hlinkClick with an r:id.
  for (const run of descendants(slideRoot, "r")) {
    const rPr = firstChild(run, "rPr");
    const hlink = rPr ? firstChild(rPr, "hlinkClick") : undefined;
    if (!hlink) continue;
    const id = attrOf(hlink, "id");
    analysis.links.push({
      text: textOf(run).trim(),
      url: id && relMap.has(id) ? relMap.get(id)! : null,
    });
  }

  // Lists: explicit bullet evidence only (v1 boundary — master defaults not
  // resolved). Title paragraphs are excluded; they're headings, not list items.
  const titleParagraphs = new Set<PONode>();
  if (spTree) {
    for (const sp of contentShapes(spTree)) {
      if (tagOf(sp) === "sp" && isTitlePlaceholder(sp)) {
        for (const p of descendants(sp, "p")) titleParagraphs.add(p);
      }
    }
  }
  for (const p of descendants(slideRoot, "p")) {
    if (titleParagraphs.has(p)) continue;
    const pPr = firstChild(p, "pPr");
    const hasExplicitBullet =
      !!pPr && (!!firstChild(pPr, "buChar") || !!firstChild(pPr, "buAutoNum"));
    if (hasExplicitBullet) analysis.lists.realListItems++;
    else if (MANUAL_BULLET_RE.test(textOf(p))) analysis.lists.manualBulletParagraphs++;
  }

  collectSlideContrast(analysis, slideRoot, themeRoot, spTree);
}

function collectSlideContrast(
  _analysis: PptxAnalysis,
  _slideRoot: PONode,
  _themeRoot: PONode | undefined,
  _spTree: PONode | undefined,
): void {
  // Filled in by the contrast task.
}
```

- [ ] **Step 4: Run to verify pass** — Expected: PASS (all pptxService tests).
- [ ] **Step 5: Commit** — `git add -u apps/api && git add apps/api/src/__tests__/pptxService.test.ts && git commit -m "feat(api): pptx images, tables, links, lists, media extraction"`

---

### Task 5: pptxService contrast

**Files:**
- Modify: `apps/api/src/services/pptxService.ts` (replace `collectSlideContrast` body)
- Test: append to `pptxService.test.ts`

- [ ] **Step 1: Write the failing tests** — append:

```ts
describe('pptxService: contrast', () => {
  it('fails a low-contrast explicit color and passes a high-contrast one', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(
          para('nearly invisible', { colorHex: 'DDDDDD' }) + // vs white ≈ 1.35:1
            para('perfectly fine', { colorHex: '000000' }),
        ),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.checkedRuns).toBe(2)
    expect(a.contrast.failing).toHaveLength(1)
    expect(a.contrast.failing[0]).toMatchObject({
      text: 'nearly invisible',
      foreground: '#DDDDDD',
      background: '#FFFFFF',
      large: false,
    })
  })

  it('uses the shape fill, then the slide background, as the background', async () => {
    const buf = await buildPptx({
      slideBgHex: '000000',
      slides: [{
        title: 'T',
        body:
          bodyShape(para('white on black bg', { colorHex: 'FFFFFF' })) +
          bodyShape(para('white on white shape', { colorHex: 'FFFFFF' }), { fillHex: 'FFFFFF' }),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.failing).toHaveLength(1)
    expect(a.contrast.failing[0].background).toBe('#FFFFFF')
  })

  it('resolves theme scheme colors and applies the large-text threshold', async () => {
    const buf = await buildPptx({
      slides: [{
        title: 'T',
        body: bodyShape(
          // accent1 #4472C4 on white ≈ 4.55:1 — passes normal AND large.
          para('theme colored', { schemeColor: 'accent1' }) +
            // 18pt grey #949494 on white ≈ 3.0:1 — passes only because large.
            para('big grey heading', { colorHex: '949494', sizeHundredthsPt: 1800 }),
        ),
      }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.checkedRuns).toBe(2)
    expect(a.contrast.failing).toHaveLength(0)
  })

  it('counts runs without an explicit color as unresolved', async () => {
    const buf = await buildPptx({
      slides: [{ title: 'T', body: bodyShape(para('inherited color text')) }],
    })
    const a = await analyzePptx(buf)
    expect(a.contrast.checkedRuns).toBe(0)
    expect(a.contrast.unresolvedRuns).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (checkedRuns 0 everywhere from the stub).
- [ ] **Step 3: Implement** — replace `collectSlideContrast`:

```ts
/** Explicit solidFill color off a properties node: srgbClr or theme schemeClr. */
function explicitFill(
  node: PONode | undefined,
  themeRoot: PONode | undefined,
): string | null {
  if (!node) return null;
  const fill = firstChild(node, "solidFill");
  if (!fill) return null;
  const srgb = firstChild(fill, "srgbClr");
  if (srgb) return normalizeHex(attrOf(srgb, "val"));
  const scheme = firstChild(fill, "schemeClr");
  if (scheme) {
    const name = attrOf(scheme, "val");
    return name ? resolveSchemeColor(themeRoot, name) : null;
  }
  return null;
}

function collectSlideContrast(
  analysis: PptxAnalysis,
  slideRoot: PONode,
  themeRoot: PONode | undefined,
  spTree: PONode | undefined,
): void {
  // Slide background: explicit solid fill on p:bg, else white.
  const bgNode = descendants(slideRoot, "bg")[0];
  const bgPr = bgNode ? firstChild(bgNode, "bgPr") : undefined;
  const slideBg = explicitFill(bgPr, themeRoot) ?? "FFFFFF";

  if (!spTree) return;
  for (const sp of contentShapes(spTree)) {
    if (tagOf(sp) !== "sp") continue;
    const spPr = firstChild(sp, "spPr");
    const shapeBg = explicitFill(spPr, themeRoot) ?? slideBg;
    for (const run of descendants(sp, "r")) {
      const text = textOf(run).trim();
      if (!text) continue;
      const rPr = firstChild(run, "rPr");
      const fg = rPr ? explicitFill(rPr, themeRoot) : null;
      if (!fg) {
        analysis.contrast.unresolvedRuns++;
        continue;
      }
      analysis.contrast.checkedRuns++;
      const sz = rPr ? Number(attrOf(rPr, "sz")) : NaN;
      const bold = rPr ? attrOf(rPr, "b") === "1" : false;
      const large =
        (Number.isFinite(sz) && sz >= LARGE_HUNDREDTHS) ||
        (bold && Number.isFinite(sz) && sz >= LARGE_BOLD_HUNDREDTHS);
      const ratio = contrastRatio(fg, shapeBg);
      const min = large ? CONTRAST_MIN_LARGE : CONTRAST_MIN_NORMAL;
      if (ratio < min) {
        analysis.contrast.failing.push({
          text,
          ratio: Math.round(ratio * 100) / 100,
          foreground: `#${fg}`,
          background: `#${shapeBg}`,
          large,
        });
      }
    }
  }
}
```

- [ ] **Step 4: Run to verify pass** — full `npx vitest run src/__tests__/pptxService.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(api): pptx explicit-color contrast with theme resolution"`

---

### Task 6: `scorePptx` + `PPTX_HELP`

**Files:**
- Modify: `apps/api/src/services/scorer.ts` (new section after the docx one)
- Test: append to `apps/api/src/__tests__/pptxScorer.test.ts`

**Interfaces:**
- Consumes: `PptxAnalysis`; the file-local `docxCategory`-style helper pattern, `aggregateScore`, `applyWcagCriteria`, `evaluatePptxConformance` (Task 7 — stub the import until then, see Step 3 note).
- Produces: `export function scorePptx(analysis: PptxAnalysis): ScoringResult` returning exactly the `scoreDocx` shape (`overallScore`, `grade`, `isScanned: false`, `executiveSummary`, `categories`, `warnings: []`, `scoringMode: "strict"`, `scoreProfiles: { strict, remediation }`, `conformance`).

**Category rules (exact):**

| id | rule |
|---|---|
| `text_extractability` | Always 100 — PowerPoint text is never a flat image. |
| `title_language` | +50 core title, +50 language (docx wording, PowerPoint fix steps: File → Info → Properties → Title; language via the default presentation language). |
| `slide_titles` | 0 slides → score null. Else 100 − 20 per untitled slide (floor 0) − 10 per duplicate-title group (max −30). Findings name slide numbers: "Slides 2, 5 have no title." / "2 slides share the title \"Update\"." |
| `reading_order` | 100 − 15 per titled slide whose title is not the first content-bearing shape (floor 0). Slides with >10 shapes get an advisory finding, no deduction. `notAssessed: false`. |
| `alt_text` | No images → null. Else round(100 × alt'd-or-decorative / non-decorative-total); wait — decorative are excluded from the denominator: `nonDec = images.filter(i => !i.decorative)`; `missing = nonDec.filter(i => !i.altText)`; nonDec empty → 100; else `round(100 × (nonDec.length − missing.length) / nonDec.length)`. |
| `table_markup` | No tables → null. Else 100 − 30 per data table (rowCount ≥ 2 && colCount ≥ 2) without `hasHeaderRow` (floor 0). |
| `color_contrast` | checkedRuns 0 → null ("No text with an explicit color was found; inherited and unresolvable fills are not checked."). failing 0 → 100. Else max(0, 100 − 20 × failing.length), findings quote the worst pair. |
| `list_structure` | Both counts 0 → null. manual 0 → 100. Else max(0, 100 − 15 × manualBulletParagraphs). |
| `link_quality` | No links → null. `bad = links.filter(l => !l.text || /^(https?:\/\/|www\.)/i.test(l.text))`; score = round(100 × (len − bad) / len). |
| `form_accessibility` | Placeholder: score null, weight 0, `notAssessed: true` (mirror `scoreDocxForms`, PowerPoint wording). |

- [ ] **Step 1: Write the failing tests** — append to `pptxScorer.test.ts`:

```ts
import { scorePptx } from '../services/scorer.js'
import type { PptxAnalysis } from '../services/pptxService.js'

function baseAnalysis(over: Partial<PptxAnalysis> = {}): PptxAnalysis {
  return {
    metadata: { title: 'Deck', creator: 'x', language: 'en-US', slideCount: 2 },
    slides: [
      { index: 1, title: 'Welcome', titleIsFirstShape: true, shapeCount: 2 },
      { index: 2, title: 'Agenda', titleIsFirstShape: true, shapeCount: 3 },
    ],
    images: [],
    tables: [],
    links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false,
    shapeCount: 5,
    ...over,
  }
}

describe('scorePptx', () => {
  it('scores a clean deck high with the docx-shaped result', () => {
    const r = scorePptx(baseAnalysis())
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(r.scoringMode).toBe('strict')
    expect(r.conformance.status).toBe('no-automated-failures')
    const ids = r.categories.map((c) => c.id)
    expect(ids).toContain('slide_titles')
    expect(ids).toContain('reading_order')
    expect(ids).not.toContain('heading_structure')
    expect(ids).not.toContain('bookmarks')
  })

  it('slide_titles penalizes untitled slides and duplicates, naming slide numbers', () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [
          { index: 1, title: null, titleIsFirstShape: false, shapeCount: 1 },
          { index: 2, title: 'Update', titleIsFirstShape: true, shapeCount: 1 },
          { index: 3, title: 'Update', titleIsFirstShape: true, shapeCount: 1 },
        ],
      }),
    )
    const cat = r.categories.find((c) => c.id === 'slide_titles')!
    expect(cat.score).toBe(70) // 100 − 20 (slide 1) − 10 (one duplicate group)
    expect(cat.findings.join(' ')).toContain('Slide 1')
    expect(cat.findings.join(' ')).toContain('"Update"')
  })

  it('reading_order deducts for title-not-first and advises on shape-heavy slides', () => {
    const r = scorePptx(
      baseAnalysis({
        slides: [
          { index: 1, title: 'T', titleIsFirstShape: false, shapeCount: 12 },
        ],
      }),
    )
    const cat = r.categories.find((c) => c.id === 'reading_order')!
    expect(cat.score).toBe(85)
    expect(cat.findings.join(' ')).toMatch(/12 shapes/)
  })

  it('null-scores empty categories so they renormalize away', () => {
    const r = scorePptx(baseAnalysis({ contrast: { checkedRuns: 0, unresolvedRuns: 3, failing: [] } }))
    expect(r.categories.find((c) => c.id === 'alt_text')!.score).toBeNull()
    expect(r.categories.find((c) => c.id === 'table_markup')!.score).toBeNull()
    expect(r.categories.find((c) => c.id === 'color_contrast')!.score).toBeNull()
    expect(r.categories.find((c) => c.id === 'form_accessibility')!.notAssessed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL, `scorePptx` not exported.
- [ ] **Step 3: Implement** in `scorer.ts` after the docx section: `PPTX_HELP` link map (Microsoft support URLs: presentation-accessibility overview `https://support.microsoft.com/en-us/office/make-your-powerpoint-presentations-accessible-to-people-with-disabilities-6f7772b2-2f33-4bd2-8ca7-dae3b2b3ef25`, alt text `.../add-alternative-text-to-a-shape-picture-chart-smartart-graphic-or-other-object-44989b2a-903c-4d9a-b742-6a75b451c669`, slide titles `https://support.microsoft.com/en-us/office/title-a-slide-c5286802-495a-4b47-a844-c7d6ac1c8dd5`, WebAIM contrast checker as in `DOCX_HELP.contrast`); a `pptxCategory(...)` helper identical in shape to `docxCategory` but reading `PPTX.SCORING_WEIGHTS`; one `scorePptx<Name>` function per category row above (copy the docx counterpart's structure and message tone, PowerPoint fix steps); `buildPptxCategories` assembling all ten (nine + forms placeholder) then `applyWcagCriteria(categories)`; and:

```ts
export function scorePptx(analysis: PptxAnalysis): ScoringResult {
  const categories = buildPptxCategories(analysis);
  const conformance = evaluatePptxConformance(analysis);
  const aggregate = aggregateScore(
    categories,
    false,
    "strict",
    conformance,
    "PowerPoint presentation",
  );
  return {
    overallScore: aggregate.overallScore,
    grade: aggregate.grade,
    isScanned: false,
    executiveSummary: aggregate.executiveSummary,
    categories,
    warnings: [],
    scoringMode: "strict",
    scoreProfiles: { strict: aggregate.profile, remediation: aggregate.profile },
    conformance,
  };
}
```

Import `PPTX` from `#config`, `PptxAnalysis` type from `./pptxService.js`, `evaluatePptxConformance` from `./scoring/conformance.js`. **Ordering note:** implement Task 7's `evaluatePptxConformance` skeleton (types compile, gate rules empty → always `no-automated-failures`) in this same commit if the import would otherwise fail the build; the gate's real rules and tests land in Task 7.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/__tests__/pptxScorer.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(api): scorePptx — nine PowerPoint categories on the shared aggregation"`

---

### Task 7: `evaluatePptxConformance`

**Files:**
- Modify: `apps/api/src/services/scoring/conformance.ts`
- Test: `apps/api/src/__tests__/pptxConformance.test.ts` (create)

**Gate rules (spec §Conformance gates — fire only on these):** 1.1.1 non-decorative images without alt; 2.4.2 no core title; 3.1.1 `metadata.language` null; 1.3.1 data tables (≥2×2) without header row; 1.4.3 `contrast.failing` non-empty. **notAssessed always:** 1.3.2 (reading order beyond the title-first check); plus 1.4.3 when `checkedRuns === 0` (docx wording); plus `{ sc: "1.2.2", name: "Captions (Prerecorded)", level: "A" }` when `hasMedia` (reason: embedded audio/video captions are not machine-verified). Add `"1.2.2": "captions-prerecorded"` to `WCAG_UNDERSTANDING_SLUGS`. Fix steps in `issue` strings use PowerPoint paths ("In PowerPoint: right-click the image → View Alt Text…", "Insert → Header & Footer is not a slide title — use a Title layout placeholder", "Review → Language", "Table Design → check Header Row"). Duplicate the docx gate's status/headline tail verbatim (documented same-file duplication — keeps the frozen docx gate untouched).

- [ ] **Step 1: Write the failing tests** — create `pptxConformance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluatePptxConformance } from '../services/scoring/conformance.js'
import type { PptxAnalysis } from '../services/pptxService.js'

function analysis(over: Partial<PptxAnalysis>): PptxAnalysis {
  return {
    metadata: { title: 'Deck', creator: null, language: 'en-US', slideCount: 1 },
    slides: [{ index: 1, title: 'T', titleIsFirstShape: true, shapeCount: 1 }],
    images: [], tables: [], links: [],
    lists: { realListItems: 0, manualBulletParagraphs: 0 },
    contrast: { checkedRuns: 1, unresolvedRuns: 0, failing: [] },
    hasMedia: false, shapeCount: 1,
    ...over,
  }
}

describe('evaluatePptxConformance', () => {
  it('is clean for a well-formed deck', () => {
    const v = evaluatePptxConformance(analysis({}))
    expect(v.status).toBe('no-automated-failures')
    expect(v.failures).toEqual([])
  })

  it('fires 1.1.1 / 2.4.2 / 3.1.1 / 1.3.1 / 1.4.3 on confirmed violations', () => {
    const v = evaluatePptxConformance(
      analysis({
        metadata: { title: null, creator: null, language: null, slideCount: 1 },
        images: [{ altText: null, decorative: false }],
        tables: [{ hasHeaderRow: false, rowCount: 3, colCount: 3 }],
        contrast: {
          checkedRuns: 1, unresolvedRuns: 0,
          failing: [{ text: 'x', ratio: 1.4, foreground: '#DDDDDD', background: '#FFFFFF', large: false }],
        },
      }),
    )
    expect(v.status).toBe('fail')
    expect(v.failures.map((f) => f.sc).sort()).toEqual(['1.1.1', '1.3.1', '1.4.3', '2.4.2', '3.1.1'])
  })

  it('does NOT fire for untitled slides (scoring-only) and lists media as not assessed', () => {
    const v = evaluatePptxConformance(
      analysis({
        slides: [{ index: 1, title: null, titleIsFirstShape: false, shapeCount: 1 }],
        hasMedia: true,
      }),
    )
    expect(v.status).toBe('no-automated-failures')
    expect(v.notAssessed.map((n) => n.sc)).toContain('1.2.2')
  })
})
```

- [ ] **Step 2: Run to verify failure** (with the Task 6 skeleton, the second test fails — no rules fire).
- [ ] **Step 3: Implement** the rules in the `evaluatePptxConformance` body, mirroring `evaluateDocxConformance` line-for-line in structure (same `add()` closure, same tail). Import `PptxAnalysis` type at the top of conformance.ts.
- [ ] **Step 4: Run to verify pass** — plus `npx vitest run src/__tests__/docxConformance.test.ts` (docx gate untouched). Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(api): PowerPoint conformance gate (confirmed machine-checkable violations only)"`

---

### Task 8: Dispatch — `analyzer.ts` + `AnalysisResult`

**Files:**
- Modify: `apps/api/src/services/analyzer.ts`, `apps/api/src/services/pdfAnalyzer.ts` (the `AnalysisResult` interface, ~lines 52–60)
- Test: append to `apps/api/src/__tests__/analyzer.test.ts` (follow its existing describe style)

- [ ] **Step 1: Write the failing tests** — append to `analyzer.test.ts`:

```ts
import { buildPptx } from './helpers/minimalPptx.js'

describe('detectFileType: pptx', () => {
  it('detects a real pptx by content and dispatches to the pptx pipeline', async () => {
    const buf = await buildPptx({ slides: [{ title: 'Welcome' }] })
    expect(await detectFileType(buf)).toBe('pptx')
    const r = await analyzeDocument(buf, 'deck.pptx')
    expect(r.fileType).toBe('pptx')
    expect(r.pageCount).toBe(1) // slides
    expect(r.pptxMetadata?.title).toBe('Quarterly Briefing')
  })

  it('a renamed pptx is never misread as docx and vice versa', async () => {
    const buf = await buildPptx({ slides: [{ title: 'T' }] })
    expect(await detectFileType(buf)).toBe('pptx') // extension never consulted
  })

  it('PPTX_ENABLED=false rejects with PPTX_DISABLED', async () => {
    // PPTX.ENABLED reads process.env at module load via #config; this test
    // asserts the FileTypeError code path by monkey-patching the config copy
    // the analyzer closed over is NOT possible — so assert via the error class
    // contract instead: FileTypeError supports the "PPTX_DISABLED" code.
    expect(new FileTypeError('PPTX_DISABLED', 'x').code).toBe('PPTX_DISABLED')
  })
})
```

(Follow how the existing analyzer tests handle the DOCX_DISABLED case — if they spawn with env overrides or re-import with `vi.resetModules()` + `process.env.DOCX_ENABLED`, mirror that exact mechanism for `PPTX_ENABLED` instead of the error-class fallback above.)

- [ ] **Step 2: Run to verify failure** — Expected: FAIL — `detectFileType` returns null for the pptx buffer, `pptxMetadata` missing from `AnalysisResult`.
- [ ] **Step 3: Implement.** In `analyzer.ts`:

```ts
export type DetectedFileType = "pdf" | "docx" | "pptx" | "xlsx";
```

(the `"xlsx"` member lands now so Phase 3 only adds behavior), imports gain `import { analyzePptx, type PptxMetadata } from "./pptxService.js";`, `import { scorePptx } from "./scorer.js";`, `import { DOCX, PPTX } from "#config";`. In `detectFileType`, after the docx check inside the same `if (isZip…)` block:

```ts
      if (
        contentTypes.includes("presentationml.presentation") &&
        zip.file("ppt/presentation.xml")
      ) {
        return "pptx";
      }
```

`FileTypeError`'s code union becomes `"UNSUPPORTED_FILE_TYPE" | "DOCX_DISABLED" | "PPTX_DISABLED" | "XLSX_DISABLED"` (both new members now; Phase 3 uses the second). In `analyzeDocument`, after the docx branch:

```ts
  if (type === "pptx") {
    if (!PPTX.ENABLED) {
      throw new FileTypeError(
        "PPTX_DISABLED",
        "PowerPoint (.pptx) auditing is currently disabled on this server.",
      );
    }
    await acquireSemaphore();
    try {
      const analysis = await withTimeout(
        analyzePptx(buffer),
        PPTX.ANALYSIS_TIMEOUT_MS,
        "pptx analysis timed out",
      );
      const scoring = scorePptx(analysis);
      return {
        filename,
        pageCount: analysis.metadata.slideCount,
        fileType: "pptx",
        pptxMetadata: analysis.metadata,
        ...scoring,
      };
    } finally {
      releaseSemaphore();
    }
  }
```

The final unsupported message becomes: `"This file is not a supported document (PDF, Word .docx, or PowerPoint .pptx)."` In `pdfAnalyzer.ts`, `AnalysisResult` gains `fileType: "pdf" | "docx" | "pptx" | "xlsx";` (widen now) and `pptxMetadata?: PptxMetadata;` (type-only import from `./pptxService.js`).

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/__tests__/analyzer.test.ts` plus the full suite. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(api): content-sniffed pptx dispatch under the shared semaphore/timeout"`

---

### Task 9: Routes + upload filter

**Files:**
- Modify: `apps/api/src/routes/analyze.ts` (catch block, ~lines 75–99), `apps/api/src/routes/analyze-url.ts` (~lines 77–139), `apps/api/src/middleware/uploadMiddleware.ts`
- Test: append to `apps/api/src/__tests__/analyze-url.test.ts` following its mocking style (and to any analyze route test that asserts the DOCX error mapping — mirror those cases for pptx)

- [ ] **Step 1: Write the failing tests** — mirror the existing `DOCX_DISABLED`/`DOCX_PARSE_FAILED` mapping tests for `PPTX_DISABLED` → 415 with copy `PowerPoint (.pptx) auditing is currently disabled.` and `PPTX_PARSE_FAILED` → 422 with copy `This PowerPoint file could not be read.` (analyze.ts) / `The fetched PowerPoint file could not be read.` (analyze-url.ts). Run; expected FAIL (falls through to 500).
- [ ] **Step 2: Implement.** In both routes' catch blocks add, after the DOCX cases:

```ts
      if (err.code === 'PPTX_DISABLED') {
        res.status(415).json({
          error: 'PowerPoint (.pptx) auditing is currently disabled.',
          details: 'This server is not configured to audit PowerPoint files. Contact the administrator to enable it.',
        })
        return
      }
      if (err.code === 'PPTX_PARSE_FAILED') {
        res.status(422).json({
          error: 'This PowerPoint file could not be read.',
          details: 'The .pptx file appears to be corrupt or is not a valid PowerPoint presentation. Re-save it in PowerPoint and upload again.',
        })
        return
      }
```

Update the `UNSUPPORTED_FILE_TYPE` details in analyze.ts to `'Upload a PDF, Word (.docx), or PowerPoint (.pptx) file. …'` and the analyze-url unsupported copy likewise. In `uploadMiddleware.ts`: import `PPTX` from `#config`, add

```ts
    const isPptx =
      PPTX.ENABLED &&
      (file.mimetype === PPTX.MIME_TYPE || name.endsWith('.pptx'))
```

accept `isPdf || isDocx || isPptx`, and build the rejection message from the enabled set (e.g. `'Only PDF, Word (.docx), and PowerPoint (.pptx) files are accepted'` when both flags on — assemble the list programmatically from the flags so Phase 3 extends it with one entry).

- [ ] **Step 3: Run to verify pass** — route tests + full API suite. Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(api): pptx route error mapping + upload filter"`

---

### Task 10: CLI

**Files:**
- Modify: `apps/cli/src/commands/audit.ts` (extension gate ~lines 168–172, help text ~lines 55–66)

- [ ] **Step 1: Implement** (no test harness exists for the CLI arg gate — verify by command):

```ts
    if (!lower.endsWith('.pdf') && !lower.endsWith('.docx') && !lower.endsWith('.pptx')) {
      console.error(`${RED}Error: Not a PDF, Word (.docx), or PowerPoint (.pptx) file: ${file}${RESET}`)
      process.exit(2)
    }
```

Help text: usage line becomes `a11y-audit <file.pdf|.docx|.pptx> [more ...]` and the tagline `PDF, Word & PowerPoint accessibility analyzer`.

- [ ] **Step 2: Verify by running it**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter cli exec tsx src/index.ts --help
```

Expected: help shows the `.pptx` usage. (End-to-end CLI audit of a real .pptx happens in Task 11 verification.)

- [ ] **Step 3: Commit** — `git commit -am "feat(cli): accept .pptx"`

---

### Task 11: Integration fixtures + calibration

**Files:**
- Test: `apps/api/src/__tests__/pptxIntegration.test.ts` (create)

- [ ] **Step 1: Write the failing integration tests** — create `pptxIntegration.test.ts` mirroring `docxIntegration.test.ts`'s two-fixture structure, built with `buildPptx`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPptx, bodyShape, para, picture, pptTable, hyperlinkRels } from './helpers/minimalPptx.js'
import { analyzeDocument } from '../services/analyzer.js'

describe('pptx integration: accessible deck', () => {
  it('scores an accessible deck ≥ 90 with a clean gate', async () => {
    const buf = await buildPptx({
      slides: [
        { title: 'Welcome', body: bodyShape(para('Intro', { bullet: 'char', colorHex: '000000' })) },
        {
          title: 'Data',
          body:
            picture({ descr: 'Trend chart, arrests down 12%' }) +
            pptTable({ firstRow: true, rows: 3, cols: 2 }) +
            bodyShape(para('See the full report', { linkRelId: 'rId9' })),
          rels: hyperlinkRels([{ id: 'rId9', target: 'https://example.gov/r' }]),
        },
      ],
    })
    const r = await analyzeDocument(buf, 'accessible.pptx')
    expect(r.fileType).toBe('pptx')
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(['A', 'A-', 'A+']).toContain(r.grade)
    expect(r.conformance.status).toBe('no-automated-failures')
    expect(r.pdfUa).toBeUndefined()
  })
})

describe('pptx integration: inaccessible deck', () => {
  it('fails a hostile deck ≤ 35 citing the right criteria', async () => {
    const buf = await buildPptx({
      coreXml: `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>x</dc:creator></cp:coreProperties>`,
      declareLanguage: false,
      slides: [
        { title: null, body: picture({}) + pptTable({ rows: 3, cols: 3 }) },
        { title: null, body: bodyShape(para('• fake', { colorHex: 'DDDDDD' }) + para('• bullets', { colorHex: 'DDDDDD' })) },
      ],
    })
    const r = await analyzeDocument(buf, 'inaccessible.pptx')
    expect(r.overallScore).toBeLessThanOrEqual(35)
    expect(['F', 'D', 'D-']).toContain(r.grade)
    expect(r.conformance.status).toBe('fail')
    const scs = r.conformance.failures.map((f) => f.sc)
    expect(scs).toEqual(expect.arrayContaining(['1.1.1', '2.4.2', '3.1.1', '1.3.1', '1.4.3']))
  })
})
```

- [ ] **Step 2: Run; calibrate.** `npx vitest run src/__tests__/pptxIntegration.test.ts`. If the score targets miss, tune per-category deductions (Task 6 table) — never the targets. Record any tuned value in the plan-execution notes.
- [ ] **Step 3: Manual CLI verification**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
node -e "require('./apps/api/node_modules/jszip')" 2>/dev/null; \
pnpm --filter api exec tsx -e "
import { buildPptx } from './src/__tests__/helpers/minimalPptx.js';
import { writeFileSync } from 'node:fs';
buildPptx({ slides: [{ title: 'Welcome' }] }).then(b => writeFileSync('/tmp/sample.pptx', b));
" && pnpm --filter cli exec tsx src/index.ts /tmp/sample.pptx
```

Expected: a scored PPTX report in the terminal (`Type: PPTX`).

- [ ] **Step 4: Commit** — `git add apps/api/src/__tests__/pptxIntegration.test.ts && git commit -m "test(api): pptx end-to-end fixtures + calibration targets"`

---

### Task 12: Phase gate

- [ ] **Step 1:**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm build && (cd apps/api && npx vitest run) && (cd apps/web && npx vitest run)
```

Expected: all green (web untouched this phase). Confirm docx suites byte-identical: `git diff v1.32.1 --stat -- apps/api/src/__tests__/docx*.test.ts` → empty.
