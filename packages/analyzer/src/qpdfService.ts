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
  collectHeadingsInOrder,
  analyzeTable,
  type TableAnalysis,
} from "./qpdfStructTree.js";
export type { TableAnalysis };

const QPDF_BIN =
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
  fonts: Array<{ name: string; embedded: boolean }>;
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

function emptyQpdfResult(error: string | null): QpdfResult {
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
  const result: QpdfResult = emptyQpdfResult(null);

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

    // Image XObjects, collected as refs so mask streams can be subtracted
    // after the walk: /SMask (soft masks) and stream-form /Mask entries are
    // themselves Image XObjects, but they are channels OF a visible image,
    // not additional images — counting them would double-report.
    const imageXObjectRefs = new Set<string>();
    const maskRefs = new Set<string>();

    // Struct-tree reachability. Authoring tools (notably InDesign → Acrobat)
    // leave behind phantom struct objects — headings, lists, tables, figures
    // that carry /S but are not part of the live structure tree: they have no
    // /P parent AND are named by no element's /K. A screen reader never reaches
    // them, so counting them as real structure (a missing-alt figure, an
    // "incomplete" list, a phantom table) is a false positive. Build the set of
    // every ref named as a child inside any /K in a pre-pass so reachability can
    // be decided as the main walk below collects each structure element.
    const referencedStructRefs = new Set<string>();
    let docHasStructTree = false;
    for (const obj of Object.values(objects)) {
      const o = obj as any;
      if (!o || typeof o !== "object") continue;
      if (o["/K"] !== undefined) collectStructKidRefs(o["/K"], referencedStructRefs);
      // Orphan-pruning is only meaningful when a structure tree exists to be
      // reachable from. Without a StructTreeRoot there is no "live tree", so
      // nothing is pruned (this is also why the parser's unit fixtures, which
      // omit the root, are unaffected).
      if (o["/Type"] === "/StructTreeRoot" || o["/StructTreeRoot"] !== undefined) {
        docHasStructTree = true;
      }
    }

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
            typeof o["/AcroForm"] === "string" ? resolveRef(o["/AcroForm"], objects) : o["/AcroForm"];
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

      // Font descriptors — check embedding
      if (o["/Type"] === "/FontDescriptor") {
        const fontName =
          typeof o["/FontName"] === "string"
            ? o["/FontName"].replace(/^\//, "").replace(/^u:/, "")
            : "Unknown";
        const embedded =
          !!(o["/FontFile"] || o["/FontFile2"] || o["/FontFile3"]) ||
          type3DescriptorRefs.has(normRef(ref));
        result.fonts.push({ name: fontName, embedded });
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
        if (typeof o["/SMask"] === "string") maskRefs.add(normRef(o["/SMask"]));
        if (typeof o["/Mask"] === "string") maskRefs.add(normRef(o["/Mask"]));
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
        const structReachable =
          !docHasStructTree ||
          o["/P"] !== undefined ||
          referencedStructRefs.has(normRef(ref));
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

    for (const imageRef of imageXObjectRefs) {
      if (!maskRefs.has(imageRef)) result.imageObjectCount++;
    }

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
      result.structTreeMcidsByPage = collectStructTreeMcidsByPage(objects, pageRefToNum);
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

  const walk = (node: any, depth: number, isCountingNesting: boolean): void => {
    if (depth > 15 || !node) return;
    const resolved = resolve(node);
    if (!resolved) return;
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
 * mixing refs, MCID integers, and MCR/OBJR dicts. Only direct child refs matter
 * for figure reachability, so bare "N 0 R" strings (at the top level or inside a
 * /K array) are collected; MCID integers and MCR/OBJR dicts (whose /Pg and /Obj
 * refs point at content, not struct children) are deliberately not descended.
 */
function collectStructKidRefs(k: unknown, out: Set<string>): void {
  if (typeof k === "string" && /^\d+ \d+ R$/.test(k)) {
    out.add(normRef(k));
  } else if (Array.isArray(k)) {
    for (const item of k) collectStructKidRefs(item, out);
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

  const measure = (node: any, depth: number): void => {
    if (depth > 50) return; // safety limit
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

  for (const obj of Object.values(objects)) {
    if ((obj as any)?.["/Type"] === "/StructTreeRoot") {
      measure(obj, 0);
      break;
    }
  }

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
  const walk = (node: any): void => {
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
): Record<number, number[]> {
  const out: Record<number, number[]> = {};

  let root: any = null;
  for (const obj of Object.values(objects)) {
    if ((obj as any)?.["/Type"] === "/StructTreeRoot") {
      root = obj;
      break;
    }
  }
  if (!root) return out;

  const pageStack: Array<number | null> = [];
  const visited = new Set<any>();

  const pushPg = (node: any): boolean => {
    if (node && typeof node === "object" && typeof node["/Pg"] === "string") {
      pageStack.push(pageRefToNum.get(node["/Pg"]) ?? null);
      return true;
    }
    return false;
  };

  const emit = (pageNum: number | null, mcid: number): void => {
    if (pageNum === null) return;
    if (!Number.isInteger(mcid)) return;
    (out[pageNum] ??= []).push(mcid);
  };

  const walk = (node: any, depth: number): void => {
    if (depth > 200) return; // safety against pathological structure trees
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return; // cycle guard
    visited.add(node);

    const pushed = pushPg(node);
    const currentPage = pageStack.length ? pageStack[pageStack.length - 1] : null;

    const kids = node["/K"];

    const processKid = (kid: any): void => {
      if (typeof kid === "number") {
        emit(currentPage, kid);
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
          if (typeof mcid === "number") emit(pgNum, mcid);
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
  return out;
}
