/**
 * classifyAuditFailure maps whatever an audit route catches onto a CLOSED set
 * of one-word reasons (or null = "not an audit failure, record nothing").
 * The reason is stored in audit_log.reason and exported to the daily activity
 * CSV, so it must never be error text — messages embed file names, URLs and
 * library paths. Every rule of the spec's § 1.4 table is pinned here against
 * the real error shapes the routes see today.
 */
import { describe, it, expect } from "vitest";
import { SafeFetchError } from "../services/safeFetch.js";
import { AUDIT_FAILURE_REASONS, classifyAuditFailure } from "../services/auditFailure.js";

const withCode = (code: string, message = "x") => Object.assign(new Error(message), { code });

describe("classifyAuditFailure — the closed reason set", () => {
  it("a SafeFetchError is fetch-failed whatever its code or message says", () => {
    expect(classifyAuditFailure(new SafeFetchError("dns_failed", "getaddrinfo ENOTFOUND"))).toBe(
      "fetch-failed",
    );
    // Its own code set has a lowercase "timeout" — still a fetch outcome.
    expect(classifyAuditFailure(new SafeFetchError("timeout", "fetch timed out"))).toBe(
      "fetch-failed",
    );
    expect(classifyAuditFailure(new SafeFetchError("oversized", "too large"))).toBe("fetch-failed");
  });

  it("capacity is not an outcome: status 503 records nothing", () => {
    expect(classifyAuditFailure(Object.assign(new Error("busy"), { status: 503 }))).toBeNull();
  });

  it("refusals record nothing here (rejected-upload already covers them)", () => {
    for (const code of [
      "UNSUPPORTED_FILE_TYPE",
      "DOCX_DISABLED",
      "PPTX_DISABLED",
      "XLSX_DISABLED",
    ]) {
      expect(classifyAuditFailure(withCode(code)), code).toBeNull();
    }
  });

  it("a parser that could not read the bytes is unreadable", () => {
    for (const code of [
      "PDF_PARSE_FAILED",
      "DOCX_PARSE_FAILED",
      "PPTX_PARSE_FAILED",
      "XLSX_PARSE_FAILED",
    ]) {
      expect(classifyAuditFailure(withCode(code)), code).toBe("unreadable");
    }
    expect(classifyAuditFailure(new Error("PDF is encrypted"))).toBe("unreadable");
    expect(classifyAuditFailure(new Error("password required to open"))).toBe("unreadable");
  });

  it("timeouts in every shape the engines produce are timeout", () => {
    expect(classifyAuditFailure(withCode("ETIMEDOUT"))).toBe("timeout");
    expect(classifyAuditFailure(Object.assign(new Error("killed"), { killed: true }))).toBe(
      "timeout",
    );
    expect(classifyAuditFailure(Object.assign(new Error("slow"), { name: "TimeoutError" }))).toBe(
      "timeout",
    );
    expect(classifyAuditFailure(new Error("Navigation timeout of 30000 ms exceeded"))).toBe(
      "timeout",
    );
    expect(classifyAuditFailure(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(
      "timeout",
    );
  });

  it("a Chromium navigation error is navigation-failed", () => {
    expect(
      classifyAuditFailure(new Error("net::ERR_ABORTED at https://example.gov/files/brief.pdf")),
    ).toBe("navigation-failed");
    // "TIMED_OUT" is not "timeout": the navigation rule wins over the fallback.
    expect(classifyAuditFailure(new Error("net::ERR_CONNECTION_TIMED_OUT at https://x"))).toBe(
      "navigation-failed",
    );
  });

  it("everything else — including non-Error throwables — is internal", () => {
    expect(classifyAuditFailure(new Error("boom"))).toBe("internal");
    expect(classifyAuditFailure("a string")).toBe("internal");
    expect(classifyAuditFailure(undefined)).toBe("internal");
    expect(classifyAuditFailure(null)).toBe("internal");
    expect(classifyAuditFailure(42)).toBe("internal");
  });

  it("never returns anything outside the closed set, and never the message", () => {
    const secret = "xyzzy-/srv/app/chromium/profile-9f3ac";
    const samples: unknown[] = [
      new Error(secret),
      withCode("PDF_PARSE_FAILED", secret),
      new Error(`net::ERR_FAILED at ${secret}`),
      new SafeFetchError("network_error", secret),
      Object.assign(new Error(secret), { status: 503 }),
    ];
    for (const s of samples) {
      const r = classifyAuditFailure(s);
      if (r === null) continue;
      expect(AUDIT_FAILURE_REASONS).toContain(r);
      expect(r).not.toContain("xyzzy");
    }
  });
});
