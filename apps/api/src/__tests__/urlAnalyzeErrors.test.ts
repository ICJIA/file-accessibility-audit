/**
 * One error mapping for every analysis path.
 *
 * /api/analyze-url and /api/audit-url kept their own copies of the error
 * chain, and the copies had no password-protected and no unreadable branch:
 * the same encrypted or corrupt PDF answered 422 as an upload and 500
 * "Internal server error" by URL. All paths now go through mapAnalyzeError
 * (services/analyzeCore.ts).
 *
 * The whole app is assembled (app.ts) behind a real listener; the analysis is
 * the real one, run on a PDF that qpdf really encrypted. Only the outbound
 * fetch is stubbed — it returns the bytes a remote server would have sent.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { root, remote } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/url-analyze-errors-test-${process.pid}-${Date.now()}`;
  process.env.DB_PATH = `${root}/test.db`;
  process.env.ACTIVITY_LOG_DIR = `${root}/logs`;
  process.env.TMP_DIR = `${root}/tmp`;
  return { root, remote: { body: Buffer.alloc(0) as Buffer } };
});

vi.mock("../services/safeFetch.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/safeFetch.js")>()),
  safeFetch: vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    buffer: remote.body,
    finalUrl: url,
    headers: new Headers(),
  })),
}));

let server: Server;
let baseUrl = "";
let db: (typeof import("../db/sqlite.js"))["default"];
let encrypted: Buffer;
const corrupt = Buffer.from("%PDF-1.4\nthis is not a PDF at all\n%%EOF\n");
const URL_OK = "https://icjia.illinois.gov/files/report.pdf";

beforeAll(async () => {
  mkdirSync(root, { recursive: true });
  // A PDF that needs a password to OPEN (a user password), made by qpdf.
  const out = `${root}/encrypted.pdf`;
  execFileSync(process.env.QPDF_PATH || "qpdf", [
    "--encrypt",
    "user-password",
    "owner-password",
    "256",
    "--",
    new URL("./fixtures/accessible.pdf", import.meta.url).pathname,
    out,
  ]);
  encrypted = readFileSync(out);

  db = (await import("../db/sqlite.js")).default;
  const { createApp } = await import("../app.js");
  await new Promise<void>((r) => {
    server = createApp().listen(0, "127.0.0.1", r);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM audit_log; DELETE FROM shared_reports;");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const postUrl = (path: string) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: URL_OK }),
  });

async function upload(buf: Buffer): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: "application/pdf" }), "report.pdf");
  return fetch(`${baseUrl}/api/analyze`, { method: "POST", body: form });
}

const failureRows = () =>
  db
    .prepare("SELECT event_type, filename, reason FROM audit_log WHERE event_type LIKE '%-failed'")
    .all() as Array<{ event_type: string; filename: string; reason: string }>;

describe("a password-protected PDF", () => {
  it("the fixture really is encrypted", async () => {
    const { declaresEncryption } = await import("../services/analyzeCore.js");
    expect(declaresEncryption(encrypted)).toBe(true);
    expect(
      declaresEncryption(readFileSync(new URL("./fixtures/accessible.pdf", import.meta.url))),
    ).toBe(false);
  });

  it("uploaded: 422, named as password-protected", async () => {
    const res = await upload(encrypted);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("This PDF is password-protected.");
    expect(body.code).toBe("FILE_ENCRYPTED");
  });

  it.each(["/api/analyze-url", "/api/audit-url"])(
    "by URL through %s: the SAME 422, not a 500",
    async (path) => {
      remote.body = encrypted;
      const uploaded = await (await upload(encrypted)).json();
      db.exec("DELETE FROM audit_log");

      const res = await postUrl(path);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body).toEqual(uploaded);
      expect(body.code).toBe("FILE_ENCRYPTED");

      // Recorded as this route's failed audit, under the URL that was asked for.
      expect(failureRows()).toEqual([
        { event_type: `${path.slice(5)}-failed`, filename: URL_OK, reason: "unreadable" },
      ]);
      // And nothing was stored for it.
      expect(db.prepare("SELECT COUNT(*) AS n FROM shared_reports").get()).toEqual({ n: 0 });
    },
  );
});

describe("a corrupt PDF", () => {
  it.each(["/api/analyze-url", "/api/audit-url"])(
    "by URL through %s: 422 unreadable, as the same upload answers",
    async (path) => {
      remote.body = corrupt;
      const up = await upload(corrupt);
      const uploaded = await up.json();
      expect(up.status).toBe(422);
      expect(uploaded.error).toBe("This file could not be analyzed.");
      expect(uploaded.code).toBe("FILE_UNREADABLE");

      const res = await postUrl(path);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual(uploaded);
    },
  );
});

describe("mapAnalyzeError — what differs between callers, and what does not", () => {
  it("URL callers keep their own wording for the same failure, with the same status and code", async () => {
    const { mapAnalyzeError } = await import("../services/analyzeCore.js");
    for (const [code, uploadText, urlText] of [
      [
        "DOCX_PARSE_FAILED",
        "This Word document could not be read.",
        "The fetched Word document could not be read.",
      ],
      [
        "PPTX_PARSE_FAILED",
        "This PowerPoint file could not be read.",
        "The fetched PowerPoint file could not be read.",
      ],
      [
        "XLSX_PARSE_FAILED",
        "This Excel file could not be read.",
        "The fetched Excel file could not be read.",
      ],
    ] as const) {
      const up = mapAnalyzeError({ code }, undefined, false, { record: false });
      const byUrl = mapAnalyzeError({ code }, undefined, false, { record: false, source: "url" });
      expect(up.body.error).toBe(uploadText);
      expect(byUrl.body.error).toBe(urlText);
      expect(byUrl.status).toBe(up.status);
      expect(byUrl.body.code).toBe("FILE_UNREADABLE");
      expect(byUrl.body.details).toBe(up.body.details);
    }
    const busy = mapAnalyzeError({ status: 503 }, undefined, false, { source: "url" });
    expect(busy.status).toBe(503);
    expect(busy.body).toEqual({
      error: "The server is busy processing other files.",
      details: "Please wait a moment and try again.",
      code: "SERVER_BUSY",
    });
  });

  it("every mapped body carries a code from the published list", async () => {
    const { mapAnalyzeError } = await import("../services/analyzeCore.js");
    const { API_ERROR_CODES } = await import("../services/apiError.js");
    const errs = [
      { status: 503 },
      { code: "UNSUPPORTED_FILE_TYPE" },
      { code: "DOCX_DISABLED" },
      { code: "PPTX_DISABLED" },
      { code: "XLSX_DISABLED" },
      { code: "DOCX_PARSE_FAILED" },
      { code: "PPTX_PARSE_FAILED" },
      { code: "XLSX_PARSE_FAILED" },
      { message: "encrypted" },
      { code: "ETIMEDOUT" },
      { killed: true },
      { message: "anything else" },
    ];
    for (const e of errs) {
      const m = mapAnalyzeError(e, undefined, false, { record: false });
      expect(API_ERROR_CODES, JSON.stringify(e)).toContain(m.body.code);
      expect(m.body.error.length).toBeGreaterThan(0);
    }
  });

  it("record: false writes no audit_log row; the default does", async () => {
    const { mapAnalyzeError } = await import("../services/analyzeCore.js");
    const file = { originalname: "a.pdf", buffer: Buffer.from("%PDF-1.4") };
    mapAnalyzeError({ code: "ETIMEDOUT" }, file, false, { record: false });
    expect(failureRows()).toEqual([]);
    mapAnalyzeError({ code: "ETIMEDOUT" }, file, false);
    expect(failureRows()).toEqual([
      { event_type: "analyze-failed", filename: "a.pdf", reason: "timeout" },
    ]);
  });
});

describe("bulk-from-inventory entries and the remediation preflight use the same mapping", () => {
  it("a bulk entry's errorCode is the mapping's code; its sentence is unchanged", async () => {
    const { entryErrorCode, mapEntryError } = await import("../routes/bulk-from-inventory.js");
    expect(entryErrorCode(new Error("encrypted"))).toBe("FILE_ENCRYPTED");
    expect(mapEntryError(new Error("encrypted"))).toBe(
      "PDF is password-protected and cannot be analyzed",
    );
    expect(entryErrorCode({ code: "DOCX_PARSE_FAILED" })).toBe("FILE_UNREADABLE");
    expect(entryErrorCode({ code: "XLSX_DISABLED" })).toBe("FORMAT_DISABLED");
    expect(entryErrorCode({ killed: true })).toBe("TIMEOUT");
    expect(entryErrorCode({ status: 503 })).toBe("SERVER_BUSY");
    // …and asking for a code records nothing (the route keeps its own rows).
    expect(failureRows()).toEqual([]);
  });

  it("WIRING: /remediate maps a failed preflight instead of answering 500", () => {
    const src = readFileSync(new URL("../routes/remediate.ts", import.meta.url), "utf8");
    const preflight = src.slice(
      src.indexOf("preflight = await analyzePDF(file.buffer, filename);"),
      src.indexOf("if (preflight.pageCount && preflight.pageCount"),
    );
    expect(preflight).toContain("mapAnalyzeError(");
    expect(preflight).toContain("record: false");
    expect(preflight).toContain("setBusyRetryAfter(res)");
  });
});
