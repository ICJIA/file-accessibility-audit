/**
 * The grade is WCAG 2.1-pure — pinned, not promised (v1.135.0).
 *
 * The strip tells every reader: "Nothing beyond WCAG 2.1 A/AA is counted —
 * not the criteria WCAG 2.2 added, not PDF/UA." That sentence is the
 * product's answer to the SiteImprove failure mode (dinging documents for
 * requirements outside the standard the law names), so it must be an
 * invariant, not copy. These tests fail the build the moment anyone maps a
 * WCAG 2.2-only criterion into scoring or conformance.
 *
 * (The 2.2-only criteria may still appear in the "not checked by this tool"
 * DISCLOSURE list — unexamined, explicitly uncounted — which is the one
 * place they belong.)
 */
import { describe, it, expect, vi } from "vitest";
import { WCAG_CATEGORY_MAP } from "@file-audit/shared";

const WCAG_22_ONLY = [
  "2.4.11",
  "2.4.12",
  "2.4.13",
  "2.5.7",
  "2.5.8",
  "3.2.6",
  "3.3.7",
  "3.3.8",
  "3.3.9",
];

describe("the grade and the failing-criteria list are WCAG 2.1-pure", () => {
  it("no scored category cites a WCAG 2.2-only criterion", () => {
    for (const [category, refs] of Object.entries(WCAG_CATEGORY_MAP)) {
      for (const ref of refs) {
        expect(
          WCAG_22_ONLY,
          `${category} cites ${ref.sc}, which exists only in WCAG 2.2 — the grade must measure WCAG 2.1 A/AA and nothing more`,
        ).not.toContain(ref.sc);
        expect(["A", "AA"]).toContain(ref.level);
      }
    }
  });

  it("no verdict the builder produces puts a WCAG 2.2-only criterion in `failures`", async () => {
    // WAS A SOURCE GREP, AND THEREFORE VACUOUS (fixed 2026-08-31). It read
    // conformance.ts as text and asserted the string `"2.5.8"` did not appear.
    // It never appears: the 2.2 criteria arrive through WCAG_22_NEW_AA,
    // imported from #config. The test passed on a file that pushes all three
    // of them, and would have kept passing if `notAssessed.push` there were
    // changed to `failures.push` — the exact regression it was written to stop.
    //
    // Assert the VERDICT instead, on the one input that reaches the 2.2 block
    // (a form PDF), under both settings of the version flag.
    const makeQpdf = (o: Record<string, unknown> = {}) =>
      ({
        error: null,
        hasStructTree: true,
        hasLang: true,
        images: [],
        lists: [],
        tables: [],
        hasAcroForm: true,
        formFields: [{ hasTU: true }],
        ...o,
      }) as never;
    const makePdfjs = () => ({ error: null, hasText: true, lang: "en", title: "A Title" }) as never;

    const orig = process.env.WCAG_VERSION;
    try {
      for (const version of ["2.1", "2.2"]) {
        if (version === "2.2") process.env.WCAG_VERSION = "2.2";
        else delete process.env.WCAG_VERSION;
        vi.resetModules(); // re-read WCAG.VERSION
        const { evaluateConformance } = await import("../services/scoring/conformance.js");

        for (const categories of [
          [{ id: "reading_order", score: 100 }],
          // a failing document, so `failures` is genuinely populated
          [{ id: "reading_order", score: 40 }],
        ]) {
          const v = evaluateConformance(
            makeQpdf({ hasStructTree: false }),
            makePdfjs(),
            categories as never,
          );
          const failed = v.failures.map((f) => f.sc);
          for (const sc of WCAG_22_ONLY) {
            expect(
              failed,
              `WCAG_VERSION=${version}: ${sc} is WCAG 2.2-only and must never reach the failing-criteria list that sits under "Required by WCAG 2.1"`,
            ).not.toContain(sc);
          }
          for (const f of v.failures) expect(["A", "AA"]).toContain(f.level);
        }
      }
    } finally {
      if (orig === undefined) delete process.env.WCAG_VERSION;
      else process.env.WCAG_VERSION = orig;
    }
  });
});
