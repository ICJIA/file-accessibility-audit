import { describe, it, expect, vi } from "vitest";
import { slimIssue } from "../services/pageAuditor.js";

describe("slimIssue", () => {
  it("maps id, impact, description, helpUrl, tags", () => {
    const result = slimIssue({
      id: "color-contrast",
      impact: "serious",
      description: "Elements must have sufficient color contrast",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.9/color-contrast",
      tags: ["wcag2a", "wcag143"],
      nodes: [{ target: ["#main > p"] }],
    });
    expect(result.id).toBe("color-contrast");
    expect(result.impact).toBe("serious");
    expect(result.description).toBe("Elements must have sufficient color contrast");
    expect(result.helpUrl).toBe("https://dequeuniversity.com/rules/axe/4.9/color-contrast");
    expect(result.tags).toEqual(["wcag2a", "wcag143"]);
  });

  it("caps nodes to 25 while nodeCount reflects true uncapped count via max(1, len)", () => {
    const manyNodes = Array.from({ length: 40 }, (_, i) => ({ target: [`#el-${i}`] }));
    const result = slimIssue({
      id: "label",
      impact: "critical",
      description: "Form elements must have labels",
      helpUrl: "https://example.com",
      tags: [],
      nodes: manyNodes,
    });
    expect(result.nodes).toHaveLength(25);
    expect(result.nodeCount).toBe(40);
  });

  it("maps nodes[].target correctly", () => {
    const result = slimIssue({
      id: "image-alt",
      impact: "critical",
      description: "Images must have alt text",
      helpUrl: "https://example.com",
      tags: [],
      nodes: [{ target: ["img.hero", "#banner img"] }, { target: ["footer img"] }],
    });
    expect(result.nodes[0].target).toEqual(["img.hero", "#banner img"]);
    expect(result.nodes[1].target).toEqual(["footer img"]);
  });

  it("tolerates missing nodes → nodes=[], nodeCount=1", () => {
    const result = slimIssue({
      id: "aria-roles",
      impact: "serious",
      description: "ARIA roles must conform",
      helpUrl: "https://example.com",
      tags: ["wcag2a"],
    });
    expect(result.nodes).toEqual([]);
    expect(result.nodeCount).toBe(1);
  });

  it("tolerates empty nodes array → nodes=[], nodeCount=1", () => {
    const result = slimIssue({
      id: "aria-roles",
      impact: "moderate",
      description: "ARIA roles must conform",
      helpUrl: "https://example.com",
      tags: [],
      nodes: [],
    });
    expect(result.nodes).toEqual([]);
    expect(result.nodeCount).toBe(1);
  });

  it("tolerates missing tags → tags=[]", () => {
    const result = slimIssue({
      id: "link-name",
      impact: "serious",
      description: "Links must have discernible text",
      helpUrl: "https://example.com",
      nodes: [{ target: ["a.nav-link"] }],
    });
    expect(result.tags).toEqual([]);
  });

  it("filters non-string values out of tags", () => {
    const result = slimIssue({
      id: "link-name",
      impact: "serious",
      description: "Links must have discernible text",
      helpUrl: "https://example.com",
      tags: ["wcag2a", 42, null, "cat2"],
      nodes: [],
    });
    expect(result.tags).toEqual(["wcag2a", "cat2"]);
  });

  it("a node with no target → { target: [] }", () => {
    const result = slimIssue({
      id: "color-contrast",
      impact: "serious",
      description: "Contrast",
      helpUrl: "https://example.com",
      tags: [],
      nodes: [{ other: "data" }, { target: ["#foo"] }],
    });
    expect(result.nodes[0].target).toEqual([]);
    expect(result.nodes[1].target).toEqual(["#foo"]);
  });

  it("converts null impact to null (not a string)", () => {
    const result = slimIssue({
      id: "test-rule",
      impact: null,
      description: "desc",
      helpUrl: "url",
      tags: [],
      nodes: [],
    });
    expect(result.impact).toBeNull();
  });

  it("converts non-string impact to null", () => {
    const result = slimIssue({
      id: "test-rule",
      impact: 42,
      description: "desc",
      helpUrl: "url",
      tags: [],
      nodes: [],
    });
    expect(result.impact).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2026-09-02 fresh-eyes audit: the page-audit SSRF guard resolved a host in
// Node and then let Chromium resolve it AGAIN on its own, with a per-page
// cache widening the rebinding window. The document host is now pinned into
// Chromium's resolver at launch, and every request is re-checked.
// ---------------------------------------------------------------------------
import { chromiumLaunchArgs, createRequestHandler } from "../services/pageAuditor.js";

describe("chromiumLaunchArgs", () => {
  it("pins the validated document host to the IP Node resolved, so Chromium cannot re-resolve it elsewhere", () => {
    const args = chromiumLaunchArgs({ host: "icjia.illinois.gov", ip: "104.18.30.7" });
    expect(args).toContain("--host-resolver-rules=MAP icjia.illinois.gov 104.18.30.7");
  });
  it("adds no resolver rule when nothing is pinned", () => {
    expect(chromiumLaunchArgs().some((a) => a.startsWith("--host-resolver-rules"))).toBe(false);
  });
});

describe("createRequestHandler — every request is judged afresh", () => {
  const fakeReq = (url: string, type = "image") => {
    const calls: string[] = [];
    return {
      req: {
        url: () => url,
        resourceType: () => type,
        abort: async () => {
          calls.push("abort");
        },
        continue: async () => {
          calls.push("continue");
        },
      },
      calls,
    };
  };

  it("re-resolves the same host on every request — no per-page cache to rebind behind", async () => {
    const resolver = vi.fn(async () => true);
    const handler = createRequestHandler(() => true, resolver);
    const a = fakeReq("https://cdn.example.gov/a.png");
    const b = fakeReq("https://cdn.example.gov/b.png");
    await handler(a.req as never);
    await handler(b.req as never);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(a.calls).toEqual(["continue"]);
    expect(b.calls).toEqual(["continue"]);
  });

  it("aborts a subresource whose host resolves private, and a document navigation off the allowlist", async () => {
    const handler = createRequestHandler(
      (u) => u.startsWith("https://icjia.illinois.gov/"),
      async () => false,
    );
    const sub = fakeReq("https://internal.example/x.js", "script");
    await handler(sub.req as never);
    expect(sub.calls).toEqual(["abort"]);
    const doc = fakeReq("https://evil.example/", "document");
    await handler(doc.req as never);
    expect(doc.calls).toEqual(["abort"]);
  });
});
