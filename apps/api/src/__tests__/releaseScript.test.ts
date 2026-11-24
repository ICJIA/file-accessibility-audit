/**
 * The pure steps of `pnpm release` (scripts/releaseLib.ts), run against small
 * fixture copies of the three records a release writes. The fixtures copy the
 * real files' shapes — heading styles, the entry object layout — so a format
 * change in the real file that the scaffolder no longer matches shows up in
 * versionSync.test.ts (which reads the real files with the same patterns).
 *
 * The script itself is never run here: it reads git and the network.
 */
import { describe, it, expect } from "vitest";
import {
  PLACEHOLDER,
  bumpPackageJson,
  bumpReadmeBadge,
  compareVersions,
  findPlaceholders,
  newestChangelogVersion,
  newestReadmeSecurityVersion,
  newestSecurityLogVersion,
  nextVersion,
  parseTestSummary,
  scaffoldChangelog,
  scaffoldReadmeSecurity,
  scaffoldSecurityLog,
  summarizeAudit,
  thousands,
  toLogHtml,
  updateBriefStats,
  updateReadmeCounts,
  type AuditOutcome,
  type ReleaseNotes,
  type TestCounts,
} from "../../../../scripts/releaseLib.ts";

const CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

## [1.175.6] - 2026-11-18

### Changed

- **Larger text.** Both pages set their small text larger.

### Notes

- No scoring or security change. Tests 4,837 across 275 files (API 2,655 · Web 2,085 · CLI 97).

## [1.175.5] - 2026-11-18

### Changed

- **Opens expanded.** The page opens with its content showing.
`;

const README = `<img src="og.png">

[![Version](https://img.shields.io/badge/version-1.175.6-blue)](https://example.org/releases) ![Tests](https://img.shields.io/badge/tests-4837%20passing-brightgreen)

## Tests

**4,837 tests** across 275 test files (API 2,655 · Web 2,085 · CLI 97) — plus the gates.

### v0.0.1 — a heading that is NOT in the review history

## Security

### Review history

Reviewed before every release.

### v1.175.6 — 2026-11-18 · Larger text (no new attack surface)

No new attack surface. \`pnpm audit --prod\`: unchanged. Tests 4,837 green.

### v1.175.5 — 2026-11-18 · Opens expanded (no new attack surface)

No new attack surface.
`;

const SECURITY_LOG = `export interface SecurityAuditEntry {
  version: string;
  meta: string;
  body: { kind: "p"; html: string }[];
}

/** Reverse-chronological: newest first. Add new releases at the TOP. */
export const SECURITY_AUDIT_ENTRIES: SecurityAuditEntry[] = [
  {
    version: "v1.175.6",
    meta: "Reviewed <strong>2026-11-18</strong> &middot; scope: text size.",
    body: [
      {
        kind: "p",
        html: "No new findings.",
      },
    ],
  },
];
`;

const notes: ReleaseNotes = {
  title: "Deploys roll back by themselves",
  summary: "A deploy that fails its health check now puts the previous version back",
  securityNote: "No new attack surface: deploy tooling only",
  scope: "the deploy script",
};
const bare: ReleaseNotes = { title: "Something" };
const cleanAudit: AuditOutcome = {
  ran: true,
  text: "no known advisories in production dependencies.",
};
const counts: TestCounts = { total: 4901, files: 280, api: 2700, web: 2100, cli: 101 };

describe("version arithmetic", () => {
  it("bumps patch, minor and major", () => {
    expect(nextVersion("1.175.6", "patch")).toBe("1.175.7");
    expect(nextVersion("1.175.6", "minor")).toBe("1.176.0");
    expect(nextVersion("1.175.6", "major")).toBe("2.0.0");
  });

  it("accepts an explicit newer version and refuses an older or equal one", () => {
    expect(nextVersion("1.175.6", "1.180.0")).toBe("1.180.0");
    expect(() => nextVersion("1.175.6", "1.175.6")).toThrow(/not newer/);
    expect(() => nextVersion("1.175.6", "1.9.99")).toThrow(/not newer/);
  });

  it("compares numerically, not as text", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.175.6", "1.175.6")).toBe(0);
  });

  it("refuses anything that is not a bump word or plain x.y.z", () => {
    expect(() => nextVersion("1.175.6", "next")).toThrow(/expected patch/);
    expect(() => nextVersion("1.175.6", "v1.176.0")).toThrow(/expected patch/);
    expect(() => nextVersion("1.175.6-beta", "patch")).toThrow(/not plain/);
  });
});

describe("version writers", () => {
  const pkg = `{\n  "name": "web",\n  "version": "1.175.6",\n  "private": true\n}\n`;

  it("changes only the version in a package.json, keeping its layout", () => {
    expect(bumpPackageJson(pkg, "1.175.6", "1.175.7")).toBe(pkg.replace("1.175.6", "1.175.7"));
  });

  it("fails when the package.json is not at the expected version", () => {
    expect(() => bumpPackageJson(pkg, "1.175.5", "1.175.7")).toThrow(/does not carry/);
  });

  it("updates the README badge and nothing else", () => {
    const out = bumpReadmeBadge(README, "1.175.7");
    expect(out).toContain("badge/version-1.175.7-blue");
    expect(out.replace("version-1.175.7-", "version-1.175.6-")).toBe(README);
  });

  it("fails when the README has no version badge", () => {
    expect(() => bumpReadmeBadge("# nothing here\n", "1.0.0")).toThrow(/no version badge/);
  });
});

describe("CHANGELOG scaffold", () => {
  it("inserts the new section above the newest one, in the existing format", () => {
    const out = scaffoldChangelog(CHANGELOG, "1.175.7", "2026-11-24", notes, counts);
    expect(newestChangelogVersion(out)).toBe("1.175.7");
    expect(out).toContain(
      "## [1.175.7] - 2026-11-24\n\n### Changed\n\n" +
        "- **Deploys roll back by themselves.** A deploy that fails its health check now puts the previous version back.\n\n" +
        "### Notes\n\n- Tests 4,901 across 280 files (API 2,700 · Web 2,100 · CLI 101).\n\n" +
        "## [1.175.6] - 2026-11-18",
    );
    // Everything that was there is still there, in order.
    expect(out.replace(/## \[1\.175\.7\][\s\S]*?(?=## \[1\.175\.6\])/, "")).toBe(CHANGELOG);
    expect(findPlaceholders({ c: out })).toEqual([]);
  });

  it("leaves a marked placeholder for prose and counts it was not given", () => {
    const out = scaffoldChangelog(CHANGELOG, "1.175.7", "2026-11-24", bare, null);
    expect(findPlaceholders({ "CHANGELOG.md": out })).toHaveLength(2);
  });

  it("refuses to write the same version twice, or into a file with no heading", () => {
    expect(() => scaffoldChangelog(CHANGELOG, "1.175.6", "2026-11-24", notes, null)).toThrow(
      /already has/,
    );
    expect(() => scaffoldChangelog("# Changelog\n", "1.0.0", "2026-11-24", notes, null)).toThrow(
      /no `## \[x\.y\.z\]`/,
    );
  });
});

describe("README § Security scaffold", () => {
  it("inserts above the newest review-history entry, not above an earlier look-alike", () => {
    const out = scaffoldReadmeSecurity(README, "1.175.7", "2026-11-24", notes, cleanAudit, counts);
    expect(out.indexOf("### v1.175.7 — ")).toBeGreaterThan(out.indexOf("### Review history"));
    expect(out.indexOf("### v1.175.7 — ")).toBeLessThan(out.indexOf("### v1.175.6 — "));
    expect(out).toContain(
      "### v1.175.7 — 2026-11-24 · Deploys roll back by themselves (the deploy script)\n\n" +
        "No new attack surface: deploy tooling only. `pnpm audit --prod`: no known advisories in production dependencies. Tests 4,901 green. ",
    );
    expect(newestReadmeSecurityVersion(out.slice(out.indexOf("### Review history")))).toBe(
      "1.175.7",
    );
  });

  it("never claims green checks it did not run: that line is always a placeholder", () => {
    const out = scaffoldReadmeSecurity(README, "1.175.7", "2026-11-24", notes, cleanAudit, counts);
    const left = findPlaceholders({ "README.md": out });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(/lint, format, typecheck and build/);
  });

  it("refuses a duplicate entry and a README with no review history", () => {
    expect(() =>
      scaffoldReadmeSecurity(README, "1.175.6", "2026-11-24", notes, cleanAudit, null),
    ).toThrow(/already has/);
    expect(() =>
      scaffoldReadmeSecurity("# x\n", "1.0.0", "2026-11-24", notes, cleanAudit, null),
    ).toThrow(/Review history/);
  });
});

describe("security-log scaffold", () => {
  it("prepends an entry object in the existing layout", () => {
    const out = scaffoldSecurityLog(SECURITY_LOG, "1.175.7", "2026-11-24", notes, cleanAudit);
    expect(newestSecurityLogVersion(out)).toBe("1.175.7");
    expect(out).toContain(
      "export const SECURITY_AUDIT_ENTRIES: SecurityAuditEntry[] = [\n" +
        "  {\n" +
        '    version: "v1.175.7",\n' +
        '    meta: "Reviewed <strong>2026-11-24</strong> &middot; scope: the deploy script.",\n' +
        "    body: [\n" +
        "      {\n" +
        '        kind: "p",\n' +
        '        html: "No new attack surface: deploy tooling only. Dependency scan for this release: no known advisories in production dependencies.",\n' +
        "      },\n" +
        "    ],\n" +
        "  },\n" +
        "  {\n" +
        '    version: "v1.175.6",',
    );
    expect(out.replace(/ {2}\{\n {4}version: "v1\.175\.7"[\s\S]*?\n {2}\},\n/, "")).toBe(
      SECURITY_LOG,
    );
  });

  it("writes only what the log's own test allows: no backticks, no interpolation", () => {
    const out = scaffoldSecurityLog(
      SECURITY_LOG,
      "1.175.7",
      "2026-11-24",
      { title: "x", securityNote: "Only `rebuild.sh` changed; a < b & c" },
      cleanAudit,
    );
    const entry = out.slice(out.indexOf('"v1.175.7"'), out.indexOf('"v1.175.6"'));
    expect(entry).toContain("<code>rebuild.sh</code>");
    expect(entry).toContain("a &lt; b &amp; c");
    expect(entry).not.toMatch(/`|\$\{/);
    expect(() => toLogHtml("uses ${interpolation}")).toThrow();
    expect(() => toLogHtml("one ` stray")).toThrow(/unmatched/);
  });

  it("prefers the plain-language note when one is given", () => {
    const out = scaffoldSecurityLog(
      SECURITY_LOG,
      "1.175.7",
      "2026-11-24",
      { ...notes, securityNotePlain: "Nothing about how files are handled changed" },
      cleanAudit,
    );
    expect(out).toContain("Nothing about how files are handled changed. Dependency scan");
  });

  it("refuses a duplicate entry and a file without the array", () => {
    expect(() =>
      scaffoldSecurityLog(SECURITY_LOG, "1.175.6", "2026-11-24", notes, cleanAudit),
    ).toThrow(/already has/);
    expect(() =>
      scaffoldSecurityLog("export const x = [];\n", "1.0.0", "2026-11-24", notes, cleanAudit),
    ).toThrow(/cannot find/);
  });
});

describe("placeholder detection", () => {
  it("reports file, line and text for each placeholder", () => {
    const hits = findPlaceholders({
      "a.md": `one\n${PLACEHOLDER}: write this\nthree`,
      "b.ts": "clean",
    });
    expect(hits).toEqual([`a.md:2: ${PLACEHOLDER}: write this`]);
  });

  it("a release given no prose is full of them, in all three records", () => {
    const failed = summarizeAudit("not json");
    const files = {
      "CHANGELOG.md": scaffoldChangelog(CHANGELOG, "1.175.7", "2026-11-24", bare, null),
      "README.md": scaffoldReadmeSecurity(README, "1.175.7", "2026-11-24", bare, failed, null),
      "securityAudits.ts": scaffoldSecurityLog(SECURITY_LOG, "1.175.7", "2026-11-24", bare, failed),
    };
    const hits = findPlaceholders(files);
    for (const name of Object.keys(files)) {
      expect(hits.some((h) => h.startsWith(`${name}:`))).toBe(true);
    }
  });

  it("the real files' fixtures start clean", () => {
    expect(findPlaceholders({ CHANGELOG, README, SECURITY_LOG })).toEqual([]);
  });
});

describe("the dependency scan is reported, never assumed", () => {
  it("reads a clean result", () => {
    const out = summarizeAudit(
      JSON.stringify({
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
      }),
    );
    expect(out.ran).toBe(true);
    expect(out.text).toBe("no known advisories in production dependencies.");
  });

  it("reports what was found, worst first, and asks a person to explain it", () => {
    const out = summarizeAudit(
      JSON.stringify({ metadata: { vulnerabilities: { low: 0, moderate: 2, high: 1 } } }),
    );
    expect(out.ran).toBe(true);
    expect(out.text).toMatch(/^1 high, 2 moderate in production dependencies\./);
    expect(out.text).toContain(PLACEHOLDER);
  });

  it("output it cannot read becomes a placeholder, not a result", () => {
    for (const bad of ["", "ERR_PNPM_AUDIT_BAD_RESPONSE", "{}", '{"metadata":{}}']) {
      const out = summarizeAudit(bad);
      expect(out.ran, bad).toBe(false);
      expect(out.text, bad).toContain(PLACEHOLDER);
    }
  });
});

describe("counts come from a run", () => {
  const summary = [
    "════════",
    "  TEST SUMMARY",
    "  \x1b[32m✔\x1b[0m API      \x1b[32m2700 passed\x1b[0m (125 files)",
    "  \x1b[32m✔\x1b[0m Web      \x1b[32m2100 passed\x1b[0m (148 files)",
    "  \x1b[32m✔\x1b[0m CLI      \x1b[32m101 passed\x1b[0m (7 files)",
    "────────",
    "  \x1b[32m✔ 4901 tests passed\x1b[0m across 280 files",
  ].join("\n");

  it("reads the summary scripts/test.ts prints", () => {
    expect(parseTestSummary(summary)).toEqual(counts);
  });

  it("returns nothing for a failed or unreadable run, and for totals that do not add up", () => {
    expect(parseTestSummary("✖ 3 failed, 4898 passed of 4901 tests across 280 files")).toBeNull();
    expect(parseTestSummary("")).toBeNull();
    expect(parseTestSummary(summary.replace("4901 tests", "4902 tests"))).toBeNull();
  });

  it("writes them into the README badge and the Tests line", () => {
    const out = updateReadmeCounts(README, counts);
    expect(out).toContain("badge/tests-4901%20passing");
    expect(out).toContain(
      "**4,901 tests** across 280 test files (API 2,700 · Web 2,100 · CLI 101) — plus the gates.",
    );
    expect(() => updateReadmeCounts("# no counts\n", counts)).toThrow();
  });

  it("writes them into brief-stats.json without disturbing the rest", () => {
    const stats = `{\n  "//": "note",\n  "tests": 4837,\n  "traps": 249,\n  "cache": {\n    "audits_total": 12880\n  }\n}\n`;
    const out = updateBriefStats(stats, 4901, 252);
    expect(JSON.parse(out)).toEqual({
      "//": "note",
      tests: 4901,
      traps: 252,
      cache: { audits_total: 12880 },
    });
    expect(() => updateBriefStats("{}", 1, 1)).toThrow();
  });

  it("groups thousands the same way on every machine", () => {
    expect(thousands(97)).toBe("97");
    expect(thousands(4837)).toBe("4,837");
    expect(thousands(1234567)).toBe("1,234,567");
  });
});
