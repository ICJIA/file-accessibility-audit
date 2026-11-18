/**
 * The remediation pipeline's metadata step (user decision 2026-11-18):
 * set the document title, the document language and "show the title"
 * (ViewerPreferences/DisplayDocTitle) on the tagged output.
 *
 * WHY. Title/language is the most common WCAG failure in the test corpus
 * (56 of 80 failing files; the ONLY failure in 15), and auto-tagging never
 * touches it — OpenDataLoader cannot know a document's title. The values
 * come from the person who asked for the repair (the remediation form,
 * prefilled from the document's own values), so nothing is guessed.
 *
 * HOW — qpdf, already on every server (no new dependency). `qpdf --json=2`
 * reads the trailer, the catalog and the Info dictionary; `--update-from-json`
 * writes them back. An update REPLACES a whole object, so every existing key
 * is copied and only /Title, /Lang and /DisplayDocTitle change (a first
 * attempt that wrote only those keys produced "unable to find page tree").
 * Strings are written as qpdf's "u:" (Unicode) form, so any title survives.
 *
 * Not touched: the XMP metadata stream. PDF/UA wants dc:title there too;
 * PDF/UA is reported, not scored, and rewriting XMP safely is a separate
 * piece of work — the job receipt records that this step left it alone.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { buildChildSpawnEnv } from "./childSpawnEnv.js";

const execFileAsync = promisify(execFile);

/** The request file the route writes beside the upload (work/), read and
 *  deleted by the worker's metadata step. */
export const DOC_METADATA_FILE = "doc-metadata.json";

/** Longest title accepted from the form — a title, not a paragraph. */
export const MAX_TITLE_CHARS = 200;

export interface DocMetadataRequest {
  /** The title to write, or null to keep the document's own. */
  title: string | null;
  /** A BCP 47 language tag ("en-US"), or null to keep the document's own. */
  language: string | null;
}

export interface DocMetadataResult {
  titleSet: boolean;
  languageSet: boolean;
  displayDocTitleSet: boolean;
}

/** Validate the form's values. Returns the cleaned request, or an error
 *  message for a 400. Whitespace is collapsed; control characters refused. */
export function parseDocMetadataRequest(
  rawTitle: unknown,
  rawLanguage: unknown,
): DocMetadataRequest | { error: string } {
  let title: string | null = null;
  if (typeof rawTitle === "string" && rawTitle.trim() !== "") {
    title = rawTitle.replace(/\s+/g, " ").trim();
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(title))
      return { error: "The title contains control characters." };
    if (title.length > MAX_TITLE_CHARS) {
      return { error: `The title is longer than ${MAX_TITLE_CHARS} characters.` };
    }
  }
  let language: string | null = null;
  if (typeof rawLanguage === "string" && rawLanguage.trim() !== "") {
    language = rawLanguage.trim();
    // BCP 47 shape: a 2–3 letter primary subtag, then optional subtags.
    if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8}){0,3}$/.test(language)) {
      return { error: "The language must be a language code such as en-US." };
    }
  }
  return { title, language };
}

type JsonDict = Record<string, unknown>;

const isRef = (v: unknown): v is string => typeof v === "string" && / \d+ R$/.test(v);

async function qpdfJson(path: string, timeoutMs: number): Promise<JsonDict> {
  const { stdout } = await execFileAsync("qpdf", ["--json=2", "--json-key=qpdf", path], {
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
    env: buildChildSpawnEnv(),
  });
  const parsed = JSON.parse(stdout) as { qpdf?: unknown[] };
  const objects = parsed.qpdf?.[1];
  if (!objects || typeof objects !== "object") throw new Error("qpdf JSON had no objects");
  return objects as JsonDict;
}

function objectValue(objects: JsonDict, ref: string): JsonDict | null {
  const entry = objects[`obj:${ref}`] as { value?: unknown } | undefined;
  return entry?.value && typeof entry.value === "object" && !Array.isArray(entry.value)
    ? (entry.value as JsonDict)
    : null;
}

function maxObjectId(objects: JsonDict): number {
  let max = 0;
  for (const key of Object.keys(objects)) {
    const m = key.match(/^obj:(\d+) \d+ R$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Write title / language / DisplayDocTitle from `inPath` to `outPath`.
 * DisplayDocTitle is set whenever the output will have a title (a title the
 * viewer does not show is announced as the file name — the same failure).
 */
export async function applyPdfDocMetadata(
  inPath: string,
  outPath: string,
  req: DocMetadataRequest,
  timeoutMs = 60_000,
): Promise<DocMetadataResult> {
  const objects = await qpdfJson(inPath, timeoutMs);
  const trailer = (objects.trailer as { value?: JsonDict } | undefined)?.value;
  if (!trailer || !isRef(trailer["/Root"])) throw new Error("PDF has no catalog reference");
  const rootRef = trailer["/Root"] as string;
  const catalog = objectValue(objects, rootRef);
  if (!catalog) throw new Error("PDF catalog could not be read");

  const updates: JsonDict = {};
  let nextId = maxObjectId(objects);
  const newCatalog: JsonDict = { ...catalog };
  const result: DocMetadataResult = {
    titleSet: false,
    languageSet: false,
    displayDocTitleSet: false,
  };

  // --- Title (Info dictionary) ---
  const infoRef = isRef(trailer["/Info"]) ? (trailer["/Info"] as string) : null;
  const info = infoRef ? objectValue(objects, infoRef) : null;
  const hasTitle =
    typeof info?.["/Title"] === "string" &&
    (info["/Title"] as string).replace(/^u:|^b:/, "").trim() !== "";
  if (req.title) {
    const newInfo: JsonDict = { ...(info ?? {}), "/Title": `u:${req.title}` };
    if (infoRef) {
      updates[`obj:${infoRef}`] = { value: newInfo };
    } else {
      nextId += 1;
      const ref = `${nextId} 0 R`;
      updates[`obj:${ref}`] = { value: newInfo };
      updates.trailer = { value: { ...trailer, "/Info": ref } };
    }
    result.titleSet = true;
  }

  // --- Language (catalog /Lang) ---
  if (req.language) {
    newCatalog["/Lang"] = `u:${req.language}`;
    result.languageSet = true;
  }

  // --- DisplayDocTitle (catalog /ViewerPreferences) ---
  if (req.title || hasTitle) {
    const vp = catalog["/ViewerPreferences"];
    if (isRef(vp)) {
      const vpValue = objectValue(objects, vp) ?? {};
      updates[`obj:${vp}`] = { value: { ...vpValue, "/DisplayDocTitle": true } };
    } else {
      const vpValue = vp && typeof vp === "object" && !Array.isArray(vp) ? (vp as JsonDict) : {};
      newCatalog["/ViewerPreferences"] = { ...vpValue, "/DisplayDocTitle": true };
    }
    result.displayDocTitleSet = true;
  }

  updates[`obj:${rootRef}`] = { value: newCatalog };

  const updatePath = `${outPath}.update.json`;
  const header = {
    jsonversion: 2,
    pushedinheritedpageresources: false,
    calledgetallpages: false,
    maxobjectid: nextId,
  };
  await fs.writeFile(updatePath, JSON.stringify({ qpdf: [header, updates] }), { mode: 0o600 });
  try {
    try {
      await execFileAsync("qpdf", [inPath, `--update-from-json=${updatePath}`, outPath], {
        maxBuffer: 16 * 1024 * 1024,
        timeout: timeoutMs,
        env: buildChildSpawnEnv(),
      });
    } catch (e: unknown) {
      // Exit 3 = written with warnings: the output exists and is valid.
      const code = (e as { code?: number }).code;
      if (code !== 3) throw e;
    }
  } finally {
    await fs.rm(updatePath, { force: true });
  }
  return result;
}
