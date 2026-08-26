/**
 * The landing page's Matterhorn Protocol coverage disclosure (v1.91.0).
 *
 * WHAT THIS PINS AND WHY: the section makes a public, checkpoint-by-checkpoint
 * claim about what this product checks. The dangerous regression is not a
 * rendering bug — it is a COVERAGE OVERCLAIM: marking a human-judgment
 * checkpoint as machine-checked, or claiming the engine covers a checkpoint
 * it does not (that would be exactly the "silently looks complete" failure
 * the v1.91.0 veraPDF disclosure exists to end). The pins below encode the
 * 2026-08-25 completeness audit of packages/analyzer against Matterhorn 1.1.
 *
 * When an engine gap ships (the planned unmapped-glyph census for checkpoint
 * 10, Note/Formula censuses for 19/17, ...), promote the checkpoint in
 * ~/data/matterhorn.ts AND update its pin here in the same commit.
 */
import "./test-helpers";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MatterhornChecklist from "../components/MatterhornChecklist.vue";
import {
  MATTERHORN_CHECKPOINTS,
  MATTERHORN_FACTS,
  type MatterhornCoverage,
} from "../data/matterhorn";

const COVERAGE_VALUES: MatterhornCoverage[] = ["engine", "engine-partial", "verapdf", "human"];

const byId = (id: string) => MATTERHORN_CHECKPOINTS.find((c) => c.id === id);

describe("matterhorn.ts — the checkpoint data", () => {
  it("carries exactly the protocol's 31 checkpoints, in order, as 01–31", () => {
    expect(MATTERHORN_CHECKPOINTS).toHaveLength(31);
    expect(MATTERHORN_CHECKPOINTS.map((c) => c.id)).toEqual(
      Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")),
    );
  });

  it("gives every checkpoint a non-empty name, summary, and a known coverage value", () => {
    for (const c of MATTERHORN_CHECKPOINTS) {
      expect(c.name.trim().length, `name of ${c.id}`).toBeGreaterThan(0);
      expect(c.summary.trim().length, `summary of ${c.id}`).toBeGreaterThan(0);
      expect(COVERAGE_VALUES, `coverage of ${c.id}`).toContain(c.coverage);
    }
    const names = MATTERHORN_CHECKPOINTS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("states the protocol's own arithmetic: 87 machine + 47 human + 2 untestable = 136", () => {
    expect(MATTERHORN_FACTS.checkpoints).toBe(31);
    expect(MATTERHORN_FACTS.failureConditions).toBe(136);
    expect(
      MATTERHORN_FACTS.machineCheckable +
        MATTERHORN_FACTS.humanJudgment +
        MATTERHORN_FACTS.noDefinedTest,
    ).toBe(MATTERHORN_FACTS.failureConditions);
  });

  // The overclaim guards. Flicker (03), Color and Contrast (04), and Article
  // Threads (22) are human-judgment territory for EVERY checker — PAC marks
  // them manual, veraPDF has no meaningful machine rules for them, and this
  // engine deliberately reports contrast as not-assessed for PDF. If one of
  // these ever claims machine coverage, the section has started lying.
  it("never claims machine coverage for the human-judgment checkpoints (03, 04, 22)", () => {
    expect(byId("03")?.coverage).toBe("human");
    expect(byId("04")?.coverage).toBe("human");
    expect(byId("22")?.coverage).toBe("human");
  });

  // Checkpoint 10 (Character Mappings / glyph→Unicode) is NOT checked
  // in-house today — font embedding is only a proxy. It is veraPDF-covered.
  // When the planned unmapped-glyph census ships in packages/analyzer,
  // promote the data entry to "engine-partial" and flip this pin with it.
  it("does not claim in-house coverage for Character Mappings (10) before the glyph census ships", () => {
    expect(byId("10")?.coverage).toBe("verapdf");
  });

  // v1.92.0 promotions — each pinned to the engine change that earned it.
  // Promote further ONLY alongside the analyzer change that makes it true.
  it("claims the v1.92.0 promotions exactly: 17/19 engine-partial (Formula alt + Note /ID censuses), 20 engine (OCG /Name + /AS)", () => {
    expect(byId("17")?.coverage).toBe("engine-partial");
    expect(byId("19")?.coverage).toBe("engine-partial");
    expect(byId("20")?.coverage).toBe("engine");
  });

  // Two marquee in-house checks that must never silently demote: Security
  // (26 — the accessibility permission flag, cited as Matterhorn 26-002 in
  // the scorer) and Fonts (31 — the rendering-reachability embedding census).
  it("keeps the flagship in-house checkpoints attributed to the engine (26, 31)", () => {
    expect(byId("26")?.coverage).toBe("engine");
    expect(byId("31")?.coverage).toBe("engine");
  });
});

describe("MatterhornChecklist.vue", () => {
  it("renders all 31 checkpoint names and numbers", () => {
    const w = mount(MatterhornChecklist);
    for (const c of MATTERHORN_CHECKPOINTS) {
      expect(w.text()).toContain(c.name);
      expect(w.text()).toContain(c.id);
    }
  });

  it("states the protocol figures so the checklist has a denominator (plain-language phrasing, v1.92.0)", () => {
    const w = mount(MatterhornChecklist);
    expect(w.text()).toMatch(/31 checkpoints/);
    expect(w.text()).toMatch(/136 specific ways a PDF can fail/);
    expect(w.text()).toMatch(/Software can verify 87/);
    expect(w.text()).toMatch(/47 need\s+human judgment/);
  });

  // v1.92.0, user request: the section must answer the three questions a
  // non-technical visitor actually asks, before any jargon is used.
  it("answers 'Why Matterhorn?' in plain language (the mountain, the PDF Association, PAC)", () => {
    const w = mount(MatterhornChecklist);
    expect(w.text()).toContain('Why "Matterhorn"?');
    expect(w.text()).toMatch(/Alpine\s+mountain/);
    expect(w.text()).toMatch(/PDF Association/);
    expect(w.text()).toMatch(/climbing\s+route/);
  });

  it("answers 'What is veraPDF?' as an independent second opinion that runs automatically", () => {
    const w = mount(MatterhornChecklist);
    expect(w.text()).toContain("What is veraPDF?");
    expect(w.text()).toMatch(/independent second opinion/);
    expect(w.text()).toMatch(/runs automatically/);
  });

  it("answers 'Does this change my score?' with a plain No and points back at the action plan", () => {
    const w = mount(MatterhornChecklist);
    expect(w.text()).toContain("Does this change my score?");
    expect(w.text()).toMatch(/No\. Your score comes from the WCAG-based categories/);
    expect(w.text()).toMatch(/it informs, it\s+never grades/);
  });

  it("explains all four coverage mechanisms in the legend", () => {
    const w = mount(MatterhornChecklist);
    expect(w.text()).toContain("Audit engine");
    expect(w.text()).toContain("Engine + veraPDF");
    expect(w.text()).toMatch(/independent checker described above/);
    expect(w.text()).toContain("Human review");
    // The human-review line must name the manual-review card — the honest
    // "no software can do this" pressure valve.
    expect(w.text()).toMatch(/manual-review card/);
  });

  it("cross-references the v1.91.0 'Did not run' disclosure so absence is never a pass", () => {
    const w = mount(MatterhornChecklist);
    expect(w.text()).toMatch(/Did not run/);
    expect(w.text()).toMatch(/never presented as a passing one/i);
  });

  it("links the protocol, PAC, and veraPDF externally with rel=noopener", () => {
    const w = mount(MatterhornChecklist);
    for (const href of [
      "https://pdfa.org/resource/the-matterhorn-protocol/",
      "https://pac.pdf-accessibility.org/",
      "https://verapdf.org/",
    ]) {
      const a = w.find(`a[href="${href}"]`);
      expect(a.exists(), href).toBe(true);
      expect(a.attributes("rel")).toContain("noopener");
      expect(a.attributes("target")).toBe("_blank");
    }
  });

  it("routes the Office-formats note to /technical-details (NuxtLink `to`, per the stub contract)", () => {
    const w = mount(MatterhornChecklist);
    // The test NuxtLink stub renders <a><slot/></a> with props as RAW
    // attributes — assert `to`, never `href` (see AnnouncementBanner tests).
    const internal = w.findAll("a").find((a) => a.attributes("to") === "/technical-details");
    expect(internal, "NuxtLink to /technical-details").toBeTruthy();
  });

  it("chips every checkpoint with its coverage label", () => {
    const w = mount(MatterhornChecklist);
    const items = w.findAll("ol li");
    expect(items).toHaveLength(31);
    const labelFor: Record<MatterhornCoverage, string> = {
      engine: "Audit engine",
      "engine-partial": "Engine + veraPDF",
      verapdf: "veraPDF",
      human: "Human review",
    };
    MATTERHORN_CHECKPOINTS.forEach((c, i) => {
      expect(items.at(i)!.text(), `row ${c.id}`).toContain(labelFor[c.coverage]);
    });
  });
});

describe("landing page wiring", () => {
  // The classic trap: a tested component nothing renders. reportSectionOrder
  // pins report-surface composition the same source-inspecting way.
  it("index.vue imports and renders <MatterhornChecklist>", () => {
    const src = readFileSync(path.join(import.meta.dirname, "..", "pages", "index.vue"), "utf8");
    expect(src).toMatch(/import MatterhornChecklist from "~\/components\/MatterhornChecklist.vue"/);
    expect(src).toMatch(/<MatterhornChecklist \/>/);
  });
});
