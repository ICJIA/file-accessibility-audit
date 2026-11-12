import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReportExport, shareErrorMessage } from "../composables/useReportExport";
import { saveFinishedAudit, readAuditSession, type SessionStore } from "../utils/auditSession";
import type { ReportResult } from "../utils/exportFormats/shared";

// Review 2026-11-12, findings 9 and 11.

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).$fetch = fetchMock;
});

function result(name: string): ReportResult {
  return {
    filename: name,
    pageCount: 2,
    overallScore: 88,
    grade: "B",
    isScanned: false,
    executiveSummary: "s",
    fileType: "pdf",
    categories: [
      { id: "alt_text", label: "Alt", score: 88, grade: null, severity: "Minor", findings: ["f1"] },
    ],
    conformance: { status: "no-automated-failures", headline: "h", failures: [], notAssessed: [] },
    seal: `seal-for-${name}`,
  };
}

describe("shareReport — the link belongs to the report it was made for", () => {
  it("posts the very object it was given, untouched", async () => {
    fetchMock.mockResolvedValue({ id: "abc" });
    const { shareReport, shareUrl, sharedReport } = useReportExport();
    const r = result("a.pdf");
    const before = JSON.stringify(r);
    const url = await shareReport(r);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports",
      expect.objectContaining({ method: "POST", body: { report: r } }),
    );
    expect(fetchMock.mock.calls[0]![1].body.report).toBe(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(url).toBe("https://audit.example.test/report/abc");
    expect(shareUrl.value).toBe(url);
    expect(sharedReport.value).toBe(r);
  });

  it("drops an answer that arrives after the share was cleared (tab switch)", async () => {
    let answer!: (v: { id: string }) => void;
    fetchMock.mockImplementation(() => new Promise((res) => (answer = res)));
    const { shareReport, shareUrl, sharedReport, sharing, clearShare } = useReportExport();
    const pending = shareReport(result("a.pdf"));
    expect(sharing.value).toBe(true);
    clearShare();
    expect(sharing.value).toBe(false);
    answer({ id: "for-a" });
    expect(await pending).toBeNull();
    expect(shareUrl.value).toBeNull();
    expect(sharedReport.value).toBeNull();
  });

  it("when two requests overlap, only the newer one's link is kept", async () => {
    const answers: Array<(v: { id: string }) => void> = [];
    fetchMock.mockImplementation(() => new Promise((res) => answers.push(res)));
    const { shareReport, shareUrl, sharedReport, sharing } = useReportExport();
    const a = result("a.pdf");
    const b = result("b.pdf");
    const pa = shareReport(a);
    const pb = shareReport(b);
    answers[1]!({ id: "for-b" });
    await pb;
    answers[0]!({ id: "for-a" }); // the older answer lands last
    await pa;
    expect(shareUrl.value).toBe("https://audit.example.test/report/for-b");
    expect(sharedReport.value).toBe(b);
    expect(sharing.value).toBe(false);
  });

  it("a late failure from an overtaken request does not show an error", async () => {
    let fail!: (e: unknown) => void;
    fetchMock.mockImplementation(() => new Promise((_res, rej) => (fail = rej)));
    const { shareReport, shareError, clearShare } = useReportExport();
    const pending = shareReport(result("a.pdf"));
    clearShare();
    fail({ status: 500 });
    await pending;
    expect(shareError.value).toBeNull();
  });
});

describe("shareErrorMessage", () => {
  it("shows the server's seal message as sent", () => {
    const msg = "This report could not be verified — run the audit again and share the new result.";
    expect(shareErrorMessage({ status: 400, data: { error: msg } })).toBe(msg);
  });
  it("adds the next step to a 400 that lacks one", () => {
    expect(shareErrorMessage({ status: 400, data: { error: "Invalid report." } })).toBe(
      "Invalid report. Run the audit again, then create the link.",
    );
    expect(shareErrorMessage({ status: 400, data: "<html>" })).toBe(
      "This report could not be verified. Run the audit again, then create the link.",
    );
  });
  it("a too-large report gets its own message, not a connection hint", () => {
    const msg = shareErrorMessage({
      status: 413,
      data: "<html>413 Request Entity Too Large</html>",
    });
    expect(msg).toBe(
      "This report is too large to share as a link. Download it instead — the HTML or JSON download holds the full report.",
    );
    expect(msg).not.toMatch(/connection/i);
  });
  it("never returns an empty message", () => {
    expect(shareErrorMessage({ status: 429 })).toMatch(/Wait a minute/);
    expect(shareErrorMessage(new TypeError("Failed to fetch"))).toMatch(/could not be created/);
    expect(shareErrorMessage(undefined)).toMatch(/could not be created/);
  });
});

describe("the seal survives session persistence", () => {
  it("a restored result is the result that was saved, seal included", () => {
    const mem = new Map<string, string>();
    const store: SessionStore = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
    const r = result("a.pdf");
    saveFinishedAudit(
      { result: r as never, filename: "a.pdf", savedAt: 1, appVersion: "1.0.0" },
      store,
    );
    const back = readAuditSession({ now: 2, appVersion: "1.0.0", ttlMs: 1000 }, store);
    expect(back?.kind).toBe("result");
    expect((back as { result: unknown }).result).toEqual(r);
    expect((back as { result: { seal?: string } }).result.seal).toBe("seal-for-a.pdf");
  });
});
