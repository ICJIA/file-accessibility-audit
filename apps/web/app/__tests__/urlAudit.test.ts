import { readFileSync } from "node:fs";
import { resolve } from "node:path";
/**
 * Checking a document by link (2026-11-24): the visible URL field, the
 * plain-language refusal for a site that is not approved, and the prefill
 * run-ownership fixes — a reset mid-request really resets, and ?prefill= is
 * removed from the address so a reload does not run it again.
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
import UrlAuditForm from "../components/UrlAuditForm.vue";
import {
  DOCUMENT_URL_MAX_LENGTH,
  URL_HOST_NOT_APPROVED,
  describeUrlAuditError,
  queryWithoutPrefill,
  readPrefillParam,
  validateDocumentUrl,
} from "../utils/urlAudit";

(globalThis as any).usePrefill = usePrefill;
(globalThis as any).useReportExport = useReportExport;
(globalThis as any).useReportView = useReportView;

describe("validateDocumentUrl", () => {
  it("accepts an https address and trims it", () => {
    expect(validateDocumentUrl("  https://icjia.illinois.gov/a/report.pdf  ")).toEqual({
      ok: true,
      url: "https://icjia.illinois.gov/a/report.pdf",
    });
  });

  it("does not require a file extension — the server reads the file itself", () => {
    expect(validateDocumentUrl("https://example.gov/download?id=42").ok).toBe(true);
  });

  it.each([
    ["", /starting with https/],
    ["   ", /starting with https/],
    ["report.pdf", /does not look like a web address/],
    ["http://example.gov/a.pdf", /must start with https/],
    ["ftp://example.gov/a.pdf", /must start with https/],
    ["javascript:alert(1)", /must start with https/],
    ["https://localhost/a.pdf", /public web address/],
    ["https://user:pw@example.gov/a.pdf", /public web address/],
    ["https://example.gov/a b.pdf", /cannot contain spaces/],
  ])("refuses %j with a sentence a person can act on", (input, pattern) => {
    const r = validateDocumentUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(pattern);
  });

  it("refuses an address past the length limit", () => {
    const r = validateDocumentUrl(`https://example.gov/${"a".repeat(DOCUMENT_URL_MAX_LENGTH)}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/too long/);
  });

  it("refuses a non-string", () => {
    expect(validateDocumentUrl(undefined).ok).toBe(false);
  });
});

describe("describeUrlAuditError", () => {
  it("names the hourly link limit and the way round it, not 'wait a minute'", () => {
    const out = describeUrlAuditError({
      statusCode: 429,
      data: {
        error: "Link check limit reached. Please try again later, or upload the file instead.",
      },
    });
    expect(out.error).toMatch(/this hour's limit/);
    expect(out.details).toMatch(/Uploading has no such limit/);
    expect(out.details).not.toMatch(/minute/);
  });

  it("the link field no longer says the site has to be a government one", () => {
    const form = readFileSync(resolve(__dirname, "../components/UrlAuditForm.vue"), "utf8");
    expect(form).toContain("on any public website");
    expect(form).not.toMatch(/approved government site/);
  });

  it("explains a host that is not approved, and that uploading always works", () => {
    // The API's real body (services/urlPolicy.ts).
    const out = describeUrlAuditError({
      status: 400,
      data: {
        error: "URL not allowed",
        details: "host 'example.com' is not in the allowlist. Allowed: icjia.illinois.gov",
      },
    });
    expect(out).toEqual({ ...URL_HOST_NOT_APPROVED });
    expect(out.details).toContain("Uploading the file always works");
    expect(out.details).toContain("Uploading the file always works");
    // The server's list of hosts is not echoed at the visitor.
    expect(JSON.stringify(out)).not.toContain("allowlist");
  });

  it("keeps another refusal reason from reading as 'allowlist'", () => {
    const out = describeUrlAuditError({
      data: {
        error: "URL not allowed",
        details: "private/local address '10.0.0.1' is not allowed",
      },
    });
    expect(out.error).toBe("That address cannot be checked by link.");
    expect(out.details).toContain("Uploading the file always works");
  });

  it("passes every other failure to the ordinary describer", () => {
    expect(describeUrlAuditError({ status: 503, data: "<html>" }).error).toBe(
      "The audit service is not responding right now.",
    );
    expect(
      describeUrlAuditError({ data: { error: "The fetched Word document could not be read." } })
        .error,
    ).toBe("The fetched Word document could not be read.");
  });
});

describe("readPrefillParam / queryWithoutPrefill", () => {
  it("reads nothing when the param is absent", () => {
    expect(readPrefillParam("")).toEqual({ kind: "none" });
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
    expect(queryWithoutPrefill("?prefill=https%3A%2F%2Fa.gov%2Fb.pdf&view=detailed")).toEqual({
      view: "detailed",
    });
  });
});

describe("UrlAuditForm", () => {
  it("has a visible label tied to the field and a real submit button", () => {
    const w = mount(UrlAuditForm);
    const input = w.find('[data-testid="url-audit-input"]');
    const label = w.find("label");
    expect(label.text()).toContain("or check a document by link");
    expect(label.attributes("for")).toBe(input.attributes("id"));
    expect(input.attributes("type")).toBe("url");
    expect(w.find('[data-testid="url-audit-submit"]').attributes("type")).toBe("submit");
  });

  it("emits the cleaned address on submit", async () => {
    const w = mount(UrlAuditForm);
    await w.find('[data-testid="url-audit-input"]').setValue(" https://example.gov/a.pdf ");
    await w.find("form").trigger("submit");
    expect(w.emitted("submit")).toEqual([["https://example.gov/a.pdf"]]);
    expect(w.find('[data-testid="url-audit-error"]').exists()).toBe(false);
  });

  it("refuses a bad address with an announced message tied to the field", async () => {
    const w = mount(UrlAuditForm);
    const input = w.find('[data-testid="url-audit-input"]');
    await input.setValue("http://example.gov/a.pdf");
    await w.find("form").trigger("submit");
    expect(w.emitted("submit")).toBeUndefined();
    const err = w.find('[data-testid="url-audit-error"]');
    expect(err.attributes("role")).toBe("alert");
    expect(err.text()).toMatch(/must start with https/);
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.attributes("aria-describedby")).toContain(err.attributes("id"));
  });
});

// ---------------------------------------------------------------------------
// The page: link runs are owned and abortable like uploads.
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
      components: { DropZone, UButton, UrlAuditForm },
      stubs: {
        UButton: false,
        UrlAuditForm: false,
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

async function submitLink(wrapper: ReturnType<typeof mountIndex>, url: string) {
  wrapper.findComponent(UrlAuditForm).vm.$emit("submit", url);
  await flushPromises();
}

describe("index.vue — checking a document by link", () => {
  it("shows the link field beside the drop zone", () => {
    const wrapper = mountIndex();
    expect(wrapper.findComponent(DropZone).exists()).toBe(true);
    expect(wrapper.findComponent(UrlAuditForm).exists()).toBe(true);
    wrapper.unmount();
  });

  it("posts the address with an abort signal and shows the report", async () => {
    const calls = deferredUrlAudit();
    const wrapper = mountIndex();
    await submitLink(wrapper, "https://example.gov/a.pdf");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://example.gov/a.pdf");
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(wrapper.findComponent({ name: "ProcessingOverlay" }).exists()).toBe(true);

    calls[0]!.resolve(report({ filename: "a.pdf" }));
    await flushPromises();
    expect(wrapper.find('[data-testid="results-heading"]').text()).toContain("a.pdf");
    wrapper.unmount();
  });

  it("a reset mid-request aborts it, takes the overlay down, and the late answer never lands", async () => {
    const resetSignal = ref(0);
    const calls = deferredUrlAudit();
    const wrapper = mountIndex(resetSignal);
    await submitLink(wrapper, "https://example.gov/a.pdf");
    expect(wrapper.findComponent({ name: "ProcessingOverlay" }).exists()).toBe(true);

    resetSignal.value++;
    await flushPromises();
    expect(calls[0]!.signal!.aborted).toBe(true);
    expect(wrapper.findComponent({ name: "ProcessingOverlay" }).exists()).toBe(false);
    expect(wrapper.findComponent(DropZone).exists()).toBe(true);

    // The server answers anyway.
    calls[0]!.resolve(report());
    await flushPromises();
    expect(wrapper.find('[data-testid="results-heading"]').exists()).toBe(false);
    expect(wrapper.findComponent(DropZone).exists()).toBe(true);
    wrapper.unmount();
  });

  it("a late FAILURE after a reset shows no error either", async () => {
    const resetSignal = ref(0);
    const calls = deferredUrlAudit();
    const wrapper = mountIndex(resetSignal);
    await submitLink(wrapper, "https://example.gov/a.pdf");
    resetSignal.value++;
    await flushPromises();
    calls[0]!.reject({ status: 500, data: { error: "Internal server error" } });
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("says plainly when the site is not approved", async () => {
    const calls = deferredUrlAudit();
    const wrapper = mountIndex();
    await submitLink(wrapper, "https://example.com/a.pdf");
    calls[0]!.reject({
      status: 400,
      data: { error: "URL not allowed", details: "host 'example.com' is not in the allowlist." },
    });
    await flushPromises();
    const alert = wrapper.find('[role="alert"]');
    expect(alert.text()).toContain("Uploading the file always works");
    expect(alert.text()).toContain("Uploading the file always works");
    wrapper.unmount();
  });
});

describe("index.vue — ?prefill= runs once", () => {
  it("removes the param from the address and audits the link under an abortable run", async () => {
    // An APPROVED host: only those start by themselves (see the next test).
    window.history.replaceState({}, "", "/?prefill=https%3A%2F%2Ficjia.illinois.gov%2Fa.pdf&x=1");
    const resetSignal = ref(0);
    const calls = deferredUrlAudit();
    const wrapper = mountIndex(resetSignal);
    await flushPromises();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith({ path: "/", query: { x: "1" } });
    expect(calls.map((c) => c.url)).toEqual(["https://icjia.illinois.gov/a.pdf"]);

    // Reset mid-prefill: overlay gone, request aborted, answer ignored.
    resetSignal.value++;
    await flushPromises();
    expect(calls[0]!.signal!.aborted).toBe(true);
    expect(wrapper.findComponent({ name: "ProcessingOverlay" }).exists()).toBe(false);
    calls[0]!.resolve(report());
    await flushPromises();
    expect(wrapper.find('[data-testid="results-heading"]').exists()).toBe(false);
    wrapper.unmount();
  });

  // Red-team review 2026-11-25: a link to any other site waits for the button.
  it("for a site off the approved list: fills the field, sends nothing, and runs on the button", async () => {
    window.history.replaceState({}, "", "/?prefill=https%3A%2F%2Fexample.com%2Fa.pdf");
    const resetSignal = ref(0);
    const calls = deferredUrlAudit();
    const wrapper = mountIndex(resetSignal);
    await flushPromises();

    expect(replace).toHaveBeenCalledTimes(1); // the param is still removed
    expect(calls).toHaveLength(0);
    const input = wrapper.find('[data-testid="url-audit-input"]');
    expect((input.element as HTMLInputElement).value).toBe("https://example.com/a.pdf");
    expect(wrapper.find('[data-testid="url-audit-pending"]').text()).toMatch(/press/i);

    await wrapper.find('[data-testid="url-audit-form"]').trigger("submit");
    await flushPromises();
    expect(calls.map((c) => c.url)).toEqual(["https://example.com/a.pdf"]);
    wrapper.unmount();
  });

  it("does nothing, and replaces nothing, without the param", async () => {
    deferredUrlAudit();
    const wrapper = mountIndex();
    await flushPromises();
    expect(replace).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

// Red-team review 2026-11-25, finding 2: since v1.180.0 the server fetches
// from any public host, so a link on someone else's page must not be able to
// start a check just by being followed.
describe("a prefilled link starts by itself only for an approved host", () => {
  it("isApprovedHost matches the approved list and nothing that merely resembles it", async () => {
    const { isApprovedHost } = await import("~/utils/urlAudit");
    expect(isApprovedHost("https://icjia.illinois.gov/a.pdf")).toBe(true);
    expect(isApprovedHost("https://illinois.gov/a.pdf")).toBe(true);
    for (const url of [
      "https://example.com/a.pdf",
      "https://illinois.gov.example.com/a.pdf",
      "https://notillinois.gov/a.pdf",
      "https://illinois.gov:8443/a.pdf",
      "ftp://illinois.gov/a.pdf",
      "not a url",
    ]) {
      expect(isApprovedHost(url), url).toBe(false);
    }
  });

  it("the page runs an approved link and only fills the field for any other", () => {
    const index = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    expect(index).toMatch(
      /onUrl\(url\) \{\s*if \(isApprovedHost\(url\)\) return analyzeUrl\(url\);\s*pendingLink\.value = url;/,
    );
    expect(index).toContain('<UrlAuditForm :pending="pendingLink" @submit="analyzeUrl" />');
    const form = readFileSync(resolve(__dirname, "../components/UrlAuditForm.vue"), "utf8");
    expect(form).toContain('data-testid="url-audit-pending"');
    // Filling the field never submits it.
    expect(form).toMatch(
      /watch\(\s*\(\) => props\.pending,\s*\(url\) => \{\s*if \(url\) value\.value = url;\s*\},/,
    );
  });

  it("shows the server's own sentence for the other link-check refusals", () => {
    const out = describeUrlAuditError({
      statusCode: 503,
      data: {
        error:
          "The link checker is busy right now. Try again in a moment, or upload the file instead.",
      },
    });
    expect(out.error).toBe("That link cannot be checked right now.");
    expect(out.details).toMatch(/upload the file instead/);
  });
});
