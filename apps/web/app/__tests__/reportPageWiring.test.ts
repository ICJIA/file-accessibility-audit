import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, h, defineComponent, Suspense } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { useReportView } from "../composables/useReportView";
import ReportIdPage from "../pages/report/[id].vue";
import ReportVisualView from "../components/ReportVisualView.vue";
import ReportGradeHero from "../components/ReportGradeHero.vue";

/**
 * pages/report/[id].vue — Visual view prop wiring, real mount (closes the
 * gap noted in reportSectionOrder.test.ts: that file pins the exact
 * `:result="data.report"` / `:verapdf-url="..."` strings in the page's
 * *source*, which catches a literal edit but proves nothing about what
 * actually reaches the rendered DOM. This file mounts the real page,
 * mocks useFetch to resolve a realistic stored-report payload, and asserts
 * the payload's own score/grade actually appear. If `:result="data.report"`
 * ever regressed to `:result="data"` (the fetch envelope —
 * `{report, createdAt, expiresAt}` — whose `.overallScore`/`.grade` are
 * undefined; only `.report.overallScore`/`.report.grade` exist), the hero
 * would render a blank score and this test fails instead of silently
 * passing like the rest of the suite.
 *
 * Why the <Suspense> wrapper: `[id].vue`'s <script setup> has a top-level
 * `await useFetch(...)`, which the SFC compiler turns into an async
 * setup(). Verified empirically while building this test: Vue's runtime
 * only ever resolves an async-setup component that has a <Suspense>
 * ancestor — with no parentSuspense, `instance.asyncDep` is set but
 * nothing ever calls back into setupRenderEffect, so the component stays a
 * permanent `<!---->` comment placeholder (this is also why Vue logs "A
 * component with async setup() must be nested in a <Suspense>" in dev).
 * Nuxt's real app always wraps page components in a <Suspense> (via
 * <NuxtPage>); this recreates that minimally with h() rather than a
 * `template:` string, since this project's vitest config resolves "vue" to
 * the runtime-only build with no runtime template compiler (same reason
 * usePaginatedReports.test.ts's host component uses h()).
 *
 * useFetch/useRoute/useColorMode/useReportView are the bare-global
 * (Nuxt auto-import) composables `[id].vue` calls without an explicit
 * import. test-helpers.ts doesn't stub the first three — most tests never
 * mount a page that needs them — so they're stubbed locally here, the same
 * way indexA11y.test.ts locally attaches index.vue's bare-global
 * composables to globalThis. useReportView is the real composable (just
 * imported, not reinvented), so viewMode genuinely defaults to "visual",
 * matching production.
 */

const REPORT: Record<string, unknown> = {
  filename: "acme-benefits-guide.pdf",
  pageCount: 9,
  overallScore: 83,
  grade: "B",
  isScanned: false,
  executiveSummary: "Mostly accessible; a few moderate issues remain.",
  fileType: "pdf",
  warnings: [],
  categories: [
    {
      id: "text_extractability",
      label: "Text Extractability",
      score: 70,
      grade: "C",
      severity: "Moderate",
      findings: ["Some text is not extractable"],
    },
  ],
  conformance: {
    status: "fail",
    headline: "Some failures found",
    failures: [],
    notAssessed: [],
  },
};

// Mirrors the res.json() shape built by GET /api/reports/:id (see
// apps/api/src/routes/reports.ts, and the identical SharedReportResponse
// interface declared in [id].vue itself).
const PAYLOAD = {
  report: REPORT,
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
};

const useFetchMock = vi.fn(async (_url: string) => ({
  data: ref(PAYLOAD),
  pending: ref(false),
  error: ref(null),
}));

function mountSharedReportPage() {
  const Host = defineComponent({
    name: "SuspenseHost",
    setup() {
      return () => h(Suspense, null, { default: () => h(ReportIdPage) });
    },
  });
  return mount(Host);
}

beforeEach(() => {
  useFetchMock.mockClear();
  (globalThis as any).useFetch = useFetchMock;
  (globalThis as any).useRoute = () => ({ params: { id: "shared-id-123" } });
  (globalThis as any).useColorMode = () => ({ value: "dark", preference: "dark" });
  (globalThis as any).useReportView = useReportView;
});

describe("pages/report/[id].vue — fetch wiring", () => {
  it("fetches the report for this route's id", async () => {
    mountSharedReportPage();
    await flushPromises();
    await flushPromises();

    expect(useFetchMock).toHaveBeenCalledWith("/api/reports/shared-id-123");
  });
});

describe("pages/report/[id].vue — Visual view prop wiring (real mount)", () => {
  it("passes the fetched report itself — not the {report, createdAt, expiresAt} envelope — to ReportVisualView", async () => {
    const wrapper = mountSharedReportPage();
    await flushPromises();
    await flushPromises();

    const visual = wrapper.findComponent(ReportVisualView);
    expect(visual.exists()).toBe(true);
    expect(visual.props("result")).toEqual(REPORT);
  });

  it("passes the configured verapdf URL through to the visual view", async () => {
    const wrapper = mountSharedReportPage();
    await flushPromises();
    await flushPromises();

    const visual = wrapper.findComponent(ReportVisualView);
    // From test-helpers.ts' useRuntimeConfig stub (public.verapdfUrl).
    expect(visual.props("verapdfUrl")).toBe("https://verapdf.org/");
  });

  it("renders this report's own score and grade in the hero — the observable symptom of a wrong :result binding", async () => {
    const wrapper = mountSharedReportPage();
    await flushPromises();
    await flushPromises();

    const hero = wrapper.findComponent(ReportGradeHero);
    expect(hero.exists()).toBe(true);
    expect(hero.props("grade")).toBe("B");
    expect(hero.props("overallScore")).toBe(83);

    // Belt-and-suspenders: the same facts, read back out of the rendered
    // DOM rather than off the component instance's resolved props.
    expect(wrapper.text()).toContain("83");
    expect(wrapper.text()).toContain("acme-benefits-guide.pdf");
  });
});
