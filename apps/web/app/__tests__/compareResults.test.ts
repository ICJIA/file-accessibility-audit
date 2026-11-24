/**
 * Before/after comparison (2026-11-24): the pure comparison, strict reading
 * of an earlier report, the card, and the automatic offer when the same
 * filename is uploaded again.
 */
import "./test-helpers";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick, defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import {
  compareResults,
  describeDelta,
  parseExportedReport,
  reportIdFromInput,
  toComparable,
} from "../utils/compareResults";
import {
  clearPreviousResult,
  readPreviousResult,
  savePreviousResult,
} from "../utils/comparePrevious";
import { buildJSON } from "../utils/exportFormats/json";
import ReportComparison from "../components/ReportComparison.vue";
import { usePrefill } from "../composables/usePrefill";
import { useReportExport } from "../composables/useReportExport";
import { useReportView } from "../composables/useReportView";
import IndexPage from "../pages/index.vue";
import DropZone from "../components/DropZone.vue";
import sample from "../data/sampleReport.json";

(globalThis as any).usePrefill = usePrefill;
(globalThis as any).useReportExport = useReportExport;
(globalThis as any).useReportView = useReportView;

const cat = (
  id: string,
  score: number | null,
  findings: string[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  label: id.replace(/_/g, " "),
  weight: 1,
  score,
  grade: null,
  severity: score === null ? null : score >= 100 ? "Pass" : "Moderate",
  findings,
  explanation: "",
  helpLinks: [],
  ...extra,
});
const report = (
  filename: string,
  score: number,
  grade: string,
  categories: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  filename,
  pageCount: 2,
  overallScore: score,
  grade,
  isScanned: false,
  executiveSummary: "",
  categories,
  fileType: "pdf",
  ...extra,
});

const BEFORE = report("report.pdf", 62, "D", [
  cat("title_language", 0, ["No document title found in metadata", "How to fix: set a title"]),
  cat("alt_text", 50, ["5 images have no description", "2 images have a placeholder description"]),
  cat("table_markup", null, []),
  cat("bookmarks", 100, ["Bookmarks present"]),
]);
const AFTER = report("report.pdf", 85, "B", [
  cat("title_language", 100, ['Document title: "Annual Report"']),
  cat("alt_text", 70, ["2 images have a placeholder description", "1 image is described twice"]),
  cat("table_markup", 60, ["1 table has no header row"]),
  cat("link_quality", 100, []),
]);

describe("compareResults", () => {
  const c = compareResults(BEFORE, AFTER)!;

  it("reports the overall score and grade change", () => {
    expect(c.before).toEqual({ filename: "report.pdf", score: 62, grade: "D" });
    expect(c.after).toEqual({ filename: "report.pdf", score: 85, grade: "B" });
    expect(c.scoreDelta).toBe(23);
    expect(c.gradeChanged).toBe(true);
    expect(c.nothingChanged).toBe(false);
    expect(c.summary).toBe(
      "The score went up by 23 and the grade changed from D to B. 2 issues were fixed, 2 new issues appeared, and 1 issue remains.",
    );
  });

  it("gives a per-check delta, in the later report's order, with one-sided checks handled", () => {
    const by = Object.fromEntries(c.categories.map((d) => [d.id, d]));
    expect(c.categories.map((d) => d.id)).toEqual([
      "title_language",
      "alt_text",
      "table_markup",
      "link_quality",
      "bookmarks",
    ]);
    expect(by.title_language).toMatchObject({
      before: 0,
      after: 100,
      delta: 100,
      change: "improved",
    });
    expect(by.alt_text).toMatchObject({ delta: 20, change: "improved" });
    // Not scored before, scored now: not an "improvement from zero".
    expect(by.table_markup).toMatchObject({
      before: null,
      after: 60,
      delta: null,
      change: "not scored",
    });
    expect(by.link_quality!.change).toBe("only in the later report");
    expect(by.bookmarks!.change).toBe("only in the earlier report");
  });

  it("lists issues fixed, new and remaining — guidance and passing lines are not issues", () => {
    expect(c.resolved.map((f) => f.text)).toEqual([
      "No document title found in metadata",
      "5 images have no description",
    ]);
    expect(c.added.map((f) => f.text)).toEqual([
      "1 image is described twice",
      "1 table has no header row",
    ]);
    expect(c.unchanged.map((f) => f.text)).toEqual(["2 images have a placeholder description"]);
    expect(c.resolved[0]!.category).toBe("title language");
    expect(c.matchedBy).toBe("text");
    expect(JSON.stringify(c)).not.toContain("How to fix");
    expect(JSON.stringify(c)).not.toContain("Bookmarks present");
  });

  it("describes a delta with a sign AND a word", () => {
    const by = Object.fromEntries(c.categories.map((d) => [d.id, d]));
    expect(describeDelta(by.alt_text!)).toBe("+20 points (improved)");
    expect(describeDelta(by.table_markup!)).toBe("scored only in the later report");
    expect(describeDelta({ ...by.alt_text!, delta: -1, change: "worse" })).toBe("−1 point (worse)");
    expect(describeDelta({ ...by.alt_text!, delta: 0, change: "unchanged" })).toBe("no change");
  });

  it("says plainly when nothing changed", () => {
    const same = compareResults(BEFORE, structuredClone(BEFORE))!;
    expect(same.nothingChanged).toBe(true);
    expect(same.scoreDelta).toBe(0);
    expect(same.summary).toBe(
      "Nothing changed: the score, the grade and every issue are the same in both reports.",
    );
    // No hash on either side: "same file" is unknown, not claimed.
    expect(same.sameContent).toBeNull();
  });

  it("uses a content hash when both reports carry one", () => {
    const a = { ...BEFORE, contentHash: "abc" };
    expect(compareResults(a, { ...BEFORE, contentHash: "abc" })!.sameContent).toBe(true);
    expect(compareResults(a, { ...BEFORE, contentHash: "abc" })!.summary).toBe(
      "These two reports are for the same file. Nothing changed.",
    );
    expect(compareResults(a, { ...AFTER, contentHash: "def" })!.sameContent).toBe(false);
  });

  it("matches on the finding CODE when both reports carry structured findings", () => {
    const details = (text: string, code: string, kind = "failure") => ({ code, kind, text });
    const before = report("r.pdf", 50, "F", [
      cat("alt_text", 40, ["5 images have no description", "Images: 9"], {
        findingDetails: [
          details("5 images have no description", "pdf.alt_text.missing"),
          details("Images: 9", "pdf.alt_text.census", "info"),
        ],
      }),
    ]);
    const after = report("r.pdf", 70, "C", [
      cat("alt_text", 70, ["3 images have no description", "Images: 9"], {
        findingDetails: [
          details("3 images have no description", "pdf.alt_text.missing"),
          details("Images: 9", "pdf.alt_text.census", "info"),
        ],
      }),
    ]);
    const c2 = compareResults(before, after)!;
    expect(c2.matchedBy).toBe("code");
    // The numbers changed but it is the SAME issue — not one fixed, one new.
    expect(c2.resolved).toEqual([]);
    expect(c2.added).toEqual([]);
    expect(c2.unchanged.map((f) => f.text)).toEqual(["3 images have no description"]);
  });

  it("falls back to text for a check where only one side has structured findings", () => {
    const before = report("r.pdf", 50, "F", [
      cat("alt_text", 40, ["5 images have no description"]),
    ]);
    const after = report("r.pdf", 50, "F", [
      cat("alt_text", 40, ["5 images have no description"], {
        findingDetails: [
          { code: "pdf.alt_text.missing", kind: "failure", text: "5 images have no description" },
        ],
      }),
    ]);
    const c2 = compareResults(before, after)!;
    expect(c2.matchedBy).toBe("text");
    expect(c2.unchanged).toHaveLength(1);
  });

  it("notes different filenames and formats without refusing", () => {
    const other = compareResults(BEFORE, { ...AFTER, filename: "other.docx", fileType: "docx" })!;
    expect(other.differentFilenames).toBe(true);
    expect(other.differentFormats).toBe(true);
  });

  it("prefers the strict profile, and returns null for junk", () => {
    const legacy = {
      ...BEFORE,
      overallScore: 10,
      grade: "F",
      scoreProfiles: { strict: { overallScore: 62, grade: "D", categories: BEFORE.categories } },
    };
    expect(toComparable(legacy)).toMatchObject({ score: 62, grade: "D" });
    expect(compareResults(null, AFTER)).toBeNull();
    expect(compareResults({ categories: "x" }, AFTER)).toBeNull();
  });

  it("compares the real sample report with itself as 'nothing changed'", () => {
    expect(compareResults(sample, structuredClone(sample))!.nothingChanged).toBe(true);
  });
});

describe("parseExportedReport — the app's own JSON export, strictly", () => {
  const branding = {
    appName: "ICJIA Accessibility Audit",
    siteUrl: "https://audit.example.test",
    wcagVersion: "2.1",
    wcagUnderstandingBase: "https://www.w3.org/WAI/WCAG21/Understanding/",
  } as never;

  it("round-trips a real export into something comparable", () => {
    const json = buildJSON(sample as never, branding);
    const parsed = parseExportedReport(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.report.filename).toBe("sample-evaluation-report.pdf");
    const c = compareResults(parsed.report, sample)!;
    expect(c.scoreDelta).toBe(0);
    expect(c.gradeChanged).toBe(false);
    expect(c.categories.every((d) => d.delta === 0 || d.delta === null)).toBe(true);
  });

  const valid = () => ({
    reportMeta: { tool: "x", schemaVersion: "2.2" },
    file: { name: "a.pdf" },
    score: { overall: 80, grade: "B" },
    categories: [
      { id: "alt_text", label: "Alt text", score: 80, severity: "Minor", findings: ["x"] },
    ],
  });

  it("accepts the minimum valid export", () => {
    expect(parseExportedReport(JSON.stringify(valid())).ok).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["not JSON", "{oops"],
    ["an array", "[]"],
    ["a raw engine result", JSON.stringify(BEFORE)],
    ["some other JSON", JSON.stringify({ hello: "world" })],
    ["no reportMeta", JSON.stringify({ ...valid(), reportMeta: undefined })],
    ["a score out of range", JSON.stringify({ ...valid(), score: { overall: 180, grade: "B" } })],
    ["a made-up grade", JSON.stringify({ ...valid(), score: { overall: 80, grade: "Z" } })],
    ["no categories", JSON.stringify({ ...valid(), categories: [] })],
    [
      "a finding that is not text",
      JSON.stringify({
        ...valid(),
        categories: [{ ...valid().categories[0], findings: [{ x: 1 }] }],
      }),
    ],
    [
      "an odd category id",
      JSON.stringify({ ...valid(), categories: [{ ...valid().categories[0], id: "<script>" }] }),
    ],
  ])("refuses %s with a clear message", (_name, text) => {
    const parsed = parseExportedReport(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message.length).toBeGreaterThan(10);
  });
});

describe("reportIdFromInput", () => {
  const id = "0123456789abcdef0123456789abcdef";
  it("accepts a bare id and a share link, from any host", () => {
    expect(reportIdFromInput(id)).toBe(id);
    expect(reportIdFromInput(` https://audit.icjia.app/report/${id} `)).toBe(id);
    expect(reportIdFromInput(`http://localhost:5102/report/${id}?view=detailed`)).toBe(id);
  });
  it("refuses everything else", () => {
    expect(reportIdFromInput("")).toBeNull();
    expect(reportIdFromInput("https://audit.icjia.app/page-report/x")).toBeNull();
    expect(reportIdFromInput(`${id}0`)).toBeNull();
    expect(reportIdFromInput(id.toUpperCase())).toBeNull();
    expect(reportIdFromInput(`../../api/admin/${id}`)).toBeNull();
    expect(reportIdFromInput(42)).toBeNull();
  });
});

describe("comparePrevious — the earlier report kept for this tab", () => {
  beforeEach(() => sessionStorage.clear());
  it("round-trips, and rejects another version or a malformed entry", () => {
    expect(savePreviousResult({ result: BEFORE, appVersion: "1" })).toBe(true);
    expect(readPreviousResult({ appVersion: "1" })?.filename).toBe("report.pdf");
    expect(readPreviousResult({ appVersion: "2" })).toBeNull();
    expect(readPreviousResult({ appVersion: "1" })).toBeNull(); // cleared by the mismatch
    sessionStorage.setItem("fa:audit-previous:v1", "{nope");
    expect(readPreviousResult({ appVersion: "1" })).toBeNull();
    savePreviousResult({ result: BEFORE, appVersion: "1" });
    clearPreviousResult();
    expect(readPreviousResult({ appVersion: "1" })).toBeNull();
  });
});

describe("ReportComparison", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as any).$fetch = fetchMock;
  });

  async function chooseFile(w: ReturnType<typeof mount>, text: string, name = "earlier.json") {
    const input = w.find('[data-testid="compare-file"]');
    const file = new File([text], name, { type: "application/json" });
    Object.defineProperty(input.element, "files", { value: [file], configurable: true });
    await input.trigger("change");
    await flushPromises();
  }

  it("starts as a labelled control: a file field and a share-link field", () => {
    const w = mount(ReportComparison, { props: { result: AFTER } });
    expect(w.find("h3").text()).toBe("Compare with an earlier report");
    const file = w.find('[data-testid="compare-file"]');
    const link = w.find('[data-testid="compare-link"]');
    expect(w.find(`label[for="${file.attributes("id")}"]`).exists()).toBe(true);
    expect(w.find(`label[for="${link.attributes("id")}"]`).exists()).toBe(true);
    expect(w.find('[data-testid="comparison-card"]').exists()).toBe(false);
  });

  it("refuses a file that is not this tool's export, in an announced message", async () => {
    const w = mount(ReportComparison, { props: { result: AFTER } });
    await chooseFile(w, JSON.stringify({ hello: "world" }));
    const err = w.find('[data-testid="compare-error"]');
    expect(err.attributes("role")).toBe("alert");
    expect(err.text()).toContain("not a report exported from this tool");
    expect(w.find('[data-testid="comparison-card"]').exists()).toBe(false);
  });

  it("shows the card from an exported file: before → after, a real table, and the three lists", async () => {
    const exported = {
      reportMeta: { tool: "x", schemaVersion: "2.2" },
      file: { name: BEFORE.filename },
      score: { overall: BEFORE.overallScore, grade: BEFORE.grade },
      categories: BEFORE.categories,
    };
    const w = mount(ReportComparison, { props: { result: AFTER } });
    await chooseFile(w, JSON.stringify(exported));
    const card = w.find('[data-testid="comparison-card"]');
    expect(card.exists()).toBe(true);
    expect(w.find('[data-testid="comparison-summary"]').text()).toContain(
      "The score went up by 23",
    );
    expect(card.find("caption").exists()).toBe(true);
    expect(card.findAll("thead th").every((t) => t.attributes("scope") === "col")).toBe(true);
    expect(card.findAll("tbody th").every((t) => t.attributes("scope") === "row")).toBe(true);
    expect(card.text()).toContain("+20 points (improved)");
    expect(w.find('[data-testid="comparison-fixed"]').text()).toContain("Fixed (2)");
    expect(w.find('[data-testid="comparison-new"]').text()).toContain("New (2)");
    expect(w.find('[data-testid="comparison-remaining"]').text()).toContain("Still to fix (1)");
    expect(w.find('[data-testid="compare-status"]').text()).toContain("Comparison ready");
  });

  it("never renders an earlier report's strings as HTML", async () => {
    const evil = {
      reportMeta: { tool: "x", schemaVersion: "2.2" },
      file: { name: "<img src=x onerror=alert(1)>.pdf" },
      score: { overall: 10, grade: "F" },
      categories: [
        {
          id: "alt_text",
          label: "<b>bold</b>",
          score: 10,
          severity: "Critical",
          findings: ["<script>alert(1)</script>"],
        },
      ],
    };
    const w = mount(ReportComparison, { props: { result: AFTER } });
    await chooseFile(w, JSON.stringify(evil));
    const card = w.find('[data-testid="comparison-card"]');
    expect(card.find("img").exists()).toBe(false);
    expect(card.find("script").exists()).toBe(false);
    expect(card.find("b").exists()).toBe(false);
    expect(card.text()).toContain("<script>alert(1)</script>");
    const src = (await import("node:fs")).readFileSync(
      (await import("node:path")).resolve(__dirname, "../components/ReportComparison.vue"),
      "utf8",
    );
    expect(src).not.toContain("v-html");
  });

  it("loads an earlier share link from this site's own API", async () => {
    const id = "0123456789abcdef0123456789abcdef";
    fetchMock.mockResolvedValue({ report: BEFORE, createdAt: "2026-11-01" });
    const w = mount(ReportComparison, { props: { result: AFTER } });
    await w.find('[data-testid="compare-link"]').setValue(`https://elsewhere.example/report/${id}`);
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${id}`);
    expect(w.find('[data-testid="comparison-card"]').exists()).toBe(true);
  });

  it("explains a bad link, a missing report and an expired one", async () => {
    const id = "0123456789abcdef0123456789abcdef";
    const w = mount(ReportComparison, { props: { result: AFTER } });
    const submit = async (value: string) => {
      await w.find('[data-testid="compare-link"]').setValue(value);
      await w.find("form").trigger("submit");
      await flushPromises();
      return w.find('[data-testid="compare-error"]').text();
    };
    expect(await submit("not a link")).toContain("does not look like a share link");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce({ status: 404 });
    expect(await submit(id)).toBe("No report was found at that link.");
    fetchMock.mockRejectedValueOnce({ status: 410 });
    expect(await submit(id)).toBe("That share link has expired.");
    fetchMock.mockResolvedValueOnce({ report: { url: "https://x", violations: [] } });
    expect(await submit(id)).toContain("not a document report");
  });

  it("an automatic re-check opens the card with its own heading, and can be hidden", async () => {
    const w = mount(ReportComparison, {
      props: { result: AFTER, earlier: BEFORE, recheckOf: "report.pdf" },
    });
    expect(w.find("h3").text()).toBe("This is a re-check of report.pdf");
    expect(w.find('[data-testid="comparison-card"]').exists()).toBe(true);
    await w.find('[data-testid="compare-clear"]').trigger("click");
    expect(w.emitted("dismiss")).toHaveLength(1);
  });

  it("says plainly when nothing changed, with no table of zeroes", () => {
    const w = mount(ReportComparison, {
      props: { result: BEFORE, earlier: structuredClone(BEFORE), recheckOf: "report.pdf" },
    });
    expect(w.find('[data-testid="comparison-summary"]').text()).toContain("Nothing changed");
    expect(w.find("table").exists()).toBe(false);
  });

  it("drops a supplied report when the report on screen changes", async () => {
    const w = mount(ReportComparison, { props: { result: AFTER } });
    fetchMock.mockResolvedValue({ report: BEFORE });
    await w.find('[data-testid="compare-link"]').setValue("0123456789abcdef0123456789abcdef");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.find('[data-testid="comparison-card"]').exists()).toBe(true);
    await w.setProps({ result: { ...AFTER, filename: "another.pdf" } });
    expect(w.find('[data-testid="comparison-card"]').exists()).toBe(false);
  });
});

describe("index.vue — uploading the same filename again offers the comparison", () => {
  const fetchMock = vi.fn();
  const UButton = defineComponent({
    name: "UButton",
    inheritAttrs: false,
    setup(_p, { slots, attrs }) {
      return () => h("button", { type: "button", ...attrs }, slots.default?.());
    },
  });
  function mountIndex(resetSignal = ref(0)) {
    return mount(IndexPage, {
      shallow: true,
      attachTo: document.body,
      global: {
        provide: { resetSignal },
        components: { DropZone, UButton, ReportComparison },
        stubs: { UButton: false, ReportComparison: false, RemediateButton: true },
      },
    });
  }
  const file = (name: string) => new File(["x"], name, { type: "application/pdf" });
  let answers: unknown[];
  beforeEach(() => {
    fetchMock.mockReset();
    (globalThis as any).$fetch = fetchMock;
    sessionStorage.clear();
    answers = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/analyze-job") throw Object.assign(new Error("nf"), { status: 404 });
      if (url === "/api/analyze") return answers.shift();
      return {};
    });
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function upload(wrapper: ReturnType<typeof mountIndex>, name: string) {
    await wrapper.findComponent(DropZone).vm.$emit("file-selected", file(name));
    await flushPromises();
    await nextTick();
  }

  it("after a Reset, the same filename shows 'This is a re-check of …' with what changed", async () => {
    const resetSignal = ref(0);
    answers = [BEFORE, AFTER];
    const wrapper = mountIndex(resetSignal);
    await upload(wrapper, "report.pdf");
    // First report: only the control.
    expect(wrapper.find('[data-testid="comparison-card"]').exists()).toBe(false);
    expect(wrapper.findComponent(ReportComparison).find("h3").text()).toBe(
      "Compare with an earlier report",
    );

    resetSignal.value++;
    await flushPromises();
    await upload(wrapper, "report.pdf");
    const cmp = wrapper.findComponent(ReportComparison);
    expect(cmp.find("h3").text()).toBe("This is a re-check of report.pdf");
    expect(cmp.find('[data-testid="comparison-summary"]').text()).toContain(
      "The score went up by 23",
    );
    wrapper.unmount();
  });

  it("a different filename is not a re-check", async () => {
    const resetSignal = ref(0);
    answers = [BEFORE, { ...AFTER, filename: "other.pdf" }];
    const wrapper = mountIndex(resetSignal);
    await upload(wrapper, "report.pdf");
    resetSignal.value++;
    await flushPromises();
    await upload(wrapper, "other.pdf");
    expect(wrapper.find('[data-testid="comparison-card"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("the comparison survives a reload, and a Reset forgets the stored copy", async () => {
    const resetSignal = ref(0);
    answers = [BEFORE, AFTER];
    const first = mountIndex(resetSignal);
    await upload(first, "report.pdf");
    resetSignal.value++;
    await flushPromises();
    await upload(first, "report.pdf");
    first.unmount();

    const second = mountIndex();
    await flushPromises();
    await nextTick();
    expect(second.findComponent(ReportComparison).find("h3").text()).toBe(
      "This is a re-check of report.pdf",
    );
    second.unmount();

    const resetAgain = ref(0);
    const third = mountIndex(resetAgain);
    await flushPromises();
    resetAgain.value++;
    await flushPromises();
    expect(sessionStorage.getItem("fa:audit-previous:v1")).toBeNull();
    third.unmount();
  });

  it("hiding the comparison returns to the plain control", async () => {
    const resetSignal = ref(0);
    answers = [BEFORE, AFTER];
    const wrapper = mountIndex(resetSignal);
    await upload(wrapper, "report.pdf");
    resetSignal.value++;
    await flushPromises();
    await upload(wrapper, "report.pdf");
    await wrapper.find('[data-testid="compare-clear"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="comparison-card"]').exists()).toBe(false);
    expect(sessionStorage.getItem("fa:audit-previous:v1")).toBeNull();
    wrapper.unmount();
  });
});
