import { describe, it, expect } from "vitest";
import { sharedReportErrorStatus, sharedReportHead } from "../utils/sharedReportHead";

describe("sharedReportErrorStatus", () => {
  it("passes through 404 and 410, from either field a fetch error may carry", () => {
    expect(sharedReportErrorStatus({ statusCode: 404 })).toBe(404);
    expect(sharedReportErrorStatus({ status: 410 })).toBe(410);
  });

  it("makes no statement about the report for anything else", () => {
    expect(sharedReportErrorStatus(null)).toBeNull();
    expect(sharedReportErrorStatus(undefined)).toBeNull();
    expect(sharedReportErrorStatus({})).toBeNull();
    expect(sharedReportErrorStatus({ statusCode: 500 })).toBeNull();
    expect(sharedReportErrorStatus({ statusCode: 429 })).toBeNull();
    expect(sharedReportErrorStatus({ statusCode: 200 })).toBeNull();
  });
});

describe("sharedReportHead", () => {
  const head = sharedReportHead("Accessibility report: a.pdf", "https://x.test/report/1");

  it("keeps an unlisted link out of search", () => {
    expect(head.meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });

  it("points canonical and og:url at the report itself", () => {
    expect(head.link).toEqual([{ rel: "canonical", href: "https://x.test/report/1" }]);
    expect(head.meta).toContainEqual({ property: "og:url", content: "https://x.test/report/1" });
  });

  it("uses the one title everywhere a title shows", () => {
    expect(head.title).toBe("Accessibility report: a.pdf");
    expect(head.meta).toContainEqual({ property: "og:title", content: head.title });
    expect(head.meta).toContainEqual({ name: "twitter:title", content: head.title });
  });
});
