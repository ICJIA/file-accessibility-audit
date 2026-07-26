import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PdfUaSignalsCard from "../components/PdfUaSignalsCard.vue";

const fullSignals = {
  hasIdentifier: true,
  part: "1",
  isTagged: true,
  isMarkedContent: true,
  artifactRunCount: 17,
  structTreeDepth: 4,
  fontCount: 8,
  embeddedFontCount: 8,
  allFontsEmbedded: true,
  hasLanguage: true,
  hasTitle: true,
};

describe("PdfUaSignalsCard", () => {
  it("shows the declared PDF/UA-1 identifier and artifact count", () => {
    const w = mount(PdfUaSignalsCard, { props: { signals: fullSignals } });
    expect(w.text()).toContain("PDF/UA-1");
    expect(w.text()).toMatch(/Part 1/);
    expect(w.text()).toContain("17"); // artifact runs
  });

  it("frames signals as NOT a conformance verdict and points to PAC / veraPDF / Matterhorn", () => {
    const w = mount(PdfUaSignalsCard, { props: { signals: fullSignals } });
    expect(w.text()).toMatch(/signals, not a (conformance )?verdict|not a conformance verdict/i);
    expect(w.text()).toMatch(/PAC/);
    expect(w.text()).toMatch(/veraPDF/i);
    expect(w.text()).toMatch(/Matterhorn/i);
  });

  it("reports a missing identifier honestly", () => {
    const w = mount(PdfUaSignalsCard, {
      props: { signals: { ...fullSignals, hasIdentifier: false, part: null } },
    });
    expect(w.text()).toMatch(/not declared/i);
  });

  it("shows a PDF/UA readiness headline counting the boolean essentials met", () => {
    const w = mount(PdfUaSignalsCard, { props: { signals: fullSignals } });
    // fullSignals has all six boolean essentials true.
    expect(w.text()).toMatch(/readiness/i);
    expect(w.text()).toMatch(/6 of 6/);
    expect(w.text()).toMatch(/essentials met/i);
    // The count and label must not run together in text content (screen-reader
    // linear reading / copy-paste) — there must be a separator between them.
    expect(w.text()).not.toMatch(/6PDF/i);
  });

  it("counts fewer essentials met when some are missing", () => {
    const w = mount(PdfUaSignalsCard, {
      props: { signals: { ...fullSignals, hasIdentifier: false, hasLanguage: false } },
    });
    // Two of the six booleans dropped → 4 of 6.
    expect(w.text()).toMatch(/4 of 6/);
  });

  it("does not count Structure depth or Artifacts as essentials (they stay informational)", () => {
    // Flat structure (depth 1) and zero artifacts, but all six booleans still met.
    const w = mount(PdfUaSignalsCard, {
      props: { signals: { ...fullSignals, structTreeDepth: 1, artifactRunCount: 0 } },
    });
    expect(w.text()).toMatch(/6 of 6/);
  });
});

// ---------------------------------------------------------------------------
// PDF/UA-1 signals are not a WCAG verdict, and the card's own framing works
// against that: a "Conformance signals · beyond the WCAG score" banner over a
// green "N of 6 essentials met" readiness box reads as a pass. A user reported
// exactly this confusion — "users don't know that PDF/UA conformance scores
// don't mean perfect WCAG" — on a report that simultaneously said "2 critical
// issues must be fixed before publishing".
//
// PDF/UA-1 essentials are STRUCTURAL markers (is it tagged? are fonts
// embedded?). They say nothing about whether alt text is meaningful, headings
// are correct, or the reading order makes sense — the things the WCAG grade
// measures. So whenever blocking WCAG issues remain, the card says so.
// ---------------------------------------------------------------------------
describe("PdfUaSignalsCard — signals are not a WCAG pass", () => {
  const criticals = [{ severity: "Critical" }, { severity: "Critical" }, { severity: "Minor" }];

  it("warns that meeting the essentials is not a WCAG pass when Critical issues remain", () => {
    const w = mount(PdfUaSignalsCard, {
      props: { signals: fullSignals, categories: criticals },
    });
    expect(w.text()).toMatch(/does not mean|not a WCAG/i);
    expect(w.text()).toMatch(/2 critical/i);
  });

  it("stays silent when there are no Critical issues", () => {
    const w = mount(PdfUaSignalsCard, {
      props: { signals: fullSignals, categories: [{ severity: "Minor" }] },
    });
    expect(w.text()).not.toMatch(/does not mean the document/i);
  });

  it("stays silent when no categories are supplied (the remediation page reuse)", () => {
    const w = mount(PdfUaSignalsCard, { props: { signals: fullSignals } });
    expect(w.text()).not.toMatch(/does not mean the document/i);
  });
});
