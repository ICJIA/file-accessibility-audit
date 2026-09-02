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

  it("uses WCAG21 Understanding URLs by default; the fail headline names WCAG 2.1", async () => {
    delete process.env.WCAG_VERSION; // default 2.1 since 2026-08-31
    const evaluate = await loadGate();
    const v = evaluate(makeQpdf({ hasStructTree: false }), makePdfjs(), cleanCategories);
    // The fail headline names WCAG 2.1 regardless of the audit basis — the
    // failing criteria are 2.1 criteria (wcag21Purity), and 2.1 is the
    // standard the law cites. The Understanding URLs keep the audit basis.
    expect(v.headline).toContain("does not meet WCAG 2.1 Level AA");
    // Headline and links now agree: both name the standard the law names.
    expect(v.failures.every((f: any) => f.url.includes("/WCAG21/"))).toBe(true);
  });

  it("lists the form-relevant 2.2 criteria as ASPIRATIONAL notes, whichever version is displayed", async () => {
    // Restored 2026-08-31 after being gated off by the 2.1 default. They are
    // never failures and never touch the grade; each says in its own reason
    // that it sits beyond the standard being measured, so a reader cannot
    // mistake one for something the law asks of them. Removing them silently
    // took useful advice away from exactly the documents that need it.
    for (const version of ["2.1", "2.2"]) {
      if (version === "2.2") process.env.WCAG_VERSION = "2.2";
      else delete process.env.WCAG_VERSION;
      const v = (await loadGate())(
        makeQpdf({ hasAcroForm: true, formFields: [{ hasTU: true }] }),
        makePdfjs(),
        cleanCategories,
      );
      const scs = v.notAssessed.map((n: any) => n.sc);
      expect(scs, version).toEqual(expect.arrayContaining(["2.5.8", "3.3.7"]));
      expect(scs, version).not.toContain("2.5.7"); // not form-relevant
      expect(scs, version).not.toContain("3.3.8"); // authentication, not forms (2026-09-02)
      // Never a failure, and never counted.
      expect(
        v.failures.map((f: any) => f.sc),
        version,
      ).not.toContain("2.5.8");
      for (const sc of ["2.5.8", "3.3.7"]) {
        const entry = v.notAssessed.find((n: any) => n.sc === sc)!;
        expect(entry.reason, `${version} ${sc}`).toMatch(
          /[Bb]eyond the standard your grade measures/,
        );
      }
    }
    delete process.env.WCAG_VERSION;
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

  it("uses 2.1 URLs and headline when WCAG_VERSION=2.1, keeping the aspirational notes", async () => {
    process.env.WCAG_VERSION = "2.1";
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasAcroForm: true, formFields: [{ hasTU: true }], hasStructTree: false }),
      makePdfjs(),
      cleanCategories,
    );
    expect(v.headline).toContain("WCAG 2.1 Level AA");
    expect(v.failures.every((f: any) => f.url.includes("/WCAG21/"))).toBe(true);
    // The 2.2 form notes are NOT version-gated any more (2026-08-31): they are
    // aspirational either way, and each says so in its own reason. What the
    // version controls is which standard the verdict NAMES and links.
    const scs = v.notAssessed.map((n: any) => n.sc);
    expect(scs).toContain("3.3.7");
    expect(v.notAssessed.find((n: any) => n.sc === "3.3.7")!.reason).toMatch(
      /beyond the standard your grade measures/i,
    );
  });
});

describe("conformance gate — the two rules that used to infer (2026-09-02)", () => {
  it("5b: a tool-generated title is F25; a filename-SHAPED title with real words is not", async () => {
    const evaluate = await loadGate();
    const tool = evaluate(
      makeQpdf({ displayDocTitle: true }),
      makePdfjs({
        title: "report_v3_final.pdf",
        titleLooksLikeFilename: true,
        titleIsToolGenerated: true,
      }),
      cleanCategories,
    );
    expect(tool.failures.some((f: any) => f.sc === "2.4.2" && /F25/.test(f.issue))).toBe(true);

    const shaped = evaluate(
      makeQpdf({ displayDocTitle: true }),
      makePdfjs({
        title: "Annual_Report_2024",
        titleLooksLikeFilename: true,
        titleIsToolGenerated: false,
      }),
      cleanCategories,
    );
    expect(shaped.failures.some((f: any) => f.sc === "2.4.2")).toBe(false);
  });

  it("6b: 'no heading tags' is asserted only with ≥2 observed visual headings — never from page/paragraph/bookmark counts", async () => {
    const evaluate = await loadGate();
    const proxyOnly = evaluate(
      makeQpdf({ headings: [], totalPageCount: 12, paragraphCount: 40, outlineCount: 3 }),
      makePdfjs({ visualHeadingCandidateCount: 0 }),
      cleanCategories,
    );
    expect(proxyOnly.failures.some((f: any) => f.category === "heading_structure")).toBe(false);

    const observed = evaluate(
      makeQpdf({ headings: [], totalPageCount: 1, paragraphCount: 4 }),
      makePdfjs({
        visualHeadingCandidateCount: 2,
        visualHeadingSamples: ["Background", "Next steps"],
      }),
      cleanCategories,
    );
    const f = observed.failures.find((x: any) => x.category === "heading_structure");
    expect(f).toBeDefined();
    expect(f!.sc).toBe("1.3.1");
    expect(f!.issue).toMatch(/2 line\(s\) look like section headings/);
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
      (x: any) => x.issue.includes("security settings") && x.issue.includes("assistive-technology"),
    );
    expect(f).toBeDefined();
    expect(f!.sc).toBe("1.1.1");
    expect(f!.level).toBe("A");
    // No criterion names an AT-denying security handler; the mapping must
    // carry its own argument on the page (2026-09-02).
    expect(f!.issue).toMatch(/non-text content with no text alternative/i);
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

describe("conformance gate — universally-unassessed criteria are disclosed", () => {
  // The manual-review card presents notAssessed as "criteria this tool does
  // not evaluate at all". Until 2026-08-08 that list held only contrast and
  // (conditionally) reading order — implying everything else was covered.
  // controls/ showed a live counterexample: a 100/A report carrying stray
  // da/de/it/no span languages the tool neither checks nor discloses (3.1.2).
  // 2.4.6 joined the list 2026-09-02: the category maps had cited it as an
  // EVALUATED criterion for heading_structure / slide_titles / sheet_names
  // while no gate could ever assert it (Understanding 2.4.6: "does not
  // require headings or labels" — whether a heading DESCRIBES its section is
  // a human judgment). Disclosed, never claimed.
  const UNIVERSAL = ["3.1.2", "1.4.1", "1.4.5", "1.4.11", "1.3.3", "2.4.6"];

  it("PDF: lists Language of Parts, Use of Color, Images of Text, Non-text Contrast, Sensory Characteristics", async () => {
    const evaluate = await loadGate();
    const v = evaluate(makeQpdf(), makePdfjs(), cleanCategories);
    const scs = v.notAssessed.map((n: any) => n.sc);
    expect(scs).toEqual(expect.arrayContaining(UNIVERSAL));
    for (const n of v.notAssessed) {
      expect(n.reason.length, n.sc).toBeGreaterThan(40);
      expect(n.url, n.sc).toMatch(/^https:\/\/www\.w3\.org\//);
    }
  });

  it("PDF with form fields: lists the 2.2 form criteria 2.5.8 and 3.3.7 — but never 3.3.8, which is about LOGIN, not forms", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ hasAcroForm: true, formFields: [{ hasTU: true }] }),
      makePdfjs(),
      cleanCategories,
    );
    const scs = v.notAssessed.map((n: any) => n.sc);
    expect(scs).toEqual(expect.arrayContaining(["2.5.8", "3.3.7"]));
    expect(scs).not.toContain("3.3.8");
  });

  it("PDF: sound-only annotations are disclosed under 1.2.1 (audio-only), anything with video under 1.2.2 (captions)", async () => {
    const evaluate = await loadGate();
    const soundOnly = evaluate(
      makeQpdf({ mediaAnnotationCounts: { screen: 0, movie: 0, sound: 2, richMedia: 0 } }),
      makePdfjs(),
      cleanCategories,
    );
    const soundScs = soundOnly.notAssessed.map((n: any) => n.sc);
    expect(soundScs).toContain("1.2.1");
    expect(soundScs).not.toContain("1.2.2");
    expect(soundOnly.notAssessed.find((n: any) => n.sc === "1.2.1")!.url).toMatch(
      /audio-only-and-video-only-prerecorded/,
    );

    const withVideo = evaluate(
      makeQpdf({ mediaAnnotationCounts: { screen: 1, movie: 0, sound: 2, richMedia: 0 } }),
      makePdfjs(),
      cleanCategories,
    );
    const videoScs = withVideo.notAssessed.map((n: any) => n.sc);
    expect(videoScs).toContain("1.2.2");
    expect(videoScs).not.toContain("1.2.1");
  });

  it("PDF: cites the document's own foreign-language spans in the 3.1.2 reason when present", async () => {
    // controls/2022-DVFR-Annual-Report-A0.pdf declares da/de/it/no spans in
    // an English document — almost certainly Word autodetect noise. The
    // disclosure should point at the measured evidence, not speak abstractly.
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({
        lang: "en",
        hasLang: true,
        langSpans: [
          { lang: "da", tag: "Span" },
          { lang: "de", tag: "Span" },
          { lang: "en", tag: "Span" },
        ],
      }),
      makePdfjs(),
      cleanCategories,
    );
    const entry = v.notAssessed.find((n: any) => n.sc === "3.1.2");
    expect(entry).toBeDefined();
    expect(entry!.reason).toContain("da");
    expect(entry!.reason).toContain("de");
    expect(entry!.reason).not.toContain('"en"');
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
      // displayDocTitle true keeps this fixture clean under the 2026-09-01
      // 2.4.2 flag rule — this test is about XFA, not titles.
      makeQpdf({ hasXfa: true, needsRendering: false, hasStructTree: true, displayDocTitle: true }),
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

// ---------------------------------------------------------------------------
// A StructTreeRoot that exists but references no content is not a tagged
// document. The gate used to test only for the ROOT's presence, so a file
// whose tag tree held nothing — every character of body text outside it —
// came back "no automated WCAG failures", while the same file with the root
// stripped correctly failed 1.3.1. Adding an empty root must not launder a
// failing document into a clean verdict.
//
// Real-world source: controls/ILHEALSFallWinter2022FINAL-remediated.pdf —
// 9,948 characters of text, /MCID appears zero times in the whole file, and
// the tree is StructTreeRoot -> /Document -> 19 x /Link.
// ---------------------------------------------------------------------------

/** A structure tree that demonstrably references no content at all. */
function vacuousTree(overrides: any = {}) {
  return makeQpdf({
    hasStructTree: true,
    paragraphCount: 0,
    headings: [],
    images: [],
    tables: [],
    lists: [],
    contentOrder: [],
    structTreeMcidsByPage: {},
    ...overrides,
  });
}

describe("conformance gate — structure tree present but empty", () => {
  it("fails 1.3.1 when the tree references no content and the document has text", async () => {
    const evaluate = await loadGate();
    const v = evaluate(vacuousTree(), makePdfjs({ textLength: 9948 }), cleanCategories);

    expect(v.status).toBe("fail");
    const f = v.failures.find((x: any) => x.sc === "1.3.1");
    expect(f?.category).toBe("text_extractability");
  });

  it("does not fire when the tree carries paragraph content", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      vacuousTree({ paragraphCount: 80, contentOrder: [0, 1, 2] }),
      makePdfjs({ textLength: 9948 }),
      cleanCategories,
    );
    // Narrowed to the rule under test (the empty-tree claim): a fixture with
    // 80 paragraphs and zero headings legitimately fails 1.3.1 for MISSING
    // HEADINGS since the legal-only sweep — that is a different rule.
    expect(
      v.failures.some((x: any) => x.sc === "1.3.1" && x.category === "text_extractability"),
    ).toBe(false);
  });

  it("does not fire when the tree carries only figures (no paragraphs, no MCIDs)", async () => {
    // Content-bearing elements exist even though no marked content was
    // collected — not enough evidence to assert the tree is empty.
    const evaluate = await loadGate();
    const v = evaluate(
      vacuousTree({ images: [{ ref: "5 0 R", hasAlt: true, altText: "A chart" }] }),
      makePdfjs({ textLength: 9948 }),
      cleanCategories,
    );
    expect(v.failures.some((x: any) => x.sc === "1.3.1")).toBe(false);
  });

  it("does not fire when there is no text for the tree to be missing", async () => {
    // A genuinely empty document has an empty tree legitimately; the
    // scanned-image and untagged checks already cover its real problems.
    const evaluate = await loadGate();
    const v = evaluate(vacuousTree(), makePdfjs({ textLength: 0 }), cleanCategories);
    expect(v.failures.some((x: any) => x.sc === "1.3.1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Content images that are painted but never tagged as <Figure> are strictly
// WORSE for a screen-reader user than a tagged figure with a missing /Alt —
// they are absent from the reading order entirely. The gate counted only
// tagged figures, so the worse case asserted nothing and the alt_text
// category scored it N/A, letting such a document out-score one with a
// single missing /Alt.
//
// `nonArtifactImageCount` is the honest signal: images pdfjs painted OUTSIDE
// any /Artifact run, i.e. exactly the ones that participate in the reading
// order and require a text alternative. Images the author correctly
// artifacted are already excluded, which is what made the old raw-count
// signal too noisy to act on.
// ---------------------------------------------------------------------------
describe("conformance gate — content images that were never tagged", () => {
  it("fails 1.1.1 for non-artifact images with no <Figure> tag at all", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ images: [], imageObjectCount: 4 }),
      makePdfjs({ imageCount: 4, nonArtifactImageCount: 4 }),
      cleanCategories,
    );
    const f = v.failures.find((x: any) => x.sc === "1.1.1");
    expect(f?.category).toBe("alt_text");
    expect(f?.issue).toContain("4");
  });

  it("does not fire when every painted image is artifacted", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ images: [], imageObjectCount: 4 }),
      makePdfjs({ imageCount: 4, nonArtifactImageCount: 0 }),
      cleanCategories,
    );
    expect(v.failures.some((x: any) => x.sc === "1.1.1")).toBe(false);
  });

  it("does not fire when the content images are all covered by tagged figures", async () => {
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({
        images: [
          { ref: "5 0 R", hasAlt: true, altText: "A" },
          { ref: "6 0 R", hasAlt: true, altText: "B" },
        ],
        imageObjectCount: 2,
      }),
      makePdfjs({ imageCount: 2, nonArtifactImageCount: 2 }),
      cleanCategories,
    );
    expect(v.failures.some((x: any) => x.sc === "1.1.1")).toBe(false);
  });

  it("does not fire when pdfjs could not measure artifact coverage", async () => {
    // No nonArtifactImageCount => no evidence => no confirmed claim.
    const evaluate = await loadGate();
    const v = evaluate(
      makeQpdf({ images: [], imageObjectCount: 9 }),
      makePdfjs({ imageCount: 9, nonArtifactImageCount: undefined }),
      cleanCategories,
    );
    expect(v.failures.some((x: any) => x.sc === "1.1.1")).toBe(false);
  });
});
