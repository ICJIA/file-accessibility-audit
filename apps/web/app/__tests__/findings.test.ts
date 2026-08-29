import { describe, it, expect } from "vitest";
import {
  isGuidanceFinding,
  isNeutralFinding,
  firstActionableFinding,
  partitionCardFindings,
} from "../utils/findings";

describe("isGuidanceFinding", () => {
  it("detects guidance prefixes (case-insensitive)", () => {
    expect(isGuidanceFinding("How to fix: add alt text")).toBe(true);
    expect(isGuidanceFinding("TIP: embed fonts")).toBe(true);
    expect(isGuidanceFinding("Fix: tag the structure")).toBe(true);
    expect(isGuidanceFinding("Note: this is informational")).toBe(true);
    expect(isGuidanceFinding("Review these warnings")).toBe(true);
  });

  it("returns false for plain findings", () => {
    expect(isGuidanceFinding("5 image(s) found, none have alt text")).toBe(false);
    expect(isGuidanceFinding("Document is tagged")).toBe(false);
  });

  it("returns false for empty input and for guidance prefixes preceded by whitespace", () => {
    expect(isGuidanceFinding("")).toBe(false);
    // no leading-whitespace tolerance — matches the page duplicates' behavior
    expect(isGuidanceFinding("  Fix: x")).toBe(false);
    expect(isGuidanceFinding("\tNote: x")).toBe(false);
  });
});

describe("firstActionableFinding", () => {
  it("returns the first non-guidance, non-divider, non-indented line", () => {
    const findings = [
      "--- Font Embedding ---",
      "  12 fonts: 5 embedded, 7 not embedded",
      "Fix: embed fonts",
      "5 fonts not embedded",
      "Note: monitor display",
    ];
    expect(firstActionableFinding(findings)).toBe("5 fonts not embedded");
  });

  it("falls back to the first finding when nothing actionable is found", () => {
    const findings = ["Fix: do this", "--- header ---"];
    expect(firstActionableFinding(findings)).toBe("Fix: do this");
  });

  it("returns empty string for empty input", () => {
    expect(firstActionableFinding([])).toBe("");
    expect(firstActionableFinding(undefined as any)).toBe("");
  });

  it("skips empty-string elements (defensive against split-on-newline output)", () => {
    expect(firstActionableFinding(["", "real finding"])).toBe("real finding");
    expect(firstActionableFinding(["", "", ""])).toBe("");
  });

  it("does not throw on non-string entries (forged/corrupted stored report) and finds the real string", () => {
    const findings = [123, null, {}, "real finding"] as unknown as string[];
    expect(() => firstActionableFinding(findings)).not.toThrow();
    expect(firstActionableFinding(findings)).toBe("real finding");
  });
});

describe("partitionCardFindings", () => {
  it("returns empty buckets for empty / null input", () => {
    expect(partitionCardFindings([])).toEqual({
      main: [],
      signals: [],
      signalCount: 0,
      acrobat: [],
      notScored: [],
    });
    expect(partitionCardFindings(undefined as any)).toEqual({
      main: [],
      signals: [],
      signalCount: 0,
      acrobat: [],
      notScored: [],
    });
  });

  it("returns empty buckets (never throws) for a non-array findings value", () => {
    // Attacker-controlled stored reports could set findings to a non-array;
    // this must not throw and 500 the shared-report page during SSR.
    expect(partitionCardFindings("not-an-array" as any)).toEqual({
      main: [],
      signals: [],
      signalCount: 0,
      acrobat: [],
      notScored: [],
    });
    expect(partitionCardFindings({} as any)).toEqual({
      main: [],
      signals: [],
      signalCount: 0,
      acrobat: [],
      notScored: [],
    });
  });

  it("puts plain findings and guidance lines into main", () => {
    const input = [
      "PDF contains extractable text",
      "Document is tagged",
      "Fix: ensure font embedding",
    ];
    const out = partitionCardFindings(input);
    expect(out.main).toEqual(input);
    expect(out.signals).toEqual([]);
    expect(out.signalCount).toBe(0);
    expect(out.acrobat).toEqual([]);
  });

  it("groups --- headings with their indented detail lines", () => {
    const input = [
      "Plain finding",
      "--- Font Embedding ---",
      "  12 fonts: 5 embedded, 7 not embedded",
      "  KVKXWT+SegoeUI-Bold — embedded",
      "--- Document Structure ---",
      "  219 paragraph tags",
    ];
    const out = partitionCardFindings(input);
    expect(out.main).toEqual(["Plain finding"]);
    expect(out.signals).toEqual([
      {
        heading: "Font Embedding",
        items: ["12 fonts: 5 embedded, 7 not embedded", "KVKXWT+SegoeUI-Bold — embedded"],
      },
      { heading: "Document Structure", items: ["219 paragraph tags"] },
    ]);
    expect(out.signalCount).toBe(3);
  });

  it("handles indented lines that appear before any --- header", () => {
    const input = ["Plain", "  stray indented line", "--- Header ---", "  with header"];
    const out = partitionCardFindings(input);
    expect(out.signals[0]).toEqual({ heading: "", items: ["stray indented line"] });
    expect(out.signals[1]).toEqual({ heading: "Header", items: ["with header"] });
    expect(out.signalCount).toBe(2);
  });

  it("splits Adobe Acrobat steps off into its own bucket", () => {
    const input = [
      "Plain finding",
      "--- Adobe Acrobat ---",
      "Open Tools → Accessibility",
      "Right-click each figure",
    ];
    const out = partitionCardFindings(input);
    expect(out.main).toEqual(["Plain finding"]);
    expect(out.signals).toEqual([]);
    expect(out.acrobat).toEqual(["Open Tools → Accessibility", "Right-click each figure"]);
  });

  it("puts technical signals BEFORE the Adobe Acrobat section into signals", () => {
    const input = [
      "Plain",
      "--- Font Embedding ---",
      "  detail",
      "--- Adobe Acrobat ---",
      "step 1",
    ];
    const out = partitionCardFindings(input);
    expect(out.main).toEqual(["Plain"]);
    expect(out.signals).toEqual([{ heading: "Font Embedding", items: ["detail"] }]);
    expect(out.signalCount).toBe(1);
    expect(out.acrobat).toEqual(["step 1"]);
  });

  it("does not throw on non-string entries (forged/corrupted stored report) and still partitions the real strings", () => {
    const input = [
      "Plain finding",
      123,
      null,
      {},
      "--- Adobe Acrobat ---",
      "Open Tools → Accessibility",
    ] as unknown as string[];
    expect(() => partitionCardFindings(input)).not.toThrow();
    const out = partitionCardFindings(input);
    expect(out.main).toEqual(["Plain finding"]);
    expect(out.signals).toEqual([]);
    expect(out.acrobat).toEqual(["Open Tools → Accessibility"]);
  });

  it("preserves order of plain findings when interleaved with technical sections", () => {
    const input = [
      "plain1",
      "plain2",
      "--- Header A ---",
      "  detail1",
      "plain3",
      "--- Header B ---",
      "  detail2",
    ];
    const out = partitionCardFindings(input);
    expect(out.main).toEqual(["plain1", "plain2", "plain3"]);
    expect(out.signals.map((s) => s.heading)).toEqual(["Header A", "Header B"]);
  });
});

describe("isNeutralFinding — a measurement is not a failure", () => {
  // The report card picked ONE icon from the category's score and stamped it
  // on every line, so a card scoring 65 marked plain measurements, the
  // methodology paragraph, and its OWN "this is not necessarily wrong"
  // caveat with a red ✗. A reader saw a document with four correctly-tagged
  // form captions presented as comprehensively broken (DoIT XFA example,
  // 2026-08-27 — reported by the document's author, who was right).

  it("neutralises bare measurements", () => {
    expect(isNeutralFinding("Structure tree depth: 7 level(s)")).toBe(true);
    expect(isNeutralFinding("Content items (MCIDs): 66")).toBe(true);
    expect(isNeutralFinding("Pages: 1 | Paragraphs: 26 | Headings: 3")).toBe(true);
    expect(isNeutralFinding("Reading-order fidelity: 76% (1 of 1 page(s) compared)")).toBe(true);
    expect(isNeutralFinding("Extracted 292 characters of text content")).toBe(true);
  });

  it("neutralises the methodology paragraph and the card's own caveat", () => {
    expect(
      isNeutralFinding(
        "Compared the structure-tree MCID sequence (logical tag order) against the content-stream MCID sequence",
      ),
    ).toBe(true);
    expect(
      isNeutralFinding(
        "Divergence is not automatically wrong — remediated documents re-order tags away from a bad draw order on purpose",
      ),
    ).toBe(true);
    expect(isNeutralFinding("This category does not affect the score")).toBe(true);
    expect(isNeutralFinding("Advisory — not scored: the RoleMap remaps 1 standard type")).toBe(
      true,
    );
  });

  it("leaves REAL faults alone — they must keep the failure mark", () => {
    // The guard that matters: a defect must never be softened into a bullet.
    expect(isNeutralFinding("0 of 3 image(s) have alternative text")).toBe(false);
    expect(isNeutralFinding("No heading tags found in the document structure")).toBe(false);
    expect(isNeutralFinding("1 page(s) had noticeable drift (< 80% match): page 1 (76%)")).toBe(
      false,
    );
    expect(isNeutralFinding("No document title found in metadata")).toBe(false);
    expect(isNeutralFinding("4 <TH> cell(s) missing Scope attribute")).toBe(false);
  });

  it("survives empty and whitespace input", () => {
    expect(isNeutralFinding("")).toBe(false);
    expect(isNeutralFinding("   ")).toBe(false);
  });
});

describe("isNeutralFinding — quoted document text cannot flip the icon", () => {
  // Findings quote text from the DOCUMENT verbatim — heading samples, alt
  // text, link text — inside double quotes. The neutral-keyword test used to
  // run over the whole line, so a heading that happened to contain the word
  // "advisory" turned its own failure line into a neutral bullet. Display
  // only, the author's own report only — but the classifier should judge OUR
  // words, never the document's.
  it("a fragment sample containing a neutral keyword keeps its failure icon", () => {
    expect(
      isNeutralFinding(
        '32 heading tag(s) hold a fragment rather than a heading — the tag caught part of a sentence, often cut off mid-word: "advisory committee repo", "la".',
      ),
    ).toBe(false);
  });

  it("quoted alt text carrying a keyword does not neutralise its line", () => {
    expect(isNeutralFinding('  Image 42: "advisory board photo, does not affect the score"')).toBe(
      false,
    );
  });

  it("the report's own unquoted caveats stay neutral", () => {
    expect(
      isNeutralFinding(
        "Found 27 H1 headings. No WCAG criterion requires a single H1, so this does not affect the score — but many style guides recommend one top-level heading.",
      ),
    ).toBe(true);
    expect(
      isNeutralFinding("  Advisory — not scored: 1 note(s) have no /ID (Matterhorn 19-003)."),
    ).toBe(true);
  });
});
