import "./test-helpers";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "fs";
import { resolve } from "path";

import DropZone from "../components/DropZone.vue";
import ScoreCard from "../components/ScoreCard.vue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse hex color to { r, g, b } */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/** Relative luminance per WCAG 2.1 */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  // 3-in, 3-out: the cast just tells noUncheckedIndexedAccess what .map()
  // already guarantees for a fixed 3-element input.
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Contrast ratio between two hex colors (WCAG 2.1) */
function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(hexToRgb(fg));
  const l2 = luminance(hexToRgb(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Dark mode CSS variable values (from main.css :root)
const darkBg = {
  primary: "#0a0a0a",
  card: "#111111",
  cardAlt: "#0d0d0d",
};

// Light mode CSS variable values (from main.css html.light)
const lightBg = {
  primary: "#f9fafb",
  card: "#ffffff",
  cardAlt: "#f9fafb",
};

// Dark mode text colors
const darkText = {
  secondary: "#d4d4d4",
  muted: "#a3a3a3",
};

// Light mode text colors
const lightText = {
  secondary: "#374151",
  muted: "#4b5563",
};

// ---------------------------------------------------------------------------
// WCAG 2.1 Color Contrast Tests (SC 1.4.3 — Level AA: 4.5:1 for normal text)
// ---------------------------------------------------------------------------
describe("WCAG 2.1 Color Contrast — Dark Mode", () => {
  it("dark textSecondary meets 4.5:1 contrast on all dark backgrounds", () => {
    const fg = darkText.secondary;
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `textSecondary on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("dark textMuted meets 4.5:1 contrast on all dark backgrounds", () => {
    const fg = darkText.muted;
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `textMuted on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("white text meets 4.5:1 on all dark backgrounds", () => {
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio("#ffffff", bg);
      expect(ratio, `white on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("grade colors meet 3:1 contrast for large text (SC 1.4.3)", () => {
    const gradeColors = ["#22c55e", "#14b8a6", "#eab308", "#f97316", "#ef4444"];
    for (const color of gradeColors) {
      const ratio = contrastRatio(color, darkBg.card);
      expect(ratio, `grade color ${color} on card bg`).toBeGreaterThanOrEqual(3);
    }
  });

  it("dark link color (blue-400) meets 4.5:1 on dark backgrounds", () => {
    const blue400 = "#60a5fa";
    for (const [name, bg] of Object.entries(darkBg)) {
      const ratio = contrastRatio(blue400, bg);
      expect(ratio, `blue-400 on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("green-700 CTA button meets 4.5:1 with white text", () => {
    const green700 = "#15803d";
    const ratio = contrastRatio("#ffffff", green700);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("WCAG 2.1 Color Contrast — Light Mode", () => {
  it("light textSecondary meets 4.5:1 contrast on all light backgrounds", () => {
    const fg = lightText.secondary;
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `textSecondary on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("light textMuted meets 4.5:1 contrast on all light backgrounds", () => {
    const fg = lightText.muted;
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `textMuted on ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("light link color (blue-600) meets 4.5:1 on light backgrounds", () => {
    const blue600 = "#2563eb";
    for (const [name, bg] of Object.entries(lightBg)) {
      const ratio = contrastRatio(blue600, bg);
      expect(ratio, `blue-600 on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// ---------------------------------------------------------------------------
// Source file contrast regression tests — ensure no hardcoded low-contrast classes
// ---------------------------------------------------------------------------
describe("Contrast Regression (no low-contrast classes in source)", () => {
  const sourceFiles = [
    "components/DropZone.vue",
    "components/ScoreCard.vue",
    "components/ReportContent.vue",
    "components/ProcessingOverlay.vue",
    "layouts/default.vue",
    "pages/index.vue",
    "pages/report/[id].vue",
  ];

  for (const file of sourceFiles) {
    it(`${file} does not use text-neutral-500`, () => {
      const content = readFileSync(resolve(__dirname, "..", file), "utf-8");
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain("text-neutral-500");
      }
    });

    it(`${file} does not use text-neutral-600`, () => {
      const content = readFileSync(resolve(__dirname, "..", file), "utf-8");
      const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
      if (templateMatch) {
        expect(templateMatch[1]).not.toContain("text-neutral-600");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Semantic HTML & ARIA Landmark Tests (WCAG 2.4.1)
// ---------------------------------------------------------------------------
describe("Semantic HTML & Landmarks", () => {
  it("shared report page has a <main> landmark", () => {
    const content = readFileSync(resolve(__dirname, "..", "pages/report/[id].vue"), "utf-8");
    expect(content).toContain("<main");
  });

  it("default layout has a <main> element", () => {
    const content = readFileSync(resolve(__dirname, "..", "layouts/default.vue"), "utf-8");
    expect(content).toContain("<main");
  });

  it("default layout has a <header> element", () => {
    const content = readFileSync(resolve(__dirname, "..", "layouts/default.vue"), "utf-8");
    expect(content).toContain("<header");
  });

  it("default layout has a <footer> element", () => {
    const content = readFileSync(resolve(__dirname, "..", "layouts/default.vue"), "utf-8");
    expect(content).toContain("<footer");
  });

  it("default layout has a <nav> element", () => {
    const content = readFileSync(resolve(__dirname, "..", "layouts/default.vue"), "utf-8");
    expect(content).toContain("<nav");
  });

  // WCAG 2.1.1 Keyboard. The header title is the ONLY way to reset the app
  // and start a new audit — the redundant "Analyze" nav links were removed in
  // v1.41.0. It must therefore be operable without a mouse.
  //
  // A bare `@click` on the <h1> (which is what this was) gives no focus, no
  // Enter activation, and no role: a keyboard or screen-reader user simply
  // cannot reach it. Shipping that on an accessibility auditing tool would be
  // a bad look as well as a real barrier.
  describe("header title reset control", () => {
    const layout = () => readFileSync(resolve(__dirname, "..", "layouts/default.vue"), "utf-8");

    it("is a real link, not a click handler bolted onto the heading", () => {
      const content = layout();
      // The <h1> itself must carry no click handler...
      expect(content).not.toMatch(/<h1[^>]*@click/);
      // ...and must wrap an anchor that goes home and resets.
      expect(content).toMatch(/<h1[\s\S]{0,200}?<a\s[\s\S]{0,200}?href="\/"/);
      expect(content).toMatch(/@click\.prevent="goAnalyze"/);
    });

    it("no longer duplicates the reset as an 'Analyze' nav link", () => {
      // Two controls doing the same thing is the redundancy this replaced;
      // if one comes back, this heading is no longer the single obvious way
      // to start over.
      const content = layout();
      expect(content).not.toMatch(/>\s*Analyze\s*</);
    });
  });
});

// ---------------------------------------------------------------------------
// Link Accessibility (WCAG 2.4.4 — Link Purpose)
// ---------------------------------------------------------------------------
describe("Link Accessibility", () => {
  it('external links in report page include rel="noopener noreferrer"', () => {
    const content = readFileSync(resolve(__dirname, "..", "pages/report/[id].vue"), "utf-8");
    const extLinks = content.match(/target="_blank"/g);
    const relAttrs = content.match(/rel="noopener noreferrer"/g);
    if (extLinks) {
      expect(relAttrs?.length).toBe(extLinks.length);
    }
  });

  it('external (cross-origin) links in default layout include rel="noopener noreferrer"', () => {
    const content = readFileSync(resolve(__dirname, "..", "layouts/default.vue"), "utf-8");
    // Count only anchors that target external origins. Same-origin
    // navigations like /data-retention or /technical-details open in
    // a new tab but use `rel="noopener"` only — `noreferrer` would
    // unnecessarily strip referrer for our own pages.
    const externalAnchors =
      content.match(/<a[^>]*href="https?:[^"]*"[^>]*target="_blank"[^>]*>/g) ?? [];
    for (const a of externalAnchors) {
      expect(a).toMatch(/rel="noopener noreferrer"/);
    }
  });
});

// ---------------------------------------------------------------------------
// Component-level Accessibility Tests
// ---------------------------------------------------------------------------
describe("DropZone Accessibility", () => {
  it("file input has an accept attribute for screen readers", () => {
    const wrapper = mount(DropZone);
    const input = wrapper.find('input[type="file"]');
    expect(input.attributes("accept")).toContain("pdf");
  });

  it("uses cursor-pointer on the interactive drop area", () => {
    const wrapper = mount(DropZone);
    const dropArea = wrapper.find('[class*="cursor-pointer"]');
    expect(dropArea.exists()).toBe(true);
  });
});

// The upload box works without a mouse (accessibility check, 2026-09-16).
//
// The box every visit starts with was a <div> with a click handler. A mouse
// opened the file picker; Tab went from the introduction's links straight to
// the Technical Details section below the box, no key opened the picker, and a
// screen reader met three paragraphs with no role and no name — WCAG 2.1.1 and
// 4.1.2, Level A. Both tests above were green throughout: one checks the
// input's accept attribute, the other that the box LOOKS clickable. These check
// that a keyboard can use it and that its focus ring can be seen.
describe("DropZone works without a mouse (WCAG 2.1.1, 4.1.2, 2.4.7)", () => {
  const box = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-testid="dropzone"]');

  it("the drop area is a native button, so Tab reaches it and Enter and Space press it", () => {
    const el = box(mount(DropZone)).element as HTMLButtonElement;
    expect(el.tagName).toBe("BUTTON");
    expect(el.getAttribute("type")).toBe("button");
    // Nothing may take back what the element gives for free: no role
    // override, no tabindex removing it from the Tab order, never disabled.
    expect(el.hasAttribute("role")).toBe(false);
    expect(el.hasAttribute("tabindex")).toBe(false);
    expect(el.disabled).toBe(false);
  });

  it("listens for clicks only on buttons — no handler bolted onto a non-interactive element", () => {
    // The same rule the header title was held to above, for the same reason.
    const src = readFileSync(resolve(__dirname, "..", "components/DropZone.vue"), "utf-8");
    const template = src.match(/<template>([\s\S]*)<\/template>/)![1]!;
    const listeners = [...template.matchAll(/<([a-z][\w-]*)\b[^>]*@click\b/g)].map((m) => m[1]);
    expect(listeners.length).toBeGreaterThan(0);
    expect([...new Set(listeners)]).toEqual(["button"]);
  });

  it("is the only tab stop: the file input stays out of the Tab order and the accessibility tree", () => {
    const wrapper = mount(DropZone);
    // display:none (Tailwind's `hidden`) removes the input from both. A
    // visually hidden but focusable input beside the button would be a second,
    // invisible stop opening the same picker.
    const input = wrapper.find('input[type="file"]');
    expect(input.classes()).toContain("hidden");
    expect(input.attributes("tabindex")).toBeUndefined();
    const focusable = wrapper.findAll(
      "button, a[href], select, textarea, [tabindex], input:not(.hidden)",
    );
    expect(focusable).toHaveLength(1);
    expect(focusable[0]!.attributes("data-testid")).toBe("dropzone");
  });

  it("pressing it opens the file picker, exactly once", async () => {
    // Enter and Space on a native button dispatch `click`. happy-dom does not
    // synthesise that from a key event, so the click is dispatched directly:
    // the keyboard half is the native element asserted above, and the keys
    // themselves were exercised in Chromium when this was fixed.
    const wrapper = mount(DropZone);
    const input = wrapper.find('input[type="file"]').element as HTMLInputElement;
    const picker = vi.spyOn(input, "click").mockImplementation(() => {});
    await box(wrapper).trigger("click");
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it("is named for what it does — choosing files to audit — with the limits the box shows", () => {
    const el = box(mount(DropZone)).element;
    // No aria-label or aria-labelledby: the name is computed from the words on
    // the button, so it cannot drift from what a sighted user reads. (The
    // announcement banner's "See all updates" link once failed 2.5.3 exactly
    // that way.)
    expect(el.hasAttribute("aria-label")).toBe(false);
    expect(el.hasAttribute("aria-labelledby")).toBe(false);
    // Name from content, less anything aria-hidden.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    const name = clone.textContent!.replace(/\s+/g, " ").trim();
    // The visible label opens the name, so speech input can say what it sees.
    expect(name.startsWith("Drop PDF, Word, PowerPoint, or Excel files here")).toBe(true);
    expect(name).toContain("or click to browse for files to audit — up to 5 files, max 25 MB each");
    // The purpose words are for assistive technology only; the visible copy
    // is unchanged.
    expect(el.querySelector(".sr-only")?.textContent?.trim()).toBe("for files to audit");
    // The icon is decorative and must not add an unnamed image to the button.
    expect(el.querySelector("svg")?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("keeps its drag-over styling and still accepts a dropped file", async () => {
    const wrapper = mount(DropZone);
    const area = box(wrapper);
    await area.trigger("dragenter");
    expect(area.classes()).toContain("border-green-400");
    expect(wrapper.text()).toContain("Drop your PDF, Word, PowerPoint, or Excel files here");
    await area.trigger("dragleave");
    expect(area.classes()).not.toContain("border-green-400");

    // A real drop: the file rides on dataTransfer, which trigger() cannot
    // carry, so the event is dispatched on the element directly.
    const file = new File(["%PDF-1.7"], "dropped.pdf", { type: "application/pdf" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
    area.element.dispatchEvent(drop);
    await wrapper.vm.$nextTick();
    expect(drop.defaultPrevented).toBe(true);
    expect(wrapper.emitted("file-selected")?.[0]?.[0]).toBe(file);
  });

  describe("its keyboard focus ring can be seen, measured in both themes (WCAG 2.4.7, 1.4.11)", () => {
    // The ring is the app's shared focus style: a 2px outline in --link, drawn
    // 2px outside the dashed border, so the page surface (--surface-body) is
    // what it sits on, on both sides. The tokens are read from main.css rather
    // than restated, so editing a colour is what this measures; html.light is
    // declared twice there, and the later declaration wins, as in the browser.
    const css = readFileSync(resolve(__dirname, "..", "assets/css/main.css"), "utf-8");
    const tokens = (block: string): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const m of block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]!] = m[2]!;
      return out;
    };
    const dark = tokens(css.slice(css.indexOf(":root {"), css.indexOf("html.light {")));
    const light = { ...dark, ...tokens(css.slice(css.indexOf("html.light {"))) };
    const NON_TEXT_CONTRAST = 3;

    it("the button draws the ring, in the token measured below", () => {
      const classes = box(mount(DropZone)).classes();
      expect(classes).toContain("focus-visible:outline-2");
      expect(classes).toContain("focus-visible:outline-offset-2");
      expect(classes).toContain("focus-visible:outline-[var(--link)]");
      expect(classes.join(" ")).not.toMatch(/(^|\s)(focus(-visible)?:)?outline-(none|hidden)\b/);
    });

    it.each([
      ["dark", dark],
      ["light", light],
    ])("--link clears 3:1 against --surface-body on the %s theme", (_theme, palette) => {
      const ring = palette["--link"];
      const surface = palette["--surface-body"];
      expect(ring, "--link must be defined").toBeTruthy();
      expect(surface, "--surface-body must be defined").toBeTruthy();
      expect(
        contrastRatio(ring!, surface!),
        `--link ${ring} on --surface-body ${surface}`,
      ).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    });

    it("can fail: the box's own dashed border colour would not pass as a focus ring", () => {
      // Proof this group is not vacuous — a wrong threshold or a token lookup
      // gone astray would let anything through.
      for (const palette of [dark, light]) {
        expect(contrastRatio(palette["--border-input"]!, palette["--surface-body"]!)).toBeLessThan(
          NON_TEXT_CONTRAST,
        );
      }
    });
  });
});

describe("ScoreCard Accessibility", () => {
  const baseResult = {
    filename: "test.pdf",
    pageCount: 5,
    overallScore: 85,
    grade: "B",
    executiveSummary: "Good accessibility.",
  };

  it("does not use opacity classes that reduce text readability", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    const html = wrapper.html();
    expect(html).not.toContain("opacity-60");
    expect(html).not.toContain("opacity-50");
    expect(html).not.toContain("opacity-40");
  });

  it("renders the caveat about Adobe Acrobat testing", () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    expect(wrapper.text()).toContain("Adobe Acrobat");
    expect(wrapper.text()).toContain("source document");
  });

  it('caveat link to Adobe help page has target="_blank" and rel attributes', () => {
    const wrapper = mount(ScoreCard, { props: { result: baseResult } });
    const adobeLink = wrapper.find('a[href*="helpx.adobe.com"]');
    expect(adobeLink.exists()).toBe(true);
    expect(adobeLink.attributes("target")).toBe("_blank");
    expect(adobeLink.attributes("rel")).toContain("noopener");
  });
});
