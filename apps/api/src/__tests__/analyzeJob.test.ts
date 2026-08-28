import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// The job-model audit (v1.100.0): POST /api/analyze-job → 202 {jobId, token};
// GET /api/analyze-job/:id?t=… → REAL observed step states, then the result
// (or the synchronous endpoint's exact error body) exactly once.
//
// The honesty + privacy contract under test:
//   - steps flip only on real transitions the pipeline reports;
//   - wrong id and wrong token are indistinguishable (404, no existence
//     oracle — jobs carry no owner identity, the token is the only key);
//   - the result is delivered once and the job is then GONE (nothing
//     lingers in memory once the page has the report);
//   - audit_log gets exactly the same single row the synchronous path
//     records, via the same shared core.
// ---------------------------------------------------------------------------

vi.mock("../db/sqlite.js", () => ({
  default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) },
}));
const { recordAudit } = vi.hoisted(() => ({ recordAudit: vi.fn() }));
vi.mock("../services/auditLog.js", () => ({
  gateIdentity: vi.fn(),
  recordAudit,
  recordAuditFailure: vi.fn(),
  recordRejectedUpload: vi.fn(),
  sanitizeStoredFilename: (s: string) => s,
  sha256Hex: vi.fn(() => "hash"),
}));

const { analyzeDocument, detectFileType } = vi.hoisted(() => ({
  analyzeDocument: vi.fn(),
  detectFileType: vi.fn(),
}));
vi.mock("../services/analyzer.js", () => ({
  analyzeDocument,
  detectFileType,
  detectLegacyFormat: vi.fn(() => null),
}));

const { runVeraPdfChecksOnBuffer } = vi.hoisted(() => ({ runVeraPdfChecksOnBuffer: vi.fn() }));
vi.mock("../services/veraPdfBuffer.js", () => ({ runVeraPdfChecksOnBuffer }));

import analyzeJobRouter from "../routes/analyzeJob.js";
import { _resetAnalyzeJobs, _jobCount, createAnalyzeJob } from "../services/analyzeJobs.js";
import { AUDIT_TIMEOUT_MESSAGE } from "@file-audit/shared";

function makeRes() {
  const res: any = {
    _status: 200,
    _json: null,
    status(c: number) {
      res._status = c;
      return res;
    },
    json(b: any) {
      res._json = b;
      return res;
    },
  };
  return res;
}
function handler(method: "post" | "get", path: string) {
  const layer = (analyzeJobRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  const s = layer.route.stack;
  return s[s.length - 1].handle as (req: any, res: any) => Promise<void> | void;
}
const post = handler("post", "/analyze-job");
const get = handler("get", "/analyze-job/:id");

function pollRes(id: string, token: string) {
  const res = makeRes();
  get({ params: { id }, query: { t: token } }, res);
  return res;
}

/** Deferred helper so the test controls exactly when each step settles. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const UA_OK = {
  available: true,
  passed: true,
  profile: "ua1",
  failures: [],
  totalFailureCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetAnalyzeJobs();
});

describe("POST /api/analyze-job", () => {
  it("answers 202 with jobId + token immediately, then finishes the job with the result and ONE audit_log row", async () => {
    detectFileType.mockResolvedValue("pdf");
    const gate = deferred<any>();
    analyzeDocument.mockReturnValue(gate.promise);
    runVeraPdfChecksOnBuffer.mockResolvedValue({ pdfUa: UA_OK, wcag: null });

    const res = makeRes();
    const done = post(
      { file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" }, get: vi.fn() },
      res,
    );
    // 202 must not wait for the pipeline: flush the handler's type-detect
    // await, then assert the response went out while analysis is still gated.
    await new Promise((r) => setImmediate(r));
    expect(res._status).toBe(202);
    expect(res._json.jobId).toBeTruthy();
    expect(res._json.token).toBeTruthy();
    gate.resolve({ filename: "a.pdf", overallScore: 80, grade: "B" });
    await done;

    const poll = pollRes(res._json.jobId, res._json.token);
    expect(poll._json.done).toBe(true);
    expect(poll._json.result.overallScore).toBe(80);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("reports REAL step transitions: analysis and the two veraPDF passes flip as the pipeline reports them", async () => {
    detectFileType.mockResolvedValue("pdf");
    const analysisGate = deferred<any>();
    analyzeDocument.mockReturnValue(analysisGate.promise);
    const veraGate = deferred<any>();
    runVeraPdfChecksOnBuffer.mockImplementation(
      (_buf: Buffer, opts: { onUa?: (s: string) => void; onWcag?: (s: string) => void }) => {
        opts.onUa?.("running");
        opts.onWcag?.("running");
        return veraGate.promise.then((v) => {
          opts.onUa?.("done");
          opts.onWcag?.("done");
          return v;
        });
      },
    );

    const res = makeRes();
    const done = post(
      { file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" }, get: vi.fn() },
      res,
    );
    await new Promise((r) => setImmediate(r));

    let poll = pollRes(res._json.jobId, res._json.token);
    expect(poll._json.done).toBe(false);
    expect(poll._json.steps.analysis.state).toBe("running");
    expect(poll._json.steps.veraPdfUa.state).toBe("running");
    expect(poll._json.steps.veraPdfWcag.state).toBe("running");
    expect(poll._json.result).toBeUndefined();

    analysisGate.resolve({ filename: "a.pdf", overallScore: 91, grade: "A" });
    await new Promise((r) => setImmediate(r));
    poll = pollRes(res._json.jobId, res._json.token);
    expect(poll._json.steps.analysis.state).toBe("done");
    expect(poll._json.done).toBe(false);

    veraGate.resolve({ pdfUa: UA_OK, wcag: null });
    await done;
    poll = pollRes(res._json.jobId, res._json.token);
    expect(poll._json.steps.veraPdfUa.state).toBe("done");
    expect(poll._json.steps.veraPdfWcag.state).toBe("done");
    expect(poll._json.done).toBe(true);
    expect(poll._json.result.grade).toBe("A");
  });

  it("non-PDF uploads mark both veraPDF steps skipped from the start", async () => {
    detectFileType.mockResolvedValue("docx");
    analyzeDocument.mockResolvedValue({ filename: "a.docx", overallScore: 95, grade: "A" });

    const res = makeRes();
    await post({ file: { buffer: Buffer.from("PK"), originalname: "a.docx" }, get: vi.fn() }, res);
    const poll = pollRes(res._json.jobId, res._json.token);
    expect(poll._json.steps.veraPdfUa.state).toBe("skipped");
    expect(poll._json.steps.veraPdfWcag.state).toBe("skipped");
    expect(runVeraPdfChecksOnBuffer).not.toHaveBeenCalled();
  });

  it("a failed audit finishes the job with the SAME error body the synchronous endpoint sends", async () => {
    detectFileType.mockResolvedValue("pdf");
    analyzeDocument.mockRejectedValue(Object.assign(new Error("boom"), { code: "ETIMEDOUT" }));
    runVeraPdfChecksOnBuffer.mockResolvedValue({ pdfUa: UA_OK, wcag: null });

    const res = makeRes();
    await post(
      { file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" }, get: vi.fn() },
      res,
    );
    const poll = pollRes(res._json.jobId, res._json.token);
    expect(poll._json.done).toBe(true);
    expect(poll._json.error.status).toBe(504);
    expect(poll._json.error.body).toEqual(AUDIT_TIMEOUT_MESSAGE);
  });
});

describe("GET /api/analyze-job/:id — the token gate and single delivery", () => {
  it("wrong token and wrong id are indistinguishable 404s — no existence oracle", async () => {
    detectFileType.mockResolvedValue("docx");
    analyzeDocument.mockResolvedValue({ filename: "a.docx", overallScore: 95, grade: "A" });
    const res = makeRes();
    await post({ file: { buffer: Buffer.from("PK"), originalname: "a.docx" }, get: vi.fn() }, res);
    const wrongToken = pollRes(res._json.jobId, "not-the-token");
    const wrongId = pollRes("00000000-0000-4000-8000-000000000000", res._json.token);
    expect(wrongToken._status).toBe(404);
    expect(wrongId._status).toBe(404);
    expect(JSON.stringify(wrongToken._json)).toBe(JSON.stringify(wrongId._json));
  });

  it("the result is delivered exactly ONCE — the job is gone on the next poll", async () => {
    detectFileType.mockResolvedValue("docx");
    analyzeDocument.mockResolvedValue({ filename: "a.docx", overallScore: 95, grade: "A" });
    const res = makeRes();
    await post({ file: { buffer: Buffer.from("PK"), originalname: "a.docx" }, get: vi.fn() }, res);
    const first = pollRes(res._json.jobId, res._json.token);
    expect(first._json.result).toBeTruthy();
    const second = pollRes(res._json.jobId, res._json.token);
    expect(second._status).toBe(404);
    expect(_jobCount()).toBe(0);
  });

  it("the store refuses new jobs at its cap (503 from the route) instead of growing unbounded", () => {
    for (let i = 0; i < 100; i++) expect(createAnalyzeJob(true)).toBeTruthy();
    expect(createAnalyzeJob(true)).toBeNull();
  });
});
