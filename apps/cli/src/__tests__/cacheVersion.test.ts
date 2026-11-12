/**
 * The publist cache is keyed on the engine version as well as the URL.
 *
 * 2026-11-12: it was keyed on the URL alone, so after a scoring release a
 * plain `a11y-audit publist` kept every old score and audited only new
 * publications — one CSV carrying two scoring models. A cached success now
 * counts only for the engine version that produced it.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisResult } from "@file-audit/analyzer";
import {
  initCache,
  getCached,
  getAllSuccessful,
  getStaleCount,
  upsertResult,
  upsertError,
} from "../lib/cache.js";
import type { Publication } from "../lib/graphql.js";
import { VERSION } from "../version.js";

const pub = (fileURL: string): Publication => ({
  id: fileURL,
  title: fileURL,
  slug: "s",
  fileURL,
  publicationDate: null,
  pubType: null,
  summary: null,
  tags: null,
});

const result = (overallScore: number) =>
  ({
    overallScore,
    grade: "B",
    categories: [],
    pageCount: 1,
    filename: "x.pdf",
    fileType: "pdf",
  }) as unknown as AnalysisResult;

const URL_A = "https://example.test/a.pdf";

describe("publist cache — engine version", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "a11y-audit-cachever-"));
    db = initCache(dir);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("records the running engine version on every row it writes", () => {
    upsertResult(db, pub(URL_A), result(80));
    upsertError(db, pub("https://example.test/b.pdf"), "boom");
    const versions = db.prepare("SELECT engine_version FROM publist_cache").all() as {
      engine_version: string;
    }[];
    expect(versions.map((v) => v.engine_version)).toEqual([VERSION, VERSION]);
  });

  it("a row from the same engine version is a cache hit", () => {
    upsertResult(db, pub(URL_A), result(80));
    expect(getCached(db, URL_A)?.overall_score).toBe(80);
    expect(getStaleCount(db)).toBe(0);
  });

  it("a row from ANOTHER engine version is a miss, and stays out of the report", () => {
    upsertResult(db, pub(URL_A), result(80), "1.0.0");
    expect(getCached(db, URL_A)).toBeUndefined();
    expect(getAllSuccessful(db)).toEqual([]);
    expect(getStaleCount(db)).toBe(1);
    // …while still being an answer for the engine that wrote it.
    expect(getCached(db, URL_A, "1.0.0")?.overall_score).toBe(80);
  });

  it("re-auditing replaces the stale row, so the report carries one version only", () => {
    upsertResult(db, pub(URL_A), result(80), "1.0.0");
    upsertResult(db, pub("https://example.test/gone-from-list.pdf"), result(55), "1.0.0");
    upsertResult(db, pub(URL_A), result(64));
    const rows = getAllSuccessful(db);
    expect(rows.map((r) => [r.file_url, r.overall_score, r.engine_version])).toEqual([
      [URL_A, 64, VERSION],
    ]);
  });

  it("a permanent error (the file is gone) stays cached across versions", () => {
    upsertError(db, pub(URL_A), "HTTP 404 Not Found", true, "1.0.0");
    expect(getCached(db, URL_A)?.status).toBe("permanent_error");
  });

  it("a transient error is never a cache hit", () => {
    upsertError(db, pub(URL_A), "Server busy", false);
    expect(getCached(db, URL_A)).toBeUndefined();
  });

  it("a cache written before version tracking is migrated, and its rows are stale", () => {
    db.close();
    const legacyDir = mkdtempSync(join(tmpdir(), "a11y-audit-cachelegacy-"));
    try {
      const legacy = new Database(join(legacyDir, "cache.db"));
      legacy.exec(
        `CREATE TABLE publist_cache (file_url TEXT PRIMARY KEY, title TEXT, overall_score INTEGER,
           grade TEXT, status TEXT NOT NULL DEFAULT 'success', error_message TEXT, audited_at TEXT)`,
      );
      legacy
        .prepare(
          "INSERT INTO publist_cache (file_url, title, overall_score, grade) VALUES (?,?,?,?)",
        )
        .run(URL_A, "old", 99, "A");
      legacy.close();

      db = initCache(legacyDir);
      expect(getCached(db, URL_A)).toBeUndefined();
      expect(getStaleCount(db)).toBe(1);
      expect(getAllSuccessful(db)).toEqual([]);
    } finally {
      db.close();
      rmSync(legacyDir, { recursive: true, force: true });
      db = initCache(dir); // afterEach closes it
    }
  });
});
