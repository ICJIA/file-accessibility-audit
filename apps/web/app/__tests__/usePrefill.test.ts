import "./test-helpers";
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Unit tests for the usePrefill composable
// ---------------------------------------------------------------------------
// The composable is deliberately thin: it reads window.location.search and
// calls $fetch. We test the branching logic without mounting a Nuxt app by
// reimplementing the callback dispatch as a test-local helper — the same
// approach the bulk-from-inventory tests use.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers: replicate the dispatch logic from usePrefill.ts
// ---------------------------------------------------------------------------

interface PrefillError {
  error: string;
  details?: string;
}
interface PrefillCallbacks {
  onStart: (url: string) => void;
  onResult: (result: any) => void;
  onError: (err: PrefillError) => void;
  onDone: () => void;
}

async function simulatePrefill(
  search: string,
  fetchImpl: (url: string, opts: any) => Promise<any>,
  navigateTo: (path: string) => void,
  callbacks: PrefillCallbacks,
) {
  const params = new URLSearchParams(search);
  const rawUrl = params.get("prefill");
  if (!rawUrl) return;

  let url: string;
  try {
    url = decodeURIComponent(rawUrl);
  } catch {
    callbacks.onError({ error: "Invalid prefill URL (could not decode)." });
    return;
  }

  callbacks.onStart(url);
  try {
    const result = await fetchImpl("/api/analyze-url", {
      method: "POST",
      body: { url },
      credentials: "include",
    });
    callbacks.onResult(result);
  } catch (err: any) {
    if (err?.status === 401) {
      navigateTo("/login");
      return;
    }
    callbacks.onError(err?.data ?? { error: "Could not analyze the prefill URL." });
  } finally {
    callbacks.onDone();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePrefill: no-op when ?prefill is absent", () => {
  it("does not call any callbacks when the param is missing", async () => {
    const onStart = vi.fn();
    const onResult = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();

    await simulatePrefill("", vi.fn(), vi.fn(), { onStart, onResult, onError, onDone });

    expect(onStart).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("usePrefill: happy path", () => {
  it("decodes the URL and calls onStart then onResult then onDone", async () => {
    const mockResult = { overallScore: 85, grade: "B" };
    const fetch = vi.fn().mockResolvedValue(mockResult);
    const onStart = vi.fn();
    const onResult = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();

    const encoded = encodeURIComponent("https://icjia.illinois.gov/docs/report.pdf");
    await simulatePrefill(`?prefill=${encoded}`, fetch, vi.fn(), {
      onStart,
      onResult,
      onError,
      onDone,
    });

    expect(onStart).toHaveBeenCalledWith("https://icjia.illinois.gov/docs/report.pdf");
    expect(fetch).toHaveBeenCalledWith(
      "/api/analyze-url",
      expect.objectContaining({
        method: "POST",
        body: { url: "https://icjia.illinois.gov/docs/report.pdf" },
      }),
    );
    expect(onResult).toHaveBeenCalledWith(mockResult);
    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("also works with a non-encoded URL in the param", async () => {
    const fetch = vi.fn().mockResolvedValue({ overallScore: 90, grade: "A" });
    const onStart = vi.fn();
    const onResult = vi.fn();
    const onDone = vi.fn();

    const url = "https://icjia.illinois.gov/plain.pdf";
    await simulatePrefill(`?prefill=${url}`, fetch, vi.fn(), {
      onStart,
      onResult,
      onError: vi.fn(),
      onDone,
    });

    expect(onStart).toHaveBeenCalledWith(url);
    expect(onResult).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});

describe("usePrefill: error handling", () => {
  it("calls onError and onDone on a 400 response", async () => {
    const err = Object.assign(new Error("URL not allowed"), {
      status: 400,
      data: { error: "URL not allowed", details: "host is not in the allowlist" },
    });
    const fetch = vi.fn().mockRejectedValue(err);
    const onError = vi.fn();
    const onDone = vi.fn();

    const encoded = encodeURIComponent("https://example.com/file.pdf");
    await simulatePrefill(`?prefill=${encoded}`, fetch, vi.fn(), {
      onStart: vi.fn(),
      onResult: vi.fn(),
      onError,
      onDone,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: "URL not allowed" }));
    expect(onDone).toHaveBeenCalled();
  });

  it('calls navigateTo("/login") on a 401 response without calling onError', async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    const fetch = vi.fn().mockRejectedValue(err);
    const navigateTo = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();

    const encoded = encodeURIComponent("https://icjia.illinois.gov/file.pdf");
    await simulatePrefill(`?prefill=${encoded}`, fetch, navigateTo, {
      onStart: vi.fn(),
      onResult: vi.fn(),
      onError,
      onDone,
    });

    expect(navigateTo).toHaveBeenCalledWith("/login");
    expect(onError).not.toHaveBeenCalled();
    // onDone is NOT called on 401 (early return before finally)
  });

  it("calls onError with a fallback message when err.data is absent", async () => {
    const err = Object.assign(new Error("Network failure"), { status: 502 });
    const fetch = vi.fn().mockRejectedValue(err);
    const onError = vi.fn();
    const onDone = vi.fn();

    const encoded = encodeURIComponent("https://icjia.illinois.gov/file.pdf");
    await simulatePrefill(`?prefill=${encoded}`, fetch, vi.fn(), {
      onStart: vi.fn(),
      onResult: vi.fn(),
      onError,
      onDone,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(onDone).toHaveBeenCalled();
  });
});

describe("usePrefill: URL decoding edge cases", () => {
  it("calls onError for a URL that cannot be decoded", async () => {
    // Craft a string that decodeURIComponent will throw on
    const onError = vi.fn();
    const onDone = vi.fn();

    // '%ZZ' is an invalid percent-encoding sequence
    await simulatePrefill("?prefill=%ZZ", vi.fn(), vi.fn(), {
      onStart: vi.fn(),
      onResult: vi.fn(),
      onError,
      onDone,
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/decode/) }),
    );
  });
});
