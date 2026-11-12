/**
 * Report seal (review 2026-11-12) — proof that a shared report is, in every
 * field, what THIS server computed.
 *
 * THE HOLE IT CLOSES: POST /api/reports stored whatever JSON a client sent
 * (after URL sanitising) and published it at /report/<id> for a year. Anyone
 * could post a hand-written "100 / A" for any file name and hand the link to
 * a reviewer as this tool's finding.
 *
 * THE MECHANISM: every analysis result the API returns to a browser carries a
 * top-level `seal` — an HMAC-SHA256, under a server-only secret, over a
 * canonical serialisation of the ENTIRE result. The web client posts the
 * result back exactly as received when someone shares it; POST /api/reports
 * re-serialises what it received and compares in constant time.
 *
 * WHY THE WHOLE OBJECT (second pass, same review): the first version sealed a
 * hand-picked list of "verdict-bearing" fields. An independent verifier then
 * walked through what the list left out — a category's `weight` and
 * `notAssessed`, which regradeStoredReport uses to RECOMPUTE the score on
 * every read (weights of 1e-9 on the failing categories turned a stored 39/F
 * into a served 69/D); added `url` / `pageTitle` / `score` fields that the
 * page-report view renders; headlines, explanations, veraPDF failure lists.
 * A picked list leaks whenever a view renders, or a regrade reads, a field
 * nobody thought to pick. So nothing is picked: change, add or remove ANY
 * field, at any depth, and the seal no longer matches.
 *
 * CANONICAL FORM: the value is first passed through JSON itself
 * (JSON.parse(JSON.stringify(x))) — which is precisely what happens to it on
 * the way to the browser and back, so `undefined` members vanish, NaN and
 * ±Infinity become null, -0 becomes 0 and a Date becomes its ISO string on
 * BOTH sides — and then serialised with object keys in sorted order, so key
 * order (which no JSON consumer is obliged to preserve) is not part of the
 * contract. Array order IS part of it.
 *
 * DOMAIN SEPARATION: the HMAC input starts with a prefix naming the seal
 * version and the result KIND ("document" or "page"). A seal issued for a
 * document audit can never validate a page-audit result, or the reverse, even
 * if the two JSON bodies were byte-identical.
 *
 * THE SECRET: 32 random bytes, generated once and kept in the data directory
 * beside the database (mode 0600), or supplied via REPORT_SEAL_SECRET. It is
 * never logged and never leaves this module. Losing it only means results
 * issued before the loss can no longer be shared ("run the audit again").
 *
 * A seal is not a signature of identity and stores nothing about a caller.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultDataDir } from "./dataDir.js";

/** Bumped whenever the canonical form changes (older seals then fail). */
const SEAL_VERSION = "v2";

/** What a sealed result IS — part of the HMAC input (domain separation). */
export type SealKind = "document" | "page";
const SECRET_FILE = "report-seal.key";
const SECRET_BYTES = 32;

export const REPORT_SEAL_ERROR =
  "This report could not be verified — run the audit again and share the new result.";

let cachedSecret: Buffer | null = null;

/** Where the generated secret lives: beside the database (DB_PATH's directory). */
export function sealSecretPath(): string {
  return path.join(defaultDataDir(), SECRET_FILE);
}

function readSecretFile(file: string): Buffer | null {
  try {
    const hex = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  } catch {
    // absent or unreadable — the caller decides what to do
  }
  return null;
}

function loadSecret(): Buffer {
  const fromEnv = process.env.REPORT_SEAL_SECRET;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return Buffer.from(fromEnv, "utf8");
  }

  // Under the test runner, with no DB_PATH pointing the test at a directory
  // of its own, the "data dir" is the developer's real apps/api/data. Tests
  // must not drop a key file there, so they get a process-lifetime secret.
  if (process.env.VITEST && !process.env.DB_PATH) return randomBytes(SECRET_BYTES);

  const file = sealSecretPath();
  const existing = readSecretFile(file);
  if (existing) return existing;

  const fresh = randomBytes(SECRET_BYTES);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    // `wx`: never overwrite — if another process created it between the read
    // above and this write, EEXIST sends us to read theirs instead.
    writeFileSync(file, fresh.toString("hex") + "\n", { mode: 0o600, flag: "wx" });
    chmodSync(file, 0o600); // the mode option is subject to the umask
    return fresh;
  } catch (err) {
    const raced = readSecretFile(file);
    if (raced) return raced;
    // Could not persist (read-only data dir). Still seal — with a secret that
    // lasts for this process only — rather than fail every audit. The message
    // names the file, never the secret.
    console.error(
      `[report-seal] could not persist the seal secret at ${file} ` +
        `(${(err as NodeJS.ErrnoException)?.code ?? "error"}); using a process-lifetime secret — ` +
        `share links for results issued before a restart will not verify.`,
    );
    return fresh;
  }
}

function secret(): Buffer {
  if (!cachedSecret) cachedSecret = loadSecret();
  return cachedSecret;
}

/** Test hook: forget the cached secret so the next seal re-reads env / disk. */
export function _resetSealSecret(): void {
  cachedSecret = null;
}

// ---------------------------------------------------------------------------
// Canonical serialisation
// ---------------------------------------------------------------------------

/**
 * Serialise a JSON value (the output of JSON.parse — only null, booleans,
 * finite numbers, strings, arrays and plain objects) with object keys sorted.
 * Written out by hand rather than by building a sorted copy, so a key such as
 * "__proto__" is just another key.
 */
function sortedJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(sortedJson).join(",")}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${sortedJson(obj[k])}`)
    .join(",")}}`;
}

/**
 * The exact string the HMAC covers: the domain prefix, then the canonical
 * serialisation of the whole result minus its own top-level `seal`.
 * Throws if the value cannot be represented as JSON (a cycle, a BigInt).
 */
export function canonicalReportDigest(report: unknown, kind: SealKind = "document"): string {
  // The JSON round trip is the normaliser — see CANONICAL FORM above.
  const asJson: unknown = JSON.parse(JSON.stringify(report ?? null) ?? "null");
  if (asJson !== null && typeof asJson === "object" && !Array.isArray(asJson)) {
    delete (asJson as Record<string, unknown>).seal;
  }
  return `icjia-file-audit:report-seal:${SEAL_VERSION}:${kind}\n${sortedJson(asJson)}`;
}

export function computeReportSeal(report: unknown, kind: SealKind = "document"): string {
  return createHmac("sha256", secret()).update(canonicalReportDigest(report, kind)).digest("hex");
}

/**
 * Attach the seal as a top-level `seal` field. Call this LAST, on the exact
 * object about to be sent: the seal covers every field, so anything attached
 * afterwards would invalidate it.
 */
export function sealReport<T extends object>(
  report: T,
  kind: SealKind = "document",
): T & { seal: string } {
  const sealed = report as T & { seal: string };
  sealed.seal = computeReportSeal(report, kind);
  return sealed;
}

/**
 * Constant-time check of `report.seal` against the seal recomputed over
 * everything else in `report`, for the given kind.
 */
export function verifyReportSeal(report: unknown, kind: SealKind = "document"): boolean {
  if (typeof report !== "object" || report === null || Array.isArray(report)) return false;
  const presented = (report as Record<string, unknown>).seal;
  if (typeof presented !== "string" || !/^[0-9a-f]{64}$/.test(presented)) return false;
  let expected: string;
  try {
    expected = computeReportSeal(report, kind);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(presented, "hex"), Buffer.from(expected, "hex"));
}
