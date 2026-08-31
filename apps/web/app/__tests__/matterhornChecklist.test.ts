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

  // Checkpoint 10 (Character Mappings): promoted in v1.94.0 — the engine now
  // censuses PUA/replacement characters in the extracted text (the
  // extraction-visible face of a missing ToUnicode/cmap); veraPDF still
  // covers the font-table side, hence engine-partial, never full engine.
  it("claims exactly engine-partial for Character Mappings (10) since the v1.94.0 glyph census", () => {
    expect(byId("10")?.coverage).toBe("engine-partial");
  });

  // v1.92.0 promotions — each pinned to the engine change that earned it.
  // Promote further ONLY alongside the analyzer change that makes it true.
  it("claims the v1.92.0 promotions exactly: 17/19 engine-partial (Formula alt + Note /ID censuses), 20 engine (OCG /Name + /AS)", () => {
    expect(byId("17")?.coverage).toBe("engine-partial");
    expect(byId("19")?.coverage).toBe("engine-partial");
    expect(byId("20")?.coverage).toBe("engine");
  });

  it("claims the v1.94.0 promotions exactly: 10/21/30 engine-partial (glyph, /Filespec /Desc, and reference-XObject censuses)", () => {
    expect(byId("10")?.coverage).toBe("engine-partial");
    expect(byId("21")?.coverage).toBe("engine-partial");
    expect(byId("30")?.coverage).toBe("engine-partial");
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

describe("MatterhornChecklist.vue — collapsible placement (v1.94.0, user request)", () => {
  it("renders as a native <details> expander, collapsed by default, with a summary headline", () => {
    const w = mount(MatterhornChecklist);
    const details = w.find("section#matterhorn details");
    expect(details.exists()).toBe(true);
    expect(details.attributes("open")).toBeUndefined();
    expect(w.find("summary").text()).toContain("The Matterhorn Checklist");
  });

  // RB-review F10: collapsing must not cost the heading outline or landmark
  // list — on an accessibility product, the trust disclosure has to stay
  // reachable by H-key and region navigation.
  it("keeps the section landmark and a real <h2> despite the collapse", () => {
    const w = mount(MatterhornChecklist);
    const section = w.find("section#matterhorn");
    expect(section.attributes("aria-labelledby")).toBe("matterhorn-heading");
    const h2 = w.find("summary h2#matterhorn-heading");
    expect(h2.exists()).toBe(true);
    expect(h2.text()).toContain("The Matterhorn Checklist");
  });

  it("auto-opens when the page arrives on the banner's /#matterhorn hash", async () => {
    window.location.hash = "#matterhorn";
    try {
      const w = mount(MatterhornChecklist);
      await w.vm.$nextTick();
      expect((w.find("section#matterhorn details").element as HTMLDetailsElement).open).toBe(true);
    } finally {
      window.location.hash = "";
    }
  });

  it("stays collapsed for an ordinary visit (no hash)", async () => {
    window.location.hash = "";
    const w = mount(MatterhornChecklist);
    await w.vm.$nextTick();
    expect((w.find("section#matterhorn details").element as HTMLDetailsElement).open).toBe(false);
  });
});

describe("landing page wiring", () => {
  // The classic trap: a tested component nothing renders. reportSectionOrder
  // pins report-surface composition the same source-inspecting way.
  it("index.vue imports and renders <MatterhornChecklist>", () => {
    const src = readFileSync(path.join(import.meta.dirname, "..", "pages", "index.vue"), "utf8");
    expect(src).toMatch(/import MatterhornChecklist from "~\/components\/MatterhornChecklist.vue"/);
    expect(src).toMatch(/<MatterhornChecklist \/>/);
    // Placement is the point (v1.94.0): directly beneath the Technical
    // Details expander, ABOVE the "What This Tool Does" tiles — near the
    // fold, not buried at the bottom of the page.
    const explainerAt = src.indexOf("<LazyTechnicalExplainer");
    const checklistAt = src.indexOf("<MatterhornChecklist");
    const tilesAt = src.indexOf("What This Tool Does");
    expect(explainerAt).toBeGreaterThan(-1);
    expect(checklistAt).toBeGreaterThan(explainerAt);
    expect(checklistAt).toBeLessThan(tilesAt);
  });
});

describe("MatterhornChecklist.vue — the PDF-only scope note (v1.101.0, user request)", () => {
  // The note says BOTH halves out loud: Matterhorn applies to PDFs only
  // (it is PDF/UA's test model), AND Office files are still fully checked
  // here under their own per-format audits. Dropping either half creates a
  // wrong reading — that Office files aren't checked, or that this list
  // applies to them.
  it("explains that Matterhorn is PDF-only because it is PDF/UA's test model", () => {
    const w = mount(MatterhornChecklist);
    const note = w.find('[data-testid="matterhorn-pdf-only"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("Why is this checklist only about PDFs?");
    expect(note.text()).toMatch(/exactly one file format: PDF/);
    expect(note.text()).toMatch(/PDF\/UA \(ISO 14289\)/);
    expect(note.text()).toMatch(/these checkpoints have no meaning there/);
  });

  it("states that Office files are still checked here — by name (.docx, .pptx, .xlsx) — just not against Matterhorn", () => {
    const note = mount(MatterhornChecklist).find('[data-testid="matterhorn-pdf-only"]');
    expect(note.text()).toMatch(/can absolutely still be checked here/);
    expect(note.text()).toContain(".docx");
    expect(note.text()).toContain(".pptx");
    expect(note.text()).toContain(".xlsx");
    expect(note.text()).toMatch(/Matterhorn checklist and the veraPDF panels are PDF-specific/);
  });

  it("links the Matterhorn Protocol specification from the note, opening in a new tab", () => {
    const note = mount(MatterhornChecklist).find('[data-testid="matterhorn-pdf-only"]');
    const a = note.find('a[href="https://pdfa.org/resource/the-matterhorn-protocol/"]');
    expect(a.exists()).toBe(true);
    expect(a.attributes("target")).toBe("_blank");
    expect(a.attributes("rel")).toContain("noopener");
    expect(a.text()).toContain("Matterhorn Protocol specification");
  });
});

describe("MatterhornChecklist.vue — the law linkage (v1.97.0, user request)", () => {
  // The block exists to answer "WCAG and IITAA are the law — why should I
  // care about Matterhorn?" for a non-technical Illinois agency reader. Its
  // honesty line is load-bearing: the LAW names WCAG, not PDF/UA, and the
  // block must never imply a PDF/UA badge is legally required.
  it("names the whole chain: ADA Title II, IITAA, WCAG 2.1 AA, and Matterhorn as the PDF-side test model", () => {
    const text = mount(MatterhornChecklist).text();
    expect(text).toContain("WCAG and IITAA are the law");
    expect(text).toContain("ADA Title II");
    expect(text).toContain("IITAA 2.1");
    expect(text).toContain("WCAG 2.1 AA");
    // The "(this tool audits against WCAG 2.2 AA, a superset…)" parenthetical
    // was removed on 2026-08-31 when 2.1 became the standard the reports name:
    // the sentence before it already says both laws name WCAG 2.1 AA, so the
    // aside had become a redundant contradiction.
    expect(text).not.toMatch(/audits against WCAG\s*2\.2/);
    expect(text).toMatch(/Matterhorn is the PDF world's translation/);
    expect(text).toMatch(/PAC, Acrobat, veraPDF/);
  });

  it("carries the load-bearing precision line and never claims PDF/UA is legally required", () => {
    const text = mount(MatterhornChecklist).text();
    expect(text).toMatch(/the law requires WCAG/i);
    expect(text).toMatch(/does not need a PDF\/UA badge to be lawful/);
    expect(text).not.toMatch(/law requires PDF\/UA/i);
    expect(text).not.toMatch(/PDF\/UA is (legally )?required/i);
  });
});
