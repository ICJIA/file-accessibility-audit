/**
 * scripts/audit-corpus.ts — run every document in a folder and check the
 * report each one produces AGAINST ITSELF.
 *
 *   pnpm audit-corpus                    # controls/
 *   pnpm audit-corpus /path/to/folder    # anywhere
 *
 * WHY THIS EXISTS. The trap batteries prove the checker gets a KNOWN answer
 * right on documents built to have one. Real agency files have no known
 * answer — nobody can say what score a 41-page annual report "should" get —
 * so they cannot be trapped. What they CAN do is contradict themselves, and
 * every accuracy bug found by hand on 2026-08-31 was exactly that: a category
 * scoring zero beside a section calling the same defect optional; a deduction
 * naming no rule; a chip reading "No issues found" above a finding. Each was
 * spotted by a person reading one report at a time.
 *
 * These invariants are that reading, done to every file at once. A violation
 * is a defect in the CHECKER, not in the document — a real file is entitled
 * to score badly, and none of these checks care what it scores.
 *
 * Not wired into CI: it needs a corpus of real documents, which is exactly
 * what CI does not have. Run it before a release, and whenever a new batch of
 * agency files arrives.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeDocument } from "../apps/api/src/services/analyzer.js";
import { evaluateBestPractices } from "~/utils/bestPractices";
import { SCORED_IN_PLAN } from "~/utils/bestPractices/types";
import { gradeForScore } from "@file-audit/shared";

const DIR = process.argv[2] ?? "controls";
const EXTS = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);

interface Violation {
  kind: string;
  file: string;
  detail: string;
}

type Cat = {
  id: string;
  score: number | null;
  severity: string | null;
  findings?: string[];
};

const NOT_COUNTED = /\bnot (scored|penali[sz]ed)\b/i;

/**
 * A SECOND OPINION, not a consistency check.
 *
 * Everything above asks whether a report agrees with itself. This asks
 * whether it agrees with the FILE — re-deriving one fact straight from the
 * PDF and comparing. It exists because the two worst findings of 2026-08-31
 * were both false accusations that were perfectly self-consistent, and both
 * were caught only by a person opening the PDF by hand.
 *
 * The fact chosen is the most damaging one the checker asserts: "this
 * document has no heading tags", which scores heading_structure 0/Critical
 * and names WCAG 1.3.1. An InDesign or Word export tags headings with custom
 * style names (/Head, /Subhead_1) and a RoleMap says what they mean. If a
 * RoleMap maps ANY custom tag to /H1../H6, the headings are real and the
 * accusation is false. Verified by hand on two agency reports; this is that
 * check, automated.
 */
async function roleMapClaimsHeadings(full: string): Promise<string[] | null> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const { stdout } = await run("qpdf", ["--json", "--json-key=qpdf", full], {
      maxBuffer: 1024 * 1024 * 512,
    });
    const objs = (JSON.parse(stdout).qpdf ?? [])[1] ?? {};
    const val = (o: unknown) =>
      o && typeof o === "object" && "value" in (o as object) ? (o as { value: unknown }).value : o;
    const deref = (ref: unknown) =>
      typeof ref === "string" && ref.endsWith(" R")
        ? val((objs as Record<string, unknown>)["obj:" + ref])
        : ref;
    const cat = Object.values(objs as Record<string, unknown>)
      .map(val)
      .find(
        (o) => o && typeof o === "object" && (o as Record<string, unknown>)["/Type"] === "/Catalog",
      ) as Record<string, unknown> | undefined;
    if (!cat?.["/StructTreeRoot"]) return null;
    const sr = deref(cat["/StructTreeRoot"]) as Record<string, unknown> | undefined;
    const rm = deref(sr?.["/RoleMap"]) as Record<string, string> | undefined;
    if (!rm || typeof rm !== "object") return null;
    const HEAD = new Set(["/H", "/H1", "/H2", "/H3", "/H4", "/H5", "/H6"]);
    return Object.entries(rm)
      .filter(([, to]) => HEAD.has(String(to)))
      .map(([from, to]) => `${from} → ${to}`);
  } catch {
    return null; // qpdf absent or the file is not a PDF — not this check's problem
  }
}

function check(file: string, r: Record<string, unknown>): Violation[] {
  const v: Violation[] = [];
  const cats = (r.categories ?? []) as Cat[];
  const conf = r.conformance as { failures?: Array<Record<string, unknown>> } | undefined;
  const failures = conf?.failures ?? [];
  const failingCats = new Set(failures.map((f) => String(f.category ?? "")));

  for (const c of cats) {
    // 1. A deduction the report cannot tie to the law. (legal-basis, per-file)
    if (typeof c.score === "number" && c.score < 100 && !failingCats.has(c.id)) {
      v.push({
        kind: "deduction names no criterion",
        file,
        detail: `${c.id} scored ${c.score} but no failing WCAG criterion is attributed to it`,
      });
    }
    // 2. "Not assessed" while the verdict accuses that very category.
    if (c.score === null && failingCats.has(c.id)) {
      v.push({
        kind: "not assessed, yet accused",
        file,
        detail: `${c.id} has no score, but the verdict names ${failures
          .filter((f) => String(f.category ?? "") === c.id)
          .map((f) => f.sc)
          .join(", ")} against it`,
      });
    }
    // 3. A perfect category claiming silence over a finding it printed.
    if (c.score === 100 && c.severity === "No issues found") {
      const adv = (c.findings ?? []).find((f) => NOT_COUNTED.test(String(f)));
      if (adv) {
        v.push({
          kind: 'says "No issues found" over an advisory',
          file,
          detail: `${c.id}: ${String(adv).trim().slice(0, 110)}`,
        });
      }
    }
    // 4. The grade beside a category must be the one its score earns.
    if (typeof c.score === "number") {
      const g = (c as unknown as { grade?: string }).grade;
      if (g && g !== gradeForScore(c.score)) {
        v.push({
          kind: "category grade disagrees with its score",
          file,
          detail: `${c.id}: ${c.score} shown as ${g}, expected ${gradeForScore(c.score)}`,
        });
      }
    }
  }

  // 5. The document grade must be the one its score earns.
  const overall = (r.overallScore ?? r.score) as number | null | undefined;
  const grade = r.grade as string | undefined;
  if (typeof overall === "number" && grade && gradeForScore(overall) !== grade) {
    v.push({
      kind: "document grade disagrees with its score",
      file,
      detail: `${overall} shown as ${grade}, expected ${gradeForScore(overall)}`,
    });
  }

  // 6. Best practices is extra credit only (v1.148.2 rule).
  try {
    for (const row of evaluateBestPractices(r)) {
      if (row.status !== "met" && row.status !== "not-met") {
        v.push({
          kind: "best practices lists a non-actionable row",
          file,
          detail: `${row.practice.id} is ${row.status}`,
        });
      }
      if (row.evidence.some((e) => e.includes(SCORED_IN_PLAN))) {
        v.push({
          kind: "best practices lists an already-scored defect",
          file,
          detail: row.practice.id,
        });
      }
    }
  } catch (e) {
    v.push({ kind: "best practices threw", file, detail: String(e).slice(0, 120) });
  }
  return v;
}

const files = fs
  .readdirSync(DIR)
  // macOS writes an AppleDouble stub beside every file on a non-HFS volume.
  // They carry a .pdf extension and no PDF, so they are not documents and
  // their failure to parse is not a finding.
  .filter((f) => !f.startsWith("._"))
  .filter((f) => EXTS.has(path.extname(f).toLowerCase()))
  .sort();

console.log(`\naudit-corpus — ${files.length} document(s) in ${DIR}\n`);

const all: Violation[] = [];
let ok = 0;
let unreadable = 0;

for (const f of files) {
  const full = path.join(DIR, f);
  let r: Record<string, unknown>;
  const t0 = Date.now();
  try {
    r = (await analyzeDocument(fs.readFileSync(full), f)) as unknown as Record<string, unknown>;
  } catch (e) {
    unreadable++;
    console.log(`UNREADABLE  ${f}\n            ${String(e).slice(0, 140)}`);
    continue;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const vs = check(f, r);

  // Second opinion: is "no heading tags" true of the FILE, not just of the
  // report? Only asked when the checker actually makes that accusation.
  const headingCat = ((r.categories ?? []) as Cat[]).find((c) => c.id === "heading_structure");
  const accusesNoHeadings = (headingCat?.findings ?? []).some((x) =>
    /no heading tags found/i.test(String(x)),
  );
  if (accusesNoHeadings) {
    const mapped = await roleMapClaimsHeadings(full);
    if (mapped && mapped.length > 0) {
      vs.push({
        kind: "FALSE ACCUSATION: RoleMap does map headings",
        file: f,
        detail: `report says no heading tags, but the RoleMap maps ${mapped.join(", ")}`,
      });
    }
  }
  all.push(...vs);
  const score = r.overallScore ?? r.score;
  const head = `${String(score).padStart(3)}/${String(r.grade ?? "?").padEnd(2)} ${secs.padStart(5)}s`;
  if (vs.length === 0) {
    ok++;
    console.log(`ok    ${head}  ${f}`);
  } else {
    console.log(`FAIL  ${head}  ${f}`);
    for (const x of vs) console.log(`         ${x.kind}: ${x.detail}`);
  }
}

console.log(
  `\n${ok} of ${files.length} coherent · ${unreadable} unreadable · ${all.length} violation(s)`,
);
if (all.length) {
  const byKind = new Map<string, number>();
  for (const x of all) byKind.set(x.kind, (byKind.get(x.kind) ?? 0) + 1);
  console.log("\nBY KIND:");
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${k}`);
  process.exitCode = 1;
} else {
  console.log("\nEVERY REPORT AGREES WITH ITSELF");
}
