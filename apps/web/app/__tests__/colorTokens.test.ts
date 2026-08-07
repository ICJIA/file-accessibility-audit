import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  GRADE_COLORS,
  GRADE_COLORS_LIGHT,
  SEVERITY_COLORS,
  SEVERITY_COLORS_LIGHT,
  gradeColorFor,
  severityColorFor,
  withAlpha,
} from "@file-audit/shared";

// The grade and severity palette is tuned for the dark UI, where it runs
// 5.3–10.3:1 against the background. On the LIGHT theme those same colours
// measured 1.9–3.8:1 — every one of them below the 4.5:1 WCAG AA floor for
// normal text, in a tool whose entire purpose is catching exactly that. The
// worst was Moderate yellow at 1.92:1.
//
// One palette cannot serve both backgrounds: a colour dark enough to pass on
// white is too pale on near-black. So the fix is two palettes, and the thing
// worth testing is not which hexes were chosen but that BOTH of them clear the
// bar against the surfaces they are actually painted on. A future palette
// tweak that looks nicer and fails AA should fail here.

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

// The surfaces these colours are actually painted on, from main.css.
const DARK_SURFACES = ["#0a0a0a", "#111111", "#0d0d0d"]; // body, card, deep
const LIGHT_SURFACES = ["#f9fafb", "#ffffff", "#f3f4f6"]; // body, card, alt
const AA_NORMAL = 4.5;

describe("colour tokens clear WCAG AA on the surfaces they are painted on", () => {
  it.each(Object.entries(GRADE_COLORS))("dark grade %s", (grade, hex) => {
    for (const bg of DARK_SURFACES) {
      expect(contrast(hex, bg), `${grade} ${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it.each(Object.entries(GRADE_COLORS_LIGHT))("light grade %s", (grade, hex) => {
    for (const bg of LIGHT_SURFACES) {
      expect(contrast(hex, bg), `${grade} ${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it.each(Object.entries(SEVERITY_COLORS))("dark severity %s", (sev, hex) => {
    for (const bg of DARK_SURFACES) {
      expect(contrast(hex, bg), `${sev} ${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it.each(Object.entries(SEVERITY_COLORS_LIGHT))("light severity %s", (sev, hex) => {
    for (const bg of LIGHT_SURFACES) {
      expect(contrast(hex, bg), `${sev} ${hex} on ${bg}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("proves the old single palette really did fail — this is not a vacuous test", () => {
    // Guard against the whole file quietly passing because the thresholds or
    // the surfaces drifted. These are the measurements that motivated the fix.
    expect(contrast(GRADE_COLORS.C!, "#ffffff")).toBeLessThan(AA_NORMAL);
    expect(contrast(SEVERITY_COLORS.Critical!, "#ffffff")).toBeLessThan(AA_NORMAL);
  });
});

describe("the two palettes stay parallel", () => {
  it("defines a light value for every dark grade, and vice versa", () => {
    // A grade present in one table and missing from the other would silently
    // fall back to the dark hex in light mode — the exact bug being fixed.
    expect(Object.keys(GRADE_COLORS_LIGHT).sort()).toEqual(Object.keys(GRADE_COLORS).sort());
  });

  it("defines a light value for every severity label", () => {
    expect(Object.keys(SEVERITY_COLORS_LIGHT).sort()).toEqual(Object.keys(SEVERITY_COLORS).sort());
  });

  it("mirrors both palettes in main.css for stylesheet use", () => {
    const css = readFileSync(resolve(__dirname, "../assets/css/main.css"), "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("html.light {"));
    const light = css.slice(css.indexOf("html.light {"));
    for (const grade of Object.keys(GRADE_COLORS)) {
      const name = `--grade-${grade.toLowerCase()}`;
      expect(root, `${name} in :root`).toContain(name);
      expect(light, `${name} in html.light`).toContain(name);
    }
    for (const name of ["--sev-pass", "--sev-minor", "--sev-moderate", "--sev-critical"]) {
      expect(root, `${name} in :root`).toContain(name);
      expect(light, `${name} in html.light`).toContain(name);
    }
  });
});

describe("gradeColorFor / severityColorFor", () => {
  it("returns the theme's own palette", () => {
    expect(gradeColorFor("C", "dark")).toBe(GRADE_COLORS.C);
    expect(gradeColorFor("C", "light")).toBe(GRADE_COLORS_LIGHT.C);
    expect(severityColorFor("Critical", "light")).toBe(SEVERITY_COLORS_LIGHT.Critical);
  });

  it("falls back to a visible neutral rather than nothing", () => {
    expect(gradeColorFor(null, "light")).toBe("#666");
    expect(gradeColorFor("Z", "light")).toBe("#666");
    expect(severityColorFor(undefined, "dark")).toBe("#999");
  });

  it("returns a plain hex, never a var() or color-mix()", () => {
    // Load-bearing: these are consumed through inline :style bindings, and the
    // test DOM drops any inline style containing var() or color-mix() outright
    // — which would blind every colour assertion in the suite. Verified
    // empirically before this approach was chosen.
    for (const scheme of ["dark", "light"] as const) {
      for (const grade of Object.keys(GRADE_COLORS)) {
        expect(gradeColorFor(grade, scheme)).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe("withAlpha", () => {
  it("appends a hex alpha channel, replacing 13 hand-written suffixes", () => {
    expect(withAlpha("#22c55e", 8)).toBe("#22c55e14");
    expect(withAlpha("#22c55e", 100)).toBe("#22c55eff");
    expect(withAlpha("#22c55e", 0)).toBe("#22c55e00");
  });

  it("clamps rather than emitting an invalid colour", () => {
    expect(withAlpha("#22c55e", 150)).toBe("#22c55eff");
    expect(withAlpha("#22c55e", -10)).toBe("#22c55e00");
  });

  it("passes through anything that is not a 6-digit hex, unchanged", () => {
    // Better a fully-opaque colour than a malformed one that renders as
    // nothing at all.
    expect(withAlpha("var(--x)", 50)).toBe("var(--x)");
    expect(withAlpha("rebeccapurple", 50)).toBe("rebeccapurple");
  });
});
