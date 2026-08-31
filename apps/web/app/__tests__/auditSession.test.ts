import { describe, it, expect } from "vitest";
import {
  clearAuditSession,
  readAuditSession,
  saveFinishedAudit,
  saveRunningAudit,
  type SessionStore,
} from "~/utils/auditSession";

/** An in-memory sessionStorage. `failWrites` reproduces a full quota or
 *  blocked site data, where setItem throws. */
function makeStore(failWrites = false): SessionStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
  };
}

const V = "1.147.0";
const TTL = 10 * 60 * 1000;
const opts = (now: number, appVersion = V) => ({ now, appVersion, ttlMs: TTL });

describe("auditSession — rejoining an audit after a page load", () => {
  it("round-trips a running job so a reloaded tab can rejoin it", () => {
    const st = makeStore();
    expect(
      saveRunningAudit(
        {
          jobId: "job-1",
          token: "tok-1",
          filename: "Annual Report.pdf",
          fileType: "pdf",
          startedAt: 1_000,
          appVersion: V,
        },
        st,
      ),
    ).toBe(true);
    const back = readAuditSession(opts(1_000 + 5_000), st);
    expect(back).toMatchObject({
      kind: "running",
      jobId: "job-1",
      token: "tok-1",
      filename: "Annual Report.pdf",
      fileType: "pdf",
    });
  });

  it("round-trips a finished report", () => {
    const st = makeStore();
    saveFinishedAudit(
      { result: { score: 91 } as never, filename: "a.pdf", savedAt: 5, appVersion: V },
      st,
    );
    const back = readAuditSession(opts(9_000), st);
    expect(back?.kind).toBe("result");
    expect((back as unknown as { result: { score: number } }).result.score).toBe(91);
  });

  it("refuses a running job older than the server's own TTL, and clears it", () => {
    // Resuming past the sweep would poll straight into a 404. Better to show
    // the upload form than a spinner for a job that no longer exists.
    const st = makeStore();
    saveRunningAudit(
      { jobId: "j", token: "t", filename: "a.pdf", fileType: "pdf", startedAt: 0, appVersion: V },
      st,
    );
    expect(readAuditSession(opts(TTL + 1), st)).toBeNull();
    expect(st.map.size).toBe(0);
  });

  it("refuses anything written by a different app version", () => {
    // A deploy can land mid-session; a stored result is a shape this build may
    // no longer render. The report is not worth a broken page.
    const st = makeStore();
    saveFinishedAudit(
      { result: { score: 1 } as never, filename: "a.pdf", savedAt: 0, appVersion: "1.146.0" },
      st,
    );
    expect(readAuditSession(opts(1), st)).toBeNull();
    expect(st.map.size).toBe(0);
  });

  it("survives storage that throws on write, and reports the failure", () => {
    // The caller uses this to decide whether leaving would lose the audit.
    const st = makeStore(true);
    expect(
      saveRunningAudit(
        { jobId: "j", token: "t", filename: "a.pdf", fileType: "pdf", startedAt: 0, appVersion: V },
        st,
      ),
    ).toBe(false);
    expect(readAuditSession(opts(1), st)).toBeNull();
  });

  it("discards malformed or truncated payloads instead of rendering them", () => {
    const st = makeStore();
    for (const junk of ["not json", "null", '{"kind":"running"}', '{"kind":"nonsense"}', "[]"]) {
      st.map.set("fa:audit-session:v1", junk);
      expect(readAuditSession(opts(1), st), junk).toBeNull();
      expect(st.map.size, junk).toBe(0);
    }
  });

  it("never throws when storage is unavailable entirely", () => {
    const hostile: SessionStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => readAuditSession(opts(1), hostile)).not.toThrow();
    expect(readAuditSession(opts(1), hostile)).toBeNull();
    expect(() => clearAuditSession(hostile)).not.toThrow();
    expect(
      saveRunningAudit(
        { jobId: "j", token: "t", filename: "a", fileType: null, startedAt: 0, appVersion: V },
        hostile,
      ),
    ).toBe(false);
  });
});
