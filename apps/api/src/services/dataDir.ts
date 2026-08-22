import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACTIVITY_EXPORT } from "#config";

/**
 * The directory whose free space matters to this service: where the SQLite
 * database lives and where a PDF's short-lived qpdf temp copy is written.
 *
 * Derived the same way db/sqlite.ts derives the database path (DB_PATH, else
 * ./data/audit.db) so the two cannot point at different volumes — measuring a
 * disk the service does not actually use would be worse than not measuring
 * one, because it would report reassuring numbers about the wrong thing.
 */
export function defaultDataDir(): string {
  return path.dirname(process.env.DB_PATH || "./data/audit.db");
}

/**
 * The root of the checkout, found from this module's own location (four
 * levels up from apps/api/src/services) — the same derivation
 * defaultBackupStatusFile() uses. Never the process cwd: PM2 starts the API
 * with cwd apps/api, the dev server and the tests start it elsewhere.
 */
export function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../..");
}

/**
 * Where the daily activity export writes its files (v1.88.0): `logs/` at the
 * repository root — one `ls` from the application root, which is the
 * requirement — unless ACTIVITY_LOG_DIR names another absolute path (tests,
 * containerised deploys). `logs/` is git-ignored and the deploy script never
 * `git clean`s, so the files survive deploys. Nothing serves this directory.
 */
export function activityLogDir(): string {
  return process.env.ACTIVITY_LOG_DIR || path.join(repoRoot(), ACTIVITY_EXPORT.DIR_NAME);
}
