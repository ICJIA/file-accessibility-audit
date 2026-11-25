import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// The header's site links collapse behind a Menu button on a narrow screen.
// These pin the parts a keyboard or screen-reader user depends on.
const layout = readFileSync(resolve(__dirname, "../layouts/default.vue"), "utf8");
const css = readFileSync(resolve(__dirname, "../assets/css/main.css"), "utf8");

describe("narrow-screen site menu", () => {
  const button = layout.slice(
    layout.indexOf('data-testid="site-menu-button"') - 200,
    layout.indexOf("Menu\n          </button>"),
  );

  it("is a real button that says whether the menu is open and which element it controls", () => {
    expect(button).toMatch(/<button/);
    expect(button).toMatch(/type="button"/);
    expect(button).toMatch(/aria-controls="site-nav"/);
    expect(button).toMatch(/:aria-expanded="menuOpen \? 'true' : 'false'"/);
    expect(layout).toMatch(/<nav\s+id="site-nav"/);
  });

  it("has a visible text name, and its icon is hidden from assistive technology", () => {
    expect(button).toMatch(/aria-hidden="true"/);
    expect(layout).toMatch(/Menu\n\s+<\/button>/);
  });

  it("is shown only below the breakpoint the stylesheet collapses the links at", () => {
    expect(button).toMatch(/md:hidden/);
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{\s+\.site-nav \{/);
    expect(css).toMatch(/\.site-nav:not\(\.is-open\) \{\s+display: none;/);
  });

  it("comes before the links in the document, so Tab moves from it into the opened menu", () => {
    expect(layout.indexOf('data-testid="site-menu-button"')).toBeLessThan(
      layout.indexOf('id="site-nav"'),
    );
  });

  it("closes on Escape and when the page changes", () => {
    expect(layout).toMatch(/@keydown\.esc="closeMenu\(true\)"/);
    expect(layout).toMatch(/watch\(\s*\(\) => route\.fullPath,\s*\(\) => closeMenu\(\),/);
  });
});
