import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { usePaginatedReports } from "../composables/usePaginatedReports";

// ---------------------------------------------------------------------------
// usePaginatedReports — shared paginated-fetch composable behind
// history.vue (/api/logs) and my-history.vue (/api/my-history). Deliberately
// thin and $fetch-based (like usePrefill.ts / useRemediationJob.ts) rather
// than Nuxt's useFetch, so it can be unit-tested by mounting a tiny host
// component and mocking the global $fetch — same pattern as
// useRemediationJob.test.ts.
// ---------------------------------------------------------------------------

interface Row {
  id: number;
  filename: string;
}

const fetchMock = vi.fn();

function mountComposable(url = "/api/my-history", limit = 20) {
  let out!: ReturnType<typeof usePaginatedReports<Row>>;
  const Comp = defineComponent({
    setup() {
      out = usePaginatedReports<Row>(url, { limit });
      return () => h("div");
    },
  });
  const wrapper = mount(Comp);
  return { wrapper, out };
}

function page(over: Record<string, unknown> = {}) {
  return {
    data: [{ id: 1, filename: "a.pdf" }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    ...over,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).$fetch = fetchMock;
});

describe("usePaginatedReports — initial fetch", () => {
  it("fetches the given URL on mount with page=1 and the given limit, credentials included", async () => {
    fetchMock.mockResolvedValue(page());
    mountComposable("/api/logs", 50);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/logs", {
      query: { page: 1, limit: 50 },
      credentials: "include",
    });
  });

  it("exposes the response under `data` once the fetch resolves", async () => {
    const response = page();
    fetchMock.mockResolvedValue(response);
    const { out } = mountComposable();
    await flushPromises();

    expect(out.data.value).toEqual(response);
    expect(out.pending.value).toBe(false);
    expect(out.error.value).toBeNull();
  });

  it("starts with page.value === 1", () => {
    fetchMock.mockResolvedValue(page());
    const { out } = mountComposable();
    expect(out.page.value).toBe(1);
  });
});

describe("usePaginatedReports — page changes refetch", () => {
  it("goToPage(n) updates page.value and triggers a refetch with the new page in the query", async () => {
    fetchMock.mockResolvedValue(page());
    const { out } = mountComposable("/api/my-history", 20);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    out.goToPage(3);
    await flushPromises();

    expect(out.page.value).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/my-history", {
      query: { page: 3, limit: 20 },
      credentials: "include",
    });
  });

  it("does not refetch when goToPage is called with the current page number (no query wiring change)", async () => {
    // Vue's watch only fires on an actual value change — setting page to its
    // own current value is a no-op, matching the pre-extraction pages'
    // `@click="goToPage(p)"` behavior (clicking the already-active page
    // button never re-triggered the pages' useFetch watcher either).
    fetchMock.mockResolvedValue(page());
    const { out } = mountComposable();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    out.goToPage(1);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("usePaginatedReports — error handling", () => {
  it("sets `error` and clears `pending` when the fetch rejects", async () => {
    const err = Object.assign(new Error("Forbidden"), {
      status: 403,
      data: { error: "Admins only" },
    });
    fetchMock.mockRejectedValue(err);
    const { out } = mountComposable("/api/logs", 50);
    await flushPromises();

    expect(out.pending.value).toBe(false);
    expect(out.data.value).toBeNull();
    expect((out.error.value as any)?.data?.error).toBe("Admins only");
  });

  it("clears a previously-set error once a later page fetch succeeds", async () => {
    fetchMock.mockRejectedValueOnce({ status: 500, data: { error: "boom" } });
    fetchMock.mockResolvedValueOnce(page());
    const { out } = mountComposable();
    await flushPromises();
    expect(out.error.value).not.toBeNull();

    out.goToPage(2);
    await flushPromises();
    expect(out.error.value).toBeNull();
    expect(out.data.value).toEqual(page());
  });
});
