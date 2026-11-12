import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick, defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { usePrefill } from "../composables/usePrefill";
import { useReportExport } from "../composables/useReportExport";
import { useReportView } from "../composables/useReportView";
import IndexPage from "../pages/index.vue";
import DropZone from "../components/DropZone.vue";
import BatchProgress from "../components/BatchProgress.vue";
import BatchFileSwitcher from "../components/BatchFileSwitcher.vue";

(globalThis as any).usePrefill = usePrefill;
(globalThis as any).useReportExport = useReportExport;
(globalThis as any).useReportView = useReportView;

// ---------------------------------------------------------------------------
// Review 2026-11-12 — page-level wiring for findings 2, 3, 7, 8, 9 and 11.
// The logic has its own unit tests (batchRun, analyzeJobRetry,
// publicationStatus, shareReport); these mount the page and drive it, because
// every one of these defects lived in how the page used that logic.
// ---------------------------------------------------------------------------

const fetchMock = vi.fn();

// A real <button>, so focus and clicks behave as they do under Nuxt UI.
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
      components: { DropZone, UButton, BatchProgress },
      stubs: {
        UButton: false,
        BatchProgress: false,
        ProcessingOverlay: true,
        AnnouncementBanner: true,
        RemediateButton: true,
        SourceDocumentNotice: true,
        ScoreCard: true,
        PdfUaVerdict: true,
        ReportContent: true,
        AppTooltip: true,
        LazyTechnicalExplainer: true,
      },
    },
  });
}

function file(name: string): File {
  return new File(["x"], name, { type: "application/pdf" });
}

function report(over: Record<string, unknown> = {}) {
  return {
    filename: "a.pdf",
    pageCount: 3,
    overallScore: 92,
    grade: "A",
    isScanned: false,
    executiveSummary: "Summary.",
    categories: [] as unknown[],
    fileType: "pdf",
    seal: "v1.abc123",
    ...over,
  };
}

/** Every /api/analyze call waits here until the test settles it. */
function deferredAnalyze() {
  const calls: Array<{
    name: string;
    signal?: AbortSignal;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }> = [];
  fetchMock.mockImplementation((url: string, opts: { body?: FormData; signal?: AbortSignal }) => {
    if (url !== "/api/analyze") return Promise.resolve({});
    const name = (opts.body!.get("file") as File).name;
    return new Promise((resolve, reject) => {
      calls.push({ name, signal: opts.signal, resolve, reject });
    });
  });
  return calls;
}

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).$fetch = fetchMock;
  try {
    sessionStorage.clear();
  } catch {
    /* not available */
  }
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("index.vue — a reset mid-batch (finding 2)", () => {
  it("the old run's tail never touches the new batch, and Cancel still works", async () => {
    const resetSignal = ref(0);
    const calls = deferredAnalyze();
    const wrapper = mountIndex(resetSignal);

    // Batch A: three files, two in flight.
    await wrapper
      .findComponent(DropZone)
      .vm.$emit("files-selected", [file("a0.pdf"), file("a1.pdf"), file("a2.pdf")]);
    await flushPromises();
    expect(calls.map((c) => c.name)).toEqual(["a0.pdf", "a1.pdf"]);

    // Reset while A is running: its requests are aborted.
    resetSignal.value++;
    await flushPromises();
    expect(calls[0]!.signal!.aborted).toBe(true);
    expect(wrapper.findComponent(DropZone).exists()).toBe(true);

    // Batch B starts before A's requests have come back.
    await wrapper
      .findComponent(DropZone)
      .vm.$emit("files-selected", [file("b0.pdf"), file("b1.pdf"), file("b2.pdf")]);
    await flushPromises();

    // A's tail arrives now.
    calls[0]!.reject(new Error("aborted"));
    calls[1]!.reject(new Error("aborted"));
    await flushPromises();

    // B is still running, on its own three items, nothing cancelled, and no
    // old worker picked up one of its files.
    const progress = wrapper.findComponent(BatchProgress);
    expect(progress.exists()).toBe(true);
    const items = progress.props("items") as Array<{
      filename: string;
      status: string;
      file: unknown;
    }>;
    expect(items.map((i) => `${i.filename}:${i.status}`)).toEqual([
      "b0.pdf:processing",
      "b1.pdf:processing",
      "b2.pdf:queued",
    ]);
    expect(items[2]!.file).not.toBeNull();
    expect(calls.map((c) => c.name)).toEqual(["a0.pdf", "a1.pdf", "b0.pdf", "b1.pdf"]);

    // Finding 8a/8b: progress is a polite live region, and no state is an
    // icon alone.
    const status = progress.find('[data-testid="batch-status"]');
    expect(status.attributes("role")).toBe("status");
    expect(status.attributes("aria-live")).toBe("polite");
    expect(status.text()).toContain("0 of 3 complete");
    expect(progress.text()).toContain("Analyzing…");
    expect(progress.text()).toContain("Waiting");

    // Cancel acts on B's own controller.
    progress.vm.$emit("cancel");
    await flushPromises();
    expect(calls[2]!.signal!.aborted).toBe(true);
    expect(calls[3]!.signal!.aborted).toBe(true);
    wrapper.unmount();
  });
});

describe("index.vue — batch completion (finding 8a)", () => {
  it("moves focus to a heading that says how the batch ended", async () => {
    const calls = deferredAnalyze();
    const wrapper = mountIndex();
    await wrapper
      .findComponent(DropZone)
      .vm.$emit("files-selected", [file("a0.pdf"), file("a1.pdf")]);
    await flushPromises();
    calls[0]!.resolve(report({ filename: "a0.pdf" }));
    calls[1]!.reject({ status: 502, data: "<html>Bad Gateway</html>" });
    await flushPromises();
    await nextTick();

    const heading = wrapper.find('[data-testid="batch-done-heading"]');
    expect(heading.text()).toBe("Batch finished: 1 of 2 files analyzed, 1 could not be analyzed.");
    expect(document.activeElement).toBe(heading.element);

    // The failed file's tab carries a real message, not an empty box.
    const switcher = wrapper.findComponent(BatchFileSwitcher);
    const items = switcher.props("items") as unknown as Array<{
      error: { error: string } | null;
    }>;
    expect(items[1]!.error!.error).toBe("The audit service is not responding right now.");
    wrapper.unmount();
  });
});

describe("index.vue — a failed audit always says something (finding 3)", () => {
  it("an HTML 502 body still produces a message and a next step", async () => {
    fetchMock.mockRejectedValue({ status: 502, data: "<html><h1>502 Bad Gateway</h1></html>" });
    const wrapper = mountIndex();
    await wrapper.findComponent(DropZone).vm.$emit("file-selected", file("a.pdf"));
    await flushPromises();
    const alert = wrapper.find('[role="alert"]');
    expect(alert.find("h3").text()).toBe("The audit service is not responding right now.");
    expect(alert.find("p").text()).toMatch(/Wait a minute, then try again/);
    wrapper.unmount();
  });
});

async function analyzeSingle(wrapper: ReturnType<typeof mountIndex>, result: unknown) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/analyze-job") throw Object.assign(new Error("nf"), { status: 404 });
    if (url === "/api/analyze") return result;
    return {};
  });
  await wrapper.findComponent(DropZone).vm.$emit("file-selected", file("a.pdf"));
  await flushPromises();
  await nextTick();
}

describe("index.vue — AI analysis panel (finding 7)", () => {
  const minorCat = {
    id: "alt_text",
    label: "Alt Text on Images",
    score: 95,
    grade: null,
    severity: "Minor",
    findings: ["1 of 20 images has no alt text"],
  };
  const failing = {
    status: "fail",
    headline: "Does not meet WCAG 2.1 Level AA.",
    notAssessed: [],
    failures: [
      {
        sc: "1.1.1",
        name: "Non-text Content",
        level: "A",
        category: "alt_text",
        issue: "x",
        url: "",
      },
    ],
  };

  it("is shown for a Minor category that carries a confirmed WCAG failure", async () => {
    const wrapper = mountIndex();
    await analyzeSingle(wrapper, report({ categories: [minorCat], conformance: failing }));
    const panel = wrapper.find('[data-testid="ai-analysis-panel"]');
    expect(panel.exists()).toBe(true);
    expect((panel.find("textarea").element as HTMLTextAreaElement).value).toContain(
      "Failing categories (1 to fix)",
    );
    wrapper.unmount();
  });

  it("stays hidden when nothing is failing", async () => {
    const wrapper = mountIndex();
    await analyzeSingle(
      wrapper,
      report({
        categories: [minorCat],
        conformance: {
          status: "no-automated-failures",
          headline: "",
          failures: [],
          notAssessed: [],
        },
      }),
    );
    expect(wrapper.find('[data-testid="ai-analysis-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

function button(wrapper: ReturnType<typeof mountIndex>, label: string) {
  return wrapper.findAll("button").find((b) => b.text().includes(label))!;
}

describe("index.vue — share row (findings 8d, 8e, 9, 11)", () => {
  it("posts the result exactly as received, seal included, then focuses the labelled link field", async () => {
    const wrapper = mountIndex();
    const received = report({
      fileType: "docx",
      filename: "plan.docx",
      categories: [{ id: "alt_text", label: "Alt", score: 95, severity: "Minor", findings: ["f"] }],
      conformance: { status: "no-automated-failures", headline: "", failures: [], notAssessed: [] },
    });
    await analyzeSingle(wrapper, received);

    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/reports" ? { id: "rid-1" } : {},
    );
    await button(wrapper, "Create Shareable Link").trigger("click");
    await flushPromises();
    await nextTick();

    const post = fetchMock.mock.calls.find((c) => c[0] === "/api/reports")!;
    expect(post[1].method).toBe("POST");
    // Byte-for-byte what the API issued: nothing regraded, trimmed or added.
    expect(JSON.parse(JSON.stringify(post[1].body))).toEqual({ report: received });
    expect(post[1].body.report.seal).toBe("v1.abc123");

    const input = wrapper.find('[data-testid="share-url"]');
    expect(input.attributes("aria-label")).toBe("Shareable report link");
    expect((input.element as HTMLInputElement).value).toBe(
      "https://audit.example.test/report/rid-1",
    );
    expect(document.activeElement).toBe(input.element);

    // The email names the right document type.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await button(wrapper, "Email Link").trigger("click");
    const mailto = decodeURIComponent(String(open.mock.calls[0]![0]));
    expect(mailto).toContain("subject=Word Accessibility Report: plan.docx");
    expect(mailto).not.toContain("PDF Accessibility Report");
    open.mockRestore();

    // Dismiss removes the field that had focus; focus goes back to Create.
    await button(wrapper, "Dismiss").trigger("click");
    await flushPromises();
    await nextTick();
    expect(document.activeElement).toBe(button(wrapper, "Create Shareable Link").element);
    wrapper.unmount();
  });

  it("announces a refused seal with the server's message and a next step", async () => {
    const wrapper = mountIndex();
    await analyzeSingle(wrapper, report({ seal: undefined }));
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/reports") {
        throw {
          status: 400,
          data: {
            error:
              "This report could not be verified — run the audit again and share the new result.",
          },
        };
      }
      return {};
    });
    await button(wrapper, "Create Shareable Link").trigger("click");
    await flushPromises();
    const err = wrapper.find('[data-testid="share-error"]');
    expect(err.attributes("role")).toBe("alert");
    expect(err.text()).toBe(
      "This report could not be verified — run the audit again and share the new result.",
    );
    wrapper.unmount();
  });

  it("a link requested for one batch tab never appears under another", async () => {
    const calls = deferredAnalyze();
    const wrapper = mountIndex();
    await wrapper
      .findComponent(DropZone)
      .vm.$emit("files-selected", [file("a.pdf"), file("b.pdf")]);
    await flushPromises();
    calls[0]!.resolve(report({ filename: "a.pdf" }));
    calls[1]!.resolve(report({ filename: "b.pdf", overallScore: 40, grade: "F" }));
    await flushPromises();

    let answerShare!: (v: { id: string }) => void;
    fetchMock.mockImplementation((url: string) =>
      url === "/api/reports"
        ? new Promise((resolve) => (answerShare = resolve))
        : Promise.resolve({}),
    );
    // Share tab A, switch to B before the answer arrives.
    await button(wrapper, "Create Shareable Link").trigger("click");
    wrapper.findComponent(BatchFileSwitcher).vm.$emit("switch", 1);
    await flushPromises();
    answerShare({ id: "for-a" });
    await flushPromises();

    expect(wrapper.find('[data-testid="results-heading"]').text()).toContain("b.pdf");
    expect(wrapper.find('[data-testid="share-url"]').exists()).toBe(false);
    expect(button(wrapper, "Create Shareable Link")).toBeTruthy();
    wrapper.unmount();
  });
});

describe("index.vue — follow-up (G, H, I, J)", () => {
  it("G: a link that arrives after the reader moved on does not pull focus", async () => {
    const wrapper = mountIndex();
    await analyzeSingle(wrapper, report());
    let answerShare!: (v: { id: string }) => void;
    fetchMock.mockImplementation((url: string) =>
      url === "/api/reports"
        ? new Promise((resolve) => (answerShare = resolve))
        : Promise.resolve({}),
    );
    const create = button(wrapper, "Create Shareable Link");
    (create.element as HTMLElement).focus();
    await create.trigger("click");
    // The reader tabs away to the AI preview while the request is out.
    const elsewhere = button(wrapper, "Analyze More Files").element as HTMLElement;
    elsewhere.focus();
    answerShare({ id: "late" });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="share-url"]').exists()).toBe(true);
    expect(document.activeElement).toBe(elsewhere);
    wrapper.unmount();
  });

  it("H: a batch that ends on a failed file is announced once", async () => {
    const calls = deferredAnalyze();
    const wrapper = mountIndex();
    await wrapper
      .findComponent(DropZone)
      .vm.$emit("files-selected", [file("a0.pdf"), file("a1.pdf")]);
    await flushPromises();
    calls[0]!.reject({ status: 500 });
    calls[1]!.reject({ status: 500 });
    await flushPromises();
    await nextTick();

    const heading = wrapper.find('[data-testid="batch-done-heading"]');
    expect(document.activeElement).toBe(heading.element);
    expect(heading.text()).toBe("Batch finished: 0 of 2 files analyzed, 2 could not be analyzed.");
    const tabError = wrapper.find('[data-testid="batch-tab-error"]');
    expect(tabError.exists()).toBe(true);
    expect(tabError.attributes("role")).toBeUndefined();
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0);

    // Choosing a failed tab afterwards IS announced.
    wrapper.findComponent(BatchFileSwitcher).vm.$emit("switch", 1);
    await nextTick();
    expect(wrapper.find('[data-testid="batch-tab-error"]').attributes("role")).toBe("alert");
    wrapper.unmount();
  });

  it("I: reset during a single-file audit aborts it, and its late answer writes nothing", async () => {
    const resetSignal = ref(0);
    let answer!: (v: unknown) => void;
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((url: string, opts: { signal?: AbortSignal }) => {
      if (url === "/api/analyze-job") {
        return Promise.reject(Object.assign(new Error("nf"), { status: 404 }));
      }
      if (url === "/api/analyze") {
        signal = opts.signal;
        return new Promise((resolve) => (answer = resolve));
      }
      return Promise.resolve({});
    });
    const wrapper = mountIndex(resetSignal);
    await wrapper.findComponent(DropZone).vm.$emit("file-selected", file("a.pdf"));
    await flushPromises();
    expect(wrapper.findComponent(DropZone).exists()).toBe(false); // overlay is up

    resetSignal.value++;
    await flushPromises();
    expect(signal!.aborted).toBe(true);
    expect(wrapper.findComponent(DropZone).exists()).toBe(true); // idle at once

    answer(report({ filename: "a.pdf" })); // the stale run's answer
    await flushPromises();
    await nextTick();
    expect(wrapper.find('[data-testid="results-heading"]').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findComponent(DropZone).exists()).toBe(true);
    wrapper.unmount();
  });

  it("J: losing contact keeps the session a reload needs, and says so", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/analyze-job") return { jobId: "job-9", token: "tok-9" };
      throw Object.assign(new Error("bad gateway"), { status: 502 });
    });
    const wrapper = mountIndex();
    await wrapper.findComponent(DropZone).vm.$emit("file-selected", file("a.pdf"));
    await vi.advanceTimersByTimeAsync(120_000);
    await flushPromises();
    vi.useRealTimers();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.find("h3").text()).toBe("We lost contact with the audit service.");
    expect(alert.find("p").text()).toContain(
      "reload this page — it will pick the audit back up if it has finished",
    );
    const stored = JSON.parse(sessionStorage.getItem("fa:audit-session:v1") ?? "null");
    expect(stored).toMatchObject({ kind: "running", jobId: "job-9", token: "tok-9" });
    wrapper.unmount();
  });

  it("J: a real terminal failure still clears the session", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/analyze-job") return { jobId: "job-9", token: "tok-9" };
      throw Object.assign(new Error("forbidden"), { status: 403 });
    });
    vi.useFakeTimers();
    const wrapper = mountIndex();
    await wrapper.findComponent(DropZone).vm.$emit("file-selected", file("a.pdf"));
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    vi.useRealTimers();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(sessionStorage.getItem("fa:audit-session:v1")).toBeNull();
    wrapper.unmount();
  });
});
