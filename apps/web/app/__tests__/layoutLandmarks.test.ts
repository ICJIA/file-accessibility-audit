/**
 * Layout landmarks, the skip link, the print stylesheet and reduced motion.
 *
 * Each of these is a pairing between two files that nothing else holds
 * together:
 *   - the print stylesheet hides site chrome by SELECTOR; the layout has to
 *     carry what the selector names. It did not: the CSS keyed on
 *     header[role="banner"] / footer[role="contentinfo"] and the layout's
 *     <header>/<footer> have no role attribute (correctly — the native
 *     elements already are those landmarks), so the header and footer printed
 *     on every "Save as PDF";
 *   - the skip link's href has to match an id that exists, on an element
 *     that can take focus;
 *   - a script that scrolls with `behavior: "smooth"` overrides the
 *     reduced-motion stylesheet, so it has to ask utils/motion.
 */
import "./test-helpers";
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { mount } from "@vue/test-utils";
import ScrollToTop from "../components/ScrollToTop.vue";
import { prefersReducedMotion, scrollBehavior } from "../utils/motion";

const appDir = resolve(__dirname, "..");
const layout = readFileSync(join(appDir, "layouts", "default.vue"), "utf-8");
// Comments are stripped from both: they describe the old selectors and the
// markup in prose, and must not be mistaken for either.
const layoutTemplate = layout
  .slice(0, layout.indexOf("<script setup"))
  .replace(/<!--[\s\S]*?-->/g, "");
const css = readFileSync(join(appDir, "assets", "css", "main.css"), "utf-8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The body of the top-level `@media print { … }` block. */
function printBlock(): string {
  const start = css.indexOf("@media print {");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error("unterminated @media print block");
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return vueFiles(full);
    return name.endsWith(".vue") ? [full] : [];
  });
}

describe("print stylesheet hides the site chrome that the layout actually renders", () => {
  it("the selectors it hides are classes present on the layout's header and footer", () => {
    const print = printBlock();
    const hidden = print.slice(0, print.indexOf("display: none !important"));
    expect(hidden).toMatch(/\.site-header\s*,/);
    expect(hidden).toMatch(/\.site-footer\s*,/);
    expect(layoutTemplate).toMatch(/<header class="site-header[ "]/);
    expect(layoutTemplate).toMatch(/<footer class="site-footer[ "]/);
  });

  it("no print selector keys on a role attribute the markup does not carry", () => {
    for (const m of css.matchAll(/(header|footer|main|nav)\[role="([a-z]+)"\]/g)) {
      const [selector, tag, role] = m;
      const carried = new RegExp(`<${tag}\\b[^>]*role="${role}"`).test(layoutTemplate);
      expect(carried, `${selector} matches nothing in layouts/default.vue`).toBe(true);
    }
  });

  it("native landmarks are not given redundant roles", () => {
    expect(layoutTemplate).not.toMatch(/<header\b[^>]*role="banner"/);
    expect(layoutTemplate).not.toMatch(/<footer\b[^>]*role="contentinfo"/);
    expect(layoutTemplate).not.toMatch(/<main\b[^>]*role="main"/);
  });

  it("the skip link does not print either", () => {
    const print = printBlock();
    expect(print.slice(0, print.indexOf("display: none !important"))).toMatch(/\.skip-link\s*,/);
  });
});

describe("skip link", () => {
  it("is the first focusable element in the layout and targets <main>", () => {
    const firstFocusable = layoutTemplate.match(
      /<(a|button|input|select|textarea|NuxtLink)\b[^>]*>/s,
    );
    expect(firstFocusable?.[0]).toMatch(/href="#main-content"/);
    expect(firstFocusable?.[0]).toMatch(/class="skip-link"/);
    expect(layoutTemplate).toMatch(/>Skip to main content<\/a>/);
    const main = layoutTemplate.match(/<main\b[^>]*>/s)?.[0] ?? "";
    expect(main).toMatch(/id="main-content"/);
    expect(main).toMatch(/tabindex="-1"/);
  });

  it("is hidden until focused, and has a visible focus style from theme tokens", () => {
    const base = css.match(/\.skip-link \{[^}]*\}/)?.[0] ?? "";
    expect(base).toMatch(/transform: translateY\(-200%\)/);
    const focus = css.match(/\.skip-link:focus,\s*\.skip-link:focus-visible \{[^}]*\}/)?.[0] ?? "";
    expect(focus).toMatch(/transform: translateY\(0\)/);
    expect(focus).toMatch(/outline: 3px solid var\(--link\)/);
    // Tokens, not hex: the same rule must read in dark and in light mode.
    expect(base).toMatch(/background: var\(--surface-card\)/);
    expect(base).toMatch(/color: var\(--text-heading\)/);
    expect(base).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("exactly one <main> per page", () => {
  it("the layout renders one, and only layout-less pages render their own", () => {
    expect(layoutTemplate.match(/<main\b/g)).toHaveLength(1);
    const offenders: string[] = [];
    for (const file of [
      ...vueFiles(join(appDir, "pages")),
      ...vueFiles(join(appDir, "components")),
    ]) {
      const src = readFileSync(file, "utf-8").replace(/<!--[\s\S]*?-->/g, "");
      const mains = src.match(/<main\b/g)?.length ?? 0;
      if (mains === 0) continue;
      const layoutless = /definePageMeta\(\{[^}]*layout:\s*false/.test(src);
      if (!layoutless || mains !== 1) offenders.push(file.replace(appDir, ""));
    }
    expect(offenders).toEqual([]);
  });
});

describe("icon-only buttons in the layout have a name", () => {
  it("every <button> has visible text or an aria-label, and a type", () => {
    const buttons = [...layoutTemplate.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const [, attrs, inner] of buttons) {
      expect(attrs).toMatch(/type="button"/);
      const text = inner!
        .replace(/<svg[\s\S]*?<\/svg>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const named = /aria-label=/.test(attrs!) || text.length > 0;
      expect(named, `unnamed button: <button${attrs}>`).toBe(true);
    }
  });

  it("every svg in the layout is hidden from assistive technology", () => {
    for (const [tag] of layoutTemplate.matchAll(/<svg\b[^>]*>/g)) {
      expect(tag).toMatch(/aria-hidden="true"/);
    }
  });
});

describe("reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubReducedMotion(reduce: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({ matches: reduce && /prefers-reduced-motion: reduce/.test(q) })),
    );
  }

  it("one global rule neutralises animation, transition and smooth scrolling", () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}\n/)?.[0];
    expect(block).toBeTruthy();
    expect(block).toMatch(/\*,\s*\*::before,\s*\*::after \{/);
    expect(block).toMatch(/animation-duration: 0\.01ms !important/);
    expect(block).toMatch(/animation-iteration-count: 1 !important/);
    expect(block).toMatch(/transition-duration: 0\.01ms !important/);
    expect(block).toMatch(/scroll-behavior: auto !important/);
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1);
  });

  it("scrollBehavior() is 'auto' under reduced motion and 'smooth' otherwise", () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("ScrollToTop jumps instead of gliding under reduced motion", async () => {
    stubReducedMotion(true);
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const wrapper = mount(ScrollToTop, { attachTo: document.body });
    await wrapper.find("button").trigger("click");
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    wrapper.unmount();

    stubReducedMotion(false);
    const again = mount(ScrollToTop, { attachTo: document.body });
    await again.find("button").trigger("click");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    again.unmount();
  });

  it("ScrollToTop hands focus to the page content rather than a button about to hide", async () => {
    stubReducedMotion(false);
    vi.stubGlobal("scrollTo", vi.fn());
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = -1;
    document.body.appendChild(main);
    const wrapper = mount(ScrollToTop, { attachTo: document.body });
    await wrapper.find("button").trigger("click");
    expect(document.activeElement).toBe(main);
    wrapper.unmount();
    main.remove();
  });

  it("no file this suite owns passes a hard-coded smooth behaviour", () => {
    const src = readFileSync(join(appDir, "components", "ScrollToTop.vue"), "utf-8");
    expect(src).not.toMatch(/behavior:\s*"smooth"/);
  });
});
