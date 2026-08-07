import { describe, it, expect } from "vitest";
import {
  capGradeBySeverity,
  worstSeverity,
  gradeCapReason,
  SEVERITY_GRADE_CAPS,
} from "@file-audit/shared";
import { regradeStoredReport } from "@file-audit/analyzer";

// The letter grade may never outrank the document's worst unresolved finding.
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
// The three cases at the bottom of this file are those exact documents. They
// are the reason the rule exists, so they are pinned by name: a future change
// that re-inverts them fails here with the original complaint spelled out.

const cat = (severity: string | null, score: number | null = 50) => ({ score, severity });

describe("capGradeBySeverity — the worst finding sets the band", () => {
  it("caps at the ladder's ceiling for each severity", () => {
    expect(capGradeBySeverity("A", [cat("Critical", 0)])).toBe("D");
    expect(capGradeBySeverity("A", [cat("Moderate", 50)])).toBe("C");
    expect(capGradeBySeverity("A", [cat("Minor", 80)])).toBe("B");
  });

  it("leaves a clean document's grade alone", () => {
    expect(capGradeBySeverity("A", [cat("No issues found", 100)])).toBe("A");
    expect(capGradeBySeverity("A", [])).toBe("A");
  });

  it("only ever lowers — a worse average keeps its worse letter", () => {
    // The cap is a ceiling, not an assignment. An F with a Critical finding
    // must not be PROMOTED to D.
    expect(capGradeBySeverity("F", [cat("Critical", 0)])).toBe("F");
    expect(capGradeBySeverity("D", [cat("Moderate", 50)])).toBe("D");
    expect(capGradeBySeverity("C", [cat("Minor", 80)])).toBe("C");
  });

  it("is driven by the WORST severity when several are present", () => {
    const mixed = [cat("Minor", 80), cat("Critical", 10), cat("Moderate", 50)];
    expect(worstSeverity(mixed)).toBe("Critical");
    expect(capGradeBySeverity("A", mixed)).toBe("D");
  });

  it("ignores categories that were never assessed", () => {
    // "No images were found" is not a finding. Letting a null-scored category
    // cap the grade would punish a document for what it does not contain —
    // which is the same class of error the cap was written to fix.
    expect(capGradeBySeverity("A", [{ score: null, severity: "Critical" }])).toBe("A");
  });

  it("is idempotent, which is what lets it run at source AND at render", () => {
    const cats = [cat("Critical", 0)];
    const once = capGradeBySeverity("A", cats);
    expect(capGradeBySeverity(once, cats)).toBe(once);
  });

  it("passes through anything it does not recognize rather than rewriting it", () => {
    expect(capGradeBySeverity("Z", [cat("Critical", 0)])).toBe("Z");
    expect(capGradeBySeverity(null, [cat("Critical", 0)])).toBeNull();
    expect(capGradeBySeverity("A", null)).toBe("A");
    expect(capGradeBySeverity("A", "junk" as never)).toBe("A");
  });

  it("keeps the ladder ordered worst-first, which the lookup depends on", () => {
    expect(SEVERITY_GRADE_CAPS.map((c) => c.severity)).toEqual(["Critical", "Moderate", "Minor"]);
  });
});

describe("gradeCapReason — the UI must say why the letter is below the score", () => {
  it("reports the gap so the hero can explain it", () => {
    // 87 alone is a B; a moderate finding holds it at C. Unexplained, that
    // pairing reads as a bug to the non-technical staff this is written for.
    expect(gradeCapReason(87, [cat("Moderate", 50)])).toEqual({
      uncappedGrade: "B",
      cappedGrade: "C",
      severity: "Moderate",
    });
  });

  it("returns null when the score and the letter already agree", () => {
    expect(gradeCapReason(71, [cat("Moderate", 50)])).toBeNull(); // 71 is already C
    expect(gradeCapReason(100, [cat("No issues found", 100)])).toBeNull();
    expect(gradeCapReason(null, [cat("Critical", 0)])).toBeNull();
  });
});

describe("regradeStoredReport — already-shared links self-correct", () => {
  // The alternative was leaving old links on the old scale, which reintroduces
  // the contradiction across TIME instead of across documents: a report shared
  // last week reading B while the same file re-audited today reads D.
  const stored = () => ({
    fileType: "pdf",
    overallScore: 80,
    grade: "B",
    isScanned: false,
    executiveSummary: "This PDF scored 80/100 (grade B) for overall readiness.",
    conformance: { status: "fail", failures: [{ sc: "2.4.2" }] },
    categories: [
      { id: "title_language", score: 0, severity: "Critical", weight: 0.15 },
      { id: "alt_text", score: 100, severity: "No issues found", weight: 0.15 },
    ],
    scoreProfiles: {
      strict: {
        overallScore: 80,
        grade: "B",
        executiveSummary: "This PDF scored 80/100 (grade B) for overall readiness.",
        categories: [{ id: "title_language", score: 0, severity: "Critical", weight: 0.15 }],
      },
    },
  });

  it("lowers the stored letter to the cap", () => {
    expect(regradeStoredReport(stored()).grade).toBe("D");
  });

  it("regrades each score profile against its OWN categories", () => {
    // The strict and remediation profiles are independently scored; capping a
    // profile with the top-level categories would be a different document's
    // answer.
    expect(regradeStoredReport(stored()).scoreProfiles.strict.grade).toBe("D");
  });

  it("regenerates the summary rather than patching the letter inside it", () => {
    // The summary BRANCHES on the grade, so swapping "B" for "D" in stale
    // prose would leave the sentence arguing against its own grade.
    const out = regradeStoredReport(stored());
    expect(out.executiveSummary).not.toContain("grade B");
    expect(out.executiveSummary).toContain("grade D");
  });

  it("leaves the numeric score untouched — only the letter is capped", () => {
    expect(regradeStoredReport(stored()).overallScore).toBe(80);
  });

  it("is idempotent, so a freshly-capped report is not re-lowered", () => {
    const once = regradeStoredReport(stored());
    const twice = regradeStoredReport(JSON.parse(JSON.stringify(once)));
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
    expect(() => regradeStoredReport({ grade: "B", categories: "junk" })).not.toThrow();
    expect(() =>
      regradeStoredReport({ grade: "B", categories: [cat("Critical", 0)] }),
    ).not.toThrow();
  });

  it("keeps a grade whose summary cannot be regenerated, rather than losing the fix", () => {
    // Missing conformance → generateSummary throws → the letter must still
    // be corrected; only the sentence stays stale.
    const broken: any = stored();
    delete broken.conformance;
    const out = regradeStoredReport(broken);
    expect(out.grade).toBe("D");
  });
});

describe("the four documents that caused this change", () => {
  // Reduced to the load-bearing facts. Full audits live in the corpus run;
  // these pin the RELATIONSHIPS that were wrong.
  const agenda = { score: 87, cats: [cat("Moderate", 50), cat("Minor", 85)] };
  const notice = { score: 71, cats: [cat("Moderate", 50)] };
  const notesPdf = { score: 80, cats: [cat("Critical", 0)] };
  const minutesPdf = { score: 81, cats: [cat("Critical", 0)] };

  const grade = (d: { score: number; cats: ReturnType<typeof cat>[] }) =>
    capGradeBySeverity(
      d.score >= 90 ? "A" : d.score >= 80 ? "B" : d.score >= 70 ? "C" : d.score >= 60 ? "D" : "F",
      d.cats,
    );

  it("gives the same letter to the two Word files with the same defect", () => {
    // The original report: "they both have document title issues but look to
    // be graded differently." They were B (87) and C (71).
    expect(grade(agenda)).toBe("C");
    expect(grade(notice)).toBe("C");
    expect(grade(agenda)).toBe(grade(notice));
  });

  it("ranks the two PDFs with the WORSE defect below both Word files", () => {
    // Missing title AND language (two WCAG failures) used to grade B —
    // better than the Word file missing only the title.
    expect(grade(notesPdf)).toBe("D");
    expect(grade(minutesPdf)).toBe("D");
    const RANK = ["A", "B", "C", "D", "F"];
    expect(RANK.indexOf(grade(notesPdf)!)).toBeGreaterThan(RANK.indexOf(grade(notice)!));
  });

  it("stops a document with a critical finding from reading as publishable", () => {
    // Grade and publication verdict can no longer disagree: anything with a
    // Critical is at best a D, which no reader mistakes for "ready".
    for (const d of [notesPdf, minutesPdf]) {
      expect(["D", "F"]).toContain(grade(d));
    }
  });
});
