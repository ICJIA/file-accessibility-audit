import "./test-helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Section10 from "../components/dataRetention/Section10SecurityAudits.vue";
import { SECURITY_AUDIT_ENTRIES } from "../data/securityAudits";

// § 10 of the data-retention page is the auditor-facing security history: one
// dated entry per release, going back to v1.18.0. It used to be 3,273 lines of
// hand-written markup — ~46 lines of identical Tailwind boilerplate per
// release, 536 duplicated class attributes — and is now data plus one
// renderer.
//
// Three things have to keep holding, and none of them is "the markup looks
// right":
//
//   1. Nothing dangerous gets into the data, because the renderer uses v-html.
//      That is safe only because the strings are authored in this repository
//      and compiled into the bundle. This file is what makes that a checked
//      claim rather than a comment.
//   2. Every badge the data uses has a colour. A typo'd badge would otherwise
//      render as an unstyled word in the middle of a sentence.
//   3. The current release has an entry. AGENTS.md lists it as a release step;
//      the announcement banner was missed once when a step was only written
//      down, so this one is enforced.

const source = readFileSync(resolve(__dirname, "../data/securityAudits.ts"), "utf-8");

const shippingVersion = (): string =>
  JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf-8")).version;

describe("the data carries prose, not capability", () => {
  // The whole safety argument for the renderer's v-html is that these strings
  // are inert formatting. If that stops being true, this is where it should
  // break — loudly, and before it ships.
  const strings = source.slice(source.indexOf("SECURITY_AUDIT_ENTRIES"));

  it("uses only inline formatting tags", () => {
    const tags = new Set(Array.from(strings.matchAll(/<\/?([a-z][a-z0-9]*)/gi), (m) => m[1]!));
    expect([...tags].sort()).toEqual(["a", "br", "code", "em", "strong"]);
  });

  it("carries no script, no event handler, and no inline style", () => {
    expect(strings).not.toMatch(/<script|<iframe|<object|<embed|<form|<svg/i);
    expect(strings).not.toMatch(/\son[a-z]+\s*=/i);
    expect(strings).not.toMatch(/\sstyle\s*=/i);
  });

  it("carries no URL-bearing attribute other than a plain https href", () => {
    // src=, srcset=, data:, javascript: — anything that fetches or executes.
    expect(strings).not.toMatch(/\bsrc(set)?\s*=/i);
    expect(strings).not.toMatch(/javascript:|data:/i);
    // https to the outside world, or a root-relative path to a page of our
    // own. Nothing protocol-relative, and nothing that could be a scheme.
    for (const [, href] of strings.matchAll(/href=\\?"([^"\\]*)/g)) {
      expect(href).toMatch(/^(https:\/\/|\/[a-z])/);
    }
  });

  it("interpolates nothing — every entry is a literal", () => {
    // A template literal here would mean something computed reaches v-html.
    expect(strings).not.toMatch(/\$\{/);
    expect(strings).not.toMatch(/`/);
  });
});

describe("every entry is renderable", () => {
  const html = mount(Section10).html();

  it("renders one card per entry", () => {
    expect(html.match(/<article/g)?.length).toBe(SECURITY_AUDIT_ENTRIES.length);
    expect(SECURITY_AUDIT_ENTRIES.length).toBeGreaterThanOrEqual(65);
  });

  it("renders every version heading", () => {
    for (const e of SECURITY_AUDIT_ENTRIES) expect(html).toContain(`>${e.version}<`);
  });

  it("renders the inline markup as markup, not as visible angle brackets", () => {
    // The findings' follow-up notes were rendered with {{ }} at first, so 28
    // of them printed literal "<strong>" to the reader.
    expect(mount(Section10).text()).not.toMatch(/<(strong|em|code|br)/);
  });

  it("gives every badge a colour", () => {
    const used = new Set(
      SECURITY_AUDIT_ENTRIES.flatMap((e) => e.body)
        .flatMap((b) => ("items" in b ? b.items : []))
        .map((i) => i.badge)
        .filter(Boolean),
    );
    expect(used.size).toBeGreaterThan(5);
    for (const badge of used) {
      // The badge word must be wrapped in a tinted pill, not left bare.
      expect(html).toMatch(new RegExp(`bg-[a-z]+-700/30[^"]*"[^>]*>${badge}<`));
    }
  });

  it("keeps the section's own anchor, which the page's contents list links to", () => {
    expect(html).toContain('id="security-audits"');
  });
});

describe("the history stays a history", () => {
  it("is newest-first", () => {
    const rank = (v: string) =>
      (v.match(/^v(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).reduce((a, n) => a * 1000 + Number(n), 0);
    const ranked = SECURITY_AUDIT_ENTRIES.map((e) => rank(e.version)).filter((r) => r > 0);
    expect([...ranked].sort((a, b) => b - a)).toEqual(ranked);
  });

  it("dates every release entry and says what was reviewed", () => {
    for (const e of SECURITY_AUDIT_ENTRIES) {
      if (!/^v\d+\.\d+\.\d+$/.test(e.version)) continue; // "v1.17.0 and earlier"
      expect(e.meta, e.version).toMatch(/<strong>\d{4}-\d{2}-\d{2}<\/strong>/);
      expect(e.body.length, e.version).toBeGreaterThan(0);
    }
  });

  it("has an entry for the version being shipped", () => {
    // AGENTS.md step 4 of the release checklist. This is the auditor-facing
    // record; skipping it on a bug-fix release leaves a gap in the evidence.
    // It was documented but not enforced, and v1.63.1 shipped without one —
    // which is how this test came to exist. It checks the release in hand, not
    // the archive: older gaps are backfilled deliberately, not by fabricating
    // dated reviews to make a test pass.
    expect(SECURITY_AUDIT_ENTRIES.map((e) => e.version)).toContain(`v${shippingVersion()}`);
  });

  it("has a README § Security entry for the version being shipped", () => {
    // The technical-framed half of the same record (step 3). It drifted the
    // same way and for the same reason, so it is held to the same rule.
    const readme = readFileSync(resolve(__dirname, "../../../../README.md"), "utf-8");
    const history = readme.slice(readme.indexOf("### Review history"));
    expect(history).toContain(`### v${shippingVersion()} —`);
  });
});
