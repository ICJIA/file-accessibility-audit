/**
 * The per-report Matterhorn projection + panel (v1.93.0).
 *
 * WHAT THIS PINS: the honesty contract. The panel regroups EXISTING report
 * evidence under the 31 checkpoints — the dangerous regressions are (a) an
 * aggregate count that reads as a second grade, (b) "Pass" claims software
 * cannot make, (c) a veraPDF rule silently dropped because its clause had no
 * mapping, and (d) marker drift — the analyzer rewording a finding so a
 * mapped issue silently unmaps (guarded by the REAL captured payload in
 * fixtures/analyzer-output.pdf.json).
 */
import "./test-helpers";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MatterhornReportPanel from "../components/MatterhornReportPanel.vue";
import {
  buildMatterhornProjection,
  checkpointForVeraClause,
  type MatterhornProjection,
} from "../utils/matterhornReport";

const fixturePath = path.join(import.meta.dirname, "fixtures", "analyzer-output.pdf.json");
const realReport: any = JSON.parse(readFileSync(fixturePath, "utf8"));

const rowById = (p: MatterhornProjection, id: string) => {
  const row = p.rows.find((r) => r.checkpoint.id === id);
  if (!row) throw new Error(`row ${id} missing`);
  return row;
};

/** Minimal PDF report shell the projection accepts. */
function pdfReport(over: Record<string, any> = {}) {
  return {
    fileType: "pdf",
    categories: [{ id: "text_extractability", score: 100, findings: [] }],
    conformance: { failures: [] },
    ...over,
  };
}

describe("buildMatterhornProjection — gating", () => {
  it("returns null for non-PDF reports (Matterhorn applies to PDF)", () => {
    expect(buildMatterhornProjection({ fileType: "docx", categories: [{ id: "x" }] })).toBeNull();
  });

  it("returns null for category-less payloads (URL page-audit rows must never grow the panel)", () => {
    expect(buildMatterhornProjection({ fileType: "pdf", categories: [] })).toBeNull();
    expect(buildMatterhornProjection({ fileType: "pdf" })).toBeNull();
  });
});

describe("buildMatterhornProjection — engine evidence mapping", () => {
  it("maps conformance failures to their checkpoints", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        conformance: {
          failures: [
            {
              sc: "1.1.1",
              category: "text_extractability",
              issue: "The document's security settings deny assistive-technology access…",
            },
            {
              sc: "1.1.1",
              category: "alt_text",
              issue: "2 mathematical formula(s) tagged <Formula>…",
            },
            {
              sc: "1.1.1",
              category: "alt_text",
              issue: "3 image(s) tagged as <Figure> have no /Alt.",
            },
            { sc: "3.1.1", category: "title_language", issue: "No default language is declared…" },
            { sc: "2.4.2", category: "title_language", issue: "The document has no title…" },
            { sc: "1.3.1", category: "table_markup", issue: "2 table(s) have no header cells…" },
            { sc: "1.3.1", category: "reading_order", issue: "1 tagged list(s)…" },
            { sc: "1.3.1", category: "link_quality", issue: "4 link(s) are not tagged…" },
            {
              sc: "4.1.2",
              category: "form_accessibility",
              issue: "2 form field(s) have no label…",
            },
          ],
        },
      }),
    )!;
    expect(rowById(p, "26").status).toBe("issues");
    expect(rowById(p, "17").status).toBe("issues");
    expect(rowById(p, "13").status).toBe("issues");
    expect(rowById(p, "11").status).toBe("issues");
    expect(rowById(p, "06").status).toBe("issues");
    expect(rowById(p, "15").status).toBe("issues");
    expect(rowById(p, "16").status).toBe("issues");
    expect(rowById(p, "28").status).toBe("issues");
  });

  it("maps a scanned-image 1.1.1 to checkpoint 08 and a tagging 1.3.1 to checkpoint 01", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        conformance: {
          failures: [
            {
              sc: "1.1.1",
              category: "text_extractability",
              issue: "No extractable text was found and the pages consist of images…",
            },
            {
              sc: "1.3.1",
              category: "text_extractability",
              issue: "The document has no tag structure (StructTreeRoot)…",
            },
          ],
        },
      }),
    )!;
    expect(rowById(p, "08").status).toBe("issues");
    expect(rowById(p, "01").status).toBe("issues");
  });

  it("maps sub-100 category scores to their checkpoints (headings → 14, bookmarks → 27)", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        categories: [
          { id: "heading_structure", score: 60, findings: [] },
          { id: "bookmarks", score: 45, findings: [] },
          { id: "reading_order", score: 85, findings: [] },
        ],
      }),
    )!;
    expect(rowById(p, "14").status).toBe("issues");
    expect(rowById(p, "27").status).toBe("issues");
    expect(rowById(p, "09").status).toBe("issues");
  });

  it("does not read a null (N/A) or 100 category score as an issue", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        categories: [
          { id: "heading_structure", score: 100, findings: [] },
          { id: "bookmarks", score: null, findings: [] },
        ],
      }),
    )!;
    expect(rowById(p, "14").status).toBe("clean");
    expect(rowById(p, "27").status).toBe("clean");
  });

  it("maps finding-text markers: filename-like title → 06, DisplayDocTitle unset → 07, unusable language → 11", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        categories: [
          {
            id: "title_language",
            score: 60,
            findings: [
              "The title looks like a filename or tool-generated string…",
              "The title is set, but the DisplayDocTitle viewer preference is not — viewers will show the filename…",
              'Language declared as "english" — this is not a usable language code…',
            ],
          },
        ],
      }),
    )!;
    expect(rowById(p, "06").status).toBe("issues");
    expect(rowById(p, "07").status).toBe("issues");
    expect(rowById(p, "11").status).toBe("issues");
  });

  it("does NOT trip checkpoint 07 on the POSITIVE DisplayDocTitle wording", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        categories: [
          {
            id: "title_language",
            score: 100,
            findings: [
              'Document title: "Annual Report" (shown by viewers — DisplayDocTitle is set)',
            ],
          },
        ],
      }),
    )!;
    expect(rowById(p, "07").status).toBe("clean");
  });

  it("maps the v1.92.0 advisory markers (Note IDs → 19, RoleMap → 02, layers → 20) without tripping on their all-good lines", () => {
    const withIssues = buildMatterhornProjection(
      pdfReport({
        categories: [
          {
            id: "reading_order",
            score: 100,
            findings: [
              "  Advisory — not scored: 2 note(s) have no /ID (Matterhorn 19-003). PDF/UA requires one…",
              "  Advisory — not scored: 1 note(s) reuse another note's /ID (Matterhorn 19-004)…",
              "  Advisory — not scored: 2 role-map entries are circular (A, B) … (Matterhorn 02-003)…",
              "  Advisory — not scored: the RoleMap remaps 1 STANDARD structure type(s) (P → Figure) — … (Matterhorn 02-004)…",
              "  Advisory — not scored: 1 layer configuration(s) have no /Name (Matterhorn 20-001)…",
            ],
          },
        ],
      }),
    )!;
    expect(rowById(withIssues, "19").status).toBe("issues");
    expect(rowById(withIssues, "02").status).toBe("issues");
    expect(rowById(withIssues, "20").status).toBe("issues");

    const allGood = buildMatterhornProjection(
      pdfReport({
        categories: [
          {
            id: "reading_order",
            score: 100,
            findings: [
              "  All notes carry a unique /ID — assistive technology can link each reference to its note (Matterhorn 19-003/19-004)",
              "  Optional-content layers are present (1 configuration(s)) — configurations are named and none auto-switch content (Matterhorn 20)",
            ],
          },
        ],
      }),
    )!;
    expect(rowById(allGood, "19").status).toBe("clean");
    expect(rowById(allGood, "20").status).toBe("clean");
  });

  it("dedups identical evidence from the gate and the category score", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        categories: [{ id: "table_markup", score: 40, findings: [] }],
        conformance: {
          failures: [
            { sc: "1.3.1", category: "table_markup", issue: "2 table(s) have no header cells…" },
          ],
        },
      }),
    )!;
    // Two distinct labels (gate wording + category wording), each once.
    expect(rowById(p, "15").evidence).toHaveLength(2);
  });
});

describe("buildMatterhornProjection — veraPDF mapping and the tri-state", () => {
  it("maps clauses to checkpoints (7.4 → 14, 7.21.x → 31, 5 → 06) and keyword-splits 7.1/7.2", () => {
    expect(checkpointForVeraClause("7.4", "heading levels")).toBe("14");
    expect(checkpointForVeraClause("7.21.4.2", "CIDSet incomplete")).toBe("31");
    expect(checkpointForVeraClause("5", "PDF/UA identifier missing in metadata")).toBe("06");
    expect(checkpointForVeraClause("7.1", "ViewerPreferences DisplayDocTitle not set")).toBe("07");
    expect(checkpointForVeraClause("7.1", "dc:title missing from XMP metadata")).toBe("06");
    expect(checkpointForVeraClause("7.1", "Content shall be marked as Artifact or tagged")).toBe(
      "01",
    );
    expect(checkpointForVeraClause("7.2", "characters not mapped to Unicode")).toBe("10");
    expect(checkpointForVeraClause("7.2", "natural language shall be declared")).toBe("11");
    expect(checkpointForVeraClause("7.2", "some unrecognized rule")).toBeNull();
    expect(checkpointForVeraClause("9.9", "unknown future clause")).toBeNull();
  });

  it("groups veraPDF failures under their checkpoints with clause + description verbatim", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        pdfUaVerdict: {
          available: true,
          passed: false,
          totalFailureCount: 7,
          failures: [
            {
              clause: "7.5",
              ruleId: "7.5-1",
              description: "Table header cell missing Scope",
              count: 4,
            },
            {
              clause: "7.21.6",
              ruleId: "7.21.6-1",
              description: "Glyph not mapped to Unicode",
              count: 3,
            },
          ],
        },
      }),
    )!;
    expect(p.veraPdfRan).toBe(true);
    const tables = rowById(p, "15");
    expect(tables.status).toBe("issues");
    const first = tables.evidence[0]!;
    expect(first.source).toBe("verapdf");
    expect(first.label).toContain("7.5");
    expect(first.label).toContain("Table header cell missing Scope");
    expect(first.label).toContain("4");
    expect(rowById(p, "31").status).toBe("issues");
  });

  it("routes unmappable veraPDF rules to the visible unmapped bucket — never dropped", () => {
    const p = buildMatterhornProjection(
      pdfReport({
        pdfUaVerdict: {
          available: true,
          passed: false,
          totalFailureCount: 1,
          failures: [{ clause: "9.9", ruleId: "9.9-1", description: "future rule", count: 1 }],
        },
      }),
    )!;
    expect(p.unmapped).toHaveLength(1);
    expect(p.unmapped[0]!.label).toContain("9.9");
    expect(p.unmapped[0]!.label).toContain("future rule");
  });

  it("marks veraPDF-only checkpoints 'unchecked' when the verdict is absent, available:false, or could-not-validate", () => {
    for (const verdict of [
      undefined,
      null,
      { available: false, failures: [], totalFailureCount: 0 },
      { available: true, error: "veraPDF timed out", totalFailureCount: 0, failures: [] },
    ]) {
      const p = buildMatterhornProjection(pdfReport({ pdfUaVerdict: verdict }))!;
      expect(p.veraPdfRan, JSON.stringify(verdict)).toBe(false);
      // 10 Character Mappings and 21 Embedded Files are veraPDF-covered.
      expect(rowById(p, "10").status, JSON.stringify(verdict)).toBe("unchecked");
      expect(rowById(p, "21").status, JSON.stringify(verdict)).toBe("unchecked");
    }
  });

  it("keeps the human-judgment checkpoints 'human' in every state (03, 04, 22)", () => {
    const withVera = buildMatterhornProjection(
      pdfReport({
        pdfUaVerdict: { available: true, passed: true, totalFailureCount: 0, failures: [] },
      }),
    )!;
    const withoutVera = buildMatterhornProjection(pdfReport())!;
    for (const p of [withVera, withoutVera]) {
      expect(rowById(p, "03").status).toBe("human");
      expect(rowById(p, "04").status).toBe("human");
      expect(rowById(p, "22").status).toBe("human");
    }
  });
});

describe("buildMatterhornProjection — REAL captured payload (marker-drift guard)", () => {
  it("projects the analyzer-output fixture: 31 rows, title/language issues land on 06/11, veraPDF absent → unchecked", () => {
    const p = buildMatterhornProjection(realReport)!;
    expect(p).not.toBeNull();
    expect(p.rows).toHaveLength(31);
    // The fixture (grade D) carries confirmed 2.4.2 + 3.1.1 failures.
    expect(rowById(p, "06").status).toBe("issues");
    expect(rowById(p, "11").status).toBe("issues");
    // Captured before veraPDF ran on audits → tri-state false → unchecked.
    expect(p.veraPdfRan).toBe(false);
    expect(rowById(p, "10").status).toBe("unchecked");
    // Human rows stay human on real payloads too.
    expect(rowById(p, "04").status).toBe("human");
  });
});

describe("MatterhornReportPanel.vue — the honesty contract", () => {
  const issuesReport = pdfReport({
    categories: [{ id: "heading_structure", score: 60, findings: [] }],
    pdfUaVerdict: {
      available: true,
      passed: false,
      totalFailureCount: 1,
      failures: [{ clause: "9.9", ruleId: "9.9-1", description: "future rule", count: 1 }],
    },
  });

  it("collapses by default and expands on the toggle", async () => {
    const w = mount(MatterhornReportPanel, { props: { result: issuesReport } });
    const toggle = w.get('[data-testid="matterhorn-report-toggle"]');
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(w.text()).not.toContain("Real content tagged");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(w.text()).toContain("Real content tagged");
    expect(w.text()).toContain("Fonts");
  });

  it("NEVER renders an aggregate count or a bare Pass — the second-grade trap", async () => {
    const w = mount(MatterhornReportPanel, { props: { result: issuesReport } });
    await w.get('[data-testid="matterhorn-report-toggle"]').trigger("click");
    const text = w.text();
    expect(text).not.toMatch(/\d+\s+of\s+31/);
    expect(text).not.toMatch(/\d+\s*\/\s*31/);
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\bPass\b/);
    expect(text).not.toMatch(/\bpassed\b/i);
    // Statuses are words:
    expect(text).toContain("Issues found");
    expect(text).toContain("No machine-detected issues");
    expect(text).toContain("Needs human review");
  });

  it("renders the unmapped bucket and the veraPDF-missing note in their respective states", async () => {
    const w1 = mount(MatterhornReportPanel, { props: { result: issuesReport } });
    await w1.get('[data-testid="matterhorn-report-toggle"]').trigger("click");
    expect(w1.find('[data-testid="matterhorn-unmapped"]').exists()).toBe(true);
    expect(w1.find('[data-testid="matterhorn-vera-missing"]').exists()).toBe(false);

    const w2 = mount(MatterhornReportPanel, { props: { result: pdfReport() } });
    await w2.get('[data-testid="matterhorn-report-toggle"]').trigger("click");
    expect(w2.find('[data-testid="matterhorn-vera-missing"]').exists()).toBe(true);
    expect(w2.text()).toContain("Not machine-checked");
  });

  it("renders nothing for non-PDF reports and category-less payloads", () => {
    expect(
      mount(MatterhornReportPanel, {
        props: { result: { fileType: "docx", categories: [{ id: "x" }] } },
      }).text(),
    ).toBe("");
    expect(mount(MatterhornReportPanel, { props: { result: { fileType: "pdf" } } }).text()).toBe(
      "",
    );
  });
});

describe("report-surface wiring", () => {
  // The classic trap: a tested component nothing renders. All THREE render
  // sites (ReportVisualView covers Visual on both pages; the two Detailed
  // templates are inline per page) must mount the panel.
  it("ReportVisualView, index.vue (Detailed), and report/[id].vue (Detailed) all render <MatterhornReportPanel>", () => {
    const sites = [
      ["..", "components", "ReportVisualView.vue"],
      ["..", "pages", "index.vue"],
      ["..", "pages", "report", "[id].vue"],
    ];
    for (const parts of sites) {
      const src = readFileSync(path.join(import.meta.dirname, ...parts), "utf8");
      expect(src, parts.join("/")).toMatch(/<MatterhornReportPanel/);
      expect(src, parts.join("/")).toMatch(
        /import MatterhornReportPanel from "~\/components\/MatterhornReportPanel.vue"/,
      );
    }
  });
});
