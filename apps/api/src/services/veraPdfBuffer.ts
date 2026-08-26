import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { REMEDIATION } from "#config";
import { runVeraPdf, type VeraPdfVerdict } from "./veraPdf.js";

/** The verdict returned whenever no check could be run at all. */
function unavailable(profile = "ua1"): VeraPdfVerdict {
  return {
    available: false,
    passed: false,
    profile,
    failures: [],
    totalFailureCount: 0,
    distinctRuleCount: 0,
  };
}

// ---------------------------------------------------------------------------
// The vendored WCAG 2.2 machine profile (v1.97.0). Resolved from THIS
// module's location so it works identically under tsx from any cwd; the file
// rides the repository (apps/api/resources/verapdf/, provenance in the
// README beside it). Existence is checked once and cached — a missing file
// degrades the WCAG check to "Did not run", never throws.
// ---------------------------------------------------------------------------
export const WCAG_PROFILE_LABEL = "wcag-2.2-machine";
const WCAG_PROFILE_PATH = fileURLToPath(
  new URL("../../resources/verapdf/WCAG-2-2-Machine.xml", import.meta.url),
);
// A positive answer is cached (one stat per process — the path never moves
// at runtime); a NEGATIVE answer is re-probed on the next audit, so a file
// restored in place self-heals without a restart, and the miss is logged
// each probe so it cannot rot silently.
let wcagProfileExists = false;
function wcagProfileAvailable(): boolean {
  if (!wcagProfileExists) {
    wcagProfileExists = fs.existsSync(WCAG_PROFILE_PATH);
    if (!wcagProfileExists) {
      console.error(
        `veraPDF WCAG profile missing at ${WCAG_PROFILE_PATH} — the WCAG machine check will report "Did not run"`,
      );
    }
  }
  return wcagProfileExists;
}

// ---------------------------------------------------------------------------
// Concurrency bound for veraPDF JVMs.
//
// routes/analyze.ts runs this check via `Promise.all` alongside
// analyzeDocument, and only analyzeDocument takes the analysis semaphore — so
// without a bound here, every in-flight upload spawned its own JVM. See
// REMEDIATION.VERAPDF_MAX_CONCURRENT for the sizing rationale.
//
// Deliberately its OWN budget rather than sharing the analysis semaphore:
// sharing would make one request consume two of the two available analysis
// slots, halving PDF throughput to fix a memory problem.
// ---------------------------------------------------------------------------
let active = 0;
const waiting: Array<{ grant: () => void; deny: () => void }> = [];

function acquireSlot(): Promise<boolean> {
  if (active < REMEDIATION.VERAPDF_MAX_CONCURRENT) {
    active++;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const entry = {
      grant: () => {
        clearTimeout(timer);
        resolve(true);
      },
      deny: () => resolve(false),
    };
    const timer = setTimeout(() => {
      const i = waiting.indexOf(entry);
      if (i >= 0) waiting.splice(i, 1);
      entry.deny();
    }, REMEDIATION.VERAPDF_QUEUE_TIMEOUT_MS);
    // Never keep the process alive just to hand out a veraPDF slot.
    if (typeof timer.unref === "function") timer.unref();
    waiting.push(entry);
  });
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) next.grant();
  else active--;
}

/**
 * Which PDF/UA flavour a buffer declares (v1.94.0). XMP metadata streams are
 * typically stored uncompressed precisely so byte scanners can find them, so
 * a cheap scan for `pdfuaid` occurrences and a nearby part value of 2 picks
 * the ua2 profile for PDF/UA-2 documents. A miss (compressed XMP, no
 * identifier) just keeps today's ua1 behavior — never worse than before.
 * Exported for tests.
 */
export function detectPdfUaFlavour(buffer: Buffer): "ua1" | "ua2" {
  let from = 0;
  for (let i = 0; i < 8; i++) {
    const idx = buffer.indexOf("pdfuaid", from);
    if (idx === -1) break;
    const window = buffer
      .subarray(Math.max(0, idx - 40), Math.min(buffer.length, idx + 200))
      .toString("latin1");
    if (/pdfuaid:part(?:\s*=\s*["']\s*2\s*["']|[^>]*>\s*2\s*<)/i.test(window)) return "ua2";
    from = idx + 7;
  }
  return "ua1";
}

/**
 * Run veraPDF's PDF/UA check against an in-memory PDF buffer.
 *
 * Writes a short-lived temp copy (same TMP_DIR||/tmp + UUID.pdf pattern the
 * qpdf audit path already uses and the privacy docs already disclose), runs
 * veraPDF, and deletes it in `finally`. Never throws; returns available:false
 * (with no temp file) when veraPDF isn't configured or no slot was free.
 *
 * The concurrency slot is taken BEFORE the temp write, so a queued caller
 * costs neither a JVM nor a copy of the upload on disk.
 */
export async function runVeraPdfOnBuffer(buffer: Buffer): Promise<VeraPdfVerdict> {
  return (await runVeraPdfChecksOnBuffer(buffer, { wcag: false })).pdfUa;
}

/**
 * Run the PDF/UA check — and, when enabled (v1.97.0), veraPDF's
 * machine-testable WCAG 2.2 profile — against an in-memory PDF buffer.
 *
 * ONE temp copy serves both runs (same TMP_DIR||/tmp + UUID.pdf pattern the
 * qpdf audit path uses and the privacy docs disclose), deleted in `finally`
 * after both settle. Each JVM takes its own concurrency slot and the two run
 * CONCURRENTLY; under saturation each degrades independently to
 * available:false ("Did not run") — a queued run never holds a slot while
 * waiting for another, so the slot pool cannot deadlock.
 *
 * `wcag` in the result is null when the check is disabled or veraPDF itself
 * is not configured — callers then omit the field entirely, so reports made
 * before the feature (or with it off) never render a false "Did not run".
 */
export async function runVeraPdfChecksOnBuffer(
  buffer: Buffer,
  opts: {
    wcag: boolean;
    /** v1.100.0 job-model hooks: observed per-pass state for the progress
     *  endpoints. "running" includes any wait for a JVM slot (the honest
     *  reading — the pass has begun from the caller's point of view);
     *  "done" fires when the arm settles, whatever the verdict. onWcag
     *  fires only when the WCAG pass is actually wanted. */
    onUa?: (state: "running" | "done") => void;
    onWcag?: (state: "running" | "done") => void;
  },
): Promise<{ pdfUa: VeraPdfVerdict; wcag: VeraPdfVerdict | null }> {
  const wantWcag = opts.wcag;
  if (!REMEDIATION.VERAPDF_PATH) {
    return { pdfUa: unavailable(), wcag: null };
  }

  const flavour = detectPdfUaFlavour(buffer);
  const wcagRunnable = wantWcag && wcagProfileAvailable();
  // The value the wcag field takes whenever the second pass cannot happen:
  // an honest "Did not run" when the feature is on, or null (field omitted
  // downstream) when it is off.
  const wcagFallback = wantWcag ? unavailable(WCAG_PROFILE_LABEL) : null;

  // The FIRST slot gates the temp write — the pre-v1.97.0 invariant, kept:
  // an upload still queued for a slot must never have its buffer spilled to
  // disk (veraPdfHardening.test.ts pins it). Only once a JVM slot is granted
  // does a copy exist, and it is unlinked when the last run settles.
  if (!(await acquireSlot())) {
    // Saturated. The checks are supplementary — the report discloses "Did
    // not run" (v1.91.0) rather than failing the audit the user asked for.
    return { pdfUa: unavailable(), wcag: wcagFallback };
  }

  const tmpDir = process.env.TMP_DIR || "/tmp";
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);
  try {
    fs.writeFileSync(tmpPath, buffer);
  } catch {
    releaseSlot();
    // The message can carry the temp path; keep the client-visible string
    // generic (it is serialized by routes/analyze.ts and persisted into
    // shared reports).
    const failed: VeraPdfVerdict = {
      available: true,
      passed: false,
      profile: flavour,
      failures: [],
      totalFailureCount: 0,
      distinctRuleCount: 0,
      error: "veraPDF invocation failed",
    };
    return {
      pdfUa: failed,
      wcag: wantWcag ? { ...failed, profile: WCAG_PROFILE_LABEL } : null,
    };
  }

  // The UA run uses the already-granted slot; the WCAG run (concurrent)
  // takes its own, so the two JVMs stay inside VERAPDF_MAX_CONCURRENT and a
  // queued run never holds a slot while waiting for another — the pool
  // cannot deadlock. Each arm releases exactly the slot it holds.
  opts.onUa?.("running");
  if (wantWcag) opts.onWcag?.("running");
  const uaRun = (async (): Promise<VeraPdfVerdict> => {
    try {
      return await runVeraPdf(tmpPath, REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS, flavour, undefined);
    } catch {
      return {
        available: true,
        passed: false,
        profile: flavour,
        failures: [],
        totalFailureCount: 0,
        distinctRuleCount: 0,
        error: "veraPDF invocation failed",
      };
    } finally {
      releaseSlot();
    }
  })();

  const wcagRun = (async (): Promise<VeraPdfVerdict | null> => {
    if (!wcagRunnable) return wcagFallback;
    if (!(await acquireSlot())) return unavailable(WCAG_PROFILE_LABEL);
    try {
      return await runVeraPdf(tmpPath, REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS, flavour, {
        path: WCAG_PROFILE_PATH,
        label: WCAG_PROFILE_LABEL,
      });
    } catch {
      return {
        available: true,
        passed: false,
        profile: WCAG_PROFILE_LABEL,
        failures: [],
        totalFailureCount: 0,
        distinctRuleCount: 0,
        error: "veraPDF invocation failed",
      };
    } finally {
      releaseSlot();
    }
  })();

  try {
    const [pdfUa, wcag] = await Promise.all([
      uaRun.finally(() => opts.onUa?.("done")),
      wcagRun.finally(() => {
        if (wantWcag) opts.onWcag?.("done");
      }),
    ]);
    return { pdfUa, wcag };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}
