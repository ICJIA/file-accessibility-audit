/**
 * TechnicalExplainer's heading outline never skips a level.
 *
 * axe flagged `heading-order` on /technical-details: the page's <h1> was
 * followed directly by this component's first <h3>. The component is also
 * embedded on the audit page under other headings, so its outline has to be
 * self-contained: it opens with its own <h2>, and from there no heading is
 * more than one level deeper than the one before it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (...p: string[]) => readFileSync(resolve(__dirname, "..", ...p), "utf-8");
const explainer = read("components", "TechnicalExplainer.vue");
const template = explainer.slice(0, explainer.indexOf("<script setup"));

const levels = (src: string) =>
  [...src.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));

describe("TechnicalExplainer heading outline", () => {
  const outline = levels(template);

  it("opens with its own <h2> and has no <h1>", () => {
    expect(outline[0]).toBe(2);
    expect(outline).not.toContain(1);
    expect(outline.filter((l) => l === 2)).toHaveLength(1);
  });

  it("never descends more than one level at a time", () => {
    for (let i = 1; i < outline.length; i++) {
      expect(outline[i]! - outline[i - 1]!, `heading #${i + 1} skips a level`).toBeLessThanOrEqual(
        1,
      );
    }
  });

  it("the <h2> precedes the first topic and does not change the visible page", () => {
    const h2 = template.indexOf('<h2 class="sr-only">Technical details</h2>');
    expect(h2).toBeGreaterThan(-1);
    expect(h2).toBeLessThan(
      template.replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length)).indexOf("<h3"),
    );
    // Inside the disclosure body, not the <summary>.
    expect(h2).toBeGreaterThan(template.indexOf("</summary>"));
  });

  it("is valid on /technical-details: the page supplies the <h1>, then this <h2>", () => {
    const page = read("pages", "technical-details.vue");
    const tpl = page.slice(page.indexOf("<template>"));
    const pageLevels = levels(tpl.replace(/<!--[\s\S]*?-->/g, "").split("<TechnicalExplainer")[0]!);
    expect(pageLevels[pageLevels.length - 1]).toBe(1);
  });
});
