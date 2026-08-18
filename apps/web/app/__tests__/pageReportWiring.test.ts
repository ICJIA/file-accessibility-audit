import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, h, defineComponent, Suspense, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import PageReportPage from "../pages/page-report/[id].vue";

/**
 * pages/page-report/[id].vue — the share page behind every reportUrl that
 * POST /api/audit-url-page hands out (`https://audit.icjia.app/page-report/<id>`).
 *
 * THE BUG THIS PAGE FIXES: the API emitted that URL from day one
 * (1c8546f, v1.26-era) but the page never existed, so all ~5,800 links the
 * fleet-audit pipeline published were dead 404s. The route contract test
 * below is the "never again" guard: it derives the path segment from the
 * API's own source, so if either side renames without the other moving,
 * this suite fails instead of prod silently serving 404s.
 *
 * Mount mechanics (Suspense host, bare-global composable stubs) are
 * identical to reportPageWiring.test.ts — see the long comment there for
 * why async-setup pages need a <Suspense> ancestor and why the host uses
 * h() instead of a template string.
 */

// ---------------------------------------------------------------------------
// Fixture — mirrors a REAL stored page-audit payload byte-for-shape: the
// PageAuditResult interface in apps/api/src/services/pageAuditor.ts, as
// wrapped by GET /api/reports/:id into {report, createdAt, expiresAt}.
// (regradeStoredReport passes page payloads through untouched — they have
// no `categories` array — so what was stored is what the page receives.)
// ---------------------------------------------------------------------------
const REPORT = {
  url: "https://icjia.illinois.gov/researchhub/articles/example-report/",
  pageTitle: "ICJIA | Example Research Article",
  audited: "2026-08-15T21:48:49.400Z",
  score: 87,
  grade: "B",
  violationCount: 3,
  bySeverity: { critical: 0, serious: 2, moderate: 1, minor: 0 },
  violations: [
    {
      id: "link-name",
      impact: "serious",
      description: "Ensure links have discernible text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.11/link-name",
      tags: ["cat.name-role-value", "wcag2a", "wcag244"],
      nodeCount: 2,
      nodes: [{ target: ["a.share-icon"] }, { target: ["nav > a:nth-child(3)"] }],
    },
    {
      id: "page-has-heading-one",
      impact: "moderate",
      description: "Ensure the page contains a level-one heading",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.11/page-has-heading-one",
      tags: ["cat.semantics", "best-practice"],
      nodeCount: 1,
      nodes: [{ target: ["html"] }],
    },
  ],
  incomplete: [
    {
      id: "color-contrast",
      impact: "serious",
      description: "Ensure the contrast between foreground and background colors meets WCAG 2 AA",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
      tags: ["cat.color", "wcag2aa", "wcag143"],
      nodeCount: 1,
      nodes: [{ target: ["#hero-banner p"] }],
    },
  ],
};

const PAYLOAD = {
  report: REPORT,
  createdAt: "2026-08-15T21:48:49.000Z",
  expiresAt: "2027-08-15T21:48:49.000Z",
};

// Mutable per-test fetch outcome, so error-path tests reuse one mock.
let fetchResult: { data: Ref<unknown>; pending: Ref<boolean>; error: Ref<unknown> };

const useFetchMock = vi.fn(async (_url: string) => fetchResult);

function mountPageReport() {
  const Host = defineComponent({
    name: "SuspenseHost",
    setup() {
      return () => h(Suspense, null, { default: () => h(PageReportPage) });
    },
  });
  return mount(Host);
}

async function mountSettled() {
  const wrapper = mountPageReport();
  await flushPromises();
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  fetchResult = { data: ref(PAYLOAD), pending: ref(false), error: ref(null) };
  useFetchMock.mockClear();
  (globalThis as any).useFetch = useFetchMock;
  (globalThis as any).useRoute = () => ({ params: { id: "abc123def456" } });
  (globalThis as any).useColorMode = () => ({ value: "dark", preference: "dark" });
  (globalThis as any).useHead = () => {};
});

// ---------------------------------------------------------------------------
// Route contract — the guard that makes the original bug structurally
// impossible to reintroduce.
// ---------------------------------------------------------------------------
describe("reportUrl route contract (api ↔ web)", () => {
  it("the path segment the API builds reportUrl from has a matching page file", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const apiRoute = path.resolve(here, "../../../api/src/routes/audit-url-page.ts");
    const source = readFileSync(apiRoute, "utf-8");

    // buildPageReportUrl: return `${getReportBaseUrl()}/<segment>/${id}`;
    const match = source.match(/return `\$\{getReportBaseUrl\(\)\}\/([a-z0-9-]+)\/\$\{id\}`/);
    expect(
      match,
      "buildPageReportUrl's template literal not found in audit-url-page.ts",
    ).not.toBeNull();

    const segment = match![1];
    const pageFile = path.resolve(here, `../pages/${segment}/[id].vue`);
    expect(
      existsSync(pageFile),
      `API emits reportUrl /${segment}/<id> but apps/web/app/pages/${segment}/[id].vue does not exist — every fleet-audit link would 404`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fetch wiring
// ---------------------------------------------------------------------------
describe("pages/page-report/[id].vue — fetch wiring", () => {
  it("fetches the shared report for this route's id", async () => {
    await mountSettled();
    expect(useFetchMock).toHaveBeenCalledWith("/api/reports/abc123def456");
  });
});

// ---------------------------------------------------------------------------
// Rendering the audit
// ---------------------------------------------------------------------------
describe("pages/page-report/[id].vue — rendered report", () => {
  it("shows the score and grade from the payload", async () => {
    const wrapper = await mountSettled();
    expect(wrapper.find('[data-testid="page-score"]').text()).toContain("87");
    expect(wrapper.find('[data-testid="page-grade"]').text()).toBe("B");
  });

  it("identifies the audited page: title, URL, and audit date", async () => {
    const wrapper = await mountSettled();
    const text = wrapper.text();
    expect(text).toContain("ICJIA | Example Research Article");
    expect(text).toContain("https://icjia.illinois.gov/researchhub/articles/example-report/");
    expect(text).toContain("August 15, 2026");
  });

  it("links to the audited page only because its URL is http(s)", async () => {
    const wrapper = await mountSettled();
    const link = wrapper.find('[data-testid="audited-url"]');
    expect(link.element.tagName).toBe("A");
    expect(link.attributes("href")).toBe(REPORT.url);
    expect(link.attributes("rel")).toContain("noopener");
  });

  it("shows all four severity buckets, each pairing its own count with its label", async () => {
    const wrapper = await mountSettled();
    const chips = wrapper
      .find('[data-testid="severity-counts"]')
      .findAll('[role="listitem"]')
      // Count and label are separate <p> elements inside each chip — read
      // them individually (text() concatenates blocks without whitespace).
      .map((chip) => chip.findAll("p").map((p) => p.text().trim()));
    // One chip per axe impact bucket, zeros included, count rendered above
    // its label (the scoreboard-chip pattern used elsewhere in the app).
    expect(chips).toEqual([
      ["0", "Critical"],
      ["2", "Serious"],
      ["1", "Moderate"],
      ["0", "Minor"],
    ]);
  });

  it("renders each violation with description, element count, selectors, and help link", async () => {
    const wrapper = await mountSettled();
    const text = wrapper.text();
    expect(text).toContain("Ensure links have discernible text");
    expect(text).toContain("Ensure the page contains a level-one heading");
    expect(text).toContain("a.share-icon");
    expect(text).toContain("nav > a:nth-child(3)");
    expect(text).toMatch(/2 elements/);

    const helpLinks = wrapper
      .findAll("a")
      .filter(
        (a) => a.attributes("href") === "https://dequeuniversity.com/rules/axe/4.11/link-name",
      );
    expect(helpLinks.length).toBe(1);
    expect(helpLinks[0]!.attributes("rel")).toContain("noopener");
  });

  it("renders incomplete checks as a needs-manual-review section, open by default", async () => {
    const wrapper = await mountSettled();
    const section = wrapper.find('[data-testid="incomplete-section"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain(
      "Ensure the contrast between foreground and background colors meets WCAG 2 AA",
    );
    expect(section.text()).toContain("#hero-banner p");
  });

  it("shows when the link expires", async () => {
    const wrapper = await mountSettled();
    expect(wrapper.text()).toContain("August 15, 2027");
  });

  it("renders a positive empty state when there are no violations", async () => {
    fetchResult = {
      data: ref({
        ...PAYLOAD,
        report: {
          ...REPORT,
          score: 100,
          grade: "A",
          violationCount: 0,
          bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 },
          violations: [],
          incomplete: [],
        },
      }),
      pending: ref(false),
      error: ref(null),
    };
    const wrapper = await mountSettled();
    expect(wrapper.find('[data-testid="no-violations"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="incomplete-section"]').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stored-XSS discipline — url and nodes[].target come from the AUDITED
// page (its <title>, its DOM), so nothing from the payload may become a
// link unless it is plain http(s).
// ---------------------------------------------------------------------------
describe("pages/page-report/[id].vue — unsafe URLs never become hrefs", () => {
  it("a javascript: audited-page URL renders as text, not a link", async () => {
    fetchResult = {
      data: ref({
        ...PAYLOAD,
        report: { ...REPORT, url: "javascript:alert(1)" },
      }),
      pending: ref(false),
      error: ref(null),
    };
    const wrapper = await mountSettled();
    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).not.toContain("javascript:alert(1)");
    // The URL is still shown — it identifies what was audited — just inert.
    expect(wrapper.text()).toContain("javascript:alert(1)");
  });

  it("a javascript: helpUrl is not rendered as a link", async () => {
    fetchResult = {
      data: ref({
        ...PAYLOAD,
        report: {
          ...REPORT,
          violations: [{ ...REPORT.violations[0]!, helpUrl: "javascript:alert(2)" }],
        },
      }),
      pending: ref(false),
      error: ref(null),
    };
    const wrapper = await mountSettled();
    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).not.toContain("javascript:alert(2)");
  });
});

// ---------------------------------------------------------------------------
// Error states — same statuses and phrasing family as /report/[id]
// ---------------------------------------------------------------------------
describe("pages/page-report/[id].vue — error states", () => {
  it("410 shows the expired message", async () => {
    fetchResult = {
      data: ref(null),
      pending: ref(false),
      error: ref({ statusCode: 410 }),
    };
    const wrapper = await mountSettled();
    expect(wrapper.text()).toContain("expired");
  });

  it("404 shows the not-found message", async () => {
    fetchResult = {
      data: ref(null),
      pending: ref(false),
      error: ref({ statusCode: 404 }),
    };
    const wrapper = await mountSettled();
    expect(wrapper.text()).toContain("not found");
  });
});
