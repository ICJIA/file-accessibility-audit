import { describe, it, expect, vi, beforeEach } from "vitest";

function makeRes() {
  const res: any = { _status: 200, _json: null,
    status(c: number) { res._status = c; return res; },
    json(b: any) { res._json = b; return res; } };
  return res;
}
function makeReq(o: Record<string, unknown> = {}): any {
  return { user: { email: "t@illinois.gov" }, ip: "127.0.0.1",
    get: vi.fn(() => undefined), file: undefined, ...o };
}
function extractHandler(router: any, p: string) {
  const layer = router.stack.find((l: any) => l.route?.path === p);
  const s = layer.route.stack;
  return s[s.length - 1].handle as (req: any, res: any) => Promise<void>;
}

vi.mock("../db/sqlite.js", () => ({ default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) } }));
vi.mock("../services/auditLog.js", () => ({
  gateIdentity: vi.fn(() => "t@illinois.gov"), recordAudit: vi.fn(), sha256Hex: vi.fn(() => "hash"),
}));

// vi.mock(...) factories are hoisted above plain top-level `const`s, so any
// variable a factory references must itself be declared via vi.hoisted() —
// same idiom already used in qpdfSpawnEnv.test.ts / ooxmlWorker.test.ts /
// remediate-spawn-env.test.ts / veraPdfBuffer.test.ts. Assertions below are
// unchanged from the brief.
const { analyzeDocument, detectFileType } = vi.hoisted(() => ({
  analyzeDocument: vi.fn(), detectFileType: vi.fn(),
}));
vi.mock("../services/analyzer.js", () => ({ analyzeDocument, detectFileType }));
const { runVeraPdfOnBuffer } = vi.hoisted(() => ({ runVeraPdfOnBuffer: vi.fn() }));
vi.mock("../services/veraPdfBuffer.js", () => ({ runVeraPdfOnBuffer }));

import analyzeRouter from "../routes/analyze.js";
const handler = extractHandler(analyzeRouter, "/analyze");

beforeEach(() => {
  vi.clearAllMocks();
  analyzeDocument.mockResolvedValue({ filename: "a.pdf", fileType: "pdf", overallScore: 80, grade: "B", categories: [] });
});

describe("/analyze attaches pdfUaVerdict", () => {
  it("attaches the verdict for a PDF when veraPDF is available", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfOnBuffer.mockResolvedValue({ available: true, passed: false, profile: "ua1",
      failures: [{ ruleId: "7.1-1", clause: "7.1", description: "x", count: 1 }], totalFailureCount: 1 });
    const res = makeRes();
    await handler(makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }), res);
    expect(res._json.pdfUaVerdict).toEqual(expect.objectContaining({ available: true, passed: false }));
  });

  it("omits the verdict when veraPDF is unavailable (available:false → not attached)", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfOnBuffer.mockResolvedValue({ available: false, passed: false, profile: "ua1", failures: [], totalFailureCount: 0 });
    const res = makeRes();
    await handler(makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }), res);
    expect(res._json.pdfUaVerdict).toBeUndefined();
  });

  it("does not run veraPDF for a non-PDF upload", async () => {
    detectFileType.mockResolvedValue("docx");
    analyzeDocument.mockResolvedValue({ filename: "a.docx", fileType: "docx", overallScore: 90, grade: "A", categories: [] });
    const res = makeRes();
    await handler(makeReq({ file: { buffer: Buffer.from("PK"), originalname: "a.docx" } }), res);
    expect(runVeraPdfOnBuffer).not.toHaveBeenCalled();
    expect(res._json.pdfUaVerdict).toBeUndefined();
  });
});
