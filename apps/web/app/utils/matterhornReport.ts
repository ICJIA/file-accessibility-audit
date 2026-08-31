/**
 * Per-report Matterhorn projection (v1.93.0).
 *
 * Regroups an audit report's EXISTING evidence — the engine's conformance
 * failures, category findings, and the veraPDF verdict — under the 31
 * Matterhorn Protocol checkpoints the landing page discloses, so a reader can
 * see how their document's problems land on the industry's own checklist.
 * Pure presentation: computed from the report payload at render time, no API
 * or schema change, so stored reports gain the panel retroactively.
 *
 * THE HONESTY CONTRACT (matterhornReportPanel.test.ts pins all of it):
 *  - Four statuses, in words. "clean" renders as "No machine-detected
 *    issues" — NEVER "Pass": most checkpoints also carry human-judgment
 *    conditions no software can check.
 *  - The human-judgment checkpoints (03, 04, 22) are ALWAYS "human".
 *  - veraPDF-covered checkpoints on a report where veraPDF did not run (or
 *    could not validate) are "unchecked" — the v1.91.0 "Did not run"
 *    disclosure carried down to checkpoint level.
 *  - A veraPDF failure whose clause cannot be mapped lands in the visible
 *    `unmapped` bucket — shown, never silently dropped.
 *  - No aggregate count anywhere: a "24 of 31" beside a letter grade would
 *    be read as a second grade (the same failure mode SEVERITY_GRADE_CAPS
 *    exists for).
 *
 * MAPPING SOURCES, in order of reliability:
 *  1. Conformance failures — structured (sc + category + issue), always real.
 *  2. Category scores + finding-text markers — the marker strings are the
 *     analyzer's own copy (same repo); the fixture contract test in
 *     matterhornReport.test.ts walks a REAL captured payload so a reworded
 *     finding that breaks a marker fails CI instead of silently unmapping.
 *  3. veraPDF failures — the `clause` is an ISO 14289-1 section number, and
 *     the Matterhorn Protocol itself assigns each checkpoint its clause
 *     (7.4 → 14 Headings, 7.5 → 15 Tables, …). Clauses 7.1 and 7.2 feed
 *     several checkpoints and are split by description keywords; the raw
 *     clause + description is always displayed verbatim on the evidence
 *     line, so grouping is navigation, never a claim.
 */
import { MATTERHORN_CHECKPOINTS, type MatterhornCheckpoint } from "~/data/matterhorn";

export type MatterhornRowStatus = "issues" | "clean" | "human" | "unchecked";

export interface MatterhornEvidence {
  source: "engine" | "verapdf";
  label: string;
}

export interface MatterhornRow {
  checkpoint: MatterhornCheckpoint;
  status: MatterhornRowStatus;
  evidence: MatterhornEvidence[];
}

export interface MatterhornProjection {
  rows: MatterhornRow[];
  /** veraPDF failures whose clause has no checkpoint mapping — shown in an
   *  "Other PDF/UA rules" block. Display is CAPPED (RB-2); anything past the
   *  cap is counted in `unmappedTruncated` so nothing is SILENTLY dropped. */
  unmapped: MatterhornEvidence[];
  /** Unmappable failures beyond the display cap — rendered as a count. */
  unmappedTruncated: number;
  /** veraPDF produced a usable verdict for this report (ran, and did not
   *  error out) — when false, verapdf-covered rows are "unchecked". */
  veraPdfRan: boolean;
}

interface ReportLike {
  fileType?: string;
  /** Analyzer census generation (v1.94.0+ writes 2). Reports without it
   *  predate the engine censuses behind several checkpoint promotions —
   *  their rows must fall back to veraPDF-era coverage, or "nothing checked
   *  this" would render as a green "No machine-detected issues". */
  matterhornCensusGeneration?: number;
  categories?: Array<{ id?: string; score?: number | null; findings?: string[] }>;
  conformance?: { failures?: Array<{ sc?: string; category?: string; issue?: string }> };
  pdfUaVerdict?: {
    available?: boolean;
    error?: string;
    totalFailureCount?: number;
    failures?: Array<{ clause?: string; ruleId?: string; description?: string; count?: number }>;
  } | null;
}

/** Conformance failure → checkpoint + a short reader-facing label. */
function mapConformanceFailure(f: {
  sc?: string;
  category?: string;
  issue?: string;
}): { id: string; label: string } | null {
  const sc = f.sc ?? "";
  const cat = f.category ?? "";
  const issue = f.issue ?? "";
  if (cat === "text_extractability" && /security settings/i.test(issue))
    return { id: "26", label: "Security settings deny assistive-technology access" };
  if (cat === "text_extractability" && sc === "1.1.1")
    return { id: "08", label: "No extractable text — the pages are scanned images" };
  if (cat === "text_extractability" && sc === "1.3.1")
    return { id: "01", label: "Content is missing from the tag structure" };
  if (cat === "alt_text" && /formula/i.test(issue))
    return { id: "17", label: "Formulas without a text alternative" };
  if (cat === "alt_text") return { id: "13", label: "Images without alternative text" };
  if (sc === "3.1.1") return { id: "11", label: "No document language declared" };
  if (sc === "2.4.2") return { id: "06", label: "No document title in the metadata" };
  if (cat === "table_markup") return { id: "15", label: "Tables without header cells" };
  if (cat === "reading_order") return { id: "16", label: "Lists missing required structure" };
  if (cat === "link_quality")
    return { id: "28", label: "Links not tagged for assistive technology" };
  if (cat === "form_accessibility" && sc === "1.3.1")
    return { id: "28", label: "Form fields not referenced from the tag structure" };
  if (sc === "4.1.2") return { id: "28", label: "Form fields without accessible labels" };
  return null;
}

/** Finding-text markers → checkpoint evidence. Each marker matches ONLY the
 *  analyzer's negative (issue/advisory) wording — the corresponding positive
 *  lines are worded differently, and the fixture contract test guards the
 *  coupling. Keyed by category so an unrelated category quoting similar words
 *  cannot trip a marker. */
const FINDING_MARKERS: Array<{
  category: string;
  pattern: RegExp;
  id: string;
  label: string;
}> = [
  {
    category: "title_language",
    pattern: /looks like a filename/i,
    id: "06",
    label: "Title looks like a filename, not a description",
  },
  {
    category: "title_language",
    pattern: /DisplayDocTitle viewer preference is not/i,
    id: "07",
    label: "Viewers show the filename instead of the title (DisplayDocTitle unset)",
  },
  {
    category: "title_language",
    pattern: /not a usable language code/i,
    id: "11",
    label: "Language declared with an unusable code",
  },
  {
    category: "text_extractability",
    pattern: /non-embedded font/i,
    id: "31",
    label: "Fonts not embedded — text may garble on other systems",
  },
  {
    category: "text_extractability",
    pattern: /Suspects = true/i,
    id: "08",
    label: "The producing tool marked its own tagging as suspect (common after OCR)",
  },
  // RB-review F4: these two match the SCORED-branch sentences only — the
  // census COUNT line also prints for the advisory tier ("No action
  // needed"), and an advisory the report itself waves off must never flip a
  // panel row to "Issues found".
  {
    category: "text_extractability",
    pattern: /cannot be read aloud or searched|Verify the affected passages read correctly/i,
    id: "10",
    label: "Characters that extract as unreadable symbols (missing character maps)",
  },
  {
    category: "text_extractability",
    pattern:
      /bring the untagged content into the structure|Review the named pages in Acrobat's Tags panel/i,
    id: "01",
    label: "Visible text painted outside the tag structure",
  },
  {
    category: "reading_order",
    pattern: /reference XObject/i,
    id: "30",
    label: "Prohibited reference XObjects (imported content)",
  },
  {
    category: "reading_order",
    pattern: /have no description \(\/Desc/i,
    id: "21",
    label: "Attachments without a description",
  },
  {
    category: "reading_order",
    pattern: /not referenced from the tag structure \(Matterhorn 28\)/i,
    id: "28",
    label: "Comments or markup annotations outside the tag structure",
  },
  {
    category: "reading_order",
    pattern: /no \/Contents description/i,
    id: "28",
    label: "Annotations without an alternate description",
  },
  {
    category: "reading_order",
    pattern: /have no \/ID \(Matterhorn 19-003\)/i,
    id: "19",
    label: "Footnotes without linkable IDs",
  },
  {
    category: "reading_order",
    pattern: /reuse another note's \/ID/i,
    id: "19",
    label: "Duplicate footnote IDs",
  },
  {
    category: "reading_order",
    pattern: /02-003/,
    id: "02",
    label: "Circular tag-name mappings",
  },
  {
    category: "reading_order",
    pattern: /02-004/,
    id: "02",
    label: "Standard tag types remapped",
  },
  {
    category: "reading_order",
    pattern: /02-001/,
    id: "02",
    label: "Custom tags with no standard mapping",
  },
  {
    category: "reading_order",
    pattern: /20-001/,
    id: "20",
    label: "Unnamed layer configurations",
  },
  {
    category: "reading_order",
    // Keyed on the finding's words, not a sub-number: 2026-08-31 review found
    // the /AS condition is not 20-002 (that is a second /Name condition), and
    // the protocol itself is not publicly fetchable to settle which it is. The
    // finding now cites checkpoint 20 only, so match on the defect it names.
    pattern: /\/AS auto-state/,
    id: "20",
    label: "Layers that can switch content automatically",
  },
];

/** Category-score signals for issues the conformance gate deliberately does
 *  not assert (partial credit, heuristics, best-practice weight). */
const CATEGORY_SCORE_SIGNALS: Record<string, { id: string; label: string }> = {
  heading_structure: {
    id: "14",
    label: "Heading structure issues (missing levels, skips, or mixed conventions)",
  },
  bookmarks: { id: "27", label: "No bookmarks in a long document" },
  reading_order: {
    id: "09",
    label: "Tag order diverges from the content order — review the reading sequence",
  },
  table_markup: {
    id: "15",
    label: "Table structure issues (headers, scope, or column consistency)",
  },
  link_quality: { id: "28", label: "Link issues (untagged links or unclear link text)" },
  form_accessibility: { id: "28", label: "Form fields missing accessible labels" },
  alt_text: { id: "13", label: "Images or figures missing alternative text" },
};

/** veraPDF clause → checkpoint. Clauses 7.3–7.21 map one-to-one (the
 *  Matterhorn Protocol assigns each checkpoint its ISO 14289-1 clause);
 *  clause 5 is the conformance/metadata identifier; 7.1 and 7.2 feed several
 *  checkpoints and are split by description keywords, falling back to the
 *  visible unmapped bucket rather than guessing. */
const VERA_CLAUSE_MAP: Record<string, string> = {
  "7.3": "13",
  "7.4": "14",
  "7.5": "15",
  "7.6": "16",
  "7.7": "17",
  "7.8": "18",
  "7.9": "19",
  "7.10": "20",
  "7.11": "21",
  "7.12": "22",
  "7.13": "23",
  "7.14": "24",
  "7.15": "25",
  "7.16": "26",
  "7.17": "27",
  "7.18": "28",
  "7.19": "29",
  "7.20": "30",
  "7.21": "31",
};

export function checkpointForVeraClause(clause: string, description: string): string | null {
  const trimmed = (clause ?? "").trim();
  if (trimmed === "") return null;
  const segments = trimmed.split(".");
  const head = segments[0];
  if (head === "5" || head === "6") return "06"; // conformance & metadata identifier
  const key = segments.length >= 2 ? `${segments[0]}.${segments[1]}` : trimmed;
  if (key === "7.1") {
    if (/displaydoctitle|viewerpreferences/i.test(description)) return "07";
    if (/metadata|dc:title|xmp/i.test(description)) return "06";
    return "01";
  }
  if (key === "7.2") {
    if (/unicode|character|glyph|mapping/i.test(description)) return "10";
    if (/language|\blang\b/i.test(description)) return "11";
    if (/stretch|expansion/i.test(description)) return "12";
    return null; // visible bucket — never a guess
  }
  return VERA_CLAUSE_MAP[key] ?? null;
}

/**
 * Build the per-checkpoint projection for a PDF report, or null when the
 * panel must not render at all (non-PDF, or a payload with no categories —
 * URL page-audit rows share the shared_reports table and must never grow a
 * Matterhorn panel that would imply a document audit happened).
 */
export function buildMatterhornProjection(report: ReportLike): MatterhornProjection | null {
  if (report.fileType !== "pdf") return null;
  if (!Array.isArray(report.categories) || report.categories.length === 0) return null;

  // RB-review F7: checkpoints promoted on engine-census evidence must not
  // read "clean" on reports from before those censuses existed. Generation
  // 2 = the v1.92–v1.94 censuses ran; older payloads demote the affected
  // checkpoints back to veraPDF-era coverage for THIS report.
  const censusGeneration =
    typeof report.matterhornCensusGeneration === "number" ? report.matterhornCensusGeneration : 1;
  const PRE_CENSUS_COVERAGE: Record<string, "verapdf"> = {
    "10": "verapdf", // glyph census        (v1.94.0)
    "17": "verapdf", // Formula census      (v1.92.0)
    "19": "verapdf", // Note /ID census     (v1.92.0)
    "20": "verapdf", // OCG census          (v1.92.0)
    "21": "verapdf", // /Filespec census    (v1.94.0)
    "30": "verapdf", // RefXObject census   (v1.94.0)
  };
  const effectiveCoverage = (cp: MatterhornCheckpoint): MatterhornCheckpoint["coverage"] =>
    censusGeneration < 2 && PRE_CENSUS_COVERAGE[cp.id] ? "verapdf" : cp.coverage;

  const evidenceById = new Map<string, MatterhornEvidence[]>();
  const push = (id: string, ev: MatterhornEvidence): void => {
    const list = evidenceById.get(id) ?? [];
    // RB-2: bound per-row evidence against forged payloads (the panel shows
    // 5; 24 keeps an honest "and N more" while capping memory/DOM).
    if (list.length >= 24) return;
    // Dedup by label: the gate and a category score often describe the same
    // defect; one line per distinct statement. Labels are truncated so a
    // forged multi-megabyte description cannot bloat the page.
    const bounded = { source: ev.source, label: ev.label.slice(0, 400) };
    if (!list.some((e) => e.label === bounded.label && e.source === bounded.source))
      list.push(bounded);
    evidenceById.set(id, list);
  };

  for (const f of report.conformance?.failures ?? []) {
    const mapped = mapConformanceFailure(f ?? {});
    if (mapped) push(mapped.id, { source: "engine", label: mapped.label });
  }

  for (const cat of report.categories) {
    const id = cat?.id ?? "";
    const findings = Array.isArray(cat?.findings) ? cat.findings : [];
    const signal = CATEGORY_SCORE_SIGNALS[id];
    if (signal && typeof cat?.score === "number" && cat.score < 100) {
      push(signal.id, { source: "engine", label: signal.label });
    }
    for (const marker of FINDING_MARKERS) {
      if (marker.category !== id) continue;
      if (findings.some((line) => typeof line === "string" && marker.pattern.test(line))) {
        push(marker.id, { source: "engine", label: marker.label });
      }
    }
  }

  // veraPDF: ran = available AND produced a real verdict (the "could not
  // validate" error state — error set, zero counted failures — must read as
  // unchecked, exactly as PdfUaVerdict renders it).
  const v = report.pdfUaVerdict;
  const couldNotValidate = Boolean(v?.error) && (v?.totalFailureCount ?? 0) === 0;
  const veraPdfRan = v?.available === true && !couldNotValidate;
  const unmapped: MatterhornEvidence[] = [];
  let unmappedTruncated = 0;
  if (veraPdfRan) {
    // RB-2 (v1.94.0 red/blue): shared-report payloads are client-supplied
    // (POST /api/reports), so a forged verdict can carry thousands of
    // "failures" — real verdicts store at most 20. Process a bounded slice
    // so a hostile stored report cannot flood this page with DOM nodes.
    const MAX_VERA_FAILURES = 100;
    for (const f of (Array.isArray(v?.failures) ? v!.failures! : []).slice(0, MAX_VERA_FAILURES)) {
      const clause = f?.clause ?? "";
      const description = f?.description ?? "";
      const count = typeof f?.count === "number" ? f.count : 1;
      const label = `${clause || f?.ruleId || "rule"} — ${description || "PDF/UA rule failed"} (${count.toLocaleString("en-US")}×)`;
      const id = checkpointForVeraClause(clause, description);
      if (id) push(id, { source: "verapdf", label });
      else if (unmapped.length < 40)
        unmapped.push({ source: "verapdf", label: label.slice(0, 400) });
      else unmappedTruncated++;
    }
  }

  const rows: MatterhornRow[] = MATTERHORN_CHECKPOINTS.map((checkpoint) => {
    const evidence = evidenceById.get(checkpoint.id) ?? [];
    const coverage = effectiveCoverage(checkpoint);
    let status: MatterhornRowStatus;
    if (coverage === "human") {
      status = "human";
    } else if (evidence.length > 0) {
      status = "issues";
    } else if (coverage === "verapdf" && !veraPdfRan) {
      status = "unchecked";
    } else {
      status = "clean";
    }
    return { checkpoint, status, evidence };
  });

  return { rows, unmapped, unmappedTruncated, veraPdfRan };
}
