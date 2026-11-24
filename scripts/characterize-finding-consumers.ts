/**
 * scripts/characterize-finding-consumers.ts — what the three web consumers of
 * finding lines say about every control document, recorded so two runs can be
 * compared.
 *
 *   tsx --tsconfig scripts/tsconfig.json scripts/characterize-finding-consumers.ts --label before
 *   tsx --tsconfig scripts/tsconfig.json scripts/characterize-finding-consumers.ts --label after
 *   tsx --tsconfig scripts/tsconfig.json scripts/characterize-finding-consumers.ts --diff before after
 *   tsx --tsconfig scripts/tsconfig.json scripts/characterize-finding-consumers.ts --parity after
 *   tsx --tsconfig scripts/tsconfig.json scripts/characterize-finding-consumers.ts --write-fixture
 *
 * WHY. apps/web/app/utils/fixTime.ts, actionPlan.ts and bestPractices/* decide
 * things from finding lines. They decide by finding CODE when a result carries
 * codes (`findingDetails`, v1.176.0+) and by the line's wording when it does
 * not (stored reports from before then). The two routes must give the same
 * answer for every document, and changing how they decide must not change any
 * answer. This script is how that is shown on the whole corpus:
 *
 *   --label <name>   analyse every file in controls/ (the same listing
 *                    score-ledger.ts uses), run the three consumers twice —
 *                    once on the result as the engine wrote it ("coded") and
 *                    once with every `findingDetails` removed ("wording") —
 *                    and write both to
 *                    node_modules/.cache/finding-consumers/outputs-<name>.json
 *   --diff a b       compare two recorded runs; exit 1 on any difference
 *   --parity <name>  compare "coded" with "wording" inside one run; exit 1 on
 *                    any difference
 *   --write-fixture  write the fixture findingCodeParity.test.ts reads:
 *                    apps/web/app/__tests__/fixtures/finding-consumers.ndjson,
 *                    one trimmed engine result per line. Only the SYNTHETIC
 *                    controls go in (the trap batteries: files this repository
 *                    generates, with no real document's text), and of those
 *                    only the documents needed to keep every rule and every
 *                    distinct consumer answer represented. Re-run it after a
 *                    finding is reworded, a code is added or a trap is added.
 *
 * Raw engine results are cached under node_modules/.cache/finding-consumers/raw
 * keyed by the file's content hash and the analyzer version, so a second run
 * takes seconds. --refresh ignores the cache.
 *
 * Not a CI gate: controls/ holds real documents and exists only on a
 * developer's machine. The permanent gate is the web test named above.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import { buildActionPlan } from "~/utils/actionPlan";
import { estimateFixTime } from "~/utils/fixTime";
import { FINDING, buildCodeIndex, findingHit } from "~/utils/findingMatch";
import {
  CATALOG,
  bestPracticeBacklog,
  buildContext,
  evaluateBestPractices,
  uncoveredNotScored,
} from "~/utils/bestPractices";
import type { FileType } from "@file-audit/shared";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTROLS = path.join(ROOT, "controls");
const CACHE = path.join(ROOT, "node_modules", ".cache", "finding-consumers");
const RAW = path.join(CACHE, "raw");
const FIXTURE = path.join(ROOT, "apps/web/app/__tests__/fixtures/finding-consumers.ndjson");
const SUPPORTED = new Set([".pdf", ".docx", ".pptx", ".xlsx", ".xls"]);

type Json = Record<string, unknown>;

const arg = (flag: string, offset = 1): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + offset];
};
const has = (flag: string) => process.argv.includes(flag);

/** One level deep, dotfiles skipped — score-ledger.ts's listing. */
function listControls(): string[] {
  const listDir = (dir: string, prefix = ""): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith("."))
      .flatMap((e) =>
        e.isDirectory() && prefix === ""
          ? listDir(path.join(dir, e.name), e.name + "/")
          : SUPPORTED.has(path.extname(e.name).toLowerCase())
            ? [prefix + e.name]
            : [],
      );
  return listDir(CONTROLS).sort();
}

function engineVersion(): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "packages/analyzer/package.json"), "utf8"),
  ) as { version?: string };
  return pkg.version ?? "unknown";
}

async function rawResult(file: string, refresh: boolean): Promise<Json> {
  const buf = fs.readFileSync(path.join(CONTROLS, file));
  const key = crypto
    .createHash("sha1")
    .update(engineVersion())
    .update("\0")
    .update(path.basename(file))
    .update("\0")
    .update(buf)
    .digest("hex");
  const cached = path.join(RAW, `${key}.json`);
  if (!refresh && fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, "utf8")) as Json;
  let out: Json;
  try {
    out = JSON.parse(JSON.stringify(await analyzeDocument(buf, file))) as Json;
  } catch (e) {
    out = { __error: String((e as Error)?.message ?? e).split("\n")[0] };
  }
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(cached, JSON.stringify(out));
  return out;
}

/** The same result with every `findingDetails` removed — what a report stored
 *  before v1.176.0 looks like to the web app. */
export function stripFindingDetails(result: Json): Json {
  return JSON.parse(
    JSON.stringify(result, (key, value) => (key === "findingDetails" ? undefined : value)),
  ) as Json;
}

function categoryLists(result: Json): Array<{ name: string; categories: Json[] }> {
  const lists: Array<{ name: string; categories: Json[] }> = [];
  if (Array.isArray(result.categories)) {
    lists.push({ name: "top", categories: result.categories as Json[] });
  }
  const profiles = (result.scoreProfiles ?? {}) as Record<string, { categories?: Json[] }>;
  for (const [name, profile] of Object.entries(profiles)) {
    if (Array.isArray(profile?.categories)) {
      lists.push({ name: `profile:${name}`, categories: profile.categories });
    }
  }
  return lists;
}

/** Everything the three consumers say about one result. Deliberately wider
 *  than what a page shows: the fix-time estimate of EVERY category (not only
 *  the ones in the plan), and every practice's verdict (not only the two
 *  statuses the section lists), so a difference cannot hide behind a filter. */
function consume(result: Json): Json {
  const ft = result.fileType as FileType;
  const creator = (result.pdfMetadata as { creator?: string | null } | undefined)?.creator;
  const conformance = result.conformance as { status?: unknown; failures?: unknown } | undefined;
  const pageCount = typeof result.pageCount === "number" ? result.pageCount : 0;
  const out: Json = {};

  for (const { name, categories } of categoryLists(result)) {
    out[`plan@${name}`] = buildActionPlan(categories, ft, creator, conformance);
    out[`fixTime@${name}`] = Object.fromEntries(
      categories.map((c) => [
        String(c.id),
        estimateFixTime(String(c.id), (c.findings ?? []) as string[], ft, c.findingDetails) ?? null,
      ]),
    );
    const viewed = { ...result, categories };
    out[`practices@${name}`] = evaluateBestPractices(viewed).map(
      ({ practice, ...row }) => ({ id: practice.id, ...row }) as Json,
    );
    out[`backlog@${name}`] = bestPracticeBacklog(viewed);
    out[`alsoNoted@${name}`] = uncoveredNotScored(viewed);
    const byId = new Map(categories.map((c) => [String(c.id), c]));
    out[`detect@${name}`] = CATALOG.filter((p) => p.formats.includes(ft)).map((p) => {
      const ctx = buildContext(byId.get(p.categoryId), ft, pageCount, null);
      return { id: p.id, ...p.detect(ctx), consumed: [...ctx.consumed].sort() };
    });
  }
  return JSON.parse(JSON.stringify(out)) as Json;
}

function diffValues(a: unknown, b: unknown, at: string, out: string[]): void {
  if (out.length > 400) return;
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const isObj = (v: unknown): v is Json => !!v && typeof v === "object";
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffValues(a[key], b[key], `${at}/${key}`, out);
    }
    return;
  }
  out.push(`${at}\n      - ${JSON.stringify(a)}\n      + ${JSON.stringify(b)}`);
}

const outputsPath = (label: string) => path.join(CACHE, `outputs-${label}.json`);
const readOutputs = (label: string) =>
  JSON.parse(fs.readFileSync(outputsPath(label), "utf8")) as Record<
    string,
    { coded?: Json; wording?: Json; error?: string }
  >;

function report(what: string, documents: number, problems: string[]): void {
  if (problems.length) {
    console.error(`${what}: ${problems.length} difference(s) across ${documents} document(s)`);
    for (const p of problems.slice(0, 60)) console.error("  " + p);
    process.exit(1);
  }
  console.log(`${what}: 0 differences across ${documents} document(s)`);
}

/** The fields the consumers read, and nothing else — no extracted text, no
 *  metadata beyond the Creator the plan's route swap looks at. A detail is
 *  written as `[code, count, total]` (trailing gaps dropped); its `text` is
 *  the finding beside it and is put back by the test's loader. */
function trimForFixture(name: string, result: Json): Json {
  const trimCategory = (c: Json): Json => ({
    id: c.id,
    label: c.label,
    score: c.score,
    severity: c.severity,
    ...(c.notAssessed === undefined ? {} : { notAssessed: c.notAssessed }),
    findings: c.findings,
    codes: ((c.findingDetails ?? []) as Json[]).map((d) =>
      d.total !== undefined
        ? [d.code, d.count ?? null, d.total]
        : d.count !== undefined
          ? [d.code, d.count]
          : d.code,
    ),
  });
  const conformance = result.conformance as { status?: unknown; failures?: Json[] } | undefined;
  return {
    name,
    fileType: result.fileType,
    pageCount: result.pageCount,
    creator: (result.pdfMetadata as { creator?: unknown } | undefined)?.creator ?? null,
    conformance: conformance
      ? {
          status: conformance.status,
          failures: (conformance.failures ?? []).map((f) => ({
            sc: f.sc,
            name: f.name,
            category: f.category,
          })),
        }
      : null,
    categories: ((result.categories ?? []) as Json[]).map(trimCategory),
  };
}

/** What a document adds to the fixture: every (rule, code) it exercises, and
 *  every distinct thing a consumer says about it. The fixture is the smallest
 *  set of documents that keeps all of them — chosen greedily, in file order,
 *  so the same corpus always yields the same fixture. */
function featuresOf(result: Json): Set<string> {
  const features = new Set<string>();
  const ft = result.fileType as FileType;
  const categories = (result.categories ?? []) as Json[];
  for (const c of categories) {
    const findings = (c.findings ?? []) as string[];
    const index = buildCodeIndex(findings, c.findingDetails);
    for (const [name, rule] of Object.entries(FINDING)) {
      for (const line of index?.keys() ?? []) {
        const hit = findingHit(rule, line, index);
        if (hit?.by === "code") features.add(`rule ${name} ${hit.coded.code}`);
      }
    }
    const estimate = estimateFixTime(String(c.id), findings, ft, c.findingDetails);
    features.add(
      `fixTime ${ft} ${String(c.id)} ${estimate ? (estimate.note ? "apply" : "sum") : "none"}`,
    );
  }
  const creator = (result.pdfMetadata as { creator?: string | null } | undefined)?.creator;
  const conformance = result.conformance as { status?: unknown; failures?: unknown } | undefined;
  for (const step of buildActionPlan(categories, ft, creator, conformance)) {
    features.add(`plan ${ft} ${step.categoryId} ${step.title}`);
  }
  const pageCount = typeof result.pageCount === "number" ? result.pageCount : 0;
  const byId = new Map(categories.map((c) => [String(c.id), c]));
  for (const p of CATALOG) {
    if (!p.formats.includes(ft)) continue;
    const row = p.detect(buildContext(byId.get(p.categoryId), ft, pageCount, null));
    features.add(`practice ${p.id} ${row.status} ${row.reason ?? ""} ${row.evidence.length}`);
  }
  return features;
}

async function main() {
  const diff = arg("--diff");
  if (diff) {
    const other = arg("--diff", 2);
    if (!other) throw new Error("--diff needs two labels");
    const a = readOutputs(diff);
    const b = readOutputs(other);
    const problems: string[] = [];
    for (const file of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diffValues(a[file], b[file], file, problems);
    }
    report(`${diff} vs ${other}`, Object.keys(a).length, problems);
    return;
  }

  const parity = arg("--parity");
  if (parity) {
    const run = readOutputs(parity);
    const problems: string[] = [];
    for (const [file, row] of Object.entries(run)) {
      diffValues(row.coded, row.wording, file, problems);
    }
    report(`${parity}: by code vs by wording`, Object.keys(run).length, problems);
    return;
  }

  const files = listControls();
  const refresh = has("--refresh");

  if (has("--write-fixture")) {
    // The trap batteries only: files this repository generates, whose every
    // word was written for the test. controls/ also holds real documents,
    // whose findings quote their text; those stay on the developer's disk.
    const candidates: Array<{ file: string; raw: Json; features: Set<string> }> = [];
    for (const f of files) {
      if (!f.startsWith("synthetic-")) continue;
      const raw = await rawResult(f, refresh);
      if (raw.__error) continue;
      candidates.push({ file: f, raw, features: featuresOf(raw) });
    }
    const covered = new Set<string>();
    const chosen: typeof candidates = [];
    for (;;) {
      let best: (typeof candidates)[number] | null = null;
      let bestGain = 0;
      for (const c of candidates) {
        if (chosen.includes(c)) continue;
        let gain = 0;
        for (const feature of c.features) if (!covered.has(feature)) gain++;
        if (gain > bestGain) {
          best = c;
          bestGain = gain;
        }
      }
      if (!best) break;
      chosen.push(best);
      for (const feature of best.features) covered.add(feature);
    }
    chosen.sort((a, b) => a.file.localeCompare(b.file));
    const lines = chosen.map((c) => JSON.stringify(trimForFixture(c.file, c.raw)));
    fs.writeFileSync(FIXTURE, lines.join("\n") + "\n");
    console.log(
      `fixture: ${chosen.length} of ${candidates.length} synthetic documents (engine ${engineVersion()}) -> ${FIXTURE}`,
    );
    return;
  }

  const label = arg("--label");
  if (!label)
    throw new Error("give --label <name>, --diff <a> <b>, --parity <name> or --write-fixture");
  const outputs: Record<string, { coded?: Json; wording?: Json; error?: string }> = {};
  let analysed = 0;
  for (const f of files) {
    const raw = await rawResult(f, refresh);
    if (raw.__error) {
      outputs[f] = { error: String(raw.__error) };
    } else {
      outputs[f] = { coded: consume(raw), wording: consume(stripFindingDetails(raw)) };
      analysed++;
    }
    process.stdout.write(".");
  }
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(outputsPath(label), JSON.stringify(outputs));
  console.log(
    `\n${label}: ${files.length} files, ${analysed} analysed, ${files.length - analysed} refused -> ${outputsPath(label)}`,
  );
}
main();
