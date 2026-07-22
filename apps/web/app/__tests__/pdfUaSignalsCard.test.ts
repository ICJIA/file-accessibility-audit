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
