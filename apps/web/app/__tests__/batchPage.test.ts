/**
 * Page wiring for the larger batch (2026-11-24): the summary table appears
 * with the finished batch, a finished batch survives a reload, a reset
 * forgets it, and the batch uses the job endpoints when the deployment has
 * them.
 */
import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick, defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { usePrefill } from "../composables/usePrefill";
import { useReportExport } from "../composables/useReportExport";
import { useReportView } from "../composables/useReportView";
import IndexPage from "../pages/index.vue";
import DropZone from "../components/DropZone.vue";
import BatchSummaryTable from "../components/BatchSummaryTable.vue";

(globalThis as any).usePrefill = usePrefill;
(globalThis as any).useReportExport = useReportExport;
(globalThis as any).useReportView = useReportView;

const fetchMock = vi.fn();
const UButton = defineComponent({
  name: "UButton",
  inheritAttrs: false,
  setup(_p, { slots, attrs }) {
    return () => h("button", { type: "button", ...attrs }, slots.default?.());
  },
});
function mountIndex(resetSignal = ref(0)) {
  return mount(IndexPage, {
    shallow: true,
    attachTo: document.body,
    global: {
      provide: { resetSignal },
      components: { DropZone, UButton, BatchSummaryTable },
      stubs: { UButton: false, BatchSummaryTable: false, RemediateButton: true },
    },
  });
}
const file = (name: string) => new File(["x"], name, { type: "application/pdf" });
const report = (filename: string, score = 92, grade = "A") => ({
  filename,
  pageCount: 3,
  overallScore: score,
  grade,
  isScanned: false,
  executiveSummary: "Summary.",
  categories: [] as unknown[],
  fileType: "pdf",
  seal: "v1.abc",
});

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).$fetch = fetchMock;
  sessionStorage.clear();
});
afterEach(() => {
  document.body.innerHTML = "";
});

/** A deployment with no job endpoints: every file answers on /api/analyze. */
function syncDeployment(answers: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string, opts: { body?: FormData }) => {
    if (url === "/api/analyze-job") throw Object.assign(new Error("nf"), { status: 404 });
    if (url === "/api/analyze") {
      const name = (opts.body!.get("file") as File).name;
      const a = answers[name];
      if (a instanceof Error || (a && typeof a === "object" && "status" in (a as object))) throw a;
      return a;
    }
    return {};
  });
}

describe("index.vue — a finished batch", () => {
  it("shows the summary table, and its filename buttons switch the report", async () => {
    syncDeployment({
      "a.pdf": report("a.pdf", 55, "F"),
      "b.pdf": report("b.pdf", 95, "A"),
      "c.pdf": { status: 422, data: { error: "The file could not be read." } },
    });
    const wrapper = mountIndex();
    await wrapper
      .findComponent(DropZone)
      .vm.$emit("files-selected", [file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    await flushPromises();
    await nextTick();

    const table = wrapper.findComponent(BatchSummaryTable);
    expect(table.exists()).toBe(true);
    expect(table.findAll("tbody tr")).toHaveLength(3);
    expect(table.text()).toContain("The file could not be read.");
    expect(wrapper.find('[data-testid="results-heading"]').text()).toContain("a.pdf");

    await table.findAll('[data-testid="batch-summary-view"]')[1]!.trigger("click");
    expect(wrapper.find('[data-testid="results-heading"]').text()).toContain("b.pdf");
    wrapper.unmount();
  });

  it("survives a reload: the batch, and the report that was open, come back", async () => {
    syncDeployment({ "a.pdf": report("a.pdf"), "b.pdf": report("b.pdf") });
    const first = mountIndex();
    await first.findComponent(DropZone).vm.$emit("files-selected", [file("a.pdf"), file("b.pdf")]);
    await flushPromises();
    await first.findAll('[data-testid="batch-summary-view"]')[1]!.trigger("click");
    first.unmount();

    // "Reload": a new page instance over the same sessionStorage.
    const second = mountIndex();
    await flushPromises();
    await nextTick();
    expect(second.findComponent(BatchSummaryTable).findAll("tbody tr")).toHaveLength(2);
    expect(second.find('[data-testid="results-heading"]').text()).toContain("b.pdf");
    expect(second.find('[data-testid="batch-unsaved-note"]').exists()).toBe(false);
    second.unmount();
  });

  it("a reset forgets the stored batch", async () => {
    syncDeployment({ "a.pdf": report("a.pdf"), "b.pdf": report("b.pdf") });
    const resetSignal = ref(0);
    const first = mountIndex(resetSignal);
    await first.findComponent(DropZone).vm.$emit("files-selected", [file("a.pdf"), file("b.pdf")]);
    await flushPromises();
    resetSignal.value++;
    await flushPromises();
    first.unmount();

    const second = mountIndex();
    await flushPromises();
    expect(second.findComponent(BatchSummaryTable).exists()).toBe(false);
    expect(second.findComponent(DropZone).exists()).toBe(true);
    second.unmount();
  });

  it("warns before unload, in words too, when the batch could not be stored", async () => {
    syncDeployment({ "a.pdf": report("a.pdf"), "b.pdf": report("b.pdf") });
    const setItem = vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const added = vi.spyOn(window, "addEventListener");
    try {
      const wrapper = mountIndex();
      await wrapper
        .findComponent(DropZone)
        .vm.$emit("files-selected", [file("a.pdf"), file("b.pdf")]);
      await flushPromises();
      await nextTick();
      expect(wrapper.find('[data-testid="batch-unsaved-note"]').text()).toContain(
        "kept only while this page stays open",
      );
      expect(added.mock.calls.some((call) => String(call[0]) === "beforeunload")).toBe(true);
      wrapper.unmount();
    } finally {
      setItem.mockRestore();
      added.mockRestore();
    }
  });
});

describe("index.vue — batch files go through the job endpoints", () => {
  it("uploads to /api/analyze-job and polls for the answer", async () => {
    const posts: string[] = [];
    fetchMock.mockImplementation(async (url: string, opts: { body?: FormData }) => {
      if (url === "/api/analyze-job") {
        const name = (opts.body!.get("file") as File).name;
        posts.push(name);
        return { jobId: `job-${name}`, token: "tok" };
      }
      const m = /^\/api\/analyze-job\/job-(.+)$/.exec(url);
      if (m) return { done: true, steps: {}, result: report(m[1]!) };
      return {};
    });
    const wrapper = mountIndex();
    await wrapper
      .findComponent(DropZone)
      .vm.$emit("files-selected", [file("a.pdf"), file("b.pdf")]);
    // The poll waits a real second before it first asks.
    await vi.waitFor(() => expect(wrapper.findComponent(BatchSummaryTable).exists()).toBe(true), {
      timeout: 4000,
    });
    expect(posts.sort()).toEqual(["a.pdf", "b.pdf"]);
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/analyze")).toBe(false);
    expect(wrapper.findComponent(BatchSummaryTable).findAll("tbody tr")).toHaveLength(2);
    wrapper.unmount();
  });
});
