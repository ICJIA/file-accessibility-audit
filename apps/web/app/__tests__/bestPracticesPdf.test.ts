/**
 * The PDF catalog, one describe per practice, four statuses each.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: an empty or unrecognised findings
 * list yields NOT CHECKED, never MET. The section renders every practice
 * always, which is only honest while a green check requires the analyzer to
 * have actually said so.
 *
 * Every fixture string below is copied VERBATIM from packages/analyzer. If a
 * test here fails after an analyzer change, the catalog's matcher is stale —
 * fix the matcher, do not loosen the test.
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
  "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected. Screen-reader users may still wonder what they missed at the skipped level.";
const HEADING_TREE_GROUP = [
  "--- Heading Tree ---",
  "  H1 → H2 → H1 → H1 → H3 → H5",
  "  Heading hierarchy skip: H1 → H3 (skipped H2)",
  "  Heading hierarchy skip: H3 → H5 (skipped H4)",
];
const HEADING_OK = "Found 6 heading tags with logical hierarchy";

describe("heading-level-order", () => {
  it("is NOT MET and shows the document's own heading sequence and each skip", () => {
    const r = run("heading-level-order", [HEADING_GAPS, ...HEADING_TREE_GROUP]);
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
    const r = run("heading-level-order", ["No heading tags found in the document structure"]);
    expect(r.status).toBe("not-applicable");
  });

  it("is NOT CHECKED — never MET — when the analyzer said nothing either way", () => {
    expect(run("heading-level-order", []).status).toBe("not-checked");
    expect(run("heading-level-order", ["Structure tree depth: 7 level(s)"]).status).toBe(
      "not-checked",
    );
  });
});

describe("every PDF practice", () => {
  it("returns NOT CHECKED for an empty document — silence is never a pass", () => {
    for (const p of PDF_PRACTICES) {
      const r = p.detect(buildContext({ findings: [] }, "pdf", 0));
      expect(r.status, `${p.id} must not claim a pass on silence`).not.toBe("met");
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
      // kept free of "strong".
      expect(copy, p.id).not.toMatch(/required by law/i);
      expect(copy, p.id).not.toMatch(/\bstrong\b/i);
    }
  });
});
