/**
 * The batch summary table, its CSV, and keeping a finished batch across a
 * reload (2026-11-24).
 */
import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import BatchSummaryTable from "../components/BatchSummaryTable.vue";
import {
  BATCH_CSV_HEADERS,
  CSV_BOM,
  batchSummaryCsv,
  batchSummaryFilename,
  csvCell,
  sortByScore,
  summarizeBatch,
  topIssueOf,
  type BatchSummaryInput,
} from "../utils/batchSummary";
import {
  BATCH_SESSION_MAX_CHARS,
  clearBatchSession,
  readBatchSession,
  saveBatchSession,
  type BatchSession,
} from "../utils/batchSession";

const cat = (label: string, severity: string | null, score: number | null) => ({
  id: label.toLowerCase().replace(/\s+/g, "_"),
  label,
  severity,
  score,
  findings: [],
});

function done(
  id: string,
  filename: string,
  score: number,
  grade: string,
  categories: unknown[],
  fileType = "pdf",
): BatchSummaryInput {
  return {
    id,
    filename,
    status: "done",
    result: { filename, overallScore: score, grade, fileType, categories },
    error: null,
  };
}

const ITEMS: BatchSummaryInput[] = [
  done("a", "alpha.pdf", 62, "D", [
    cat("Alt Text", "Critical", 0),
    cat("Headings", "Moderate", 60),
    cat("Links", "Minor", 85),
    cat("Title", "Pass", 100),
  ]),
  done("b", "beta.docx", 100, "A", [cat("Title", "Pass", 100)], "docx"),
  {
    id: "c",
    filename: "gamma.pdf",
    status: "error",
    result: null,
    error: { error: "The file could not be read.", details: "It may be damaged." },
  },
  done("d", "delta.xlsx", 88, "B", [cat("Sheets", "Minor", 70)], "xlsx"),
  { id: "e", filename: "epsilon.pptx", status: "cancelled", result: null, error: null },
];

describe("summarizeBatch", () => {
  const rows = summarizeBatch(ITEMS);

  it("one row per file, with the overall grade and score and the severity counts", () => {
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      index: 0,
      filename: "alpha.pdf",
      format: "PDF",
      grade: "D",
      score: 62,
      critical: 1,
      moderate: 1,
      minor: 1,
      topIssue: "Alt Text (Critical)",
      status: "Done",
      reason: "",
    });
    expect(rows[1]).toMatchObject({ format: "Word", grade: "A", score: 100, critical: 0 });
    expect(rows[1]!.topIssue).toBe("No issues found by the automated checks");
  });

  it("a failed file says why, and has no grade or score", () => {
    expect(rows[2]).toMatchObject({
      format: "PDF",
      grade: null,
      score: null,
      critical: null,
      status: "Failed",
      reason: "The file could not be read. It may be damaged.",
    });
  });

  it("a cancelled file is 'Cancelled', its format read from its name", () => {
    expect(rows[4]).toMatchObject({ format: "PowerPoint", status: "Cancelled" });
  });

  it("the top issue is the worst severity, then the lowest score", () => {
    expect(
      topIssueOf([cat("B", "Moderate", 10), cat("A", "Critical", 50), cat("C", "Critical", 20)]),
    ).toBe("C (Critical)");
    expect(topIssueOf(undefined)).toBe("No issues found by the automated checks");
  });

  it("reads the strict profile when a stored result carries one", () => {
    const [row] = summarizeBatch([
      {
        id: "x",
        filename: "x.pdf",
        status: "done",
        error: null,
        result: {
          filename: "x.pdf",
          overallScore: 40,
          grade: "F",
          categories: [],
          scoreProfiles: {
            strict: { overallScore: 79, grade: "C", categories: [cat("T", "Moderate", 60)] },
          },
        },
      },
    ]);
    expect(row).toMatchObject({ score: 79, grade: "C", moderate: 1 });
  });
});

describe("sortByScore", () => {
  const rows = summarizeBatch(ITEMS);
  const names = (r: typeof rows) => r.map((x) => x.filename);

  it("lowest first, with unscored files last in their original order", () => {
    expect(names(sortByScore(rows, "ascending"))).toEqual([
      "alpha.pdf",
      "delta.xlsx",
      "beta.docx",
      "gamma.pdf",
      "epsilon.pptx",
    ]);
  });
  it("highest first — unscored files still last, not first", () => {
    expect(names(sortByScore(rows, "descending"))).toEqual([
      "beta.docx",
      "delta.xlsx",
      "alpha.pdf",
      "gamma.pdf",
      "epsilon.pptx",
    ]);
  });
  it("'none' is the order the files were added, and the input is not mutated", () => {
    const shuffled = sortByScore(rows, "descending");
    expect(names(sortByScore(shuffled, "none"))).toEqual(names(rows));
    expect(names(rows)[0]).toBe("alpha.pdf");
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"])(
    "guards against formula injection: %j is prefixed with an apostrophe",
    (evil) => {
      const cell = csvCell(evil);
      expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );

  it("a dangerous filename is both prefixed and quoted", () => {
    expect(csvCell('=HYPERLINK("http://x","y").pdf')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"").pdf"',
    );
  });

  it("numbers are written as numbers; nothing is written for null", () => {
    expect(csvCell(62)).toBe("62");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });
});

describe("batchSummaryCsv", () => {
  const csv = batchSummaryCsv(sortByScore(summarizeBatch(ITEMS), "descending"));
  const lines = csv.slice(CSV_BOM.length).trimEnd().split("\r\n");

  it("starts with a byte-order mark and the header row, and ends lines with CRLF", () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(lines[0]).toBe(BATCH_CSV_HEADERS.join(","));
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("has one row per file in the order they were added, whatever the table's sort", () => {
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe("alpha.pdf,PDF,D,62,1,1,1,Alt Text (Critical),Done,");
    expect(lines[3]).toBe(
      "gamma.pdf,PDF,,,,,,—,Failed,The file could not be read. It may be damaged.",
    );
  });

  it("every row has the same number of cells as the header", () => {
    for (const line of lines) expect(line.split(",")).toHaveLength(BATCH_CSV_HEADERS.length);
  });

  it("names the file by date", () => {
    expect(batchSummaryFilename(new Date("2026-11-24T10:00:00Z"))).toBe(
      "accessibility-batch-summary-2026-11-24.csv",
    );
  });
});

describe("BatchSummaryTable", () => {
  it("is a real table: caption, column headers with scope, a row header per file", () => {
    const w = mount(BatchSummaryTable, { props: { items: ITEMS, activeIndex: 0 } });
    expect(w.find("table caption").text()).toContain("One row for each file");
    const cols = w.findAll("thead th");
    expect(cols.map((c) => c.attributes("scope"))).toEqual(Array(9).fill("col"));
    expect(cols.map((c) => c.text().split(/\s/)[0])).toEqual([
      "File",
      "Format",
      "Grade",
      "Score",
      "Critical",
      "Moderate",
      "Minor",
      "Top",
      "Status",
    ]);
    const rowHeaders = w.findAll("tbody th");
    expect(rowHeaders).toHaveLength(5);
    expect(rowHeaders.every((h) => h.attributes("scope") === "row")).toBe(true);
  });

  it("sorts by score with a button, reports it in aria-sort, and announces it", async () => {
    const w = mount(BatchSummaryTable, { props: { items: ITEMS, activeIndex: 0 } });
    const th = () => w.findAll("thead th")[3]!;
    const first = () => w.findAll("tbody th")[0]!.text();
    expect(th().attributes("aria-sort")).toBe("none");
    expect(first()).toContain("alpha.pdf");

    const button = w.find('[data-testid="batch-sort-score"]');
    expect(button.element.tagName).toBe("BUTTON");
    await button.trigger("click");
    expect(th().attributes("aria-sort")).toBe("ascending");
    expect(first()).toContain("alpha.pdf");
    expect(w.find('[data-testid="batch-summary-status"]').text()).toBe(
      "Sorted by score, lowest first.",
    );

    await button.trigger("click");
    expect(th().attributes("aria-sort")).toBe("descending");
    expect(first()).toContain("beta.docx");
    expect(w.find("caption").text()).toContain("highest first");

    await button.trigger("click");
    expect(th().attributes("aria-sort")).toBe("none");
  });

  it("shows status in words, with the reason a file failed", () => {
    const w = mount(BatchSummaryTable, { props: { items: ITEMS, activeIndex: 0 } });
    const failed = w.findAll("tbody tr")[2]!;
    expect(failed.text()).toContain("Failed");
    expect(failed.text()).toContain("The file could not be read.");
    expect(failed.text()).toContain("No score");
  });

  it("a filename is a button that opens that report, and the open one is marked", async () => {
    const w = mount(BatchSummaryTable, { props: { items: ITEMS, activeIndex: 1 } });
    const buttons = w.findAll('[data-testid="batch-summary-view"]');
    expect(buttons[1]!.attributes("aria-current")).toBe("true");
    expect(buttons[0]!.attributes("aria-current")).toBeUndefined();
    await buttons[3]!.trigger("click");
    expect(w.emitted("view")).toEqual([[3]]);
  });

  it("never renders a filename as HTML", () => {
    const evil = [done("x", "<img src=x onerror=alert(1)>.pdf", 50, "F", []), ITEMS[1]!];
    const w = mount(BatchSummaryTable, { props: { items: evil, activeIndex: 0 } });
    expect(w.find("tbody img").exists()).toBe(false);
    expect(w.text()).toContain("<img src=x onerror=alert(1)>.pdf");
  });

  it("downloads the CSV through downloadBlob", async () => {
    const create = vi.fn((_blob: Blob) => "blob:x");
    const revoke = vi.fn();
    (URL as any).createObjectURL = create;
    (URL as any).revokeObjectURL = revoke;
    const w = mount(BatchSummaryTable, { props: { items: ITEMS, activeIndex: 0 } });
    await w.find('[data-testid="batch-csv"]').trigger("click");
    expect(create).toHaveBeenCalledTimes(1);
    const blob = create.mock.calls[0]![0] as Blob;
    expect(blob.type).toContain("text/csv");
    expect(w.find('[data-testid="batch-summary-status"]').text()).toContain("downloaded");
  });
});

describe("batchSession", () => {
  function memory(): Storage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as never;
  }
  const session = (over: Partial<BatchSession> = {}): BatchSession => ({
    items: [
      {
        id: "a",
        filename: "a.pdf",
        fileSize: 10,
        status: "done",
        result: { filename: "a.pdf", grade: "A", overallScore: 95, categories: [] },
        error: null,
      },
      {
        id: "b",
        filename: "b.pdf",
        fileSize: 20,
        status: "error",
        result: null,
        error: { error: "Could not be read." },
      },
    ],
    activeIndex: 1,
    savedAt: 1_000,
    appVersion: "1.0.0",
    ...over,
  });
  const opts = { now: 2_000, appVersion: "1.0.0", ttlMs: 60_000 };
  let st: ReturnType<typeof memory>;
  beforeEach(() => {
    st = memory();
  });

  it("round-trips a finished batch", () => {
    expect(saveBatchSession(session(), st)).toBe(true);
    const back = readBatchSession(opts, st);
    expect(back?.items.map((i) => i.filename)).toEqual(["a.pdf", "b.pdf"]);
    expect(back?.activeIndex).toBe(1);
    expect(back?.items[0]!.fileSize).toBe(10);
  });

  it("refuses a batch too large to store, and leaves nothing stale behind", () => {
    saveBatchSession(session(), st);
    const big = session();
    big.items[0]!.result!.padding = "x".repeat(BATCH_SESSION_MAX_CHARS);
    expect(saveBatchSession(big, st)).toBe(false);
    expect(readBatchSession(opts, st)).toBeNull();
  });

  it("returns false, without throwing, when storage refuses the write", () => {
    const full = {
      ...st,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    } as never;
    expect(saveBatchSession(session(), full)).toBe(false);
  });

  it("rejects and clears another version's batch, an expired one, and a malformed one", () => {
    saveBatchSession(session(), st);
    expect(readBatchSession({ ...opts, appVersion: "2.0.0" }, st)).toBeNull();
    expect(st.data.size).toBe(0);

    saveBatchSession(session(), st);
    expect(readBatchSession({ ...opts, now: 1_000_000 }, st)).toBeNull();

    st.setItem("fa:batch-session:v1", "{not json");
    expect(readBatchSession(opts, st)).toBeNull();

    st.setItem(
      "fa:batch-session:v1",
      JSON.stringify({ ...session(), items: [{ id: "a", filename: "a.pdf", status: "done" }] }),
    );
    expect(readBatchSession(opts, st)).toBeNull();
    expect(st.data.size).toBe(0);
  });

  it("an out-of-range active index falls back to the first file", () => {
    saveBatchSession(session({ activeIndex: 9 }), st);
    expect(readBatchSession(opts, st)?.activeIndex).toBe(0);
  });

  it("clear removes it", () => {
    saveBatchSession(session(), st);
    clearBatchSession(st);
    expect(readBatchSession(opts, st)).toBeNull();
  });
});
