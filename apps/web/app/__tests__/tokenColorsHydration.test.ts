import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { schemeFor } from "../composables/useTokenColors";

// Found 2026-11-25 in a real browser: with the site default "light" and a
// saved theme of "dark", a server-rendered report kept the light palette's
// inline colours on the dark page — Vue does not repair a mismatched inline
// style at hydration. Production has the mirror image (default dark, visitor
// in light): Moderate #eab308 on white, 1.9:1.
describe("severity and grade colours on a server-rendered page", () => {
  it("a hydrating render repeats the palette the server drew, whatever the saved theme", () => {
    expect(schemeFor("light", true, "dark")).toBe("dark");
    expect(schemeFor("dark", true, "light")).toBe("light");
  });

  it("uses the visitor's theme once hydration is over", () => {
    expect(schemeFor("light", false, "dark")).toBe("light");
    expect(schemeFor("dark", false, "light")).toBe("dark");
    expect(schemeFor("system", false, "light")).toBe("dark");
  });

  it("the composable leaves the hydrating state on mount, so the update is one Vue patches", () => {
    const src = readFileSync(resolve(__dirname, "../composables/useTokenColors.ts"), "utf8");
    expect(src).toMatch(/useNuxtApp\(\)\.isHydrating/);
    expect(src).toMatch(/onMounted\(\(\) => \{\s*hydrating\.value = false;/);
  });
});
