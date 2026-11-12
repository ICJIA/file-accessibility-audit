/**
 * The version of the audit engine that is running — the app version, which
 * the release checklist bumps in lockstep across every package (so the API's
 * own package.json is authoritative for the analyzer too).
 *
 * Stored beside each persisted /api/audit-url report (shared_reports
 * .engine_version, migration 17) so the content-hash dedup can tell a result
 * computed by THIS engine from one computed by an older one: detection
 * changes ship in releases, and a stored result from before the change is not
 * the answer the current engine would give (review 2026-11-12).
 *
 * Read once and cached; "unknown" if the file cannot be read, which never
 * equals a stored version and therefore fails safe (always re-audits).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | null = null;

export function engineVersion(): string {
  if (cached !== null) return cached;
  let version = "unknown";
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.resolve(here, "../../package.json"), "utf8"));
    if (typeof pkg.version === "string" && pkg.version.length > 0) version = pkg.version;
  } catch {
    // keep "unknown"
  }
  cached = version;
  return version;
}
