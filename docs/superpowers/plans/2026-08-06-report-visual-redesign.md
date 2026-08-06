# Report Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Visual (default) / Detailed view toggle to both report surfaces; the Visual view presents the exact same data as an infographic-style layout — grade hero, severity tiles, verdict strip, numbered action-plan rail with plain-language fix routes, category bars, and a single "Full technical report" expander.

**Architecture:** Web-app only (`apps/web`) — no analyzer/API/DB changes. A pure mapper (`utils/actionPlan.ts`) turns stored `categories[]` into ordered plan steps using a dictionary keyed by the 13 known category ids. New presentational components compose into `ReportVisualView.vue`; both pages render it or today's untouched component stack behind a persisted toggle. `buildHtml` (SSR export fallback) mirrors the Visual order.

**Tech Stack:** Nuxt 4 / Vue 3 `<script setup>`, Tailwind classes + CSS vars (`--surface-card`, `--border`, …), vitest + @vue/test-utils (`apps/web/app/__tests__/`, every component test starts with `import "./test-helpers"`), pnpm workspaces.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-report-visual-redesign-design.md`. **Data parity between views is a hard requirement.**
- Branch: create `feat/report-visual-redesign` off `main` before Task 1; all commits land there.
- Detailed view = today's components **unchanged**: do not edit `ScoreCard.vue`, `IssuesSummary.vue`, `ReportActionBanner.vue` (except zero-diff moves inside page templates).
- Do not touch `packages/analyzer`, `packages/shared`, `apps/api`, `apps/cli`.
- Commit messages: descriptive only — **never add any Co-Authored-By / AI attribution trailer** (user rule).
- Never pipe `pnpm build` through `tail`/`grep`; run it bare and gate on its exit code (project rule).
- Colors come from `gradeColor` / `severityColor` (`@file-audit/shared`) and CSS vars — no new hex palettes.
- Severity/status information must never be color-alone: always icon + text label.
- Test command form used throughout: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/<file>.test.ts`
- localStorage key: `far:report-view`; values exactly `"visual" | "detailed"`; default `visual`.
- Template markers (pages): `<!-- VISUAL VIEW -->` and `<!-- DETAILED VIEW -->` — the section-order test slices on these exact strings.

**The 13 category ids** (union of all four scorers, matches `WCAG_CATEGORY_MAP` in `packages/shared/src/scoring.ts`):
`text_extractability, title_language, heading_structure, alt_text, color_contrast, bookmarks, table_markup, link_quality, form_accessibility, reading_order, list_structure, slide_titles, sheet_names`

---

### Task 1: `utils/actionPlan.ts` — mapper, dictionary, verdictPhrase

**Files:**
- Create: `apps/web/app/utils/actionPlan.ts`
- Test: `apps/web/app/__tests__/actionPlan.test.ts`

**Interfaces:**
- Consumes: `partitionCardFindings`, `firstActionableFinding` from `~/utils/findings`; `tallySeverity` from `~/utils/severityTally`; `WCAG_CATEGORY_MAP` from `@file-audit/shared`.
- Produces (used by Tasks 3, 4, 7, 9):
  ```ts
  export type PlanSeverity = "Critical" | "Moderate" | "Minor";
  export interface FixRoute { tool: "source" | "acrobat"; label: string; steps: string[] }
  export interface PlanStep {
    rank: number; categoryId: string; title: string; why: string;
    severity: PlanSeverity; wcagRefs: { sc: string; name: string }[];
    routes: FixRoute[]; detailAnchor: string;
  }
  export function verdictPhrase(categories: Array<{ severity?: string | null }> | null | undefined): string
  export function buildActionPlan(categories: unknown, fileType?: string | null): PlanStep[]
  ```

- [ ] **Step 1: Create branch**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git checkout -b feat/report-visual-redesign
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/__tests__/actionPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildActionPlan, verdictPhrase, PLAN_COPY } from "../utils/actionPlan";

const cat = (id: string, label: string, severity: string | null, findings: string[] = []) => ({
  id,
  label,
  severity,
  findings,
});

// The full id inventory — union of pdf/docx/pptx/xlsx scorers. If the analyzer
// gains a category, this list (and PLAN_COPY) must grow with it.
const ALL_IDS = [
  "text_extractability",
  "title_language",
  "heading_structure",
  "alt_text",
  "color_contrast",
  "bookmarks",
  "table_markup",
  "link_quality",
  "form_accessibility",
  "reading_order",
  "list_structure",
  "slide_titles",
  "sheet_names",
];

describe("PLAN_COPY dictionary", () => {
  it.each(ALL_IDS)("has a plain-language entry for %s", (id) => {
    const entry = PLAN_COPY[id];
    expect(entry).toBeDefined();
    expect(entry!.title.length).toBeGreaterThan(10);
    expect(entry!.why.length).toBeGreaterThan(20);
    // Plain language: titles are imperative sentences, not jargon labels.
    expect(entry!.title).not.toMatch(/WCAG|ISO|14289/);
  });
});

describe("buildActionPlan", () => {
  it("orders steps Critical → Moderate → Minor with 1-based ranks", () => {
    const steps = buildActionPlan(
      [
        cat("bookmarks", "Bookmarks / Navigation", "Minor"),
        cat("title_language", "Document Title & Language", "Moderate"),
        cat("text_extractability", "Text Extractability", "Critical"),
        cat("alt_text", "Alt Text on Images", "Pass"),
        cat("color_contrast", "Color Contrast", null),
      ],
      "pdf",
    );
    expect(steps.map((s) => s.categoryId)).toEqual([
      "text_extractability",
      "title_language",
      "bookmarks",
    ]);
    expect(steps.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(steps[0]!.detailAnchor).toBe("#cat-text_extractability");
  });

  it("keeps analyzer emission order for equal severities (stable sort)", () => {
    const steps = buildActionPlan(
      [
        cat("title_language", "Document Title & Language", "Moderate"),
        cat("heading_structure", "Heading Structure", "Moderate"),
      ],
      "pdf",
    );
    expect(steps.map((s) => s.categoryId)).toEqual(["title_language", "heading_structure"]);
  });

  it("gives PDFs two routes (source first, then Acrobat)", () => {
    const steps = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf");
    expect(steps[0]!.routes.map((r) => r.tool)).toEqual(["source", "acrobat"]);
    expect(steps[0]!.routes[0]!.steps.length).toBeGreaterThan(0);
    expect(steps[0]!.routes[1]!.steps.length).toBeGreaterThan(0);
  });

  it("gives OOXML files a single source route (the upload IS the source)", () => {
    const docx = buildActionPlan([cat("heading_structure", "Heading Structure", "Critical")], "docx");
    expect(docx[0]!.routes.map((r) => r.tool)).toEqual(["source"]);
    const pptx = buildActionPlan([cat("slide_titles", "Slide Titles", "Moderate")], "pptx");
    expect(pptx[0]!.routes.map((r) => r.tool)).toEqual(["source"]);
    const xlsx = buildActionPlan([cat("sheet_names", "Sheet Names", "Minor")], "xlsx");
    expect(xlsx[0]!.routes.map((r) => r.tool)).toEqual(["source"]);
  });

  it("prefers the report's own '--- Adobe Acrobat: How to Fix ---' steps over the dictionary", () => {
    const steps = buildActionPlan(
      [
        cat("table_markup", "Table Markup", "Moderate", [
          "2 tables lack header rows",
          "--- Adobe Acrobat: How to Fix ---",
          "Open the Tags panel",
          "Mark the first row cells as <TH>",
        ]),
      ],
      "pdf",
    );
    const acrobat = steps[0]!.routes.find((r) => r.tool === "acrobat")!;
    expect(acrobat.steps).toEqual(["Open the Tags panel", "Mark the first row cells as <TH>"]);
  });

  it("missing fileType is treated as pdf (old stored reports)", () => {
    const steps = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], undefined);
    expect(steps[0]!.routes.map((r) => r.tool)).toEqual(["source", "acrobat"]);
  });

  it("unknown category id falls back to label + first actionable finding — never blank", () => {
    const steps = buildActionPlan(
      [cat("future_check", "Future Check", "Critical", ["Tip: skip", "3 widgets are broken"])],
      "pdf",
    );
    expect(steps[0]!.title).toBe("Fix: Future Check");
    expect(steps[0]!.why).toBe("3 widgets are broken");
    expect(steps[0]!.routes.length).toBeGreaterThan(0);
    expect(steps[0]!.wcagRefs).toEqual([]);
  });

  it("attaches WCAG refs from WCAG_CATEGORY_MAP", () => {
    const steps = buildActionPlan([cat("alt_text", "Alt Text on Images", "Critical")], "pdf");
    expect(steps[0]!.wcagRefs).toEqual([{ sc: "1.1.1", name: "Non-text Content" }]);
  });

  it("survives malformed input (forged stored reports)", () => {
    expect(buildActionPlan(null, "pdf")).toEqual([]);
    expect(buildActionPlan("junk" as unknown, "pdf")).toEqual([]);
    expect(
      buildActionPlan([{ id: "x", label: "X", severity: "Critical", findings: "junk" }], "pdf")[0]!
        .title,
    ).toBe("Fix: X");
  });
});

describe("verdictPhrase", () => {
  it("critical present → not ready to publish", () => {
    expect(verdictPhrase([cat("a", "A", "Critical"), cat("b", "B", "Minor")])).toBe(
      "not ready to publish",
    );
  });
  it("moderate only → fix recommended before publishing", () => {
    expect(verdictPhrase([cat("a", "A", "Moderate")])).toBe("fix recommended before publishing");
  });
  it("minor only / clean → ready to publish", () => {
    expect(verdictPhrase([cat("a", "A", "Minor")])).toBe("ready to publish");
    expect(verdictPhrase([cat("a", "A", "Pass")])).toBe("ready to publish");
    expect(verdictPhrase([])).toBe("ready to publish");
    expect(verdictPhrase(null)).toBe("ready to publish");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/actionPlan.test.ts`
Expected: FAIL — cannot resolve `../utils/actionPlan`.

- [ ] **Step 4: Write the implementation**

Create `apps/web/app/utils/actionPlan.ts`:

```ts
/**
 * Action Plan mapper — the heart of the Visual report view.
 *
 * Turns the stored `categories[]` of any report (including reports shared
 * years ago — they all carry id/label/severity/findings) into an ordered,
 * plain-language to-do list for non-technical document authors. Wording
 * lives here, in the web app, so old stored reports get the new UI with no
 * analyzer/API change (spec: 2026-08-06-report-visual-redesign-design.md).
 */
import { WCAG_CATEGORY_MAP } from "@file-audit/shared";
import { firstActionableFinding, partitionCardFindings } from "~/utils/findings";
import { tallySeverity } from "~/utils/severityTally";

export type PlanSeverity = "Critical" | "Moderate" | "Minor";
export type PlanFileType = "pdf" | "docx" | "pptx" | "xlsx";

export interface FixRoute {
  /** "source" = fix the original document (Word/PowerPoint/Excel); "acrobat" = fix the PDF directly. */
  tool: "source" | "acrobat";
  label: string;
  steps: string[];
}

export interface PlanStep {
  rank: number;
  categoryId: string;
  title: string;
  why: string;
  severity: PlanSeverity;
  wcagRefs: { sc: string; name: string }[];
  routes: FixRoute[];
  /** Anchor of the category's evidence card inside the technical report. */
  detailAnchor: string;
}

interface PlanCopyEntry {
  title: string;
  why: string;
  /** Steps for fixing the ORIGINAL document, keyed by uploaded file type.
   *  For "pdf" these describe the source app the PDF usually came from. */
  source: Partial<Record<PlanFileType, string[]>>;
  /** Dictionary default when the report carries no per-document Acrobat block. */
  acrobat?: string[];
}

const SOURCE_LABEL_PDF = "Easiest — fix the source document, then re-export";
const SOURCE_LABEL: Record<PlanFileType, string> = {
  pdf: SOURCE_LABEL_PDF,
  docx: "Fix it in Word",
  pptx: "Fix it in PowerPoint",
  xlsx: "Fix it in Excel",
};
const ACROBAT_LABEL = "No source file? Fix the PDF in Acrobat";

/** Exported for the dictionary-completeness test. */
export const PLAN_COPY: Record<string, PlanCopyEntry> = {
  text_extractability: {
    title: "Make the text readable by screen readers",
    why: "Screen readers can only read real text — right now some or all of this document is a picture of text.",
    source: {
      pdf: [
        "Open the original Word (or Google Docs) file",
        'In Word: File → Save As → PDF → Options → check "Document structure tags for accessibility", then save',
      ],
    },
    acrobat: [
      "All tools → Scan & OCR → Recognize Text → In This File",
      "Then: All tools → Prepare for accessibility → Automatically tag PDF",
    ],
  },
  title_language: {
    title: "Give the document a title and set its language",
    why: "Without these, screen readers announce the raw filename and guess the wrong language.",
    source: {
      pdf: ["In Word: File → Info → set Title", "Re-export the PDF (File → Save As → PDF)"],
      docx: ["File → Info → set Title", "Review → Language → Set Proofing Language"],
      pptx: ["File → Info → set Title", "Review → Language → Set Proofing Language"],
      xlsx: ["File → Info → set Title", "Review → Language → Set Proofing Language"],
    },
    acrobat: [
      "File → Properties → Description tab → enter a descriptive Title",
      "File → Properties → Advanced tab → set the Language dropdown",
      "File → Properties → Initial View tab → set Show: Document Title",
    ],
  },
  heading_structure: {
    title: "Use real heading styles so readers can navigate",
    why: "Screen-reader users jump between headings; text that is merely bold or large is invisible to that navigation.",
    source: {
      pdf: [
        "In Word, apply Heading 1 / Heading 2 / Heading 3 styles from the Styles gallery (don't just bold the text)",
        "Keep levels in order — don't skip from Heading 1 to Heading 3",
        "Re-export the PDF with structure tags",
      ],
      docx: [
        "Apply Heading 1 / Heading 2 / Heading 3 styles from the Styles gallery (don't just bold the text)",
        "Keep levels in order — don't skip from Heading 1 to Heading 3",
      ],
    },
    acrobat: [
      "Open the Tags panel (View → Show/Hide → Navigation Panes → Tags)",
      "Change each heading's tag to the matching level (H1, H2, H3…) so the visual hierarchy is in the tags",
    ],
  },
  alt_text: {
    title: "Describe images with alt text",
    why: 'People who can\'t see an image rely on its description; without one they hear only "graphic".',
    source: {
      pdf: [
        "In Word: right-click each image → View Alt Text → write a short description (or mark it decorative)",
        "Re-export the PDF",
      ],
      docx: ["Right-click each image → View Alt Text → write a short description (or mark it decorative)"],
      pptx: ["Right-click each picture → View Alt Text → write a short description (or mark it decorative)"],
      xlsx: ["Right-click each chart/image → View Alt Text → write a short description"],
    },
    acrobat: [
      "All tools → Prepare for accessibility → Fix reading order",
      "Select each figure → Edit alternate text → write a short description",
    ],
  },
  color_contrast: {
    title: "Increase the contrast between text and background",
    why: "Low-contrast text is unreadable for low-vision readers — WCAG requires at least 4.5:1 for body text.",
    source: {
      pdf: [
        "In the original document, darken the text color or lighten the background",
        "Check each color pair with the WebAIM Contrast Checker (webaim.org/resources/contrastchecker)",
        "Re-export the PDF",
      ],
      docx: ["Darken the text color or lighten the background", "Check pairs with the WebAIM Contrast Checker"],
      pptx: ["Darken the text color or lighten the background on each slide", "Check pairs with the WebAIM Contrast Checker"],
      xlsx: ["Darken cell text or lighten cell fills", "Check pairs with the WebAIM Contrast Checker"],
    },
    acrobat: [
      "Contrast is a design property — fix the colors in the source document and re-export; Acrobat cannot restyle text reliably",
    ],
  },
  bookmarks: {
    title: "Add bookmarks so the document is navigable",
    why: "Bookmarks are the table of contents that keyboard and screen-reader users navigate long PDFs with.",
    source: {
      pdf: [
        "Use Heading styles in Word, then File → Save As → PDF → Options → check \"Create bookmarks using: Headings\"",
      ],
    },
    acrobat: [
      "View → Show/Hide → Navigation Panes → Bookmarks",
      "Add a bookmark for each major section (with a tagged PDF, use the options menu → New Bookmarks from Structure)",
    ],
  },
  table_markup: {
    title: "Make tables real tables with a marked header row",
    why: "Screen readers speak tables cell by cell; without marked headers the numbers lose their meaning.",
    source: {
      pdf: [
        "In Word: build tables with Insert → Table (never tabs or spaces)",
        "Select the header row → Table Design → check Header Row, and Layout → Repeat Header Rows",
        "Re-export the PDF",
      ],
      docx: [
        "Build tables with Insert → Table (never tabs or spaces)",
        "Select the header row → Table Design → check Header Row, and Layout → Repeat Header Rows",
      ],
      pptx: ["Use Insert → Table on the slide", "Table Design → check Header Row"],
      xlsx: ["Select the data → Insert → Table → check \"My table has headers\""],
    },
    acrobat: [
      "Open the Tags panel and confirm each table uses <Table>/<TR>/<TH>/<TD>",
      "Use Fix reading order → Table Editor to mark the header cells as header cells",
    ],
  },
  link_quality: {
    title: "Give links text that says where they go",
    why: '"Click here" and raw URLs are meaningless when a screen reader lists the page\'s links out of context.',
    source: {
      pdf: [
        'In the original document, rewrite each link\'s visible text to describe the destination (e.g., "2024 crime statistics report")',
        "Re-export the PDF",
      ],
      docx: ['Rewrite each link\'s visible text to describe the destination (e.g., "2024 crime statistics report")'],
      pptx: ["Rewrite each link's visible text to describe the destination"],
      xlsx: ["Rewrite each link's cell text to describe the destination"],
    },
    acrobat: [
      "Link wording lives in the text itself — rewrite it in the source document and re-export",
    ],
  },
  form_accessibility: {
    title: "Label every form field",
    why: "Unlabeled fields leave screen-reader users guessing what to type in each box.",
    source: {
      pdf: [
        "If the form came from Word, put a clear text label next to every field, re-export, and re-create the fields",
      ],
      docx: ["Put a clear text label next to every form control"],
      pptx: ["Put a clear text label next to every interactive element"],
      xlsx: ["Put a clear label in the cell next to every input area"],
    },
    acrobat: [
      "All tools → Prepare a form",
      "Right-click each field → Properties → General → Tooltip: enter the field's visible label",
    ],
  },
  reading_order: {
    title: "Fix the order the document is read in",
    why: "Screen readers follow the tag order, not the visual layout — columns and floating boxes can read out of sequence.",
    source: {
      pdf: [
        "In Word, avoid floating text boxes; use a simple top-to-bottom flow or real columns (Layout → Columns)",
        "Re-export the PDF with structure tags",
      ],
      docx: ["Avoid floating text boxes; use a simple top-to-bottom flow or real columns (Layout → Columns)"],
      pptx: ["On each slide: Home → Arrange → Selection Pane, and order objects bottom-to-top in reading order"],
    },
    acrobat: [
      "All tools → Prepare for accessibility → Fix reading order",
      "Drag the numbered regions into the order the page should be read",
    ],
  },
  list_structure: {
    title: "Use real bullet and numbered lists",
    why: 'Hand-typed dashes aren\'t lists to a screen reader — users lose the "item 3 of 7" context.',
    source: {
      pdf: [
        "In Word: select the items → Home → Bullets or Numbering (delete any hand-typed dashes/numbers first)",
        "Re-export the PDF",
      ],
      docx: ["Select the items → Home → Bullets or Numbering (delete any hand-typed dashes/numbers first)"],
      pptx: ["Use the layout's content placeholder bullets instead of typing dashes"],
    },
    acrobat: [
      "In the Tags panel, ensure each list uses <L> with <LI> items, each containing an <LBody>",
    ],
  },
  slide_titles: {
    title: "Give every slide a unique title",
    why: "Slide titles are how screen-reader users know where they are in the deck.",
    source: {
      pptx: [
        "Use each slide's built-in Title placeholder (if a layout has none: View → Outline and type the title there)",
        "View → Outline to spot untitled slides quickly",
        "Make every title unique",
      ],
    },
  },
  sheet_names: {
    title: "Name every worksheet tab",
    why: '"Sheet1" tells a screen-reader user nothing about what the tab contains.',
    source: {
      xlsx: ["Double-click each sheet tab and type a short, descriptive name"],
    },
  },
};

const SEVERITY_ORDER: Record<PlanSeverity, number> = { Critical: 0, Moderate: 1, Minor: 2 };

function isPlanSeverity(s: unknown): s is PlanSeverity {
  return s === "Critical" || s === "Moderate" || s === "Minor";
}

function normalizeFileType(fileType?: string | null): PlanFileType {
  // Old stored reports may lack fileType entirely — they predate multi-format
  // support, so PDF is the correct assumption (matches ReportContent's
  // metadata-panel fallback).
  return fileType === "docx" || fileType === "pptx" || fileType === "xlsx" ? fileType : "pdf";
}

/**
 * Publication clause for the grade hero, absorbing ReportActionBanner's copy
 * logic: Critical blocks, Moderate recommends, Minor/clean passes.
 */
export function verdictPhrase(
  categories: Array<{ severity?: string | null }> | null | undefined,
): string {
  const t = tallySeverity(Array.isArray(categories) ? categories : []);
  if (t.critical > 0) return "not ready to publish";
  if (t.moderate > 0) return "fix recommended before publishing";
  return "ready to publish";
}

export function buildActionPlan(categories: unknown, fileType?: string | null): PlanStep[] {
  if (!Array.isArray(categories)) return [];
  const ft = normalizeFileType(fileType);

  const issues = categories.filter(
    (c): c is { id: string; label: string; severity: PlanSeverity; findings?: unknown } =>
      !!c && typeof c === "object" && isPlanSeverity((c as { severity?: unknown }).severity),
  );

  // Array.prototype.sort is stable — equal severities keep analyzer order.
  const ordered = [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return ordered.map((c, i) => {
    const id = String(c.id ?? "");
    const label = String(c.label ?? id);
    const findings = Array.isArray(c.findings) ? (c.findings as string[]) : [];
    const entry = PLAN_COPY[id];

    // Per-document Acrobat steps beat the dictionary default — they're
    // specific to what the analyzer actually saw in this file.
    const reportAcrobat = partitionCardFindings(findings).acrobat;
    const acrobatSteps = reportAcrobat.length ? reportAcrobat : (entry?.acrobat ?? []);

    const routes: FixRoute[] = [];
    if (ft === "pdf") {
      const sourceSteps = entry?.source.pdf ?? [];
      if (sourceSteps.length) routes.push({ tool: "source", label: SOURCE_LABEL.pdf, steps: sourceSteps });
      if (acrobatSteps.length) routes.push({ tool: "acrobat", label: ACROBAT_LABEL, steps: acrobatSteps });
    } else {
      const sourceSteps = entry?.source[ft] ?? [];
      if (sourceSteps.length) routes.push({ tool: "source", label: SOURCE_LABEL[ft], steps: sourceSteps });
    }
    // Never leave a step with no route at all (unknown id, or an OOXML
    // category the dictionary has no steps for): fall back to whatever the
    // report itself said, then to the category's own findings text.
    if (!routes.length) {
      const fallback = acrobatSteps.length ? acrobatSteps : [firstActionableFinding(findings) || label];
      routes.push({
        tool: ft === "pdf" ? "acrobat" : "source",
        label: ft === "pdf" ? ACROBAT_LABEL : SOURCE_LABEL[ft],
        steps: fallback,
      });
    }

    return {
      rank: i + 1,
      categoryId: id,
      title: entry?.title ?? `Fix: ${label}`,
      why: entry?.why ?? (firstActionableFinding(findings) || label),
      severity: c.severity,
      wcagRefs: (WCAG_CATEGORY_MAP[id] ?? []).map(({ sc, name }) => ({ sc, name })),
      routes,
      detailAnchor: `#cat-${id}`,
    };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/actionPlan.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/utils/actionPlan.ts apps/web/app/__tests__/actionPlan.test.ts
git commit -m "feat(web): action-plan mapper — plain-language fix steps from stored categories"
```

---

### Task 2: `useReportView` composable + `ReportViewToggle.vue`

**Files:**
- Create: `apps/web/app/composables/useReportView.ts`
- Create: `apps/web/app/components/ReportViewToggle.vue`
- Test: `apps/web/app/__tests__/reportViewToggle.test.ts`

**Interfaces:**
- Produces (used by Task 8):
  ```ts
  export type ReportViewMode = "visual" | "detailed";
  export function useReportView(): { mode: Ref<ReportViewMode>; setMode: (m: ReportViewMode) => void }
  // ReportViewToggle props: { modelValue: ReportViewMode }; emits "update:modelValue"
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/reportViewToggle.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import ReportViewToggle from "../components/ReportViewToggle.vue";
import { useReportView } from "../composables/useReportView";

beforeEach(() => localStorage.clear());

describe("useReportView", () => {
  const Harness = defineComponent({
    setup() {
      const { mode, setMode } = useReportView();
      return { mode, setMode };
    },
    render() {
      return h("div", this.mode);
    },
  });

  it("defaults to visual", () => {
    const w = mount(Harness);
    expect(w.text()).toBe("visual");
  });

  it("applies a stored 'detailed' preference on mount", async () => {
    localStorage.setItem("far:report-view", "detailed");
    const w = mount(Harness);
    await nextTick();
    expect(w.text()).toBe("detailed");
  });

  it("ignores garbage stored values", async () => {
    localStorage.setItem("far:report-view", "bogus");
    const w = mount(Harness);
    await nextTick();
    expect(w.text()).toBe("visual");
  });

  it("setMode persists to localStorage", () => {
    const w = mount(Harness);
    (w.vm as unknown as { setMode: (m: string) => void }).setMode("detailed");
    expect(localStorage.getItem("far:report-view")).toBe("detailed");
  });
});

describe("ReportViewToggle", () => {
  it("marks the active mode with aria-pressed and is excluded from exports", async () => {
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    expect(w.attributes("data-export-exclude")).toBeDefined();
    const [visualBtn, detailedBtn] = w.findAll("button");
    expect(visualBtn!.attributes("aria-pressed")).toBe("true");
    expect(detailedBtn!.attributes("aria-pressed")).toBe("false");
    await detailedBtn!.trigger("click");
    expect(w.emitted("update:modelValue")![0]).toEqual(["detailed"]);
  });

  it("labels both options in plain words", () => {
    const w = mount(ReportViewToggle, { props: { modelValue: "visual" } });
    expect(w.text()).toContain("Visual");
    expect(w.text()).toContain("Detailed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportViewToggle.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the composable**

Create `apps/web/app/composables/useReportView.ts`:

```ts
/**
 * Visual/Detailed report view preference. Per-device (localStorage), default
 * "visual" — shared-report recipients are mostly non-technical. SSR renders
 * the default; the stored preference applies on mount (the brief flicker for
 * detailed-preference users is an accepted trade-off — see the spec's
 * "View toggle and data parity" section).
 */
import { onMounted, ref, type Ref } from "vue";

export type ReportViewMode = "visual" | "detailed";

const STORAGE_KEY = "far:report-view";

export function useReportView(): {
  mode: Ref<ReportViewMode>;
  setMode: (m: ReportViewMode) => void;
} {
  const mode = ref<ReportViewMode>("visual");

  onMounted(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "visual" || stored === "detailed") mode.value = stored;
    } catch {
      /* private browsing / storage disabled — keep default */
    }
  });

  function setMode(m: ReportViewMode): void {
    mode.value = m;
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* private browsing / storage disabled — preference just won't persist */
    }
  }

  return { mode, setMode };
}
```

- [ ] **Step 4: Implement the toggle component**

Create `apps/web/app/components/ReportViewToggle.vue`:

```vue
<template>
  <div
    class="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-xs"
    role="group"
    aria-label="Report view"
    data-export-exclude
  >
    <button
      type="button"
      :aria-pressed="modelValue === 'visual'"
      :class="btnClass('visual')"
      @click="$emit('update:modelValue', 'visual')"
    >
      Visual view
    </button>
    <button
      type="button"
      :aria-pressed="modelValue === 'detailed'"
      :class="btnClass('detailed')"
      @click="$emit('update:modelValue', 'detailed')"
    >
      Detailed view
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ReportViewMode } from "~/composables/useReportView";

const props = defineProps<{ modelValue: ReportViewMode }>();
defineEmits<{ (e: "update:modelValue", v: ReportViewMode): void }>();

function btnClass(m: ReportViewMode): string {
  const base = "px-3 py-1.5 font-medium transition-colors cursor-pointer";
  return m === props.modelValue
    ? `${base} bg-blue-500/15 text-[var(--text-heading)]`
    : `${base} text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]`;
}
</script>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportViewToggle.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/composables/useReportView.ts apps/web/app/components/ReportViewToggle.vue apps/web/app/__tests__/reportViewToggle.test.ts
git commit -m "feat(web): Visual/Detailed report view preference + toggle control"
```

---

### Task 3: Header trio — `ReportGradeHero`, `SeverityTiles`, `VerdictStrip`

**Files:**
- Create: `apps/web/app/components/ReportGradeHero.vue`
- Create: `apps/web/app/components/SeverityTiles.vue`
- Create: `apps/web/app/components/VerdictStrip.vue`
- Test: `apps/web/app/__tests__/reportHeader.test.ts`

**Interfaces:**
- Consumes: `verdictPhrase` (Task 1), `gradeColor`/`severityColor` from `@file-audit/shared`, `gradeLabel`/`conformanceHeading`/`ConformanceVerdict` from `~/utils/exportFormats/shared`, `tallySeverity` from `~/utils/severityTally`.
- Produces (used by Task 7):
  - `ReportGradeHero` props: `{ grade: string; overallScore: number; categories: Array<{ severity?: string | null }> }`
  - `SeverityTiles` props: `{ categories: Array<{ severity?: string | null }> }`
  - `VerdictStrip` props: `{ conformance?: ConformanceVerdict | null; wcagVersion: string }` — renders nothing when `conformance` is absent; links to `#technical-report`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/reportHeader.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportGradeHero from "../components/ReportGradeHero.vue";
import SeverityTiles from "../components/SeverityTiles.vue";
import VerdictStrip from "../components/VerdictStrip.vue";

const sev = (severity: string | null) => ({ severity });

describe("ReportGradeHero", () => {
  it("shows the big grade, the score, and the plain-language verdict", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "D", overallScore: 62, categories: [sev("Critical"), sev("Minor")] },
    });
    expect(w.text()).toContain("D");
    expect(w.text()).toContain("62");
    expect(w.text()).toContain("/100");
    expect(w.text()).toContain("Poor — not ready to publish");
  });

  it("clean report reads 'ready to publish'", () => {
    const w = mount(ReportGradeHero, {
      props: { grade: "A", overallScore: 98, categories: [sev("Pass")] },
    });
    expect(w.text()).toContain("Excellent — ready to publish");
  });

  it("NO publication clause when categories are absent (URL page-audit reports)", () => {
    const w = mount(ReportGradeHero, { props: { grade: "B", overallScore: 88, categories: [] } });
    expect(w.text()).toContain("Good");
    expect(w.text()).not.toContain("—");
    expect(w.text()).not.toContain("publish");
  });
});

describe("SeverityTiles", () => {
  it("counts each severity and always pairs icon + label + number", () => {
    const w = mount(SeverityTiles, {
      props: {
        categories: [sev("Critical"), sev("Critical"), sev("Moderate"), sev("Minor"), sev("Pass")],
      },
    });
    const tiles = w.findAll("[data-testid^='severity-tile-']");
    expect(tiles.length).toBe(3);
    expect(w.find("[data-testid='severity-tile-critical']").text()).toContain("2");
    expect(w.find("[data-testid='severity-tile-critical']").text()).toContain("Critical");
    expect(w.find("[data-testid='severity-tile-moderate']").text()).toContain("1");
    expect(w.find("[data-testid='severity-tile-minor']").text()).toContain("1");
  });

  it("renders zero counts muted, not alarming", () => {
    const w = mount(SeverityTiles, { props: { categories: [sev("Pass")] } });
    expect(w.find("[data-testid='severity-tile-critical']").classes()).toContain("tile-zero");
  });
});

describe("VerdictStrip", () => {
  it("fail → ✗ heading, failing count, and a link to the technical report", () => {
    const w = mount(VerdictStrip, {
      props: {
        wcagVersion: "2.2",
        conformance: {
          status: "fail",
          headline: "h",
          failures: [
            { sc: "1.1.1", name: "Non-text Content", level: "A", category: "alt_text", issue: "x", url: "https://w3.org" },
            { sc: "2.4.2", name: "Page Titled", level: "A", category: "title_language", issue: "y", url: "https://w3.org" },
          ],
          notAssessed: [],
        },
      },
    });
    expect(w.text()).toContain("Does not meet WCAG 2.2 Level AA");
    expect(w.text()).toContain("2 criteria failing");
    expect(w.find("a").attributes("href")).toBe("#technical-report");
  });

  it("no-automated-failures → green ✓ wording", () => {
    const w = mount(VerdictStrip, {
      props: {
        wcagVersion: "2.2",
        conformance: { status: "no-automated-failures", headline: "h", failures: [], notAssessed: [] },
      },
    });
    expect(w.text()).toContain("No automated WCAG failures detected");
  });

  it("renders nothing without a conformance verdict (old stored reports)", () => {
    const w = mount(VerdictStrip, { props: { wcagVersion: "2.2", conformance: null } });
    expect(w.text()).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportHeader.test.ts`
Expected: FAIL — components not found.

- [ ] **Step 3: Implement the three components**

Create `apps/web/app/components/ReportGradeHero.vue`:

```vue
<template>
  <div class="text-center">
    <div class="flex justify-center">
      <div
        class="w-28 h-28 sm:w-40 sm:h-40 rounded-full flex items-center justify-center border-4"
        :style="{ borderColor: color, backgroundColor: color + '15' }"
      >
        <span class="text-5xl sm:text-7xl font-black" :style="{ color }">{{ grade }}</span>
      </div>
    </div>
    <p class="text-3xl font-bold mt-4">
      {{ overallScore }}<span class="text-lg text-[var(--text-secondary)]">/100</span>
    </p>
    <p class="text-sm font-medium mt-1" :style="{ color }">{{ label }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { gradeColor } from "@file-audit/shared";
import { gradeLabel } from "~/utils/exportFormats/shared";
import { verdictPhrase } from "~/utils/actionPlan";

const props = defineProps<{
  grade: string;
  overallScore: number;
  categories: Array<{ severity?: string | null }>;
}>();

const color = computed(() => gradeColor(props.grade));
// "Poor — not ready to publish": the emotional headline for non-technical
// readers. gradeLabel supplies the adjective, verdictPhrase the consequence.
// No categories (URL page-audit reports stored in the same table) → no
// publication clause; a clause would claim document-level knowledge we
// don't have for those.
const label = computed(() =>
  Array.isArray(props.categories) && props.categories.length
    ? `${gradeLabel(props.grade)} — ${verdictPhrase(props.categories)}`
    : gradeLabel(props.grade),
);
</script>
```

Create `apps/web/app/components/SeverityTiles.vue`:

```vue
<template>
  <div class="flex gap-2 sm:gap-3 max-w-xl mx-auto">
    <div
      v-for="tile in tiles"
      :key="tile.key"
      :data-testid="`severity-tile-${tile.key}`"
      class="flex-1 rounded-xl border px-3 py-2.5 text-center"
      :class="tile.count === 0 ? 'tile-zero border-[var(--border-subtle)]' : tile.activeClass"
    >
      <div
        class="text-2xl font-extrabold leading-tight"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : tile.textClass"
      >
        {{ tile.count }}
      </div>
      <div
        class="text-[10px] font-semibold tracking-wide"
        :class="tile.count === 0 ? 'text-[var(--text-muted)]' : tile.textClass"
      >
        <span aria-hidden="true">{{ tile.icon }}</span> {{ tile.label.toUpperCase() }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { tallySeverity } from "~/utils/severityTally";

const props = defineProps<{ categories: Array<{ severity?: string | null }> }>();

const tally = computed(() => tallySeverity(props.categories));

// Icon + label + count, always — severity is never color-alone.
const tiles = computed(() => [
  {
    key: "critical",
    label: "Critical",
    icon: "⛔",
    count: tally.value.critical,
    activeClass: "border-red-500/40 bg-red-500/10",
    textClass: "text-red-400",
  },
  {
    key: "moderate",
    label: "Moderate",
    icon: "⚠",
    count: tally.value.moderate,
    activeClass: "border-yellow-500/40 bg-yellow-500/10",
    textClass: "text-yellow-400",
  },
  {
    key: "minor",
    label: "Minor",
    icon: "ⓘ",
    count: tally.value.minor,
    activeClass: "border-blue-500/40 bg-blue-500/10",
    textClass: "text-blue-400",
  },
]);
</script>
```

Create `apps/web/app/components/VerdictStrip.vue`:

```vue
<template>
  <div
    v-if="conformance"
    data-testid="verdict-strip"
    class="rounded-lg border px-4 py-2.5 text-center text-sm"
    :class="stripClass"
  >
    <span class="font-semibold"
      ><span aria-hidden="true">{{ icon }}</span> {{ heading }}</span
    >
    <template v-if="conformance.status === 'fail'">
      <span class="opacity-80">
        · {{ conformance.failures.length }}
        {{ conformance.failures.length === 1 ? "criterion" : "criteria" }} failing —
      </span>
      <a
        href="#technical-report"
        class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
        >details below</a
      >
    </template>
    <span v-else-if="conformance.notAssessed.length" class="opacity-80">
      · {{ conformance.notAssessed.length }} criteria still need a quick manual review
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { conformanceHeading, type ConformanceVerdict } from "~/utils/exportFormats/shared";

const props = defineProps<{
  conformance?: ConformanceVerdict | null;
  wcagVersion: string;
}>();

const heading = computed(() =>
  props.conformance ? conformanceHeading(props.conformance, props.wcagVersion) : "",
);
const icon = computed(() => {
  if (props.conformance?.status === "fail") return "✗";
  if (props.conformance?.status === "incomplete") return "!";
  return "✓";
});
const stripClass = computed(() => {
  const s = props.conformance?.status;
  if (s === "fail") return "border-red-500/35 bg-red-500/10 text-[var(--status-error)]";
  if (s === "incomplete")
    return "border-yellow-500/35 bg-yellow-500/10 text-[var(--status-warning-yellow)]";
  return "border-green-500/35 bg-green-500/10 text-green-500";
});
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportHeader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/ReportGradeHero.vue apps/web/app/components/SeverityTiles.vue apps/web/app/components/VerdictStrip.vue apps/web/app/__tests__/reportHeader.test.ts
git commit -m "feat(web): visual-view header — grade hero, severity tiles, verdict strip"
```

---

### Task 4: `ActionPlan.vue` — the timeline rail

**Files:**
- Create: `apps/web/app/components/ActionPlan.vue`
- Test: `apps/web/app/__tests__/actionPlanComponent.test.ts`

**Interfaces:**
- Consumes: `PlanStep`, `PlanSeverity` types (Task 1); `severityColor` from `@file-audit/shared`; `ConformanceVerdict` from `~/utils/exportFormats/shared`.
- Produces (used by Task 7): props `{ steps: PlanStep[]; conformance?: ConformanceVerdict | null }`; emits `("show-evidence", categoryId: string)`. Step bodies carry class `plan-step-body` (print CSS hook) and toggles carry `aria-expanded` (export snapshot hook). Root section carries class `action-plan`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/actionPlanComponent.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ActionPlan from "../components/ActionPlan.vue";
import type { PlanStep } from "../utils/actionPlan";

const step = (rank: number, categoryId: string, severity: PlanStep["severity"]): PlanStep => ({
  rank,
  categoryId,
  title: `Fix ${categoryId}`,
  why: `Why ${categoryId}`,
  severity,
  wcagRefs: [{ sc: "1.1.1", name: "Non-text Content" }],
  routes: [
    { tool: "source", label: "Easiest — fix the source document, then re-export", steps: ["Open Word", "Re-export"] },
    { tool: "acrobat", label: "No source file? Fix the PDF in Acrobat", steps: ["Autotag"] },
  ],
  detailAnchor: `#cat-${categoryId}`,
});

describe("ActionPlan", () => {
  it("renders numbered steps in order with the first expanded, rest collapsed", () => {
    const w = mount(ActionPlan, {
      props: { steps: [step(1, "text_extractability", "Critical"), step(2, "alt_text", "Moderate")] },
    });
    const toggles = w.findAll("button[aria-expanded]");
    expect(toggles[0]!.attributes("aria-expanded")).toBe("true");
    expect(toggles[1]!.attributes("aria-expanded")).toBe("false");
    // Both bodies exist in the DOM (v-show, for print/export) — the second is hidden.
    const bodies = w.findAll(".plan-step-body");
    expect(bodies.length).toBe(2);
    expect(bodies[0]!.isVisible()).toBe(true);
    expect(bodies[1]!.isVisible()).toBe(false);
  });

  it("shows both routes and the why-line in an expanded step", () => {
    const w = mount(ActionPlan, { props: { steps: [step(1, "alt_text", "Critical")] } });
    expect(w.text()).toContain("Why alt_text");
    expect(w.text()).toContain("Easiest — fix the source document");
    expect(w.text()).toContain("No source file? Fix the PDF in Acrobat");
    expect(w.text()).toContain("WCAG 1.1.1");
  });

  it("expands a collapsed step on click", async () => {
    const w = mount(ActionPlan, {
      props: { steps: [step(1, "a", "Critical"), step(2, "b", "Minor")] },
    });
    await w.findAll("button[aria-expanded]")[1]!.trigger("click");
    expect(w.findAll(".plan-step-body")[1]!.isVisible()).toBe(true);
  });

  it("emits show-evidence with the category id", async () => {
    const w = mount(ActionPlan, { props: { steps: [step(1, "table_markup", "Moderate")] } });
    await w.find("[data-testid='evidence-link']").trigger("click");
    expect(w.emitted("show-evidence")![0]).toEqual(["table_markup"]);
  });

  it("subtitle counts the blocking steps", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [step(1, "a", "Critical"), step(2, "b", "Critical"), step(3, "c", "Minor")],
      },
    });
    expect(w.text()).toContain("3 fixes, in order.");
    expect(w.text()).toContain("№ 1–2 block publication");
  });

  it("empty plan renders the green pass card with the manual-review reminder", () => {
    const w = mount(ActionPlan, {
      props: {
        steps: [],
        conformance: {
          status: "no-automated-failures",
          headline: "h",
          failures: [],
          notAssessed: [
            { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA", reason: "r", url: "https://w3.org" },
          ],
        },
      },
    });
    expect(w.find("[data-testid='plan-pass-card']").exists()).toBe(true);
    expect(w.text()).toContain("Nothing to fix");
    expect(w.text()).toContain("1.4.3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/actionPlanComponent.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/app/components/ActionPlan.vue`:

```vue
<template>
  <section
    class="action-plan rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-6"
    aria-labelledby="action-plan-title"
  >
    <h2 id="action-plan-title" class="text-base sm:text-lg font-bold text-[var(--text-heading)]">
      Your action plan
    </h2>

    <template v-if="steps.length">
      <p class="text-xs text-[var(--text-muted)] mt-0.5 mb-5">{{ subtitle }}</p>

      <ol class="relative pl-9 space-y-3 list-none m-0 p-0">
        <!-- the rail -->
        <span
          class="absolute left-[11px] top-2 bottom-2 w-0.5 bg-[var(--border)]"
          aria-hidden="true"
        />
        <li v-for="step in steps" :key="step.categoryId" class="relative">
          <span
            class="absolute -left-9 top-1.5 w-6 h-6 rounded-full text-xs font-extrabold inline-flex items-center justify-center"
            :style="numStyle(step.severity)"
            aria-hidden="true"
            >{{ step.rank }}</span
          >
          <div
            class="rounded-lg border bg-[var(--surface-deep)]"
            :class="step.severity === 'Critical' ? 'border-red-500/35' : 'border-[var(--border-subtle)]'"
          >
            <button
              type="button"
              class="w-full flex items-center gap-2 text-left px-3 py-2.5 cursor-pointer"
              :aria-expanded="!!expanded[step.categoryId]"
              :aria-controls="`plan-step-${step.categoryId}`"
              @click="toggle(step.categoryId)"
            >
              <span class="flex-1 text-sm font-semibold text-[var(--text-heading)]">{{
                step.title
              }}</span>
              <span
                class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                :style="sevChipStyle(step.severity)"
                ><span aria-hidden="true">{{ sevIcon(step.severity) }}</span>
                {{ step.severity }}</span
              >
              <span class="text-xs text-[var(--link)] whitespace-nowrap" data-export-exclude>{{
                expanded[step.categoryId] ? "Hide" : "Show how"
              }}</span>
            </button>

            <div
              v-show="expanded[step.categoryId]"
              :id="`plan-step-${step.categoryId}`"
              class="plan-step-body px-3 pb-3"
            >
              <p class="text-xs text-[var(--text-muted)] mb-2">{{ step.why }}</p>

              <div
                class="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2.5 space-y-2.5"
              >
                <div v-for="route in step.routes" :key="route.tool" class="flex gap-2 text-sm">
                  <span aria-hidden="true" class="flex-shrink-0">{{
                    route.tool === "source" ? "📝" : "🔧"
                  }}</span>
                  <div class="text-[var(--text-secondary)] min-w-0">
                    <span
                      class="font-semibold"
                      :class="route.tool === 'source' ? 'text-green-500' : 'text-amber-500'"
                      >{{ route.label }}:</span
                    >
                    <ol
                      v-if="route.steps.length > 1"
                      class="list-decimal ml-5 mt-1 space-y-1 text-[13px]"
                    >
                      <li v-for="(s, i) in route.steps" :key="i">{{ s }}</li>
                    </ol>
                    <span v-else> {{ route.steps[0] }}</span>
                  </div>
                </div>
              </div>

              <div class="mt-2 flex items-center gap-2 flex-wrap">
                <span
                  v-for="ref in step.wcagRefs"
                  :key="ref.sc"
                  class="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5"
                  :title="ref.name"
                  >WCAG {{ ref.sc }}</span
                >
                <button
                  type="button"
                  data-testid="evidence-link"
                  class="text-xs text-[var(--link)] hover:text-[var(--link-hover)] underline cursor-pointer"
                  data-export-exclude
                  @click="$emit('show-evidence', step.categoryId)"
                >
                  Evidence &amp; technical detail ↓
                </button>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </template>

    <div
      v-else
      data-testid="plan-pass-card"
      class="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 mt-2"
    >
      <p class="text-sm font-semibold text-green-500">
        <span aria-hidden="true">✓</span> Nothing to fix — this document passes all automated
        checks.
      </p>
      <p v-if="conformance?.notAssessed?.length" class="text-xs text-[var(--text-muted)] mt-1.5">
        Some WCAG criteria can't be checked automatically ({{
          conformance.notAssessed.map((n) => n.sc).join(", ")
        }}) — a quick manual review is still recommended.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { severityColor } from "@file-audit/shared";
import type { PlanStep, PlanSeverity } from "~/utils/actionPlan";
import type { ConformanceVerdict } from "~/utils/exportFormats/shared";

const props = defineProps<{
  steps: PlanStep[];
  conformance?: ConformanceVerdict | null;
}>();

defineEmits<{ (e: "show-evidence", categoryId: string): void }>();

// Step 1 open by default — the one thing to do next is zero clicks away.
// Steps are per-report and never change identity after mount, so seeding
// from props at setup is safe.
const expanded = ref<Record<string, boolean>>(
  props.steps.length ? { [props.steps[0]!.categoryId]: true } : {},
);

function toggle(id: string): void {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] };
}

const subtitle = computed(() => {
  const n = props.steps.length;
  const c = props.steps.filter((s) => s.severity === "Critical").length;
  const base = `${n} ${n === 1 ? "fix" : "fixes"}, in order.`;
  if (c === 0) return `${base} Re-upload the fixed file to verify.`;
  const which = c === 1 ? "№ 1 blocks" : `№ 1–${c} block`;
  return `${base} ${which} publication — start there, then re-upload to verify.`;
});

function sevIcon(s: PlanSeverity): string {
  return s === "Critical" ? "⛔" : s === "Moderate" ? "⚠" : "ⓘ";
}

function sevChipStyle(s: PlanSeverity): Record<string, string> {
  const c = severityColor(s);
  return { color: c, backgroundColor: c + "15", border: `1px solid ${c}35` };
}

function numStyle(s: PlanSeverity): Record<string, string> {
  const c = severityColor(s);
  if (s === "Critical") return { backgroundColor: c, color: "#fff" };
  return { backgroundColor: "var(--surface-deep)", border: `2px solid ${c}`, color: c };
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/actionPlanComponent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/ActionPlan.vue apps/web/app/__tests__/actionPlanComponent.test.ts
git commit -m "feat(web): ActionPlan timeline rail — numbered fixes with plain-language routes"
```

---

### Task 5: `CategoryBars.vue`

**Files:**
- Create: `apps/web/app/components/CategoryBars.vue`
- Test: `apps/web/app/__tests__/categoryBars.test.ts`

**Interfaces:**
- Consumes: `gradeColor`, `severityColor` from `@file-audit/shared`; `naReason` from `~/utils/modeDivergence`.
- Produces (used by Task 7): props `{ categories: Array<{ id: string; label: string; score: number | null; grade: string | null; severity: string | null; notAssessed?: boolean }> }`. **Full score-table parity: label + bar + score + grade letter + severity chip per scored row; reason text per N/A row.**

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/categoryBars.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CategoryBars from "../components/CategoryBars.vue";

const cats = [
  { id: "text_extractability", label: "Text Extractability", score: 0, grade: "F", severity: "Critical" },
  { id: "alt_text", label: "Alt Text on Images", score: 70, grade: "C", severity: "Moderate" },
  { id: "bookmarks", label: "Bookmarks / Navigation", score: 100, grade: "A", severity: "Pass" },
  { id: "reading_order", label: "Reading Order", score: null, grade: null, severity: null, notAssessed: true },
  { id: "color_contrast", label: "Color Contrast", score: null, grade: null, severity: null },
];

describe("CategoryBars", () => {
  it("renders one bar row per scored category with score, grade AND severity (table parity)", () => {
    const w = mount(CategoryBars, { props: { categories: cats } });
    const rows = w.findAll("[data-testid='bar-row']");
    expect(rows.length).toBe(3);
    const alt = rows[1]!;
    expect(alt.text()).toContain("Alt Text on Images");
    expect(alt.text()).toContain("70");
    expect(alt.text()).toContain("C");
    expect(alt.text()).toContain("Moderate");
    const fill = alt.find("[data-testid='bar-fill']");
    expect(fill.attributes("style")).toContain("width: 70%");
  });

  it("gives every row a full-sentence aria-label", () => {
    const w = mount(CategoryBars, { props: { categories: cats } });
    expect(w.findAll("[data-testid='bar-row']")[0]!.attributes("aria-label")).toBe(
      "Text Extractability: 0 out of 100, grade F, severity Critical",
    );
  });

  it("lists N/A categories with their reason, distinguishing not-assessed from not-applicable", () => {
    const w = mount(CategoryBars, { props: { categories: cats } });
    const na = w.find("[data-testid='bars-na']");
    expect(na.text()).toContain("Reading Order");
    expect(na.text()).toContain("Not assessed");
    expect(na.text()).toContain("Color Contrast");
    expect(na.text()).toContain("Not applicable");
  });

  it("survives a malformed categories value", () => {
    const w = mount(CategoryBars, { props: { categories: "junk" as never } });
    expect(w.findAll("[data-testid='bar-row']").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/categoryBars.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/app/components/CategoryBars.vue`:

```vue
<template>
  <section
    class="category-bars rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-5"
    aria-labelledby="category-bars-title"
  >
    <h2
      id="category-bars-title"
      class="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
    >
      Where the score comes from
    </h2>

    <ul class="mt-3 space-y-2.5 list-none m-0 p-0">
      <li
        v-for="cat in scored"
        :key="cat.id"
        data-testid="bar-row"
        class="flex items-center gap-2 sm:gap-3"
        :aria-label="rowLabel(cat)"
      >
        <span class="w-28 sm:w-44 flex-shrink-0 text-xs text-[var(--text-secondary)] truncate">{{
          cat.label
        }}</span>
        <div class="flex-1 h-2.5 rounded bg-[var(--surface-deep)]" aria-hidden="true">
          <div
            data-testid="bar-fill"
            class="h-2.5 rounded"
            :style="{ width: `${cat.score}%`, backgroundColor: barColor(cat) }"
          />
        </div>
        <span
          class="w-8 text-right font-mono text-xs text-[var(--text-secondary)]"
          aria-hidden="true"
          >{{ cat.score }}</span
        >
        <span
          class="inline-flex w-5 h-5 rounded-full text-[10px] font-bold items-center justify-center flex-shrink-0"
          :style="{ backgroundColor: barColor(cat) + '20', color: barColor(cat) }"
          aria-hidden="true"
          >{{ cat.grade || "—" }}</span
        >
        <span
          v-if="cat.severity"
          class="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: sevColor(cat.severity) + '15', color: sevColor(cat.severity) }"
          aria-hidden="true"
          >{{ cat.severity }}</span
        >
      </li>
    </ul>

    <div
      v-if="na.length"
      data-testid="bars-na"
      class="mt-4 pt-3 border-t border-[var(--border-subtle)] space-y-1"
    >
      <p class="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Not scored
      </p>
      <p v-for="cat in na" :key="cat.id" class="text-xs text-[var(--text-muted)]">
        <span class="text-[var(--text-secondary)]">{{ cat.label }}</span>
        — {{ cat.notAssessed ? "Not assessed" : "Not applicable" }}:
        {{ naReason(cat.id, cat.notAssessed) }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { gradeColor, severityColor } from "@file-audit/shared";
import { naReason } from "~/utils/modeDivergence";

interface BarCategory {
  id: string;
  label: string;
  score: number | null;
  grade: string | null;
  severity: string | null;
  notAssessed?: boolean;
}

const props = defineProps<{ categories: BarCategory[] }>();

const safe = computed<BarCategory[]>(() =>
  Array.isArray(props.categories) ? props.categories : [],
);
const scored = computed(() => safe.value.filter((c) => c.score !== null));
const na = computed(() => safe.value.filter((c) => c.score === null));

function barColor(cat: BarCategory): string {
  return cat.grade ? gradeColor(cat.grade) : "#555";
}
function sevColor(severity: string): string {
  return severityColor(severity);
}
function rowLabel(cat: BarCategory): string {
  const sev = cat.severity ? `, severity ${cat.severity}` : "";
  return `${cat.label}: ${cat.score} out of 100, grade ${cat.grade ?? "none"}${sev}`;
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/categoryBars.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/CategoryBars.vue apps/web/app/__tests__/categoryBars.test.ts
git commit -m "feat(web): CategoryBars — score-table data as labeled bars (full parity)"
```

---

### Task 6: `ReportContent.showScoreTable` prop + `TechnicalReport.vue`

**Files:**
- Modify: `apps/web/app/components/ReportContent.vue` (additive prop only)
- Create: `apps/web/app/components/TechnicalReport.vue`
- Test: `apps/web/app/__tests__/technicalReport.test.ts`

**Interfaces:**
- Consumes: `ReportContent` (existing), `PdfUaSignalsCard`, `PdfUaVerdict`, `MethodologyCard` (existing); `standardsBasis`, `conformanceHeading` from `~/utils/exportFormats/shared`; `safeHttpUrl` from `@file-audit/shared`.
- Produces (used by Task 7):
  - `ReportContent` new prop: `showScoreTable?: boolean` (default `true` — Detailed view byte-identical).
  - `TechnicalReport` props: `{ result: Record<string, any>; verapdfUrl?: string; wcagVersion: string }`, `v-model:open` (`defineModel<boolean>("open")`), root `id="technical-report"`, body class `tech-report-body`, header button `aria-expanded`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/technicalReport.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TechnicalReport from "../components/TechnicalReport.vue";
import ReportContent from "../components/ReportContent.vue";

const result = {
  categories: [
    {
      id: "alt_text",
      label: "Alt Text on Images",
      score: 40,
      grade: "F",
      severity: "Critical",
      findings: ["5 images with no alt text"],
      explanation: "Images need descriptions.",
    },
  ],
  conformance: {
    status: "fail",
    headline: "Fails 1 criterion",
    failures: [
      {
        sc: "1.1.1",
        name: "Non-text Content",
        level: "A",
        category: "alt_text",
        issue: "images lack alt text",
        url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
      },
    ],
    notAssessed: [
      { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA", reason: "needs eyes", url: "https://w3.org" },
    ],
  },
  grade: "F",
  fileType: "pdf",
};

describe("ReportContent showScoreTable prop", () => {
  it("still renders the score table by default (Detailed view unchanged)", () => {
    const w = mount(ReportContent, { props: { result } });
    expect(w.text()).toContain("Category Scores");
  });
  it("hides only the score table when showScoreTable=false", () => {
    const w = mount(ReportContent, { props: { result, showScoreTable: false } });
    expect(w.text()).not.toContain("Category Scores");
    expect(w.text()).toContain("Detailed Findings");
  });
});

describe("TechnicalReport", () => {
  it("is collapsed by default with an aria-expanded header button", () => {
    const w = mount(TechnicalReport, { props: { result, wcagVersion: "2.2" } });
    const btn = w.find("button[aria-expanded]");
    expect(btn.attributes("aria-expanded")).toBe("false");
    expect(w.find(".tech-report-body").isVisible()).toBe(false);
    expect(w.attributes("id")).toBe("technical-report");
  });

  it("expands on click and shows conformance detail + findings + methodology", async () => {
    const w = mount(TechnicalReport, { props: { result, wcagVersion: "2.2" } });
    await w.find("button[aria-expanded]").trigger("click");
    expect(w.find(".tech-report-body").isVisible()).toBe(true);
    // full conformance parity: failing criterion, not-assessed list, standards basis
    expect(w.text()).toContain("1.1.1");
    expect(w.text()).toContain("Not evaluated automatically");
    expect(w.text()).toContain("IITAA");
    // embedded ReportContent without its score table
    expect(w.text()).toContain("Detailed Findings");
    expect(w.text()).not.toContain("Category Scores");
  });

  it("opens via v-model:open (evidence links)", async () => {
    const w = mount(TechnicalReport, {
      props: { result, wcagVersion: "2.2", open: true, "onUpdate:open": () => {} },
    });
    expect(w.find(".tech-report-body").isVisible()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/technicalReport.test.ts`
Expected: FAIL — `TechnicalReport.vue` not found (the two ReportContent tests pass/fail on the missing prop).

- [ ] **Step 3: Add the prop to ReportContent**

In `apps/web/app/components/ReportContent.vue`:

1. Change the props declaration (currently `const props = defineProps<{ result: ReportLike }>();`) to:

```ts
const props = withDefaults(defineProps<{ result: ReportLike; showScoreTable?: boolean }>(), {
  showScoreTable: true,
});
```

2. Wrap ONLY the Score Table block — the first top-level `<div>` in the template (the one starting `<!-- Score Table -->` … `class="mb-8 rounded-xl border …overflow-x-auto"` and ending after the `category-scores-footnote` div) — by adding `v-if="showScoreTable"` to that outer div's attributes. Touch nothing else.

- [ ] **Step 4: Implement TechnicalReport**

Create `apps/web/app/components/TechnicalReport.vue`:

```vue
<template>
  <section id="technical-report" class="scroll-mt-4">
    <button
      type="button"
      class="w-full flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-deep)] px-4 py-3 text-left cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
      :aria-expanded="open"
      aria-controls="technical-report-body"
      @click="open = !open"
    >
      <svg
        class="w-3.5 h-3.5 text-[var(--text-muted)] transition-transform flex-shrink-0"
        :class="{ 'rotate-90': open }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-bold text-[var(--text-secondary)]">Full technical report</span>
        <span class="block text-xs text-[var(--text-muted)]">
          WCAG criteria detail · findings &amp; evidence · technical signals · PDF/UA checks ·
          methodology · document metadata
        </span>
      </span>
      <span class="text-xs text-[var(--link)] flex-shrink-0" data-export-exclude>{{
        open ? "Collapse" : "Expand"
      }}</span>
    </button>

    <div v-show="open" id="technical-report-body" class="tech-report-body mt-4">
      <!-- Full WCAG conformance detail — parity with the Detailed view's
           ScoreCard panel: failures with W3C links, not-assessed list,
           standards basis. -->
      <div
        v-if="result.conformance"
        data-testid="conformance-detail"
        class="rounded-xl border px-5 py-4 mb-6"
        :class="
          result.conformance.status === 'fail'
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-[var(--border)] bg-[var(--surface-card)]'
        "
      >
        <p class="text-sm font-semibold" :class="result.conformance.status === 'fail' ? 'text-[var(--status-error)]' : 'text-[var(--text-secondary)]'">
          {{ conformanceHeading(result.conformance, wcagVersion) }}
        </p>
        <p class="text-xs text-[var(--text-secondary)] leading-relaxed mt-2">
          {{ result.conformance.headline }}
        </p>
        <ul v-if="result.conformance.failures?.length" class="mt-3 space-y-1.5 list-none pl-0">
          <li
            v-for="(f, i) in result.conformance.failures"
            :key="i"
            class="text-xs text-[var(--text-secondary)] leading-relaxed"
          >
            <a
              :href="safeHttpUrl(f.url)"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono font-semibold underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >{{ f.sc }} {{ f.name }}</a
            ><span class="text-[var(--text-muted)]"> (Level {{ f.level }})</span> — {{ f.issue }}
          </li>
        </ul>
        <p
          v-if="result.conformance.notAssessed?.length"
          class="text-xs text-[var(--text-muted)] leading-relaxed mt-3"
        >
          Not evaluated automatically:
          <template v-for="(n, i) in result.conformance.notAssessed" :key="n.sc"
            ><a
              :href="safeHttpUrl(n.url)"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-[var(--link)] hover:text-[var(--link-hover)]"
              >{{ n.sc }} {{ n.name }}</a
            ><template v-if="i < result.conformance.notAssessed.length - 1">, </template></template
          >. These still require manual review.
        </p>
        <p class="text-xs text-[var(--text-muted)] leading-relaxed mt-3 pt-3 border-t border-[var(--border-subtle)]">
          {{ standardsBasis(wcagVersion) }}
        </p>
      </div>

      <ReportContent :result="result" :show-score-table="false" />

      <PdfUaSignalsCard
        v-if="result.pdfUa"
        :signals="result.pdfUa"
        :categories="result.categories"
        class="max-w-2xl mx-auto my-6"
      />
      <PdfUaVerdict
        v-if="result.pdfUaVerdict"
        :verdict="result.pdfUaVerdict"
        :grade="result.grade"
        :categories="result.categories"
        :verapdf-url="verapdfUrl || ''"
        class="my-6"
      />

      <MethodologyCard :file-type="result.fileType" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { safeHttpUrl } from "@file-audit/shared";
import ReportContent from "~/components/ReportContent.vue";
import MethodologyCard from "~/components/MethodologyCard.vue";
import { conformanceHeading, standardsBasis } from "~/utils/exportFormats/shared";

defineProps<{
  // Deliberately loose: the shared-report page feeds raw stored JSON.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: Record<string, any>;
  verapdfUrl?: string;
  wcagVersion: string;
}>();

const open = defineModel<boolean>("open", { default: false });
</script>
```

- [ ] **Step 5: Run tests — new file AND the existing ReportContent-dependent suites**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/technicalReport.test.ts app/__tests__/components.test.ts`
Expected: PASS (components.test.ts guards against regressions from the prop change).

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/ReportContent.vue apps/web/app/components/TechnicalReport.vue apps/web/app/__tests__/technicalReport.test.ts
git commit -m "feat(web): TechnicalReport expander; ReportContent gains showScoreTable prop"
```

---

### Task 7: `ReportVisualView.vue` — assemble the zones

**Files:**
- Create: `apps/web/app/components/ReportVisualView.vue`
- Test: `apps/web/app/__tests__/reportVisualView.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5, 6; `useWcag` composable (provides `.version`); `buildActionPlan`.
- Produces (used by Task 8): props `{ result: Record<string, any>; verapdfUrl?: string }`; optional `#notice` slot rendered between the verdict strip and the alert strips (index.vue passes `SourceDocumentNotice` for parity).

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/reportVisualView.test.ts`:

```ts
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReportVisualView from "../components/ReportVisualView.vue";

const result = {
  filename: "report.pdf",
  pageCount: 12,
  overallScore: 62,
  grade: "D",
  isScanned: false,
  executiveSummary: "sum",
  fileType: "pdf",
  warnings: ["A warning line"],
  categories: [
    {
      id: "text_extractability",
      label: "Text Extractability",
      score: 0,
      grade: "F",
      severity: "Critical",
      findings: ["No text found"],
    },
    {
      id: "title_language",
      label: "Document Title & Language",
      score: 40,
      grade: "F",
      severity: "Moderate",
      findings: ["No title set"],
    },
    { id: "reading_order", label: "Reading Order", score: null, grade: null, severity: null, notAssessed: true },
  ],
  conformance: {
    status: "fail",
    headline: "h",
    failures: [
      { sc: "1.3.1", name: "Info and Relationships", level: "A", category: "text_extractability", issue: "x", url: "https://w3.org" },
    ],
    notAssessed: [],
  },
};

describe("ReportVisualView", () => {
  it("renders hero, tiles, verdict, plan, bars, and technical expander — in that DOM order", () => {
    const w = mount(ReportVisualView, { props: { result } });
    const html = w.html();
    const order = [
      html.indexOf("/100"), // hero score
      html.indexOf("severity-tile-critical"),
      html.indexOf("verdict-strip"),
      html.indexOf("Your action plan"),
      html.indexOf("Where the score comes from"),
      html.indexOf("technical-report"),
    ];
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("builds plan steps from the result (Critical first)", () => {
    const w = mount(ReportVisualView, { props: { result } });
    expect(w.text()).toContain("Make the text readable by screen readers");
    expect(w.text()).toContain("2 fixes, in order.");
  });

  it("shows warnings and renders the notice slot", () => {
    const w = mount(ReportVisualView, {
      props: { result },
      slots: { notice: "<div data-testid='notice-slot'>notice</div>" },
    });
    expect(w.text()).toContain("A warning line");
    expect(w.find("[data-testid='notice-slot']").exists()).toBe(true);
  });

  it("evidence click opens the technical report", async () => {
    const w = mount(ReportVisualView, { props: { result } });
    expect(w.find(".tech-report-body").isVisible()).toBe(false);
    await w.find("[data-testid='evidence-link']").trigger("click");
    expect(w.find(".tech-report-body").isVisible()).toBe(true);
  });

  it("page-audit-shaped report (no categories) → hero only, NEVER the pass card", () => {
    const pageAudit = {
      filename: "https://example.gov/news",
      overallScore: undefined,
      grade: "B",
      score: 74,
      violationCount: 12,
      bySeverity: { critical: 2, serious: 4, moderate: 5, minor: 1 },
    };
    const w = mount(ReportVisualView, { props: { result: pageAudit } });
    expect(w.text()).toContain("Good");
    expect(w.find("[data-testid='plan-pass-card']").exists()).toBe(false);
    expect(w.find("[data-testid^='severity-tile-']").exists()).toBe(false);
    expect(w.find("[data-testid='bar-row']").exists()).toBe(false);
    expect(w.find("#technical-report").exists()).toBe(false);
    expect(w.text()).not.toContain("Nothing to fix");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportVisualView.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/app/components/ReportVisualView.vue`:

```vue
<template>
  <div>
    <ReportGradeHero
      :grade="result.grade"
      :overall-score="result.overallScore"
      :categories="result.categories || []"
      class="mb-5"
    />

    <SeverityTiles v-if="hasCategories" :categories="result.categories" class="mb-4" />

    <VerdictStrip
      :conformance="result.conformance"
      :wcag-version="wcag.version"
      class="mb-6"
    />

    <slot name="notice" />

    <div
      v-if="result.isScanned"
      class="mb-4 rounded-xl bg-orange-500/10 border border-orange-500/30 p-4"
    >
      <p class="text-[var(--status-warning-orange)] font-medium text-sm">
        This document appears to be a scanned image. Screen readers cannot access its content. OCR
        and full remediation are required — that's step 1 of your action plan.
      </p>
    </div>

    <div
      v-if="result.warnings?.length"
      class="mb-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4"
    >
      <p
        v-for="w in result.warnings"
        :key="w"
        class="text-[var(--status-warning-yellow)] text-sm"
      >
        {{ w }}
      </p>
    </div>

    <!-- No categories[] (URL page-audit rows share the shared_reports table)
         → no plan, no tiles, no bars, no expander. Rendering the green pass
         card for a page with axe violations would be actively misleading. -->
    <template v-if="hasCategories">
      <ActionPlan
        :steps="planSteps"
        :conformance="result.conformance"
        class="mb-6"
        @show-evidence="revealEvidence"
      />

      <CategoryBars :categories="result.categories" class="mb-6" />

      <TechnicalReport
        v-model:open="techOpen"
        :result="result"
        :verapdf-url="verapdfUrl"
        :wcag-version="wcag.version"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import ReportGradeHero from "~/components/ReportGradeHero.vue";
import SeverityTiles from "~/components/SeverityTiles.vue";
import VerdictStrip from "~/components/VerdictStrip.vue";
import ActionPlan from "~/components/ActionPlan.vue";
import CategoryBars from "~/components/CategoryBars.vue";
import TechnicalReport from "~/components/TechnicalReport.vue";
import { buildActionPlan } from "~/utils/actionPlan";
import { useWcag } from "~/composables/useWcag";

const props = defineProps<{
  // Raw stored JSON on the shared page — keep loose, guard downstream.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: Record<string, any>;
  verapdfUrl?: string;
}>();

const wcag = useWcag();
const techOpen = ref(false);

const hasCategories = computed(
  () => Array.isArray(props.result.categories) && props.result.categories.length > 0,
);

const planSteps = computed(() => buildActionPlan(props.result.categories, props.result.fileType));

function revealEvidence(categoryId: string): void {
  techOpen.value = true;
  nextTick(() => {
    document
      .getElementById(`cat-${categoryId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportVisualView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/components/ReportVisualView.vue apps/web/app/__tests__/reportVisualView.test.ts
git commit -m "feat(web): ReportVisualView — assembled infographic report view"
```

---

### Task 8: Page integration (shared + live) and the section-order test

**Files:**
- Modify: `apps/web/app/pages/report/[id].vue`
- Modify: `apps/web/app/pages/index.vue`
- Modify: `apps/web/app/__tests__/reportSectionOrder.test.ts` (full rewrite, shown below)

**Interfaces:**
- Consumes: `useReportView`, `ReportViewToggle` (Task 2), `ReportVisualView` (Task 7).
- Produces: both pages contain the exact marker comments `<!-- VISUAL VIEW -->` and `<!-- DETAILED VIEW -->`, visual block first.

- [ ] **Step 1: Rewrite the section-order test (it will fail until both pages are edited)**

Replace the entire contents of `apps/web/app/__tests__/reportSectionOrder.test.ts` with:

```ts
/**
 * Report layout invariants, now per view.
 *
 * DETAILED view: byte-for-byte today's report — the original invariant holds
 * unchanged: blocking WCAG issues render BEFORE the informational PDF/UA
 * panels (a "Pass" there must never be readable as "done" first).
 *
 * VISUAL view: the same invariant expressed by the new composition — hero →
 * verdict → action plan → bars → technical expander (which contains the
 * PDF/UA panels, i.e. they stay below the blocking information by
 * construction). ReportVisualView owns that order, so its source is asserted
 * once here rather than per page.
 *
 * Source-inspecting for the same reason as before: these are Nuxt pages that
 * can't be mounted meaningfully in isolation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function pageSource(relative: string): string {
  return readFileSync(resolve(__dirname, "..", "pages", relative), "utf-8");
}
function componentSource(name: string): string {
  return readFileSync(resolve(__dirname, "..", "components", name), "utf-8");
}

/** Index of a component's opening tag in the given source slice. */
function at(src: string, component: string): number {
  const i = src.indexOf(`<${component}`);
  expect(i, `${component} not found in source`).toBeGreaterThan(-1);
  return i;
}

describe.each([
  ["audit results page", "index.vue"],
  ["shared report page", "report/[id].vue"],
])("%s — view blocks", (_label, file) => {
  const src = pageSource(file);
  const vi = src.indexOf("<!-- VISUAL VIEW -->");
  const di = src.indexOf("<!-- DETAILED VIEW -->");

  it("has both view markers, visual first (it is the default)", () => {
    expect(vi).toBeGreaterThan(-1);
    expect(di).toBeGreaterThan(vi);
  });

  const visual = src.slice(vi, di === -1 ? undefined : di);
  const detailed = src.slice(di);

  it("visual block renders ReportVisualView; toggle is present", () => {
    expect(visual).toContain("<ReportVisualView");
    expect(src).toContain("<ReportViewToggle");
  });

  describe("detailed block keeps today's exact invariants", () => {
    it("shows the critical-issues action banner before the PDF/UA verdict", () => {
      expect(at(detailed, "ReportActionBanner")).toBeLessThan(at(detailed, "PdfUaVerdict"));
    });
    it("shows the list of issues to fix before the PDF/UA verdict", () => {
      expect(at(detailed, "IssuesSummary")).toBeLessThan(at(detailed, "PdfUaVerdict"));
    });
    it("still leads with the score, above everything else", () => {
      const score = at(detailed, "ScoreCard");
      expect(score).toBeLessThan(at(detailed, "ReportActionBanner"));
      expect(score).toBeLessThan(at(detailed, "PdfUaVerdict"));
    });
    it("shows the PDF/UA-1 signals card after the issues", () => {
      expect(at(detailed, "IssuesSummary")).toBeLessThan(at(detailed, "PdfUaSignalsCard"));
    });
    it("keeps the PDF/UA verdict above the methodology and category detail", () => {
      expect(at(detailed, "PdfUaVerdict")).toBeLessThan(at(detailed, "MethodologyCard"));
    });
  });
});

describe("ReportVisualView.vue — visual composition order", () => {
  const src = componentSource("ReportVisualView.vue");
  it("hero → tiles → verdict → plan → bars → technical report", () => {
    const hero = at(src, "ReportGradeHero");
    const tiles = at(src, "SeverityTiles");
    const verdict = at(src, "VerdictStrip");
    const plan = at(src, "ActionPlan");
    const bars = at(src, "CategoryBars");
    const tech = at(src, "TechnicalReport");
    expect(hero).toBeLessThan(tiles);
    expect(tiles).toBeLessThan(verdict);
    expect(verdict).toBeLessThan(plan);
    expect(plan).toBeLessThan(bars);
    expect(bars).toBeLessThan(tech);
  });
});

describe("TechnicalReport.vue — informational panels stay below blocking info", () => {
  const src = componentSource("TechnicalReport.vue");
  it("findings before PDF/UA panels before methodology", () => {
    expect(at(src, "ReportContent")).toBeLessThan(at(src, "PdfUaSignalsCard"));
    expect(at(src, "PdfUaSignalsCard")).toBeLessThan(at(src, "PdfUaVerdict"));
    expect(at(src, "PdfUaVerdict")).toBeLessThan(at(src, "MethodologyCard"));
  });
});
```

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportSectionOrder.test.ts`
Expected: FAIL — markers missing from both pages.

- [ ] **Step 2: Edit `pages/report/[id].vue`**

a. In `<script setup>`, add to the imports block:

```ts
import ReportVisualView from "~/components/ReportVisualView.vue";
import ReportViewToggle from "~/components/ReportViewToggle.vue";
```

and after `const colorMode = useColorMode();` add:

```ts
const { mode: viewMode, setMode: setViewMode } = useReportView();
```

b. In the template, in the header's top-right button row — the `<div class="flex justify-end items-center gap-2 mb-4">` that holds the color-mode button — insert the toggle BEFORE the color-mode `<button>`:

```html
<ReportViewToggle :model-value="viewMode" @update:model-value="setViewMode" />
```

c. Wrap the two views. Immediately AFTER the closing `</div>` of the header block (the one ending with `Shareable links expire after 365 days` paragraph), insert:

```html
<!-- VISUAL VIEW -->
<ReportVisualView
  v-if="viewMode === 'visual'"
  :result="data.report"
  :verapdf-url="String(config.public.verapdfUrl ?? '')"
/>

<!-- DETAILED VIEW -->
<template v-else>
```

then leave the existing sequence (Score Hero div, `ReportActionBanner`, `IssuesSummary`, `PdfUaSignalsCard`, `PdfUaVerdict`, scanned warning, warnings, `MethodologyCard`, `ReportContent`) EXACTLY as is, and close with `</template>` right before the `<!-- /report content -->` comment.

The `ReportFileBanner` and header (with the toggle) stay ABOVE the marker — shared by both views. The Downloads/CTA/footer stay BELOW `</template>` — also shared.

- [ ] **Step 3: Edit `pages/index.vue`**

a. Add the same two imports next to the existing component imports (line ~747), and `const { mode: viewMode, setMode: setViewMode } = useReportView();` in `<script setup>` near the other composable calls.

b. In the results block: directly after the `<ReportFileBanner … />` element (line ~227), insert a right-aligned toolbar:

```html
<div class="flex justify-end mb-4">
  <ReportViewToggle :model-value="viewMode" @update:model-value="setViewMode" />
</div>

<!-- VISUAL VIEW -->
<ReportVisualView
  v-if="viewMode === 'visual'"
  :result="result"
  :verapdf-url="String(config.public.verapdfUrl ?? '')"
>
  <template #notice>
    <SourceDocumentNotice variant="audit" :file-type="result?.fileType" class="mb-4" />
  </template>
</ReportVisualView>

<!-- DETAILED VIEW -->
<template v-else>
```

then the existing sequence (ScoreCard section div ~line 263 through `<ReportContent :result="result" />` ~line 332) stays EXACTLY as is, closed with `</template>`.

Check the surrounding markup carefully: whatever wrappers exist between the banner and ScoreCard today must end up either shared (above the marker) or inside the detailed block — the detailed DOM must be identical to today's when toggled.

If `config` isn't already defined in index.vue's `<script setup>` (search for `useRuntimeConfig()`), reuse the existing variable name the page already uses for `verapdfUrl` (it renders `PdfUaVerdict` today, so one exists — match it).

- [ ] **Step 4: Run the section-order test to verify it passes**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/reportSectionOrder.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full web suite**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm test`
Expected: PASS. Pages changed — watch for failures in `indexA11y.test.ts`, `csp.test.ts`, `accessibility.test.ts` and fix forward (these mount/inspect the pages; the detailed block is unchanged so failures indicate an integration mistake, not a needed test rewrite).

- [ ] **Step 6: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/pages/report/\[id\].vue apps/web/app/pages/index.vue apps/web/app/__tests__/reportSectionOrder.test.ts
git commit -m "feat(web): Visual/Detailed view toggle on live and shared report pages"
```

---

### Task 9: `buildHtml` — SSR export fallback mirrors the Visual view

**Files:**
- Modify: `apps/web/app/utils/exportFormats/html.ts`
- Test: `apps/web/app/__tests__/exportActionPlan.test.ts` (new)

**Interfaces:**
- Consumes: `buildActionPlan`, `verdictPhrase` (Task 1), `tallySeverity` from `~/utils/severityTally`; everything `html.ts` already imports.
- Produces: same signature `buildHtml(result, branding): string`. New section order: banner → h1/timestamp → grade hero (label now includes the verdict phrase) → severity tiles → conformance block → scanned → warnings → **Your Action Plan** → score profiles → executive summary → Category Scores table → Detailed Findings → footer. Nothing removed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/exportActionPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildHtml } from "../utils/exportFormats/html";
import type { ReportResult, BrandingInfo } from "../utils/exportFormats/shared";

const branding: BrandingInfo = {
  appName: "File Audit",
  siteUrl: "https://audit.example",
  wcagVersion: "2.2",
  wcagUnderstandingBase: "https://www.w3.org/WAI/WCAG22/Understanding/",
};

function result(): ReportResult {
  return {
    filename: "report.pdf",
    pageCount: 3,
    overallScore: 62,
    grade: "D",
    isScanned: false,
    executiveSummary: "Summary text",
    fileType: "pdf",
    categories: [
      {
        id: "title_language",
        label: "Document Title & Language",
        score: 40,
        grade: "F",
        severity: "Moderate",
        findings: ["No title set"],
      },
      {
        id: "text_extractability",
        label: "Text Extractability",
        score: 0,
        grade: "F",
        severity: "Critical",
        findings: ["No text layer <script>alert(1)</script>"],
      },
    ],
  };
}

describe("buildHtml — action plan section", () => {
  it("renders the plan between the hero and the category table, ordered Critical first", () => {
    const html = buildHtml(result(), branding);
    const plan = html.indexOf("Your Action Plan");
    expect(plan).toBeGreaterThan(-1);
    expect(plan).toBeLessThan(html.indexOf("Category Scores"));
    const first = html.indexOf("Make the text readable by screen readers");
    const second = html.indexOf("Give the document a title and set its language");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(second);
  });

  it("shows severity tiles with counts and the verdict phrase in the hero", () => {
    const html = buildHtml(result(), branding);
    expect(html).toContain("not ready to publish");
    expect(html).toMatch(/1[\s\S]{0,120}CRITICAL/);
    expect(html).toMatch(/1[\s\S]{0,120}MODERATE/);
  });

  it("keeps every legacy section (nothing removed)", () => {
    const html = buildHtml(result(), branding);
    for (const s of ["Executive Summary", "Category Scores", "Detailed Findings"]) {
      expect(html).toContain(s);
    }
  });

  it("escapes finding-derived text in plan output", () => {
    const html = buildHtml(result(), branding);
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("page-audit-shaped result (no categories): no plan, no pass card, no crash", () => {
    const pageAudit = { ...result(), categories: undefined } as unknown as ReportResult;
    const html = buildHtml(pageAudit, branding);
    expect(html).not.toContain("Your Action Plan");
    expect(html).not.toContain("Nothing to fix");
    expect(html).not.toContain("publish");
  });

  it("clean report renders the pass card instead of a plan", () => {
    const clean: ReportResult = {
      ...result(),
      grade: "A",
      overallScore: 100,
      categories: [
        {
          id: "title_language",
          label: "Document Title & Language",
          score: 100,
          grade: "A",
          severity: "Pass",
          findings: ["Title present"],
        },
      ],
    };
    const html = buildHtml(clean, branding);
    expect(html).toContain("Nothing to fix");
    expect(html).not.toContain("Your Action Plan");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/exportActionPlan.test.ts`
Expected: FAIL — no "Your Action Plan" in output.

- [ ] **Step 3: Implement**

In `apps/web/app/utils/exportFormats/html.ts`:

a. Add imports at the top:

```ts
import { buildActionPlan, verdictPhrase } from "~/utils/actionPlan";
import { tallySeverity } from "~/utils/severityTally";
```

b. Inside `buildHtml`, directly after the `const sc = (sev: ...)` helper near the top, add the guard and switch the two existing `result.categories.filter(...)` lines (`scoredCats`, `naCats`) to filter `planCats` instead — this also stops the pre-existing crash when a page-audit report (no `categories[]`) hits the SSR export path:

```ts
  // Guard: URL page-audit rows in shared_reports have no categories[].
  const planCats = Array.isArray(result.categories) ? result.categories : [];
```

Then, before the `return` statement, add:

```ts
  const tally = tallySeverity(planCats);
  const tile = (count: number, label: string, icon: string, color: string) =>
    `<div style="flex:1;border:1px solid ${count ? color + "40" : "#333"};background:${count ? color + "12" : "transparent"};border-radius:12px;padding:10px 12px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:${count ? color : "#888"};line-height:1.2">${count}</div>
      <div style="font-size:10px;font-weight:600;color:${count ? color : "#888"}">${icon} ${label}</div>
    </div>`;
  const tilesHtml = `<div style="display:flex;gap:8px;max-width:520px;margin:0 auto 24px">
    ${tile(tally.critical, "CRITICAL", "⛔", "#ef4444")}
    ${tile(tally.moderate, "MODERATE", "⚠", "#eab308")}
    ${tile(tally.minor, "MINOR", "ⓘ", "#3b82f6")}
  </div>`;

  const tilesOrEmpty = planCats.length ? tilesHtml : "";

  const plan = buildActionPlan(planCats, result.fileType);
  const planHtml = !planCats.length
    ? "" // page-audit shape: no plan section at all, never a false pass card
    : plan.length
    ? `<h2 style="font-size:18px;margin-bottom:4px">Your Action Plan</h2>
       <p style="font-size:12px;color:#888;margin:0 0 12px">Fix these in order, then re-upload to verify.</p>
       <ol style="list-style:none;margin:0 0 30px;padding:0">
       ${plan
         .map((s) => {
           const routes = s.routes
             .map(
               (r) =>
                 `<p style="font-size:13px;color:#ccc;margin:6px 0 0"><strong style="color:${r.tool === "source" ? "#86efac" : "#fbbf24"}">${escapeHtml(r.label)}:</strong> ${r.steps.map(escapeHtml).join(" → ")}</p>`,
             )
             .join("");
           return `<li style="background:#111;border:1px solid ${s.severity === "Critical" ? "#ef444435" : "#222"};border-radius:10px;padding:12px 16px;margin-bottom:10px">
             <p style="margin:0;font-size:14px"><strong style="color:${sc(s.severity)}">${s.rank}.</strong> <strong style="color:#fff">${escapeHtml(s.title)}</strong>
             <span style="color:${sc(s.severity)};background:${sc(s.severity)}15;padding:1px 8px;border-radius:12px;font-size:11px;margin-left:6px">${escapeHtml(s.severity)}</span></p>
             <p style="font-size:12px;color:#999;margin:6px 0 0">${escapeHtml(s.why)}</p>
             ${routes}
           </li>`;
         })
         .join("\n")}
       </ol>`
    : `<div style="background:#22c55e10;border:1px solid #22c55e30;border-radius:12px;padding:14px;margin-bottom:30px">
        <p style="color:#86efac;font-size:14px;font-weight:600;margin:0">✓ Nothing to fix — this document passes all automated checks.</p>
      </div>`;
```

c. Change the hero's grade-label line from:

```
    <p style="font-size:14px;color:${gc(result.grade)};font-weight:500;margin:0">${escapeHtml(gradeLabel(result.grade))}</p>
```

to:

```
    <p style="font-size:14px;color:${gc(result.grade)};font-weight:500;margin:0">${escapeHtml(planCats.length ? `${gradeLabel(result.grade)} — ${verdictPhrase(planCats)}` : gradeLabel(result.grade))}</p>
```

d. In the returned template, insert `${tilesOrEmpty}` on the line directly after the hero `</div>` (the one closing the `text-align:center;margin:30px 0` block), and insert `${planHtml}` directly after `${scannedHtml}\n  ${warningsHtml}` — i.e. the block order becomes:

```
  hero div
  ${tilesOrEmpty}
  ${conformanceHtml}
  ${scannedHtml}
  ${warningsHtml}
  ${planHtml}
  ${scoreProfilesHtml}
  … (Executive Summary, Category Scores, Detailed Findings — unchanged)
```

- [ ] **Step 4: Run the new test AND the existing export suites**

Run: `cd /Volumes/satechi/webdev/file-accessibility-audit/apps/web && pnpm vitest run app/__tests__/exportActionPlan.test.ts app/__tests__/reportExportBanner.test.ts app/__tests__/useReportExport.test.ts`
Expected: PASS all three.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/utils/exportFormats/html.ts apps/web/app/__tests__/exportActionPlan.test.ts
git commit -m "feat(web): buildHtml export mirrors the visual view (tiles + action plan)"
```

---

### Task 10: Print CSS, full verification, manual pass

**Files:**
- Modify: `apps/web/app/assets/css/main.css` (append inside the existing `@media print` block)

- [ ] **Step 1: Add print rules**

Locate the existing `@media print { … }` block in `apps/web/app/assets/css/main.css` (it already hides site chrome and expands `<details>`). Append inside it:

```css
  /* Visual report view: a printed/PDF'd report must show everything. */
  .tech-report-body,
  .plan-step-body {
    display: block !important;
  }
  .action-plan li,
  .category-bars li {
    break-inside: avoid;
  }
  /* Tiles and bars communicate with background color — keep it on paper. */
  .action-plan,
  .category-bars,
  [data-testid^="severity-tile-"] {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
```

- [ ] **Step 2: Full monorepo verification (exact commands, gate on exit codes)**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm lint
pnpm typecheck
pnpm build
echo "build exit: $?"   # MUST be 0 — never pipe the build (project rule)
pnpm -r test
```

Expected: all green; web suite count grows (7 new test files).

- [ ] **Step 3: Manual pass (dev server, both views, both color modes, print preview)**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
pnpm dev   # web on :5102, api on :5103
```

Checklist (upload any test PDF from `packages/analyzer` test fixtures, e.g. a known-bad one):
- Visual view renders by default; toggle → Detailed shows today's exact report; preference survives reload.
- Toggle also present + working on a shared report (`Share` a result, open `/report/<id>`).
- Light mode (shared page toggle): tiles/chips/strips legible (fix any contrast issue by bumping the `/10`–`/15` alpha backgrounds to `/15`–`/20` and using the `-500`-step text colors already specified).
- Evidence link opens the technical expander and scrolls to the category card.
- Browser print preview (⌘P) of the Visual view: plan steps and technical report fully expanded, tile/bar colors present, no clipped cards.
- HTML export downloads: from Visual view (snapshot contains expanded plan + technical report) and with JS console `document.querySelector('[data-report-content]')` absent — not applicable; just verify the file opens standalone and matches the screen.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit
git add apps/web/app/assets/css/main.css
git commit -m "feat(web): print rules for the visual report view"
```

- [ ] **Step 5: Hand off**

Implementation complete on `feat/report-visual-redesign`. Use superpowers:finishing-a-development-branch. **Release steps (CHANGELOG, versions ×3, README §Security + screenshots, data-retention §10, ANNOUNCEMENTS banner, tag, deploy via Forge) are a separate follow-up** per the project release checklist — ask the user before starting it.

---

## Self-review notes (kept for the executor)

- Spec coverage: toggle+parity (Tasks 2, 8), mapper+dictionary (1), hero/tiles/verdict (3), rail (4), bars w/ grade+severity parity (5), expander + conformance parity + `showScoreTable` (6), assembly + notice slot (7), pages + order test (8), export fallback (9), print + verification (10). Rollback tag already pushed (`pre-report-redesign`).
- Types cross-checked: `PlanStep`/`FixRoute`/`PLAN_COPY` (Task 1) match usages in Tasks 4, 7, 9; `ReportViewMode` (Task 2) matches Task 8; `wcagVersion` prop threaded to `TechnicalReport` from `useWcag().version` (Tasks 6→7).
- Known judgment calls an executor must NOT "fix": Detailed view stays byte-identical; `ScoreCard`/`IssuesSummary`/`ReportActionBanner` untouched; no analyzer/API edits; no new hex palettes.
- Page-audit guard (URL audits share `shared_reports` but have NO `categories[]`): GradeHero drops the publication clause (Task 3), ReportVisualView hides tiles/plan/bars/expander via `hasCategories` (Task 7), buildHtml emits no tiles/plan and switches its legacy `result.categories.filter` lines to the guarded `planCats` (Task 9). The green pass card must NEVER render for a category-less report — tests pin this in Tasks 3, 7, and 9.
