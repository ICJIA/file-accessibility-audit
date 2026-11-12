/**
 * Review 2026-11-12, finding 5: POST /api/reports stored any client JSON —
 * anyone could publish a forged "100 / A" at /report/<id>. Results are now
 * SEALED (HMAC over a canonical digest of the verdict-bearing fields) by
 * every endpoint that returns one, and POST /api/reports refuses a report
 * whose seal is missing or does not match.
 *
 * This file covers: the canonical digest surviving the browser round trip,
 * tampering with each sealed field, the secret's storage, the POST route, and
 * the WIRING — that /api/analyze, /api/analyze-job and /api/analyze-url
 * really seal what they return, with a seal the reports route accepts.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "report-seal-test-"));
process.env.DB_PATH = join(tmpDir, "audit.db");
delete process.env.REPORT_SEAL_SECRET;

// The three result-producing routes are exercised for real; only the engine
// underneath them is replaced, so no qpdf / veraPDF / network is needed.
const { analyzeDocument, detectFileType, safeFetch } = vi.hoisted(() => ({
  analyzeDocument: vi.fn(),
  detectFileType: vi.fn(),
  safeFetch: vi.fn(),
}));
vi.mock("../services/analyzer.js", () => ({
  analyzeDocument,
  detectFileType,
  detectLegacyFormat: vi.fn(() => null),
}));
vi.mock("../services/veraPdfBuffer.js", () => ({
  runVeraPdfChecksOnBuffer: vi.fn(async () => ({
    pdfUa: { available: true, passed: false, profile: "ua1", failures: [], totalFailureCount: 3 },
    wcag: null,
  })),
}));
vi.mock("../services/safeFetch.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/safeFetch.js")>()),
  safeFetch,
}));

let seal: typeof import("../services/reportSeal.js");
let db: (typeof import("../db/sqlite.js"))["default"];
let reportsRouter: any;
let analyzeRouter: any;
let analyzeJobRouter: any;
let analyzeUrlRouter: any;

beforeAll(async () => {
  seal = await import("../services/reportSeal.js");
  db = (await import("../db/sqlite.js")).default;
  reportsRouter = (await import("../routes/reports.js")).default;
  analyzeRouter = (await import("../routes/analyze.js")).default;
  analyzeJobRouter = (await import("../routes/analyzeJob.js")).default;
  analyzeUrlRouter = (await import("../routes/analyze-url.js")).default;
});
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.REPORT_SEAL_SECRET;
});

function handlerOf(router: any, path: string, method: string) {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`no ${method} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}
function makeRes() {
  const res: any = {
    _status: 200,
    _json: undefined,
    status(c: number) {
      res._status = c;
      return res;
    },
    json(b: unknown) {
      res._json = b;
      return res;
    },
    setHeader() {},
  };
  return res;
}

/** A realistic analyzer result (fresh object every call). */
function freshResult(): any {
  const categories = [
    {
      id: "text_extractability",
      label: "Text",
      weight: 0.2,
      score: 100,
      grade: "A",
      severity: "Pass",
      findings: ["Text is extractable."],
      explanation: "…",
      helpLinks: [{ label: "W3C", url: "https://www.w3.org/WAI/" }],
    },
    {
      id: "alt_text",
      label: "Alt text",
      weight: 0.15,
      score: null,
      grade: null,
      severity: null,
      findings: [],
      explanation: "…",
      helpLinks: [],
      notAssessed: true,
    },
    {
      id: "heading_structure",
      label: "Headings",
      weight: 0.15,
      score: 40,
      grade: "F",
      severity: "Critical",
      findings: ["No headings found.", "Document is 12 pages."],
      explanation: "…",
      helpLinks: [],
    },
  ];
  return {
    filename: "annual-report.pdf",
    pageCount: 12,
    fileType: "pdf",
    overallScore: 61.5,
    grade: "D",
    isScanned: false,
    executiveSummary: "Grade D.",
    categories,
    warnings: [],
    scoringMode: "strict",
    scoreProfiles: {
      strict: {
        mode: "strict",
        label: "Strict",
        description: "…",
        overallScore: 61.5,
        grade: "D",
        executiveSummary: "Grade D.",
        categoryScores: { text_extractability: 100 },
        categories: structuredClone(categories),
      },
    },
    conformance: {
      status: "fail",
      failures: [
        {
          sc: "1.3.1",
          name: "Info and Relationships",
          level: "A",
          category: "heading_structure",
          issue: "No headings.",
          url: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships",
        },
      ],
      notAssessed: [],
      headline: "Fails.",
    },
    pdfMetadata: { creator: null, producer: undefined, pageCount: 12 },
  };
}

/** What the browser does: receive JSON, hold it, post it back as JSON. */
const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("canonical form — survives the browser round trip, and nothing else", () => {
  it("a sealed result verifies after a JSON round trip", () => {
    const sealed = seal.sealReport(freshResult());
    expect(sealed.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(seal.verifyReportSeal(roundTrip(sealed))).toBe(true);
    // … and after two (session storage, then the POST body).
    expect(seal.verifyReportSeal(roundTrip(roundTrip(sealed)))).toBe(true);
  });

  it("is indifferent to object key order at every depth", () => {
    const sealed = roundTrip(seal.sealReport(freshResult()));
    const reverseKeys = (v: any): any =>
      Array.isArray(v)
        ? v.map(reverseKeys)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.keys(v)
                .reverse()
                .map((k) => [k, reverseKeys(v[k])]),
            )
          : v;
    expect(seal.verifyReportSeal(reverseKeys(sealed))).toBe(true);
  });

  it("handles what JSON does to values on the wire: undefined, -0, NaN/Infinity, Dates", () => {
    const r = freshResult();
    r.pdfMetadata = {
      producer: undefined, // dropped by JSON
      creator: null,
      negativeZero: -0, // "0" on the wire
      notANumber: NaN, // null on the wire
      infinite: -Infinity, // null on the wire
      created: new Date("2026-11-12T08:00:00.000Z"), // ISO string on the wire
      sparse: [1, undefined, 3], // undefined in an array → null
    };
    // Sealed in its server-side form, verified in its as-received form.
    const sealed = seal.sealReport(r);
    const received = roundTrip(sealed);
    expect(received.pdfMetadata).toEqual({
      creator: null,
      negativeZero: 0,
      notANumber: null,
      infinite: null,
      created: "2026-11-12T08:00:00.000Z",
      sparse: [1, null, 3],
    });
    expect(seal.verifyReportSeal(received)).toBe(true);
    // undefined and missing are the same thing; null is NOT the same as missing.
    expect(seal.canonicalReportDigest({ a: 1, b: undefined })).toBe(
      seal.canonicalReportDigest({ a: 1 }),
    );
    expect(seal.canonicalReportDigest({ a: 1, b: null })).not.toBe(
      seal.canonicalReportDigest({ a: 1 }),
    );
  });

  it("array order is part of the contract", () => {
    const sealed = roundTrip(seal.sealReport(freshResult()));
    sealed.categories.reverse();
    expect(seal.verifyReportSeal(sealed)).toBe(false);
  });

  it("the seal itself is the only field left out", () => {
    const a = seal.canonicalReportDigest({ x: 1, seal: "anything" });
    expect(a).toBe(seal.canonicalReportDigest({ x: 1 }));
    // A nested `seal` key is ordinary data.
    expect(seal.canonicalReportDigest({ x: { seal: "a" } })).not.toBe(
      seal.canonicalReportDigest({ x: {} }),
    );
  });

  it("treats a __proto__ key as data, not as a prototype", () => {
    const withProto = JSON.parse('{"filename":"a.pdf","__proto__":{"overallScore":100}}');
    const without = JSON.parse('{"filename":"a.pdf"}');
    expect(seal.canonicalReportDigest(withProto)).not.toBe(seal.canonicalReportDigest(without));
  });
});

describe("ANY change to a sealed result breaks the seal", () => {
  // Every mutation the independent verifier got past the first (field-picking)
  // seal, then one for each remaining kind of field a view renders.
  const cases: Array<[string, (r: any) => void]> = [
    // --- the verifier's accepted forgeries --------------------------------
    [
      "weight 1e-9 on the failing categories (regrade recomputed 39/F as 69/D)",
      (r) => r.categories.forEach((c: any) => c.score !== 100 && (c.weight = 1e-9)),
    ],
    ["a category's weight", (r) => (r.categories[2].weight = 0)],
    ["a category flipped to notAssessed", (r) => (r.categories[2].notAssessed = true)],
    ["notAssessed removed", (r) => delete r.categories[1].notAssessed],
    ["an added url (page-report field)", (r) => (r.url = "https://agency.example.gov/")],
    ["an added pageTitle (page-report field)", (r) => (r.pageTitle = "Agency home")],
    ["an added score: 100 (page-report field)", (r) => (r.score = 100)],
    ["an added violationCount: 0 (page-report field)", (r) => (r.violationCount = 0)],
    [
      "the whole page-report shape grafted on",
      (r) =>
        Object.assign(r, {
          url: "https://agency.example.gov/",
          pageTitle: "Agency",
          score: 100,
          violationCount: 0,
          bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 },
          violations: [],
          incomplete: [],
        }),
    ],
    // --- top level --------------------------------------------------------
    ["overallScore", (r) => (r.overallScore = 100)],
    ["grade", (r) => (r.grade = "A")],
    ["isScanned", (r) => (r.isScanned = true)],
    ["fileType", (r) => (r.fileType = "docx")],
    ["pageCount", (r) => (r.pageCount = 1)],
    ["filename", (r) => (r.filename = "someone-elses-report.pdf")],
    ["executiveSummary", (r) => (r.executiveSummary = "Grade A. Ready to publish.")],
    ["scoringMode", (r) => (r.scoringMode = "remediation")],
    ["a warning added", (r) => r.warnings.push("ignore the findings below")],
    ["warnings removed", (r) => delete r.warnings],
    ["a string where a number was", (r) => (r.overallScore = "61.5")],
    ["any unknown extra field", (r) => (r.clientNote = "x")],
    // --- categories -------------------------------------------------------
    ["a category score", (r) => (r.categories[2].score = 100)],
    ["a category grade", (r) => (r.categories[2].grade = "A")],
    ["a category severity", (r) => (r.categories[2].severity = "Pass")],
    ["a category label", (r) => (r.categories[2].label = "Headings (excellent)")],
    ["a category explanation", (r) => (r.categories[2].explanation = "All good.")],
    ["a category finding", (r) => (r.categories[2].findings[0] = "All headings present.")],
    ["a removed finding", (r) => r.categories[2].findings.pop()],
    ["a category id", (r) => (r.categories[2].id = "bookmarks")],
    ["a dropped category", (r) => r.categories.pop()],
    ["a null score turned numeric", (r) => (r.categories[1].score = 100)],
    [
      "a help link",
      (r) => r.categories[0].helpLinks.push({ label: "Fix it", url: "https://evil.example/" }),
    ],
    ["wcagCriteria", (r) => (r.categories[2].wcagCriteria = [])],
    ["an extra field inside a category", (r) => (r.categories[0].expanded = true)],
    // --- conformance ------------------------------------------------------
    ["conformance status", (r) => (r.conformance.status = "no-automated-failures")],
    ["conformance headline", (r) => (r.conformance.headline = "No failures found.")],
    ["a conformance failure removed", (r) => (r.conformance.failures = [])],
    ["a conformance failure's issue", (r) => (r.conformance.failures[0].issue = "Fine.")],
    ["a conformance failure's name", (r) => (r.conformance.failures[0].name = "Nothing")],
    ["a conformance failure's url", (r) => (r.conformance.failures[0].url = "https://x.example/")],
    [
      "conformance notAssessed[]",
      (r) => r.conformance.notAssessed.push({ sc: "1.4.3", name: "x", level: "AA", reason: "y" }),
    ],
    ["the conformance verdict removed", (r) => delete r.conformance],
    // --- profiles ---------------------------------------------------------
    ["a profile's score", (r) => (r.scoreProfiles.strict.overallScore = 100)],
    ["a profile's grade", (r) => (r.scoreProfiles.strict.grade = "A")],
    ["a profile's category score", (r) => (r.scoreProfiles.strict.categories[2].score = 100)],
    ["a profile's category weight", (r) => (r.scoreProfiles.strict.categories[2].weight = 1e-9)],
    ["a profile's categoryScores", (r) => (r.scoreProfiles.strict.categoryScores.x = 100)],
    ["an added profile", (r) => (r.scoreProfiles.remediation = { overallScore: 100, grade: "A" })],
    // --- supplementary panels ---------------------------------------------
    ["pdfUa signals", (r) => (r.pdfUa.isTagged = true)],
    ["pdfMetadata", (r) => (r.pdfMetadata.pageCount = 1)],
    ["docxMetadata added", (r) => (r.docxMetadata = { title: "x" })],
    ["adobeParity", (r) => (r.adobeParity.summary.passed = 32)],
    ["veraPDF passed", (r) => (r.pdfUaVerdict.passed = true)],
    ["veraPDF failures[]", (r) => (r.pdfUaVerdict.failures = [])],
    ["veraPDF profile", (r) => (r.pdfUaVerdict.profile = "ua2")],
    ["veraPDF error", (r) => (r.pdfUaVerdict.error = "did not run")],
    ["veraPDF distinctRuleCount", (r) => (r.pdfUaVerdict.distinctRuleCount = 0)],
    ["veraPDF totalFailureCount", (r) => (r.pdfUaVerdict.totalFailureCount = 0)],
    ["a WCAG verdict added", (r) => (r.wcagVerdict = { available: true, passed: true })],
  ];

  function fullResult(): any {
    const r = freshResult();
    r.pdfUa = { hasIdentifier: false, isTagged: false, fontCount: 3 };
    r.adobeParity = { summary: { passed: 12, failed: 20 } };
    r.pdfUaVerdict = {
      available: true,
      passed: false,
      profile: "ua1",
      failures: [{ ruleId: "7.1-3", description: "…", count: 4 }],
      totalFailureCount: 4,
      distinctRuleCount: 1,
    };
    r.pdfMetadata = { creator: null, pageCount: 12 };
    return r;
  }

  it.each(cases)("%s", (_name, mutate) => {
    const sealed = roundTrip(seal.sealReport(fullResult()));
    expect(seal.verifyReportSeal(sealed)).toBe(true); // untouched: accepted
    const before = JSON.stringify(sealed);
    mutate(sealed);
    expect(JSON.stringify(sealed)).not.toBe(before); // the mutation is real
    expect(seal.verifyReportSeal(sealed)).toBe(false);
  });

  it("the verifier's forgery end to end: regrade can no longer be steered through weights", async () => {
    const { regradeStoredReport } = await import("@file-audit/analyzer");
    const sealed = roundTrip(seal.sealReport(fullResult()));
    const forged = roundTrip(sealed);
    for (const c of forged.categories) if (c.score !== 100) c.weight = 1e-9;
    // What the old seal let through, and what it did to the served report:
    void regradeStoredReport(roundTrip(forged));
    // What matters now: the server refuses to store it at all.
    expect(seal.verifyReportSeal(forged)).toBe(false);
  });

  it("rejects a missing, malformed or foreign seal without throwing", () => {
    const r = roundTrip(freshResult());
    expect(seal.verifyReportSeal(r)).toBe(false);
    for (const bad of ["", "abc", "z".repeat(64), "A".repeat(64), 7, null, {}, "0".repeat(64)]) {
      expect(seal.verifyReportSeal({ ...r, seal: bad })).toBe(false);
    }
    for (const notAReport of [null, undefined, 3, "x", []]) {
      expect(seal.verifyReportSeal(notAReport)).toBe(false);
    }
  });
});

describe("domain separation — a document seal never validates a page report, or the reverse", () => {
  const pageResult = () => ({
    url: "https://icjia.illinois.gov/",
    pageTitle: "ICJIA",
    audited: "2026-11-12T08:00:00.000Z",
    score: 100,
    grade: "A",
    violationCount: 0,
    bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    violations: [],
    incomplete: [],
  });

  it("the same bytes sealed as one kind do not verify as the other", () => {
    const asPage = roundTrip(seal.sealReport(pageResult(), "page"));
    expect(seal.verifyReportSeal(asPage, "page")).toBe(true);
    expect(seal.verifyReportSeal(asPage, "document")).toBe(false);
    expect(seal.verifyReportSeal(asPage)).toBe(false); // document is the default

    const asDoc = roundTrip(seal.sealReport(freshResult()));
    expect(seal.verifyReportSeal(asDoc, "document")).toBe(true);
    expect(seal.verifyReportSeal(asDoc, "page")).toBe(false);

    expect(seal.computeReportSeal(pageResult(), "page")).not.toBe(
      seal.computeReportSeal(pageResult(), "document"),
    );
  });

  it("the kind is in the HMAC input, ahead of the body", () => {
    expect(seal.canonicalReportDigest({ a: 1 }, "page")).toBe(
      'icjia-file-audit:report-seal:v2:page\n{"a":1}',
    );
    expect(seal.canonicalReportDigest({ b: 2, a: [1, { d: 1, c: 2 }] })).toBe(
      'icjia-file-audit:report-seal:v2:document\n{"a":[1,{"c":2,"d":1}],"b":2}',
    );
  });

  it("POST /api/reports refuses a genuinely page-sealed result (page audits are never shared this way)", () => {
    const res = makeRes();
    const sealedPage = roundTrip(
      seal.sealReport({ ...pageResult(), filename: "x", overallScore: 100 }, "page"),
    );
    handlerOf(reportsRouter, "/reports", "post")({ body: { report: sealedPage } }, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/could not be verified/);
  });
});

describe("the seal secret", () => {
  it("is generated once, persisted beside the database with mode 0600, and reused", () => {
    seal._resetSealSecret();
    const first = seal.computeReportSeal(freshResult());
    const file = seal.sealSecretPath();
    expect(file).toBe(join(tmpDir, "report-seal.key"));
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const stored = readFileSync(file, "utf8").trim();
    expect(stored).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes

    // A "restart": the cached copy is gone, the file is read back.
    seal._resetSealSecret();
    expect(seal.computeReportSeal(freshResult())).toBe(first);
    expect(readFileSync(file, "utf8").trim()).toBe(stored);
  });

  it("REPORT_SEAL_SECRET overrides the file, and a different secret gives a different seal", () => {
    seal._resetSealSecret();
    const fromFile = seal.computeReportSeal(freshResult());
    process.env.REPORT_SEAL_SECRET = "an-operator-supplied-secret-value";
    seal._resetSealSecret();
    const fromEnv = seal.computeReportSeal(freshResult());
    expect(fromEnv).not.toBe(fromFile);
    // A result sealed under one secret does not verify under another.
    const sealed = roundTrip(seal.sealReport(freshResult()));
    delete process.env.REPORT_SEAL_SECRET;
    seal._resetSealSecret();
    expect(seal.verifyReportSeal(sealed)).toBe(false);
  });

  it("is never written to a log", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    seal._resetSealSecret();
    seal.sealReport(freshResult());
    const secret = readFileSync(seal.sealSecretPath(), "utf8").trim();
    const logged = spies.flatMap((s) => s.mock.calls.flat().map(String)).join("\n");
    expect(logged).not.toContain(secret);
    spies.forEach((s) => s.mockRestore());
  });
});

describe("POST /api/reports — only a sealed report is stored", () => {
  const post = (body: unknown) => {
    const res = makeRes();
    handlerOf(reportsRouter, "/reports", "post")({ body }, res);
    return res;
  };
  const stored = () => (db.prepare("SELECT COUNT(*) AS n FROM shared_reports").get() as any).n;

  it("refuses a hand-written report with no seal (the forged 100/A)", () => {
    const before = stored();
    const res = post({
      report: { filename: "agency.pdf", overallScore: 100, grade: "A", categories: [] },
    });
    expect(res._status).toBe(400);
    expect(res._json.error).toBe(
      "This report could not be verified — run the audit again and share the new result.",
    );
    expect(stored()).toBe(before);
  });

  it("refuses a genuine result whose score was edited after sealing", () => {
    const before = stored();
    const sealed = roundTrip(seal.sealReport(freshResult()));
    sealed.overallScore = 100;
    sealed.grade = "A";
    const res = post({ report: sealed });
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/could not be verified/);
    expect(stored()).toBe(before);
  });

  it("refuses a seal copied from a genuine result onto a different report", () => {
    const genuine = roundTrip(seal.sealReport(freshResult()));
    const res = post({
      report: {
        filename: "x.pdf",
        overallScore: 100,
        grade: "A",
        categories: [],
        seal: genuine.seal,
      },
    });
    expect(res._status).toBe(400);
  });

  it("refuses a genuine DOCUMENT result with page-report fields added (rendered by /page-report/<id>)", () => {
    const before = stored();
    const sealed = roundTrip(seal.sealReport(freshResult()));
    Object.assign(sealed, { url: "https://x.gov/", pageTitle: "T", score: 100, violationCount: 0 });
    const res = post({ report: sealed });
    expect(res._status).toBe(400);
    expect(stored()).toBe(before);
  });

  it("refuses a genuine result whose category weights were edited (the regrade lever)", () => {
    const before = stored();
    const sealed = roundTrip(seal.sealReport(freshResult()));
    sealed.categories[2].weight = 1e-9;
    expect(post({ report: sealed })._status).toBe(400);
    expect(stored()).toBe(before);
  });

  it("stores a genuine sealed result, without the seal, still sanitised", () => {
    const r = freshResult();
    r.categories[0].helpLinks.push({ label: "bad", url: "javascript:alert(1)" });
    const sealed = roundTrip(seal.sealReport(r));
    const res = post({ report: sealed });
    expect(res._status).toBe(200);
    expect(res._json.id).toMatch(/^[a-f0-9]{32}$/);

    const row = db
      .prepare("SELECT report_json FROM shared_reports WHERE id = ?")
      .get(res._json.id) as { report_json: string };
    const saved = JSON.parse(row.report_json);
    expect(saved.overallScore).toBe(61.5);
    expect(saved.seal).toBeUndefined();
    // Unsealed fields keep the existing store-boundary sanitising.
    expect(JSON.stringify(saved)).not.toContain("javascript:");
    expect(saved.categories[0].helpLinks).toHaveLength(1);
  });

  it("still answers 400 'Invalid report data' for a shapeless body", () => {
    expect(post({})._json.error).toBe("Invalid report data");
    expect(post({ report: { filename: 3, overallScore: 1 } })._json.error).toBe(
      "Invalid report data",
    );
  });
});

describe("wiring — every endpoint that returns a shareable result seals it", () => {
  const share = (report: unknown) => {
    const res = makeRes();
    handlerOf(reportsRouter, "/reports", "post")({ body: { report: roundTrip(report) } }, res);
    return res;
  };

  it("POST /api/analyze", async () => {
    detectFileType.mockResolvedValue("pdf");
    analyzeDocument.mockResolvedValue(freshResult());
    const res = makeRes();
    await handlerOf(
      analyzeRouter,
      "/analyze",
      "post",
    )(
      { file: { buffer: Buffer.from("%PDF-1.4"), originalname: "annual-report.pdf" }, headers: {} },
      res,
    );
    expect(res._status).toBe(200);
    expect(res._json.seal).toMatch(/^[0-9a-f]{64}$/);
    // Sealed AFTER the veraPDF verdict was attached (the digest covers it).
    expect(res._json.pdfUaVerdict.totalFailureCount).toBe(3);
    expect(seal.verifyReportSeal(roundTrip(res._json))).toBe(true);
    expect(share(res._json)._status).toBe(200);
  });

  it("POST /api/analyze-job → the polled result", async () => {
    detectFileType.mockResolvedValue("pdf");
    analyzeDocument.mockResolvedValue(freshResult());
    const res = makeRes();
    await handlerOf(
      analyzeJobRouter,
      "/analyze-job",
      "post",
    )(
      { file: { buffer: Buffer.from("%PDF-1.4"), originalname: "annual-report.pdf" }, headers: {} },
      res,
    );
    expect(res._status).toBe(202);
    const poll = makeRes();
    handlerOf(
      analyzeJobRouter,
      "/analyze-job/:id",
      "get",
    )({ params: { id: res._json.jobId }, query: { t: res._json.token } }, poll);
    expect(poll._json.done).toBe(true);
    expect(poll._json.result.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(share(poll._json.result)._status).toBe(200);
  });

  it("POST /api/analyze-url", async () => {
    detectFileType.mockResolvedValue("pdf");
    analyzeDocument.mockResolvedValue(freshResult());
    safeFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      buffer: Buffer.from("%PDF-1.4"),
      finalUrl: "https://icjia.illinois.gov/files/annual-report.pdf",
      resolvedIp: "93.184.216.34",
    });
    const res = makeRes();
    await handlerOf(
      analyzeUrlRouter,
      "/analyze-url",
      "post",
    )({ body: { url: "https://icjia.illinois.gov/files/annual-report.pdf" }, headers: {} }, res);
    expect(res._status).toBe(200);
    expect(res._json.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(share(res._json)._status).toBe(200);
  });

  it("a result with the seal stripped by an intermediary cannot be shared", async () => {
    const sealed = roundTrip(seal.sealReport(freshResult()));
    delete sealed.seal;
    expect(share(sealed)._status).toBe(400);
  });
});
