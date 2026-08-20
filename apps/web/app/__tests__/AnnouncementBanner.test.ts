import "./test-helpers";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import AnnouncementBanner from "../components/AnnouncementBanner.vue";
import { ANNOUNCEMENTS, ANNOUNCEMENT_BANNER_SENTENCES } from "../../../../audit.config";
import { splitSentences, summarizeAnnouncement } from "../utils/announcementSummary";

const STORAGE_KEY = "a11y-audit:dismissed-announcements";

const TEST_ANNOUNCEMENT = {
  id: "test-x",
  badge: "New",
  text: "hi",
  linkText: "go",
  linkTo: "/x",
  requiresWcagVersion: "2.2",
};

// Override useRuntimeConfig to inject a test announcement. The global stub in
// test-helpers returns announcements: [], so we replace it here for all tests
// in this file.
const mockUseRuntimeConfig = vi.fn(() => ({
  public: {
    wcagVersion: "2.2",
    announcements: [TEST_ANNOUNCEMENT],
  },
}));

beforeEach(() => {
  // Clear localStorage before each test for isolation.
  localStorage.clear();
  // Inject the announcement-aware config stub.
  vi.stubGlobal("useRuntimeConfig", mockUseRuntimeConfig);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AnnouncementBanner", () => {
  it("renders the banner on first mount (no prior dismissal)", async () => {
    const wrapper = mount(AnnouncementBanner);
    // onMounted fires synchronously in @vue/test-utils (happy-dom env)
    await nextTick();
    expect(wrapper.find('[role="region"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("hi");
    expect(wrapper.text()).toContain("New");
  });

  it("renders a standing “What's New” heading so the banner reads as new changes", async () => {
    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    expect(wrapper.text()).toContain("What's New");
  });

  it("permanently dismisses: banner gone after dismiss + never shown on fresh mount", async () => {
    // --- First mount: banner visible ---
    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    expect(wrapper.find('[role="region"]').exists()).toBe(true);

    // Click the dismiss button.
    await wrapper.find('button[aria-label="Dismiss announcement"]').trigger("click");
    await nextTick();

    // Banner should be gone immediately.
    expect(wrapper.find('[role="region"]').exists()).toBe(false);

    // localStorage must contain the dismissed id.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
    expect(stored).toContain(TEST_ANNOUNCEMENT.id);

    // --- Second mount (simulates a future session / reload) ---
    const wrapper2 = mount(AnnouncementBanner);
    await nextTick();

    // PERMANENT dismissal: banner must NOT appear even on a brand-new instance.
    expect(wrapper2.find('[role="region"]').exists()).toBe(false);
  });

  it("is hidden when no matching announcement exists (announcements empty)", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { wcagVersion: "2.2", announcements: [] },
    }));
    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    expect(wrapper.find('[role="region"]').exists()).toBe(false);
  });

  it("is hidden when wcagVersion does not match requiresWcagVersion", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: {
        wcagVersion: "2.1",
        announcements: [{ ...TEST_ANNOUNCEMENT, requiresWcagVersion: "2.2" }],
      },
    }));
    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    expect(wrapper.find('[role="region"]').exists()).toBe(false);
  });

  it("dismiss button has accessible aria-label", async () => {
    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    const btn = wrapper.find('button[aria-label="Dismiss announcement"]');
    expect(btn.exists()).toBe(true);
  });

  it("accumulates multiple dismissed ids in localStorage", async () => {
    // Pre-seed a different id already dismissed.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["other-id"]));

    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    await wrapper.find('button[aria-label="Dismiss announcement"]').trigger("click");
    await nextTick();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
    expect(stored).toContain("other-id");
    expect(stored).toContain(TEST_ANNOUNCEMENT.id);
  });

  it("gracefully ignores corrupt (non-array) localStorage", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ corrupted: true }));
    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    // Must not throw; with no valid dismissed-id list, the banner still shows.
    expect(wrapper.find('[role="region"]').exists()).toBe(true);
  });

  it("always offers the archive link so dismissed updates stay reachable", async () => {
    const wrapper = mount(AnnouncementBanner);
    await nextTick();
    const archive = wrapper
      .findAll("a")
      .find((a) => a.attributes("href") === "/announcements" || a.text().includes("See all"));
    expect(archive).toBeTruthy();
  });

  // ---------------------------------------------------------------------
  // Long entries are cut to their opening sentences. The banner sits directly
  // above the drop zone, so a ~900-character entry (the real ones reach that)
  // pushed the tool itself off the first screen. The archive holds the whole
  // entry; the banner links to it.
  //
  // These test the WIRING — that the component actually calls the summarizer
  // and renders the link. The cutting rules themselves are covered in
  // announcementSummary.test.ts.
  // ---------------------------------------------------------------------
  describe("long entries are cut to their opening sentences", () => {
    const LONG = "One. Two. Three. Four. Five. Six.";
    const SHORT = "One. Two.";

    function mountWith(text: string) {
      vi.stubGlobal(
        "useRuntimeConfig",
        vi.fn(() => ({
          public: {
            wcagVersion: "2.2",
            announcements: [{ id: "long-x", badge: "Improved", text }],
          },
        })),
      );
      return mount(AnnouncementBanner);
    }

    function fullUpdateLink(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll("a").find((a) => a.text().includes("Read the full update"));
    }

    it("shows only the opening sentences of a long entry", async () => {
      const wrapper = mountWith(LONG);
      await nextTick();
      expect(wrapper.text()).toContain("Four.");
      expect(wrapper.text()).not.toContain("Five.");
      expect(wrapper.text()).not.toContain("Six.");
    });

    it("offers a click-through to the full entry when it cut something", async () => {
      const wrapper = mountWith(LONG);
      await nextTick();
      const link = fullUpdateLink(wrapper);
      expect(link).toBeTruthy();
      // `to`, not `href`: the NuxtLink stub is a bare <a>, so props fall
      // through as raw attributes (same reason linkExternal reads `external`).
      expect(link!.attributes("to")).toBe("/announcements");
    });

    it("separates the cut text from the link with a space", async () => {
      // Without it the rendered line reads "…Four.Read the full update".
      const wrapper = mountWith(LONG);
      await nextTick();
      expect(wrapper.text()).toContain("Four. Read the full update");
    });

    it("separates the link from an entry's own link, when the entry has one", async () => {
      // Vue's condense mode drops whitespace-only text between two elements
      // when it contains a newline, so these two underlined links rendered
      // touching: "Read the full updateHow the audit works".
      vi.stubGlobal(
        "useRuntimeConfig",
        vi.fn(() => ({
          public: {
            wcagVersion: "2.2",
            announcements: [
              {
                id: "both-x",
                badge: "New",
                text: LONG,
                linkText: "How the audit works",
                linkTo: "/technical-details",
              },
            ],
          },
        })),
      );
      const wrapper = mount(AnnouncementBanner);
      await nextTick();
      expect(wrapper.text()).toContain("Read the full update How the audit works");
    });

    it("shows a short entry whole, with no click-through link", async () => {
      // The link must never promise text that does not exist.
      const wrapper = mountWith(SHORT);
      await nextTick();
      expect(wrapper.text()).toContain("One. Two.");
      expect(fullUpdateLink(wrapper)).toBeUndefined();
    });

    it("keeps the archive link either way, because dismissal must not hide it", async () => {
      for (const text of [LONG, SHORT]) {
        const wrapper = mountWith(text);
        await nextTick();
        expect(wrapper.text()).toContain("See all updates");
      }
    });

    it("renders the real newest announcement through the summarizer", async () => {
      // End-to-end against shipped copy: a summarizer wired to the wrong
      // field shows up here and nowhere else.
      //
      // Deliberately NOT asserting the newest entry is long enough to be cut
      // — that would turn a short release announcement into a failing build.
      // The property is that the banner agrees with the summarizer either
      // way: it shows what the summarizer returned, offers the link exactly
      // when something was cut, and never leaks a sentence that was cut.
      const newest = ANNOUNCEMENTS[0] as { text: string };
      const { text: expected, truncated } = summarizeAnnouncement(newest.text);
      vi.stubGlobal(
        "useRuntimeConfig",
        vi.fn(() => ({
          public: { wcagVersion: "2.2", announcements: [{ ...newest }] },
        })),
      );
      const wrapper = mount(AnnouncementBanner);
      await nextTick();
      const rendered = wrapper.text();

      expect(rendered).toContain(expected);
      expect(Boolean(fullUpdateLink(wrapper))).toBe(truncated);
      for (const cut of splitSentences(newest.text).slice(ANNOUNCEMENT_BANNER_SENTENCES)) {
        expect(rendered).not.toContain(cut);
      }
    });
  });

  // ---------------------------------------------------------------------
  // v1.39.0 regression: /status is a Nitro SERVER route, not a Vue page.
  // A plain NuxtLink navigates client-side, so the Vue router finds no match
  // and renders its own "Page not found: /status" — the server is never
  // contacted. `external` forces a real document navigation. This shipped
  // broken; the test exists so it cannot ship broken again.
  // ---------------------------------------------------------------------
  describe("linkExternal", () => {
    function mountWith(announcement: Record<string, unknown>) {
      vi.stubGlobal(
        "useRuntimeConfig",
        vi.fn(() => ({
          public: { wcagVersion: "2.2", announcements: [announcement] },
        })),
      );
      return mount(AnnouncementBanner);
    }

    it("marks a server-route link as external", async () => {
      const wrapper = mountWith({
        id: "ext",
        badge: "New",
        text: "t",
        linkText: "status",
        linkTo: "/status",
        linkExternal: true,
      });
      await nextTick();
      const link = wrapper.findAll("a").find((a) => a.text().includes("status"));
      expect(link).toBeTruthy();
      // The NuxtLink stub passes `external` through to the anchor as a string.
      expect(link!.attributes("external")).toBe("true");
    });

    it("leaves an ordinary in-app link non-external", async () => {
      const wrapper = mountWith({
        id: "int",
        badge: "New",
        text: "t",
        linkText: "page",
        linkTo: "/wcag-2-2",
      });
      await nextTick();
      const link = wrapper.findAll("a").find((a) => a.text().includes("page"));
      expect(link).toBeTruthy();
      // Explicitly false, not merely absent — an ordinary page link must keep
      // SPA navigation rather than forcing a full document reload.
      expect(link!.attributes("external")).toBe("false");
    });
  });
});

describe("layout stability — the banner must not appear after hydration", () => {
  // The banner used to start hidden and reveal itself in onMounted, so a
  // dismissed one never flashed. It is ~250px tall and sits above everything,
  // so appearing after hydration pushed the heading, the drop zone and the
  // whole page down — a single 0.067 layout shift that was essentially the
  // landing page's entire CLS (0.104 throttled, over Google's 0.1 "good"
  // threshold), paid by every FIRST-TIME visitor to spare returning
  // dismissers a brief flash. First-time visitors are who the banner is for.
  //
  // The property that fixes it: visible before any mount hook runs.

  it("is visible in its initial render, before onMounted can hide it", () => {
    // Deliberately synchronous — no await, no flushPromises. Awaiting would
    // let onMounted run and make this pass for the wrong reason, which is
    // exactly the bug it guards.
    localStorage.clear();
    const w = mount(AnnouncementBanner);
    expect(w.find('[role="region"]').exists()).toBe(true);
  });

  it("still hides after mount when this announcement was dismissed", async () => {
    localStorage.setItem("a11y-audit:dismissed-announcements", JSON.stringify(["test-x"]));
    const w = mount(AnnouncementBanner);
    await nextTick();
    expect(w.find('[role="region"]').exists()).toBe(false);
  });
});
