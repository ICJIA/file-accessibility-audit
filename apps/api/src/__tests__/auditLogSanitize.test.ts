/**
 * Storage hygiene for audit_log's attacker-controlled text columns.
 *
 * Red/blue audit 2026-08-05, finding R1: the multer file filter passed
 * `file.originalname` straight to recordRejectedUpload, so a refused upload
 * persisted its filename verbatim — confirmed empirically with a 4,040-char
 * name carrying raw `<img src=x onerror=...>`. Those rows are returned by the
 * admin-only `/api/logs` (a `SELECT *`), so untrusted text reached an
 * authenticated UI with only Vue's default escaping between it and a problem,
 * and the rejection path is the cheapest request to make (refused at the
 * filter, before the body is even buffered).
 *
 * The fix is at the WRITER, not the call sites, so a future caller cannot
 * reintroduce it by forgetting — the same reasoning as the NULL content_hash
 * that keeps a refusal from satisfying the remediation audit-gate.
 */
import { describe, it, expect } from "vitest";
import { sanitizeStoredFilename } from "../services/auditLog.js";
import { FILENAME } from "#config";

describe("sanitizeStoredFilename — the R1 regression guard", () => {
  it("strips markup out of a filename", () => {
    const out = sanitizeStoredFilename('<img src=x onerror="alert(1)">.csv');
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain('"');
  });

  it("caps an over-long filename at FILENAME.MAX_LENGTH", () => {
    // The empirical repro was 4,040 characters.
    const out = sanitizeStoredFilename("A".repeat(4000) + ".csv");
    expect(out.length).toBeLessThanOrEqual(FILENAME.MAX_LENGTH);
  });

  it("removes newlines, so a filename cannot forge a second log line", () => {
    const out = sanitizeStoredFilename("real.csv\nINJECTED-LINE\r\nmore.csv");
    expect(out).not.toContain("\n");
    expect(out).not.toContain("\r");
  });

  it("reduces a traversal attempt to its basename", () => {
    expect(sanitizeStoredFilename("../../../etc/passwd")).toBe("passwd");
    expect(sanitizeStoredFilename("/absolute/path/report.pdf")).toBe("report.pdf");
  });

  it("never returns an empty string", () => {
    // An all-illegal name must still produce a storable value, since
    // audit_log.filename is written on every row.
    expect(sanitizeStoredFilename("///")).toBe("unnamed_file");
    expect(sanitizeStoredFilename("")).toBe("unnamed_file");
  });

  it("leaves an ordinary filename untouched", () => {
    // The guard must not corrupt the overwhelmingly common case.
    for (const name of ["report.pdf", "Annual Report 2026.docx", "data-set_v2.xlsx"]) {
      expect(sanitizeStoredFilename(name)).toBe(name);
    }
  });

  it("is idempotent, so double-sanitising is harmless", () => {
    // routes/analyze.ts sanitises before calling recordRejectedUpload, which
    // sanitises again. That must be a no-op rather than progressive mangling.
    const once = sanitizeStoredFilename("<weird>/name.csv");
    expect(sanitizeStoredFilename(once)).toBe(once);
  });
});
