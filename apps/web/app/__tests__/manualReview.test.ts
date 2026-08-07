import "./test-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ManualReviewCard from "../components/ManualReviewCard.vue";
import { manualChecks, MANUAL_CHECKS } from "../utils/manualReview";
import { SCORING_PROFILES } from "@file-audit/shared";

// A document that scores 100 gets an empty action plan, and the report then
// had almost nothing to say to its author — who is reasonably curious what to
// look at next. The honest answer is that these checks verify accessibility
// structure EXISTS and almost none can judge whether it is CORRECT: alt text
// of "image" passes, a heading describing the wrong section passes, a reading
// order tagged in the wrong sequence passes if it is tagged at all.
//
// So the load-bearing property is that a PERFECT report still produces a
// substantial, actionable list — and that the list is built from the checks
// that PASSED, since the failed ones are already the action plan.

const cat = (id: string, score: number | null, label = id) => ({ id, label, score });

const PERFECT = [
  cat("text_extractability", 100, "Text Extractability"),
  cat("title_language", 100, "Document Title & Language"),
  cat("heading_structure", 100, "Heading Structure"),
  cat("alt_text", 100, "Alt Text on Images"),
  cat("link_quality", 100, "Link & URL Quality"),
  cat("reading_order", 100, "Reading Order"),
  cat("bookmarks", null, "Bookmarks / Navigation"),
];

const CONFORMANCE = {
  status: "no-automated-failures" as const,
  failures: [],
  notAssessed: [
    {
      sc: "1.4.3",
      name: "Contrast (Minimum)",
      level: "AA" as const,
      reason: "needs a human",
      url: "https://w3.org/a",
    },
    {
      sc: "2.5.8",
      name: "Target Size (Minimum)",
      level: "AA" as const,
      reason: "needs a live interaction",
      url: "https://w3.org/b",
    },
  ],
  headline: "No automated WCAG failures detected",
};

describe("manualChecks — built from what PASSED", () => {
  it("returns a prompt for every passing category it knows about", () => {
    const out = manualChecks(PERFECT);
    expect(out.map((c) => c.id)).toEqual([
      "text_extractability",
      "title_language",
      "heading_structure",
      "alt_text",
      "link_quality",
      "reading_order",
    ]);
  });

  it("skips categories that did NOT pass — those are the action plan", () => {
    // Repeating a failing category here would bury the one thing this list is
    // for, and would read as "we checked it and it's fine" beside a finding.
    const out = manualChecks([cat("alt_text", 50), cat("heading_structure", 100)]);
    expect(out.map((c) => c.id)).toEqual(["heading_structure"]);
  });

  it("skips categories that were never scored", () => {
    expect(manualChecks([cat("bookmarks", null)])).toEqual([]);
  });

  it("keeps the scorer's own order, so the heaviest checks read first", () => {
    const out = manualChecks(PERFECT);
    expect(out[0]!.id).toBe("text_extractability");
  });

  it("carries the category's own label rather than its id", () => {
    expect(manualChecks(PERFECT)[3]!.label).toBe("Alt Text on Images");
  });

  it("survives malformed input rather than throwing on a shared report", () => {
    expect(manualChecks(null)).toEqual([]);
    expect(manualChecks("junk" as never)).toEqual([]);
    expect(manualChecks([null as never, { score: 100 } as never])).toEqual([]);
  });

  it("covers every scoring category that can pass", () => {
    // A new category added to the profile without a prompt here would silently
    // vanish from an author's checklist. pdf_ua_compliance is excluded: it is
    // surfaced as guidance rather than scored (weight 0, never 100).
    const ids = Object.keys(SCORING_PROFILES.strict.weights).filter(
      (id) => id !== "pdf_ua_compliance",
    );
    const missing = ids.filter((id) => !MANUAL_CHECKS[id]);
    expect(missing).toEqual([]);
  });

  it("phrases every prompt as something to go and do", () => {
    // Not decorative: the failure mode for this copy is restating the check
    // ("alt text is present") instead of naming the judgment.
    for (const [id, c] of Object.entries(MANUAL_CHECKS)) {
      expect(c.verified.length, id).toBeGreaterThan(20);
      expect(c.confirm.length, id).toBeGreaterThan(60);
      expect(c.confirm, id).toMatch(/check|confirm|read|look|ask|tab through/i);
    }
  });
});

describe("ManualReviewCard — a perfect report still has a list", () => {
  it("renders a substantial checklist for a 100/A document", () => {
    const w = mount(ManualReviewCard, {
      props: { categories: PERFECT, conformance: CONFORMANCE },
    });
    const text = w.text();
    expect(text).toContain("Still worth checking by hand");
    // Every passing check contributes an entry.
    expect(w.findAll("ol > li").length).toBe(6);
    expect(text).toContain("Alt Text on Images");
    // The specific judgment automation cannot make.
    expect(text).toMatch(/“Image”, “logo” and a filename all pass this check/);
  });

  it("says plainly that nothing below is a failure", () => {
    const w = mount(ManualReviewCard, {
      props: { categories: PERFECT, conformance: CONFORMANCE },
    });
    expect(w.text()).toContain("Nothing below is a failure");
    expect(w.text()).toContain("Every automated check passed");
  });

  it("lists the criteria the tool does not evaluate, with links", () => {
    const w = mount(ManualReviewCard, {
      props: { categories: PERFECT, conformance: CONFORMANCE },
    });
    expect(w.text()).toContain("Not checked by this tool at all");
    expect(w.text()).toContain("1.4.3 Contrast (Minimum)");
    const hrefs = w.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toContain("https://w3.org/a");
  });

  it("reframes on a report that still has fixes, rather than claiming a pass", () => {
    const mixed = [cat("alt_text", 50, "Alt Text"), cat("heading_structure", 100, "Headings")];
    const w = mount(ManualReviewCard, {
      props: { categories: mixed, conformance: CONFORMANCE },
    });
    expect(w.text()).not.toContain("Every automated check passed");
    expect(w.text()).toContain("Separate from the fixes above");
  });

  it("renders nothing when there is no document to talk about", () => {
    // URL page-audit rows share the shared_reports table and carry no
    // categories; there is no per-check judgment to offer for those.
    const w = mount(ManualReviewCard, {
      props: { categories: [], conformance: null },
    });
    expect(w.find('[data-testid="manual-review"]').exists()).toBe(false);
  });
});

describe("the human stays in the loop on EVERY audit", () => {
  // The card originally rendered only when it had passing checks or unassessed
  // criteria to list — so a badly-failing document, the case that most needs a
  // person, could get no human-review statement at all. The warning is not a
  // consolation prize for a good score.
  const ALL_FAILING = [
    cat("text_extractability", 0, "Text Extractability"),
    cat("title_language", 50, "Document Title & Language"),
  ];

  it("warns on a document where NOTHING passed", () => {
    const w = mount(ManualReviewCard, { props: { categories: ALL_FAILING, conformance: null } });
    expect(w.find('[data-testid="manual-review"]').exists()).toBe(true);
    expect(w.text()).toContain("No automated audit — this one included — can tell you a document");
  });

  it("states the limit of automation regardless of score", () => {
    const cases: Array<[string, ReturnType<typeof cat>[]]> = [
      ["perfect", PERFECT],
      ["failing", ALL_FAILING],
      ["mixed", [cat("alt_text", 50), cat("heading_structure", 100)]],
    ];
    for (const [label, categories] of cases) {
      const w = mount(ManualReviewCard, { props: { categories, conformance: null } });
      expect(w.text(), label).toContain("a person has to look at the document");
      expect(w.text(), label).toContain("It can only tell you where it definitely is not");
    }
  });

  it("tells a failing document that clearing the plan is not the finish line", () => {
    // The strongest pull toward "done" is a fixed action plan, not a 100.
    const w = mount(ManualReviewCard, { props: { categories: ALL_FAILING, conformance: null } });
    expect(w.text()).toContain("will not, on its own, make the document accessible");
  });

  it("does not show that line on a document with nothing to fix", () => {
    const w = mount(ManualReviewCard, { props: { categories: PERFECT, conformance: CONFORMANCE } });
    expect(w.text()).not.toContain("will not, on its own, make the document accessible");
  });
});

describe("wiring — every surface that shows a report shows the checklist", () => {
  // The card first shipped into the Visual view only, while ScoreCard's copy
  // was changed to point at "the manual-review list". In the DETAILED view
  // that list did not exist, and since IssuesSummary is `v-if="rows.length"`
  // a clean report rendered NOTHING below the hero — reported as "where are
  // the findings?". A source scan, because mounting either page needs Nuxt's
  // own resolution (see dataRetentionVersion.test.ts for the precedent).
  const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");

  it.each([
    ["Visual view", "components/ReportVisualView.vue"],
    ["Detailed view — shared report page", "pages/report/[id].vue"],
    ["Detailed view — audit page", "pages/index.vue"],
  ])("%s renders ManualReviewCard", (_label, file) => {
    expect(read(file)).toContain("<ManualReviewCard");
  });

  it("passes it the categories and the conformance verdict on every surface", () => {
    // Without conformance the "not checked at all" list silently disappears,
    // which is the half a perfect report most needs.
    for (const file of [
      "components/ReportVisualView.vue",
      "pages/report/[id].vue",
      "pages/index.vue",
    ]) {
      const src = read(file);
      const tag = src.slice(src.indexOf("<ManualReviewCard"));
      const el = tag.slice(0, tag.indexOf("/>"));
      expect(el, file).toMatch(/:categories=/);
      expect(el, file).toMatch(/:conformance=/);
    }
  });
});
