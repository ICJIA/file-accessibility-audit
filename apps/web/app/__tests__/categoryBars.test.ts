import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CategoryBars from "../components/CategoryBars.vue";

const cats = [
  {
    id: "text_extractability",
    label: "Text Extractability",
    score: 0,
    grade: "F",
    severity: "Critical",
  },
  { id: "alt_text", label: "Alt Text on Images", score: 70, grade: "C", severity: "Moderate" },
  { id: "bookmarks", label: "Bookmarks / Navigation", score: 100, grade: "A", severity: "Pass" },
  {
    id: "reading_order",
    label: "Reading Order",
    score: null,
    grade: null,
    severity: null,
    notAssessed: true,
  },
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

describe("every bar is measured against the same track (2026-08-31 bug report)", () => {
  // Reported from a real report: a category scoring 94 drew a LONGER bar than
  // the 100s above it. The fill is a percentage of the track, the track is
  // flex-1, and the severity chip beside it was free-width — so "Minor" left a
  // wider track than "No issues found", and 94% of the wider one beat 100% of
  // the narrower. Stacked bars are only meaningful if the tracks match.
  const rows = [
    {
      id: "text_extractability",
      label: "Text Extractability",
      score: 100,
      grade: "A",
      severity: "No issues found",
    },
    { id: "link_quality", label: "Link & URL Quality", score: 94, grade: "A", severity: "Minor" },
    { id: "reading_order", label: "Reading Order", score: 100, grade: "A", severity: null },
  ];
  const mountBars = () => mount(CategoryBars, { props: { categories: rows as never } });

  it("gives the severity column one fixed width, whatever the wording", () => {
    // Asserted only `cells.length === 3` until 2026-08-31 — i.e. "three rows
    // rendered", nothing about width. Deleting `w-[6.5rem]` from the component
    // left it green, which is how a 94 came to draw a longer bar than a 100.
    const w = mountBars();
    // The LAST COLUMN of the row, found structurally — not by the class we
    // are about to assert, which would be circular. The severity chip is a
    // child of this cell, so `findAll("span").at(-1)` returns the chip, not
    // the track-defining column.
    const cells = w
      .findAll('[data-testid="bar-row"]')
      .map((r) => r.element.lastElementChild as HTMLElement);
    expect(cells.length).toBe(3);
    for (const [i, cell] of cells.entries()) {
      const cls = [...cell.classList];
      expect(cls, `row ${i} severity cell`).toContain("w-[7rem]");
      expect(cls, `row ${i} severity cell`).toContain("flex-shrink-0");
    }
    // One width for all of them: "No issues found", "Minor" and the empty slot
    // must reserve the same track, or the bars beside them start at different x.
    const widths = new Set(
      cells.map((c) => [...c.classList].find((k) => /^w-\[/.test(k)) ?? "MISSING"),
    );
    expect(widths.size, `severity cells use ${widths.size} different widths`).toBe(1);
  });

  it("renders a severity slot on EVERY row — including one with no severity", () => {
    // A missing chip is a wider track, which is the same bug by another route.
    const w = mountBars();
    for (const row of w.findAll('[data-testid="bar-row"]')) {
      const fixed = row.findAll("span").filter((s) => s.classes().includes("w-[7rem]"));
      expect(fixed.length, row.attributes("aria-label")).toBe(1);
    }
  });

  it("keeps the fill a plain percentage of its own track", () => {
    const w = mountBars();
    const widths = w.findAll('[data-testid="bar-fill"]').map((f) => f.attributes("style"));
    expect(widths[0]).toContain("width: 100%");
    expect(widths[1]).toContain("width: 94%");
    expect(widths[2]).toContain("width: 100%");
  });
});
