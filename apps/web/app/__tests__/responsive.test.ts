import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "fs";
import { resolve } from "path";

import ScoreCard from "../components/ScoreCard.vue";
import CategoryRow from "../components/CategoryRow.vue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSource(file: string): string {
  return readFileSync(resolve(__dirname, "..", file), "utf-8");
}

// ---------------------------------------------------------------------------
// Layout — Mobile Navigation
// ---------------------------------------------------------------------------
describe("Responsive — Mobile Navigation", () => {
  const source = readSource("layouts/default.vue");

  it("has a mobile hamburger button visible only below md", () => {
    expect(source).toContain("md:hidden");
    expect(source).toContain("Toggle menu");
  });

  it("desktop nav is hidden on mobile (hidden md:flex)", () => {
    expect(source).toContain("hidden md:flex");
  });

  it("has a mobile nav dropdown section for small screens", () => {
    expect(source).toContain("mobileMenuOpen");
  });

  it("mobile nav includes all key navigation links", () => {
    expect(source).toContain("Analyze");
    expect(source).toContain("FAQs");
    expect(source).toContain("My History");
    expect(source).toContain("Admin Logs");
  });

  it("mobile menu has slide-down transition", () => {
    expect(source).toContain("slide-down");
  });
});

// ---------------------------------------------------------------------------
// Layout — Responsive Padding
// ---------------------------------------------------------------------------
describe("Responsive — Layout Padding", () => {
  const source = readSource("layouts/default.vue");

  it("header uses responsive padding (px-3 sm:px-6)", () => {
    expect(source).toMatch(/header[^>]*px-3\s+sm:px-6/);
  });

  it("main content uses responsive padding", () => {
    expect(source).toMatch(/main[^>]*px-3\s+sm:px-6/);
  });

  it("main content uses responsive vertical padding", () => {
    expect(source).toMatch(/main[^>]*py-4\s+sm:py-8/);
  });

  it("footer uses responsive padding", () => {
    expect(source).toMatch(/footer[^>]*px-3\s+sm:px-6/);
  });
});

// ---------------------------------------------------------------------------
// ScoreCard — Responsive Grade Circle
// ---------------------------------------------------------------------------
describe("Responsive — ScoreCard", () => {
  const baseResult = {
    filename: "test.pdf",
    pageCount: 5,
    overallScore: 85,
    grade: "B",
    executiveSummary: "Good accessibility.",
  };

  it("grade circle uses responsive sizing (w-28 sm:w-40)", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    const circle = wrapper.find('[class*="rounded-full"][class*="border-4"]');
    expect(circle.exists()).toBe(true);
    expect(circle.classes()).toContain("w-28");
    expect(circle.classes()).toContain("sm:w-40");
    expect(circle.classes()).toContain("h-28");
    expect(circle.classes()).toContain("sm:h-40");
  });

  it("grade letter uses responsive font size (text-5xl sm:text-7xl)", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    const gradeText = wrapper.find('[class*="font-black"]');
    expect(gradeText.exists()).toBe(true);
    expect(gradeText.classes()).toContain("text-5xl");
    expect(gradeText.classes()).toContain("sm:text-7xl");
  });
});

// ---------------------------------------------------------------------------
// CategoryRow — Responsive Layout
// ---------------------------------------------------------------------------
describe("Responsive — CategoryRow", () => {
  const baseCategory = {
    id: "headings",
    label: "Headings",
    score: 75,
    grade: "C",
    severity: "Moderate",
    findings: ["Heading structure found"],
  };

  it("button uses responsive flex direction (flex-col sm:flex-row)", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    const button = wrapper.find("button");
    expect(button.classes()).toContain("flex-col");
    expect(button.classes()).toContain("sm:flex-row");
  });

  it("button uses responsive padding (px-3 sm:px-5)", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    const button = wrapper.find("button");
    expect(button.classes()).toContain("px-3");
    expect(button.classes()).toContain("sm:px-5");
  });

  it("has a mobile-only chevron (sm:hidden)", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    const svgs = wrapper.findAll("svg");
    const mobileChevron = svgs.find((s) => s.classes().includes("sm:hidden"));
    expect(mobileChevron).toBeTruthy();
  });

  it("has a desktop-only chevron (hidden sm:block)", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    const svgs = wrapper.findAll("svg");
    const desktopChevron = svgs.find(
      (s) => s.classes().includes("sm:block") && s.classes().includes("hidden"),
    );
    expect(desktopChevron).toBeTruthy();
  });

  it("severity badge is hidden on mobile (hidden sm:inline-flex)", () => {
    const wrapper = mount(CategoryRow, { props: { category: baseCategory } });
    const badge = wrapper.find(".u-badge");
    expect(badge.exists()).toBe(true);
    expect(badge.classes()).toContain("hidden");
    expect(badge.classes()).toContain("sm:inline-flex");
  });

  it("findings panel uses responsive padding", () => {
    const source = readSource("components/CategoryRow.vue");
    expect(source).toContain("px-3 sm:px-5");
  });
});

// ---------------------------------------------------------------------------
// Index Page — Responsive Elements
// ---------------------------------------------------------------------------
describe("Responsive — Index Page", () => {
  const source = readSource("pages/index.vue");

  it("main heading uses responsive font size (text-xl sm:text-2xl)", () => {
    expect(source).toContain("text-xl sm:text-2xl");
  });

  it("category scores table has overflow-x-auto", () => {
    expect(source).toContain("overflow-x-auto");
  });

  it("category scores table has min-width for horizontal scroll", () => {
    expect(source).toContain("min-w-[420px]");
  });

  it("metadata rows stack vertically on mobile (flex-col sm:flex-row)", () => {
    expect(source).toContain("flex-col sm:flex-row");
  });

  it("score hero uses responsive padding (p-4 sm:p-8)", () => {
    expect(source).toContain("p-4 sm:p-8");
  });

  it("findings cards use responsive padding (p-3 sm:p-5)", () => {
    expect(source).toContain("p-3 sm:p-5");
  });

  it("info cards use responsive text size (text-2xl sm:text-3xl)", () => {
    expect(source).toContain("text-2xl sm:text-3xl");
  });

  it("technical details tables have overflow-x-auto", () => {
    const overflowMatches = source.match(/overflow-x-auto/g);
    expect(overflowMatches).toBeTruthy();
    expect(overflowMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("technical details section uses responsive padding", () => {
    expect(source).toContain("px-3 sm:px-6");
  });

  it("technical details explains Strict vs Practical methodology divergence", () => {
    expect(source).toContain("Two scoring methodologies, one document");
    expect(source).toContain("Practical can score higher than Strict");
    expect(source).toContain("Practical can also score below Strict");
    expect(source).toContain("PDF/UA is a bonus-only contribution");
    expect(source).toContain("WCAG 2.1 AA");
  });

  it("technical details explains normalization tradeoffs", () => {
    expect(source).toContain("scoring convenience");
    expect(source).toContain("substitute for the");
    expect(source).toContain("stricter category findings");
  });
});

// ---------------------------------------------------------------------------
// Report Page — Responsive Elements
// ---------------------------------------------------------------------------
describe("Responsive — Report Page", () => {
  const source = readSource("pages/report/[id].vue");

  it("main container uses responsive padding (px-3 sm:px-6)", () => {
    expect(source).toMatch(/main[^>]*px-3\s+sm:px-6/);
  });

  it("main container uses responsive vertical padding (py-6 sm:py-10)", () => {
    expect(source).toMatch(/main[^>]*py-6\s+sm:py-10/);
  });

  it("heading uses responsive font size (text-xl sm:text-2xl)", () => {
    expect(source).toContain("text-xl sm:text-2xl");
  });

  it("reuses the shared ScoreCard component for responsive score sizing", () => {
    expect(source).toContain("<ScoreCard");
  });

  it("reuses the shared ScoreCard component for responsive grade lettering", () => {
    expect(source).toContain("<ScoreCard");
  });

  it("score hero uses responsive padding (p-4 sm:p-8)", () => {
    expect(source).toContain("p-4 sm:p-8");
  });

  it("category scores table has overflow-x-auto", () => {
    expect(source).toContain("overflow-x-auto");
  });

  it("metadata rows stack vertically on mobile", () => {
    expect(source).toContain("flex-col sm:flex-row");
  });

  it("findings cards use responsive padding", () => {
    expect(source).toContain("p-3 sm:p-5");
  });
});

// ---------------------------------------------------------------------------
// History Pages — Responsive Tables
// ---------------------------------------------------------------------------
describe("Responsive — History Pages", () => {
  it("my-history table has overflow-x-auto", () => {
    const source = readSource("pages/my-history.vue");
    expect(source).toContain("overflow-x-auto");
  });

  it("my-history table has min-width constraint", () => {
    const source = readSource("pages/my-history.vue");
    expect(source).toContain("min-w-[420px]");
  });

  it("my-history table cells use responsive padding", () => {
    const source = readSource("pages/my-history.vue");
    expect(source).toContain("px-3 sm:px-4");
  });

  it("admin history table has overflow-x-auto", () => {
    const source = readSource("pages/history.vue");
    expect(source).toContain("overflow-x-auto");
  });

  it("admin history table has min-width constraint", () => {
    const source = readSource("pages/history.vue");
    expect(source).toContain("min-w-[520px]");
  });

  it("admin history table cells use responsive padding", () => {
    const source = readSource("pages/history.vue");
    expect(source).toContain("px-3 sm:px-4");
  });
});

// ---------------------------------------------------------------------------
// CSS — Mobile Menu Transition
// ---------------------------------------------------------------------------
describe("Responsive — CSS Transitions", () => {
  const css = readSource("assets/css/main.css");

  it("defines slide-down-enter-active transition", () => {
    expect(css).toContain(".slide-down-enter-active");
  });

  it("defines slide-down-leave-active transition", () => {
    expect(css).toContain(".slide-down-leave-active");
  });

  it("slide-down uses max-height for animation", () => {
    expect(css).toContain("max-height");
  });
});

// ---------------------------------------------------------------------------
// Scoring Modal — Responsive Grid & Tables
// ---------------------------------------------------------------------------
describe("Responsive — Scoring Modal", () => {
  const source = readSource("layouts/default.vue");

  it("grade scale grid uses responsive columns (grid-cols-3 sm:grid-cols-5)", () => {
    expect(source).toContain("grid-cols-3 sm:grid-cols-5");
  });

  it("scoring rubric table has overflow-x-auto", () => {
    expect(source).toContain("overflow-x-auto");
  });

  it("scoring rubric table has min-width for scroll", () => {
    expect(source).toContain("min-w-[480px]");
  });

  it("modal content uses responsive padding", () => {
    expect(source).toContain("px-3 sm:px-6");
  });
});
