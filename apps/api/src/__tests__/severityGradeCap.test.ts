import { describe, it, expect } from "vitest";
import {
  capScoreBySeverity,
  worstSeverity,
  scoreCapReason,
  maxScoreForGrade,
  gradeForScore,
  SEVERITY_GRADE_CAPS,
} from "@file-audit/shared";
import { regradeStoredReport } from "@file-audit/analyzer";

// A document's SCORE may never outrank its worst unresolved finding — and the
// letter is then derived from that score through the one published scale, so
// the two can never disagree.
//
// This shipped because the tool contradicted itself in front of the people it
// exists to help. Two Word files with the IDENTICAL defect — no document
// title, language present, so "Title & Language" scored 50/Moderate in both —
// graded B and C, purely because one had 7 of 10 categories to average
// against and the other only 3. And two PDFs missing BOTH title and language
// (0/Critical) graded B, ABOVE the Word file with strictly the milder fault.
// Across a 31-document corpus, 4 documents held an A while carrying an
// unresolved Moderate and 2 held a B while carrying a Critical.
//
// The first attempt (v1.58.0) capped the LETTER instead. It fixed both of the
// above and broke something more basic: it severed the number from the grade,
// so a report read "D" above "80/100". Reported twice, in those words — 80 is
// a B on the published scale, so the report was wrong on its face. The
// invariant test below ("the published scale always holds") is what would
// have caught it, and is the most important assertion in this file.
//
// The cases at the bottom are the four real documents that drove all of it,
// now checked into controls/ as permanent fixtures. A change that re-inverts
// them fails here with the original complaint spelled out.

const cat = (severity: string | null, score: number | null = 50) => ({ score, severity });

/** The published scale, written out independently of GRADE_THRESHOLDS so this
 *  file fails if the thresholds are ever edited without deliberation. */
const expectedGrade = (s: number) =>
  s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F";

describe("capScoreBySeverity — the worst finding sets the ceiling", () => {
  it("THE INVARIANT: the published scale always holds", () => {
    // 90=A, 80=B, 70=C, 60=D, below that F — for every score, capped or not.
    // v1.58.0 capped the letter independently of the score and shipped "D"
    // above "80/100"; this assertion makes that unshippable.
    for (let raw = 0; raw <= 100; raw++) {
      for (const sev of ["Critical", "Moderate", "Minor", "No issues found"]) {
        const capped = capScoreBySeverity(raw, [cat(sev, sev === "No issues found" ? 100 : 10)])!;
        expect(gradeForScore(capped), `raw=${raw} sev=${sev} capped=${capped}`).toBe(
          expectedGrade(capped),
        );
      }
    }
  });

  it("caps at the top of the band each severity allows", () => {
    expect(capScoreBySeverity(100, [cat("Critical", 0)])).toBe(69);
    expect(capScoreBySeverity(100, [cat("Moderate", 50)])).toBe(79);
    expect(capScoreBySeverity(100, [cat("Minor", 80)])).toBe(89);
  });

  it("derives those ceilings from GRADE_THRESHOLDS rather than hardcoding them", () => {
    // So moving a band boundary moves the caps with it and the two cannot drift.
    expect(maxScoreForGrade("D")).toBe(69);
    expect(maxScoreForGrade("C")).toBe(79);
    expect(maxScoreForGrade("B")).toBe(89);
    expect(maxScoreForGrade("A")).toBe(100);
    expect(maxScoreForGrade("Z")).toBeNull();
  });

  it("leaves a clean document's score alone", () => {
    expect(capScoreBySeverity(100, [cat("No issues found", 100)])).toBe(100);
    expect(capScoreBySeverity(100, [])).toBe(100);
  });

  it("only ever lowers — a worse average keeps its own lower number", () => {
    expect(capScoreBySeverity(30, [cat("Critical", 0)])).toBe(30);
    expect(capScoreBySeverity(65, [cat("Moderate", 50)])).toBe(65);
  });

  it("is driven by the WORST severity when several are present", () => {
    const mixed = [cat("Minor", 80), cat("Critical", 10), cat("Moderate", 50)];
    expect(worstSeverity(mixed)).toBe("Critical");
    expect(capScoreBySeverity(95, mixed)).toBe(69);
  });

  it("ignores categories that were never assessed", () => {
    // "No images were found" is not a finding. Letting a null-scored category
    // cap the score would punish a document for what it does not contain —
    // the same class of error the cap was written to fix.
    expect(capScoreBySeverity(95, [{ score: null, severity: "Critical" }])).toBe(95);
  });

  it("is idempotent, which is what lets it run at source AND at render", () => {
    const cats = [cat("Critical", 0)];
    const once = capScoreBySeverity(95, cats);
    expect(capScoreBySeverity(once, cats)).toBe(once);
  });

  it("passes through anything it does not recognize rather than rewriting it", () => {
    expect(capScoreBySeverity(null, [cat("Critical", 0)])).toBeNull();
    expect(capScoreBySeverity(95, null)).toBe(95);
    expect(capScoreBySeverity(95, "junk" as never)).toBe(95);
  });

  it("keeps the ladder ordered worst-first, which the lookup depends on", () => {
    expect(SEVERITY_GRADE_CAPS.map((c) => c.severity)).toEqual(["Critical", "Moderate", "Minor"]);
  });
});

describe("scoreCapReason — the UI must say why the NUMBER stalled", () => {
  it("reports the ceiling when the score is sitting at it", () => {
    // A reader watching the score stall at 79 needs to know one finding is
    // holding it there, not that the checks stopped improving.
    expect(scoreCapReason(79, [cat("Moderate", 50)])).toEqual({
      cappedScore: 79,
      severity: "Moderate",
      cappedGrade: "C",
    });
  });

  it("works from the ALREADY-CAPPED score, which is all any consumer has", () => {
    // Both report views, the exports and stored reports only ever see the
    // capped number. A raw-vs-capped comparison could never fire for them.
    expect(scoreCapReason(69, [cat("Critical", 0)])?.cappedGrade).toBe("D");
    expect(scoreCapReason(89, [cat("Minor", 80)])?.cappedGrade).toBe("B");
  });

  it("returns null when the score is below the ceiling", () => {
    expect(scoreCapReason(71, [cat("Moderate", 50)])).toBeNull(); // under 79
    expect(scoreCapReason(100, [cat("No issues found", 100)])).toBeNull();
    expect(scoreCapReason(null, [cat("Critical", 0)])).toBeNull();
  });
});

describe("regradeStoredReport — already-shared links self-correct", () => {
  // The alternative was leaving old links on the old scale, which reintroduces
  // the contradiction across TIME instead of across documents: a report shared
  // last week reading B while the same document re-audited today reads D.
  // The REAL stored payload of "Public Notice of Meeting.docx" as served from
  // production on 2026-08-07 — the report that exposed this. A shared link
  // showed 71/C while re-uploading the same file gave 79/C, because the
  // regrade only applied the ceiling and never recomputed under the current
  // rule. A stub fixture would not have caught it; this one is the case.
  const storedNotice = () => ({
    fileType: "docx",
    overallScore: 71,
    grade: "C",
    isScanned: false,
    executiveSummary: "This Word document scored 71/100 (grade C) for overall readiness.",
    conformance: { status: "fail", failures: [{ sc: "2.4.2" }] },
    categories: [
      {
        id: "text_extractability",
        score: 100,
        weight: 0.05,
        notAssessed: false,
        severity: "No issues found",
      },
      { id: "title_language", score: 50, weight: 0.18, notAssessed: false, severity: "Moderate" },
      { id: "heading_structure", score: null, weight: 0.18, notAssessed: false, severity: null },
      { id: "alt_text", score: null, weight: 0.18, notAssessed: false, severity: null },
      { id: "table_markup", score: null, weight: 0.12, notAssessed: false, severity: null },
      { id: "color_contrast", score: null, weight: 0.12, notAssessed: true, severity: null },
      { id: "list_structure", score: null, weight: 0.09, notAssessed: false, severity: null },
      {
        id: "link_quality",
        score: 100,
        weight: 0.08,
        notAssessed: false,
        severity: "No issues found",
      },
      { id: "reading_order", score: null, weight: 0, notAssessed: true, severity: null },
      { id: "form_accessibility", score: null, weight: 0, notAssessed: true, severity: null },
    ],
  });

  const stored = () => ({
    fileType: "pdf",
    overallScore: 80,
    grade: "B",
    isScanned: false,
    executiveSummary: "This PDF scored 80/100 (grade B) for overall readiness.",
    conformance: { status: "fail", failures: [{ sc: "2.4.2" }] },
    categories: [
      {
        id: "text_extractability",
        score: 100,
        weight: 0.2,
        notAssessed: false,
        severity: "No issues found",
      },
      { id: "title_language", score: 0, weight: 0.15, notAssessed: false, severity: "Critical" },
      {
        id: "heading_structure",
        score: 100,
        weight: 0.15,
        notAssessed: false,
        severity: "No issues found",
      },
      { id: "alt_text", score: 100, weight: 0.15, notAssessed: false, severity: "No issues found" },
      {
        id: "reading_order",
        score: 100,
        weight: 0.1,
        notAssessed: false,
        severity: "No issues found",
      },
    ],
    scoreProfiles: {
      strict: {
        overallScore: 80,
        grade: "B",
        executiveSummary: "This PDF scored 80/100 (grade B) for overall readiness.",
        categories: [
          {
            id: "text_extractability",
            score: 100,
            weight: 0.2,
            notAssessed: false,
            severity: "No issues found",
          },
          {
            id: "title_language",
            score: 0,
            weight: 0.15,
            notAssessed: false,
            severity: "Critical",
          },
          {
            id: "heading_structure",
            score: 100,
            weight: 0.15,
            notAssessed: false,
            severity: "No issues found",
          },
          {
            id: "alt_text",
            score: 100,
            weight: 0.15,
            notAssessed: false,
            severity: "No issues found",
          },
          {
            id: "reading_order",
            score: 100,
            weight: 0.1,
            notAssessed: false,
            severity: "No issues found",
          },
        ],
      },
    },
  });

  it("recomputes a stored report under the CURRENT rule, not just the ceiling", () => {
    // The live failure: this link served 71/C while a fresh audit of the same
    // file gave 79/C. Capping alone can only lower, so it could never pick up
    // v1.58.3's change (inapplicable checks now count as passing).
    const out = regradeStoredReport(storedNotice());
    expect(out.overallScore).toBe(79);
    expect(out.grade).toBe("C");
  });

  it("honours notAssessed when recomputing a stored report", () => {
    // color_contrast is stored notAssessed:true at weight 0.12. Counting it
    // as a pass would give 91 -> still capped to 79, hiding the bug; this
    // asserts it is EXCLUDED, which is what makes 79 the right 79.
    const withoutContrast = storedNotice();
    withoutContrast.categories = withoutContrast.categories.filter(
      (c) => c.id !== "color_contrast",
    );
    expect(regradeStoredReport(withoutContrast).overallScore).toBe(
      regradeStoredReport(storedNotice()).overallScore,
    );
  });

  it("scores a stored SCANNED report 0 however its categories look", () => {
    const scanned = { ...storedNotice(), isScanned: true };
    const out = regradeStoredReport(scanned);
    expect(out.overallScore).toBe(0);
    expect(out.grade).toBe("F");
  });

  it("lowers the stored score to the cap and re-derives the letter from it", () => {
    const out = regradeStoredReport(stored());
    expect(out.overallScore).toBe(69);
    expect(out.grade).toBe("D");
    // The scale must hold on stored reports too — they are served from a
    // different code path than a fresh audit.
    expect(gradeForScore(out.overallScore)).toBe(out.grade);
  });

  it("regrades each score profile against its OWN categories", () => {
    // The strict and remediation profiles are independently scored; capping a
    // profile with the top-level categories would be a different document's
    // answer.
    const p = regradeStoredReport(stored()).scoreProfiles.strict;
    expect(p.overallScore).toBe(69);
    expect(p.grade).toBe("D");
  });

  it("regenerates the summary rather than patching the letter inside it", () => {
    // The summary BRANCHES on the grade, so swapping "B" for "D" in stale
    // prose would leave the sentence arguing against its own grade — and the
    // stale SCORE would reintroduce the "D above 80/100" mismatch verbatim.
    const out = regradeStoredReport(stored());
    expect(out.executiveSummary).not.toContain("grade B");
    expect(out.executiveSummary).not.toContain("80/100");
    expect(out.executiveSummary).toContain("grade D");
    expect(out.executiveSummary).toContain("69/100");
  });

  it("is idempotent, so a freshly-capped report is not re-lowered", () => {
    const once = regradeStoredReport(stored());
    const twice = regradeStoredReport(JSON.parse(JSON.stringify(once)));
    expect(twice.overallScore).toBe(once.overallScore);
    expect(twice.grade).toBe(once.grade);
    expect(twice.executiveSummary).toBe(once.executiveSummary);
  });

  it("never throws on a malformed or ancient row", () => {
    // This runs on a PUBLIC share link. A crash here is a 500 on someone's
    // shared evidence; a stale sentence is not.
    expect(() => regradeStoredReport(null)).not.toThrow();
    expect(() => regradeStoredReport("nonsense")).not.toThrow();
    expect(() => regradeStoredReport({})).not.toThrow();
    expect(() => regradeStoredReport({ grade: "B" })).not.toThrow();
    expect(() => regradeStoredReport({ overallScore: 80, categories: "junk" })).not.toThrow();
    expect(() =>
      regradeStoredReport({ overallScore: 80, categories: [cat("Critical", 0)] }),
    ).not.toThrow();
  });

  it("keeps the corrected score when the summary cannot be regenerated", () => {
    // Missing conformance → generateSummary throws → the score and letter
    // must still be corrected; only the sentence stays stale.
    const broken: Record<string, unknown> = stored();
    delete broken.conformance;
    const out = regradeStoredReport(broken) as { overallScore: number; grade: string };
    expect(out.overallScore).toBe(69);
    expect(out.grade).toBe("D");
  });
});

describe("the four documents that caused this change", () => {
  // Now checked into controls/ as permanent fixtures. Reduced here to the
  // load-bearing facts — these pin the RELATIONSHIPS that were wrong.
  const agenda = { score: 87, cats: [cat("Moderate", 50), cat("Minor", 85)] };
  const notice = { score: 71, cats: [cat("Moderate", 50)] };
  const notesPdf = { score: 80, cats: [cat("Critical", 0)] };
  const minutesPdf = { score: 81, cats: [cat("Critical", 0)] };

  type Doc = { score: number; cats: ReturnType<typeof cat>[] };
  const score = (d: Doc) => capScoreBySeverity(d.score, d.cats)!;
  const grade = (d: Doc) => gradeForScore(score(d));

  it("gives the same letter to the two Word files with the same defect", () => {
    // The first report: "they both have document title issues but look to be
    // graded differently." They were B (87) and C (71).
    expect(grade(agenda)).toBe("C");
    expect(grade(notice)).toBe("C");
    expect(grade(agenda)).toBe(grade(notice));
  });

  it("keeps every one of them on the published scale", () => {
    // The second report: "80 and above is a B. Not a C — and certainly not a
    // D." Every score below must map to its own letter by 90/80/70/60.
    for (const d of [agenda, notice, notesPdf, minutesPdf]) {
      expect(gradeForScore(score(d))).toBe(expectedGrade(score(d)));
    }
    expect(score(agenda)).toBe(79); // was 87 -> B, which outranked the notice
    expect(score(notice)).toBe(71);
    expect(score(notesPdf)).toBe(69); // was 80 -> B, above both Word files
    expect(score(minutesPdf)).toBe(69);
  });

  it("ranks the two PDFs with the WORSE defect below both Word files", () => {
    // Missing title AND language (two WCAG failures) used to grade B —
    // better than the Word file missing only the title.
    expect(grade(notesPdf)).toBe("D");
    expect(grade(minutesPdf)).toBe("D");
    expect(score(notesPdf)).toBeLessThan(score(notice));
  });

  it("stops a document with a critical finding from reading as publishable", () => {
    for (const d of [notesPdf, minutesPdf]) {
      expect(["D", "F"]).toContain(grade(d));
    }
  });
});
