/**
 * The Best Practices scorecard.
 *
 * Pinned here: it never reads as an obligation, it renders every status
 * distinctly, a MET row never appears without the analyzer having said so,
 * and the section self-hides when there is nothing to show.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BestPracticesSection from "../components/BestPracticesSection.vue";

const pdfResult = {
  fileType: "pdf",
  pageCount: 40,
  categories: [
    {
      id: "heading_structure",
      label: "Heading Structure",
      findings: [
        "PDF/UA only — not scored: found 6 heading tags, but the level order has gaps — skipping levels (H1 → H3) is a PDF/UA / best-practice concern (Matterhorn 13-004), not a WCAG 2.1 failure, so your grade is not affected.",
        "--- Heading Tree ---",
        "  H1 → H2 → H1 → H1",
        "  Heading hierarchy skip: H1 → H3 (skipped H2)",
      ],
    },
  ],
};

const mountSection = (result: unknown) => mount(BestPracticesSection, { props: { result } });

describe("BestPracticesSection", () => {
  it("renders the practice, its status, and the document's own heading order", () => {
    const w = mountSection(pdfResult);
    const row = w.find('[data-practice="heading-level-order"]');
    expect(row.exists()).toBe(true);
    expect(row.attributes("data-status")).toBe("not-met");
    expect(w.text()).toContain("H1 → H2 → H1 → H1");
  });

  it("never reads as a legal obligation", () => {
    const html = mountSection(pdfResult).html();
    expect(html).not.toMatch(/required by law/i);
    expect(html).not.toMatch(/REQUIRED BY WCAG/i);
    expect(html).toMatch(/not scored/i);
  });

  it("states plainly that none of it affected the grade", () => {
    expect(mountSection(pdfResult).text()).toMatch(/none of (this|it) affected your grade/i);
  });

  it("computes the summary counts rather than hardcoding them", () => {
    const w = mountSection(pdfResult);
    const summary = w.find('[data-testid="best-practices-summary"]');
    expect(summary.exists()).toBe(true);
    const rows = w.findAll("[data-practice]");
    const notMet = w.findAll('[data-status="not-met"]').length;
    expect(summary.text()).toContain(String(notMet));
    expect(rows.length).toBeGreaterThan(1);
  });

  it("renders every status with its own label", () => {
    // NOTE the category ids: font embedding lives under text_extractability.
    // There is no "fonts" category — see the Category ID Reference.
    const w = mountSection({
      fileType: "pdf",
      pageCount: 2,
      categories: [
        { id: "heading_structure", findings: ["Found 3 heading tags with logical hierarchy"] },
        {
          id: "text_extractability",
          findings: [
            "All fonts are embedded — text will render correctly regardless of the user's installed fonts",
          ],
        },
      ],
    });
    expect(w.find('[data-status="met"]').exists()).toBe(true);
    expect(w.find('[data-status="not-checked"]').exists()).toBe(true);
    expect(w.text()).toMatch(/not checked/i);
  });

  it("expands and collapses a row", async () => {
    const w = mountSection(pdfResult);
    const btn = w.find('[data-practice="heading-level-order"] button');
    expect(btn.attributes("aria-expanded")).toBe("false");
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("true");
    expect(w.find("#bp-body-heading-level-order").isVisible()).toBe(true);
    await btn.trigger("click");
    expect(btn.attributes("aria-expanded")).toBe("false");
  });

  it("renders nothing at all when there is nothing to show", () => {
    expect(mountSection({ fileType: "pdf" }).find('[data-testid="best-practices"]').exists()).toBe(
      false,
    );
    expect(mountSection(null).find('[data-testid="best-practices"]').exists()).toBe(false);
  });

  it("does not throw on a forged stored report", () => {
    expect(() => mountSection({ fileType: "pdf", categories: "nope" })).not.toThrow();
    expect(() => mountSection({ fileType: 42, categories: [null] })).not.toThrow();
  });
});
