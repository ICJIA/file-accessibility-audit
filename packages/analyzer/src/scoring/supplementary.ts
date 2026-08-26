import type { QpdfResult } from "../qpdfService.js";
import type { PdfjsResult } from "../pdfjsService.js";
import type { CategoryResult } from "../scorer.js";

// Adobe Acrobat Accessibility Checker rule names and step-by-step fix paths
// per category (new UI: Check for accessibility; classic UI: Full Check).
// Appended to failing categories so users have a concrete remediation path.
const acrobatGuide: Record<string, string[]> = {
  text_extractability: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Document" → "Tagged PDF"',
    'If Tagged PDF fails: Document properties → Description shows "Tagged PDF: Yes/No" (status only) — to add tags, run All tools → Prepare for accessibility → Automatically tag PDF (classic UI: Tools → Accessibility → Autotag Document)',
    "If text is unreadable (scanned): All tools → Scan & OCR → Recognize Text → In this file (runs OCR)",
    "Then: All tools → Prepare for accessibility → Fix reading order → verify content tags are correct (classic UI: Tools → Accessibility → Reading Order)",
    'Check font embedding: Document properties (☰ Menu on Windows, File menu on Mac) → Fonts tab — all fonts should say "(Embedded)" or "(Embedded Subset)"',
    "To fix non-embedded fonts: re-export from the source application with font embedding enabled, or use Preflight (All tools → Use print production; classic UI: Tools → Print Production) → Fix → Embed missing fonts",
    "Menu path: Acrobat Pro → All tools → Prepare for accessibility",
  ],
  title_language: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Document" → "Title" and "Primary Language"',
    "Open Document properties (under the ☰ Menu on Windows, the File menu on Mac; classic UI: File → Properties)",
    "Set title: Description tab → Title field (enter a meaningful document title)",
    'Set title display: Initial View tab → Window Options → Show → "Document Title"',
    "Set language: Advanced tab → Reading Options → Language dropdown",
    'Common languages: English = "English", Spanish = "Spanish", French = "French"',
  ],
  heading_structure: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Page Content" → "Tagged Content" and "Document" → "Logical Reading Order"',
    "Open the Tags panel: ☰ Menu (Windows) or View menu (Mac) → Show/Hide → Side panels → Accessibility tags (classic UI: View → Show/Hide → Navigation Panes → Tags)",
    "To tag a heading: select text with Reading Order tool → click H1, H2, H3, etc.",
    "To fix heading level: right-click the tag in Tags panel → Properties → Type → select correct heading level (H1–H6)",
    "Multiple H1s: keep only the document title as H1 — right-click each extra H1 tag → Properties → change Type to H2 (or appropriate level)",
    "Correct hierarchy: H1 (document title) → H2 (sections) → H3 (subsections) — don't skip levels",
  ],
  alt_text: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Alternate Text" → "Figures alternate text"',
    "To fix every image in one pass: All tools → Prepare for accessibility → Add alternate text — Acrobat detects all figures and walks through them (classic UI: Tools → Accessibility → Set Alternate Text)",
    "To add alt text to one image: open Tags panel → find the <Figure> tag → right-click → Properties → Alternate Text field",
    "Or: All tools → Prepare for accessibility → Fix reading order → select the image → right-click → Edit Alternate Text",
    'Good alt text: describes the purpose/content ("Bar chart showing 2024 crime rates"), not appearance ("colorful chart")',
    'Decorative images: select with the Reading Order tool → click "Background/Artifact", or in the Accessibility tags panel right-click the tag → Change Tag to Artifact (removes it from the reading order)',
  ],
  bookmarks: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Document" → "Bookmarks"',
    "Open the Bookmarks panel: the bookmark icon in the right-side panel (classic UI: View → Show/Hide → Navigation Panes → Bookmarks)",
    "Auto-generate from headings: Bookmarks panel → Options menu (⋮) → New Bookmarks From Structure → select the heading tags (requires a tagged PDF)",
    "Or manually: navigate to each section → Ctrl/Cmd+B → name the bookmark",
    "Organize: drag bookmarks in the Bookmarks panel to create parent/child nesting",
  ],
  table_markup: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Tables" → "Rows", "TH and TD", "Headers"',
    "Open Tags panel and expand the <Table> tag to see structure",
    'To add header cells: right-click a <TD> tag → Properties → Type → change to "Table Header Cell (TH)"',
    'To set scope: All tools → Prepare for accessibility → Fix reading order (classic UI: Tools → Accessibility → Reading Order) → select the table → Table Editor → right-click the header cell(s) → Table Cell Properties → Type "Header Cell" + Scope "Column" or "Row"',
    "To fix row structure: ensure each row is wrapped in a <TR> tag with <TH>/<TD> children",
    "Table editor shortcut: right-click a table in the document → Table Editor (Acrobat Pro)",
  ],
  link_quality: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Alternate Text" → "Other elements alternate text"',
    "To fix link text: open Tags panel → find the <Link> tag → expand to see the text",
    "If link text is a raw URL: edit the visible text in the source document (Word, InDesign) before re-exporting to PDF",
    "In Acrobat: All tools → Edit a PDF (classic UI: Tools → Edit PDF) → select the link text → retype with descriptive text",
    "Best practice: fix link text in the source document, then re-export — Acrobat edits are fragile",
  ],
  form_accessibility: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Forms" → "Tagged form fields" and "Field descriptions"',
    "To add a label: open All tools → Prepare a form (classic UI: Tools → Prepare Form) → right-click the field → Properties → General tab → Tooltip field (this is the accessible label)",
    "The Tooltip (/TU attribute) is what screen readers announce — make it match the visible label",
    'For checkboxes/radios: Tooltip should describe the option (e.g., "Agree to terms")',
    "Verify: Tab through the form with a screen reader to confirm each field is announced correctly",
  ],
  reading_order: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run the checker: All tools → Prepare for accessibility → Check for accessibility (classic UI: Tools → Accessibility → Full Check) → look under "Document" → "Tab order" and "Logical Reading Order"',
    "Open the tool: All tools → Prepare for accessibility → Fix reading order (classic UI: Tools → Accessibility → Reading Order)",
    "The Reading Order tool shows numbered regions — verify the sequence matches how a human would read the page",
    "To reorder: drag items in the Tags panel, or use the Order panel (open it from the Reading Order dialog via Show Order Panel)",
    'Set tab order on all pages: open the Pages panel (View → Show/Hide → Side panels → Page; classic UI: Navigation Panes → Page Thumbnails) → select all pages → right-click → Page Properties → Tab Order → "Use Document Structure"',
  ],
};

export function appendSupplementaryFindings(
  qpdf: QpdfResult,
  pdfjs: PdfjsResult,
  categories: CategoryResult[],
): void {
  const findCat = (id: string) => categories.find((c) => c.id === id);

  const readingCatForLists = findCat("reading_order");
  if (readingCatForLists && qpdf.lists.length > 0) {
    const totalItems = qpdf.lists.reduce((sum, l) => sum + l.itemCount, 0);
    const wellFormed = qpdf.lists.filter((l) => l.isWellFormed).length;
    readingCatForLists.findings.push(`--- List Structure Analysis ---`);
    readingCatForLists.findings.push(
      `${qpdf.lists.length} list(s) detected with ${totalItems} total item(s)`,
    );
    for (let li = 0; li < qpdf.lists.length; li++) {
      const l = qpdf.lists[li];
      const label = qpdf.lists.length > 1 ? `List ${li + 1}` : "List";
      const parts: string[] = [
        `${l.itemCount} <LI>`,
        l.hasLabels ? "<Lbl> ✓" : "<Lbl> ✗",
        l.hasBodies ? "<LBody> ✓" : "<LBody> ✗",
      ];
      if (l.nestingDepth > 0) parts.push(`nested depth: ${l.nestingDepth}`);
      parts.push(l.isWellFormed ? "well-formed" : "incomplete structure");
      readingCatForLists.findings.push(`  ${label}: ${parts.join(" | ")}`);
    }
    if (wellFormed === qpdf.lists.length) {
      readingCatForLists.findings.push(`All lists are well-formed (each <LI> has an <LBody>)`);
      const withoutLabels = qpdf.lists.filter((l) => !l.hasLabels).length;
      if (withoutLabels > 0) {
        readingCatForLists.findings.push(
          `${withoutLabels} list(s) have no <Lbl> (bullet/number) elements — optional per ISO 32000 and not penalized, but adding <Lbl> helps screen readers announce each item's marker`,
        );
      }
    } else {
      const malformed = qpdf.lists.length - wellFormed;
      readingCatForLists.findings.push(
        `${malformed} list(s) have items missing <LBody> elements — screen readers may not announce list item content correctly`,
      );
      readingCatForLists.findings.push(
        "Fix: In Adobe Acrobat, expand each <L> tag in the Tags panel → ensure each <LI> contains an <LBody> (text content); <Lbl> (bullet/number) is recommended but optional",
      );
    }
  } else if (readingCatForLists && qpdf.lists.length === 0 && qpdf.hasStructTree) {
    readingCatForLists.findings.push(`--- List Structure Analysis ---`);
    readingCatForLists.findings.push(
      "No tagged lists detected — if the document contains bulleted or numbered lists, they may not be tagged as <L>/<LI> elements",
    );
  }

  // Footnote/endnote structure (v1.92.0 — Matterhorn 19). Advisory — not
  // scored: the WCAG mapping is weak, but PAC flags missing/duplicate Note
  // IDs constantly on footnoted Word exports, so the signal must not be
  // silent. IDs let assistive technology link a reference to its note.
  const noteCount = qpdf.noteCount ?? 0;
  if (readingCatForLists && noteCount > 0) {
    const missingId = qpdf.notesMissingId ?? 0;
    const dupIds = qpdf.noteDuplicateIdCount ?? 0;
    readingCatForLists.findings.push(`--- Footnotes & Endnotes (<Note>) ---`);
    readingCatForLists.findings.push(
      `${noteCount} <Note> tag(s) detected (footnotes, endnotes, or labeled notes)`,
    );
    if (missingId === 0 && dupIds === 0) {
      readingCatForLists.findings.push(
        "  All notes carry a unique /ID — assistive technology can link each reference to its note (Matterhorn 19-003/19-004)",
      );
    } else {
      if (missingId > 0) {
        readingCatForLists.findings.push(
          `  Advisory — not scored: ${missingId} note(s) have no /ID (Matterhorn 19-003). PDF/UA requires one so assistive technology can link the in-text reference to its note; Word footnote exports commonly omit it.`,
        );
      }
      if (dupIds > 0) {
        readingCatForLists.findings.push(
          `  Advisory — not scored: ${dupIds} note(s) reuse another note's /ID (Matterhorn 19-004) — IDs must be unique within the document.`,
        );
      }
      readingCatForLists.findings.push(
        "  Fix: In Adobe Acrobat's Tags panel, select each <Note> tag → Properties → set a unique ID (remediation tools and re-exporting from current Word versions also repair this).",
      );
    }
  }

  const textCat = findCat("text_extractability");
  if (textCat) {
    textCat.findings.push(`--- Document Structure Signals ---`);
    if (qpdf.hasMarkInfo) {
      if (qpdf.isMarkedContent) {
        textCat.findings.push(
          '  Document is marked as "Marked Content" (/MarkInfo /Marked true) — content is properly distinguished from artifacts',
        );
      } else {
        textCat.findings.push(
          "  MarkInfo present but /Marked is not true — the document may not properly distinguish content from artifacts",
        );
        textCat.findings.push(
          "  Fix: In Adobe Acrobat, run Check for accessibility (classic UI: Full Check), then use the Fix reading order tool to mark decorative elements as artifacts",
        );
      }
    } else if (qpdf.hasStructTree) {
      textCat.findings.push(
        "  No MarkInfo dictionary found — artifacts (headers, footers, page numbers, watermarks) may be read aloud by screen readers",
      );
      textCat.findings.push(
        '  Fix: In Adobe Acrobat, use All tools → Prepare for accessibility → Fix reading order (classic UI: Tools → Accessibility → Reading Order) → select decorative elements → click "Background/Artifact"',
      );
    }

    if (qpdf.paragraphCount > 0) {
      textCat.findings.push(
        `  ${qpdf.paragraphCount} paragraph tag(s) (/P) found — text is structurally organized`,
      );
    } else if (qpdf.hasStructTree) {
      textCat.findings.push(
        "  No paragraph tags (/P) found — body text may not be properly tagged for screen reader navigation",
      );
    }

    if (pdfjs.emptyPages.length > 0) {
      if (pdfjs.emptyPages.length <= 5) {
        textCat.findings.push(
          `  ${pdfjs.emptyPages.length} empty/near-empty page(s) detected: page(s) ${pdfjs.emptyPages.join(", ")}`,
        );
      } else {
        textCat.findings.push(
          `  ${pdfjs.emptyPages.length} empty/near-empty page(s) detected (first 5: pages ${pdfjs.emptyPages.slice(0, 5).join(", ")}...)`,
        );
      }
      textCat.findings.push(
        "  Empty pages may indicate scanned images without OCR, blank separator pages, or content stored only as images",
      );
    }
  }

  const readingCat = findCat("reading_order");
  if (readingCat) {
    readingCat.findings.push(`--- Additional Structure Signals ---`);
    if (qpdf.hasRoleMap) {
      readingCat.findings.push(
        `  Role mapping present — ${qpdf.roleMapEntries.length} custom tag(s) mapped to standard PDF roles`,
      );
      if (qpdf.roleMapEntries.length <= 10) {
        for (const entry of qpdf.roleMapEntries) {
          readingCat.findings.push(`  ${entry}`);
        }
      } else {
        for (const entry of qpdf.roleMapEntries.slice(0, 8)) {
          readingCat.findings.push(`  ${entry}`);
        }
        readingCat.findings.push(`  ... and ${qpdf.roleMapEntries.length - 8} more`);
      }
    } else if (qpdf.hasStructTree) {
      readingCat.findings.push(
        "  No role mapping (/RoleMap) found — all tags use standard PDF roles (this is normal for most documents)",
      );
    }

    // RoleMap validity (v1.92.0 — Matterhorn 02). All advisory — not scored:
    // each is machine-certain as a STRUCTURAL fact, but its user impact runs
    // through whatever content sits inside the affected tags, which the
    // scored categories already measure.
    const circular = qpdf.roleMapCircularTags ?? [];
    if (circular.length > 0) {
      readingCat.findings.push(
        `  Advisory — not scored: ${circular.length} role-map entr${circular.length === 1 ? "y is" : "ies are"} circular (${circular.slice(0, 6).join(", ")}${circular.length > 6 ? ", …" : ""}) — the chain never reaches a standard type, so assistive technology cannot resolve what these tags mean (Matterhorn 02-003). Fix the RoleMap so every custom tag ends on a standard structure type.`,
      );
    }
    const standardRemaps = qpdf.roleMapStandardRemaps ?? [];
    if (standardRemaps.length > 0) {
      readingCat.findings.push(
        `  Advisory — not scored: the RoleMap remaps ${standardRemaps.length} STANDARD structure type(s) (${standardRemaps.slice(0, 6).join("; ")}${standardRemaps.length > 6 ? "; …" : ""}) — PDF/UA prohibits remapping standard types (Matterhorn 02-004); viewers may honor either meaning.`,
      );
    }
    const unmapped = qpdf.roleMapUnmappedTags ?? [];
    if (unmapped.length > 0) {
      readingCat.findings.push(
        `  Advisory — not scored: ${unmapped.length} custom tag name(s) carry no mapping to a standard structure type (${unmapped.slice(0, 8).join(", ")}${unmapped.length > 8 ? ", …" : ""}) — assistive technology treats them as anonymous containers (Matterhorn 02-001). Map each to its closest standard type in the RoleMap.`,
      );
    }

    if (qpdf.totalPageCount > 0) {
      if (qpdf.tabOrderPages === qpdf.totalPageCount) {
        readingCat.findings.push(
          `  Tab order is set on all ${qpdf.totalPageCount} page(s) — keyboard navigation follows the structure tree`,
        );
      } else if (qpdf.tabOrderPages > 0) {
        readingCat.findings.push(
          `  Tab order set on ${qpdf.tabOrderPages} of ${qpdf.totalPageCount} page(s) — some pages may have inconsistent keyboard navigation`,
        );
        readingCat.findings.push(
          '  Fix: In Adobe Acrobat, go to each page\'s properties and set Tab Order to "Use Document Structure"',
        );
      } else if (qpdf.hasStructTree) {
        readingCat.findings.push(
          "  No tab order (/Tabs) set on any page — keyboard users may tab through elements in visual order instead of logical order",
        );
        readingCat.findings.push(
          '  Fix: In Adobe Acrobat, open the Pages panel (View → Show/Hide → Side panels → Page; classic UI: Navigation Panes → Page Thumbnails) → select all pages → right-click → Page Properties → Tab Order → "Use Document Structure"',
        );
      }
    }

    // Document behaviors (v1.92.0 censuses): JavaScript, multimedia, and
    // optional-content layers. Presence-only disclosures — none is scored,
    // and none prints when absent (most documents have none of the three).
    const media = qpdf.mediaAnnotationCounts;
    const mediaTotal = media ? media.screen + media.movie + media.sound + media.richMedia : 0;
    const jsSignals = (qpdf.jsActionCount ?? 0) + (qpdf.hasJsNameTree ? 1 : 0);
    const otherAnnots = qpdf.otherAnnotationCount ?? 0;
    const refXObjects = qpdf.refXObjectCount ?? 0;
    const embeddedFiles = qpdf.embeddedFileCount ?? 0;
    const sigFields = qpdf.signatureFieldCount ?? 0;
    if (
      mediaTotal > 0 ||
      jsSignals > 0 ||
      qpdf.hasOptionalContent ||
      otherAnnots > 0 ||
      refXObjects > 0 ||
      embeddedFiles > 0 ||
      sigFields > 0
    ) {
      readingCat.findings.push(`--- Document Behaviors ---`);
    }
    if (mediaTotal > 0 && media) {
      const kinds = [
        media.screen ? `${media.screen} Screen` : "",
        media.movie ? `${media.movie} Movie` : "",
        media.sound ? `${media.sound} Sound` : "",
        media.richMedia ? `${media.richMedia} RichMedia` : "",
      ]
        .filter(Boolean)
        .join(", ");
      readingCat.findings.push(
        `  ${mediaTotal} multimedia annotation(s) embedded (${kinds}) — whether the media carries captions or text alternatives requires manual review (WCAG 1.2.x; the conformance panel lists it as not assessed)`,
      );
    }
    if (jsSignals > 0) {
      readingCat.findings.push(
        `  JavaScript is present (${qpdf.jsActionCount ?? 0} action(s)${qpdf.hasJsNameTree ? " + a document-level script tree" : ""}) — whether scripted behavior stays keyboard- and AT-accessible requires manual review (Matterhorn 29)`,
      );
    }
    if (qpdf.hasOptionalContent) {
      const cfgCount = qpdf.ocgConfigCount ?? 0;
      const missingName = qpdf.ocgConfigsMissingName ?? 0;
      const withAS = qpdf.ocgConfigsWithAS ?? 0;
      readingCat.findings.push(
        `  Optional-content layers are present (${cfgCount} configuration(s))${missingName === 0 && withAS === 0 ? " — configurations are named and none auto-switch content (Matterhorn 20)" : ""}`,
      );
      if (missingName > 0) {
        readingCat.findings.push(
          `  Advisory — not scored: ${missingName} layer configuration(s) have no /Name (Matterhorn 20-001) — assistive technology cannot announce which view of the content is active.`,
        );
      }
      if (withAS > 0) {
        readingCat.findings.push(
          `  Advisory — not scored: ${withAS} layer configuration(s) carry an /AS auto-state (Matterhorn 20-002) — content can appear or disappear with zoom or print without the reader acting, which assistive technology cannot follow.`,
        );
      }
    }

    // v1.94.0 censuses — annotations beyond links/widgets, reference
    // XObjects, attachments, and signature fields. All advisory.
    if (otherAnnots > 0) {
      const subtypeCounts = qpdf.otherAnnotationSubtypeCounts ?? {};
      const kinds = Object.entries(subtypeCounts)
        .map(([k, n]) => (n > 1 ? `${k} ×${n}` : k))
        .join(", ");
      readingCat.findings.push(
        `  ${otherAnnots} annotation(s) beyond links and form fields (${kinds}) — comments, markup, and stamps are content too`,
      );
      const untaggedOther = qpdf.untaggedOtherAnnotationCount ?? 0;
      if (untaggedOther > 0) {
        readingCat.findings.push(
          `  Advisory — not scored: ${untaggedOther} of them are not referenced from the tag structure (Matterhorn 28) — assistive technology following the tags will not encounter them.`,
        );
      }
      const missingContents = qpdf.otherAnnotationsMissingContents ?? 0;
      if (missingContents > 0) {
        readingCat.findings.push(
          `  Advisory — not scored: ${missingContents} of them carry no /Contents description (PDF/UA 7.18.2) — a screen reader announces the annotation type with nothing to say about it.`,
        );
      }
    }
    if (refXObjects > 0) {
      readingCat.findings.push(
        `  Advisory — not scored: the document uses ${refXObjects} reference XObject(s), which import content from another document — PDF/UA prohibits them outright (Matterhorn 30-001) because the imported content's structure is unreachable. Flatten or re-export the affected pages.`,
      );
    }
    if (embeddedFiles > 0) {
      const missingDesc = qpdf.embeddedFilesMissingDesc ?? 0;
      readingCat.findings.push(
        `  ${embeddedFiles} embedded file attachment(s) present${missingDesc === 0 ? " — each carries a description (Matterhorn 21)" : ""}`,
      );
      if (missingDesc > 0) {
        readingCat.findings.push(
          `  Advisory — not scored: ${missingDesc} attachment(s) have no description (/Desc — Matterhorn 21), so assistive technology can only announce a bare filename. In Acrobat's Attachments panel, add a description to each.`,
        );
      }
    }
    if (sigFields > 0) {
      readingCat.findings.push(
        `  ${sigFields} digital-signature field(s) present (Matterhorn 23) — verify their labels and position in the reading order; whether a signature workflow is accessible end-to-end is a human judgment.`,
      );
    }
  }

  if (textCat) {
    // PDF/UA identifier and artifact tagging are sourced primarily from pdfjs
    // (XMP + content stream); qpdf's struct-tree-only signals are kept as a
    // fallback but are almost always empty in practice.
    const hasPdfUa = (pdfjs.hasPdfUaIdentifier ?? false) || qpdf.hasPdfUaIdentifier;
    const pdfUaPart = pdfjs.pdfUaPart ?? qpdf.pdfUaPart;
    textCat.findings.push(`--- PDF/UA Compliance ---`);
    if (hasPdfUa) {
      textCat.findings.push(
        `  Document declares PDF/UA conformance${pdfUaPart ? ` (PDF/UA-${pdfUaPart})` : ""}`,
      );
      textCat.findings.push(
        "  PDF/UA (ISO 14289) is the accessibility standard for PDF — this document claims to meet it",
      );
    } else {
      textCat.findings.push(
        "  No PDF/UA identifier found — the document does not claim PDF/UA (ISO 14289) conformance",
      );
      textCat.findings.push(
        "  Note: PDF/UA conformance is not required for WCAG compliance, but indicates the PDF was created with accessibility in mind",
      );
    }
  }

  if (textCat && qpdf.hasStructTree) {
    const artifactCount = qpdf.artifactCount + (pdfjs.artifactRunCount ?? 0);
    textCat.findings.push(`--- Artifact Tagging ---`);
    if (artifactCount > 0) {
      textCat.findings.push(
        `  ${artifactCount} element(s) tagged as artifacts — decorative content (headers, footers, watermarks) is distinguished from real content`,
      );
    } else {
      textCat.findings.push(
        "  No artifact tags found — headers, footers, page numbers, and watermarks may be read aloud by screen readers as if they were document content",
      );
      textCat.findings.push(
        "  Note: If this document has repeating headers/footers, they should be tagged as artifacts in Adobe Acrobat's Reading Order tool",
      );
    }
  }

  if (readingCat && qpdf.hasStructTree) {
    const total = qpdf.actualTextCount + qpdf.expansionTextCount;
    if (total > 0) {
      readingCat.findings.push(`--- Screen Reader Text Overrides ---`);
      if (qpdf.actualTextCount > 0) {
        readingCat.findings.push(
          `  ${qpdf.actualTextCount} element(s) have /ActualText — provides a screen reader override for complex glyphs, ligatures, or symbols`,
        );
      }
      if (qpdf.expansionTextCount > 0) {
        readingCat.findings.push(
          `  ${qpdf.expansionTextCount} element(s) have /E (expansion text) — provides full-form text for abbreviations (e.g., "IL" → "Illinois")`,
        );
      }
      readingCat.findings.push(
        "  These attributes help screen readers pronounce content correctly",
      );
    }
  }

  const langCat = findCat("title_language");
  if (langCat && qpdf.langSpans.length > 0) {
    langCat.findings.push(`--- Language Span Analysis ---`);
    const langCounts = new Map<string, number>();
    for (const span of qpdf.langSpans) {
      langCounts.set(span.lang, (langCounts.get(span.lang) || 0) + 1);
    }
    const docLang = qpdf.lang || "";
    const foreignSpans = [...langCounts.entries()].filter(
      ([lang]) => lang.toLowerCase() !== docLang.toLowerCase(),
    );
    if (foreignSpans.length > 0) {
      langCat.findings.push(
        `  ${qpdf.langSpans.length} element(s) have explicit language declarations:`,
      );
      for (const [lang, count] of foreignSpans) {
        langCat.findings.push(`  ${lang}: ${count} element(s)`);
      }
      langCat.findings.push(
        "  Language spans help screen readers switch pronunciation rules for foreign-language content",
      );
    } else {
      langCat.findings.push(
        `  ${qpdf.langSpans.length} element(s) have language declarations matching the document language`,
      );
    }
  }

  for (const cat of categories) {
    const guide = acrobatGuide[cat.id];
    if (!guide) continue;
    // Only attach the step-by-step Acrobat remediation guide to categories that
    // actually have something to fix. A perfect (100) or N/A category does not
    // need a "How to Fix" section — it is just noise to sift through.
    if (cat.score === null || cat.score === 100) continue;
    cat.findings.push(...guide);

    // Per-document additions. The web action plan renders THIS block as the
    // "Fix the PDF in Acrobat" route (it beats the dictionary default), so a
    // finding that changes the right Acrobat move has to change it here.
    if (cat.id === "alt_text" && (pdfjs.textBearingFigures ?? []).some((f) => !f.hasAlt)) {
      cat.findings.push(
        'Figures that are really text boxes (listed above under "Figures That Contain Text"): do not describe them — open the Tags panel → right-click the <Figure> tag → Properties → Type → "Section", so the text inside is read directly instead of being hidden behind a description',
      );
    }
    if (
      cat.id === "link_quality" &&
      qpdf.hasStructTree &&
      (pdfjs.untaggedLinkAnnotationCount ?? 0) > 0
    ) {
      cat.findings.push(
        'Untagged links (listed above under "Links Not Tagged"): open the Tags panel → Options menu (⋮) → Find → choose "Unmarked Links" → Find → Tag Element; repeat until no unmarked links remain',
      );
    }
  }
}
