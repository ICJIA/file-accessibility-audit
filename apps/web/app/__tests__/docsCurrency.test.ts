/**
 * Documentation must say what the gate does — guards for the contradictions
 * the 2026-09-02 fresh-eyes audit found live. Each assertion names a sentence
 * that was on a user-facing surface while conformance.ts asserted the
 * opposite. Source-inspected, like reportSectionOrder.test.ts: these are
 * pages and static files, not mountable components.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WCAG_MAP } from "../utils/wcag";
import { WCAG_CATEGORY_MAP } from "@file-audit/shared";

const read = (...p: string[]) => readFileSync(resolve(__dirname, "..", ...p), "utf-8");
const pub = (name: string) => readFileSync(resolve(__dirname, "..", "..", "public", name), "utf-8");
const root = (...p: string[]) =>
  readFileSync(resolve(__dirname, "..", "..", "..", "..", ...p), "utf-8");

describe("the two category→criteria maps agree with each other and with the gate", () => {
  it("every scored category the shared map knows carries the same criterion ids in the web map", () => {
    for (const [cat, list] of Object.entries(WCAG_CATEGORY_MAP)) {
      const web = WCAG_MAP[cat];
      expect(web, `web map lacks ${cat}`).toBeDefined();
      expect(
        web!.criteria.map((c) => c.id).sort(),
        `${cat}: web map disagrees with shared map`,
      ).toEqual(list.map((c) => c.sc).sort());
    }
  });

  it("neither map cites 2.4.6 as something the score is tied to — no gate can assert it", () => {
    for (const list of Object.values(WCAG_CATEGORY_MAP)) {
      expect(list.map((c) => c.sc)).not.toContain("2.4.6");
    }
    for (const meta of Object.values(WCAG_MAP)) {
      expect(meta.criteria.map((c) => c.id)).not.toContain("2.4.6");
    }
  });

  it("link_quality names the criteria the gate actually asserts (1.3.1 untagged, 4.1.2 unnamed) beside the reported-only 2.4.4", () => {
    expect(WCAG_CATEGORY_MAP.link_quality!.map((c) => c.sc).sort()).toEqual([
      "1.3.1",
      "2.4.4",
      "4.1.2",
    ]);
  });

  it("the retired Practical-mode pdf_ua_compliance entry is gone from the web map", () => {
    expect(WCAG_MAP.pdf_ua_compliance).toBeUndefined();
  });
});

describe("surfaces that contradicted conformance.ts on 2026-09-02", () => {
  it("/technical-details no longer says DisplayDocTitle is 'reported, never scored' (scored under 2.4.2 since 2026-09-01)", () => {
    const src = read("components", "TechnicalExplainer.vue");
    expect(src).not.toMatch(
      /DisplayDocTitle<\/code> viewer flag is PDF\/UA clause 7\.1, not a WCAG requirement/,
    );
    expect(src).toMatch(/DisplayDocTitle[\s\S]{0,400}2\.4\.2/);
  });

  it("/technical-details discloses the scored thresholds and the visual-heading evidence rule (2026-09-02)", () => {
    const src = read("components", "TechnicalExplainer.vue");
    expect(src).toMatch(/Thresholds and heuristics/);
    expect(src).toMatch(/look like section headings/);
    expect(src).not.toMatch(
      /no heading\s+tags at all in a substantive document \(multi-page or paragraph-heavy\)/,
    );
    expect(src).toMatch(/F25/);
    expect(src).toMatch(/2\s*%/);
    expect(src).toMatch(/How fix times are estimated/);
  });

  it("llms-full.txt no longer says the language value is 'never asserted as a 3.1.1' failure", () => {
    const txt = pub("llms-full.txt");
    expect(txt).not.toMatch(/never asserted as a 3\.1\.1/);
    expect(txt).not.toMatch(/WCAG 2\.4\.5 Multiple Ways \(AA\)\./);
    expect(txt).toMatch(/No scored issues/);
    expect(txt).not.toMatch(/^- \*\*Section 508\*\*/m);
    expect(txt).not.toMatch(/"Section 508"/);
  });

  it("llms.txt no longer lists Section 508 among the standards this Illinois tool reports against", () => {
    expect(pub("llms.txt")).not.toMatch(/^- Section 508/m);
  });

  it("README no longer calls the two-axis /Scope table 'never a confirmed WCAG failure' or the score a readiness metric", () => {
    const readme = root("README.md");
    expect(readme).not.toMatch(/never as a confirmed WCAG failure/);
    expect(readme).not.toMatch(/prioritised-readiness/);
    expect(readme).not.toMatch(/\| 1\.3\.1 \(A\), 2\.4\.6 \(AA\)/);
  });

  it("MethodologyCard no longer calls the score 'the compliance benchmark' — the verdict is", () => {
    expect(read("components", "MethodologyCard.vue")).not.toMatch(/compliance benchmark/);
  });

  it("/wcag-2-2 admits the 2.2 form criteria ARE listed on documents with form fields", () => {
    expect(read("pages", "wcag-2-2.vue")).not.toMatch(
      /rather than listed in each document's verdict/,
    );
  });

  it("the rebrand script's llms builders no longer emit the retracted 2.4.5 bookmarks claim or Section 508", () => {
    const script = root("scripts", "rebrand.ts");
    // The CLAIM shapes, not every mention: an explanation of why 2.4.5 does
    // not apply is allowed to name it.
    expect(script).not.toMatch(/\) - WCAG 2\.4\.5/);
    expect(script).not.toMatch(/^WCAG: 2\.4\.5/m);
    expect(script).not.toMatch(/Section 508/);
  });

  it("the category card names its criteria truthfully — checked against, not 'tied to' the score", () => {
    const src = read("components", "ReportContent.vue");
    expect(src).not.toMatch(/This score is tied to the following/);
  });
});
