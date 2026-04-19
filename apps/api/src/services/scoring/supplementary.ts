import type { QpdfResult } from "../qpdfService.js";
import type { PdfjsResult } from "../pdfjsService.js";
import type { CategoryResult } from "../scorer.js";

// Adobe Acrobat Full Check rule names and step-by-step fix paths per category.
// Appended to failing categories so users have a concrete remediation path.
const acrobatGuide: Record<string, string[]> = {
  text_extractability: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Document" → "Tagged PDF"',
    'If Tagged PDF fails: File → Properties → ensure "Tagged PDF: Yes" in Description tab',
    "If text is unreadable (scanned): Recognize Text → In This File (runs OCR)",
    "Then: Accessibility → Reading Order tool → verify content tags are correct",
    'Check font embedding: File → Properties → Fonts tab — all fonts should say "(Embedded)" or "(Embedded Subset)"',
    "To fix non-embedded fonts: re-export from the source application with font embedding enabled, or use Preflight → Fix → Embed missing fonts",
    "Menu path: Acrobat Pro → All tools → Prepare for accessibility",
  ],
  title_language: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Document" → "Title" and "Primary Language"',
    "Set title: File → Properties → Description tab → Title field (enter a meaningful document title)",
    'Set title display: File → Properties → Initial View tab → Window Options → Show → "Document Title"',
    "Set language: File → Properties → Advanced tab → Reading Options → Language dropdown",
    'Common languages: English = "English", Spanish = "Spanish", French = "French"',
  ],
  heading_structure: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Page Content" → "Tagged Content" and "Document" → "Logical Reading Order"',
    "Open the Tags panel: View → Show/Hide → Navigation Panes → Tags",
    "To tag a heading: select text with Reading Order tool → click H1, H2, H3, etc.",
    "To fix heading level: right-click the tag in Tags panel → Properties → Type → select correct heading level (H1–H6)",
    "Multiple H1s: keep only the document title as H1 — right-click each extra H1 tag → Properties → change Type to H2 (or appropriate level)",
    "Correct hierarchy: H1 (document title) → H2 (sections) → H3 (subsections) — don't skip levels",
  ],
  alt_text: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Alternate Text" → "Figures alternate text"',
    "To add alt text: open Tags panel → find the <Figure> tag → right-click → Properties → Alternate Text field",
    "Or: Accessibility → Reading Order tool → right-click an image → Edit Alternate Text",
    'Good alt text: describes the purpose/content ("Bar chart showing 2024 crime rates"), not appearance ("colorful chart")',
    'Decorative images: right-click the tag → Properties → check "Artifact" (removes from reading order)',
  ],
  bookmarks: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Document" → "Bookmarks"',
    "Auto-generate from headings: All tools → Edit a PDF → More → Add Bookmarks (from structure)",
    "Or manually: navigate to each section → Ctrl/Cmd+B → name the bookmark",
    "Organize: drag bookmarks in the Bookmarks panel to create parent/child nesting",
    "Verify: open Bookmarks panel (View → Show/Hide → Navigation Panes → Bookmarks)",
  ],
  table_markup: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Tables" → "Rows", "TH and TD", "Headers"',
    "Open Tags panel and expand the <Table> tag to see structure",
    'To add header cells: right-click a <TD> tag → Properties → Type → change to "Table Header Cell (TH)"',
    'To set scope: right-click <TH> → Properties → Attributes tab → add Scope attribute → "Column" or "Row"',
    "To fix row structure: ensure each row is wrapped in a <TR> tag with <TH>/<TD> children",
    "Table editor shortcut: right-click a table in the document → Table Editor (Acrobat Pro)",
  ],
  link_quality: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Alternate Text" → "Other elements alternate text"',
    "To fix link text: open Tags panel → find the <Link> tag → expand to see the text",
    "If link text is a raw URL: edit the visible text in the source document (Word, InDesign) before re-exporting to PDF",
    "In Acrobat: Edit PDF tool → select the link text → retype with descriptive text",
    "Best practice: fix link text in the source document, then re-export — Acrobat edits are fragile",
  ],
  form_fields: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Forms" → "Tagged form fields" and "Field descriptions"',
    "To add a label: right-click the form field → Properties → General tab → Tooltip field (this is the accessible label)",
    "The Tooltip (/TU attribute) is what screen readers announce — make it match the visible label",
    'For checkboxes/radios: Tooltip should describe the option (e.g., "Agree to terms")',
    "Verify: Tab through the form with a screen reader to confirm each field is announced correctly",
  ],
  reading_order: [
    "--- Adobe Acrobat: How to Fix ---",
    'Run: Accessibility → Full Check → look under "Document" → "Tab order" and "Logical Reading Order"',
    "Open Reading Order tool: Accessibility → Reading Order (or All tools → Prepare for accessibility → Reading Order)",
    "The Reading Order tool shows numbered regions — verify the sequence matches how a human would read the page",
    "To reorder: drag items in the Tags panel, or use the Order panel (View → Show/Hide → Navigation Panes → Order)",
    'Set tab order on all pages: select all pages in Pages panel → right-click → Page Properties → Tab Order → "Use Document Structure"',
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
      readingCatForLists.findings.push(
        `All lists are well-formed (each <LI> has <Lbl> and <LBody>)`,
      );
    } else {
      const malformed = qpdf.lists.length - wellFormed;
      readingCatForLists.findings.push(
        `${malformed} list(s) are missing <Lbl> or <LBody> elements — screen readers may not announce list items correctly`,
      );
      readingCatForLists.findings.push(
        "Fix: In Adobe Acrobat, expand each <L> tag in the Tags panel → ensure each <LI> contains both <Lbl> (bullet/number) and <LBody> (text content)",
      );
    }
  } else if (
    readingCatForLists &&
    qpdf.lists.length === 0 &&
    qpdf.hasStructTree
  ) {
    readingCatForLists.findings.push(`--- List Structure Analysis ---`);
    readingCatForLists.findings.push(
      "No tagged lists detected — if the document contains bulleted or numbered lists, they may not be tagged as <L>/<LI> elements",
    );
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
          "  Fix: In Adobe Acrobat, run Accessibility → Full Check, then use the Reading Order tool to mark decorative elements as artifacts",
        );
      }
    } else if (qpdf.hasStructTree) {
      textCat.findings.push(
        "  No MarkInfo dictionary found — artifacts (headers, footers, page numbers, watermarks) may be read aloud by screen readers",
      );
      textCat.findings.push(
        '  Fix: In Adobe Acrobat, use Accessibility → Reading Order tool → select decorative elements → click "Background/Artifact"',
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
        readingCat.findings.push(
          `  ... and ${qpdf.roleMapEntries.length - 8} more`,
        );
      }
    } else if (qpdf.hasStructTree) {
      readingCat.findings.push(
        "  No role mapping (/RoleMap) found — all tags use standard PDF roles (this is normal for most documents)",
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
          '  Fix: In Adobe Acrobat, select all pages → right-click → Page Properties → Tab Order → "Use Document Structure"',
        );
      }
    }
  }

  if (textCat) {
    textCat.findings.push(`--- PDF/UA Compliance ---`);
    if (qpdf.hasPdfUaIdentifier) {
      textCat.findings.push(
        `  Document declares PDF/UA conformance${qpdf.pdfUaPart ? ` (PDF/UA-${qpdf.pdfUaPart})` : ""}`,
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
    textCat.findings.push(`--- Artifact Tagging ---`);
    if (qpdf.artifactCount > 0) {
      textCat.findings.push(
        `  ${qpdf.artifactCount} element(s) tagged as artifacts — decorative content (headers, footers, watermarks) is distinguished from real content`,
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
    if (cat.score === null || cat.severity === "Pass") continue;
    cat.findings.push(...guide);
  }
}
