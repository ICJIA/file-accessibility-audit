/**
 * By code and by wording, the same answer — for every real engine result.
 *
 * fixTime.ts, actionPlan.ts and bestPractices/* recognise the engine's finding
 * lines through the rules in utils/findingMatch.ts: by the line's finding CODE
 * when the report carries codes (`findingDetails`, v1.176.0+), by its WORDING
 * when it does not (a report stored earlier, a shared link to one). This file
 * is the gate that keeps the two routes from drifting apart. Four checks:
 *
 *   1. PARITY. Each consumer gives the same output for a real engine result
 *      as it is, and with every `findingDetails` removed. A wrong code in the
 *      table fails here.
 *   2. THE CODE ROUTE NEVER READS THE WORDS. With every rule's wording
 *      switched off, a coded result still gets the same output — so rewording
 *      a finding in the engine cannot move an estimate, a plan step or a row.
 *   3. THE WORDING STILL FITS WHAT THE ENGINE WRITES TODAY. For every rule and
 *      every code it lists, the text the engine's source tags with that code
 *      is matched by the rule's wording. This is the check that fails on the
 *      day a finding is reworded — in CI, with no control documents needed —
 *      and its message says what to do (add the new wording as an
 *      alternative; never replace the old one, stored reports still carry it).
 *   4. NOTHING IS TAKEN ON TRUST. Every (rule, code) pair is accounted for by
 *      check 3, by a real fixture line, or by a named exception below.
 *
 * THE FIXTURE — fixtures/finding-consumers.ndjson — is real `analyzeDocument()`
 * output for the synthetic control documents (the trap batteries: files this
 * repository generates, so no real document's text is in it), trimmed to the
 * fields the consumers read and thinned to the documents needed to keep every
 * rule and every distinct consumer answer represented. Regenerate it after a
 * finding is reworded, a code is added or a trap is added:
 *
 *     pnpm synthetic-controls && pnpm synthetic-office-controls
 *     pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/characterize-finding-consumers.ts --write-fixture
 *
 * The same script checks parity over the WHOLE control corpus, real documents
 * included, on a machine that has them (`--label x`, then `--parity x`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findingCodeInfo, type FileType } from "@file-audit/shared";
import { buildActionPlan } from "../utils/actionPlan";
import { estimateFixTime } from "../utils/fixTime";
import {
  CATALOG,
  bestPracticeBacklog,
  buildContext,
  evaluateBestPractices,
  uncoveredNotScored,
} from "../utils/bestPractices";
import { FINDING, buildCodeIndex, type FindingRule } from "../utils/findingMatch";
import { partitionCardFindings } from "../utils/findings";
import { engineFindingTexts } from "./helpers/engineFindingTexts";
import sampleReport from "../data/sampleReport.json";

// ---------------------------------------------------------------------------
// Real engine results
// ---------------------------------------------------------------------------

interface Category {
  id: string;
  label: string;
  score: number | null;
  severity: string | null;
  notAssessed?: boolean;
  findings: string[];
  findingDetails?: Array<{ code: string; text: string; count?: number; total?: number }>;
}
interface Result {
  name: string;
  fileType: FileType;
  pageCount: number;
  pdfMetadata: { creator: string | null };
  conformance: { status?: unknown; failures?: unknown } | null;
  categories: Category[];
}

type FixtureDetail = string | [string, number | null] | [string, number | null, number];

function loadFixture(): Result[] {
  const raw = readFileSync(
    resolve(import.meta.dirname, "fixtures", "finding-consumers.ndjson"),
    "utf8",
  );
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const d = JSON.parse(line);
      return {
        name: d.name,
        fileType: d.fileType,
        pageCount: d.pageCount,
        pdfMetadata: { creator: d.creator },
        conformance: d.conformance,
        categories: d.categories.map(
          ({ codes, ...c }: Category & { codes: FixtureDetail[] }): Category => ({
            ...c,
            // A detail's `text` is the finding beside it, byte for byte — the
            // fixture stores it once.
            findingDetails: codes.map((entry, i) => {
              const [code, count, total] = Array.isArray(entry) ? entry : [entry];
              return {
                code,
                text: c.findings[i]!,
                ...(typeof count === "number" ? { count } : {}),
                ...(typeof total === "number" ? { total } : {}),
              };
            }),
          }),
        ),
      };
    });
}

const FIXTURE = loadFixture();

/** The bundled sample report: a real PDF result with its scoring profile. */
const SAMPLE: Result[] = (() => {
  const s = sampleReport as unknown as Result & {
    scoreProfiles?: Record<string, { categories?: Category[] }>;
  };
  const views: Result[] = [{ ...s, name: "sampleReport.json" }];
  for (const [profile, p] of Object.entries(s.scoreProfiles ?? {})) {
    if (p?.categories) {
      views.push({ ...s, name: `sampleReport.json (${profile})`, categories: p.categories });
    }
  }
  return views;
})();

const RESULTS = [...FIXTURE, ...SAMPLE];

/** The same result as a report stored before v1.176.0 carries it. */
function withoutCodes(result: Result): Result {
  return {
    ...result,
    categories: result.categories.map(({ findingDetails: _dropped, ...c }) => c),
  };
}

/** Everything the three consumers say about one result — wider than a page
 *  shows: the estimate of EVERY category, and every practice's verdict before
 *  the section's filter, so a difference cannot hide behind either. */
function consume(result: Result) {
  const ft = result.fileType;
  const byId = new Map(result.categories.map((c) => [c.id, c]));
  return JSON.parse(
    JSON.stringify({
      plan: buildActionPlan(result.categories, ft, result.pdfMetadata?.creator, result.conformance),
      fixTime: Object.fromEntries(
        result.categories.map((c) => [
          c.id,
          estimateFixTime(c.id, c.findings, ft, c.findingDetails) ?? null,
        ]),
      ),
      practices: evaluateBestPractices(result).map(({ practice, ...row }) => ({
        id: practice.id,
        ...row,
      })),
      backlog: bestPracticeBacklog(result),
      alsoNoted: uncoveredNotScored(result),
      detect: CATALOG.filter((p) => p.formats.includes(ft)).map((p) => {
        const ctx = buildContext(byId.get(p.categoryId), ft, result.pageCount, null);
        return { id: p.id, ...p.detect(ctx), consumed: [...ctx.consumed].sort() };
      }),
    }),
  );
}

/** Run `fn` with the wording of every coded rule switched off — what the
 *  consumers would see if every finding had been reworded past recognition. */
function withWordingsOff<T>(fn: () => T): T {
  type Mutable = { -readonly [K in keyof FindingRule]: FindingRule[K] };
  const rules = Object.values(FINDING) as Mutable[];
  const saved = rules.map((r) => ({ wording: r.wording, pattern: r.pattern }));
  for (const r of rules) {
    if (r.codes.length === 0) continue;
    r.wording = () => false;
    r.pattern = undefined;
  }
  try {
    return fn();
  } finally {
    rules.forEach((r, i) => {
      r.wording = saved[i]!.wording;
      r.pattern = saved[i]!.pattern;
    });
  }
}

/** A line as partitionCardFindings files it (see findingMatch.ts shownForm). */
const shown = (line: string): string =>
  line.startsWith("---")
    ? line
        .replace(/^-{3}\s*/, "")
        .replace(/\s*-{3}$/, "")
        .trim()
    : line.startsWith("  ")
      ? line.replace(/^\s+/, "")
      : line;

// ---------------------------------------------------------------------------

describe("the fixture is real, coded engine output", () => {
  it("covers every format with enough documents to mean something", () => {
    expect(FIXTURE.length).toBeGreaterThanOrEqual(50);
    for (const ft of ["pdf", "docx", "pptx", "xlsx"]) {
      expect(FIXTURE.filter((r) => r.fileType === ft).length).toBeGreaterThanOrEqual(5);
    }
  });

  it("carries a real code for every finding line, and the sample report does too", () => {
    for (const r of RESULTS) {
      for (const c of r.categories) {
        expect(c.findingDetails, `${r.name} ${c.id}`).toHaveLength(c.findings.length);
        c.findingDetails!.forEach((d, i) => {
          expect(d.text).toBe(c.findings[i]);
          expect(findingCodeInfo(d.code), `${r.name} ${c.id}: ${d.code}`).toBeDefined();
        });
      }
    }
  });

  it("identifies no machine and no person", () => {
    const raw = readFileSync(
      resolve(import.meta.dirname, "fixtures", "finding-consumers.ndjson"),
      "utf8",
    );
    expect(raw).not.toMatch(/\/Users\/|\/Volumes\/|\/private\/tmp|\/home\//);
    expect(raw).not.toMatch(/"Author: /);
    for (const r of FIXTURE) expect(r.name).toMatch(/^synthetic-/);
  });
});

describe("by code and by wording, each consumer gives the same output", () => {
  it.each(RESULTS.map((r) => [r.name, r] as const))("%s", (_name, result) => {
    const coded = consume(result);
    const wording = consume(withoutCodes(result));
    expect(coded.fixTime).toEqual(wording.fixTime);
    expect(coded.plan).toEqual(wording.plan);
    expect(coded.detect).toEqual(wording.detect);
    expect(coded.practices).toEqual(wording.practices);
    expect(coded.backlog).toEqual(wording.backlog);
    expect(coded.alsoNoted).toEqual(wording.alsoNoted);
  });

  it("is not comparing nothing: the plans, estimates and rows are there", () => {
    const all = FIXTURE.map(consume);
    const steps = all.flatMap((o) => o.plan);
    expect(steps.length).toBeGreaterThanOrEqual(40);
    expect(steps.filter((s: { estimate?: unknown }) => s.estimate).length).toBeGreaterThanOrEqual(
      25,
    );
    const statuses = new Set(all.flatMap((o) => o.detect.map((d: { status: string }) => d.status)));
    expect([...statuses].sort()).toEqual(["met", "not-applicable", "not-checked", "not-met"]);
    // Many different steps, not one default repeated — the plan's variants
    // are what the rules choose between.
    const titles = new Set(steps.map((s: { title: string }) => s.title));
    expect(titles.size).toBeGreaterThanOrEqual(20);
  });
});

describe("the code route never reads the words", () => {
  it("a coded result gets the same output with every rule's wording switched off", () => {
    for (const result of RESULTS) {
      const normal = consume(result);
      const reworded = withWordingsOff(() => consume(result));
      expect(reworded, result.name).toEqual(normal);
    }
  });

  it("…and that switch really does blind the wording route (the check above is not hollow)", () => {
    let changed = 0;
    for (const result of FIXTURE) {
      const stored = withoutCodes(result);
      const normal = JSON.stringify(consume(stored));
      const blind = JSON.stringify(withWordingsOff(() => consume(stored)));
      if (normal !== blind) changed++;
    }
    expect(changed).toBeGreaterThan(FIXTURE.length * 0.9);
  });

  it("a detail that is not the twin of its line is ignored, and nothing throws", () => {
    for (const result of FIXTURE.slice(0, 12)) {
      const expected = consume(withoutCodes(result));
      const forged: unknown[] = [
        "not an array",
        42,
        null,
        // Wrong length.
        (c: Category) => c.findingDetails!.slice(1),
        // Right length, texts shifted by one: no detail lines up with its line.
        (c: Category) => c.findingDetails!.map((d, i) => ({ ...d, text: c.findings[i + 1] })),
        // Entries that are not objects at all.
        (c: Category) => c.findings.map(() => "pdf.heading_structure.no_heading_tags"),
        // The engine's own "no code" placeholder.
        (c: Category) =>
          c.findingDetails!.map((d) => ({ ...d, code: `${result.fileType}.${c.id}.uncoded` })),
      ];
      for (const shape of forged) {
        const damaged = {
          ...result,
          categories: result.categories.map((c) => ({
            ...c,
            findingDetails: typeof shape === "function" ? shape(c) : shape,
          })),
        } as unknown as Result;
        expect(consume(damaged), result.name).toEqual(expected);
      }
    }
  });
});

describe("every rule's wording still fits what the engine writes under its codes", () => {
  /**
   * Pairs the source reader cannot vouch for, each with its reason. Anything
   * else must pass the source check, or — where the engine builds the string
   * out of the syntax tree's sight — appear in the fixture.
   */
  const EXCEPTIONS: Record<string, { why: string; anchor?: { file: string; text: string } }> = {
    "pptxUntitledSlides pptx.slide_titles.untitled_slides": {
      why: 'The wording this line carried before 2026-11-16 ("…no title…"). Today\'s wording is pptxUntitledSlidesCurrent, which names the same code; this rule exists for stored reports only.',
    },
    "xlsxDataStartsLate xlsx.table_markup.data_starts_far_from_a1": {
      why: "The phrase sits inside a .map().join() the source reader replaces with a placeholder, and no synthetic control starts its data far from A1.",
      anchor: { file: "xlsx.ts", text: "data begins at row" },
    },
  };

  const fixtureCodes = new Set(
    RESULTS.flatMap((r) => r.categories.flatMap((c) => c.findingDetails!.map((d) => d.code))),
  );
  const pairs = Object.entries(FINDING).flatMap(([name, rule]) =>
    (rule.codes as readonly string[]).map((code) => ({ name, rule: rule as FindingRule, code })),
  );

  it("names only codes the registry has, and no rule is left without one", () => {
    for (const { name, code } of pairs) {
      expect(findingCodeInfo(code), `${name}: ${code}`).toBeDefined();
    }
    // A rule with no code goes by wording for EVERY report. None does today;
    // adding one is a decision to make here, in the open.
    const wordingOnly = Object.entries(FINDING)
      .filter(([, rule]) => rule.codes.length === 0)
      .map(([name]) => name);
    expect(wordingOnly).toEqual([]);
  });

  it("no pattern carries a flag that would make it remember the previous line", () => {
    for (const [name, rule] of Object.entries(FINDING)) {
      const pattern = (rule as FindingRule).pattern;
      if (pattern) expect(pattern.flags, name).not.toMatch(/[gy]/);
    }
  });

  it("matches every shape of every string the engine tags with a listed code", () => {
    const texts = engineFindingTexts();
    // The reader must actually be reading: a refactor of the tagging helper
    // that left it finding nothing would otherwise pass everything below.
    expect(texts.size).toBeGreaterThan(450);

    const problems: string[] = [];
    let bySource = 0;
    let byFixture = 0;
    for (const { name, rule, code } of pairs) {
      const key = `${name} ${code}`;
      const exception = EXCEPTIONS[key];
      if (exception) {
        if (exception.anchor) {
          const source = readFileSync(
            resolve(
              import.meta.dirname,
              "../../../../packages/analyzer/src/scoring",
              exception.anchor.file,
            ),
            "utf8",
          );
          const at = source.indexOf(`"${code}"`);
          const near = at === -1 ? "" : source.slice(at, at + 900);
          if (!near.includes(exception.anchor.text) || !rule.wording(exception.anchor.text)) {
            problems.push(
              `${key}: "${exception.anchor.text}" no longer follows the code in ${exception.anchor.file}`,
            );
          }
        }
        continue;
      }
      const known = texts.get(code);
      if (known && !known.dynamic) {
        const missed = known.shapes.filter((s) => !rule.wording(s) && !rule.wording(shown(s)));
        if (missed.length > 0) {
          problems.push(`${key}: the engine now writes "${missed[0]!.slice(0, 140)}"`);
        } else bySource++;
        continue;
      }
      // Built out of the reader's sight: a real fixture line has to stand in,
      // and the parity tests above are what check it.
      if (fixtureCodes.has(code)) byFixture++;
      else problems.push(`${key}: not readable from the engine's source and not in the fixture`);
    }

    expect(
      problems,
      [
        "A finding's wording and the rule that recognises it no longer agree (utils/findingMatch.ts).",
        "Reports that carry finding codes are NOT affected — they are matched by code.",
        "If the engine's wording changed on purpose: ADD the new wording to the rule as an",
        "alternative. Do not replace the old one — reports stored before the change still carry it.",
        "Then regenerate the fixture (command in this file's header).",
      ].join("\n"),
    ).toEqual([]);
    // Most pairs are vouched for by the source itself; the fixture stands in
    // for only the few strings a helper builds.
    expect(bySource).toBeGreaterThan(pairs.length * 0.9);
    expect(bySource + byFixture + Object.keys(EXCEPTIONS).length).toBe(pairs.length);
  });

  it("has no exception left over for a pair that no longer exists", () => {
    const live = new Set(pairs.map((p) => `${p.name} ${p.code}`));
    for (const key of Object.keys(EXCEPTIONS)) expect(live.has(key), key).toBe(true);
  });
});

describe("the code index knows a line the way the report card files it", () => {
  // buildCodeIndex mirrors partitionCardFindings (a divider becomes its bare
  // heading, a signal line loses its indent). If that function changed how it
  // files a line, group and item rules would silently fall back to wording.
  it("finds a code for every signal-group heading and every signal item", () => {
    let headings = 0;
    let items = 0;
    for (const r of RESULTS) {
      for (const c of r.categories) {
        const index = buildCodeIndex(c.findings, c.findingDetails);
        for (const group of partitionCardFindings(c.findings).signals) {
          if (group.heading) {
            expect(index?.get(group.heading), `${r.name} ${c.id}: ${group.heading}`).toBeDefined();
            headings++;
          }
          for (const item of group.items) {
            expect(index?.get(item), `${r.name} ${c.id}: ${item}`).toBeDefined();
            items++;
          }
        }
      }
    }
    expect(headings).toBeGreaterThanOrEqual(250);
    expect(items).toBeGreaterThanOrEqual(700);
  });
});
