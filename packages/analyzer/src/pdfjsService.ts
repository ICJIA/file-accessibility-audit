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
  // One entry per LINK, not per annotation. A link claimed by a <Link>
  // structure element reads its text from that element's marked-content runs
  // (exact — the same id mapping the heading outline uses) and is `tagged:
  // true`; a wrapped link that spans several annotations is still one entry.
  // An annotation no element claims falls back to the text items whose origin
  // lies inside its /Rect (approximate — it can include neighbouring words)
  // and is `tagged: false`, which is its real defect. `tagged` and `page` are
  // absent on stored reports from before this census existed.
  links: Array<{ url: string; text: string; tagged?: boolean; page?: number }>;
  // Link-annotation tagging census across all pages: visible /Link
  // annotations (external AND internal), and how many of them no structure
  // element references. Absent (undefined) on pre-census stored reports, so
  // consumers can tell "analyzed, all tagged" (0) from "unknown".
  linkAnnotationCount?: number;
  untaggedLinkAnnotationCount?: number;
  // <Figure> elements whose descendants carry real text — Word exports text
  // boxes, sidebars, SmartArt and chart title bars this way. A Figure's /Alt
  // REPLACES its contents for a screen reader, so "add alt text" is the wrong
  // fix for these; the scorer tells the author to retag them instead. Only
  // figures WITH text are recorded (capped), with a short preview to find
  // them by. Absent on pre-census stored reports.
  textBearingFigures?: Array<{
    page: number;
    hasAlt: boolean;
    textLength: number;
    preview: string;
  }>;
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
  // `textReliable: false` marks an entry from a page whose marked content
  // could not be attributed (see markedContentAttributionReliable) — the text
  // shown may be partial, so the scorer must not judge it. Absent means fine.
  headingOutline?: Array<{ level: string; text: string; textReliable?: boolean }>;
  // Heading tags whose text could not be resolved at all — no /Alt, no
  // /ActualText, no content leaves. They are deliberately absent from
  // headingOutline (blank outline rows help nobody) and counted here instead,
  // because "19 of this document's 96 headings contain no text" is a finding.
  // Absent (undefined) on stored reports predating the census, which the
  // scorer must read as "unknown", never as zero.
  headingsWithoutText?: number;
  // -------------------------------------------------------------------------
  // v1.94.0 text censuses (Matterhorn 10 and 01), computed from the SAME
  // getTextContent({includeMarkedContent: true}) item stream the heading
  // outline uses — deliberately NOT the operator list, because the text
  // layer never includes annotation appearance streams, so form-widget
  // label text can never pollute either census. Absent on stored reports
  // from before v1.94.0.
  // -------------------------------------------------------------------------
  /** Extracted characters in the Unicode Private Use Areas or U+FFFD —
   *  pdf.js's signature for glyphs whose fonts provide no usable mapping to
   *  real text (Matterhorn 10): the glyph paints, but a screen reader gets
   *  a symbol with no pronunciation. Artifact runs excluded. */
  unmappedTextCharCount?: number;
  /** Visible (non-whitespace, non-artifact) characters INSIDE a marked-
   *  content run that carries an MCID — i.e. text the structure tree can
   *  reference. */
  taggedVisibleChars?: number;
  /** Visible non-artifact characters OUTSIDE every MCID-carrying run — text
   *  painted on the page that no structure element can reference
   *  (Matterhorn 01-005/006: real content neither tagged nor artifacted). */
  untaggedVisibleChars?: number;
  /** 1-indexed pages with untagged visible text, ascending, capped at 12 —
   *  so the finding can NAME pages to open instead of only counting. */
  untaggedTextPages?: number[];
  error: string | null;
}

// A struct tree can be arbitrarily large; the scorer displays at most 40
// outline lines, so extraction stops well past that rather than carrying
// thousands of entries through the report payload.
const MAX_HEADING_OUTLINE_ENTRIES = 300;
// Same idea for the text-bearing figure census: the scorer lists ten.
const MAX_TEXT_BEARING_FIGURES = 200;

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
    linkAnnotationCount: 0,
    untaggedLinkAnnotationCount: 0,
    textBearingFigures: [],
    unmappedTextCharCount: 0,
    taggedVisibleChars: 0,
    untaggedVisibleChars: 0,
    untaggedTextPages: [],
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

      // v1.94.0 text censuses (Matterhorn 10 + 01) over the same item stream.
      const census = censusTextItems(textContent.items);
      result.unmappedTextCharCount! += census.unmappedChars;
      result.taggedVisibleChars! += census.taggedVisibleChars;
      result.untaggedVisibleChars! += census.untaggedVisibleChars;
      if (census.untaggedVisibleChars > 0 && result.untaggedTextPages!.length < 12) {
        result.untaggedTextPages!.push(i);
      }

      // This page's struct tree, fetched once and shared by the link-text
      // pass, the heading outline, and the figure census. Never fatal: a page
      // with a broken or absent tree just contributes nothing to them.
      let tree: any = null;
      let textById: Map<string, string> | null = null;
      try {
        tree = await page.getStructTree();
        if (tree) textById = buildMarkedContentTextMap(textContent.items);
      } catch {}

      // Link annotations. A link's text is what its <Link> element contains —
      // exact marked-content runs, not "whatever text starts inside the
      // rectangle" (which bled "here . FOID statistics are available" into a
      // link on "here", and split a line-wrapped link into a fragment "PA").
      // Geometry is kept only for annotations no element claims; those are
      // reported as untagged, which is their actual defect.
      try {
        const annotations = await page.getAnnotations();
        const linkAnnots = annotations.filter(
          (a: any) => a?.subtype === "Link" && !isHiddenAnnotation(a),
        );
        const annotById = new Map<string, any>();
        for (const a of linkAnnots) {
          const id = normalizeAnnotationId(a.id);
          if (id) annotById.set(id, a);
        }
        const claimed = new Set<any>();
        const structLinks = tree && textById ? collectStructTreeLinks(tree, textById) : [];
        for (const sl of structLinks) {
          const annots = sl.annotationIds.map((id) => annotById.get(id)).filter(Boolean);
          for (const a of annots) claimed.add(a);
          const urls = [
            ...new Set(
              annots
                .map((a: any) => a.url)
                .filter((u: unknown): u is string => typeof u === "string" && u.length > 0),
            ),
          ];
          if (urls.length === 0) continue; // internal (GoTo) link, or no annotation at all
          const text =
            sl.text ||
            annots
              .map((a: any) => findLinkText(a, textItems))
              .filter(Boolean)
              .join(" ") ||
            urls[0];
          for (const url of urls) result.links.push({ url, text, tagged: true, page: i });
        }
        let untagged = 0;
        for (const annot of linkAnnots) {
          if (claimed.has(annot)) continue;
          untagged++;
          if (annot.url) {
            result.links.push({
              url: annot.url,
              text: findLinkText(annot, textItems) || annot.url,
              tagged: false,
              page: i,
            });
          }
        }
        result.linkAnnotationCount = (result.linkAnnotationCount ?? 0) + linkAnnots.length;
        result.untaggedLinkAnnotationCount = (result.untaggedLinkAnnotationCount ?? 0) + untagged;
      } catch {}

      // Heading text. The outline is capped, but the text-less COUNT is not
      // gated on that cap — the proportion the scorer works from has to stay
      // honest on a document with more headings than the outline can hold.
      //
      // A page whose text could not be attributed to its tags contributes its
      // headings MARKED, never counted: on such a page every heading looks
      // empty and every resolved one may be partial, and neither is a fact
      // about the document.
      try {
        if (tree && textById) {
          const reliable = markedContentAttributionReliable({
            textItems: (textContent.items as any[]).filter(
              (it: any) => typeof it?.str === "string" && it.str,
            ).length,
            idsSeen: (textContent.items as any[]).filter(
              (it: any) =>
                typeof it?.type === "string" &&
                it.type.startsWith("beginMarkedContent") &&
                typeof it.id === "string" &&
                it.id,
            ).length,
            idsWithText: textById.size,
          });
          const { entries, withoutText } = collectStructTreeHeadings(tree, textById);
          if (result.headingOutline!.length < MAX_HEADING_OUTLINE_ENTRIES) {
            result.headingOutline!.push(
              ...(reliable ? entries : entries.map((e) => ({ ...e, textReliable: false }))),
            );
          }
          if (reliable) {
            result.headingsWithoutText = (result.headingsWithoutText ?? 0) + withoutText;
          }
        }
      } catch {}

      // Figures that contain text (see PdfjsResult.textBearingFigures).
      try {
        if (tree && textById && result.textBearingFigures!.length < MAX_TEXT_BEARING_FIGURES) {
          result.textBearingFigures!.push(...collectTextBearingFigures(tree, textById, i));
        }
      } catch {}
    }
    if (result.textBearingFigures!.length > MAX_TEXT_BEARING_FIGURES) {
      result.textBearingFigures!.length = MAX_TEXT_BEARING_FIGURES;
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

// ---------------------------------------------------------------------------
// v1.94.0 text censuses (Matterhorn 10 + 01). Pure function over a
// getTextContent({ includeMarkedContent: true }) item stream, so it is
// unit-testable with synthetic items (the pdfjsHeadingOutline.test.ts
// pattern) and immune to annotation appearance streams by construction.
// ---------------------------------------------------------------------------

/** Character codes pdf.js uses when a glyph has no usable text mapping: the
 *  three Private Use Areas plus the replacement character. A reader hears
 *  nothing useful for these — the extraction-visible face of a missing
 *  ToUnicode/cmap (Matterhorn 10). */
export function isUnmappedChar(code: number): boolean {
  return (
    (code >= 0xe000 && code <= 0xf8ff) ||
    (code >= 0xf0000 && code <= 0xffffd) ||
    (code >= 0x100000 && code <= 0x10fffd) ||
    code === 0xfffd
  );
}

export interface TextCensus {
  /** Non-artifact extracted characters that are PUA/replacement — unmapped. */
  unmappedChars: number;
  /** Visible (non-whitespace) non-artifact chars inside an MCID-bearing run. */
  taggedVisibleChars: number;
  /** Visible non-artifact chars outside every MCID-bearing run. */
  untaggedVisibleChars: number;
}

/**
 * Census one page's text items. Marked-content marker items nest: a text
 * item is TAGGED when any enclosing frame carries an id (the same
 * "p…_mc…" ids the struct tree references), and ignored entirely when any
 * enclosing frame is an /Artifact (artifact text is deliberately outside
 * the reading order — headers, footers, page numbers). Exported for tests.
 */
export function censusTextItems(items: unknown[]): TextCensus {
  const census: TextCensus = { unmappedChars: 0, taggedVisibleChars: 0, untaggedVisibleChars: 0 };
  const stack: Array<{ hasId: boolean; artifact: boolean }> = [];
  for (const raw of items) {
    const item = raw as any;
    if (item?.type === "beginMarkedContent" || item?.type === "beginMarkedContentProps") {
      const tag = typeof item.tag === "string" ? item.tag : "";
      stack.push({
        hasId: typeof item.id === "string" && item.id.length > 0,
        artifact: tag === "Artifact" || tag === "/Artifact",
      });
      continue;
    }
    if (item?.type === "endMarkedContent") {
      stack.pop();
      continue;
    }
    if (typeof item?.str !== "string" || item.str.length === 0) continue;
    if (stack.some((f) => f.artifact)) continue;
    const tagged = stack.some((f) => f.hasId);
    for (const ch of item.str) {
      const code = ch.codePointAt(0)!;
      if (isUnmappedChar(code)) census.unmappedChars++;
      if (ch.trim() === "") continue; // whitespace paints nothing
      if (tagged) census.taggedVisibleChars++;
      else census.untaggedVisibleChars++;
    }
  }
  return census;
}

// Build "p{pageObjId}_mc{mcid}" → text from a getTextContent({
// includeMarkedContent: true }) item stream. begin/endMarkedContent items
// nest; a text run belongs to the NEAREST enclosing run that has an id (BMC
// runs have none — their text still belongs to the enclosing MCID run for
// struct-tree purposes). Exported for tests.
/**
 * Could this page's text be attached to its tags at all?
 *
 * On some pages pdf.js emits every marked-content boundary as an immediately
 * closed empty pair and delivers the text separately, so no run can be matched
 * to a tag. controls/DVFR_Biennial_Report_2024 page 2 is the case that taught
 * us: 168 text items, 17 marked-content ids, text for exactly ONE of them.
 * Five ordinary <H1> tags looked empty, and a conformance-clean document went
 * from 100/A to 79/C on the strength of it.
 *
 * "We could not attribute this page" and "these headings are empty" are
 * different statements and only one of them is ours to make. A page that fails
 * this test is excluded from the heading census rather than counted against
 * the document. Deliberately narrow: it needs enough text for the ratio to
 * mean anything, and enough ids to average over. Exported for tests.
 */
export function markedContentAttributionReliable(page: {
  textItems: number;
  idsSeen: number;
  idsWithText: number;
}): boolean {
  const { textItems, idsSeen, idsWithText } = page;
  if (textItems <= MIN_TEXT_ITEMS_TO_JUDGE_ATTRIBUTION) return true;
  if (idsSeen <= MIN_IDS_TO_JUDGE_ATTRIBUTION) return true;
  return idsWithText / idsSeen >= MIN_ATTRIBUTED_ID_SHARE;
}

/** Below this much text on the page, the attribution ratio is noise. */
const MIN_TEXT_ITEMS_TO_JUDGE_ATTRIBUTION = 20;
/** And below this many marked-content ids there is nothing to average. */
const MIN_IDS_TO_JUDGE_ATTRIBUTION = 2;
/** Share of ids that must have received text for the page to be judged. */
const MIN_ATTRIBUTED_ID_SHARE = 0.5;

export function buildMarkedContentTextMap(items: unknown[]): Map<string, string> {
  const map = new Map<string, string>();
  const stack: Array<string | null> = [];
  for (const raw of items) {
    const item = raw as any;
    if (item?.type === "beginMarkedContent" || item?.type === "beginMarkedContentProps") {
      stack.push(typeof item.id === "string" && item.id ? item.id : null);
    } else if (item?.type === "endMarkedContent") {
      stack.pop();
    } else if (typeof item?.str === "string" && (item.str || item.hasEOL === true)) {
      // A line end (hasEOL) is a word boundary pdf.js reports instead of a
      // space glyph — on the last item of the line, or as a separate empty
      // item ({str: "", hasEOL: true}) when the break falls between chunks.
      // Without it a link wrapped across two lines reads
      // "RevocationEnforcement". Consumers collapse whitespace anyway.
      const piece = item.hasEOL === true ? `${item.str} ` : item.str;
      for (let i = stack.length - 1; i >= 0; i--) {
        const id = stack[i];
        if (id) {
          map.set(id, (map.get(id) ?? "") + piece);
          break;
        }
      }
    }
  }
  return map;
}

// Serialized getStructTree() heading roles: H1–H6, or generic H (no level).
const HEADING_ROLE = /^H[1-6]?$/;

const normalizeWhitespace = (s: string): string => s.replace(/\s+/g, " ").trim();

// The concatenated text of a serialized struct node's content leaves,
// including leaves nested under Spans and other child elements, with
// whitespace collapsed. Exported for tests.
export function structNodeText(node: unknown, textById: Map<string, string>): string {
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
  return normalizeWhitespace(parts.join(" "));
}

// Walk a serialized struct tree (page.getStructTree()) and resolve each
// heading node's text: the node's /Alt or /ActualText when the author
// provided one, else the concatenated text of its content leaves.
//
// Headings whose text cannot be resolved stay OUT of the outline — a list of
// blank lines helps nobody — but they are COUNTED (v1.110.0). A heading tag
// containing no text is a defect in its own right, and while this walker
// merely skipped them it was one the report could not see: a 246-page annual
// report carried 19 of them and scored only for its level skips. Exported for
// tests.
export function collectStructTreeHeadings(
  tree: unknown,
  textById: Map<string, string>,
): { entries: Array<{ level: string; text: string }>; withoutText: number } {
  const entries: Array<{ level: string; text: string }> = [];
  let withoutText = 0;
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (typeof node.role === "string" && HEADING_ROLE.test(node.role)) {
      const alt = typeof node.alt === "string" ? normalizeWhitespace(node.alt) : "";
      const text = alt || structNodeText(node, textById);
      if (text) entries.push({ level: node.role, text });
      else withoutText++;
      return;
    }
    if (Array.isArray(node.children)) for (const c of node.children) visit(c);
  };
  visit(tree);
  return { entries, withoutText };
}

// pdf.js serializes an OBJR kid as {type:"object", id:"<ref>"} — or, when
// the OBJR is the element's only kid and the annotation carries a
// /StructParent, as {type:"annotation", id:"pdfjs_internal_id_<ref>"}.
// getAnnotations() reports the same ref as the annotation's `id`. Normalize
// both to the bare ref so they can be matched.
const ANNOTATION_ID_PREFIX = "pdfjs_internal_id_";
function normalizeAnnotationId(id: unknown): string | null {
  if (typeof id !== "string" || id.length === 0) return null;
  return id.startsWith(ANNOTATION_ID_PREFIX) ? id.slice(ANNOTATION_ID_PREFIX.length) : id;
}

// Annotation flag bits (ISO 32000-1 §12.5.3): Hidden (bit 2) and NoView
// (bit 6) annotations are never presented, so they are outside the tagging
// census — PDF/UA 7.18.1 exempts them too.
function isHiddenAnnotation(annot: any): boolean {
  const flags = annot?.annotationFlags;
  return typeof flags === "number" && (flags & (2 | 32)) !== 0;
}

// Every <Link> element in a serialized struct tree, with its resolved text
// and the (normalized) ids of the annotations it references. Text is the
// element's content runs; a content-less Link falls back to its /Alt (the
// accessible name an author gave an image link). Exported for tests.
export function collectStructTreeLinks(
  tree: unknown,
  textById: Map<string, string>,
): Array<{ text: string; annotationIds: string[] }> {
  const out: Array<{ text: string; annotationIds: string[] }> = [];
  const annotationIds = (node: any): string[] => {
    const ids: string[] = [];
    const walk = (n: any): void => {
      if (!n || typeof n !== "object" || !Array.isArray(n.children)) return;
      for (const c of n.children) {
        if (c?.type === "object" || c?.type === "annotation") {
          const id = normalizeAnnotationId(c.id);
          if (id) ids.push(id);
        } else if (c && typeof c === "object" && typeof c.role === "string") {
          walk(c);
        }
      }
    };
    walk(node);
    return ids;
  };
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.role === "Link") {
      const alt = typeof node.alt === "string" ? normalizeWhitespace(node.alt) : "";
      out.push({ text: structNodeText(node, textById) || alt, annotationIds: annotationIds(node) });
      return;
    }
    if (Array.isArray(node.children)) for (const c of node.children) visit(c);
  };
  visit(tree);
  return out;
}

const FIGURE_PREVIEW_CHARS = 80;

// Every <Figure> element on a page whose descendants carry text — a Word
// text box, sidebar, SmartArt, or chart title bar exported as a figure.
// Figures with no text (pictures, vector drawings) are not reported; they
// are ordinary alt-text candidates. `hasAlt` mirrors qpdf's definition
// (pdf.js puts /Alt or /ActualText in `alt`). Exported for tests.
export function collectTextBearingFigures(
  tree: unknown,
  textById: Map<string, string>,
  page: number,
): Array<{ page: number; hasAlt: boolean; textLength: number; preview: string }> {
  const out: Array<{ page: number; hasAlt: boolean; textLength: number; preview: string }> = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (node.role === "Figure") {
      const text = structNodeText(node, textById);
      if (text) {
        out.push({
          page,
          hasAlt: typeof node.alt === "string" && node.alt.trim().length > 0,
          textLength: text.length,
          preview:
            text.length > FIGURE_PREVIEW_CHARS
              ? `${text.slice(0, FIGURE_PREVIEW_CHARS - 1)}…`
              : text,
        });
      }
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
