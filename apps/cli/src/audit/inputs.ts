/**
 * Turning what was typed — files, folders, globs — into the list of documents
 * to audit.
 *
 * WHAT COUNTS AS A DOCUMENT is decided from the file's contents wherever the
 * engine can tell, not from its name alone:
 *
 *  - A file named on the command line is audited when its extension is a
 *    supported one OR its first bytes are a PDF's or a ZIP package's (every
 *    modern Office file is a ZIP). The engine then makes the real decision.
 *  - A file FOUND in a folder or by a glob is taken when its extension is a
 *    supported one. Anything else is looked at: a PDF header is enough; a ZIP
 *    is handed to the engine's own `detectFileType`, so an ordinary .zip or
 *    .jar in the tree is left alone rather than reported as a failed audit.
 */
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { detectFileType } from "@file-audit/analyzer";
import { UsageError } from "./types.js";

export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".pdf",
  ".docx",
  ".pptx",
  ".xlsx",
]);

/** Never descended into when walking a folder or expanding a glob. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules"]);

/** A ZIP larger than this is not opened just to see whether it is an Office
 *  file with the wrong extension. */
const MAX_SNIFFED_ZIP_BYTES = 64 * 1024 * 1024;

export interface InputFile {
  absPath: string;
  /** Relative to the working directory, forward slashes — the file's name in
   *  every report and its key in a baseline. */
  path: string;
  /** Named on the command line (rather than found in a folder or by a glob). */
  explicit: boolean;
  /** Extension or header says PDF — decides whether qpdf is needed at all. */
  looksLikePdf: boolean;
}

type Magic = "pdf" | "zip" | null;

function readMagic(absPath: string): Magic {
  let fd: number | null = null;
  try {
    fd = openSync(absPath, "r");
    const head = Buffer.alloc(5);
    const n = readSync(fd, head, 0, 5, 0);
    if (n >= 5 && head.toString("latin1") === "%PDF-") return "pdf";
    if (n >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
      return "zip";
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {}
    }
  }
}

export function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

const GLOB_CHARS = /[*?[\]{}]/;

export function isGlob(pattern: string): boolean {
  return GLOB_CHARS.test(pattern);
}

/**
 * A small glob → RegExp translator: `*` (within one path segment), `**`
 * (across segments), `?`, `[abc]` / `[!abc]`, and `{a,b}`. Written here
 * rather than taken from `fs.glob`, which still prints an experimental
 * warning on the oldest Node this project supports.
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?"; // "**/" — zero or more whole folders
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "[") {
      const end = glob.indexOf("]", i + 2);
      if (end === -1) {
        re += "\\[";
      } else {
        let cls = glob.slice(i + 1, end).replace(/\\/g, "\\\\");
        if (cls.startsWith("!")) cls = "^" + cls.slice(1);
        re += `[${cls}]`;
        i = end;
      }
    } else if (c === "{") {
      braces++;
      re += "(?:";
    } else if (c === "}" && braces > 0) {
      braces--;
      re += ")";
    } else if (c === "," && braces > 0) {
      re += "|";
    } else {
      re += c.replace(/[.+^$()|\\{}\]]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** Every regular file under `dir`, sorted, skipping dot-entries and
 *  node_modules. Symlinked folders are not followed (no cycles). */
function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    // Dot-entries cover .git, editor folders, and macOS "._name" sidecar
    // files, which carry the real file's extension but none of its content.
    if (entry.name.startsWith(".")) continue;
    // "~$report.docx" is the lock file Office writes beside an open document.
    if (entry.name.startsWith("~$")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    } else if (entry.isSymbolicLink()) {
      try {
        if (statSync(full).isFile()) out.push(full);
      } catch {}
    }
  }
}

/** Is a file that was FOUND (not named) a document the engine can audit? */
async function isDiscoveredDocument(absPath: string): Promise<{ take: boolean; magic: Magic }> {
  const ext = extname(absPath).toLowerCase();
  const magic = readMagic(absPath);
  if (SUPPORTED_EXTENSIONS.has(ext)) return { take: true, magic };
  if (magic === "pdf") return { take: true, magic };
  if (magic === "zip") {
    try {
      if (statSync(absPath).size > MAX_SNIFFED_ZIP_BYTES) return { take: false, magic };
      return { take: (await detectFileType(readFileSync(absPath))) !== null, magic };
    } catch {
      return { take: false, magic };
    }
  }
  return { take: false, magic };
}

function makeExcluder(cwd: string, patterns: string[]): (absPath: string) => boolean {
  if (patterns.length === 0) return () => false;
  const tests = patterns.map((p) => {
    const pattern = toPosix(p).replace(/^\.\//, "").replace(/\/+$/, "");
    const re = globToRegExp(pattern);
    // A pattern with no slash names a file or folder anywhere in the tree.
    const anywhere = !pattern.includes("/");
    return (rel: string): boolean => {
      if (re.test(rel)) return true;
      const segments = rel.split("/");
      if (anywhere) return segments.some((s) => re.test(s));
      // "docs/drafts" also excludes everything beneath it.
      for (let i = 1; i < segments.length; i++) {
        if (re.test(segments.slice(0, i).join("/"))) return true;
      }
      return false;
    };
  });
  return (absPath) => {
    const rel = toPosix(relative(cwd, absPath));
    return tests.some((t) => t(rel));
  };
}

/**
 * Expand the command's paths. Throws UsageError for a path that does not
 * exist (and is not a glob) or a named file that is plainly not a document.
 * A glob or folder with nothing in it contributes nothing — the caller
 * decides what an empty run means. Order is the order typed; files within a
 * folder are sorted by name. Duplicates are dropped.
 */
export async function collectInputs(
  paths: string[],
  opts: { cwd: string; exclude?: string[] },
): Promise<InputFile[]> {
  const { cwd } = opts;
  const excluded = makeExcluder(cwd, opts.exclude ?? []);
  const seen = new Set<string>();
  const out: InputFile[] = [];

  const add = (absPath: string, explicit: boolean, magic: Magic): void => {
    if (seen.has(absPath) || excluded(absPath)) return;
    seen.add(absPath);
    out.push({
      absPath,
      path: toPosix(relative(cwd, absPath)) || basename(absPath),
      explicit,
      looksLikePdf: magic === "pdf" || extname(absPath).toLowerCase() === ".pdf",
    });
  };

  const addDiscovered = async (files: string[]): Promise<void> => {
    for (const file of files) {
      if (seen.has(file) || excluded(file)) continue;
      const { take, magic } = await isDiscoveredDocument(file);
      if (take) add(file, false, magic);
    }
  };

  for (const raw of paths) {
    const absPath = resolve(cwd, raw);

    if (existsSync(absPath)) {
      const stat = statSync(absPath);
      if (stat.isDirectory()) {
        const files: string[] = [];
        walk(absPath, files);
        await addDiscovered(files);
        continue;
      }
      if (!stat.isFile()) throw new UsageError(`Not a file or folder: ${absPath}`);
      const magic = readMagic(absPath);
      if (!SUPPORTED_EXTENSIONS.has(extname(absPath).toLowerCase()) && magic === null) {
        throw new UsageError(
          `Not a PDF, Word (.docx), PowerPoint (.pptx), or Excel (.xlsx) file: ${raw}`,
        );
      }
      add(absPath, true, magic);
      continue;
    }

    if (!isGlob(raw)) throw new UsageError(`File not found: ${absPath}`);

    // A glob: walk from its longest glob-free leading folder.
    const pattern = toPosix(raw).replace(/^\.\//, "");
    const segments = pattern.split("/");
    const firstGlob = segments.findIndex((s) => isGlob(s));
    const staticPart = segments.slice(0, firstGlob).join("/");
    const base = isAbsolute(pattern) ? resolve(staticPart || "/") : resolve(cwd, staticPart || ".");
    const re = globToRegExp(pattern);
    const files: string[] = [];
    if (existsSync(base) && statSync(base).isDirectory()) walk(base, files);
    const matched = files.filter((f) =>
      re.test(isAbsolute(pattern) ? toPosix(f) : toPosix(relative(cwd, f))),
    );
    await addDiscovered(matched);
  }

  return out;
}
