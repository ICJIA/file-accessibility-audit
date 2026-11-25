/**
 * /sample-report (2026-11-24): a bundled, real engine result rendered through
 * the live report components, bannered as a sample, with no API call, no
 * repair button and no share link — and not in the home page bundle.
 */
import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, Suspense } from "vue";

const g = globalThis as any;
g.useHead = vi.fn();
g.useSeoMeta = () => {};

import SamplePage from "../pages/sample-report.vue";
import sample from "../data/sampleReport.json";
import { currentDocMetadata } from "../utils/remediationMetadata";

const raw = readFileSync(resolve(__dirname, "../data/sampleReport.json"), "utf8");
const data = sample as Record<string, any>;

describe("the bundled sample result", () => {
  it("is a current-shape engine result", () => {
    expect(data.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(typeof data.engineVersion).toBe("string");
    expect(data.fileType).toBe("pdf");
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories.length).toBeGreaterThanOrEqual(9);
    // findingDetails is index-aligned with findings wherever it is present.
    for (const c of data.categories) {
      if (c.findingDetails) expect(c.findingDetails).toHaveLength(c.findings.length);
    }
  });

  it("is a mid-range grade with a varied plan — not a clean A and not an F", () => {
    expect(["B", "C", "D"]).toContain(data.grade);
    const severities = new Set(data.categories.map((c: any) => c.severity).filter(Boolean));
    expect(severities.has("Moderate") || severities.has("Critical")).toBe(true);
    expect(severities.has("Minor")).toBe(true);
  });

  it("carries a neutral filename and identifies no one", () => {
    expect(data.filename).toBe("sample-evaluation-report.pdf");
    expect(data.pdfMetadata.author).toBeNull();
    // No author finding anywhere — top level or inside the scoring profiles.
    expect(raw).not.toMatch(/"Author: /);
    // No machine paths from the computer that generated it.
    expect(raw).not.toMatch(/\/Users\/|\/Volumes\/|\/private\/tmp/);
    // Not sealed: it was never an API response and cannot be shared as one.
    expect(data.seal).toBeUndefined();
  });

  it("stays a reasonable size for a lazily loaded chunk", () => {
    expect(raw.length).toBeLessThan(400_000);
  });

  it("still reads as a document with no title — so the plan has a real first step", () => {
    expect(currentDocMetadata(data.categories).title).toBeNull();
  });
});

describe("/sample-report", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    g.$fetch = fetchMock;
    g.useHead.mockClear();
  });

  async function mountPage() {
    // The page awaits its data in setup (so server and browser render the
    // same thing), which makes it an async component: it needs a <Suspense>
    // boundary, as Nuxt's page wrapper provides in the real app.
    const wrapper = mount(
      defineComponent({ render: () => h(Suspense, null, { default: () => h(SamplePage) }) }),
      { global: { stubs: { SourceDocumentNotice: true, AppTooltip: true } } },
    );
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="sample-banner"]').exists()).toBe(true),
    );
    await flushPromises();
    return wrapper;
  }

  it("says, before anything else, that this is a sample and not the visitor's document", async () => {
    const wrapper = await mountPage();
    const banner = wrapper.find('[data-testid="sample-banner"]');
    expect(banner.text()).toContain("Sample report — this is an example document, not yours.");
    const html = wrapper.html();
    expect(html.indexOf('data-testid="sample-banner"')).toBeLessThan(
      html.indexOf('data-testid="sample-report"'),
    );
    expect(wrapper.findAll("h1")).toHaveLength(1);
  });

  it("renders the real report: grade, score and the action plan", async () => {
    const wrapper = await mountPage();
    const text = wrapper.text();
    expect(text).toContain("sample-evaluation-report.pdf");
    expect(text).toContain(`${data.overallScore}`);
    expect(text).toContain("What to fix, in order");
    expect(text).toContain("Fix progress");
  });

  it("offers the way back to the upload, top and bottom", async () => {
    const wrapper = await mountPage();
    for (const id of ["sample-cta-top", "sample-cta-bottom"]) {
      const link = wrapper.find(`[data-testid="${id}"]`);
      expect(link.text()).toBe("Check your own document");
      expect(link.attributes("to")).toBe("/");
    }
  });

  it("makes no API call, and has no repair button and no share control", async () => {
    const wrapper = await mountPage();
    expect(fetchMock).not.toHaveBeenCalled();
    const text = wrapper.text();
    expect(text).not.toContain("Attempt remediation");
    expect(text).not.toContain("Create Shareable Link");
    const src = readFileSync(resolve(__dirname, "../pages/sample-report.vue"), "utf8");
    const template = src.slice(src.indexOf("<template>"));
    expect(template).not.toContain("RemediateButton");
    expect(template).not.toContain("ReportDownloadBar");
    expect(src).not.toMatch(/\$fetch|useFetch|useAsyncData/);
  });

  it("has a real title and description, and is not marked noindex", async () => {
    await mountPage();
    const head = g.useHead.mock.calls[0]![0];
    expect(head.title).toBe("Sample accessibility report");
    expect(head.meta[0].content.length).toBeGreaterThan(80);
    expect(JSON.stringify(head)).not.toContain("noindex");
  });

  it("loads the data lazily — it is not in the home page bundle", () => {
    const page = readFileSync(resolve(__dirname, "../pages/sample-report.vue"), "utf8");
    expect(page).toContain('import("~/data/sampleReport.json")');
    expect(page).not.toMatch(/^import .*sampleReport\.json/m);
    const home = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    expect(home).not.toContain("sampleReport");
    // …and the home page links to it beside the drop zone, without prefetch.
    expect(home).toMatch(/to="\/sample-report"\s+:prefetch="false"/);
    expect(home).toContain("See a sample report");
  });
});
