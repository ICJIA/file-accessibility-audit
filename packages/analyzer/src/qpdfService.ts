import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ANALYSIS } from "#config";
import { buildChildSpawnEnv } from "./childSpawnEnv.js";
// Pure struct-tree walkers (reference normalization/resolution, the RoleMap
// tag mapper, and the table/heading tree walkers) live in their own module —
// see qpdfStructTree.ts for the v1.34.0 structural-split rationale. This file
// keeps the qpdf subprocess spawning/recovery and the object-graph walk that
// calls these walkers. TableAnalysis is re-exported below because some tests
// import it directly from this file.
import {
  normRef,
  resolveRef,
  mapToStandardTag,
  collectDescendantTableRefs,
  collectLiveStructRefs,
  collectHeadingsInOrder,
  findStructTreeRoot,
  analyzeTable,
  STANDARD_STRUCT_TYPES,
  type TableAnalysis,
} from "./qpdfStructTree.js";
export type { TableAnalysis };

// Exported so the /status endpoint probes the SAME binary the analyzer will
// actually use. Probing a bare "qpdf" instead would report a false outage
// wherever PATH lacks the fallback directories — which is the normal case
// under PM2 — while document auditing carried on working.
export const QPDF_BIN =
  process.env.QPDF_PATH ||
  (() => {
    try {
      execFileSync("qpdf", ["--version"], { stdio: "ignore" });
      return "qpdf";
    } catch {}
    try {
      execFileSync("/opt/homebrew/bin/qpdf", ["--version"], {
        stdio: "ignore",
      });
      return "/opt/homebrew/bin/qpdf";
    } catch {}
    try {
      execFileSync("/usr/local/bin/qpdf", ["--version"], { stdio: "ignore" });
      return "/usr/local/bin/qpdf";
    } catch {}
    return "qpdf";
  })();

export interface ListAnalysis {
  itemCount: number;
  hasLabels: boolean;
  hasBodies: boolean;
  isWellFormed: boolean;
  nestingDepth: number;
}

export interface QpdfResult {
  hasStructTree: boolean;
  hasLang: boolean;
  lang: string | null;
  hasOutlines: boolean;
  outlineCount: number;
  outlineTitles: string[];
  hasAcroForm: boolean;
  formFields: Array<{ ref?: string; hasTU: boolean; name?: string }>;
  images: Array<{ ref: string; hasAlt: boolean; altText?: string }>;
  imageObjectCount: number;
  /**
   * Image XObjects shaped like a LINE OF TEXT rather than a picture — wide,
   * short, and in the height range a line of type falls into. Soft masks are
   * excluded, same as `imageObjectCount`.
   *
   * Why this exists (v1.105.0). Word's PDF export turns text carrying an
   * effect it cannot express in PDF — a shadow, outline, glow, reflection, or
   * a gradient/see-through fill — into pictures, ONE PER LINE. A real ICJIA
   * board agenda found it: the letterhead read "ILLINOIS / CRIMINAL JUSTICE /
   * INFORMATION AUTHORITY" and all three lines were pixels. "ILLINOIS" did
   * not appear in the text layer at all, so the agency's own name could not
   * be read aloud, searched, or reflowed — while the report said only
   * "3 images missing alt text" and sent the author to Acrobat to describe
   * their own letterhead.
   *
   * Read from qpdf, not pdf.js, on purpose: pdf.js resolves image objects
   * lazily while RENDERING, so an operator-list walk never learns their
   * dimensions (measured — the counter read 0 for a file with three such
   * images). qpdf reads /Width and /Height straight from the object graph,
   * which is static and always available.
   *
   * A COUNT, not a verdict: the heuristic recognises a shape, which is
   * evidence rather than proof, so the finding it drives asks the reader to
   * confirm and never asserts a failure or moves the score.
   *
   * Optional because it is absent from analyses stored before v1.105.0 — and
   * consumers must read it as `?? 0` rather than assuming a number.
   */
  textLineLikeImageCount?: number;
  headings: Array<{ level: string; tag: string }>;
  tables: TableAnalysis[];
  lists: ListAnalysis[];
  paragraphCount: number;
  hasMarkInfo: boolean;
  isMarkedContent: boolean;
  hasRoleMap: boolean;
  roleMapEntries: string[];
  tabOrderPages: number;
  totalPageCount: number;
  langSpans: Array<{ lang: string; tag: string }>;
  /** Rendering-reachable fonts only (see the reachability census in
   *  parseQpdfJson): one entry per /FontDescriptor referenced by a font that
   *  a content stream could actually select. `name` is the descriptor's
   *  /FontName; `baseFonts` lists the /BaseFont names of the font dict(s)
   *  using the descriptor — the names pdfjs and pdffonts report, which the
   *  scorer correlates with content-stream usage. Absent on stored reports
   *  from before v1.79.0. */
  fonts: Array<{ name: string; embedded: boolean; baseFonts?: string[] }>;
  hasPdfUaIdentifier: boolean;
  pdfUaPart: string | null;
  artifactCount: number;
  actualTextCount: number;
  expansionTextCount: number;
  /** True when the document is encrypted (any revision/handler). */
  isEncrypted: boolean;
  /** /ViewerPreferences /DisplayDocTitle — null when absent. WCAG 2.4.2's
   *  PDF technique needs BOTH a title and this flag; without it viewers show
   *  the filename. */
  displayDocTitle: boolean | null;
  /** AcroForm carries /XFA (LiveCycle/Designer form technology). */
  hasXfa: boolean;
  /** Catalog /NeedsRendering === true — the DYNAMIC-XFA marker: page content
   *  is a placeholder and the real UI renders from the XFA template only.
   *  Static XFA (flag absent) ships a full conventional rendering that IS
   *  what every viewer shows, and must be audited normally. */
  needsRendering: boolean;
  /** MarkInfo /Suspects === true — the producer itself flags the tagging as
   *  unreliable (typically OCR/auto-tag output). Advisory. */
  suspectsFlag: boolean;
  /**
   * The security handler's accessibility capability: false means conforming
   * viewers deny assistive-technology text access (Matterhorn 26-002 — the
   * most severe possible barrier). null = unencrypted or unknown. Modern
   * AES-256/R6 encryption cannot deny accessibility, so false in practice
   * means a legacy security handler with the accessibility flag off.
   */
  accessibilityAllowed: boolean | null;
  structTreeDepth: number;
  contentOrder: number[]; // MCIDs in structure tree order
  // Per-page MCID sequence as collected by walking the structure tree in
  // document order. Key is the 1-indexed page number. Compared against
  // pdfjs's content-stream MCID sequence to verify logical reading order.
  // Empty when the document has no struct tree or no MCIDs.
  structTreeMcidsByPage: Record<number, number[]>;
  /** MCIDs that are DIRECT content of /Figure elements (role-mapped figures
   *  included), per page. The reading-order fidelity metric excludes these:
   *  image paint order is a z-order concern — Office exporters paint images
   *  last regardless of where they are tagged — and carries no reading-order
   *  information. MCIDs of elements NESTED inside a figure (captions) are
   *  not included; their text order remains comparable. Absent on stored
   *  reports from before v1.81.0 (fidelity then treats every MCID as text —
   *  the legacy behavior). */
  figureMcidsByPage?: Record<number, number[]>;
  // -------------------------------------------------------------------------
  // v1.92.0 Matterhorn completeness censuses. Always present on parser output
  // (emptyQpdfResult provides the zero-defaults); typed OPTIONAL only so the
  // suite's many hand-built QpdfResult fixtures stay terse — consumers guard
  // with `?? 0` / `?? []`.
  // -------------------------------------------------------------------------
  /** Reachable <Note> structure elements (footnotes/endnotes). */
  noteCount?: number;
  /** Notes without an /ID (Matterhorn 19-003). */
  notesMissingId?: number;
  /** Notes whose /ID duplicates another note's (Matterhorn 19-004). */
  noteDuplicateIdCount?: number;
  /** Reachable <Formula> structure elements (Matterhorn 17). */
  formulaCount?: number;
  /** Formulas with NEITHER /Alt nor /ActualText — the machine-certain
   *  failure mode (a formula's glyphs rarely extract as speakable text). */
  formulasMissingAlt?: number;
  /** RoleMap validity (Matterhorn 02). Custom /S values on struct elements
   *  whose (transitive) mapping does not END on a standard structure type —
   *  unrecognized semantics for AT (02-001). Unique, capped at 12. */
  roleMapUnmappedTags?: string[];
  /** RoleMap entries that sit on a circular chain (02-003). */
  roleMapCircularTags?: string[];
  /** Standard structure types the RoleMap REMAPS to something else (02-004),
   *  as "P → Figure" strings. */
  roleMapStandardRemaps?: string[];
  /** JavaScript action dictionaries (/S /JavaScript) in the object graph. */
  jsActionCount?: number;
  /** The catalog's /Names tree carries a /JavaScript branch (doc-level JS). */
  hasJsNameTree?: boolean;
  /** Multimedia annotation census (Matterhorn 05/29 territory). */
  mediaAnnotationCounts?: { screen: number; movie: number; sound: number; richMedia: number };
  /** Optional content (layers — Matterhorn 20). */
  hasOptionalContent?: boolean;
  /** OCG configuration dicts seen (the default /D plus /Configs entries). */
  ocgConfigCount?: number;
  /** Configurations missing the required /Name (20-001). */
  ocgConfigsMissingName?: number;
  /** Configurations carrying an /AS auto-state array (20-002 — content can
   *  switch on zoom/print without user intent). */
  ocgConfigsWithAS?: number;
  // -------------------------------------------------------------------------
  // v1.94.0 censuses (Matterhorn 28 / 30 / 21 / 23).
  // -------------------------------------------------------------------------
  /** Visible (non-Hidden/NoView) form-field widget annotations. */
  widgetAnnotationCount?: number;
  /** Widgets no structure element references via OBJR — a screen reader
   *  following the tags never reaches them (the untagged-links mechanics
   *  applied to form fields; PDF/UA 7.18 / Matterhorn 28). */
  untaggedWidgetAnnotationCount?: number;
  /** Visible annotations that are neither links, widgets, popups, nor the
   *  separately-censused multimedia kinds (highlights, stamps, notes, file
   *  attachments, …). */
  otherAnnotationCount?: number;
  /** Of those, how many no structure element references via OBJR. */
  untaggedOtherAnnotationCount?: number;
  /** Of those, how many carry no /Contents text (PDF/UA 7.18.2 expects an
   *  alternate description). */
  otherAnnotationsMissingContents?: number;
  /** Subtype → count for the census above, e.g. { Highlight: 2 }. */
  otherAnnotationSubtypeCounts?: Record<string, number>;
  /** Form XObjects carrying /Ref — reference XObjects, prohibited outright
   *  by PDF/UA (Matterhorn 30-001). */
  refXObjectCount?: number;
  /** /Filespec objects (file attachments) and how many lack a /Desc
   *  (Matterhorn 21 — a nameless attachment is unannounceable). */
  embeddedFileCount?: number;
  embeddedFilesMissingDesc?: number;
  /** Signature form fields (/FT /Sig) — presence disclosure (Matterhorn 23). */
  signatureFieldCount?: number;
  error: string | null;
}

/**
 * Decode a QPDF-encoded string.  QPDF prefixes Unicode strings with "u:" and
 * byte strings with "b:" (hex-encoded).  For "b:" strings we attempt to decode
 * the hex as UTF-16BE (common PDF encoding for /Alt values), falling back to
 * the raw hex if decoding fails.
 */
function decodeQpdfString(raw: string): string {
  if (raw.startsWith("u:")) return raw.slice(2);
  if (raw.startsWith("b:")) {
    const hex = raw.slice(2);
    try {
      // Convert hex to bytes
      const bytes = Buffer.from(hex, "hex");
      // Check for UTF-16BE BOM (fe ff)
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        // UTF-16BE needs byte-swapping for Node's utf16le decoder
        const content = bytes.slice(2);
        const swapped = Buffer.alloc(content.length);
        for (let i = 0; i < content.length - 1; i += 2) {
          swapped[i] = content[i + 1];
          swapped[i + 1] = content[i];
        }
        const decoded = swapped.toString("utf16le").replace(/\0+$/, "");
        return decoded || raw;
      }
      // Try plain UTF-8
      const decoded = bytes.toString("utf8");
      // If most chars are printable, use it
      const printable = decoded.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "").length;
      if (decoded.length > 0 && printable / decoded.length > 0.5) {
        return decoded.replace(/\0+$/, "");
      }
    } catch {
      // Fall through to return raw
    }
    return raw; // Keep "b:..." so detectSuspiciousAltText can flag it
  }
  return raw;
}

/** Annotation subtypes for the "other annotations" census (v1.94.0) — every
 *  presentable kind EXCEPT links (censused by pdfjs), widgets (their own
 *  census), popups (a duplicate view of the parent note), and the multimedia
 *  kinds (their own census). */
const OTHER_ANNOT_SUBTYPES: ReadonlySet<string> = new Set(
  [
    // RB-review F9: print-production annotations (PrinterMark, TrapNet,
    // Watermark) are deliberately EXCLUDED — the spec treats them as
    // production aids outside the reading experience, they are never
    // OBJR-referenced or /Contents-described in practice, and counting
    // them failed press-ready PDFs that Acrobat's own checker passes.
    "Text",
    "FreeText",
    "Line",
    "Square",
    "Circle",
    "Polygon",
    "PolyLine",
    "Highlight",
    "Underline",
    "Squiggly",
    "StrikeOut",
    "Stamp",
    "Caret",
    "Ink",
    "FileAttachment",
    "3D",
    "Redact",
  ].map((t) => `/${t}`),
);

/**
 * Is this image shaped like a LINE OF TEXT rather than a picture?
 *
 * Deliberately conservative — a false positive sends an author to inspect a
 * photograph for no reason — so every threshold exists to exclude something
 * specific:
 *
 *  - `aspect >= 4` — a line of words is far wider than it is tall. Excludes
 *    logos, seals, headshots, charts and photos, which sit near square. (The
 *    ICJIA seal that prompted this work is 192×192: aspect 1, excluded.)
 *  - `height >= 8` px — excludes hairline rules, borders and underlines,
 *    which run 1–4 px tall and would otherwise dominate the count. A rule is
 *    decorative and wants an Artifact, not this finding.
 *  - `height <= 120` px — the ceiling is set from what a LINE OF TYPE can
 *    actually measure across normal export resolutions: about 16 px at
 *    96 ppi, 25 px at 150, 37 px at 220 (the motivating letterhead came out
 *    at 35), 50 px at 300, and ~100 px even at 600. Anything taller is a
 *    band, not a line. This threshold was tightened from 200 after a control
 *    file's decorative colour bars — 1274×194, 1296×179, 2390×199, all with
 *    flat uniform alpha — sailed through the looser bound.
 *  - `width >= 40` px — excludes single glyphs, bullets and spacer tiles.
 *    (The same file's 10×35 and 9×31 spacer slivers are excluded by this.)
 *
 * Uses the image's own pixel dimensions, so the test is independent of where
 * the image was placed on the page and of the DPI it was exported at.
 */
export function isTextLineLikeImage(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (height < 8 || height > 120) return false;
  if (width < 40) return false;
  return width / height >= 4;
}

/**
 * Drop the candidates that are really one PICTURE cut into horizontal bands,
 * and count what remains.
 *
 * The shape test above cannot tell a line of type from a slice of a graphic —
 * both are wide and short. A real control file caught this: a recidivism
 * report's state seal had been flattened into six bands, and every band
 * matched. What separates them is the WIDTH. Lines of writing are ragged,
 * because sentences differ in length — the letterhead that motivated this
 * work measured 189, 404 and 562 px. Slices of one graphic are all exactly
 * as wide as the graphic: 392, 392, 392, 392, 392, 392.
 *
 * So any width shared by three or more candidates is treated as a sliced
 * picture and dropped. Three is the threshold because two lines of text can
 * legitimately come out the same width by chance, while three identical
 * widths in a row is a grid, not prose.
 */
export function countTextLineLikeImages(widths: readonly number[]): number {
  const perWidth = new Map<number, number>();
  for (const w of widths) perWidth.set(w, (perWidth.get(w) ?? 0) + 1);
  let count = 0;
  for (const [, n] of perWidth) if (n < 3) count += n;
  return count;
}

export function analyzeWithQpdf(buffer: Buffer): QpdfResult {
  const tmpDir = process.env.TMP_DIR || "/tmp";
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);

  try {
    fs.writeFileSync(tmpPath, buffer);

    const stdout = execFileSync(QPDF_BIN, ["--json", tmpPath], {
      timeout: ANALYSIS.QPDF_TIMEOUT_MS,
      maxBuffer: ANALYSIS.QPDF_MAX_BUFFER,
      encoding: "utf-8",
      // RB3-2 [HIGH, pre-merge re-audit]: qpdf is memory-unsafe C++ parsing
      // ATTACKER-CONTROLLED PDF bytes, in the main Express process — it must
      // not inherit the API's own secrets. Same denylist RB2-d already
      // applies to the OOXML/remediation workers; qpdf needs none of them
      // (PATH/QPDF_PATH/TMPDIR/etc. all survive).
      env: buildChildSpawnEnv(),
    });

    const json = JSON.parse(stdout);
    return parseQpdfJson(json);
  } catch (err: any) {
    return handleQpdfError(err);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}

export async function analyzeWithQpdfAsync(buffer: Buffer): Promise<QpdfResult> {
  const tmpDir = process.env.TMP_DIR || "/tmp";
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);

  try {
    fs.writeFileSync(tmpPath, buffer);

    const stdout = await execQpdfAsync(tmpPath);
    const json = JSON.parse(stdout);
    return parseQpdfJson(json);
  } catch (err: any) {
    return handleQpdfError(err);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}

function execQpdfAsync(tmpPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      QPDF_BIN,
      ["--json", tmpPath],
      {
        timeout: ANALYSIS.QPDF_TIMEOUT_MS,
        maxBuffer: ANALYSIS.QPDF_MAX_BUFFER,
        encoding: "utf-8",
        // RB3-2 [HIGH, pre-merge re-audit]: see the matching comment on
        // analyzeWithQpdf's execFileSync call above — same rationale,
        // same helper, the async spawn site.
        env: buildChildSpawnEnv(),
      },
      (err, stdout, stderr) => {
        if (err) {
          (err as any).stderr = stderr;
          (err as any).stdout = stdout;
          reject(err);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** The parser's working shape: the v1.92.0 census fields are OPTIONAL on the
 *  public QpdfResult (so hand-built test fixtures stay terse) but the parser
 *  always initializes and increments them — Required<Pick<…>> states that to
 *  the compiler without widening the public contract. */
type ParsedQpdfResult = QpdfResult &
  Required<
    Pick<
      QpdfResult,
      | "noteCount"
      | "notesMissingId"
      | "noteDuplicateIdCount"
      | "formulaCount"
      | "formulasMissingAlt"
      | "roleMapUnmappedTags"
      | "roleMapCircularTags"
      | "roleMapStandardRemaps"
      | "jsActionCount"
      | "hasJsNameTree"
      | "mediaAnnotationCounts"
      | "hasOptionalContent"
      | "ocgConfigCount"
      | "ocgConfigsMissingName"
      | "ocgConfigsWithAS"
      | "widgetAnnotationCount"
      | "untaggedWidgetAnnotationCount"
      | "otherAnnotationCount"
      | "untaggedOtherAnnotationCount"
      | "otherAnnotationsMissingContents"
      | "otherAnnotationSubtypeCounts"
      | "refXObjectCount"
      | "embeddedFileCount"
      | "embeddedFilesMissingDesc"
      | "signatureFieldCount"
    >
  >;

function emptyQpdfResult(error: string | null): ParsedQpdfResult {
  return {
    hasStructTree: false,
    hasLang: false,
    lang: null,
    hasOutlines: false,
    outlineCount: 0,
    outlineTitles: [],
    hasAcroForm: false,
    formFields: [],
    images: [],
    imageObjectCount: 0,
    textLineLikeImageCount: 0,
    headings: [],
    tables: [],
    lists: [],
    paragraphCount: 0,
    hasMarkInfo: false,
    isMarkedContent: false,
    hasRoleMap: false,
    roleMapEntries: [],
    tabOrderPages: 0,
    totalPageCount: 0,
    langSpans: [],
    fonts: [],
    hasPdfUaIdentifier: false,
    pdfUaPart: null,
    artifactCount: 0,
    actualTextCount: 0,
    expansionTextCount: 0,
    isEncrypted: false,
    displayDocTitle: null,
    hasXfa: false,
    needsRendering: false,
    suspectsFlag: false,
    accessibilityAllowed: null,
    structTreeDepth: 0,
    contentOrder: [],
    structTreeMcidsByPage: {},
    figureMcidsByPage: {},
    noteCount: 0,
    notesMissingId: 0,
    noteDuplicateIdCount: 0,
    formulaCount: 0,
    formulasMissingAlt: 0,
    roleMapUnmappedTags: [],
    roleMapCircularTags: [],
    roleMapStandardRemaps: [],
    jsActionCount: 0,
    hasJsNameTree: false,
    mediaAnnotationCounts: { screen: 0, movie: 0, sound: 0, richMedia: 0 },
    hasOptionalContent: false,
    ocgConfigCount: 0,
    ocgConfigsMissingName: 0,
    ocgConfigsWithAS: 0,
    widgetAnnotationCount: 0,
    untaggedWidgetAnnotationCount: 0,
    otherAnnotationCount: 0,
    untaggedOtherAnnotationCount: 0,
    otherAnnotationsMissingContents: 0,
    otherAnnotationSubtypeCounts: {},
    refXObjectCount: 0,
    embeddedFileCount: 0,
    embeddedFilesMissingDesc: 0,
    signatureFieldCount: 0,
    error,
  };
}

function handleQpdfError(err: any): QpdfResult {
  if (err.stderr?.includes("encrypted") || err.message?.includes("encrypted")) {
    throw new Error("encrypted");
  }
  if (err.killed || err.signal === "SIGTERM") {
    const error = new Error("QPDF timeout") as any;
    error.killed = true;
    throw error;
  }
  // qpdf exits 3 ("operation succeeded with warnings") for recoverable input
  // defects — damaged xref, missing trailer /Size, etc. — while still writing
  // the COMPLETE document JSON to stdout. execFile/execFileSync surface any
  // non-zero exit as an error, so recover the analysis from the captured
  // stdout in exactly that case. Without this, a tagged document with a
  // trivial warning is falsely reported as untagged (no StructTreeRoot, no
  // headings) and scored as a critical failure.
  //
  // Recovery is deliberately gated on exit code 3 AND a document-shaped
  // payload: exit 2 means "errors — file not processed correctly", and
  // recovering ITS output would let the conformance gate assert confirmed
  // WCAG failures from data qpdf itself disclaimed.
  const exitCode = err.status ?? err.code; // execFileSync uses .status, execFile .code
  if (exitCode === 3) {
    const stdout: unknown =
      typeof err.stdout === "string"
        ? err.stdout
        : Buffer.isBuffer(err.stdout)
          ? err.stdout.toString("utf-8")
          : null;
    if (typeof stdout === "string" && stdout.length > 0) {
      try {
        const parsed = JSON.parse(stdout);
        if (parsed && typeof parsed === "object" && (parsed.qpdf || parsed.objects)) {
          return parseQpdfJson(parsed);
        }
      } catch {
        // stdout was empty/partial — fall through to the failure result
      }
    }
  }
  return emptyQpdfResult("QPDF parsing failed");
}

function parseQpdfJson(json: any): QpdfResult {
  const result: ParsedQpdfResult = emptyQpdfResult(null);

  try {
    // Top-level "encrypt" key (same shape in JSON v1 and v2). qpdf emits it
    // even for unencrypted files (encrypted: false), so the capability is
    // only meaningful when the document is actually encrypted.
    const encrypt = json.encrypt;
    if (encrypt && typeof encrypt === "object") {
      result.isEncrypted = encrypt.encrypted === true;
      const accessibility = encrypt.capabilities?.accessibility;
      if (result.isEncrypted && typeof accessibility === "boolean") {
        result.accessibilityAllowed = accessibility;
      }
    }

    const rawObjects = json.objects || json.qpdf?.[1] || {};

    // QPDF v2 JSON wraps non-stream objects as { value: {...} } and STREAM
    // objects as { stream: { dict: {...}, length } } — with no value key at
    // all. Normalize both so we always work with the inner dict; without the
    // stream branch every Image XObject (streams by definition) is invisible
    // to the walk below and the image census is permanently zero.
    const objects: Record<string, any> = {};
    for (const [ref, raw] of Object.entries(rawObjects)) {
      if (raw === null || raw === undefined) continue;
      // v2 wraps dicts as {value} and streams as {stream:{dict}}; scalar
      // OBJECTS (an indirect string/boolean like a /Lang target) are
      // {value: "u:en-US"} in v2 and bare scalars in v1 — keep both so
      // resolveRef can return them.
      objects[ref] =
        typeof raw === "object" ? ((raw as any).value ?? (raw as any).stream?.dict ?? raw) : raw;
    }

    // Catalog values are frequently INDIRECT references in Designer/
    // LiveCycle output (/Lang → "252 0 R" → "en-US"; /DisplayDocTitle →
    // "273 0 R" → true). Reading the raw string reported "252 0 R" as the
    // document language and treated a set DisplayDocTitle as missing.
    const SCALAR_REF_RE = /^\d+ \d+ R$/;
    const resolveScalar = (raw: unknown): unknown =>
      typeof raw === "string" && SCALAR_REF_RE.test(raw) ? resolveRef(raw, objects) : raw;

    const roleMap: Record<string, string> = {};
    const applyRoleMap = (candidate: any): void => {
      const resolved = resolveStructureMap(candidate, objects);
      if (!resolved) return;
      Object.assign(roleMap, resolved);
      result.hasRoleMap = true;
      result.roleMapEntries = Object.keys(roleMap)
        .filter((k) => k.startsWith("/"))
        .map((k) => `${k.slice(1)} → ${roleMap[k].replace(/^\//, "")}`);
    };

    // Resolve the RoleMap BEFORE the structure walk below. Two reasons:
    // the root may be a DIRECT dictionary in the Catalog (the old code only
    // followed a string ref, so an inline root's RoleMap was never read and
    // every role-mapped heading/table/list silently vanished); and the walk
    // maps each element's tag as it goes, so a RoleMap discovered partway
    // through would not apply to the elements already passed.
    const preRoot = findStructTreeRoot(objects);
    if (preRoot?.["/RoleMap"]) applyRoleMap(preRoot["/RoleMap"]);

    // Top-level /Table struct elements are collected with their object ref so
    // that tables nested inside another table's cell can be filtered out once
    // the whole object map is known (see below). Counting nested tables as
    // separate top-level tables inflates both the table count and the summed
    // row count in the report.
    const tableCandidates: Array<{ ref: string; obj: any }> = [];

    // Parent FIELD refs already credited via one of their kid widgets — a
    // radio group's widgets must collapse into one field, not N unlabeled ones.
    const seenWidgetFieldRefs = new Set<string>();

    // Type3 fonts define their glyphs inline as PDF content streams
    // (/CharProcs) and therefore never carry a /FontFile*, yet they ARE
    // self-contained ("embedded"). Collect the /FontDescriptor refs of any
    // Type3 font so the FontFile-only embedding check below does not wrongly
    // flag them as non-embedded. (qpdf v2 keys objects as "obj:N 0 R" but
    // stores indirect-reference values as "N 0 R" — normRef bridges the two.)
    const type3DescriptorRefs = new Set<string>();
    for (const obj of Object.values(objects)) {
      const o = obj as any;
      if (o && o["/Type"] === "/Font" && o["/Subtype"] === "/Type3") {
        const fd = o["/FontDescriptor"];
        if (typeof fd === "string") type3DescriptorRefs.add(normRef(fd));
      }
    }

    // Rendering-reachability census for fonts (v1.79.0). Acrobat's own
    // remediation fixups re-embed the fonts a page actually uses but leave the
    // ORIGINAL non-embedded font objects behind in the file — orphaned
    // entirely, or referenced only from structure-tree /ADBE_FT-Style
    // attribute dicts (styling metadata, key "/font-family"). A content stream
    // can only select fonts named in a /Font RESOURCE dictionary (pages, form
    // XObjects, annotation appearance streams, AcroForm /DR), so only
    // descriptors reachable through one belong in the embedding census.
    // Adobe Preflight evaluates exactly that set; counting the leftovers
    // produced false "font not embedded" findings on documents Acrobat passes.
    // Alongside reachability, record each live descriptor's /BaseFont name(s):
    // the descriptor's /FontName ("Arial") and the font dict's /BaseFont
    // ("ArialMT") frequently differ, and pdfjs/pdffonts report the BaseFont,
    // so the scorer needs it to correlate content-stream usage.
    const cleanFontName = (raw: unknown): string | null =>
      typeof raw === "string" && raw.length > 0 ? raw.replace(/^\//, "").replace(/^u:/, "") : null;
    const liveDescriptorBaseFonts = new Map<string, Set<string>>();
    const recordFontChain = (fontObj: any): void => {
      if (!fontObj || typeof fontObj !== "object") return;
      const topBase = cleanFontName(fontObj["/BaseFont"]);
      // A Type0 (composite) font's descriptor lives on its descendant CIDFont.
      const chain: any[] = [fontObj];
      if (fontObj["/Subtype"] === "/Type0") {
        let df = fontObj["/DescendantFonts"];
        if (typeof df === "string") df = resolveRef(df, objects);
        if (Array.isArray(df)) {
          for (const d of df) {
            const descendant = typeof d === "string" ? resolveRef(d, objects) : d;
            if (descendant && typeof descendant === "object") chain.push(descendant);
          }
        }
      }
      for (const f of chain) {
        const fdRef = f["/FontDescriptor"];
        if (typeof fdRef !== "string") continue;
        const key = normRef(fdRef);
        let names = liveDescriptorBaseFonts.get(key);
        if (!names) liveDescriptorBaseFonts.set(key, (names = new Set()));
        for (const n of [topBase, cleanFontName(f["/BaseFont"])]) {
          if (n) names.add(n);
        }
      }
    };
    const collectFontResourceDict = (dictOrRef: any): void => {
      const dict = typeof dictOrRef === "string" ? resolveRef(dictOrRef, objects) : dictOrRef;
      if (!dict || typeof dict !== "object" || Array.isArray(dict)) return;
      for (const v of Object.values(dict)) {
        recordFontChain(typeof v === "string" ? resolveRef(v, objects) : v);
      }
    };
    const scanForFontResources = (node: any, depth: number): void => {
      if (!node || typeof node !== "object" || depth > 12) return;
      if (Array.isArray(node)) {
        for (const el of node) scanForFontResources(el, depth + 1);
        return;
      }
      for (const [k, v] of Object.entries(node)) {
        if (k === "/Font") collectFontResourceDict(v);
        else scanForFontResources(v, depth + 1);
      }
    };
    for (const obj of Object.values(objects)) scanForFontResources(obj, 0);

    // Image XObjects, collected as refs so mask streams can be subtracted
    // after the walk: /SMask (soft masks) and stream-form /Mask entries are
    // themselves Image XObjects, but they are channels OF a visible image,
    // not additional images — counting them would double-report.
    const imageXObjectRefs = new Set<string>();
    // /Width and /Height per image XObject, for the text-line-shape test below.
    const imageDims = new Map<string, { width: number; height: number }>();
    const maskRefs = new Set<string>();

    // Note /ID census scratch (v1.92.0, Matterhorn 19): IDs collected during
    // the walk; duplicates counted after it.
    const noteIds: string[] = [];
    // Unmapped-custom-tag census scratch (Matterhorn 02-001): unique final
    // tags, capped so a pathological file cannot grow the report payload.
    const unmappedTagSet = new Set<string>();
    const MAX_UNMAPPED_TAGS = 12;

    // Struct-tree reachability. Authoring tools (notably InDesign → Acrobat)
    // leave behind phantom struct objects — headings, lists, tables, figures
    // that carry /S but are not part of the live structure tree: they have no
    // /P parent AND are named by no element's /K. A screen reader never reaches
    // them, so counting them as real structure (a missing-alt figure, an
    // "incomplete" list, a phantom table) is a false positive. Build the set of
    // every ref named as a child inside any /K in a pre-pass so reachability can
    // be decided as the main walk below collects each structure element.
    const referencedStructRefs = new Set<string>();
    // Annotations some structure element references via an OBJR kid — the
    // "claimed by the tag tree" set the widget/annotation censuses (v1.94.0,
    // Matterhorn 28) test membership against. Collected in the SAME pre-pass
    // as struct-kid reachability.
    const structReferencedAnnotRefs = new Set<string>();
    let docHasStructTree = false;
    for (const obj of Object.values(objects)) {
      const o = obj as any;
      if (!o || typeof o !== "object") continue;
      if (o["/K"] !== undefined)
        collectStructKidRefs(o["/K"], referencedStructRefs, structReferencedAnnotRefs, objects);
      // Orphan-pruning is only meaningful when a structure tree exists to be
      // reachable from. Without a StructTreeRoot there is no "live tree", so
      // nothing is pruned (this is also why the parser's unit fixtures, which
      // omit the root, are unaffected).
      if (o["/Type"] === "/StructTreeRoot" || o["/StructTreeRoot"] !== undefined) {
        docHasStructTree = true;
      }
    }

    // The elements the live tree actually reaches, walked from the root. A
    // back-pointer is not reachability: an element inside a DETACHED subtree
    // carries a /P and is named by its orphaned parent's /K, and both of the
    // weaker tests above accept it. See collectLiveStructRefs.
    const liveStructRefs = docHasStructTree
      ? collectLiveStructRefs(findStructTreeRoot(objects), objects)
      : new Set<string>();

    // Walk all objects looking for key structures
    for (const [ref, obj] of Object.entries(objects)) {
      if (!obj || typeof obj !== "object") continue;
      const o = obj as any;

      // Check for StructTreeRoot
      if (o["/Type"] === "/StructTreeRoot" || o["/StructTreeRoot"]) {
        result.hasStructTree = true;
      }

      // Check catalog for StructTreeRoot, Lang, Outlines, MarkInfo, RoleMap
      if (o["/Type"] === "/Catalog") {
        if (o["/StructTreeRoot"]) result.hasStructTree = true;
        if (o["/Lang"]) {
          result.hasLang = true;
          // Resolve indirect refs, then strip QPDF's "u:" Unicode prefix.
          const langValue = resolveScalar(o["/Lang"]);
          result.lang = typeof langValue === "string" ? langValue.replace(/^u:/, "") : null;
        }
        if (o["/Outlines"]) result.hasOutlines = true;
        if (o["/AcroForm"]) {
          result.hasAcroForm = true;
          const acroForm =
            typeof o["/AcroForm"] === "string"
              ? resolveRef(o["/AcroForm"], objects)
              : o["/AcroForm"];
          if (acroForm?.["/XFA"] !== undefined) result.hasXfa = true;
        }
        // Viewer preferences — DisplayDocTitle decides whether conforming
        // viewers show the metadata title or the filename (WCAG 2.4.2 / PDF18).
        if (o["/ViewerPreferences"]) {
          const prefs =
            typeof o["/ViewerPreferences"] === "string"
              ? resolveRef(o["/ViewerPreferences"], objects)
              : o["/ViewerPreferences"];
          const ddt = resolveScalar(prefs?.["/DisplayDocTitle"]);
          if (typeof ddt === "boolean") {
            result.displayDocTitle = ddt;
          }
        }
        // Dynamic-XFA marker (see QpdfResult.needsRendering).
        if (o["/NeedsRendering"] !== undefined) {
          result.needsRendering = resolveScalar(o["/NeedsRendering"]) === true;
        }
        // Document-level JavaScript name tree (v1.92.0 — Matterhorn 29
        // territory): /Names → /JavaScript. Presence only; the scripts'
        // accessibility is a human judgment.
        if (o["/Names"]) {
          const names =
            typeof o["/Names"] === "string" ? resolveRef(o["/Names"], objects) : o["/Names"];
          if (names && typeof names === "object" && names["/JavaScript"] !== undefined) {
            result.hasJsNameTree = true;
          }
        }
        // Optional content (layers — Matterhorn 20). The default /D config
        // and every /Configs entry must carry a /Name (20-001) and must not
        // auto-switch content via /AS (20-002). Both are cheap object reads.
        if (o["/OCProperties"]) {
          const ocProps =
            typeof o["/OCProperties"] === "string"
              ? resolveRef(o["/OCProperties"], objects)
              : o["/OCProperties"];
          if (ocProps && typeof ocProps === "object") {
            result.hasOptionalContent = true;
            const configs: any[] = [];
            const dConfig =
              typeof ocProps["/D"] === "string"
                ? resolveRef(ocProps["/D"], objects)
                : ocProps["/D"];
            if (dConfig && typeof dConfig === "object") configs.push(dConfig);
            const extra = ocProps["/Configs"];
            const extraArr = Array.isArray(extra) ? extra : [];
            for (const c of extraArr) {
              const cfg = typeof c === "string" ? resolveRef(c, objects) : c;
              if (cfg && typeof cfg === "object") configs.push(cfg);
            }
            for (const cfg of configs) {
              result.ocgConfigCount++;
              const name = resolveScalar(cfg["/Name"]);
              if (typeof name !== "string" || name.replace(/^u:/, "").trim() === "") {
                result.ocgConfigsMissingName++;
              }
              const as = cfg["/AS"];
              if (Array.isArray(as) ? as.length > 0 : as !== undefined) {
                result.ocgConfigsWithAS++;
              }
            }
          }
        }
        // MarkInfo — indicates document distinguishes marked content from artifacts
        if (o["/MarkInfo"]) {
          result.hasMarkInfo = true;
          const markInfo =
            typeof o["/MarkInfo"] === "string"
              ? resolveRef(o["/MarkInfo"], objects)
              : o["/MarkInfo"];
          if (markInfo?.["/Marked"] === true) {
            result.isMarkedContent = true;
          }
          if (markInfo?.["/Suspects"] === true) {
            result.suspectsFlag = true;
          }
        }
        // RoleMap — custom tag role mappings to standard PDF tags
        if (o["/RoleMap"]) {
          applyRoleMap(o["/RoleMap"]);
        }
        if (o["/StructTreeRoot"] && typeof o["/StructTreeRoot"] === "string") {
          const structTreeRoot = resolveRef(o["/StructTreeRoot"], objects);
          if (structTreeRoot?.["/RoleMap"]) {
            applyRoleMap(structTreeRoot["/RoleMap"]);
          }
        }
      }

      // Check StructTreeRoot for RoleMap (often lives here rather than catalog)
      if (o["/Type"] === "/StructTreeRoot" && o["/RoleMap"]) {
        applyRoleMap(o["/RoleMap"]);
      }

      // Page objects — check for /Tabs (tab order) and count pages
      if (o["/Type"] === "/Page") {
        result.totalPageCount++;
        if (o["/Tabs"]) {
          result.tabOrderPages++;
        }
      }

      // Font descriptors — check embedding. Only descriptors the reachability
      // census marked live are counted; the rest are remediation leftovers no
      // content stream can select (see the census above for why).
      if (o["/Type"] === "/FontDescriptor") {
        const liveNames = liveDescriptorBaseFonts.get(normRef(ref));
        if (liveNames) {
          const fontName =
            typeof o["/FontName"] === "string"
              ? o["/FontName"].replace(/^\//, "").replace(/^u:/, "")
              : "Unknown";
          const embedded =
            !!(o["/FontFile"] || o["/FontFile2"] || o["/FontFile3"]) ||
            type3DescriptorRefs.has(normRef(ref));
          result.fonts.push({ name: fontName, embedded, baseFonts: [...liveNames].sort() });
        }
      }

      // Count outline entries and collect titles
      if (o["/Type"] === "/Outlines" || (o["/First"] && o["/Last"] && !o["/Parent"])) {
        const titles: string[] = [];
        result.outlineCount = countOutlineEntries(o, objects, titles);
        result.outlineTitles = titles;
      }

      // Image XObjects (visible only after the stream-dict unwrap above)
      if (o["/Subtype"] === "/Image") {
        imageXObjectRefs.add(normRef(ref));
        const iw = o["/Width"];
        const ih = o["/Height"];
        if (typeof iw === "number" && typeof ih === "number") {
          imageDims.set(normRef(ref), { width: iw, height: ih });
        }
        if (typeof o["/SMask"] === "string") maskRefs.add(normRef(o["/SMask"]));
        if (typeof o["/Mask"] === "string") maskRefs.add(normRef(o["/Mask"]));
      }

      // JavaScript action dictionaries (v1.92.0 — Matterhorn 29 territory).
      // An action's /S names the ACTION TYPE, not a structure role; counted
      // here, independent of (and before) the structure-element branch below,
      // which such dicts also enter harmlessly (no structure tag matches).
      if (o["/S"] === "/JavaScript") {
        result.jsActionCount++;
      }

      // Multimedia annotations (Matterhorn 05/29 territory). Presence only —
      // whether the media carries captions/alternatives is a human judgment,
      // and the conformance gate discloses 1.2.x as not-assessed when any
      // exist. Sound OBJECTS carry /Type /Sound, never /Subtype /Sound, so
      // this subtype test counts annotations alone.
      switch (o["/Subtype"]) {
        case "/Screen":
          result.mediaAnnotationCounts.screen++;
          break;
        case "/Movie":
          result.mediaAnnotationCounts.movie++;
          break;
        case "/Sound":
          result.mediaAnnotationCounts.sound++;
          break;
        case "/RichMedia":
          result.mediaAnnotationCounts.richMedia++;
          break;
      }

      // Other annotations (v1.94.0 — Matterhorn 28): comments, highlights,
      // stamps, file attachments, … — everything that is not a link (censused
      // by pdfjs), a widget (above), a popup (a duplicate view of its parent
      // note), or a multimedia kind (censused above). Hidden/NoView are
      // exempt (PDF/UA 7.18.1); each visible one should be referenced from
      // the tag tree and carry a /Contents description (7.18.2).
      if (OTHER_ANNOT_SUBTYPES.has(o["/Subtype"]) && (o["/Type"] === "/Annot" || o["/Rect"])) {
        const flags = typeof o["/F"] === "number" ? o["/F"] : 0;
        if ((flags & 2) === 0 && (flags & 32) === 0) {
          result.otherAnnotationCount++;
          const subtypeName = String(o["/Subtype"]).replace(/^\//, "");
          result.otherAnnotationSubtypeCounts[subtypeName] =
            (result.otherAnnotationSubtypeCounts[subtypeName] ?? 0) + 1;
          if (!structReferencedAnnotRefs.has(normRef(ref))) {
            result.untaggedOtherAnnotationCount++;
          }
          const contents = o["/Contents"];
          const hasContents =
            typeof contents === "string" && decodeQpdfString(contents).trim() !== "";
          if (!hasContents) result.otherAnnotationsMissingContents++;
        }
      }

      // Reference XObjects (v1.94.0 — Matterhorn 30-001): a Form XObject
      // carrying /Ref imports content from another document, which PDF/UA
      // prohibits outright — the imported content's structure is unreachable.
      if (o["/Subtype"] === "/Form" && o["/Ref"] !== undefined) {
        result.refXObjectCount++;
      }

      // Embedded files (v1.94.0 — Matterhorn 21): every EMBEDDED /Filespec
      // should carry a /Desc so assistive technology can announce the
      // attachment. RB-review F6: /EF is required — a Filespec WITHOUT /EF
      // merely references an external file (a /GoToR target); counting those
      // sent users to an empty Attachments panel.
      if (o["/Type"] === "/Filespec" && o["/EF"]) {
        result.embeddedFileCount++;
        const desc = o["/Desc"];
        if (!(typeof desc === "string" && decodeQpdfString(desc).trim() !== "")) {
          result.embeddedFilesMissingDesc++;
        }
      }

      // Signature fields (v1.94.0 — Matterhorn 23): presence disclosure only
      // (23-001 is one of the protocol's two untestable conditions; the /TU
      // labeling of signature fields is already covered by the form census).
      if (o["/FT"] === "/Sig" && typeof o["/T"] === "string") {
        result.signatureFieldCount++;
      }

      // Metadata streams — check for PDF/UA identifier in XMP
      if (
        o["/Type"] === "/Metadata" ||
        (typeof o["/Subtype"] === "string" && o["/Subtype"] === "/XML")
      ) {
        // QPDF may expose metadata stream data; also check for pdfuaid in any string value
      }
      // Also check streams for pdfuaid (QPDF exposes stream data for metadata objects)
      const rawObj = rawObjects[ref];
      if (rawObj && typeof rawObj === "object") {
        const streamData = (rawObj as any).data;
        if (typeof streamData === "string" && streamData.includes("pdfuaid")) {
          result.hasPdfUaIdentifier = true;
          const partMatch =
            streamData.match(/pdfuaid:part[>\s]*(\d+)/i) ||
            streamData.match(/pdfuaid:part['"]?\s*[:=]\s*['"]?(\d+)/i);
          if (partMatch) result.pdfUaPart = partMatch[1];
        }
      }

      // Structure elements (headings, tables, lists, figures with alt).
      if (o["/S"]) {
        const tag = mapToStandardTag(o["/S"], roleMap);
        // Container tags (<Figure>, <L>, <Table>) are collected only if the
        // element is reachable in the live tree — it carries a /P parent, or
        // some element names it in a /K. An orphaned container with neither is a
        // phantom left behind by authoring tools (notably InDesign → Acrobat);
        // assistive tech never traverses it, so scoring it produces a false
        // finding (a missing-alt figure, an "incomplete structure" list, a
        // phantom table). Headings/paragraphs/MCIDs etc. are not gated: no
        // control document carries orphaned ones, and they are signal counts,
        // not container-level findings.
        // Reachable = the root's /K chain actually arrives here. The older
        // "has a /P, or somebody's /K names it" test stays as a fallback for
        // the case the walk found nothing at all (a root whose /K is absent or
        // unresolvable), so a parse quirk can never prune a whole document.
        const structReachable =
          !docHasStructTree ||
          (liveStructRefs.size > 0
            ? liveStructRefs.has(normRef(ref))
            : o["/P"] !== undefined || referencedStructRefs.has(normRef(ref)));
        // Headings
        if (
          tag === "/H" ||
          tag === "/H1" ||
          tag === "/H2" ||
          tag === "/H3" ||
          tag === "/H4" ||
          tag === "/H5" ||
          tag === "/H6"
        ) {
          result.headings.push({ level: tag.replace("/", ""), tag: o["/S"] });
        }
        // Tables — collected as candidates; nested ones are filtered after the
        // loop so they don't inflate the top-level table/row counts. The ref
        // is normalized because it is later compared against value-side refs
        // collected from /K arrays ("N 0 R", never "obj:N 0 R").
        if (tag === "/Table" && structReachable) {
          tableCandidates.push({ ref: normRef(ref), obj: o });
        }
        // Lists
        if (tag === "/L" && structReachable) {
          result.lists.push(analyzeList(o, objects, roleMap));
        }
        // Paragraphs
        if (tag === "/P") {
          result.paragraphCount++;
        }
        // Artifact structure elements
        if (tag === "/Artifact") {
          result.artifactCount++;
        }
        // ActualText — screen reader text overrides
        if (o["/ActualText"] !== undefined) {
          result.actualTextCount++;
        }
        // Expansion text — abbreviation expansions for screen readers
        if (o["/E"] !== undefined) {
          result.expansionTextCount++;
        }
        // Language spans — structure elements with their own /Lang
        if (o["/Lang"] && tag && tag !== "/Document") {
          const spanLang = typeof o["/Lang"] === "string" ? o["/Lang"].replace(/^u:/, "") : null;
          if (spanLang) {
            result.langSpans.push({ lang: spanLang, tag: tag.slice(1) });
          }
        }
        // Figures with a text alternative. /Alt is the primary carrier, but
        // ISO 32000 also allows /ActualText as replacement text (Matterhorn
        // 13-004 fails only when NEITHER is present) — LaTeX and remediation
        // tools emit ActualText-only figures for formulas and logos.
        if (tag === "/Figure" && structReachable) {
          const rawAlt = o["/Alt"];
          const rawActual = o["/ActualText"];
          const altText =
            typeof rawAlt === "string" && decodeQpdfString(rawAlt) !== ""
              ? decodeQpdfString(rawAlt)
              : typeof rawActual === "string" && decodeQpdfString(rawActual) !== ""
                ? decodeQpdfString(rawActual)
                : undefined;
          const hasAlt = altText !== undefined;
          result.images.push({ ref: normRef(ref), hasAlt, altText });
        }

        // Formulas (v1.92.0 — Matterhorn 17). Same Alt-or-ActualText doctrine
        // as figures: a formula's glyphs rarely extract as speakable text, so
        // one with NEITHER is machine-certain missing non-text-content
        // alternative (asserted as 1.1.1 by the conformance gate).
        if (tag === "/Formula" && structReachable) {
          result.formulaCount++;
          const fAlt = o["/Alt"];
          const fActual = o["/ActualText"];
          const hasFormulaAlt =
            (typeof fAlt === "string" && decodeQpdfString(fAlt).trim() !== "") ||
            (typeof fActual === "string" && decodeQpdfString(fActual).trim() !== "");
          if (!hasFormulaAlt) result.formulasMissingAlt++;
        }

        // Notes (v1.92.0 — Matterhorn 19): footnotes/endnotes tagged <Note>
        // must carry an /ID (19-003), unique across the document (19-004) —
        // Word footnote exports trip this constantly in PAC. Advisory-only
        // downstream (weak WCAG mapping), but measured, not silent.
        if (tag === "/Note" && structReachable) {
          result.noteCount++;
          const rawId = o["/ID"];
          if (typeof rawId === "string" && rawId.replace(/^[ub]:/, "").trim() !== "") {
            // RB-3 (v1.94.0 red/blue): hold at most 256 chars per ID for the
            // uniqueness check — a hostile PDF can make each /ID megabytes,
            // and N of those held together is a memory amplifier. A 256-char
            // prefix collision is a duplicate for every real-world ID scheme.
            noteIds.push(rawId.slice(0, 256));
          } else {
            result.notesMissingId++;
          }
        }

        // RoleMap-validity census (Matterhorn 02-001): a structure element
        // whose (transitively) mapped tag still isn't a standard structure
        // type is unrecognized semantics — AT has nothing to announce it as.
        // Gated on structural evidence so ACTION dictionaries — whose /S
        // names the action type (/JavaScript, /URI, /GoTo) — and other
        // /S-bearing non-structure dicts never pollute the census.
        const looksLikeStructElem =
          o["/Type"] === "/StructElem" ||
          o["/P"] !== undefined ||
          o["/K"] !== undefined ||
          o["/Pg"] !== undefined;
        if (
          looksLikeStructElem &&
          tag &&
          !STANDARD_STRUCT_TYPES.has(tag) &&
          unmappedTagSet.size < MAX_UNMAPPED_TAGS
        ) {
          unmappedTagSet.add(tag.replace(/^\//, ""));
        }

        // Collect MCIDs for reading order
        collectMCIDs(o, result.contentOrder);
      }

      // Form fields. Two layouts exist:
      //   merged — one dict is both the field (/T, /TU) and the widget; count it.
      //   split  — the field dict holds /T and /TU, and each option/appearance
      //            is a kid /Widget with only /Parent. The kid widgets of one
      //            field (e.g. every option of a radio group) must collapse
      //            into ONE field, with /TU read from the parent chain —
      //            otherwise each option is falsely reported as an unlabeled
      //            field.
      if (o["/Type"] === "/Annot" && o["/Subtype"] === "/Widget") {
        // Widgets flagged Hidden (bit 2) or NoView (bit 6) are unreachable
        // by every user, assistive tech included — calc helpers, invisible
        // signature fields. Counting them produced confirmed "unlabeled
        // field" findings about controls no one can land on.
        const annotFlags = typeof o["/F"] === "number" ? o["/F"] : 0;
        if ((annotFlags & 2) !== 0 || (annotFlags & 32) !== 0) continue;
        // v1.94.0 (Matterhorn 28): is this visible widget claimed by the tag
        // tree via an OBJR? Same mechanics as the untagged-link census — a
        // screen reader following the tags in forms mode never reaches a
        // widget no structure element references.
        result.widgetAnnotationCount++;
        if (!structReferencedAnnotRefs.has(normRef(ref))) {
          result.untaggedWidgetAnnotationCount++;
        }
        if (typeof o["/T"] === "string") {
          // Merged field+widget dict — a terminal field in its own right.
          // Seed the seen-set: malformed-but-real PDFs sometimes give the
          // merged dict kid widgets whose /Parent points back at it, and the
          // kid walk must not count the same field a second time.
          if (!seenWidgetFieldRefs.has(normRef(ref))) {
            seenWidgetFieldRefs.add(normRef(ref));
            result.formFields.push({
              ref: normRef(ref),
              hasTU: !!o["/TU"],
              name: o["/T"].replace(/^u:/, ""),
            });
          }
        } else if (typeof o["/Parent"] === "string") {
          // Kid widget — walk up to the owning field (nearest ancestor with
          // /T) and credit that field once across all of its widgets.
          let fieldRef: string | null = null;
          let fieldDict: any = null;
          let hasTU = !!o["/TU"];
          let cursor = o["/Parent"] as string;
          for (let hop = 0; hop < 5 && typeof cursor === "string"; hop++) {
            const parent = resolveRef(cursor, objects);
            if (!parent) break;
            if (!hasTU && parent["/TU"]) hasTU = true;
            if (typeof parent["/T"] === "string") {
              fieldRef = normRef(cursor);
              fieldDict = parent;
              break;
            }
            cursor = parent["/Parent"];
          }
          if (fieldRef && fieldDict) {
            if (!seenWidgetFieldRefs.has(fieldRef)) {
              seenWidgetFieldRefs.add(fieldRef);
              result.formFields.push({
                ref: fieldRef,
                hasTU,
                name: fieldDict["/T"].replace(/^u:/, ""),
              });
            }
          } else {
            // Parent chain unresolvable — fall back to counting the widget.
            result.formFields.push({
              ref: normRef(ref),
              hasTU: !!o["/TU"],
              name: undefined,
            });
          }
        } else {
          // Orphan widget with no field dict at all — still a control a
          // screen reader user will land on; count it.
          result.formFields.push({
            ref: normRef(ref),
            hasTU: !!o["/TU"],
            name: undefined,
          });
        }
      }
    }

    const textLineCandidateWidths: number[] = [];
    for (const imageRef of imageXObjectRefs) {
      if (maskRefs.has(imageRef)) continue;
      result.imageObjectCount++;
      const dims = imageDims.get(imageRef);
      if (dims && isTextLineLikeImage(dims.width, dims.height)) {
        textLineCandidateWidths.push(dims.width);
      }
    }
    result.textLineLikeImageCount = countTextLineLikeImages(textLineCandidateWidths);

    // Note /ID uniqueness (Matterhorn 19-004): every occurrence beyond the
    // first of a given /ID value is a duplicate.
    if (noteIds.length > 0) {
      const seenIds = new Set<string>();
      for (const id of noteIds) {
        if (seenIds.has(id)) result.noteDuplicateIdCount++;
        else seenIds.add(id);
      }
    }
    result.roleMapUnmappedTags = [...unmappedTagSet].sort();

    // RoleMap validity diagnostics (v1.92.0 — Matterhorn 02-003 / 02-004),
    // computed from the FINAL accumulated map after the whole walk. Circular:
    // any source whose chain revisits a name. Standard remap: the map's
    // SOURCE side names a standard structure type — remapping standard types
    // is prohibited outright, whatever the target.
    //
    // RB-1 (v1.94.0 red/blue): both loops are BOUNDED against a hostile map.
    // Chain walks stop at 32 hops (matching mapToStandardTag's cap), and at
    // most 2,000 entries are examined — a legitimate RoleMap has a handful;
    // past the cap the census reports what it saw and stops, instead of
    // handing a quadratic O(entries × chain) to the main process.
    const MAX_ROLEMAP_DIAG_ENTRIES = 2000;
    const MAX_ROLEMAP_HOPS = 32;
    let diagExamined = 0;
    for (const [src, dst] of Object.entries(roleMap)) {
      if (diagExamined++ >= MAX_ROLEMAP_DIAG_ENTRIES) break;
      if (!src.startsWith("/") || typeof dst !== "string") continue;
      let cursor = src;
      const chainSeen = new Set<string>();
      for (let hop = 0; hop < MAX_ROLEMAP_HOPS; hop++) {
        if (roleMap[cursor] === undefined) break;
        if (chainSeen.has(cursor)) {
          result.roleMapCircularTags.push(src.replace(/^\//, ""));
          break;
        }
        chainSeen.add(cursor);
        cursor = roleMap[cursor];
      }
      if (STANDARD_STRUCT_TYPES.has(src)) {
        result.roleMapStandardRemaps.push(`${src.replace(/^\//, "")} → ${dst.replace(/^\//, "")}`);
      }
    }
    result.roleMapCircularTags.sort();
    result.roleMapStandardRemaps.sort();
    // Caps for the report payload: the census lists are evidence, not an
    // inventory — a hostile map must not bloat stored reports.
    if (result.roleMapCircularTags.length > 24) result.roleMapCircularTags.length = 24;
    if (result.roleMapStandardRemaps.length > 24) result.roleMapStandardRemaps.length = 24;

    // Resolve table candidates into top-level tables. A /Table that appears in
    // the subtree of another /Table is a nested table: the parent already
    // records it via analyzeTable's hasNestedTable flag, so it must not also be
    // reported as its own top-level table (which would over-count rows).
    const nestedTableRefs = new Set<string>();
    for (const candidate of tableCandidates) {
      collectDescendantTableRefs(candidate.obj, objects, roleMap, nestedTableRefs);
    }
    for (const candidate of tableCandidates) {
      if (nestedTableRefs.has(candidate.ref)) continue;
      result.tables.push(analyzeTable(candidate.obj, objects, roleMap));
    }

    // Also check for form fields via AcroForm. /AcroForm is usually an
    // indirect ref to the form dictionary, so resolve it before reading
    // /Fields; field refs are value-form ("N 0 R") and must be resolved via
    // resolveRef (the object map is keyed "obj:N 0 R" on qpdf ≥ 11).
    if (result.hasAcroForm) {
      const knownRefs = new Set(
        result.formFields.map((field) => field.ref).filter((ref): ref is string => !!ref),
      );
      for (const [_ref, obj] of Object.entries(objects)) {
        const o = obj as any;
        const acroForm =
          typeof o?.["/AcroForm"] === "string"
            ? resolveRef(o["/AcroForm"], objects)
            : o?.["/AcroForm"];
        if (acroForm?.["/Fields"]) {
          const fieldRefs = acroForm["/Fields"];
          if (Array.isArray(fieldRefs)) {
            for (const fieldRef of fieldRefs) {
              const fieldKey = typeof fieldRef === "string" ? fieldRef : fieldRef?.toString();
              if (!fieldKey || knownRefs.has(fieldKey)) continue;
              const field = resolveRef(fieldKey, objects) as any;
              if (field) {
                // Skip non-terminal container fields (kids are fields with
                // their own /T): the kid fields are counted individually, so
                // counting the container too would double-report.
                const kids = field["/Kids"];
                const isContainer =
                  Array.isArray(kids) &&
                  kids.some((k: any) => {
                    const kid = typeof k === "string" ? resolveRef(k, objects) : k;
                    return kid && typeof kid["/T"] === "string";
                  });
                if (isContainer) continue;
                const name =
                  typeof field["/T"] === "string" ? field["/T"].replace(/^u:/, "") : undefined;
                result.formFields.push({
                  ref: fieldKey,
                  hasTU: !!field["/TU"],
                  name,
                });
                knownRefs.add(fieldKey);
              }
            }
          }
        }
      }
    }

    // Calculate structure tree depth
    if (result.hasStructTree) {
      result.structTreeDepth = calculateTreeDepth(objects);
    }

    // Re-collect headings in document (reading) order by walking the structure
    // tree, rather than the object-number order produced by the flat scan
    // above. Object-number order is not reading order — e.g. an H1 tagged last
    // during remediation gets a high object number and would otherwise appear
    // at the END of the outline, and out-of-order levels can trigger false
    // "heading hierarchy skip" findings. Falls back to the flat-scan order when
    // the tree yields no headings (untagged/malformed input or test fixtures
    // whose elements are not linked into the tree).
    if (result.hasStructTree) {
      const orderedHeadings = collectHeadingsInOrder(objects, roleMap);
      if (orderedHeadings.length > 0) {
        result.headings = orderedHeadings;
      }
    }

    // Collect per-page MCID sequences from the structure tree. Used by the
    // scorer's reading-order check to compare logical (tag) order against
    // visual (content-stream) order. Only meaningful when a struct tree
    // exists — otherwise returns an empty map.
    if (result.hasStructTree) {
      const pageRefToNum = buildPageRefToNum(json, objects);
      const collected = collectStructTreeMcidsByPage(objects, pageRefToNum, roleMap);
      result.structTreeMcidsByPage = collected.byPage;
      result.figureMcidsByPage = collected.figureByPage;
    }
  } catch (err) {
    console.error("QPDF JSON parse error:", err);
    result.error = "Failed to parse QPDF structure data";
  }

  return result;
}

function resolveStructureMap(candidate: any, objects: any): Record<string, string> | null {
  const resolved = typeof candidate === "string" ? resolveRef(candidate, objects) : candidate;
  if (!resolved || typeof resolved !== "object") return null;

  const entries = Object.entries(resolved).filter(
    ([key, value]) => key.startsWith("/") && typeof value === "string",
  );

  if (entries.length === 0) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function countOutlineEntries(outline: any, objects: any, titles: string[]): number {
  let count = 0;
  const visited = new Set<string>();

  const walk = (node: any, depth: number) => {
    let current = node["/First"];
    while (current && typeof current === "string" && !visited.has(current)) {
      visited.add(current);
      count++;
      const entry = resolveRef(current, objects);
      if (!entry) break;
      const title = typeof entry["/Title"] === "string" ? entry["/Title"].replace(/^u:/, "") : "";
      if (title && titles.length < 50) {
        titles.push("  ".repeat(depth) + title);
      }
      // Count nested children recursively
      if (entry["/First"]) walk(entry, depth + 1);
      current = entry["/Next"];
    }
  };

  walk(outline, 0);
  return count;
}

function analyzeList(
  listObj: any,
  objects: any,
  roleMap: Record<string, string> = {},
): ListAnalysis {
  const result: ListAnalysis = {
    itemCount: 0,
    hasLabels: false,
    hasBodies: false,
    isWellFormed: false,
    nestingDepth: 0,
  };

  const resolve = (node: any): any => {
    if (typeof node === "string") return resolveRef(node, objects);
    return node && typeof node === "object" ? node : null;
  };

  let maxNesting = 0;
  let itemsWithBody = 0;

  // See analyzeTable's `visited` note: a /K entry may name an ancestor or a
  // shared child, and re-expanding every path both double-counts <LI> items
  // and costs exponential time.
  const visited = new Set<any>();
  const walk = (node: any, depth: number, isCountingNesting: boolean): void => {
    if (depth > 15 || !node) return;
    const resolved = resolve(node);
    if (!resolved) return;
    if (visited.has(resolved)) return;
    visited.add(resolved);
    const tag = mapToStandardTag(resolved["/S"], roleMap);

    if (tag === "/LI") {
      result.itemCount++;
      // Check children for /Lbl and /LBody
      let hasLBody = false;
      const kids = resolved["/K"];
      if (kids) {
        const items = Array.isArray(kids) ? kids : [kids];
        for (const kid of items) {
          const kidResolved = resolve(kid);
          if (mapToStandardTag(kidResolved?.["/S"], roleMap) === "/Lbl") {
            result.hasLabels = true;
          }
          if (mapToStandardTag(kidResolved?.["/S"], roleMap) === "/LBody") {
            hasLBody = true;
            result.hasBodies = true;
          }
        }
      }
      if (hasLBody) itemsWithBody++;
    }

    if (tag === "/L" && isCountingNesting) {
      maxNesting = Math.max(maxNesting, depth);
    }

    const childKids = resolved["/K"];
    if (!childKids) return;
    const items = Array.isArray(childKids) ? childKids : [childKids];
    for (const item of items) {
      if (
        typeof item === "number" ||
        (item && typeof item === "object" && item["/MCID"] !== undefined)
      )
        continue;
      walk(item, depth + 1, true);
    }
  };

  walk(listObj, 0, false);
  result.nestingDepth = maxNesting;
  // Well-formed = every <LI> has an <LBody>. <Lbl> is deliberately NOT
  // required: ISO 32000 permits items without a separate label (common
  // tooling emits LBody-only items), so missing <Lbl> is an advisory signal
  // (hasLabels) — not grounds for a confirmed structural failure.
  result.isWellFormed = result.itemCount > 0 && itemsWithBody === result.itemCount;

  return result;
}

/**
 * Walk a /K value and record every struct-element reference ("N 0 R") it names
 * as a direct child. /K may be a single ref string, an MCID integer, or an array
 * mixing refs, MCID integers, and MCR/OBJR dicts. Bare "N 0 R" strings feed the
 * struct-reachability set; MCID integers and MCR dicts are deliberately not
 * descended. OBJR dicts point at ANNOTATIONS, not struct children — their /Obj
 * refs feed the separate `annotRefs` set (v1.94.0), which is how the widget
 * and annotation censuses know an annotation is claimed by the tag tree.
 *
 * RB-review F1 (v1.94.0): OBJRs are collected in EVERY legal serialization,
 * not just the inline-dict-in-array shape Acrobat writes — a string /K kid is
 * ALSO resolved one level so an indirectly-written OBJR object, a /K pointing
 * at an indirect kids ARRAY, and an inline struct-elem kid carrying its own
 * /K all contribute. Missing any of these made a correctly tagged form read
 * as "every widget untagged" → a FALSE confirmed 1.3.1. Depth-capped and
 * cycle-guarded; `objects` may be absent in the legacy two-arg call shape
 * (none remain in-tree, but the resolution is skipped safely if so).
 */
function collectStructKidRefs(
  k: unknown,
  out: Set<string>,
  annotRefs?: Set<string>,
  objects?: Record<string, any>,
  depth = 0,
  seen?: Set<unknown>,
): void {
  if (depth > 12) return;
  const visited = seen ?? new Set<unknown>();
  if (typeof k === "string" && /^\d+ \d+ R$/.test(k)) {
    out.add(normRef(k));
    // Resolve ONE level: the target may be an OBJR written as an indirect
    // object, or an indirect kids array. A struct-elem target's own /K is
    // handled by the pre-pass when it visits that object directly.
    if (objects && annotRefs) {
      const resolved = resolveRef(k, objects);
      if (Array.isArray(resolved)) {
        // The array branch below carries its own visited-guard; adding here
        // FIRST would make that guard bounce the very first visit.
        collectStructKidRefs(resolved, out, annotRefs, objects, depth + 1, visited);
      } else if (
        resolved &&
        typeof resolved === "object" &&
        resolved["/Type"] === "/OBJR" &&
        typeof resolved["/Obj"] === "string"
      ) {
        annotRefs.add(normRef(resolved["/Obj"]));
      }
    }
  } else if (Array.isArray(k)) {
    if (visited.has(k)) return;
    visited.add(k);
    for (const item of k) collectStructKidRefs(item, out, annotRefs, objects, depth + 1, visited);
  } else if (k && typeof k === "object") {
    const kid = k as any;
    if (kid["/Type"] === "/OBJR" && typeof kid["/Obj"] === "string" && annotRefs) {
      annotRefs.add(normRef(kid["/Obj"]));
    } else if (kid["/K"] !== undefined && !visited.has(kid)) {
      // An INLINE struct-element kid: the pre-pass never sees it as a
      // top-level object, so its own /K (which may hold OBJRs) is walked
      // here. MCR dicts (which carry /MCID) never reach this branch's
      // recursion in a harmful way — they have no /K.
      visited.add(kid);
      collectStructKidRefs(kid["/K"], out, annotRefs, objects, depth + 1, visited);
    }
  }
}

function collectMCIDs(obj: any, mcids: number[]): void {
  const kids = obj["/K"];
  if (kids === undefined) return;
  if (typeof kids === "number") {
    mcids.push(kids);
    return;
  }
  if (Array.isArray(kids)) {
    for (const kid of kids) {
      if (typeof kid === "number") {
        mcids.push(kid);
      } else if (kid && typeof kid === "object") {
        if (kid["/MCID"] !== undefined) {
          mcids.push(kid["/MCID"]);
        }
        collectMCIDs(kid, mcids);
      }
    }
  }
}

function calculateTreeDepth(objects: any): number {
  let maxDepth = 0;

  // Cycle/DAG guard. Without it a single /K entry naming an ancestor makes
  // this descend to the depth-50 cap and report a shallow tree as "richly
  // nested" — while costing fanout^50 work in the main process. A real
  // structure tree is a tree (every StructElem carries exactly one /P), so
  // visiting each element once measures the true depth.
  const visited = new Set<any>();
  const measure = (node: any, depth: number): void => {
    if (depth > 50) return; // safety limit
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    maxDepth = Math.max(maxDepth, depth);
    const kids = node?.["/K"];
    if (!kids) return;
    if (Array.isArray(kids)) {
      for (const kid of kids) {
        if (typeof kid === "string") {
          const child = resolveRef(kid, objects);
          if (child) measure(child, depth + 1);
        } else if (kid && typeof kid === "object") {
          measure(kid, depth + 1);
        }
      }
    } else if (typeof kids === "string") {
      const child = resolveRef(kids, objects);
      if (child) measure(child, depth + 1);
    }
  };

  const root = findStructTreeRoot(objects);
  if (root) measure(root, 0);

  return maxDepth;
}

// Build page-ref → 1-indexed page-number map. QPDF v2 JSON exposes a top-level
// `pages` array in document order with { object, pageposfrom1 }; prefer that
// when available. Fall back to walking the /Pages tree from the catalog for
// older QPDF output shapes.
function buildPageRefToNum(json: any, objects: Record<string, any>): Map<string, number> {
  const map = new Map<string, number>();

  if (Array.isArray(json?.pages)) {
    for (const page of json.pages) {
      const ref = typeof page?.object === "string" ? page.object : null;
      const pos = typeof page?.pageposfrom1 === "number" ? page.pageposfrom1 : null;
      if (ref && pos !== null) map.set(ref, pos);
    }
    if (map.size > 0) return map;
  }

  // Fallback: find /Catalog → /Pages → walk /Kids tree in document order.
  let catalog: any = null;
  for (const obj of Object.values(objects)) {
    if ((obj as any)?.["/Type"] === "/Catalog") {
      catalog = obj;
      break;
    }
  }
  if (!catalog) return map;

  const rootPagesRef = catalog["/Pages"];
  const rootPages =
    typeof rootPagesRef === "string" ? resolveRef(rootPagesRef, objects) : rootPagesRef;
  if (!rootPages) return map;

  let pageCounter = 0;
  // A /Pages node whose /Kids names an ancestor otherwise recurses until the
  // stack overflows; parseQpdfJson's catch swallows the RangeError and
  // discards the ENTIRE structural analysis, reporting a tagged document as
  // unparseable. (This fallback runs only when qpdf omits the top-level
  // `pages` array — e.g. the exit-3 warning-recovery path.)
  const visited = new Set<any>();
  const walk = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    const type = node?.["/Type"];
    if (type === "/Page") {
      // Find the ref for this object by matching in objects dict. The key is
      // normalized so lookups by /Pg value refs ("N 0 R") resolve on qpdf ≥ 11.
      for (const [ref, candidate] of Object.entries(objects)) {
        if (candidate === node) {
          pageCounter++;
          map.set(normRef(ref), pageCounter);
          return;
        }
      }
      return;
    }
    if (type === "/Pages") {
      const kids = node["/Kids"];
      if (Array.isArray(kids)) {
        for (const kid of kids) {
          if (typeof kid === "string") {
            const child = resolveRef(kid, objects);
            if (child) walk(child);
          } else if (kid && typeof kid === "object") {
            walk(kid);
          }
        }
      }
    }
  };
  walk(rootPages);

  return map;
}

// Walk the structure tree in document order and emit MCIDs grouped by page.
//   - Bare MCID numbers inside /K arrays inherit the nearest enclosing /Pg.
//   - MCR dicts ({/Type /MCR, /MCID n, /Pg <ref>}) may override the page.
//   - OBJR dicts reference non-content objects (annotations) and are skipped.
//   - Nested struct element kids (inline dicts or indirect refs) recurse.
// Pages that end up with no MCIDs are absent from the returned map.
function collectStructTreeMcidsByPage(
  objects: Record<string, any>,
  pageRefToNum: Map<string, number>,
  roleMap: Record<string, string>,
): { byPage: Record<number, number[]>; figureByPage: Record<number, number[]> } {
  const out: Record<number, number[]> = {};
  // MCIDs that are DIRECT content of /Figure elements (role-mapped figures
  // included). The fidelity metric excludes these — image paint order is a
  // z-order concern, not reading order (see QpdfResult.figureMcidsByPage).
  const figureOut: Record<number, number[]> = {};

  const root = findStructTreeRoot(objects);
  if (!root) return { byPage: out, figureByPage: figureOut };

  const pageStack: Array<number | null> = [];
  const visited = new Set<any>();

  const pushPg = (node: any): boolean => {
    if (node && typeof node === "object" && typeof node["/Pg"] === "string") {
      pageStack.push(pageRefToNum.get(node["/Pg"]) ?? null);
      return true;
    }
    return false;
  };

  const emit = (pageNum: number | null, mcid: number, isFigureContent: boolean): void => {
    if (pageNum === null) return;
    if (!Number.isInteger(mcid)) return;
    (out[pageNum] ??= []).push(mcid);
    if (isFigureContent) (figureOut[pageNum] ??= []).push(mcid);
  };

  const walk = (node: any, depth: number): void => {
    if (depth > 200) return; // safety against pathological structure trees
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return; // cycle guard
    visited.add(node);

    const pushed = pushPg(node);
    const currentPage = pageStack.length ? pageStack[pageStack.length - 1] : null;
    // Only the CURRENT element's role decides figure-ness — elements nested
    // inside a figure (captions) recurse with their own role, so their text
    // stays comparable in the fidelity metric.
    const isFigure = mapToStandardTag(node["/S"], roleMap) === "/Figure";

    const kids = node["/K"];

    const processKid = (kid: any): void => {
      if (typeof kid === "number") {
        emit(currentPage, kid, isFigure);
        return;
      }
      if (typeof kid === "string") {
        const child = resolveRef(kid, objects);
        if (child) walk(child, depth + 1);
        return;
      }
      if (kid && typeof kid === "object") {
        const kidType = kid["/Type"];
        // MCR: marked-content reference; may override /Pg.
        if (kidType === "/MCR" || kid["/MCID"] !== undefined) {
          const mcid = kid["/MCID"];
          const pgRef = typeof kid["/Pg"] === "string" ? kid["/Pg"] : null;
          const pgNum = pgRef ? (pageRefToNum.get(pgRef) ?? null) : currentPage;
          if (typeof mcid === "number") emit(pgNum, mcid, isFigure);
          return;
        }
        // OBJR: object reference (annotation, form field) — not content.
        if (kidType === "/OBJR") return;
        // Nested struct element.
        walk(kid, depth + 1);
      }
    };

    if (Array.isArray(kids)) {
      for (const kid of kids) processKid(kid);
    } else if (kids !== undefined) {
      processKid(kids);
    }

    if (pushed) pageStack.pop();
  };

  walk(root, 0);
  return { byPage: out, figureByPage: figureOut };
}
