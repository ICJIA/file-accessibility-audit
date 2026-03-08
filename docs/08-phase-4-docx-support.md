# 08 — Phase 4: DOCX Accessibility Support

**Project:** `file-accessibility-audit`
**Phase:** 4 of 4
**Depends on:** Phase 1 complete (Phases 2–3 are independent)
**Goal:** Extend the accessibility grader to analyze `.docx` (Word) files using direct XML parsing of the OOXML format.

---

## Background

DOCX files are ZIP archives containing XML files that follow the Office Open XML (OOXML) specification. Unlike PDF analysis (which requires QPDF for structure extraction and PDF.js for content parsing), DOCX analysis can be done entirely in JavaScript by unzipping the archive and parsing the XML directly.

This phase was originally part of Phase 2 (doc 02) but has been extracted into its own phase to allow independent scheduling and focused implementation.

---

## Architecture

### Extraction Approach: `jszip` + XML Parsing

The recommended approach uses `jszip` to unzip the DOCX archive and direct XML parsing (via a lightweight parser like `fast-xml-parser`) to extract accessibility-relevant structure from the OOXML files.

**Why not `mammoth`?** While mammoth converts DOCX to HTML (making heading/image extraction easy), it discards structural metadata that matters for accessibility scoring — document properties, table header markup, language settings, and reading order. Direct XML parsing gives full access to the OOXML structure.

### Key OOXML Files

| File in ZIP | Contains |
|-------------|----------|
| `word/document.xml` | Body content: paragraphs, headings, tables, images, links |
| `word/styles.xml` | Style definitions — maps `pStyle` IDs to heading levels (Heading1–6) |
| `docProps/core.xml` | Dublin Core metadata: `dc:title`, `dc:language`, `dc:creator` |
| `docProps/app.xml` | Application metadata (page count, word count) |
| `word/_rels/document.xml.rels` | Relationships — maps `rId` references to image files and hyperlink targets |
| `[Content_Types].xml` | MIME type registry — used for file type validation |

---

## Deliverables

### 1. New Service: `docxService.ts`

Location: `apps/api/src/services/docxService.ts`

**Dependencies to add:**
- `jszip` — unzip DOCX archive
- `fast-xml-parser` — parse XML to JS objects

**Exports:**

```typescript
interface DocxAnalysis {
  metadata: {
    title: string | null
    language: string | null
    creator: string | null
    pageCount: number | null
  }
  headings: Array<{ level: number; text: string }>
  images: Array<{ altText: string | null; filename: string }>
  tables: Array<{ headerRow: boolean; rowCount: number; colCount: number }>
  links: Array<{ text: string; url: string }>
  paragraphCount: number
  hasStructuredContent: boolean
}

export async function analyzeDocx(buffer: Buffer): Promise<DocxAnalysis>
```

**Implementation steps:**

1. Open buffer with `jszip`
2. Validate: check `[Content_Types].xml` exists and contains `word/document.xml` content type
3. Parse `docProps/core.xml` → extract `dc:title`, `dc:language`
4. Parse `word/styles.xml` → build a map of style ID → heading level
5. Parse `word/document.xml`:
   - Walk `<w:p>` (paragraph) elements
   - Check `<w:pPr><w:pStyle>` against the heading style map → extract headings with levels
   - Find `<w:drawing>` and `<wp:inline>` elements → extract `descr` attribute (alt text) from `<wp:docPr>`
   - Find `<w:tbl>` elements → check first row for `<w:tblHeader>` or bold/style patterns indicating header rows
   - Find `<w:hyperlink>` elements → extract display text and resolve `r:id` via relationships
6. Return structured `DocxAnalysis` object

### 2. DOCX Scorer Integration

Location: `apps/api/src/services/scorer.ts`

Map the existing 9-category scoring model to DOCX:

| # | Category | PDF Source | DOCX Source | DOCX Applicable? |
|---|----------|-----------|-------------|-------------------|
| 1 | Document Title & Language | QPDF metadata | `docProps/core.xml` (`dc:title`, `dc:language`) | **Yes** |
| 2 | Heading Structure | QPDF StructTree H tags | `word/document.xml` heading styles | **Yes** |
| 3 | Alt Text on Images | QPDF Figure tags | `<wp:docPr descr="">` | **Yes** |
| 4 | Reading Order | QPDF StructTree presence | N/A — Word handles reading order implicitly | **No → N/A** |
| 5 | Text Extractability | PDF.js text content | Always extractable in DOCX | **Auto-pass (A)** |
| 6 | Table Structure | QPDF Table/TH/TD tags | `<w:tbl>` with `<w:tblHeader>` | **Yes** |
| 7 | Link Text Quality | PDF.js link annotations | `<w:hyperlink>` display text | **Yes** |
| 8 | Form Accessibility | QPDF form fields | N/A — Word forms are rare and structurally different | **No → N/A** |
| 9 | Color Contrast | Heuristic estimate | N/A — requires rendering engine | **No → N/A** |

**Scoring adjustments for DOCX:**
- Categories marked N/A are excluded from the weighted average
- Text Extractability auto-passes (DOCX is always text-based)
- Remaining categories (1, 2, 3, 6, 7) use the same scoring rubrics as PDF
- The weighted average is recalculated using only applicable category weights, normalized to 100%

### 3. Upload Middleware Changes

Location: `apps/api/src/middleware/uploadMiddleware.ts`

- Accept `.docx` MIME type: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- File type validation: check magic bytes — DOCX starts with ZIP signature `PK\x03\x04`, then verify `[Content_Types].xml` exists inside the archive
- Reject renamed non-DOCX files (e.g., a `.xlsx` renamed to `.docx`) by checking content types

### 4. API Route Changes

Location: `apps/api/src/routes/analyze.ts`

- Detect file type from magic bytes (not extension)
- Route to `analyzeDocx()` or existing PDF pipeline based on detected type
- Add `fileType: "pdf" | "docx"` to the API response
- DOCX files skip the QPDF and PDF.js pipelines entirely

### 5. Frontend Changes

**DropZone** (`apps/web/app/components/DropZone.vue`):
- Accept `.docx` files in addition to `.pdf`
- Update drag-over text and file picker filter
- Display accepted file types: "PDF or DOCX"

**ScoreCard** (`apps/web/app/components/ScoreCard.vue`):
- Display file type badge ("PDF" or "DOCX") in results header
- Handle N/A categories in the category scores table (show "N/A" instead of a score bar)
- Executive summary text should reference "document" instead of "PDF" when file type is DOCX

**Shared Reports** (`apps/web/app/pages/report/[id].vue`):
- Same N/A handling as ScoreCard
- File type badge in report header

### 6. CLI Changes

Location: `apps/cli/src/index.ts`

- Accept `.docx` files as input
- Route to DOCX analysis pipeline
- Display file type in CLI output header

---

## File Type Validation

Both PDF and DOCX validation should use magic bytes, not file extensions:

| Format | Magic Bytes | Additional Check |
|--------|-------------|-----------------|
| PDF | `%PDF-` (first 5 bytes) | Already implemented |
| DOCX | `PK\x03\x04` (ZIP signature) | Must contain `[Content_Types].xml` with WordprocessingML content type |

Reject files that don't match either signature with a clear error message suggesting the user verify the file type.

---

## Testing Checklist

### Unit Tests
- [ ] `docxService.ts`: valid DOCX returns correct headings, images, tables, links, metadata
- [ ] `docxService.ts`: DOCX with no headings returns empty heading array
- [ ] `docxService.ts`: DOCX with images missing alt text returns `altText: null`
- [ ] `docxService.ts`: DOCX with tables — header row detection works
- [ ] `docxService.ts`: DOCX with hyperlinks — display text and URL extracted
- [ ] `docxService.ts`: metadata extraction — title, language, page count
- [ ] Scorer: DOCX categories scored correctly; N/A categories excluded from weighted average
- [ ] Scorer: DOCX Text Extractability auto-passes with grade A
- [ ] Scorer: weighted average recalculated correctly with fewer applicable categories
- [ ] Upload middleware: `.docx` file accepted
- [ ] Upload middleware: renamed `.xlsx` with `.docx` extension rejected
- [ ] Upload middleware: non-ZIP file with `.docx` extension rejected

### Integration Tests
- [ ] `POST /api/analyze` with valid DOCX returns scored report with `fileType: "docx"`
- [ ] `POST /api/analyze` with invalid DOCX returns appropriate error
- [ ] API response includes N/A categories with correct markers
- [ ] Audit log records `analyze` event with DOCX file type
- [ ] Shared report creation works for DOCX reports

### Frontend Tests
- [ ] DropZone accepts `.docx` files via drag-and-drop
- [ ] DropZone accepts `.docx` files via file picker
- [ ] ScoreCard displays "DOCX" file type badge
- [ ] ScoreCard shows "N/A" for inapplicable categories
- [ ] Shared report renders DOCX results correctly

### CLI Tests
- [ ] CLI accepts `.docx` file path and outputs report
- [ ] CLI displays file type in output header

---

## Implementation Order

1. **`docxService.ts`** — core extraction logic with unit tests
2. **Scorer integration** — category mapping and N/A handling
3. **Upload middleware** — file type detection and validation
4. **API route** — routing by file type, response format
5. **Frontend** — DropZone, ScoreCard, and shared report updates
6. **CLI** — DOCX support in command-line tool
7. **Documentation** — update README and user-facing docs

---

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `jszip` | Unzip DOCX archive | ~45KB minified |
| `fast-xml-parser` | Parse OOXML files to JS objects | ~50KB minified |

Both are well-maintained, widely used, and have no native dependencies — they work in any Node.js environment without additional system packages (unlike QPDF which requires a system binary).

---

## Exit Criteria

Phase 4 is complete when:

1. Users can upload and score `.docx` files alongside PDFs
2. DOCX reports correctly identify heading structure, alt text, table markup, link quality, and metadata issues
3. Categories that don't apply to DOCX (Reading Order, Form Accessibility, Color Contrast) display as N/A and are excluded from the weighted average
4. The CLI tool accepts and analyzes DOCX files
5. Shared reports render DOCX results correctly
6. File type validation rejects non-DOCX files regardless of extension

---

*End of Phase 4 — v1.0*
