import { describe, it, expect, vi, afterEach } from "vitest";

// Build minimal-but-complete analyzer results. Only the fields below affect the gate.
function makeQpdf(overrides: any = {}) {
  return {
    error: null,
    hasStructTree: true,
    hasLang: true,
    images: [],
    lists: [],
    tables: [],
    hasAcroForm: false,
    formFields: [],
    ...overrides,
  } as any;
}
function makePdfjs(overrides: any = {}) {
  return { error: null, hasText: true, lang: "en", title: "A Title", ...overrides } as any;
}
const cleanCategories = [{ id: "reading_order", score: 100 }] as any;

async function loadGate() {
  // Re-import after env change so the module re-reads WCAG.VERSION.
  vi.resetModules();
  return (await import("../services/scoring/conformance.js")).evaluateConformance;
}

describe("conformance gate — WCAG 2.2", () => {
  const orig = process.env.WCAG_VERSION;
  afterEach(() => {
    // Restore precisely: assigning `undefined` to process.env coerces to the
    // string "undefined", so unset it instead when it was originally unset.
    if (orig === undefined) delete process.env.WCAG_VERSION;
    else process.env.WCAG_VERSION = orig;
  });

  it("uses WCAG22 Understanding URLs and a 2.2 headline by default", async () => {
    delete process.env.WCAG_VERSION; // default 2.2
    const evaluate = await loadGate();
    const v = evaluate(makeQpdf({ hasStructTree: false }), makePdfjs(), cleanCategories);
    expect(v.headline).toContain("WCAG 2.2 Level AA");
    expect(v.failures.some((f: any) => f.url.includes("/WCAG22/"))).toBe(true);
  });

  it("adds form-relevant 2.2 criteria to notAssessed when the PDF has form fields", async () => {
    delete process.env.WCAG_VERSION;
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasAcroForm: true, formFields: [{ hasTU: true }] }),
      makePdfjs(),
      cleanCategories,
    );
    const scs = v.notAssessed.map((n: any) => n.sc);
    expect(scs).toEqual(expect.arrayContaining(["2.5.8", "3.3.7", "3.3.8"]));
    expect(scs).not.toContain("2.5.7"); // not form-relevant
  });

  it("does NOT add 2.2 form criteria when the PDF has no form fields", async () => {
    delete process.env.WCAG_VERSION;
    const evaluate = await loadGate();
    const v = evaluate(makeQpdf(), makePdfjs(), cleanCategories);
    const scs = v.notAssessed.map((n: any) => n.sc);
    expect(scs).not.toContain("2.5.8");
    expect(scs).not.toContain("3.3.7");
    expect(scs).not.toContain("3.3.8");
  });

  it("reverts to 2.1 URLs/headline and adds no 2.2 criteria when WCAG_VERSION=2.1", async () => {
    process.env.WCAG_VERSION = "2.1";
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasAcroForm: true, formFields: [{ hasTU: true }], hasStructTree: false }),
      makePdfjs(),
      cleanCategories,
    );
    expect(v.headline).toContain("WCAG 2.1 Level AA");
    expect(v.failures.every((f: any) => f.url.includes("/WCAG21/"))).toBe(true);
    const scs = v.notAssessed.map((n: any) => n.sc);
    expect(scs).not.toContain("3.3.8");
  });
});

describe("conformance gate — 1.3.2 Meaningful Sequence evidence", () => {
  it("does NOT assert 1.3.2 from a low heuristic category score alone", async () => {
    // A flat-but-correctly-ordered structure tree scores 30 in the
    // reading_order category (flat-tree heuristic) WITHOUT any actual
    // order comparison having run. That is not evidence of a confirmed
    // Meaningful Sequence violation.
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasStructTree: true }), // no MCID data → rigorous check can't run
      makePdfjs(),
      [{ id: "reading_order", score: 30 }] as any,
    );
    expect(v.failures.some((f: any) => f.sc === "1.3.2")).toBe(false);
  });

  it("asserts 1.3.2 when the rigorous MCID comparison finds substantial disorder", async () => {
    // Struct-tree order is the exact reverse of the content-stream order on
    // the only page — the rigorous comparison itself proves the disorder,
    // regardless of what the category score happens to be.
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({
        hasStructTree: true,
        structTreeMcidsByPage: { 1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      }),
      makePdfjs({
        contentStreamMcidsByPage: { 1: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
      }),
      [{ id: "reading_order", score: 100 }] as any,
    );
    expect(v.failures.some((f: any) => f.sc === "1.3.2")).toBe(true);
  });
});
