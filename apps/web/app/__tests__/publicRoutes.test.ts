/**
 * Public-route render smoke (v1.125.0).
 *
 * Every route the sitemap invites crawlers to must at least MOUNT — a
 * broken import, a renamed composable, or an undefined auto-import in any
 * public page should fail here, not in a visitor's browser. /trust and /
 * have deep suites of their own; this is the floor under all six: the page
 * renders, produces real markup, and shows exactly one h1 (the landmark a
 * screen-reader user navigates by — this checker of all sites keeps that
 * promise on its own pages).
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { ref } from "vue";

// Beyond test-helpers' shared stubs, pages auto-import a few more Nuxt/app
// composables. Inert versions are enough — this suite asserts the pages
// MOUNT, not what the composables do (their own suites cover that).
const g = globalThis as any;
g.useHead = () => {};
g.useSeoMeta = () => {};
g.useRoute = () => ({ path: "/", hash: "", query: {}, params: {}, fullPath: "/" });
g.useRouter = () => ({ push: () => Promise.resolve(), replace: () => Promise.resolve() });
g.usePrefill = () => ({ prefill: ref(null), clearPrefill: () => {} });
g.useReportExport = () => ({ exportReport: () => {}, exporting: ref(false) });
g.useReportView = () => ({ view: ref("visual"), setView: () => {} });
import { mount } from "@vue/test-utils";
import IndexPage from "../pages/index.vue";
import AnnouncementsPage from "../pages/announcements.vue";
import DataRetentionPage from "../pages/data-retention.vue";
import TechnicalDetailsPage from "../pages/technical-details.vue";
import TrustPage from "../pages/trust.vue";
import Wcag22Page from "../pages/wcag-2-2.vue";

// Child components are not this test's concern — stub anything unresolved so
// a page's own template is what must survive the mount.
const GLOBAL = { global: { stubs: { transition: false }, renderStubDefaultSlot: true } } as const;

// h1 count is per PAGE component: the landing page deliberately carries none
// of its own — the layout's site-name h1 is the page's single h1, and the
// page opens with an h2. Every other public page owns its h1.
const PAGES: Array<{ route: string; component: unknown; marker: RegExp; h1s?: number }> = [
  { route: "/", component: IndexPage, marker: /accessibility/i, h1s: 0 },
  { route: "/announcements", component: AnnouncementsPage, marker: /What's new/i },
  { route: "/data-retention", component: DataRetentionPage, marker: /retention|data/i },
  { route: "/technical-details", component: TechnicalDetailsPage, marker: /technical|how/i },
  { route: "/trust", component: TrustPage, marker: /Built to be checked/i },
  { route: "/wcag-2-2", component: Wcag22Page, marker: /WCAG/i },
];

describe("every sitemap-listed route mounts and renders its landmark", () => {
  for (const p of PAGES) {
    it(`${p.route} renders real markup with exactly one h1`, () => {
      const wrapper = mount(p.component as never, GLOBAL);
      const html = wrapper.html();
      expect(html.length).toBeGreaterThan(200);
      expect(html).toMatch(p.marker);
      expect(wrapper.findAll("h1").length).toBe(p.h1s ?? 1);
    });
  }
});
