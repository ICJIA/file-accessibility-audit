import { describe, it, expect, vi, beforeEach } from "vitest";

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
function makeReq(o: Record<string, unknown> = {}): any {
  return {
    user: { email: "t@illinois.gov" },
    ip: "127.0.0.1",
    get: vi.fn(() => undefined),
    file: undefined,
    ...o,
  };
}
function extractHandler(router: any, p: string) {
  const layer = router.stack.find((l: any) => l.route?.path === p);
  const s = layer.route.stack;
  return s[s.length - 1].handle as (req: any, res: any) => Promise<void>;
}

vi.mock("../db/sqlite.js", () => ({
  default: { prepare: vi.fn(() => ({ get: vi.fn(), run: vi.fn() })) },
}));
vi.mock("../services/auditLog.js", () => ({
  gateIdentity: vi.fn(() => "t@illinois.gov"),
  recordAudit: vi.fn(),
  recordAuditFailure: vi.fn(),
  recordRejectedUpload: vi.fn(),
  // Real behaviour, not a stub: analyze.ts derives the stored filename with
  // this, and a mock returning undefined would hide a break in that path.
  sanitizeStoredFilename: (s: string) => s,
  sha256Hex: vi.fn(() => "hash"),
}));

// vi.mock(...) factories are hoisted above plain top-level `const`s, so any
// variable a factory references must itself be declared via vi.hoisted() —
// same idiom already used in qpdfSpawnEnv.test.ts / ooxmlWorker.test.ts /
// remediate-spawn-env.test.ts / veraPdfBuffer.test.ts. Assertions below are
// unchanged from the brief.
const { analyzeDocument, detectFileType } = vi.hoisted(() => ({
  analyzeDocument: vi.fn(),
  detectFileType: vi.fn(),
}));
vi.mock("../services/analyzer.js", () => ({ analyzeDocument, detectFileType }));
const { runVeraPdfChecksOnBuffer } = vi.hoisted(() => ({ runVeraPdfChecksOnBuffer: vi.fn() }));
vi.mock("../services/veraPdfBuffer.js", () => ({ runVeraPdfChecksOnBuffer }));

import analyzeRouter from "../routes/analyze.js";
const handler = extractHandler(analyzeRouter, "/analyze");

beforeEach(() => {
  vi.clearAllMocks();
  analyzeDocument.mockResolvedValue({
    filename: "a.pdf",
    fileType: "pdf",
    overallScore: 80,
    grade: "B",
    categories: [],
  });
});

describe("/analyze attaches pdfUaVerdict", () => {
  it("attaches the verdict for a PDF when veraPDF is available", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfChecksOnBuffer.mockResolvedValue({
      pdfUa: {
        available: true,
        passed: false,
        profile: "ua1",
        failures: [{ ruleId: "7.1-1", clause: "7.1", description: "x", count: 1 }],
        totalFailureCount: 1,
      },
      wcag: null,
    });
    const res = makeRes();
    await handler(
      makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }),
      res,
    );
    expect(res._json.pdfUaVerdict).toEqual(
      expect.objectContaining({ available: true, passed: false }),
    );
  });

  it("attaches available:false when veraPDF did not run, so the report can disclose the gap (v1.91.0)", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfChecksOnBuffer.mockResolvedValue({
      pdfUa: {
        available: false,
        passed: false,
        profile: "ua1",
        failures: [],
        totalFailureCount: 0,
      },
      wcag: null,
    });
    const res = makeRes();
    await handler(
      makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }),
      res,
    );
    // The old behavior (field omitted) silently hid the PDF/UA panel — a
    // PDF report then looked complete while the machine-check layer was
    // missing. available:false is the signal the web disclosure renders from.
    expect(res._json.pdfUaVerdict).toEqual(expect.objectContaining({ available: false }));
  });

  it("does not run veraPDF for a non-PDF upload", async () => {
    detectFileType.mockResolvedValue("docx");
    analyzeDocument.mockResolvedValue({
      filename: "a.docx",
      fileType: "docx",
      overallScore: 90,
      grade: "A",
      categories: [],
    });
    const res = makeRes();
    await handler(makeReq({ file: { buffer: Buffer.from("PK"), originalname: "a.docx" } }), res);
    expect(runVeraPdfChecksOnBuffer).not.toHaveBeenCalled();
    expect(res._json.pdfUaVerdict).toBeUndefined();
  });
});

describe("/analyze attaches wcagVerdict (v1.97.0)", () => {
  const uaOk = {
    available: true,
    passed: true,
    profile: "ua1",
    failures: [],
    totalFailureCount: 0,
  };

  it("attaches the WCAG second opinion when the check ran", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfChecksOnBuffer.mockResolvedValue({
      pdfUa: uaOk,
      wcag: {
        available: true,
        passed: false,
        profile: "wcag-2.2-machine",
        failures: [{ ruleId: "1.4.3-1", clause: "1.4.3", description: "contrast", count: 3 }],
        totalFailureCount: 3,
      },
    });
    const res = makeRes();
    await handler(
      makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }),
      res,
    );
    expect(res._json.wcagVerdict).toEqual(
      expect.objectContaining({ available: true, profile: "wcag-2.2-machine" }),
    );
  });

  it("OMITS the field entirely when the check is off (wcag null) — never a false 'Did not run'", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfChecksOnBuffer.mockResolvedValue({ pdfUa: uaOk, wcag: null });
    const res = makeRes();
    await handler(
      makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }),
      res,
    );
    expect("wcagVerdict" in res._json).toBe(false);
  });

  it("a failing WCAG second opinion changes NOTHING about the score, grade, or categories", async () => {
    detectFileType.mockResolvedValue("pdf");
    runVeraPdfChecksOnBuffer.mockResolvedValue({
      pdfUa: uaOk,
      wcag: {
        available: true,
        passed: false,
        profile: "wcag-2.2-machine",
        failures: [{ ruleId: "1.4.3-1", clause: "1.4.3", description: "contrast", count: 999 }],
        totalFailureCount: 999,
      },
    });
    const res = makeRes();
    await handler(
      makeReq({ file: { buffer: Buffer.from("%PDF-1.4"), originalname: "a.pdf" } }),
      res,
    );
    // The analyzer's own output rides through untouched — the second opinion
    // is informational only, pinned here so it can never leak into scoring.
    expect(res._json.overallScore).toBe(80);
    expect(res._json.grade).toBe("B");
    expect(res._json.categories).toEqual([]);
  });
});
