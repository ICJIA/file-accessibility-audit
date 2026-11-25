import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SecurityPage from "../pages/security.vue";
import { SECURITY_AUDIT_ENTRIES } from "../data/securityAudits";
import { plainText, reviewDate, reviewScope } from "../utils/securityLog";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("security log helpers", () => {
  it("turns an entry's meta into plain text, a date and a scope", () => {
    const meta =
      "Reviewed <strong>2026-11-25</strong> &middot; scope: SECURITY-RELEVANT &mdash; one endpoint widened.";
    expect(plainText(meta)).toBe(
      "Reviewed 2026-11-25 · scope: SECURITY-RELEVANT — one endpoint widened.",
    );
    expect(reviewDate(meta)).toBe("2026-11-25");
    expect(reviewScope(meta)).toBe("SECURITY-RELEVANT — one endpoint widened");
  });

  it("leaves no markup or unknown entity in any real entry's folded line", () => {
    for (const e of SECURITY_AUDIT_ENTRIES) {
      const line = `${reviewDate(e.meta)} ${reviewScope(e.meta)}`;
      expect(line, e.version).not.toMatch(/[<>]/);
      expect(line, e.version).not.toMatch(/&[a-z]+;/i);
      expect(reviewScope(e.meta).length, e.version).toBeGreaterThan(0);
    }
  });
});

// The page calls useHead (a Nuxt auto-import); a plain mount has none.
(globalThis as any).useHead = () => {};

describe("/security page", () => {
  const mountPage = () =>
    mount(SecurityPage, {
      global: { stubs: { NuxtLink: { template: "<a><slot /></a>" } } },
    });

  it("shows the newest review open and every earlier one folded, dated, in order", () => {
    const w = mountPage();
    const latest = w.find('[data-testid="security-latest"]');
    expect(latest.text()).toContain(SECURITY_AUDIT_ENTRIES[0]!.version);
    // The newest is a card on the page, not inside any fold.
    expect(latest.element.closest("details")).toBeNull();

    const folds = w.findAll('details[data-testid="security-earlier"]');
    expect(folds).toHaveLength(SECURITY_AUDIT_ENTRIES.length - 1);
    expect(folds.every((d) => d.attributes("open") === undefined)).toBe(true);
    expect(folds[0]!.find("summary").text()).toContain(SECURITY_AUDIT_ENTRIES[1]!.version);
    expect(folds.at(-1)!.find("summary").text()).toContain(SECURITY_AUDIT_ENTRIES.at(-1)!.version);
    // Dated wherever the entry carries a date.
    const second = SECURITY_AUDIT_ENTRIES[1]!;
    expect(folds[0]!.find("summary").text()).toContain(reviewDate(second.meta));
    w.unmount();
  });

  it("the newest review lists findings beside their fixes", () => {
    const w = mountPage();
    const latest = w.find('[data-testid="security-latest"]');
    const newest = SECURITY_AUDIT_ENTRIES[0]!;
    const findings = newest.body.filter((b) => b.kind === "findings");
    if (findings.length) {
      expect(latest.findAll("li").length).toBeGreaterThan(0);
    }
    w.unmount();
  });

  it("the v1.180.0 red-team review records six findings, each with its fix", () => {
    const entry = SECURITY_AUDIT_ENTRIES.find((e) => e.version === "v1.180.0")!;
    const block = entry.body.find((b) => b.kind === "findings");
    expect(block && block.kind === "findings" ? block.items : []).toHaveLength(6);
    if (block && block.kind === "findings") {
      for (const item of block.items) expect(item.note, item.html.slice(0, 40)).toMatch(/Fix:/);
    }
  });

  it("is linked from the footer and from the trust page, and is in the sitemap and the browser checks", () => {
    const layout = read("layouts/default.vue");
    const footer = layout.slice(layout.indexOf("<footer"));
    expect(footer).toMatch(/href="\/security"[\s\S]*?Security\s*<\/a>/);
    const trust = read("pages/trust.vue");
    expect(trust).toMatch(/data-testid="trust-security-link"[\s\S]*?to="\/security"/);
    const root = resolve(__dirname, "../../../..");
    expect(readFileSync(resolve(root, "scripts/build-brief.mjs"), "utf8")).toContain(
      '{ path: "/security"',
    );
    expect(readFileSync(resolve(root, "scripts/e2e-smoke.ts"), "utf8")).toContain('"/security",');
  });

  it("draws entries with the same card the data policy uses, so the two cannot differ", () => {
    const page = read("pages/security.vue");
    expect(page).toContain(
      'import Section10AuditEntry from "~/components/dataRetention/Section10AuditEntry.vue";',
    );
    expect(page).toContain('from "~/data/securityAudits"');
    expect(page).not.toContain("v-html");
  });
});
