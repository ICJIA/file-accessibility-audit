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
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("the conformance builder's source names no WCAG 2.2-only criterion", () => {
    // The failures list ("N criteria failing") is built here; a 2.2-only SC
    // appearing in it would put a non-legal criterion under the strip's
    // "Required by WCAG 2.1" headline.
    const src = readFileSync(
      resolve(__dirname, "../../../../packages/analyzer/src/scoring/conformance.ts"),
      "utf8",
    );
    for (const sc of WCAG_22_ONLY) {
      expect(src.includes(`"${sc}"`), `conformance.ts names ${sc} (WCAG 2.2-only)`).toBe(false);
    }
  });
});
