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

describe("conformance gate — encryption accessibility permission", () => {
  it("asserts a confirmed Level A failure when security settings deny assistive technology", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ isEncrypted: true, accessibilityAllowed: false }),
      makePdfjs(),
      cleanCategories,
    );
    expect(v.status).toBe("fail");
    const f = v.failures.find(
      (x: any) =>
        x.issue.includes("security settings") && x.issue.includes("assistive-technology"),
    );
    expect(f).toBeDefined();
    expect(f!.sc).toBe("1.1.1");
    expect(f!.level).toBe("A");
  });

  it("does not fire when encryption explicitly permits accessibility", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ isEncrypted: true, accessibilityAllowed: true }),
      makePdfjs(),
      cleanCategories,
    );
    expect(v.failures.filter((x: any) => x.issue.includes("security settings"))).toHaveLength(0);
  });

  it("does not fire for unencrypted documents (accessibilityAllowed null/undefined)", async () => {
    const evaluate = await loadGate();
    const v = evaluate(makeQpdf(), makePdfjs(), cleanCategories);
    expect(v.failures.filter((x: any) => x.issue.includes("security settings"))).toHaveLength(0);
  });
});

describe("conformance gate — 1.1.1 scanned-document evidence", () => {
  it("does not assert 1.1.1 for a short born-digital document (little text, no images)", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf(),
      makePdfjs({ hasText: false, textLength: 30, imageCount: 0 }),
      cleanCategories,
    );
    expect(
      v.failures.filter(
        (f: any) => f.issue.includes("scanned") || f.issue.includes("No extractable text"),
      ),
    ).toHaveLength(0);
  });

  it("asserts 1.1.1 for a truly text-free document whose pages are images", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasStructTree: false }),
      makePdfjs({ hasText: false, textLength: 0, imageCount: 4 }),
      cleanCategories,
    );
    const f = v.failures.find((x: any) => x.issue.includes("scanned"));
    expect(f).toBeDefined();
    expect(f!.sc).toBe("1.1.1");
  });

  it("does not assert the scanned claim for an empty document (no text, no images)", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf(),
      makePdfjs({ hasText: false, textLength: 0, imageCount: 0 }),
      cleanCategories,
    );
    expect(v.failures.filter((f: any) => f.issue.includes("scanned"))).toHaveLength(0);
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

  it("routes heavy tag-vs-draw-order divergence to notAssessed, never a confirmed failure", async () => {
    // Struct-tree order is the exact reverse of the content-stream DRAW
    // order. That proves the two orders disagree — it cannot prove which
    // side is wrong (remediation deliberately re-orders tags away from a
    // bad stream order, and AT follows the tags). Asserting a confirmed
    // 1.3.2 here punished professionally remediated documents.
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
    expect(v.failures.some((f: any) => f.sc === "1.3.2")).toBe(false);
    const na = v.notAssessed.find((n: any) => n.sc === "1.3.2");
    expect(na).toBeDefined();
    expect(na!.reason).toMatch(/diverge|draw order/i);
  });
});

describe("conformance gate — 1.3.1 table claim scope", () => {
  it("does not assert the table claim for sub-2x2 (layout-like) tables", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({
        tables: [
          { hasHeaders: false, rowCount: 1, columnCounts: [3] },
          { hasHeaders: false, rowCount: 5, columnCounts: [1] },
        ],
      }),
      makePdfjs(),
      cleanCategories,
    );
    expect(v.failures.filter((f: any) => f.issue.includes("header cells"))).toHaveLength(0);
  });

  it("still asserts the claim for a real headerless data table", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ tables: [{ hasHeaders: false, rowCount: 3, columnCounts: [3, 3, 3] }] }),
      makePdfjs(),
      cleanCategories,
    );
    expect(v.failures.some((f: any) => f.issue.includes("header cells"))).toBe(true);
  });
});

describe("conformance gate — XFA forms", () => {
  it("returns incomplete for DYNAMIC XFA (NeedsRendering) instead of judging the placeholder", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasXfa: true, needsRendering: true, hasStructTree: false }),
      makePdfjs(),
      [],
    );
    expect(v.status).toBe("incomplete");
    expect(v.headline).toMatch(/XFA|form technology/i);
    expect(v.failures).toHaveLength(0);
  });

  it("evaluates STATIC XFA normally — the conventional content IS what viewers show", async () => {
    // Static XFA (no NeedsRendering) ships a full conventional rendering;
    // refusing a verdict for it wrongly withheld clean verdicts from
    // accessible Designer forms.
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasXfa: true, needsRendering: false, hasStructTree: true }),
      makePdfjs(),
      cleanCategories,
    );
    expect(v.status).toBe("no-automated-failures");
  });
});

describe("conformance gate — mid-band order divergence still flags manual review", () => {
  it("lists 1.3.2 as notAssessed for ~70% draw-order agreement", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({
        hasStructTree: true,
        structTreeMcidsByPage: { 1: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      }),
      makePdfjs({
        contentStreamMcidsByPage: { 1: [2, 0, 1, 5, 3, 4, 8, 6, 7, 9] },
      }),
      [{ id: "reading_order", score: 65 }] as any,
    );
    expect(v.failures.some((f: any) => f.sc === "1.3.2")).toBe(false);
    expect(v.notAssessed.some((n: any) => n.sc === "1.3.2")).toBe(true);
  });
});
