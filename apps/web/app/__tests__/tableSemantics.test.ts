import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Table semantics regression (Task F6): every <table> in the app must have
// a <caption> (visually-hidden via sr-only is fine — it's the table's
// accessible name for screen-reader / table-navigation users) and every
// <th> must declare scope="col" (every table in this app is a simple
// single-header-row table; none currently mix row + column headers).
//
// Source-inspection style (matches accessibility.test.ts's "Contrast
// Regression" / "Link Accessibility" sections) rather than mounting each
// component — several of these live inside large page components with
// heavy Nuxt-composable dependencies, and the invariant being checked is a
// property of the raw template markup, not of any runtime interaction.
//
// ReportsTable.vue (used by history.vue / my-history.vue, Task F3) and
// ReportContent.vue's score table (Task F6) already have dedicated
// component-level a11y tests (ReportsTable.test.ts, report-content.test.ts)
// — included here too for one single source of truth on the full sweep.
// ---------------------------------------------------------------------------

function readSource(file: string): string {
  return readFileSync(resolve(__dirname, "..", file), "utf-8");
}

/** Count of literal `<table` tag opens in the template (ignores doc-comment mentions). */
function countTemplateTables(source: string): number {
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);
  const template = templateMatch ? templateMatch[1]! : source;
  return (template.match(/<table[\s>]/g) || []).length;
}

function countTemplateCaptions(source: string): number {
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);
  const template = templateMatch ? templateMatch[1]! : source;
  return (template.match(/<caption[\s>]/g) || []).length;
}

function countTemplateThs(source: string): number {
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);
  const template = templateMatch ? templateMatch[1]! : source;
  return (template.match(/<th[\s>]/g) || []).length;
}

function countTemplateScopedThs(source: string): number {
  const templateMatch = source.match(/<template>([\s\S]*?)<\/template>/);
  const template = templateMatch ? templateMatch[1]! : source;
  return (template.match(/<th[^>]*\bscope="col"/g) || []).length;
}

const filesWithTables = [
  "components/ReportsTable.vue",
  "components/ReportContent.vue",
  "components/TechnicalExplainer.vue",
  "components/dataRetention/Section05Tools.vue",
  "components/dataRetention/Section07RetentionTable.vue",
  "pages/wcag-2-2.vue",
  "pages/technical-details.vue",
  "pages/remediate/[jobId].vue",
];

describe("Table semantics: every <table> has a <caption> (Task F6)", () => {
  for (const file of filesWithTables) {
    it(`${file}: one <caption> per <table>`, () => {
      const source = readSource(file);
      const tables = countTemplateTables(source);
      const captions = countTemplateCaptions(source);
      expect(tables).toBeGreaterThan(0);
      expect(captions).toBe(tables);
    });
  }
});

describe('Table semantics: every <th> has scope="col" (Task F6)', () => {
  for (const file of filesWithTables) {
    it(`${file}: every <th> declares scope="col"`, () => {
      const source = readSource(file);
      const ths = countTemplateThs(source);
      const scoped = countTemplateScopedThs(source);
      expect(ths).toBeGreaterThan(0);
      expect(scoped).toBe(ths);
    });
  }
});
