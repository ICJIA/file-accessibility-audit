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
});
