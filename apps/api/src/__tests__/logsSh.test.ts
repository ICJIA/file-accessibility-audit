import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// logs.sh (repo root, v1.88.1) is the operator's front door to the activity
// CSVs and the error log. It is a shell script, so nothing else in the suite
// would notice if a bare `./logs.sh` stopped showing the most recent audits,
// if `recent` dropped rows at a day boundary, if `yesterday` stopped being
// accepted as a DATE, or if the help text stopped naming a command. These run
// the real script the way a developer does — against a fixture logs/ directory
// (LOGS_DIR), never over SSH. stdout is a pipe here, so the default format is
// CSV; the table is asked for explicitly where it matters.

const SCRIPT = resolve(__dirname, "../../../../logs.sh");
const BOM = "﻿";
const HEADER =
  "id,timestamp_utc,timestamp_chicago,event,filename,score,grade,content_hash,tier,reason";

function line(
  id: number,
  day: string,
  time: string,
  event: string,
  filename: string,
  rest = ",85,B,0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef,public,",
): string {
  // timestamp_chicago is the day + time; timestamp_utc is 5 h later (CDT).
  const [h, m, s] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(2026, 7, Number(day.slice(8)), h + 5, m, s))
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
  return `${id},${utc},${day} ${time} CDT,${event},${filename}${rest}`;
}

// Three complete days, oldest → newest. The middle one is header-only (an
// empty day), so "the last N" has to step over it. The 18th has a quoted
// file name with a comma and a failed audit.
const DAY18 = [
  line(101, "2026-08-18", "09:00:01", "analyze", '"report, final.pdf"'),
  line(102, "2026-08-18", "12:30:00", "analyze-failed", "broken.pdf", ",,,,public,unreadable"),
  line(103, "2026-08-18", "23:59:58", "audit-url", "https://example.org/a.pdf"),
];
const DAY20 = [
  line(201, "2026-08-20", "08:15:00", "analyze", "deck.pptx"),
  line(202, "2026-08-20", "17:45:30", "audit-url-page", "https://example.org/page"),
];
const ERRORS20 = "2026-08-20T14:03:22Z [error] Error: boom\n    at handler (index.ts:1:1)\n";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "logs-sh-"));
  writeFileSync(join(dir, "activity-2026-08-18.csv"), `${BOM}${HEADER}\n${DAY18.join("\n")}\n`);
  writeFileSync(join(dir, "activity-2026-08-19.csv"), `${BOM}${HEADER}\n`);
  writeFileSync(join(dir, "activity-2026-08-20.csv"), `${BOM}${HEADER}\n${DAY20.join("\n")}\n`);
  writeFileSync(join(dir, "errors-2026-08-20.log"), ERRORS20);
  writeFileSync(join(dir, "activity-2026-08-20.csv.tmp"), "stale");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], dirPath = dir): { status: number | null; out: string; err: string } {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    env: { ...process.env, LOGS_DIR: dirPath, PAGER: "cat" },
    encoding: "utf-8",
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

/** The id column of a CSV/TSV body, in output order. */
function ids(text: string, sep = ","): number[] {
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => Number(l.split(sep)[0]));
}

describe("logs.sh — a bare ./logs.sh shows the most recent audits", () => {
  it("with no arguments: every audit on file, newest first, across days", () => {
    const r = run([]);
    expect(r.status).toBe(0);
    expect(r.out.split("\n")[0]).toBe(HEADER);
    expect(ids(r.out)).toEqual([202, 201, 103, 102, 101]);
  });

  it("recent N takes the last N rows overall, stepping over an empty day", () => {
    expect(ids(run(["recent", "3"]).out)).toEqual([202, 201, 103]);
    expect(ids(run(["recent", "2"]).out)).toEqual([202, 201]);
  });

  it("a bare number is a shortcut for recent N", () => {
    expect(run(["3"]).out).toBe(run(["recent", "3"]).out);
  });

  it("the table says what it is showing and which days it spans", () => {
    const r = run(["recent", "3", "--table"]);
    expect(r.status).toBe(0);
    const first = r.out.split("\n")[0];
    expect(first).toMatch(/3 most recent audits, newest first/);
    expect(first).toMatch(/2026-08-18 to 2026-08-20/);
    expect(r.out).toMatch(/today's audits/i);
    // header row follows, then the rows newest first
    expect(r.out).toMatch(/\nid\s+timestamp_utc/);
    expect(r.out.indexOf("deck.pptx")).toBeGreaterThan(r.out.indexOf("example.org/page"));
  });

  it("when fewer rows exist than asked for, the caption says so", () => {
    const r = run(["recent", "500", "--table"]);
    expect(r.out.split("\n")[0]).toMatch(/all 5 audits on file, newest first/);
  });

  it("the bare-run default is 500 rows", () => {
    // Own fixture dir: one day holding more rows than the default, so the cap
    // itself is what this pins — the shared fixture (5 rows) passes at any
    // default and would never notice the constant regressing.
    const big = mkdtempSync(join(tmpdir(), "logs-sh-big-"));
    try {
      const rows = Array.from({ length: 505 }, (_, i) =>
        line(i + 1, "2026-08-20", "12:00:00", "analyze", "doc.pdf"),
      );
      writeFileSync(join(big, "activity-2026-08-20.csv"), `${BOM}${HEADER}\n${rows.join("\n")}\n`);
      const r = spawnSync("bash", [SCRIPT], {
        env: { ...process.env, LOGS_DIR: big, PAGER: "cat" },
        encoding: "utf-8",
      });
      expect(r.status).toBe(0);
      expect(ids(r.stdout)).toEqual(Array.from({ length: 500 }, (_, i) => 505 - i));
    } finally {
      rmSync(big, { recursive: true, force: true });
    }
  });

  it("--md is a Markdown table; the caption goes to stderr so the paste is clean", () => {
    const r = run(["--md"]);
    expect(r.out.split("\n")[0]).toBe(`| ${HEADER.split(",").join(" | ")} |`);
    expect(r.out.split("\n")[1]).toMatch(/^\|(---\|){10}$/);
    expect(r.out).not.toMatch(/most recent/);
    expect(r.err).toMatch(/5 audits on file, newest first/);
  });

  it("a quoted file name with a comma stays one cell in --tsv", () => {
    const r = run(["--tsv"]);
    const row101 = r.out.split("\n").find((l) => l.startsWith("101\t"));
    expect(row101?.split("\t")[4]).toBe("report, final.pdf");
    expect(ids(r.out, "\t")).toEqual([202, 201, 103, 102, 101]);
  });

  it("refuses a count that is not a whole number", () => {
    for (const bad of ["0", "-5", "ten", "1.5"]) {
      const r = run(["recent", bad]);
      expect(r.status, bad).toBe(1);
      expect(r.err).toMatch(/whole number/);
      expect(r.err).toContain("recent 100");
    }
  });

  it("the file listing is still there as `list`", () => {
    const r = run(["list"]);
    expect(r.status).toBe(0);
    expect(r.out).toContain("activity-2026-08-20.csv");
    expect(r.out).toContain("errors-2026-08-20.log");
  });
});

describe("logs.sh — one day at a time", () => {
  it("activity DATE is that day's rows in file order (oldest first)", () => {
    const r = run(["activity", "2026-08-18"]);
    expect(r.status).toBe(0);
    expect(ids(r.out)).toEqual([101, 102, 103]);
  });

  it("a bare DATE is a shortcut for activity DATE", () => {
    expect(run(["2026-08-18"]).out).toBe(run(["activity", "2026-08-18"]).out);
  });

  it("failed DATE keeps only the *-failed rows, reason included", () => {
    const r = run(["failed", "2026-08-18"]);
    expect(ids(r.out)).toEqual([102]);
    expect(r.out).toContain("unreadable");
  });

  it("an empty day renders as a header and zero rows, not an error", () => {
    const r = run(["activity", "2026-08-19", "--table"]);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^id\s+timestamp_utc/);
    expect(r.out).toContain("0 row(s)");
  });

  it("errors DATE prints the error log; grep searches it with line numbers", () => {
    expect(run(["errors", "2026-08-20"]).out).toBe(ERRORS20);
    const g = run(["grep", "boom", "2026-08-20"]);
    expect(g.status).toBe(0);
    expect(g.out).toMatch(/^1:.*boom/);
    expect(run(["grep", "nothing-like-this", "2026-08-20"]).out).toMatch(/no match/);
  });

  it("a day with no error log is good news, not a failure", () => {
    const r = run(["errors", "2026-08-18"]);
    expect(r.status).toBe(0);
    expect(r.out).toBe("");
    expect(r.err).toMatch(/no errors-2026-08-18\.log/);
  });
});

describe("logs.sh — DATE", () => {
  const ISO = /\d{4}-\d{2}-\d{2}/;

  it("accepts the words today and yesterday", () => {
    // Neither day has a fixture file, so the proof is the error naming a real
    // date — the word was resolved, not rejected as malformed.
    const y = run(["activity", "yesterday"]);
    expect(y.status).toBe(1);
    expect(y.err).toMatch(/no activity-\d{4}-\d{2}-\d{2}\.csv/);
    expect(y.err).not.toMatch(/DATE must be/);
    const t = run(["errors", "today"]);
    expect(t.status).toBe(0);
    expect(t.err).toMatch(/no errors-\d{4}-\d{2}-\d{2}\.log/);
  });

  it("rejects the other shapes with the accepted form and a live example", () => {
    for (const bad of ["2026-8-19", "08/19/2026", "20260819", "Aug 19"]) {
      const r = run(["activity", bad]);
      expect(r.status, bad).toBe(1);
      expect(r.err).toContain("YYYY-MM-DD");
      expect(r.err).toMatch(/for example \d{4}-\d{2}-\d{2}/);
      expect(r.err).toContain("today");
      expect(r.err).toContain("yesterday");
      expect(r.err).toContain(`'${bad}'`);
      // One message, not a second one about a file named after the empty date:
      // bash drops errexit inside $(…), so the date check has to fail loudly.
      expect(r.err.trim().split("\n"), bad).toHaveLength(1);
      expect(r.err).not.toContain("activity-.csv");
    }
  });

  it("a malformed DATE fails every command that takes one — never exit 0 with an empty date", () => {
    for (const args of [
      ["errors", "08/19/2026"],
      ["grep", "boom", "08/19/2026"],
      ["failed", "2026-8-19"],
    ]) {
      const r = run(args);
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.err).toContain("YYYY-MM-DD");
      expect(r.err.trim().split("\n"), args.join(" ")).toHaveLength(1);
      expect(r.err).not.toMatch(/errors-\.log|activity-\.csv/);
    }
  });

  it("explains why today's activity is not on file yet", () => {
    const r = run(["activity", "today"]);
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/midnight/);
    expect(r.err).toMatch(/yesterday/);
  });

  it("a missing day points at `list`", () => {
    const r = run(["activity", "2026-08-17"]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("no activity-2026-08-17.csv");
    expect(r.err).toContain("./logs.sh list");
    expect(r.err).toMatch(ISO);
  });
});

describe("logs.sh — the remediation loop (docs / doc)", () => {
  // Its own fixture: a document fixed and re-checked across two days (four
  // completed runs on three distinct versions, one failed attempt), a second
  // document fixed the same morning, and a singleton that must stay out of
  // the grouped view. The shared fixture's pinned id sequences stay untouched.
  const GROUP_HEADER = "filename,runs,versions,first,last,change,first_at,last_at";
  const hash = (c: string) => `,${c.repeat(64)},public,`;
  const DAY21 = [
    line(301, "2026-08-21", "09:00:00", "analyze", "grant-report.pdf", `,69,D${hash("a")}`),
    line(302, "2026-08-21", "09:30:00", "analyze", "grant-report.pdf", `,79,C${hash("b")}`),
    line(303, "2026-08-21", "10:00:00", "analyze", "single-shot.pdf", `,100,A${hash("c")}`),
    line(
      304,
      "2026-08-21",
      "10:30:00",
      "analyze-failed",
      "grant-report.pdf",
      ",,,,public,unreadable",
    ),
  ];
  const DAY22 = [
    line(401, "2026-08-22", "08:00:00", "analyze", "grant-report.pdf", `,89,B${hash("d")}`),
    line(402, "2026-08-22", "08:15:00", "analyze", "grant-report.pdf", `,89,B${hash("d")}`),
    line(403, "2026-08-22", "09:00:00", "analyze", "other-doc.docx", `,79,C${hash("e")}`),
    line(404, "2026-08-22", "09:30:00", "analyze", "other-doc.docx", `,100,A${hash("f")}`),
  ];
  let loopDir: string;

  beforeAll(() => {
    loopDir = mkdtempSync(join(tmpdir(), "logs-sh-loop-"));
    writeFileSync(
      join(loopDir, "activity-2026-08-21.csv"),
      `${BOM}${HEADER}\n${DAY21.join("\n")}\n`,
    );
    writeFileSync(
      join(loopDir, "activity-2026-08-22.csv"),
      `${BOM}${HEADER}\n${DAY22.join("\n")}\n`,
    );
  });

  afterAll(() => {
    rmSync(loopDir, { recursive: true, force: true });
  });

  it("docs groups by filename: runs, distinct versions, first → last score, newest activity first", () => {
    const r = run(["docs"], loopDir);
    expect(r.status).toBe(0);
    const lines = r.out.trim().split("\n");
    expect(lines[0]).toBe(GROUP_HEADER);
    // other-doc last moved at 09:30, grant-report at 08:15 — newest first.
    expect(lines[1]).toBe(
      "other-doc.docx,2,2,79 C,100 A,+21,2026-08-22 09:00:00 CDT,2026-08-22 09:30:00 CDT",
    );
    // 4 completed runs (the failed attempt is not counted), 3 distinct hashes.
    expect(lines[2]).toBe(
      "grant-report.pdf,4,3,69 D,89 B,+20,2026-08-21 09:00:00 CDT,2026-08-22 08:15:00 CDT",
    );
    expect(lines).toHaveLength(3); // single-shot.pdf: audited once, not shown
    expect(r.err).toMatch(/audited once not shown/);
    expect(r.err).toMatch(/failed audits not counted/);
  });

  it("docs DATE narrows the loop to one day", () => {
    const r = run(["docs", "2026-08-21"], loopDir);
    expect(r.status).toBe(0);
    const lines = r.out.trim().split("\n");
    expect(lines[1]).toBe(
      "grant-report.pdf,2,2,69 D,79 C,+10,2026-08-21 09:00:00 CDT,2026-08-21 09:30:00 CDT",
    );
    expect(lines).toHaveLength(2);
  });

  it("docs N groups within the N most recent audits, like recent N", () => {
    const r = run(["docs", "4"], loopDir);
    const lines = r.out.trim().split("\n");
    expect(lines[1]).toBe(
      "other-doc.docx,2,2,79 C,100 A,+21,2026-08-22 09:00:00 CDT,2026-08-22 09:30:00 CDT",
    );
    // Within the window only day 22's runs exist: same score, same hash, change 0.
    expect(lines[2]).toBe(
      "grant-report.pdf,2,1,89 B,89 B,0,2026-08-22 08:00:00 CDT,2026-08-22 08:15:00 CDT",
    );
    expect(lines).toHaveLength(3);
  });

  it("docs --table carries a caption saying what was grouped", () => {
    const r = run(["docs", "--table"], loopDir);
    expect(r.status).toBe(0);
    expect(r.out.split("\n")[0]).toMatch(/audited 2 or more times/);
    expect(r.out).toMatch(/newest activity first/);
  });

  it("doc NAME is one document's whole story, oldest first, failed attempts included", () => {
    const r = run(["doc", "grant"], loopDir);
    expect(r.status).toBe(0);
    expect(r.out.split("\n")[0]).toBe(HEADER);
    expect(ids(r.out)).toEqual([301, 302, 304, 401, 402]);
    expect(r.out).toContain("unreadable"); // the failed attempt's reason is part of the story
    expect(r.err).toMatch(/oldest first/);
    // case-insensitive
    expect(run(["doc", "GRANT"], loopDir).out).toBe(r.out);
  });

  it("doc accepts a content-hash prefix and finds that exact version's audits", () => {
    const r = run(["doc", "dddddddd"], loopDir);
    expect(r.status).toBe(0);
    expect(ids(r.out)).toEqual([401, 402]);
  });

  it("doc with no match says so and exits cleanly", () => {
    const r = run(["doc", "zzzznope"], loopDir);
    expect(r.status).toBe(0);
    expect(r.err).toMatch(/no audits matching 'zzzznope'/);
  });

  it("doc without a pattern explains its usage with an example", () => {
    const r = run(["doc"], loopDir);
    expect(r.status).toBe(1);
    expect(r.err).toContain("PATTERN");
    expect(r.err).toContain("./logs.sh doc ");
  });

  it("docs today explains the midnight lag like the other day views", () => {
    const r = run(["docs", "today"], loopDir);
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/midnight/);
  });
});

describe("logs.sh — help and mistakes", () => {
  const COMMANDS = [
    "recent",
    "activity",
    "failed",
    "docs",
    "doc",
    "errors",
    "grep",
    "tail",
    "list",
    "pull",
    "help",
  ];

  it("help names every command, the date shape with examples, and every format", () => {
    const r = run(["help"]);
    expect(r.status).toBe(0);
    for (const c of COMMANDS)
      expect(r.out, c).toMatch(new RegExp(`^\\s*\\./logs\\.sh ${c}\\b`, "m"));
    expect(r.out).toContain("YYYY-MM-DD");
    expect(r.out).toMatch(/2026-08-19\s+yes/);
    expect(r.out).toMatch(/08\/19\/2026\s+no/);
    expect(r.out).toMatch(/yesterday\s+yes/);
    for (const f of ["--table", "--csv", "--tsv", "--md", "--copy"]) expect(r.out).toContain(f);
    expect(r.out).toContain("QUICK START");
    // The header must state the real bare-run default (RECENT_DEFAULT).
    expect(r.out).toContain("(default 500)");
    // The remediation-loop commands come with worked examples.
    expect(r.out).toContain("./logs.sh doc grant-report");
    expect(r.out).toMatch(/\.\/logs\.sh docs yesterday --md/);
    expect(r.out).toMatch(/hash prefix/i);
  });

  it("-h and --help print the same text; it is the script's own header", () => {
    const h = run(["help"]).out;
    expect(run(["-h"]).out).toBe(h);
    expect(run(["--help"]).out).toBe(h);
    expect(h.split("\n")[0]).toMatch(/^logs\.sh — /);
    expect(h).not.toContain("set -euo");
  });

  it("an unknown command names the commands and the help", () => {
    const r = run(["bogus"]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("unknown command 'bogus'");
    for (const c of COMMANDS) expect(r.err).toContain(c);
    expect(r.err).toContain("./logs.sh help");
  });

  it("an unknown option is an error, not silently a different format", () => {
    const r = run(["activity", "2026-08-18", "--markdown"]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("--markdown");
    expect(r.err).toContain("--md");
  });
});

describe("logs.sh — tail", () => {
  // tail follows a live file, so these spawn the script asynchronously in a
  // private fixture dir (today's error file must not leak into the shared one)
  // and kill the whole process group when done — tail outlives bash otherwise.
  const chicagoToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(new Date());

  function tailIn(dirPath: string) {
    const child = spawn("bash", [SCRIPT, "tail"], {
      env: { ...process.env, LOGS_DIR: dirPath, PAGER: "cat" },
      detached: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    return {
      child,
      out: () => out,
      err: () => err,
      stop: () => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* already gone */
        }
      },
    };
  }

  async function eventually(cond: () => boolean, what: string, ms = 10000): Promise<void> {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  it("without today's file: explains and waits — no tail warning — then follows on the first error", async () => {
    const d = mkdtempSync(join(tmpdir(), "logs-sh-tail-"));
    const t = tailIn(d);
    try {
      await eventually(() => /waiting/.test(t.err()), "the waiting notice");
      expect(t.err()).toContain("no errors so far today");
      expect(t.err()).toContain(`errors-${chicagoToday}.log`);
      expect(t.err()).not.toMatch(/No such file or directory/);
      expect(t.child.exitCode).toBeNull(); // still watching, not exited
      writeFileSync(join(d, `errors-${chicagoToday}.log`), "MARKER first fault\n");
      await eventually(() => t.out().includes("MARKER first fault"), "the first error to stream");
      expect(t.err()).toMatch(/has appeared/);
      expect(t.err()).not.toMatch(/No such file or directory/);
    } finally {
      t.stop();
      rmSync(d, { recursive: true, force: true });
    }
  }, 20000);

  it("with the file present: announces which file it follows and streams appended lines", async () => {
    const d = mkdtempSync(join(tmpdir(), "logs-sh-tail2-"));
    const f = join(d, `errors-${chicagoToday}.log`);
    writeFileSync(f, "first fault\n");
    const t = tailIn(d);
    try {
      await eventually(() => t.out().includes("first fault"), "the existing log to print");
      expect(t.err()).toMatch(/following .*errors-.*\.log/);
      expect(t.err()).not.toMatch(/No such file or directory/);
      appendFileSync(f, "second fault\n");
      await eventually(() => t.out().includes("second fault"), "the appended line to stream");
    } finally {
      t.stop();
      rmSync(d, { recursive: true, force: true });
    }
  }, 20000);
});
