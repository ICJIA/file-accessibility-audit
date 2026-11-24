import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import {
  HIDDEN_POLL_INTERVAL_MS,
  MAX_CONSECUTIVE_POLL_FAILURES,
  REMEDIATION_LOST_CONTACT_MESSAGE,
  useRemediationJob,
} from "../composables/useRemediationJob";

// ---------------------------------------------------------------------------
// Unit tests for the useRemediationJob polling composable.
//
// The 2026-07 "auto remediate reported Too many requests" bug: the old
// 250 ms poll (240 req/min) blew through the anonymous global rate limit
// (100 req/min) ~25 s into any longer job, and the resulting 429 was
// surfaced as a sticky error banner that never cleared. These tests pin
// the fixed contract:
//   - 1 s base cadence (self-scheduling, no overlapping request stacking)
//   - 429 → silent exponential backoff (2 s, 4 s, capped 8 s), no banner
//   - any successful poll clears a previously shown error
//   - 404 / terminal-status / unmount all stop the loop (pre-existing
//     behavior, pinned through the rewrite)
// ---------------------------------------------------------------------------

const RATE_LIMITED = {
  status: 429,
  data: { error: "Too many requests. Please slow down." },
};

function runningStatus(over: Record<string, unknown> = {}) {
  return {
    jobId: "job-1",
    status: "running",
    step: "tagging",
    progressPct: 40,
    inputScore: null,
    outputScore: null,
    outputValid: null,
    failureReason: null,
    createdAt: 1_000,
    completedAt: null,
    expiresAt: 9_999_999,
    ...over,
  };
}

const fetchMock = vi.fn();
// Every mounted poller is unmounted after its test: each one listens for
// `visibilitychange` on the shared document, so a leftover from an earlier
// test would answer a later test's event.
const mounted: Array<{ unmount: () => void }> = [];

function mountComposable(jobId = "job-1", token?: string) {
  let out!: ReturnType<typeof useRemediationJob>;
  const Comp = defineComponent({
    setup() {
      out = useRemediationJob(jobId, token);
      return () => h("div");
    },
  });
  const wrapper = mount(Comp);
  mounted.push(wrapper);
  return { wrapper, out };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  (globalThis as any).$fetch = fetchMock;
});

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  vi.useRealTimers();
});

describe("useRemediationJob polling cadence", () => {
  it("polls the status endpoint at a 1-second base cadence", async () => {
    fetchMock.mockImplementation(async () => runningStatus());
    mountComposable();

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/remediate/job-1/status", {
      credentials: "include",
    });

    // Nothing more until a full second has elapsed (the old 250 ms
    // cadence would have fired 3 more polls by 999 ms).
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("useRemediationJob 429 handling", () => {
  it("does not surface 429 as an error and backs off, resetting on success", async () => {
    fetchMock
      .mockResolvedValueOnce(runningStatus()) // t=0    ok
      .mockRejectedValueOnce(RATE_LIMITED) // t=1000 429 → wait 2000
      .mockRejectedValueOnce(RATE_LIMITED) // t=3000 429 → wait 4000
      .mockResolvedValue(runningStatus()); // t=7000 ok  → back to 1000
    const { out } = mountComposable();

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The 429 is throttling feedback for the poller, not a job failure —
    // the user must not see an error banner.
    expect(out.error.value).toBeNull();

    // Backed off: no poll until t=3000
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out.error.value).toBeNull();

    // Backed off again: no poll until t=7000
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Success resets the cadence to 1 s
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("caps the backoff at 8 seconds under sustained 429s", async () => {
    fetchMock.mockRejectedValue(RATE_LIMITED);
    mountComposable();

    // Polls at t=0, 2000, 6000, 14000 (2s → 4s → 8s), then capped:
    // next at t=22000, NOT t=30000+.
    await vi.advanceTimersByTimeAsync(14_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe("useRemediationJob error recovery", () => {
  it("clears a previously shown error once a later poll succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce({ status: 500, data: { error: "Internal error" } })
      .mockResolvedValue(runningStatus());
    const { out } = mountComposable();

    await vi.advanceTimersByTimeAsync(0);
    expect(out.error.value).toBe("Internal error");

    // Next poll (errors also back off to 2 s) succeeds → banner clears.
    await vi.advanceTimersByTimeAsync(2000);
    expect(out.error.value).toBeNull();
    expect(out.status.value).toMatchObject({ status: "running" });
  });
});

describe("useRemediationJob terminal states (pinned behavior)", () => {
  it("stops polling and reports a terminal error on 404", async () => {
    fetchMock.mockRejectedValue({ status: 404, data: { error: "Job not found" } });
    const { out } = mountComposable();

    await vi.advanceTimersByTimeAsync(0);
    expect(out.error.value).toBe("Remediation job not found.");
    expect(out.isTerminal.value).toBe(true);

    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("stops polling on a terminal status and fetches the receipt once", async () => {
    const receipt = {
      jobId: "job-1",
      filename: "r.pdf",
      contentHash: "h",
      status: "complete",
      inputScore: 40,
      outputScore: 90,
      createdAt: 1_000,
      completedAt: 2_000,
      inputAudit: null,
      outputAudit: null,
      veraPdf: null,
      events: [],
    };
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/receipt")
        ? receipt
        : runningStatus({ status: "complete", completedAt: 2_000 }),
    );
    const { out } = mountComposable();

    await vi.advanceTimersByTimeAsync(0);
    expect(out.isTerminal.value).toBe(true);
    expect(out.receipt.value).toMatchObject({ jobId: "job-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // status + receipt, nothing else

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops polling when the component unmounts", async () => {
    fetchMock.mockImplementation(async () => runningStatus());
    const { wrapper } = mountComposable();

    await vi.advanceTimersByTimeAsync(1000);
    const calls = fetchMock.mock.calls.length;
    wrapper.unmount();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});

describe("useRemediationJob: job-token passthrough (C5 anonymous-mode authorization)", () => {
  // The API now requires the job's download token (returned at creation,
  // threaded through the result page's ?t= query param) on status/receipt
  // reads whenever the caller isn't a logged-in owner — see
  // apps/api/src/routes/remediate.ts. The poller must forward it.

  it("appends ?token=<token> to the status request when a token is provided", async () => {
    fetchMock.mockImplementation(async () => runningStatus());
    mountComposable("job-1", "secret-token");

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith("/api/remediate/job-1/status?token=secret-token", {
      credentials: "include",
    });
  });

  it("appends ?token=<token> to the receipt request too, once the job reaches a terminal state", async () => {
    const receipt = {
      jobId: "job-1",
      filename: "r.pdf",
      contentHash: "h",
      status: "complete",
      inputScore: 40,
      outputScore: 90,
      createdAt: 1_000,
      completedAt: 2_000,
      inputAudit: null,
      outputAudit: null,
      veraPdf: null,
      events: [],
    };
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/receipt")
        ? receipt
        : runningStatus({ status: "complete", completedAt: 2_000 }),
    );
    mountComposable("job-1", "secret-token");

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith("/api/remediate/job-1/receipt?token=secret-token", {
      credentials: "include",
    });
  });

  it("URL-encodes a token containing special characters", async () => {
    fetchMock.mockImplementation(async () => runningStatus());
    mountComposable("job-1", "a+b/c=d");

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/remediate/job-1/status?token=${encodeURIComponent("a+b/c=d")}`,
      { credentials: "include" },
    );
  });

  it("omits the query string entirely when no token is provided (backward compatible — matches the pre-C5 URL exactly)", async () => {
    fetchMock.mockImplementation(async () => runningStatus());
    mountComposable("job-1");

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith("/api/remediate/job-1/status", {
      credentials: "include",
    });
  });
});

// ---------------------------------------------------------------------------
// The poller must be able to give up. It used to retry any persistent non-404
// failure every 8 s for as long as the tab stayed open, hidden or not.
// ---------------------------------------------------------------------------
describe("useRemediationJob: bounded failures, Retry-After, hidden tabs", () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }
  afterEach(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("stops after a bounded run of consecutive failures and reports lost contact", async () => {
    fetchMock.mockRejectedValue({ status: 503, data: { error: "Service unavailable" } });
    const { out } = mountComposable();

    await vi.advanceTimersByTimeAsync(0);
    expect(out.lostContact.value).toBe(false);
    expect(out.error.value).toBe("Service unavailable");

    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONSECUTIVE_POLL_FAILURES);
    expect(out.lostContact.value).toBe(true);
    expect(out.error.value).toBe(REMEDIATION_LOST_CONTACT_MESSAGE);
    expect(out.error.value).toMatch(/reload this page/);
    // Not an answer about the job: it must never render as an outcome.
    expect(out.isTerminal.value).toBe(false);
    expect(out.loading.value).toBe(false);

    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONSECUTIVE_POLL_FAILURES);
  });

  it("gives up on sustained 429s too, and on requests that never get an answer", async () => {
    fetchMock.mockRejectedValue(RATE_LIMITED);
    const a = mountComposable();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(a.out.lostContact.value).toBe(true);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const b = mountComposable();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(b.out.lostContact.value).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_CONSECUTIVE_POLL_FAILURES);
  });

  it("a success in between resets the run of failures", async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => {
      n++;
      // Every 5th check answers; the run never reaches the bound.
      if (n % 5 === 0) return runningStatus();
      throw { status: 502, data: { error: "Bad gateway" } };
    });
    const { out } = mountComposable();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(out.lostContact.value).toBe(false);
    expect(n).toBeGreaterThan(MAX_CONSECUTIVE_POLL_FAILURES * 2);
  });

  it("honours Retry-After when it asks for longer than the backoff", async () => {
    fetchMock
      .mockRejectedValueOnce({
        status: 429,
        data: {},
        response: { headers: new Headers({ "retry-after": "5" }) },
      })
      .mockResolvedValue(runningStatus());
    mountComposable();

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps an unreasonable Retry-After at 30 seconds", async () => {
    fetchMock
      .mockRejectedValueOnce({
        status: 503,
        data: {},
        response: { headers: { "retry-after": "3600" } },
      })
      .mockResolvedValue(runningStatus());
    mountComposable();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("slows to the hidden cadence while the tab is hidden, and asks at once when shown", async () => {
    fetchMock.mockImplementation(async () => runningStatus());
    mountComposable();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setHidden(true);
    // The wait already scheduled (1 s) runs out, then the hidden cadence applies.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(HIDDEN_POLL_INTERVAL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Shown again part-way through a hidden wait: one check now, then 1 s.
    await vi.advanceTimersByTimeAsync(3_000);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("removes its visibility listener on unmount and when the job ends", async () => {
    const remove = vi.spyOn(document, "removeEventListener");
    fetchMock.mockImplementation(async () => runningStatus());
    const { wrapper } = mountComposable();
    await vi.advanceTimersByTimeAsync(0);
    wrapper.unmount();
    expect(remove.mock.calls.some(([type]) => type === "visibilitychange")).toBe(true);

    const calls = fetchMock.mock.calls.length;
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
    remove.mockRestore();
  });
});
