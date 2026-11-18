/**
 * 2026-11-18 (readers' feedback: "very small and hard to read"): the two
 * long-form reference pages render their text larger. Tailwind v4 sizes text
 * through theme variables, so the `.reading-page` wrapper redefines them for
 * that page only. Fixed pixel sizes would escape the wrapper, so none may
 * come back on these pages.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const WEB = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

describe("reading pages use larger text", () => {
  it("main.css raises xs/sm/base inside .reading-page", () => {
    const css = read("assets/css/main.css");
    const block = css.match(/\.reading-page\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(block).toMatch(/--text-xs:\s*0\.875rem/);
    expect(block).toMatch(/--text-sm:\s*1rem/);
    expect(block).toMatch(/--text-base:\s*1\.125rem/);
  });

  it.each(["pages/data-retention.vue", "pages/technical-details.vue"])(
    "%s wraps its content in .reading-page",
    (p) => {
      expect(read(p)).toMatch(/<template>\s*<div class="reading-page /);
    },
  );

  it("no fixed pixel text sizes (they would not scale) on either page or its parts", () => {
    const files = [
      "pages/data-retention.vue",
      "pages/technical-details.vue",
      "components/TechnicalExplainer.vue",
      ...readdirSync(resolve(WEB, "components/dataRetention")).map(
        (f) => `components/dataRetention/${f}`,
      ),
    ];
    for (const f of files) expect(read(f), f).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
  });
});
