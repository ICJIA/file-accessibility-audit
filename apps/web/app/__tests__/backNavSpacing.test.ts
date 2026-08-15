/**
 * The "← Back" nav on the standalone pages must not use a negative
 * bottom margin to tighten the gap below it.
 *
 * That idiom was written for Tailwind v3, where `space-y-10` put
 * `margin-top: 2.5rem` on the NEXT sibling and the nav's `-mb-4`
 * collapsed against it for a net 1.5rem gap. Tailwind v4 changed
 * `space-y-*` to set the margin on the nav ITSELF (margin-bottom via a
 * zero-specificity `:where()` selector), so a real `-mb-4` class no
 * longer combines with it — it REPLACES it. Net margin: −1rem, and the
 * header's eyebrow line renders on top of the Back button (user
 * screenshot, 2026-08-15, /technical-details; /data-retention had the
 * identical markup).
 *
 * The fix is the explicit positive gap the design always intended:
 * `mb-6` (1.5rem), which overrides the space-y default the same way —
 * by specificity — but in the right direction.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGES = ["pages/technical-details.vue", "pages/data-retention.vue"];

describe.each(PAGES)("%s — back-nav spacing", (page) => {
  const src = readFileSync(resolve(__dirname, "..", page), "utf-8");
  const navTag = src.match(/<nav class="[^"]*"/)?.[0] ?? "";

  it("has the back nav", () => {
    expect(navTag).not.toBe("");
  });

  it("does not tighten the gap with a negative margin (broken under Tailwind v4 space-y)", () => {
    expect(navTag).not.toMatch(/-m[tb]-/);
  });

  it("states the intended 1.5rem gap explicitly", () => {
    expect(navTag).toContain("mb-6");
  });
});
