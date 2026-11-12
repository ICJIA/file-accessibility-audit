import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import {
  downloadAvailability,
  fetchRemediatedPdf,
  filenameFromContentDisposition,
  DOWNLOAD_GONE_MESSAGE,
} from "../utils/remediationDownload";

// ---------------------------------------------------------------------------
// Review 2026-11-12, finding 4: the remediated PDF is single-use (the API
// deletes it and marks the job `expired` on first download). The page never
// said so, a second click landed on raw 410 JSON, and after a reload every
// result section vanished under the wrong explanation.
// ---------------------------------------------------------------------------

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { jobId: "job-1" }, query: { t: "tok" } }),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
(globalThis as any).useHead = () => {};
const downloadBlob = vi.fn();
vi.mock("~/utils/download", () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a) }));

describe("downloadAvailability", () => {
  it("tells ready, downloaded and expired apart", () => {
    expect(downloadAvailability({ status: "complete", events: [] })).toBe("ready");
    expect(downloadAvailability({ status: "complete", downloadedHere: true })).toBe("downloaded");
    expect(downloadAvailability({ status: "expired", events: [{ event: "downloaded" }] })).toBe(
      "downloaded",
    );
    expect(downloadAvailability({ status: "expired", events: [{ event: "expired" }] })).toBe(
      "expired",
    );
    expect(downloadAvailability({ status: "running" })).toBe("not-ready");
    expect(downloadAvailability({ status: "failed", events: "junk" })).toBe("not-ready");
  });
});

describe("filenameFromContentDisposition", () => {
  it("prefers the RFC 6266 extended name, then the quoted one, then the fallback", () => {
    expect(
      filenameFromContentDisposition(
        `attachment; filename="plain.pdf"; filename*=UTF-8''Annual%20Report%20%C3%A9.pdf`,
        "x.pdf",
      ),
    ).toBe("Annual Report é.pdf");
    expect(filenameFromContentDisposition('attachment; filename="my file.pdf"', "x.pdf")).toBe(
      "my file.pdf",
    );
    expect(filenameFromContentDisposition(null, "x.pdf")).toBe("x.pdf");
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''%E0%A4%A", "x.pdf")).toBe(
      "x.pdf",
    );
  });
});

describe("fetchRemediatedPdf", () => {
  it("returns the blob and the server's filename", async () => {
    const res = new Response(new Blob(["%PDF"]), {
      status: 200,
      headers: { "content-disposition": 'attachment; filename="a b.pdf"' },
    });
    const out = await fetchRemediatedPdf("/u", "fallback.pdf", (async () => res) as never);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.filename).toBe("a b.pdf");
      expect(await out.blob.text()).toBe("%PDF");
    }
  });

  it("a 410 becomes a sentence with a next step, never raw JSON", async () => {
    const res = new Response('{"error":"Output expired and was deleted."}', { status: 410 });
    const out = await fetchRemediatedPdf("/u", "f.pdf", (async () => res) as never);
    expect(out).toEqual({ ok: false, gone: true, message: DOWNLOAD_GONE_MESSAGE });
    expect(DOWNLOAD_GONE_MESSAGE).toMatch(/rerun the remediation/);
  });

  it("a network failure is reported, not thrown", async () => {
    const out = await fetchRemediatedPdf("/u", "f.pdf", (async () => {
      throw new TypeError("Failed to fetch");
    }) as never);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/did not start/);
  });
});

// ── The page itself ─────────────────────────────────────────────────────────

const UButton = defineComponent({
  name: "UButton",
  inheritAttrs: false,
  props: { loading: Boolean, disabled: Boolean },
  setup(p, { slots, attrs }) {
    return () =>
      h(
        "button",
        { type: "button", disabled: p.disabled || undefined, ...attrs },
        slots.default?.(),
      );
  },
});

function audit(score: number, grade: string) {
  return {
    filename: "report.pdf",
    pageCount: 4,
    executiveSummary: "s",
    overallScore: score,
    grade,
    categories: [
      {
        id: "alt_text",
        label: "Alt Text",
        score: 80,
        grade: null,
        severity: "Minor",
        findings: ["f"],
      },
    ],
    conformance: { status: "no-automated-failures", headline: "h", failures: [], notAssessed: [] },
  };
}

function jobStatus(status: string) {
  return {
    jobId: "job-1",
    status,
    step: null,
    progressPct: 100,
    inputScore: 40,
    outputScore: 85,
    outputValid: true,
    failureReason: null,
    createdAt: 1,
    completedAt: 2,
    expiresAt: 3,
    inputFilename: "report.pdf",
    originalFilename: "Annual Report.pdf",
  };
}

function receipt(status: string, events: string[]) {
  return {
    jobId: "job-1",
    filename: "report.pdf",
    contentHash: null,
    status,
    inputScore: 40,
    outputScore: 85,
    createdAt: 1,
    completedAt: 2,
    inputAudit: audit(40, "F"),
    outputAudit: audit(85, "B"),
    veraPdf: null,
    events: events.map((event, i) => ({ event, occurredAt: i, details: null })),
  };
}

async function mountPage(status: string, events: string[]) {
  (globalThis as any).$fetch = vi.fn(async (url: string) =>
    url.includes("/status") ? jobStatus(status) : receipt(status, events),
  );
  const Page = (await import("../pages/remediate/[jobId].vue")).default;
  const wrapper = mount(Page, {
    shallow: true,
    attachTo: document.body,
    global: {
      components: { UButton },
      stubs: { UButton: false, NuxtLink: true },
    },
  });
  await flushPromises();
  // Let the stage animation walk to its last step (4 × 350 ms).
  await vi.advanceTimersByTimeAsync(2_000);
  await flushPromises();
  return wrapper;
}

describe("remediate/[jobId].vue — single-use download", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
    downloadBlob.mockReset();
    try {
      sessionStorage.clear();
    } catch {
      /* unavailable */
    }
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    document.body.innerHTML = "";
  });

  it("says before the click that the file can be downloaded once", async () => {
    const wrapper = await mountPage("complete", ["created", "completed"]);
    expect(wrapper.find('[data-testid="download-once-notice"]').text()).toContain(
      "This file can be downloaded once.",
    );
    const btn = wrapper.find('[data-testid="download-button"]');
    expect(btn.text()).toContain("Download (one time only)");
    // A button that fetches — not a link that navigates the tab.
    expect(btn.attributes("href")).toBeUndefined();
    expect(btn.attributes("to")).toBeUndefined();
    wrapper.unmount();
  });

  it("after a successful download the results stay and the button becomes an accurate state", async () => {
    const wrapper = await mountPage("complete", ["created", "completed"]);
    const fetchSpy = vi.fn(
      async () =>
        new Response(new Blob(["%PDF"]), {
          status: 200,
          headers: { "content-disposition": "attachment; filename*=UTF-8''Annual%20Report.pdf" },
        }),
    );
    globalThis.fetch = fetchSpy as never;

    await wrapper.find('[data-testid="download-button"]').trigger("click");
    await flushPromises();
    await nextTick();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/remediate/job-1/download?token=tok",
      expect.anything(),
    );
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob.mock.calls[0]![1]).toBe("Annual Report.pdf");

    const done = wrapper.find('[data-testid="download-done"]');
    expect(done.text()).toContain(
      "Already downloaded — the file has been deleted from the server.",
    );
    expect(done.text()).toContain("Annual Report.pdf");
    expect(document.activeElement).toBe(done.element);
    expect(wrapper.find('[data-testid="download-button"]').exists()).toBe(false);
    // The before/after results are still on the page.
    expect(wrapper.text()).toContain("After Remediation");
    expect(wrapper.find('[data-testid="after-card-download"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("a failed download is shown in the page", async () => {
    const wrapper = await mountPage("complete", ["created", "completed"]);
    globalThis.fetch = (async () => new Response("{}", { status: 410 })) as never;
    await wrapper.find('[data-testid="download-button"]').trigger("click");
    await flushPromises();
    const err = wrapper.find('[data-testid="download-error"]');
    expect(err.attributes("role")).toBe("alert");
    expect(err.text()).toBe(DOWNLOAD_GONE_MESSAGE);
    expect(downloadBlob).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("reloaded after downloading: results still shown, with the true explanation", async () => {
    const wrapper = await mountPage("expired", ["created", "completed", "downloaded"]);
    expect(wrapper.text()).toContain("After Remediation");
    expect(wrapper.find('[data-testid="download-done"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="expired-downloaded"]').text()).toContain(
      "can be downloaded once, and it was",
    );
    expect(wrapper.text()).not.toContain("retention window");
    expect(wrapper.find('[data-testid="download-button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("expired without ever being downloaded keeps the retention explanation", async () => {
    const wrapper = await mountPage("expired", ["created", "completed", "expired"]);
    expect(wrapper.find('[data-testid="expired-retention"]').text()).toContain("retention window");
    expect(wrapper.find('[data-testid="download-expired"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="download-done"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
