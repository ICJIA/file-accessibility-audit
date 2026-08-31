/**
 * The PDF catalog, one describe per practice, four statuses each (or fewer,
 * where the analyzer itself never emits a line for that status — see the
 * notes on single-h1, font-embedding's exempt case, and the several
 * advisory-only practices below).
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: an empty or unrecognised findings
 * list yields NOT CHECKED, never MET. The section renders every practice
 * always, which is only honest while a green check requires the analyzer to
 * have actually said so.
 *
 * Every fixture string below is copied VERBATIM from packages/analyzer. If a
 * test here fails after an analyzer change, the catalog's matcher is stale —
 * fix the matcher, do not loosen the test.
 *
 * Several fixtures deliberately include a "positive" line ALONGSIDE the
 * advisory/failure line being tested, because the analyzer pushes that
 * positive line unconditionally — it sits after the advisory with no early
 * return in between, so a real document carries both. A fixture that
 * omitted the positive line would not prove the detect() checks its NOT MET
 * / NOT APPLICABLE condition BEFORE its MET condition, which is exactly the
 * class of bug this file is designed to catch.
 */
import { describe, it, expect } from "vitest";
import { PDF_PRACTICES } from "../utils/bestPractices/pdf";
import { buildContext } from "../utils/bestPractices/types";

const practice = (id: string) => {
  const p = PDF_PRACTICES.find((x) => x.id === id);
  if (!p) throw new Error(`no practice with id "${id}"`);
  return p;
};

const run = (id: string, findings: string[], pageCount = 10) =>
  practice(id).detect(buildContext({ findings }, "pdf", pageCount));

// ---- verbatim analyzer output, packages/analyzer/src/scoring/pdf.ts -------

const HEADING_GAPS =
  "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 14 (Headings)), not a WCAG 2.1 failure, so your grade is not affected. Screen-reader users may still wonder what they missed at the skipped level.";
// Shaped like a REAL document's findings, not a convenient one: once pdfjs
// resolves any heading text, "--- Heading Outline ---" opens a SECOND
// signal group (analyzer common.ts:423) after the Heading Tree flow line —
// and apps/web/app/utils/findings.ts reassigns the open group on every
// "---" line and never restores it, so the skip lines below land in
// Heading Outline, not Heading Tree. A fixture that put them directly
// under "--- Heading Tree ---" (the old shape here) would hide a matcher
// that only reads that one group.
const HEADING_TREE_GROUP = [
  "--- Heading Tree ---",
  "  H1 → H2 → H1 → H1 → H3 → H5",
  "--- Heading Outline ---",
  '  H1 "Introduction"',
  "  Heading hierarchy skip: H1 → H3 (skipped H2)",
  "  Heading hierarchy skip: H3 → H5 (skipped H4)",
];
const HEADING_OK = "Found 6 heading tags with logical hierarchy";
const NO_HEADINGS = "No heading tags found in the document structure";
// A second, distinct analyzer N/A line for the identical fact (no headings
// at all) — the SHORT-document branch, gated on totalPageCount/paragraphCount
// rather than heading count, and worded entirely differently.
const SHORT_DOC_NO_HEADINGS =
  "No headings were found. Short documents may not need them; longer documents should use H1–H6 tags so screen-reader users can navigate.";

// A minimal NOT-MET-triggering fixture per practice, used only by the
// forbidden-phrasing sweep below — evidence and fix text are produced by
// detect(), not stored as static strings, so the sweep has to actually run
// each practice to see them. Every line here is copied verbatim from the
// fixtures used in that practice's own describe block further down.
const NOT_MET_TRIGGERS: Record<string, { findings: string[]; pageCount?: number }> = {
  "heading-level-order": { findings: [HEADING_GAPS] },
  "heading-convention": {
    findings: [
      "PDF/UA only — not scored: 3 generic <H> heading(s) appear alongside the numbered <H1>–<H6> headings. PDF/UA prohibits mixing the two conventions in one document (Matterhorn 14-002); WCAG 2.1 does not — your grade is not affected — but screen-reader users lose their depth in an otherwise numbered outline where those headings sit.",
    ],
  },
  "heading-numbered-levels": {
    findings: [
      "PDF/UA only — not scored: only generic <H> tags were found (not H1–H6). The headings are identifiable to assistive technology, but they carry no level, so the outline has no depth. WCAG 2.1 does not require numbered levels — your grade is not affected — but PDF/UA (clause 7.4) does.",
    ],
  },
  "heading-content": {
    // Round 2: the advisory alone no longer reaches NOT MET — the gate is
    // the group's count lines now, so the trigger needs the group itself.
    findings: [
      "--- Do the Headings Read Like Headings? ---",
      "  2 heading tag(s) carry no text at all — a screen-reader user who jumps to one lands on silence.",
      "  4 of 6 heading tag(s) (67%) read as real headings. Navigating this document by heading — which is how most screen-reader users move through a long report — mostly lands on blanks and half-sentences.",
    ],
  },
  "single-h1": {
    findings: [
      "Found 3 H1 headings. No WCAG criterion requires a single H1, so this does not affect the score — but many style guides recommend one top-level heading (the document title), with sections demoted to H2 and below, so the outline has a single root.",
    ],
  },
  "reading-order-fidelity": {
    findings: [
      "Advisory — not scored: the tagged order agreed with the content stream's draw order on 62% of comparable content. Divergence is not automatically wrong — remediated documents re-order tags away from a bad draw order on purpose — so this cannot be scored automatically and your grade is not affected. Verify with a screen reader or Acrobat's Order panel which side reflects the true reading sequence.",
    ],
  },
  bookmarks: {
    findings: [
      "Advisory — not scored: this document has 24 pages and no bookmarks. No WCAG 2.1 criterion requires bookmarks in a single document (2.4.5 Multiple Ways applies to sets of pages), so your grade is not affected — but Adobe Acrobat's own checker flags long documents without them, and they remain the fastest way for every reader, screen-reader users included, to move around a long PDF.",
    ],
    pageCount: 24,
  },
  "font-embedding": {
    findings: [
      "PDF/UA only — not scored: 2 non-embedded font(s) may cause garbled text on systems without these fonts: Wingdings, Symbol. No WCAG success criterion requires font embedding — a substituted font still renders and still reads aloud — so this does not affect your grade. PDF/UA (ISO 14289, clause 7.21) does require it.",
    ],
  },
  "display-doc-title": {
    findings: [
      "PDF/UA only — not scored: the title is set, but the DisplayDocTitle viewer preference is off, so viewers show the FILENAME in the title bar instead of this title. WCAG 2.1 asks for a describing title, which this document has — your grade is not affected. PDF/UA (clause 7.1) requires the flag as well.",
    ],
  },
  "table-scope-simple": {
    findings: [
      "PDF/UA only — not scored: 4 header cell(s) across 2 table(s) have no /Scope. Each of those tables has its headers along a single edge with nothing spanned, so the header-to-data relationship is already determinable and WCAG 1.3.1 is satisfied — your grade is not affected. PDF/UA (ISO 14289) asks for /Scope regardless, so setting it is worth doing if you are aiming at PDF/UA conformance as well as the law.",
    ],
  },
  "table-scope-with-headers": {
    findings: [
      "Advisory — not scored: 2 table(s) rely on /Headers associations without /Scope on the <TH> cells. That is complete and spec-correct; adding Scope as well is belt-and-braces for viewers with partial /Headers support.",
    ],
  },
  "nested-tables": {
    findings: [
      "PDF/UA only — not scored: a nested table is not a WCAG failure — properly tagged, its relationships are still determinable — so this does not affect your grade. It is, however, genuinely hard to navigate by keyboard and by screen reader.",
    ],
  },
  "descriptive-link-text": {
    findings: [
      'Advisory — not scored: 3 of 12 link(s) use non-descriptive text — empty, a vague phrase such as "click here" / "read more", or too short to mean anything on its own. WCAG 2.4.4 (Level A) allows a link\'s purpose to come from the sentence around it, which no automated check can weigh — judging the text alone is a AAA rule (2.4.9) — so your grade is not affected. Descriptive link text is still kinder to screen-reader users, who often pull up links as a bare list.',
    ],
  },
  "raw-url-link-text": {
    findings: [
      "2 link(s) use the raw URL as their visible text. This satisfies WCAG 2.4.4 (the destination is determinable) and is not scored against you, but a descriptive label reads better in a screen reader's list of links.",
    ],
  },
  "nested-structure-tree": {
    findings: [
      "Structure tree depth: 1 level(s)",
      "Advisory — not scored: the structure tree is flat (no meaningful nesting) — the document has tags in a single sequence rather than a nested hierarchy of sections. That sequence still gives assistive technology a reading order, so your grade is not affected, but nesting makes long documents far easier to navigate.",
    ],
  },
  "character-mapping": {
    findings: [
      "--- Character Mapping (Matterhorn 10) ---",
      "  150 extracted character(s) cannot be mapped to readable text (8% of the text layer) — the glyphs paint on screen, but they extract as private-use symbols a screen reader cannot pronounce.",
      "Advisory — not scored: a count this size is often symbol-font bullets or dingbats, which read as decoration — your grade is not affected. Verify the affected passages read correctly with a screen reader; if they are real words, re-export from the source application.",
    ],
  },
  "content-in-tag-tree": {
    findings: [
      "--- Content Outside the Tag Structure (Matterhorn 01) ---",
      "  40 visible character(s) — 3% of the page text — are painted outside the tagged content (page 2). They are neither in the reading order nor marked as decorative artifacts, so a screen reader following the tags never encounters them.",
      "  Advisory — not scored: an amount this small is often stray export residue. Verify the named pages when convenient.",
    ],
  },
  "list-labels": {
    findings: [
      "2 list(s) have no <Lbl> (bullet/number) elements — optional per ISO 32000 and not penalized, but adding <Lbl> helps screen readers announce each item's marker",
    ],
  },
  "footnote-ids": {
    findings: [
      "--- Footnotes & Endnotes (<Note>) ---",
      "4 <Note> tag(s) detected (footnotes, endnotes, or labeled notes)",
      "  Advisory — not scored: 2 note(s) have no /ID (Matterhorn 19-003). PDF/UA requires one so assistive technology can link the in-text reference to its note; Word footnote exports commonly omit it.",
    ],
  },
};

describe("heading-level-order", () => {
  it("is NOT MET and shows the document's own heading sequence and each skip", () => {
    // HEADING_OK is included: pdf.ts:924 pushes it unconditionally, so a
    // real gapped document's findings carry it too (see FIX 1 in the task
    // report — this fixture used to omit it, which let a branch-order bug
    // pass unnoticed).
    const r = run("heading-level-order", [HEADING_GAPS, ...HEADING_TREE_GROUP, HEADING_OK]);
    expect(r.status).toBe("not-met");
    // The specific thing an author asked to see.
    expect(r.block?.lines).toContain("H1 → H2 → H1 → H1 → H3 → H5");
    expect(r.evidence.join(" ")).toMatch(/H1 → H3 \(skipped H2\)/);
    expect(r.evidence.join(" ")).toMatch(/H3 → H5 \(skipped H4\)/);
    expect(r.fix?.source).toBeTruthy();
    expect(r.fix?.app).toBeTruthy();
  });

  it("is MET when the analyzer says the hierarchy is sound", () => {
    const r = run("heading-level-order", [HEADING_OK, ...HEADING_TREE_GROUP.slice(0, 2)]);
    expect(r.status).toBe("met");
    expect(r.block?.lines).toContain("H1 → H2 → H1 → H1 → H3 → H5");
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    const r = run("heading-level-order", [NO_HEADINGS]);
    expect(r.status).toBe("not-applicable");
  });

  it("is NOT APPLICABLE for the SHORT-document no-headings line too — a second, distinct analyzer N/A line for the same fact", () => {
    expect(run("heading-level-order", [SHORT_DOC_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — never MET — when the analyzer said nothing either way", () => {
    expect(run("heading-level-order", []).status).toBe("not-checked");
    expect(run("heading-level-order", ["Structure tree depth: 7 level(s)"]).status).toBe(
      "not-checked",
    );
  });
});

describe("heading-convention", () => {
  const MIXED =
    "PDF/UA only — not scored: 3 generic <H> heading(s) appear alongside the numbered <H1>–<H6> headings. PDF/UA prohibits mixing the two conventions in one document (Matterhorn 14-002); WCAG 2.1 does not — your grade is not affected — but screen-reader users lose their depth in an otherwise numbered outline where those headings sit.";
  const ALL_GENERIC =
    "PDF/UA only — not scored: only generic <H> tags were found (not H1–H6). The headings are identifiable to assistive technology, but they carry no level, so the outline has no depth. WCAG 2.1 does not require numbered levels — your grade is not affected — but PDF/UA (clause 7.4) does.";

  it("is NOT MET when generic and numbered headings are mixed, alongside the unconditional MET line", () => {
    // pdf.ts pushes "Found N heading tags with logical hierarchy"
    // unconditionally once levels are computed — including when the mixed-
    // convention advisory also fired. The mixed check must win.
    const r = run("heading-convention", [MIXED, HEADING_OK]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/3 heading/);
  });

  it("is MET when the analyzer says the hierarchy is sound (one convention throughout)", () => {
    expect(run("heading-convention", [HEADING_OK]).status).toBe("met");
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("heading-convention", [NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT APPLICABLE for the SHORT-document no-headings line too", () => {
    expect(run("heading-convention", [SHORT_DOC_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("cross-references the H1 count on a MET document with more than one H1 (2026-08-31)", () => {
    // Reported from a real 51-page report: seven H1s, no skipped level, so
    // this row reads MET and prints a tree full of H1s under a green check —
    // which reads as an endorsement of the whole outline. The multiple-H1
    // finding is real and lives one row above ("One top-level heading"), but
    // nothing here said so.
    const r = run("heading-level-order", [
      HEADING_OK,
      "Found 7 H1 headings. No WCAG criterion requires a single H1, so this does not affect the score.",
    ]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(/7 H1 headings/);
    expect(r.evidence.join(" ")).toMatch(/One top-level heading/);
  });

  it("says nothing extra when the document has exactly one H1, or no H1 line at all", () => {
    expect(run("heading-level-order", [HEADING_OK]).evidence.join(" ")).not.toMatch(
      /top-level heading/,
    );
    // "Found 1 H1 headings" is not a shape the analyzer emits (it speaks up
    // only above one), but the guard must be on the COUNT, not on presence.
    expect(
      run("heading-level-order", [HEADING_OK, "Found 1 H1 headings."]).evidence.join(" "),
    ).not.toMatch(/top-level heading/);
  });

  it("is NOT APPLICABLE when every heading is generic — and points at the row that flags it", () => {
    // All-generic is mutually exclusive with the mixed-convention check (the
    // analyzer returns before computing genericHCount at all); "no finding"
    // was untrue when heading-numbered-levels reads NOT MET one row away.
    const r = run("heading-convention", [ALL_GENERIC]);
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/Numbered heading levels/);
    expect(run("heading-convention", []).status).toBe("not-checked");
  });
});

describe("heading-numbered-levels", () => {
  const ALL_GENERIC =
    "PDF/UA only — not scored: only generic <H> tags were found (not H1–H6). The headings are identifiable to assistive technology, but they carry no level, so the outline has no depth. WCAG 2.1 does not require numbered levels — your grade is not affected — but PDF/UA (clause 7.4) does.";
  const MIXED =
    "PDF/UA only — not scored: 3 generic <H> heading(s) appear alongside the numbered <H1>–<H6> headings. PDF/UA prohibits mixing the two conventions in one document (Matterhorn 14-002); WCAG 2.1 does not — your grade is not affected — but screen-reader users lose their depth in an otherwise numbered outline where those headings sit.";

  it("is NOT MET when every heading is generic", () => {
    // No coexistence hazard to guard: the analyzer RETURNS immediately
    // after this advisory, so "logical hierarchy" never appears alongside
    // it — unlike the other heading practices.
    const r = run("heading-numbered-levels", [ALL_GENERIC]);
    expect(r.status).toBe("not-met");
  });

  it("is NOT MET on a MIXED document, even though the unconditional hierarchy line is also present", () => {
    // hasNumberedHeadings only needs ONE numbered heading, which a mixed
    // document has — so pdf.ts:924 is reached and coexists with the mixed
    // advisory. Without the mixed check this reads MET here while
    // heading-convention correctly reads NOT MET on the identical document.
    const r = run("heading-numbered-levels", [MIXED, HEADING_OK]);
    expect(r.status).toBe("not-met");
  });

  it("is MET when the analyzer says the hierarchy is sound (numbered levels present)", () => {
    expect(run("heading-numbered-levels", [HEADING_OK]).status).toBe("met");
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("heading-numbered-levels", [NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT APPLICABLE for the SHORT-document no-headings line too", () => {
    expect(run("heading-numbered-levels", [SHORT_DOC_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("heading-numbered-levels", []).status).toBe("not-checked");
  });
});

describe("heading-content", () => {
  const CONTENT_ADVISORY =
    "Advisory — not scored: found 6 heading tags in a sound level order, but some of them may not read as headings — review the outline above by hand. Heuristic judgment only; your grade is not affected.";
  const CONTENT_GROUP = [
    "--- Do the Headings Read Like Headings? ---",
    "  2 heading tag(s) carry no text at all — a screen-reader user who jumps to one lands on silence.",
    "  4 of 6 heading tag(s) (67%) read as real headings. Navigating this document by heading — which is how most screen-reader users move through a long report — mostly lands on blanks and half-sentences.",
  ];

  it("is NOT MET and surfaces the census detail, alongside the unconditional MET line", () => {
    const r = run("heading-content", [CONTENT_ADVISORY, ...CONTENT_GROUP, HEADING_OK]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 heading tag\(s\) carry no text/);
    expect(r.evidence.join(" ")).toMatch(/4 of 6 heading tag\(s\)/);
  });

  it("is NOT CHECKED — never MET — when the analyzer only says the LEVELS are sound: heading LEVELS and heading CONTENT are different questions, and a null content census (pdfjs resolved no heading text) produces the exact same empty findings as a genuinely clean one — see analyzer :693. Inferring content from the unconditional hierarchy line would be exactly the false-pass this catalog exists to prevent.", () => {
    expect(run("heading-content", [HEADING_OK]).status).toBe("not-checked");
  });

  it("is NOT MET even when the census stayed BELOW the scoring threshold — 'not scored' is not 'clean'", () => {
    // Round-1 correction: the group ("--- Do the Headings Read Like
    // Headings? ---", analyzer :695) is pushed ONLY on the line AFTER
    // `if (!census || census.unusable === 0) return { score: 100,
    // findings: [] }` (:693) — so its presence requires unusable > 0. It
    // can NEVER mean "content is fine"; it can only mean "the census found
    // at least one problem", whether or not HEADING_MIN_UNUSABLE (3) was
    // met for scoring purposes. This fixture — one fragment, below the
    // threshold — still has a genuinely bad heading in it. Reporting MET
    // here (as this test wrongly asserted before this fix) would have
    // shown a green row directly contradicted by the fragment line sitting
    // right next to it in the same report.
    const r = run("heading-content", [
      "--- Do the Headings Read Like Headings? ---",
      '  1 heading tag(s) hold a fragment rather than a heading — the tag caught part of a sentence, often cut off mid-word: "property crime a".',
      "  5 of 6 heading tag(s) (83%) read as real headings. Navigating this document by heading — which is how most screen-reader users move through a long report — mostly lands on blanks and half-sentences.",
      HEADING_OK,
    ]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 heading tag\(s\) hold a fragment/);
    expect(r.evidence.join(" ")).toMatch(/5 of 6 heading tag\(s\)/);
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("heading-content", [NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT APPLICABLE for the SHORT-document no-headings line too", () => {
    expect(run("heading-content", [SHORT_DOC_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("heading-content", []).status).toBe("not-checked");
  });
});

describe("single-h1", () => {
  const H1_MULTI =
    "Found 3 H1 headings. No WCAG criterion requires a single H1, so this does not affect the score — but many style guides recommend one top-level heading (the document title), with sections demoted to H2 and below, so the outline has a single root.";

  it("is NOT MET when more than one H1 is present, alongside the unconditional hierarchy line", () => {
    const r = run("single-h1", [H1_MULTI, HEADING_OK]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/3 H1/);
    // Deliberately no standard/Matterhorn citation — a style convention.
    // Was `.toBeUndefined()` until 2026-08-31: every practice now declares
    // its legal basis, and this one's is that no criterion mentions H1
    // counts at all (bestPracticesCore pins the requirement).
    expect(practice("single-h1").standard).toMatch(/No WCAG 2\.1 criterion mentions H1 counts/);
    expect(practice("single-h1").links).toEqual([]);
  });

  it("shows the document's own heading sequence on the row that flags it — H1→H2→H1→H1 is THIS case", () => {
    // The user's canonical example ("heading order: h1->h2->h1->h1") has no
    // level gap, so heading-level-order reads MET and shows the tree there —
    // but the row that actually flags the problem is this one. The tree has
    // to appear here too, or the evidence sits three rows away from the
    // sentence it explains.
    const r = run("single-h1", [
      H1_MULTI,
      HEADING_OK,
      "--- Heading Tree ---",
      "  H1 → H2 → H1 → H1",
    ]);
    expect(r.status).toBe("not-met");
    expect(r.block?.lines).toContain("H1 → H2 → H1 → H1");
  });

  it("is NOT APPLICABLE when the document has no headings at all", () => {
    expect(run("single-h1", [NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("is NOT APPLICABLE for the SHORT-document no-headings line too", () => {
    expect(run("single-h1", [SHORT_DOC_NO_HEADINGS]).status).toBe("not-applicable");
  });

  it("does not false-trigger on a heading outline line whose own text happens to contain 'H1 headings'", () => {
    // The needle is anchored on "Found N H1 headings" at the START of a
    // line — a document whose own heading text quotes that exact phrase
    // (a heading OUTLINE line, not the analyzer's own advisory) must not
    // match.
    const r = run("single-h1", ['  H2 "Understanding H1 Headings in Reports"', HEADING_OK]);
    expect(r.status).toBe("not-checked");
  });

  it("is NOT CHECKED — never MET — for a document the analyzer never flagged, even a clean one", () => {
    // The analyzer is silent whenever h1Count <= 1: there is no dedicated
    // "exactly one H1" line to hang a MET status on, so this practice never
    // reports MET, only NOT MET / NOT APPLICABLE / NOT CHECKED. Inferring a
    // pass from the unrelated "logical hierarchy" line would be exactly
    // the kind of leap this catalog exists to avoid.
    expect(run("single-h1", [HEADING_OK]).status).toBe("not-checked");
    expect(run("single-h1", []).status).toBe("not-checked");
  });
});

describe("reading-order-fidelity", () => {
  const FIDELITY_LINE = "Reading-order fidelity: 62% (8 of 10 page(s) compared)";
  const FORM_LINE =
    "Not scored for this document: it is a form (4 field(s)). In a form the two orders are expected to disagree — field captions and widgets are painted in a later pass, so a correctly tagged form, whose tags sit in logical reading position rather than paint position, would score worst. Measuring it here would punish the right answer.";
  const DRIFT_LINE =
    "Advisory — not scored: the tagged order agreed with the content stream's draw order on 62% of comparable content. Divergence is not automatically wrong — remediated documents re-order tags away from a bad draw order on purpose — so this cannot be scored automatically and your grade is not affected. Verify with a screen reader or Acrobat's Order panel which side reflects the true reading sequence.";
  const NO_DATA_LINE =
    "Automated reading-order verification could not be performed: the structure tree and content-stream MCID sequences did not overlap sufficiently for a meaningful comparison.";

  it("is NOT APPLICABLE for a form, even though the unconditional percentage line is also present", () => {
    // pdf.ts pushes the percentage line BEFORE the form check, with no
    // return in between — a three-way order hazard. The form check must
    // win over treating the percentage as a pass.
    const r = run("reading-order-fidelity", [FIDELITY_LINE, FORM_LINE]);
    expect(r.status).toBe("not-applicable");
  });

  it("is NOT MET when the tagged order diverges, even though the unconditional percentage line is also present", () => {
    const r = run("reading-order-fidelity", [FIDELITY_LINE, DRIFT_LINE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/62%/);
  });

  it("is MET when the percentage line appears with neither the form nor the drift advisory", () => {
    expect(run("reading-order-fidelity", [FIDELITY_LINE]).status).toBe("met");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the comparison could not be performed at all", () => {
    expect(run("reading-order-fidelity", [NO_DATA_LINE]).status).toBe("not-checked");
    expect(run("reading-order-fidelity", []).status).toBe("not-checked");
  });

  it("cites WCAG 1.3.2 via wcagSlugs", () => {
    expect(practice("reading-order-fidelity").wcagSlugs).toEqual([
      { slug: "meaningful-sequence", label: "WCAG 1.3.2: Meaningful Sequence" },
    ]);
  });
});

describe("bookmarks", () => {
  const MISSING_LINE =
    "Advisory — not scored: this document has 24 pages and no bookmarks. No WCAG 2.1 criterion requires bookmarks in a single document (2.4.5 Multiple Ways applies to sets of pages), so your grade is not affected — but Adobe Acrobat's own checker flags long documents without them, and they remain the fastest way for every reader, screen-reader users included, to move around a long PDF.";
  const FOUND_LINE = "12 bookmark(s) found";
  const OUTLINE_GROUP = [
    "--- Bookmark Outline ---",
    "  Introduction",
    "  Chapter 1",
    "  Chapter 2",
  ];

  it("is NOT APPLICABLE for a short document, using pageCount structurally rather than a string match", () => {
    const r = run("bookmarks", [], 5);
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/5 pages/);
  });

  it("is NOT APPLICABLE for a 1-page document, pluralized correctly for exactly one page", () => {
    const r = run("bookmarks", [], 1);
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/1 page\b/);
    expect(r.evidence.join(" ")).not.toMatch(/1 pages/);
  });

  it("is NOT CHECKED — not NOT APPLICABLE — at pageCount 0: that is a missing field defaulting to 0, not a real 0-page document", () => {
    expect(run("bookmarks", [], 0).status).toBe("not-checked");
  });

  it("defers to the score on an empty outline — scoring/pdf.ts:1444 scores that 40", () => {
    const r = run("bookmarks", ["Outline structure present but contains no entries"], 12);
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/counted in your score/);
  });

  it("is NOT APPLICABLE on the analyzer's own short-document line, even when a stored pageCount is 0", () => {
    const r = run(
      "bookmarks",
      ["Document has 4 page(s) — bookmarks are not required for short documents"],
      0,
    );
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/short enough/);
  });

  it("is NOT MET for a long document with no bookmarks", () => {
    const r = run("bookmarks", [MISSING_LINE], 24);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/24-page/);
  });

  it("is MET and lists the document's own bookmark titles", () => {
    const r = run("bookmarks", [FOUND_LINE, ...OUTLINE_GROUP], 24);
    expect(r.status).toBe("met");
    expect(r.block?.lines).toEqual(["Introduction", "Chapter 1", "Chapter 2"]);
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("bookmarks", [], 24).status).toBe("not-checked");
  });

  it("cites WCAG 2.4.5 via wcagSlugs", () => {
    // The label carries the caveat the standard field states, so a reader
    // who sees only the link does not take 2.4.5 for the governing rule
    // (2026-08-31 WCAG audit): it governs a SET of pages, not navigation
    // inside one document.
    expect(practice("bookmarks").wcagSlugs).toEqual([
      {
        slug: "multiple-ways",
        label: "WCAG 2.4.5: Multiple Ways — applies to sets of pages, not within one document",
      },
    ]);
  });
});

describe("font-embedding", () => {
  const FONT_GROUP = [
    "--- Font Embedding ---",
    "  3 font(s) found: 1 embedded, 2 not embedded",
    "  Arial-Bold — embedded",
    "  Wingdings — NOT embedded",
  ];
  const NOT_MET_LINE =
    "PDF/UA only — not scored: 2 non-embedded font(s) may cause garbled text on systems without these fonts: Wingdings, Symbol. No WCAG success criterion requires font embedding — a substituted font still renders and still reads aloud — so this does not affect your grade. PDF/UA (ISO 14289, clause 7.21) does require it.";
  const MET_LINE =
    "All fonts are embedded — text will render correctly regardless of the user's installed fonts";
  const EXEMPT_LINE =
    "All fonts used to display text are embedded. 2 font entries (Wingdings, Symbol) are not embedded but never display visible text — typically leftover whitespace runs from the source word processor — so they cannot affect how the document renders or reads.";

  it("is NOT MET when a font that displays visible text is not embedded", () => {
    const r = run("font-embedding", [...FONT_GROUP, NOT_MET_LINE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 font/);
    expect(r.block?.lines).toContain("3 font(s) found: 1 embedded, 2 not embedded");
  });

  it("is MET when every font is embedded", () => {
    expect(run("font-embedding", [MET_LINE]).status).toBe("met");
  });

  it("is MET for the exempt case — non-embedded fonts that never paint visible text still pass", () => {
    // pdf.ts has a THIRD, narrower positive line the brief's single MET
    // needle does not match ("all fonts are embedded" is not a substring
    // of "All fonts USED TO DISPLAY TEXT are embedded…"). Missing this
    // needle would under-report a document that genuinely passes as NOT
    // CHECKED — safe, but wrong. Both needles are matched now.
    const r = run("font-embedding", [EXEMPT_LINE]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(
      /do not affect rendering|cannot change how it looks or reads/,
    );
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("font-embedding", []).status).toBe("not-checked");
  });
});

describe("display-doc-title", () => {
  const OFF_LINE =
    "PDF/UA only — not scored: the title is set, but the DisplayDocTitle viewer preference is off, so viewers show the FILENAME in the title bar instead of this title. WCAG 2.1 asks for a describing title, which this document has — your grade is not affected. PDF/UA (clause 7.1) requires the flag as well.";
  const ON_LINE =
    'Document title: "2024 Annual Report" (shown by viewers — DisplayDocTitle is set)';
  const NO_TITLE_LINE = "No document title found in metadata";
  const FILENAME_TITLE_LINE = 'Document title: "report_final_v2"';

  it("is NOT MET when the title is set but DisplayDocTitle is off", () => {
    expect(run("display-doc-title", [OFF_LINE]).status).toBe("not-met");
  });

  it("is MET when DisplayDocTitle is set", () => {
    expect(run("display-doc-title", [ON_LINE]).status).toBe("met");
  });

  it("is NOT CHECKED — never MET — for a document with no title at all", () => {
    // A bare "title" needle would match this line too ("No document TITLE
    // found…") and misreport a titleless document as passing. This is why
    // the MET needle here is the narrower "displaydoctitle is set" — see
    // the task report for the brief/source mismatch this fixture pins.
    expect(run("display-doc-title", [NO_TITLE_LINE]).status).toBe("not-checked");
  });

  it("is NOT CHECKED for a filename-like title — also contains the word 'title'", () => {
    expect(run("display-doc-title", [FILENAME_TITLE_LINE]).status).toBe("not-checked");
  });
});

describe("table-scope-simple", () => {
  const NO_TABLES = "No tables detected in this document — this category does not affect the score";
  const SIMPLE_ADVISORY =
    "PDF/UA only — not scored: 4 header cell(s) across 2 table(s) have no /Scope. Each of those tables has its headers along a single edge with nothing spanned, so the header-to-data relationship is already determinable and WCAG 1.3.1 is satisfied — your grade is not affected. PDF/UA (ISO 14289) asks for /Scope regardless, so setting it is worth doing if you are aiming at PDF/UA conformance as well as the law.";
  // The MET line that actually coexists with SIMPLE_ADVISORY: scopeOnly is
  // forced false whenever any table lacks /Scope, so the /Headers-or-Scope
  // variant appears, never the "All <TH>… Scope" variant.
  const ASSOC_LINE =
    "All tables associate data cells with headers (via /Scope or the explicit /Headers attribute)";
  const ALL_TH_LINE = "All <TH> cells have Scope attributes (/Column, /Row, or /Both)";

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("table-scope-simple", [NO_TABLES]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the table_markup category itself is absent", () => {
    // Category absence is a missing-DATA fact, never "this document has no
    // tables" — a fresh analysis always emits all ten PDF categories, so
    // absence can only mean the stored report is forged, archived from
    // before this category existed, or otherwise incomplete.
    const ctx = buildContext(null, "pdf", 10);
    expect(practice("table-scope-simple").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT MET when simple tables are missing /Scope, alongside the coexisting MET line", () => {
    const r = run("table-scope-simple", [SIMPLE_ADVISORY, ASSOC_LINE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/4 header cells across 2 tables/);
  });

  it("is MET when every <TH> cell carries a Scope attribute", () => {
    expect(run("table-scope-simple", [ALL_TH_LINE]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("table-scope-simple", []).status).toBe("not-checked");
  });
});

describe("table-scope-with-headers", () => {
  const NO_TABLES = "No tables detected in this document — this category does not affect the score";
  const HEADERS_ONLY_ADVISORY =
    "Advisory — not scored: 2 table(s) rely on /Headers associations without /Scope on the <TH> cells. That is complete and spec-correct; adding Scope as well is belt-and-braces for viewers with partial /Headers support.";
  const ASSOC_LINE =
    "All tables associate data cells with headers (via /Scope or the explicit /Headers attribute)";

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("table-scope-with-headers", [NO_TABLES]).status).toBe("not-applicable");
  });

  it("is NOT MET when tables use /Headers without /Scope, alongside the unconditional MET line it forces", () => {
    // ORDER HAZARD: this advisory only fires when scopeOnly is false, which
    // is exactly what makes the ASSOC_LINE (this practice's own MET text)
    // appear in the same findings array. The advisory check must win.
    const r = run("table-scope-with-headers", [HEADERS_ONLY_ADVISORY, ASSOC_LINE]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 table/);
  });

  const TH_LINE = "All <TH> cells have Scope attributes (/Column, /Row, or /Both)";
  const SIMPLE_SCOPE_ADVISORY =
    "PDF/UA only — not scored: 2 header cell(s) across 1 table(s) have no /Scope. Each of those tables has its headers along a single edge with nothing spanned, so the header-to-data relationship is already determinable and WCAG 1.3.1 is satisfied — your grade is not affected. PDF/UA (ISO 14289) asks for /Scope regardless, so setting it is worth doing if you are aiming at PDF/UA conformance as well as the law.";
  const SCORED_COMPLEX =
    "2 <TH> cell(s) missing Scope attribute (with no /Headers association either) — and these tables need it: their headers run along more than one edge or contain spanned cells.";

  it("is MET on the all-<TH>-scoped line (a fully scoped complex table used to read NOT CHECKED)", () => {
    expect(run("table-scope-with-headers", [TH_LINE]).status).toBe("met");
  });

  it("is MET on the 'all tables associate' line only when no simple table lacks /Scope", () => {
    expect(run("table-scope-with-headers", [ASSOC_LINE]).status).toBe("met");
  });

  it("is NOT MET-nor-MET — NOT CHECKED — on controls/synthetic-121's shape: 'all tables associate' beside the simple-scope advisory", () => {
    // scoring/pdf.ts:1671 counts `associated(t) || t.simpleHeaderLayout`, so
    // an UNSCOPED simple table satisfies the associate line. table-scope-simple
    // reads NOT MET on this document; this row read MET one line below it.
    const r = run("table-scope-with-headers", [ASSOC_LINE, SIMPLE_SCOPE_ADVISORY]);
    expect(r.status).toBe("not-checked");
    expect(r.evidence.join(" ")).toMatch(/does not establish/);
  });

  it("defers to the score on a SCORED complex-table failure", () => {
    const r = run("table-scope-with-headers", [SCORED_COMPLEX]);
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/counted in your score/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("table-scope-with-headers", []).status).toBe("not-checked");
  });
});

describe("nested-tables", () => {
  const NO_TABLES = "No tables detected in this document — this category does not affect the score";
  const NESTED_ADVISORY =
    "PDF/UA only — not scored: a nested table is not a WCAG failure — properly tagged, its relationships are still determinable — so this does not affect your grade. It is, however, genuinely hard to navigate by keyboard and by screen reader.";
  const NO_NESTED_LINE = "No nested tables detected";

  it("is NOT APPLICABLE when the document has no tables", () => {
    expect(run("nested-tables", [NO_TABLES]).status).toBe("not-applicable");
  });

  it("is NOT MET when a table contains another table nested inside it", () => {
    expect(run("nested-tables", [NESTED_ADVISORY]).status).toBe("not-met");
  });

  it("is MET using the analyzer's own dedicated line — not the unrelated row-structure line", () => {
    const r = run("nested-tables", [NO_NESTED_LINE]);
    expect(r.status).toBe("met");
    // The analyzer counts nesting over multi-column DATA tables only
    // (scoring/pdf.ts:1742 filters dataTables; a single-column table is
    // "layout, not scored" at :1561), so a nested table inside a layout
    // table still yields this line. The sentence may claim only that.
    expect(r.evidence.join(" ")).toMatch(/data tables/);
    expect(r.evidence.join(" ")).not.toMatch(/No table in this document/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("nested-tables", []).status).toBe("not-checked");
  });
});

describe("descriptive-link-text", () => {
  it("names the Level A criterion that actually governs 'click here', not only the AAA one (2026-08-31 WCAG audit)", () => {
    // The ANALYZER's own advisory (scoring/pdf.ts:1952) says it correctly:
    // "WCAG 2.4.4 (Level A) allows a link's purpose to come from the sentence
    // around it, which no automated check can weigh — judging the text alone
    // is a AAA rule (2.4.9) — so your grade is not affected." The catalog's
    // summary had kept only the 2.4.9 half, which reads as "the law is silent
    // here". It is not: per W3C, "click here" FAILS 2.4.4 (Level A) unless the
    // surrounding context supplies the purpose. Unscored because it is not
    // machine-decidable — not because it is not required.
    const std = practice("descriptive-link-text").standard ?? "";
    expect(std).toMatch(/2\.4\.4/);
    expect(std).toMatch(/Level A\b/);
    expect(std).toMatch(/sentence|context/i);
    expect(std).toMatch(/2\.4\.9/);
    // And the row must link the reader to BOTH criteria, not just the AAA one.
    const slugs = (practice("descriptive-link-text").wcagSlugs ?? []).map((x) => x.slug);
    expect(slugs).toContain("link-purpose-in-context");
    expect(slugs).toContain("link-purpose-link-only");
  });

  const NO_LINKS = "No links found in this document — this category does not affect the score";
  const NON_DESCRIPTIVE_ADVISORY =
    'Advisory — not scored: 3 of 12 link(s) use non-descriptive text — empty, a vague phrase such as "click here" / "read more", or too short to mean anything on its own. WCAG 2.4.4 (Level A) allows a link\'s purpose to come from the sentence around it, which no automated check can weigh — judging the text alone is a AAA rule (2.4.9) — so your grade is not affected. Descriptive link text is still kinder to screen-reader users, who often pull up links as a bare list.';
  const NON_DESCRIPTIVE_GROUP = [
    "--- Links With Non-Descriptive Text ---",
    '  "click here" (page 2) — vague phrase → https://example.org/report',
  ];
  const ALL_DESCRIPTIVE_LINE = "All 12 link(s) use descriptive text";

  it("is NOT APPLICABLE when the document has no links", () => {
    expect(run("descriptive-link-text", [NO_LINKS]).status).toBe("not-applicable");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the link_quality category itself is absent", () => {
    const ctx = buildContext(null, "pdf", 10);
    expect(practice("descriptive-link-text").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT MET when some links use non-descriptive text", () => {
    const r = run("descriptive-link-text", [NON_DESCRIPTIVE_ADVISORY, ...NON_DESCRIPTIVE_GROUP]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/3 of 12 links/);
    expect(r.block?.lines.join(" ")).toMatch(/click here/);
  });

  it("is MET when every link uses descriptive text", () => {
    expect(run("descriptive-link-text", [ALL_DESCRIPTIVE_LINE]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("descriptive-link-text", []).status).toBe("not-checked");
  });

  it("cites BOTH link-purpose criteria via wcagSlugs — the Level A one first", () => {
    // Was pinned to 2.4.9 alone until the 2026-08-31 WCAG audit. A reader who
    // follows the only link offered lands on a AAA criterion and concludes the
    // subject is above the legal line; the criterion that actually governs
    // "click here" is 2.4.4, Level A. Order matters: the legal one leads.
    expect(practice("descriptive-link-text").wcagSlugs).toEqual([
      {
        slug: "link-purpose-in-context",
        label: "WCAG 2.4.4: Link Purpose (In Context) — Level A",
      },
      { slug: "link-purpose-link-only", label: "WCAG 2.4.9: Link Purpose (Link Only) — AAA" },
    ]);
  });
});

describe("raw-url-link-text", () => {
  const NO_LINKS = "No links found in this document — this category does not affect the score";
  const RAW_URL_ITEMS = [
    "--- Raw URL Link Text (advisory — not penalized) ---",
    "2 link(s) use the raw URL as their visible text. This satisfies WCAG 2.4.4 (the destination is determinable) and is not scored against you, but a descriptive label reads better in a screen reader's list of links.",
    '  "https://example.org/reports/q3.pdf" (page 4) → https://example.org/reports/q3.pdf',
  ];
  const ALL_DESCRIPTIVE_LINE = "All 12 link(s) use descriptive text";

  it("is NOT APPLICABLE when the document has no links", () => {
    expect(run("raw-url-link-text", [NO_LINKS]).status).toBe("not-applicable");
  });

  it("is NOT MET when links use their raw web address as visible text (un-prefixed in `main`, not `notScored`)", () => {
    const r = run("raw-url-link-text", RAW_URL_ITEMS);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 links/);
  });

  it("is MET when every link uses descriptive text", () => {
    expect(run("raw-url-link-text", [ALL_DESCRIPTIVE_LINE]).status).toBe("met");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("raw-url-link-text", []).status).toBe("not-checked");
  });
});

describe("nested-structure-tree", () => {
  const FLAT_ADVISORY =
    "Advisory — not scored: the structure tree is flat (no meaningful nesting) — the document has tags in a single sequence rather than a nested hierarchy of sections. That sequence still gives assistive technology a reading order, so your grade is not affected, but nesting makes long documents far easier to navigate.";
  const DEPTH_FLAT = "Structure tree depth: 1 level(s)";
  const DEPTH_DEEP = "Structure tree depth: 7 level(s)";

  it("is NOT APPLICABLE when there is no structure tree at all", () => {
    const r = run("nested-structure-tree", [
      "No structure tree present — reading order cannot be determined",
    ]);
    expect(r.status).toBe("not-applicable");
  });

  it("is NOT MET for a flat tree, even though the unconditional depth line is also present", () => {
    // ORDER HAZARD: the depth line is pushed before the flatness check,
    // with no return in between — a flat tree's findings contain both.
    const r = run("nested-structure-tree", [DEPTH_FLAT, FLAT_ADVISORY]);
    expect(r.status).toBe("not-met");
  });

  it("is MET when the tree is genuinely nested", () => {
    const r = run("nested-structure-tree", [DEPTH_DEEP]);
    expect(r.status).toBe("met");
    expect(r.evidence.join(" ")).toMatch(/7/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("nested-structure-tree", []).status).toBe("not-checked");
  });
});

describe("character-mapping", () => {
  const GROUP_HEADER = "--- Character Mapping (Matterhorn 10) ---";
  const LARGE_COUNT_LINE =
    "  150 extracted character(s) cannot be mapped to readable text (8% of the text layer) — the glyphs paint on screen, but they extract as private-use symbols a screen reader cannot pronounce.";
  const LARGE_ADVISORY_UNINDENTED =
    "Advisory — not scored: a count this size is often symbol-font bullets or dingbats, which read as decoration — your grade is not affected. Verify the affected passages read correctly with a screen reader; if they are real words, re-export from the source application.";
  const SMALL_COUNT_LINE =
    "  8 extracted character(s) cannot be mapped to readable text (1% of the text layer) — the glyphs paint on screen, but they extract as private-use symbols a screen reader cannot pronounce.";
  const SMALL_ADVISORY_INDENTED =
    "  Advisory — not scored: a count this small is usually symbol-font bullets or dingbats, which read as decoration. No action needed unless real words are affected.";

  it("is NOT MET for the large-count variant (un-indented — lands in notScored)", () => {
    const r = run("character-mapping", [GROUP_HEADER, LARGE_COUNT_LINE, LARGE_ADVISORY_UNINDENTED]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/150/);
  });

  it("is NOT MET for the small-count variant too (indented — lands in signals, not notScored)", () => {
    // Proves the dual-variant check: matchNotScored alone would miss this.
    const r = run("character-mapping", [GROUP_HEADER, SMALL_COUNT_LINE, SMALL_ADVISORY_INDENTED]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/8/);
  });

  it("defers to the score in the WORST band — it is a scored deduction, not an optional practice", () => {
    // This band's advisory does NOT say "symbol-font bullets or dingbats"
    // at all (it says the opposite: real text may be unreadable) — the
    // fixed matcher keys off the always-present measurement line instead.
    const WORST_COUNT_LINE =
      "  5,000 extracted character(s) cannot be mapped to readable text (62% of the text layer) — the glyphs paint on screen, but they extract as private-use symbols a screen reader cannot pronounce.";
    const WORST_ADVISORY =
      "  A meaningful share of this document's text cannot be read aloud or searched, whatever the tagging says. Fix at the source: re-export the PDF from the original application with standard fonts (or embedding enabled), or run OCR over the affected pages — Acrobat: All tools → Scan & OCR → Recognize Text.";
    const r = run("character-mapping", [GROUP_HEADER, WORST_COUNT_LINE, WORST_ADVISORY]);
    // This band caps text_extractability at 50 (scoring/pdf.ts:326) — a
    // Moderate deduction with a REQUIRED plan step. It is not "optional".
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/counted in your score/);
    // Pins the analyzer's own thousands-separator convention
    // (unmappedChars.toLocaleString(), packages/analyzer/src/scoring/pdf.ts:323)
    // now carried into this catalog's own evidence sentence — a bare
    // `${count}` would have read "5000", disagreeing with the "5,000" the
    // technical findings show on the same report page.
    expect(r.evidence.join(" ")).toMatch(/5,000 extracted characters/);
    expect(r.evidence.join(" ")).not.toMatch(/\b5000\b/);
    expect(r.evidence.join(" ")).not.toMatch(/symbol-font bullets or dingbats/);
    expect(r.fix).toBeUndefined();
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no MET/NOT APPLICABLE line exists)", () => {
    expect(run("character-mapping", []).status).toBe("not-checked");
  });
});

describe("content-in-tag-tree", () => {
  const GROUP_HEADER = "--- Content Outside the Tag Structure (Matterhorn 01) ---";
  const COUNT_LINE =
    "  40 visible character(s) — 3% of the page text — are painted outside the tagged content (page 2). They are neither in the reading order nor marked as decorative artifacts, so a screen reader following the tags never encounters them.";
  const ADVISORY_INDENTED =
    "  Advisory — not scored: an amount this small is often stray export residue. Verify the named pages when convenient.";

  it("is NOT MET when visible text sits outside the tag structure", () => {
    const r = run("content-in-tag-tree", [GROUP_HEADER, COUNT_LINE, ADVISORY_INDENTED]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/40/);
  });

  it("defers to the score in the WORST band — a scored deduction, not an optional practice", () => {
    const WORST_COUNT_LINE =
      "  600 visible character(s) — 22% of the page text — are painted outside the tagged content (pages 3, 4). They are neither in the reading order nor marked as decorative artifacts, so a screen reader following the tags never encounters them.";
    const WORST_ADVISORY =
      "  How to fix: In Adobe Acrobat, open All tools → Prepare for accessibility → Automatically tag PDF to bring the untagged content into the structure, then verify the affected pages in the Tags panel — or mark genuinely decorative runs as artifacts.";
    const r = run("content-in-tag-tree", [GROUP_HEADER, WORST_COUNT_LINE, WORST_ADVISORY]);
    // 600 chars at 22% caps the category at 50 (scoring/pdf.ts:370) — a
    // required plan step above the seam. Not this section's to call optional.
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/600/);
    expect(r.evidence.join(" ")).toMatch(/counted in your score/);
    expect(r.evidence.join(" ")).not.toMatch(/stray export residue/);
  });

  it("defers to the score in the MIDDLE band too (cap 85, 'Review the named pages')", () => {
    const MID_COUNT =
      "  80 visible character(s) — 5% of the page text — are painted outside the tagged content (page 2). They are neither in the reading order nor marked as decorative artifacts, so a screen reader following the tags never encounters them.";
    const MID_ADVICE =
      "  Review the named pages in Acrobat's Tags panel: tag real content, or mark decorative text (watermarks, crop marks) as artifacts.";
    const r = run("content-in-tag-tree", [GROUP_HEADER, MID_COUNT, MID_ADVICE]);
    expect(r.status).toBe("not-applicable");
    expect(r.evidence.join(" ")).toMatch(/counted in your score/);
  });

  it("is NOT CHECKED when the analyzer said nothing either way (no MET/NOT APPLICABLE line exists)", () => {
    expect(run("content-in-tag-tree", []).status).toBe("not-checked");
  });
});

describe("list-labels", () => {
  const LIST_GROUP = [
    "--- List Structure Analysis ---",
    "3 list(s) detected with 14 total item(s)",
    "  List 1: 5 <LI> | <Lbl> ✗ | <LBody> ✓ | well-formed",
    "  List 2: 4 <LI> | <Lbl> ✗ | <LBody> ✓ | well-formed",
    "  List 3: 5 <LI> | <Lbl> ✓ | <LBody> ✓ | well-formed",
    "All lists are well-formed (each <LI> has an <LBody>)",
    "2 list(s) have no <Lbl> (bullet/number) elements — optional per ISO 32000 and not penalized, but adding <Lbl> helps screen readers announce each item's marker",
  ];

  it("is NOT APPLICABLE when the document has no tagged lists at all", () => {
    const r = run("list-labels", [
      "--- List Structure Analysis ---",
      "No tagged lists detected — if the document contains bulleted or numbered lists, they may not be tagged as <L>/<LI> elements",
    ]);
    expect(r.status).toBe("not-applicable");
  });

  it("is NOT MET when lists have no <Lbl> element on their items (un-prefixed, lands in `main`) — the fixture keeps the coexisting witness so a reorder fails", () => {
    const r = run("list-labels", LIST_GROUP);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 lists/);
  });

  // CORRECTED AGAIN (fix round 3): round 2's "witness present AND no
  // advisory" was unsound — the <Lbl> advisory (supplementary.ts:204-206)
  // is nested inside `if (wellFormed === qpdf.lists.length)` (:200), a
  // condition about <LBody>, a DIFFERENT property from <Lbl>. A malformed
  // list (missing <LBody>) that also lacks <Lbl> takes the sibling `else`
  // branch and never emits the advisory — round 2's code reported that
  // document MET. The sound signal is the PER-LIST lines themselves
  // (`  List N: … | <Lbl> ✓/✗ | …`), which record real <Lbl> status
  // independent of <LBody> well-formedness.
  it("is MET when every list's own line shows <Lbl> ✓ (read from signalLines, not a top-level witness)", () => {
    const r = run("list-labels", [
      "--- List Structure Analysis ---",
      "3 list(s) detected with 14 total item(s)",
      "  List 1: 5 <LI> | <Lbl> ✓ | <LBody> ✓ | well-formed",
      "  List 2: 4 <LI> | <Lbl> ✓ | <LBody> ✓ | well-formed",
      "  List 3: 5 <LI> | <Lbl> ✓ | <LBody> ✓ | well-formed",
      "All lists are well-formed (each <LI> has an <LBody>)",
    ]);
    expect(r.status).toBe("met");
    // QUANTIFIER SCOPE: "<Lbl> ✓" is set from l.hasLabels, true as soon as
    // ONE <LI> in that list has a <Lbl> child (qpdfService.ts:1524-1526).
    // What was established is "every LIST carries markers", never "every
    // ITEM is labelled" — the evidence must not read as the latter.
    expect(r.evidence.join(" ")).toMatch(/every list in it/);
    expect(r.evidence.join(" ")).toMatch(/list by list, not item by item/);
    expect(r.evidence.join(" ")).not.toMatch(/every item|each one uses/);
  });

  // THE CRITICAL BUG, PINNED: reproduces the coordinator's exact scenario —
  // a malformed list (missing <LBody>) whose items ALSO lack <Lbl>. Under
  // round 2's code this returned MET with evidence claiming "every item
  // carries its own <Lbl> marker" — a fabricated document fact, reachable
  // on an ordinary export, not just a forged report. Must never be MET.
  it("does not fabricate MET for a malformed list that ALSO lacks <Lbl> — the advisory line the old code relied on is never emitted here", () => {
    const r = run("list-labels", [
      "--- List Structure Analysis ---",
      "1 list(s) detected with 5 total item(s)",
      "  List: 5 <LI> | <Lbl> ✗ | <LBody> ✗ | incomplete structure",
      "1 list(s) have items missing <LBody> elements — screen readers may not announce list item content correctly",
      "Fix: In Adobe Acrobat, expand each <L> tag in the Tags panel → ensure each <LI> contains an <LBody> (text content); <Lbl> (bullet/number) is recommended but optional",
    ]);
    expect(r.status).not.toBe("met");
  });

  it("does not report MET when the per-list detail is missing — a top-level census line alone proves nothing about <Lbl>", () => {
    const r = run("list-labels", [
      "--- List Structure Analysis ---",
      "3 list(s) detected with 14 total item(s)",
    ]);
    expect(r.status).not.toBe("met");
  });

  it("does not report MET when only SOME lists show <Lbl> ✓ — one unlabelled list is enough to withhold MET", () => {
    const r = run("list-labels", [
      "--- List Structure Analysis ---",
      "2 list(s) detected with 9 total item(s)",
      "  List 1: 5 <LI> | <Lbl> ✓ | <LBody> ✓ | well-formed",
      "  List 2: 4 <LI> | <Lbl> ✗ | <LBody> ✓ | well-formed",
    ]);
    expect(r.status).not.toBe("met");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent from the report", () => {
    // Absence of the category is a missing-DATA fact (a forged/archived
    // report), never a document fact — it must not read the same as the
    // analyzer's own "no lists" line would.
    const ctx = buildContext(null, "pdf", 10);
    expect(practice("list-labels").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the analyzer said nothing at all (no witness, no advisory, no N/A line)", () => {
    expect(run("list-labels", []).status).toBe("not-checked");
  });
});

describe("footnote-ids", () => {
  const MISSING_GROUP = [
    "--- Footnotes & Endnotes (<Note>) ---",
    "4 <Note> tag(s) detected (footnotes, endnotes, or labeled notes)",
    "  Advisory — not scored: 2 note(s) have no /ID (Matterhorn 19-003). PDF/UA requires one so assistive technology can link the in-text reference to its note; Word footnote exports commonly omit it.",
    "  Fix: In Adobe Acrobat's Tags panel, select each <Note> tag → Properties → set a unique ID (remediation tools and re-exporting from current Word versions also repair this).",
  ];
  const DUP_GROUP = [
    "--- Footnotes & Endnotes (<Note>) ---",
    "3 <Note> tag(s) detected (footnotes, endnotes, or labeled notes)",
    "  Advisory — not scored: 1 note(s) reuse another note's /ID (Matterhorn 19-004) — IDs must be unique within the document.",
    "  Fix: In Adobe Acrobat's Tags panel, select each <Note> tag → Properties → set a unique ID (remediation tools and re-exporting from current Word versions also repair this).",
  ];
  const OK_GROUP = [
    "--- Footnotes & Endnotes (<Note>) ---",
    "5 <Note> tag(s) detected (footnotes, endnotes, or labeled notes)",
    "  All notes carry a unique /ID — assistive technology can link each reference to its note (Matterhorn 19-003/19-004)",
  ];

  it("is NOT MET when notes have no /ID, pluralized correctly for more than one", () => {
    const r = run("footnote-ids", MISSING_GROUP);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/2 notes in this document have no \/ID/);
    expect(r.evidence.join(" ")).not.toMatch(/2 note in|2 note has/);
  });

  it("is NOT MET when notes reuse another note's /ID, pluralized correctly for exactly one", () => {
    const r = run("footnote-ids", DUP_GROUP);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 note reuses another note's \/ID/);
    expect(r.evidence.join(" ")).not.toMatch(/1 notes|1 note reuse /);
  });

  it("is MET when every note carries a unique /ID", () => {
    expect(run("footnote-ids", OK_GROUP).status).toBe("met");
  });

  it("is NOT CHECKED — not NOT APPLICABLE — when the category itself is absent from the report", () => {
    const ctx = buildContext(null, "pdf", 10);
    expect(practice("footnote-ids").detect(ctx).status).toBe("not-checked");
  });

  it("is NOT CHECKED when the analyzer said nothing either way", () => {
    expect(run("footnote-ids", []).status).toBe("not-checked");
  });
});

describe("every PDF practice", () => {
  it("has exactly the 19 catalogued practices", () => {
    expect(PDF_PRACTICES.length).toBe(19);
  });

  it("returns NOT CHECKED for an empty document — silence is never a pass", () => {
    // Asserts the exact status, not just "not met": a weaker
    // `.not.toBe("met")` previously let bookmarks slip an INVENTED
    // document fact through as NOT APPLICABLE — pageCount defaulting to 0
    // (an absent field, not a real 0-page document) read as "too short for
    // bookmarks to matter". Silence must land on not-checked specifically.
    for (const p of PDF_PRACTICES) {
      const r = p.detect(buildContext({ findings: [] }, "pdf", 0));
      expect(r.status, `${p.id} must read NOT CHECKED on silence, not just avoid MET`).toBe(
        "not-checked",
      );
    }
  });

  it("never throws on malformed stored findings", () => {
    const hostile = [null, { findings: "nope" }, { findings: [1, null, {}] }, 42];
    for (const p of PDF_PRACTICES) {
      for (const c of hostile) {
        expect(() => p.detect(buildContext(c, "pdf", 0)), `${p.id}`).not.toThrow();
      }
    }
  });

  it("has unique ids, non-empty copy, and no forbidden phrasing", () => {
    const ids = PDF_PRACTICES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PDF_PRACTICES) {
      expect(p.label.length, p.id).toBeGreaterThan(0);
      expect(p.description.length, p.id).toBeGreaterThan(0);
      expect(p.why.length, p.id).toBeGreaterThan(0);
      const copy = `${p.label} ${p.description} ${p.why} ${p.standard ?? ""}`;
      // Nothing in this section is a legal obligation, and the product is
      // kept free of "strong" — widened to \bstrong\w* so "strongly" is
      // caught too (it slipped past a bare \bstrong\b once).
      expect(copy, p.id).not.toMatch(/required by law/i);
      expect(copy, p.id).not.toMatch(/\bstrong\w*/i);
    }
  });

  it("has no forbidden phrasing in evidence or fix text either — most user-facing sentences live there, not in the static copy", () => {
    // The static-field sweep above cannot see evidence/fix: those are
    // produced by detect(), not stored as plain strings. Run each practice
    // against a fixture built to reach its richest branch (NOT MET) and
    // sweep that output too. A gate that has only ever passed proves
    // nothing (project rule) — so this asserts the fixture actually LANDS
    // on not-met (a fixture that drifted to not-checked would otherwise
    // make the phrasing check pass vacuously) and fails loudly, rather
    // than silently skipping, if a future 20th practice has no entry here.
    for (const p of PDF_PRACTICES) {
      const trigger = NOT_MET_TRIGGERS[p.id];
      expect(
        trigger,
        `no NOT_MET_TRIGGERS entry for "${p.id}" — every practice needs one, or this sweep silently skips it`,
      ).toBeDefined();
      const r = p.detect(
        buildContext({ findings: trigger!.findings }, "pdf", trigger!.pageCount ?? 10),
      );
      expect(
        r.status,
        `${p.id}'s NOT_MET_TRIGGERS fixture did not reach not-met (got "${r.status}") — update the trigger, or this sweep proves nothing for this practice`,
      ).toBe("not-met");
      const copy = `${r.evidence.join(" ")} ${r.fix?.source ?? ""} ${r.fix?.app ?? ""}`;
      expect(copy, p.id).not.toMatch(/required by law/i);
      expect(copy, p.id).not.toMatch(/\bstrong\w*/i);
    }
  });

  it("uses only valid PDF category ids", () => {
    const valid = new Set([
      "alt_text",
      "bookmarks",
      "color_contrast",
      "form_accessibility",
      "heading_structure",
      "link_quality",
      "reading_order",
      "table_markup",
      "text_extractability",
      "title_language",
    ]);
    for (const p of PDF_PRACTICES) {
      expect(valid.has(p.categoryId), `${p.id} categoryId "${p.categoryId}"`).toBe(true);
    }
  });

  it("populates wcagSlugs on at least one practice, so the field cannot silently rot", () => {
    const withSlugs = PDF_PRACTICES.filter((p) => (p.wcagSlugs?.length ?? 0) > 0);
    expect(withSlugs.length).toBeGreaterThan(0);
  });
});

describe("table practices recognise every analyzer N/A outcome, not just 'no tables'", () => {
  const LAYOUT_ONLY =
    "2 single-column table(s) detected — treated as layout structures rather than data tables, so header markup is not required and this category does not affect the score.";
  const NO_HEADER_CELLS = "Scope attributes: N/A (no header cells to check)";
  it("layout-only tables → NOT APPLICABLE on all three table practices", () => {
    for (const id of ["table-scope-simple", "table-scope-with-headers", "nested-tables"]) {
      const r = run(id, [LAYOUT_ONLY]);
      expect(r.status, id).toBe("not-applicable");
      expect(r.evidence.join(" "), id).toMatch(/layout structures/);
    }
  });
  it("no header cells → NOT APPLICABLE on both scope practices", () => {
    for (const id of ["table-scope-simple", "table-scope-with-headers"]) {
      const r = run(id, [NO_HEADER_CELLS]);
      expect(r.status, id).toBe("not-applicable");
      expect(r.evidence.join(" "), id).toMatch(/no header cells/);
    }
  });
});

describe("list-labels fails on the per-list glyph the advisory's own gate suppresses", () => {
  it("is NOT MET when a malformed list carries <Lbl> ✗ and the advisory never fired", () => {
    const r = run("list-labels", [
      "--- List Structure Analysis ---",
      "1 list(s) detected with 5 total item(s)",
      "  List: 5 <LI> | <Lbl> ✗ | <LBody> ✗ | incomplete structure",
    ]);
    expect(r.status).toBe("not-met");
    expect(r.evidence.join(" ")).toMatch(/1 list .*no <Lbl>|list in this document has no <Lbl>/);
  });
});

describe("an all-generic <H> document is NOT APPLICABLE for level order and convention — not 'no finding'", () => {
  const ONLY_GENERIC =
    "PDF/UA only — not scored: only generic <H> tags were found (not H1–H6). The headings are identifiable to assistive technology, but they carry no level, so the outline has no depth. WCAG 2.1 does not require numbered levels — your grade is not affected — but PDF/UA (clause 7.4) does.";
  it("routes the reader to the row that actually flags it", () => {
    for (const id of ["heading-level-order", "heading-convention"]) {
      const r = run(id, [ONLY_GENERIC]);
      expect(r.status, id).toBe("not-applicable");
      expect(r.evidence.join(" "), id).toMatch(/Numbered heading levels/);
    }
    expect(run("heading-numbered-levels", [ONLY_GENERIC]).status).toBe("not-met");
  });
});

describe("every PDF practice tells an absent category from silence", () => {
  it("returns reason 'not-run' — never the 'silent' reassurance — when the category is missing", () => {
    for (const p of PDF_PRACTICES) {
      const r = p.detect(buildContext(undefined, "pdf", 0));
      expect(r.status, p.id).toBe("not-checked");
      expect(r.reason, p.id).toBe("not-run");
    }
  });
});

describe("advisorySince is declared on every witness-based PDF practice", () => {
  it("carries an ISO date the era gate can compare", () => {
    for (const id of [
      "nested-structure-tree",
      "reading-order-fidelity",
      "table-scope-with-headers",
      "list-labels",
      "heading-convention",
    ]) {
      expect(practice(id).advisorySince, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("the five heading rows tell a no-heading document where its score went (2026-08-31)", () => {
  // scoring/pdf.ts:777 → score 0, grade F, and a 1.3.1 Level A conformance
  // failure. Answering a bare "not applicable" beside the largest deduction
  // in the report reads as absolution. The SHORT-document line one branch
  // away (scoring/pdf.ts:770) is score null — genuinely nothing to say.
  const HEADINGS_ABSENT_SCORED = "No heading tags found in the document structure";
  const HEADINGS_ABSENT_SHORT =
    "No headings were found. Short documents may not need them; longer documents should use Heading styles.";
  const IDS = [
    "heading-level-order",
    "heading-convention",
    "heading-numbered-levels",
    "heading-content",
    "single-h1",
  ];

  it("points at the action plan when headings are absent AND scored", () => {
    for (const id of IDS) {
      const r = run(id, [HEADINGS_ABSENT_SCORED]);
      expect(r.status, id).toBe("not-applicable");
      expect(r.evidence.join(" "), id).toMatch(/counted in your score/);
    }
  });

  it("says nothing about the score for a short document, where none was lost", () => {
    for (const id of IDS) {
      const r = run(id, [HEADINGS_ABSENT_SHORT]);
      expect(r.status, id).toBe("not-applicable");
      expect(r.evidence.join(" "), id).not.toMatch(/counted in your score/);
    }
  });
});
