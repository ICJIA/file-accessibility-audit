/**
 * The human-readable audit printout's category table.
 *
 * 2026-09-01: per-category letters were removed from every human-readable
 * surface — a letter beside a category score gets read as the DOCUMENT's
 * grade (a B document whose 75-point title row showed a C misled the
 * product's own author). The overall "Grade: B" line keeps its letter;
 * category rows carry score + severity only. The web report, exports, and
 * this CLI table all follow the same contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { printResult } from "../commands/audit.js";
import type { AnalysisResult } from "@file-audit/analyzer";

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function fixture(): AnalysisResult {
  return {
    filename: "Douglas.pdf",
    fileType: "pdf",
    pageCount: 112,
    overallScore: 89,
    grade: "B",
    isScanned: false,
    executiveSummary: "One Minor finding.",
    categories: [
      {
        id: "title_language",
        label: "Document Title & Language",
        weight: 0.15,
        score: 75,
        grade: "C",
        severity: "Minor",
        findings: [],
        explanation: "",
      },
    ],
    warnings: [],
  } as unknown as AnalysisResult;
}

afterEach(() => vi.restoreAllMocks());

describe("printResult — no per-category letter (2026-09-01)", () => {
  it("prints the category table as Category/Score/Severity, keeping the overall Grade line", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printResult(fixture());
    const out = spy.mock.calls.map((c) => stripAnsi(String(c[0] ?? ""))).join("\n");

    // The document's grade stays — that pairing is the hero's job.
    expect(out).toContain("Grade: B");
    // The table header carries no Grade column.
    expect(out).toMatch(/Category\s+Score\s+Severity/);
    expect(out).not.toMatch(/Category\s+Score\s+Grade/);
    // The 75-point row shows score and severity, never a standalone C.
    // \s* before the score: the 25-char label overruns the 24-char column,
    // so no pad space separates them (pre-existing spacing, not this change).
    expect(out).toMatch(/Document Title & Language\s*75\s+Minor/);
  });
});
