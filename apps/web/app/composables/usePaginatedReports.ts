/**
 * usePaginatedReports — shared paginated-fetch composable behind
 * pages/history.vue (GET /api/logs, admin-only) and pages/my-history.vue
 * (GET /api/my-history, caller-scoped). Both endpoints return the identical
 * `{ data: T[], pagination: {...} }` envelope (see apps/api/src/routes/logs.ts)
 * — the two pages differ only in which URL/limit/row-shape they pass in, and
 * in how they render each row (see components/ReportsTable.vue).
 *
 * Deliberately built on plain `$fetch` + manual refs — like usePrefill.ts and
 * useRemediationJob.ts — rather than Nuxt's `useFetch`/`useAsyncData`, so it
 * stays simple to unit test (mount a host component, mock global `$fetch`)
 * without a full Nuxt test runtime. The trade-off: unlike the pre-extraction
 * pages' `useFetch`, this fetches client-side on mount rather than
 * pre-rendering during SSR — acceptable for these two low-traffic
 * authenticated admin/personal-history pages, and it's what already happens
 * in practice for any in-app (client-side) navigation to either page.
 */
import { onMounted, ref, watch } from "vue";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface UsePaginatedReportsOptions {
  limit: number;
}

export function usePaginatedReports<T>(url: string, options: UsePaginatedReportsOptions) {
  const page = ref(1);
  const data = ref<PaginatedResponse<T> | null>(null);
  const pending = ref(false);
  // Raw caught error (ofetch's FetchError shape — `.data` carries the JSON
  // body), same contract Nuxt's useFetch exposed before this extraction, so
  // callers can keep reading `error?.data?.error` unchanged.
  const error = ref<unknown>(null);

  async function load(): Promise<void> {
    pending.value = true;
    try {
      data.value = await $fetch<PaginatedResponse<T>>(url, {
        query: { page: page.value, limit: options.limit },
        credentials: "include",
      });
      error.value = null;
    } catch (err) {
      error.value = err;
    } finally {
      pending.value = false;
    }
  }

  function goToPage(p: number): void {
    page.value = p;
  }

  onMounted(load);
  watch(page, load);

  return { data, pending, error, page, goToPage };
}
