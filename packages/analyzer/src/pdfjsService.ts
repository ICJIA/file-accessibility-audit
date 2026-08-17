export interface PdfMetadata {
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
  pdfVersion: string | null;
  isEncrypted: boolean;
  keywords: string | null;
  author: string | null;
  subject: string | null;
  pageCount: number;
}

export interface PdfjsResult {
  pageCount: number;
  hasText: boolean;
  textLength: number;
  title: string | null;
  // The title is present but looks like a filename / tool-generated string
  // ("report_v3_final.pdf", "Microsoft Word - …"). Advisory signal: the
  // title is ALWAYS preserved in `title` — never nulled — so conformance
  // checks remain truthful about whether a title exists.
  titleLooksLikeFilename?: boolean;
  author: string | null;
  subject: string | null;
  lang: string | null;
  hasOutlines: boolean;
  outlineCount: number;
  links: Array<{ url: string; text: string }>;
  imageCount: number;
  // Painted images NOT enclosed by any /Artifact run — i.e. the content images
  // that actually participate in the reading order and require alt text. Lets
  // the scorer distinguish "every image is a decorative artifact" (no alt
  // needed) from "untagged content images" when the struct tree has 0 figures.
  nonArtifactImageCount?: number;
  emptyPages: number[];
  // PDF/UA-1 identifier from the XMP metadata (pdfuaid:part). pdfjs parses the
  // XMP stream; `qpdf --json` (no stream-data flag) cannot expose it, so this
  // is the authoritative source for the PDF/UA conformance claim.
  hasPdfUaIdentifier?: boolean;
  pdfUaPart?: string | null;
  // Count of /Artifact marked-content runs across page content streams
  // (headers, footers, page numbers, watermarks). Real artifacts live in the
  // content stream, not the structure tree, so this is the authoritative
  // artifact signal — qpdf's struct-tree /S=/Artifact count is almost always 0.
  artifactRunCount?: number;
  metadata: PdfMetadata;
  // Fonts that paint VISIBLE, NON-WHITESPACE text somewhere in the document:
  // BaseFont-style names (matching QpdfResult.fonts[].baseFonts) of every
  // font that shows at least one glyph outside text rendering mode 3
  // (invisible — the OCR-layer carve-out PDF/A and PDF/UA also make) whose
  // unicode is not pure whitespace. Word processors emit inter-run spaces in
  // the paragraph's default font; a space paints no glyph and extracts from
  // the encoding, not the font program, so a non-embedded font used only for
  // whitespace cannot garble anything — the scorer exempts it. An EMPTY array
  // means "analyzed, nothing paints visible text"; ABSENT (undefined) means
  // the signal is unavailable (pre-v1.79.0 stored reports, or a text run
  // whose font pdfjs could not resolve) and no exemption may be applied.
  visibleTextFontNames?: string[];
  // Per-page MCID sequence as encountered while walking each page's content
  // stream (i.e. visual draw order). Populated from pdfjs's operator list —
  // OPS.beginMarkedContentProps args include the MCID on the properties dict.
  // /Artifact-tagged marked-content runs are skipped since they do not
  // participate in the logical reading order. Key is the 1-indexed page
  // number. Compared against QpdfResult.structTreeMcidsByPage to measure
  // reading-order fidelity.
  contentStreamMcidsByPage: Record<number, number[]>;
  // Heading LEVEL + TEXT in document order, resolved from each page's struct
  // tree. qpdf's walk can only see levels ({level, tag}) — the text lives in
  // marked-content runs, which pdfjs can resolve because getStructTree()
  // content leaves and getTextContent({includeMarkedContent: true}) items
  // share the same "p{pageObjId}_mc{mcid}" id format. Optional: absent on
  // stored reports from before this field existed.
  headingOutline?: Array<{ level: string; text: string }>;
  error: string | null;
}

// A struct tree can be arbitrarily large; the scorer displays at most 40
// outline lines, so extraction stops well past that rather than carrying
// thousands of entries through the report payload.
const MAX_HEADING_OUTLINE_ENTRIES = 300;

export async function analyzeWithPdfjs(buffer: Buffer): Promise<PdfjsResult> {
  // Dynamic import since pdfjs-dist is ESM-heavy
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const result: PdfjsResult = {
    pageCount: 0,
    hasText: false,
    textLength: 0,
    title: null,
    author: null,
    subject: null,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    links: [],
    imageCount: 0,
    nonArtifactImageCount: 0,
    emptyPages: [],
    hasPdfUaIdentifier: false,
    pdfUaPart: null,
    artifactRunCount: 0,
    contentStreamMcidsByPage: {},
    headingOutline: [],
    metadata: {
      creator: null,
      producer: null,
      creationDate: null,
      modDate: null,
      pdfVersion: null,
      isEncrypted: false,
      keywords: null,
      author: null,
      subject: null,
      pageCount: 0,
    },
    error: null,
  };

  let doc: any = null;
  try {
    const data = new Uint8Array(buffer);
    doc = await pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      verbosity: 0, // Suppress harmless TrueType font warnings
    }).promise;

    result.pageCount = doc.numPages;

    // Metadata
    const metadata = await doc.getMetadata();
    const info = metadata?.info as any;
    if (info) {
      result.title = info.Title || null;
      result.author = info.Author || null;
      result.subject = info.Subject || null;
      result.lang = info.Language || null;
      result.metadata.creator = info.Creator || null;
      result.metadata.producer = info.Producer || null;
      result.metadata.creationDate = parsePdfDate(info.CreationDate) || null;
      result.metadata.modDate = parsePdfDate(info.ModDate) || null;
      result.metadata.pdfVersion = info.PDFFormatVersion || null;
      result.metadata.isEncrypted = !!info.IsEncrypted;
      result.metadata.keywords = info.Keywords || null;
      result.metadata.author = info.Author || null;
      result.metadata.subject = info.Subject || null;
    }
    result.metadata.pageCount = doc.numPages;

    // PDF/UA identifier — read pdfuaid:part from the parsed XMP metadata.
    // (qpdf --json cannot surface the compressed XMP stream, so pdfjs is the
    // authoritative source for the PDF/UA conformance claim.)
    try {
      const xmp = (metadata as any)?.metadata;
      if (xmp && typeof xmp.getAll === "function") {
        const all = xmp.getAll() || {};
        const part = all["pdfuaid:part"];
        if (part !== undefined && part !== null && `${part}`.trim() !== "") {
          result.hasPdfUaIdentifier = true;
          result.pdfUaPart = `${part}`.trim();
        }
      }
      // Fallback: XMP simple properties may be written in RDF ATTRIBUTE form
      // (<rdf:Description … pdfuaid:part="1"/>). pdfjs's MetadataParser only
      // iterates child elements of rdf:Description, so attribute-form
      // properties never reach getAll() — scan the raw packet for them.
      if (!result.hasPdfUaIdentifier && xmp && typeof xmp.getRaw === "function") {
        const raw = xmp.getRaw();
        if (typeof raw === "string" && raw.includes("pdfuaid")) {
          const m =
            raw.match(/pdfuaid:part\s*=\s*["']\s*(\d+)\s*["']/i) ??
            raw.match(/<pdfuaid:part[^>]*>\s*(\d+)\s*</i);
          if (m) {
            result.hasPdfUaIdentifier = true;
            result.pdfUaPart = m[1];
          }
        }
      }
    } catch {}

    // Classify (but never erase) titles that look like filenames. The old
    // behavior nulled any no-space title (/^[a-z0-9_-]+$/), which erased
    // legitimate titles like "Introduction" or "Budget2024" and produced a
    // false "no title in metadata" WCAG 2.4.2 conformance failure.
    if (result.title && isFilenameLikeTitle(result.title)) {
      result.titleLooksLikeFilename = true;
    }

    // Outlines/bookmarks
    try {
      const outline = await doc.getOutline();
      if (outline && outline.length > 0) {
        result.hasOutlines = true;
        result.outlineCount = outline.length;
      }
    } catch {}

    // Extract text and links from all pages
    let totalText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);

      // Text content. includeMarkedContent interleaves begin/endMarkedContent
      // marker items (no `str`) into the stream for the heading-text pass
      // below — filter to real text items so pageText/emptyPages/textLength
      // keep their exact pre-existing semantics.
      const textContent = await page.getTextContent({ includeMarkedContent: true });
      const textItems = textContent.items.filter((item: any) => typeof item.str === "string");
      const pageText = textItems.map((item: any) => item.str || "").join(" ");
      totalText += pageText + " ";

      // Track empty pages (pages with negligible text content)
      if (pageText.trim().length < 10) {
        result.emptyPages.push(i);
      }

      // Link annotations
      try {
        const annotations = await page.getAnnotations();
        for (const annot of annotations) {
          if (annot.subtype === "Link" && annot.url) {
            // Find the text content near this link's position
            const linkText = findLinkText(annot, textItems) || annot.url;
            result.links.push({ url: annot.url, text: linkText });
          }
        }
      } catch {}

      // Heading text. Never fatal: a page with a broken struct tree just
      // contributes no outline entries.
      try {
        if (result.headingOutline!.length < MAX_HEADING_OUTLINE_ENTRIES) {
          const tree = await page.getStructTree();
          if (tree) {
            const textById = buildMarkedContentTextMap(textContent.items);
            result.headingOutline!.push(...collectStructTreeHeadings(tree, textById));
          }
        }
      } catch {}
    }
    if (result.headingOutline!.length > MAX_HEADING_OUTLINE_ENTRIES) {
      result.headingOutline!.length = MAX_HEADING_OUTLINE_ENTRIES;
    }

    // Count meaningful images via operator list (fallback when QPDF can't detect them)
    // Filters out tiny/decorative images (< 50px in either dimension) and deduplicates
    // by image name within each page. This is an approximate count — it includes
    // decorative graphics that may not need alt text.
    const OPS = pdfjsLib.OPS as Record<string, number>;
    const imageOps = new Set(
      [OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintImageXObjectRepeat].filter(
        (v) => v !== undefined,
      ),
    );
    const MIN_IMAGE_DIM = 50; // pixels — skip spacers, borders, tiny decorative elements
    const seenPerPage = new Set<string>();
    let imageCount = 0;
    // Subset of imageCount painted OUTSIDE any /Artifact run — the content images.
    let nonArtifactImageCount = 0;
    // Count top-level /Artifact marked-content runs (a run nested inside
    // another artifact is not counted twice). This is the real artifact signal
    // — artifacts live in the content stream, not the structure tree.
    let artifactRunCount = 0;
    // Marked-content operators surface MCIDs in visual/draw order. We
    // capture them per page so the scorer can compare this content-stream
    // sequence against the struct-tree sequence from QPDF (reading-order
    // fidelity check). /Artifact-tagged runs are skipped because they do
    // not participate in logical reading order.
    const bdcOp = OPS.beginMarkedContentProps;
    const bmcOp = OPS.beginMarkedContent;
    const emcOp = OPS.endMarkedContent;
    // Font-usage tracking (see visibleTextFontNames on PdfjsResult). setFont
    // ops carry the loaded font's internal id; commonObjs resolves it to the
    // translated font whose `.name` is the /BaseFont-style name qpdf's census
    // records. Text state (current font, render mode) is saved/restored with
    // q/Q like any other graphics state.
    const setFontOp = OPS.setFont;
    const setTextRenderingModeOp = OPS.setTextRenderingMode;
    const saveOp = OPS.save;
    const restoreOp = OPS.restore;
    const showTextOps = new Set(
      [
        OPS.showText,
        OPS.showSpacedText,
        OPS.nextLineShowText,
        OPS.nextLineSetSpacingShowText,
      ].filter((v) => v !== undefined),
    );
    const visibleTextFonts = new Set<string>();
    // A text run painted visible glyphs under a font pdfjs could not resolve:
    // the usage signal is incomplete, so it must not be used for exemptions.
    let fontResolutionFailed = false;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const ops = await page.getOperatorList();
      seenPerPage.clear();
      const pageMcids: number[] = [];
      // Stack of "is this marked-content run inside an /Artifact?" flags.
      const artifactStack: boolean[] = [];
      let currentFontName: string | null = null;
      let renderMode = 0;
      const textStateStack: Array<{ font: string | null; mode: number }> = [];
      for (let j = 0; j < ops.fnArray.length; j++) {
        const fn = ops.fnArray[j];
        // Marked-content tracking. BMC and BDC push onto the stack, EMC pops.
        // pdfjs-dist normalizes the tag (args[0]) as either a plain string
        // ("P", "Artifact") or a {name: string} object depending on how the
        // PDF encoded it. The properties arg for BDC (args[1]) is either a
        // bare MCID number (common case — pdfjs flattens {MCID n} to n) or
        // a dict for non-MCID property sets, or null.
        if (fn === bmcOp) {
          const tag = ops.argsArray[j]?.[0];
          const isArtifact = isArtifactTag(tag);
          if (isArtifact && !artifactStack.some((f) => f)) artifactRunCount++;
          artifactStack.push(isArtifact);
        } else if (fn === bdcOp) {
          const tag = ops.argsArray[j]?.[0];
          const props = ops.argsArray[j]?.[1];
          const isArtifact = isArtifactTag(tag);
          if (isArtifact && !artifactStack.some((f) => f)) artifactRunCount++;
          artifactStack.push(isArtifact);
          if (!isArtifact) {
            // Check if *any enclosing* run is an artifact (exclude the
            // just-pushed frame — it's this run, which is non-artifact).
            const enclosingArtifact = artifactStack.slice(0, -1).some((f) => f);
            if (!enclosingArtifact) {
              const mcid = extractMcid(props);
              if (mcid !== null) pageMcids.push(mcid);
            }
          }
          continue;
        } else if (fn === emcOp) {
          artifactStack.pop();
        }

        if (fn === setFontOp) {
          const loadedName = ops.argsArray[j]?.[0];
          currentFontName = null;
          if (typeof loadedName === "string") {
            try {
              const fontObj = page.commonObjs.has(loadedName)
                ? page.commonObjs.get(loadedName)
                : null;
              if (fontObj && typeof (fontObj as any).name === "string") {
                currentFontName = (fontObj as any).name;
              }
            } catch {}
          }
          continue;
        }
        if (fn === setTextRenderingModeOp) {
          const mode = ops.argsArray[j]?.[0];
          if (typeof mode === "number") renderMode = mode;
          continue;
        }
        if (fn === saveOp) {
          textStateStack.push({ font: currentFontName, mode: renderMode });
        } else if (fn === restoreOp) {
          const prev = textStateStack.pop();
          if (prev) {
            currentFontName = prev.font;
            renderMode = prev.mode;
          }
        } else if (showTextOps.has(fn)) {
          // Mode 3 is invisible text — the OCR-layer carve-out. Every other
          // mode paints (or clips with) real glyph shapes.
          if (renderMode !== 3 && paintsNonWhitespace(ops.argsArray[j])) {
            if (currentFontName) {
              visibleTextFonts.add(currentFontName);
            } else {
              fontResolutionFailed = true;
            }
          }
        }

        if (!imageOps.has(fn)) continue;
        const imgName = ops.argsArray[j]?.[0];
        if (typeof imgName !== "string") continue;
        if (seenPerPage.has(imgName)) continue; // same image painted twice on same page
        seenPerPage.add(imgName);
        try {
          const imgData = page.objs.has(imgName)
            ? page.objs.get(imgName)
            : page.commonObjs.has(imgName)
              ? page.commonObjs.get(imgName)
              : null;
          if (imgData && typeof imgData === "object" && "width" in imgData && "height" in imgData) {
            const w = (imgData as any).width as number;
            const h = (imgData as any).height as number;
            if (w < MIN_IMAGE_DIM || h < MIN_IMAGE_DIM) continue; // skip tiny images
          }
        } catch {
          // If we can't resolve the image, count it conservatively
        }
        imageCount++;
        // An image is a content image only if no enclosing marked-content run is
        // an /Artifact. Artifacted images are decorative and need no alt text.
        if (!artifactStack.some((f) => f)) nonArtifactImageCount++;
      }
      if (pageMcids.length > 0) {
        result.contentStreamMcidsByPage[i] = pageMcids;
      }
    }
    result.imageCount = imageCount;
    result.nonArtifactImageCount = nonArtifactImageCount;
    result.artifactRunCount = artifactRunCount;
    // Left ABSENT (never an empty array) when any visible run's font could not
    // be resolved — an incomplete usage census must not drive exemptions.
    if (!fontResolutionFailed) {
      result.visibleTextFontNames = [...visibleTextFonts].sort();
    }

    result.textLength = totalText.trim().length;
    result.hasText = result.textLength > 50; // Minimum meaningful text
  } catch (err) {
    console.error("pdfjs-dist error:", err);
    result.error = "pdfjs-dist parsing failed";
  } finally {
    if (doc) {
      try {
        await doc.destroy();
      } catch {}
    }
  }

  return result;
}

// Heuristic: does a /Info title look like a filename or tool-generated
// string rather than a human-written title? Used as an ADVISORY signal only
// (partial scoring credit + a finding) — a flagged title still counts as
// present for conformance purposes, since WCAG 2.4.2 title *quality* is a
// human judgment. Deliberately narrow: plain single words ("Introduction",
// "Budget2024") and hyphenated words ("Well-Being") are NOT flagged.
export function isFilenameLikeTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  // Ends in a common document-file extension.
  if (/\.(pdf|docx?|xlsx?|pptx?|rtf|odt|indd|txt|html?)$/i.test(t)) return true;
  // Classic tool-generated titles (Office prepends "<app> - <filename>").
  if (
    /^(microsoft (word|excel|powerpoint) - |untitled\b|document\d+$|scan[ _-]?\d|img[ _-]?\d|dsc[ _-]?\d)/i.test(
      t,
    )
  ) {
    return true;
  }
  // Export/download timestamps ("Report-210525T15080148") and long datetime
  // digit runs ("…20240115120000") — filename machinery, never prose.
  if (/\d{6}t\d{6,}/i.test(t) || /\d{12,}/.test(t)) return true;
  // No whitespace + filename separators: "annual_report", "budget-2024-final".
  // A single hyphen is NOT enough even with digits — "COVID-19",
  // "Section-508", "2024-2025" are legitimate document titles — but a LONG
  // no-space token containing digits is a filename shape, not a title.
  if (!/\s/.test(t)) {
    if (t.includes("_")) return true;
    const hyphens = (t.match(/-/g) || []).length;
    if (hyphens >= 2) return true;
    if (t.length >= 20 && /\d/.test(t)) return true;
  }
  return false;
}

function findLinkText(annot: any, textItems: any[]): string {
  if (!annot.rect || !textItems) return "";

  const [x1, y1, x2, y2] = annot.rect;
  const matchingTexts: string[] = [];

  for (const item of textItems) {
    if (!item.transform) continue;
    const tx = item.transform[4];
    const ty = item.transform[5];

    // Check if text item overlaps with link rect (with some tolerance)
    if (tx >= x1 - 5 && tx <= x2 + 5 && ty >= y1 - 5 && ty <= y2 + 5) {
      if (item.str?.trim()) {
        matchingTexts.push(item.str.trim());
      }
    }
  }

  return matchingTexts.join(" ");
}

// Build "p{pageObjId}_mc{mcid}" → text from a getTextContent({
// includeMarkedContent: true }) item stream. begin/endMarkedContent items
// nest; a text run belongs to the NEAREST enclosing run that has an id (BMC
// runs have none — their text still belongs to the enclosing MCID run for
// struct-tree purposes). Exported for tests.
export function buildMarkedContentTextMap(items: unknown[]): Map<string, string> {
  const map = new Map<string, string>();
  const stack: Array<string | null> = [];
  for (const raw of items) {
    const item = raw as any;
    if (item?.type === "beginMarkedContent" || item?.type === "beginMarkedContentProps") {
      stack.push(typeof item.id === "string" && item.id ? item.id : null);
    } else if (item?.type === "endMarkedContent") {
      stack.pop();
    } else if (typeof item?.str === "string" && item.str) {
      for (let i = stack.length - 1; i >= 0; i--) {
        const id = stack[i];
        if (id) {
          map.set(id, (map.get(id) ?? "") + item.str);
          break;
        }
      }
    }
  }
  return map;
}

// Serialized getStructTree() heading roles: H1–H6, or generic H (no level).
const HEADING_ROLE = /^H[1-6]?$/;

// Walk a serialized struct tree (page.getStructTree()) and resolve each
// heading node's text: the node's /Alt or /ActualText when the author
// provided one, else the concatenated text of its content leaves (including
// leaves nested under Spans and other child elements). Headings whose text
// cannot be resolved are skipped — an outline of blank lines helps nobody.
// Exported for tests.
export function collectStructTreeHeadings(
  tree: unknown,
  textById: Map<string, string>,
): Array<{ level: string; text: string }> {
  const out: Array<{ level: string; text: string }> = [];
  const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();
  const contentText = (node: any): string => {
    const parts: string[] = [];
    const walk = (n: any): void => {
      if (!n || typeof n !== "object") return;
      if (n.type === "content" && typeof n.id === "string") {
        const t = textById.get(n.id);
        if (t) parts.push(t);
        return;
      }
      if (Array.isArray(n.children)) for (const c of n.children) walk(c);
    };
    walk(node);
    return normalize(parts.join(" "));
  };
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (typeof node.role === "string" && HEADING_ROLE.test(node.role)) {
      const alt = typeof node.alt === "string" ? normalize(node.alt) : "";
      const text = alt || contentText(node);
      if (text) out.push({ level: node.role, text });
      return;
    }
    if (Array.isArray(node.children)) for (const c of node.children) visit(c);
  };
  visit(tree);
  return out;
}

// Does a show-text op's args paint anything beyond whitespace? pdfjs glyph
// arrays mix Glyph objects with bare numbers (TJ kerning adjustments — never
// painted). A glyph whose unicode is pure whitespace paints no marks; a glyph
// with NO unicode mapping might paint anything, so it counts as visible (the
// conservative direction — an unmapped glyph in a non-embedded font is the
// worst garbling case, and must keep the font flagged).
function paintsNonWhitespace(args: unknown[]): boolean {
  const glyphs = Array.isArray(args) ? args.find((a) => Array.isArray(a)) : undefined;
  if (!Array.isArray(glyphs)) return false;
  for (const g of glyphs) {
    if (typeof g === "number") continue;
    if (typeof g === "string") {
      if (g.trim() !== "") return true;
      continue;
    }
    if (g && typeof g === "object") {
      const u = (g as any).unicode;
      if (typeof u === "string" && u.length > 0 && u.trim() === "") continue;
      return true;
    }
  }
  return false;
}

// pdfjs-dist passes the tag on a marked-content op either as a plain string
// ("P", "Artifact") or as a { name: string } object — normalize both forms
// when checking for artifact runs (which do not participate in reading order).
function isArtifactTag(tag: any): boolean {
  if (typeof tag === "string") {
    return tag === "Artifact" || tag === "/Artifact";
  }
  if (tag && typeof tag === "object" && "name" in tag) {
    return (tag as any).name === "Artifact";
  }
  return false;
}

// pdfjs-dist simplifies the BDC properties arg. When the only property is
// /MCID, the worker emits the MCID as a bare number. Otherwise it emits a
// dict (possibly including an MCID key). Handle both shapes plus the legacy
// "/MCID"-keyed form in case a different pdfjs build surfaces it.
function extractMcid(props: any): number | null {
  if (typeof props === "number" && Number.isInteger(props)) return props;
  if (props && typeof props === "object") {
    const mcid = (props as any).MCID ?? (props as any)["/MCID"];
    if (typeof mcid === "number" && Number.isInteger(mcid)) return mcid;
  }
  return null;
}

/** Parse PDF date strings like "D:20240115120000+05'30'" into ISO format */
function parsePdfDate(raw: string | undefined): string | null {
  if (!raw) return null;
  // Strip the "D:" prefix and quotes
  const cleaned = raw.replace(/^D:/, "").replace(/'/g, "");
  // Format: YYYYMMDDHHmmSS(+|-)HH'mm'
  const match = cleaned.match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) return raw; // Return raw string if we can't parse
  const [, y, m = "01", d = "01", h = "00", min = "00", s = "00"] = match;
  try {
    const date = new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
    return date.toISOString();
  } catch {
    return raw;
  }
}
