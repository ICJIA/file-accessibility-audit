import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * Links (2026-11-25). The site takes uploaded files only: the "check a
 * document by link" field is gone. What remains is `?prefill=`, the way
 * ICJIA's own tools hand a document over — run only for an approved host,
 * under the same abortable ownership as an upload, and removed from the
 * address so a reload does not run it again.
 */
import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { usePrefill } from "../composables/usePrefill";
import { useReportExport } from "../composables/useReportExport";
import { useReportView } from "../composables/useReportView";
import IndexPage from "../pages/index.vue";
import DropZone from "../components/DropZone.vue";
import {
  LINKS_NOT_ACCEPTED,
  describeUrlAuditError,
  isApprovedHost,
  queryWithoutPrefill,
  readPrefillParam,
} from "../utils/urlAudit";

(globalThis as any).usePrefill = usePrefill;
(globalThis as any).useReportExport = useReportExport;
(globalThis as any).useReportView = useReportView;

describe("the link field is gone", () => {
  it("the home page has no field for typing an address, and no component for one", () => {
    const index = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    expect(index).not.toContain("UrlAuditForm");
    expect(index).not.toMatch(/type="url"/);
    expect(index).not.toMatch(/check a document by link/i);
    expect(existsSync(resolve(__dirname, "../components/UrlAuditForm.vue"))).toBe(false);
  });
});

describe("isApprovedHost", () => {
  it("matches the approved list and nothing that merely resembles it", () => {
    expect(isApprovedHost("https://icjia.illinois.gov/a.pdf")).toBe(true);
    expect(isApprovedHost("https://illinois.gov/a.pdf")).toBe(true);
    for (const url of [
      "https://example.com/a.pdf",
      "https://illinois.gov.example.com/a.pdf",
      "https://notillinois.gov/a.pdf",
      "https://illinois.gov:8443/a.pdf",
      "http://illinois.gov/a.pdf",
      "https://user:pw@illinois.gov/a.pdf",
      "ftp://illinois.gov/a.pdf",
      "javascript:alert(1)",
      "not a url",
      "",
    ]) {
      expect(isApprovedHost(url), url).toBe(false);
    }
  });
});

describe("describeUrlAuditError", () => {
  it("a server refusal of the address reads as 'upload the file'", () => {
    for (const error of ["URL not allowed", "URL resolves to a private/reserved address"]) {
      const out = describeUrlAuditError({ statusCode: 400, data: { error, details: "host x" } });
      expect(out).toEqual({ ...LINKS_NOT_ACCEPTED });
      expect(JSON.stringify(out)).not.toContain("host x");
    }
  });

  it("passes every other failure to the ordinary describer", () => {
    const out = describeUrlAuditError({ statusCode: 413, data: { error: "too big" } });
    expect(out).not.toEqual({ ...LINKS_NOT_ACCEPTED });
    expect(out.error).toBe("too big");
  });
});

describe("readPrefillParam / queryWithoutPrefill", () => {
  it("reads nothing when the param is absent", () => {
    expect(readPrefillParam("?x=1")).toEqual({ kind: "none" });
  });

  it("reads an encoded address", () => {
    expect(readPrefillParam("?prefill=https%3A%2F%2Fexample.gov%2Fa.pdf")).toEqual({
      kind: "url",
      url: "https://example.gov/a.pdf",
    });
  });

  it("reports an address that cannot be decoded", () => {
    expect(readPrefillParam("?prefill=%25E0%25A4%25A")).toEqual({ kind: "invalid" });
  });

  it("drops only the prefill param", () => {
    expect(queryWithoutPrefill("?prefill=https%3A%2F%2Fa.gov&x=1&y=2")).toEqual({ x: "1", y: "2" });
  });
});

// ---------------------------------------------------------------------------
// The page: a prefilled link is owned and abortable like an upload.
// ---------------------------------------------------------------------------
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
      components: { DropZone, UButton },
      stubs: {
        UButton: false,
        ProcessingOverlay: true,
        AnnouncementBanner: true,
        RemediateButton: true,
        LazyTechnicalExplainer: true,
      },
    },
  });
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

function deferredUrlAudit() {
  const calls: Array<{
    url: string;
    signal?: AbortSignal;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }> = [];
  fetchMock.mockImplementation(
    (path: string, opts: { body?: { url: string }; signal?: AbortSignal }) => {
      if (path !== "/api/analyze-url") return Promise.resolve({});
      return new Promise((resolve, reject) => {
        calls.push({ url: opts.body!.url, signal: opts.signal, resolve, reject });
      });
    },
  );
  return calls;
}

const replace = vi.fn(() => Promise.resolve());
beforeEach(() => {
  fetchMock.mockReset();
  replace.mockClear();
  (globalThis as any).$fetch = fetchMock;
  (globalThis as any).useRouter = () => ({ replace, push: () => Promise.resolve() });
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  document.body.innerHTML = "";
  delete (globalThis as any).useRouter;
  window.history.replaceState({}, "", "/");
});

describe("index.vue — ?prefill= for an approved host", () => {
  it("removes the param from the address and audits the link under an abortable run", async () => {
    window.history.replaceState({}, "", "/?prefill=https%3A%2F%2Ficjia.illinois.gov%2Fa.pdf&x=1");
    const resetSignal = ref(0);
    const calls = deferredUrlAudit();
    const wrapper = mountIndex(resetSignal);
    await flushPromises();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith({ path: "/", query: { x: "1" } });
    expect(calls.map((c) => c.url)).toEqual(["https://icjia.illinois.gov/a.pdf"]);

    // Reset mid-request: overlay gone, request aborted, answer ignored.
    resetSignal.value++;
    await flushPromises();
    expect(calls[0]!.signal!.aborted).toBe(true);
    expect(wrapper.findComponent({ name: "ProcessingOverlay" }).exists()).toBe(false);
    calls[0]!.resolve(report());
    await flushPromises();
    expect(wrapper.find('[data-testid="results-heading"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows the report when the audit answers", async () => {
    window.history.replaceState({}, "", "/?prefill=https%3A%2F%2Ficjia.illinois.gov%2Fa.pdf");
    const calls = deferredUrlAudit();
    const wrapper = mountIndex();
    await flushPromises();
    calls[0]!.resolve(report());
    await flushPromises();
    expect(wrapper.find("[data-report-content]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("a late FAILURE after a reset shows no error either", async () => {
    window.history.replaceState({}, "", "/?prefill=https%3A%2F%2Ficjia.illinois.gov%2Fa.pdf");
    const resetSignal = ref(0);
    const calls = deferredUrlAudit();
    const wrapper = mountIndex(resetSignal);
    await flushPromises();
    resetSignal.value++;
    await flushPromises();
    calls[0]!.reject({ statusCode: 502, data: { error: "Fetch failed" } });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("index.vue — ?prefill= for any other site", () => {
  it("sends NOTHING to the server and says to upload the file", async () => {
    for (const target of [
      "https%3A%2F%2Fexample.com%2Fa.pdf",
      "https%3A%2F%2Fillinois.gov.example.com%2Fa.pdf",
      "http%3A%2F%2F127.0.0.1%2Fa.pdf",
      "javascript%3Aalert(1)",
    ]) {
      window.history.replaceState({}, "", `/?prefill=${target}`);
      fetchMock.mockReset();
      const calls = deferredUrlAudit();
      const wrapper = mountIndex();
      await flushPromises();

      expect(calls, target).toHaveLength(0);
      expect(
        fetchMock.mock.calls.some((c) => c[0] === "/api/analyze-url"),
        target,
      ).toBe(false);
      expect(wrapper.text(), target).toContain(LINKS_NOT_ACCEPTED.error);
      // The address is never put on the page.
      expect(wrapper.html(), target).not.toContain("example.com");
      expect(wrapper.html(), target).not.toContain("alert(1)");
      wrapper.unmount();
      document.body.innerHTML = "";
    }
  });

  it("does nothing, and replaces nothing, without the param", async () => {
    const calls = deferredUrlAudit();
    const wrapper = mountIndex();
    await flushPromises();
    expect(replace).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    wrapper.unmount();
  });
});
