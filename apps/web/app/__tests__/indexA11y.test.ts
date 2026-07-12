import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { usePrefill } from "../composables/usePrefill";
import { useReportExport } from "../composables/useReportExport";
import IndexPage from "../pages/index.vue";
import DropZone from "../components/DropZone.vue";

// index.vue calls usePrefill()/useReportExport() as bare identifiers,
// relying on Nuxt's build-time auto-import (composables/ files need no
// explicit import in the real app). test-helpers.ts stubs the handful of
// Nuxt globals every test needs; these two are real, working composables
// this specific test additionally needs resolvable on `globalThis` to
// mount the page at all.
(globalThis as any).usePrefill = usePrefill;
(globalThis as any).useReportExport = useReportExport;

// ---------------------------------------------------------------------------
// pages/index.vue a11y (Task F6): the single-file error banner gets
// role="alert", and a successful single-file analysis moves focus to a
// dedicated (visually-hidden) results heading so screen-reader / keyboard
// users land somewhere meaningful instead of on the now-hidden drop zone.
//
// index.vue renders several components (DropZone, ProcessingOverlay,
// BatchProgress, AnnouncementBanner, RemediateButton, SourceDocumentNotice,
// ScoreCard, AppTooltip) the Nuxt-auto-import way — used in the template
// with no explicit <script setup> import, resolved at runtime by Nuxt's
// build step. Plain vitest has no such step, so they must be registered
// explicitly here: DropZone as the real component (its emitted
// `file-selected` event is what drives analyzeFile()), the rest as stubs
// (their internals aren't this test's concern). The already-imported
// components (ReportActionBanner, ReportDownloadBar, ...) are handled by
// `shallow: true`.
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();

function makeFile(name = "test.pdf"): File {
  return new File(["dummy content"], name, { type: "application/pdf" });
}

function mountIndex(options: { attachTo?: HTMLElement } = {}) {
  return mount(IndexPage, {
    shallow: true,
    attachTo: options.attachTo,
    global: {
      // resetSignal is an optional inject() the page reads defensively
      // (resetSignal?.value); providing it just quiets the harmless
      // "injection not found" warning in test output.
      provide: { resetSignal: ref(0) },
      components: { DropZone },
      stubs: {
        ProcessingOverlay: true,
        BatchProgress: true,
        AnnouncementBanner: true,
        RemediateButton: true,
        SourceDocumentNotice: true,
        ScoreCard: true,
        ReportContent: true,
        AppTooltip: true,
        LazyTechnicalExplainer: true,
      },
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  (globalThis as any).$fetch = fetchMock;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("index.vue — single-file error banner (Task F6)", () => {
  it('renders the analysis-failed banner with role="alert"', async () => {
    fetchMock.mockRejectedValue({
      status: 422,
      data: { error: "This file could not be analyzed." },
    });
    const wrapper = mountIndex();

    await wrapper.findComponent(DropZone).vm.$emit("file-selected", makeFile());
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain("This file could not be analyzed.");
  });
});

describe("index.vue — post-analysis focus management (Task F6)", () => {
  it("provides a focusable results heading once a single-file analysis succeeds", async () => {
    fetchMock.mockResolvedValue({
      filename: "test.pdf",
      pageCount: 3,
      overallScore: 92,
      grade: "A",
      isScanned: false,
      executiveSummary: "Looks good.",
      categories: [],
      fileType: "pdf",
    });
    const wrapper = mountIndex({ attachTo: document.body });

    await wrapper.findComponent(DropZone).vm.$emit("file-selected", makeFile());
    await vi.advanceTimersByTimeAsync(300); // the "Brief pause for UX" setTimeout
    await flushPromises();

    const heading = wrapper.find('[data-testid="results-heading"]');
    expect(heading.exists()).toBe(true);
    expect(heading.attributes("tabindex")).toBe("-1");

    wrapper.unmount();
  });

  it("moves DOM focus to the results heading after a successful single-file analysis", async () => {
    fetchMock.mockResolvedValue({
      filename: "test.pdf",
      pageCount: 3,
      overallScore: 92,
      grade: "A",
      isScanned: false,
      executiveSummary: "Looks good.",
      categories: [],
      fileType: "pdf",
    });
    const wrapper = mountIndex({ attachTo: document.body });

    await wrapper.findComponent(DropZone).vm.$emit("file-selected", makeFile());
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0); // let the nextTick()-scheduled focus() run

    const heading = wrapper.find('[data-testid="results-heading"]');
    expect(document.activeElement).toBe(heading.element);

    wrapper.unmount();
  });
});
