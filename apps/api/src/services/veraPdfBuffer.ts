import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { REMEDIATION } from "#config";
import { runVeraPdf, type VeraPdfVerdict } from "./veraPdf.js";

/** The verdict returned whenever no check could be run at all. */
function unavailable(): VeraPdfVerdict {
  return {
    available: false,
    passed: false,
    profile: "ua1",
    failures: [],
    totalFailureCount: 0,
    distinctRuleCount: 0,
  };
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
 * Run veraPDF's PDF/UA-1 check against an in-memory PDF buffer.
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
  if (!REMEDIATION.VERAPDF_PATH) return unavailable();

  if (!(await acquireSlot())) {
    // Saturated. The check is supplementary — hide the panel rather than
    // fail the audit the user actually asked for.
    return unavailable();
  }

  const tmpDir = process.env.TMP_DIR || "/tmp";
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    return await runVeraPdf(tmpPath, REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS);
  } catch {
    // The message here can carry the temp path (e.g. ENOENT ... '/tmp/x.pdf')
    // and this field is serialized to the client by routes/analyze.ts and
    // persisted into shared reports, so it must stay generic.
    return {
      available: true,
      passed: false,
      profile: "ua1",
      failures: [],
      totalFailureCount: 0,
      distinctRuleCount: 0,
      error: "veraPDF invocation failed",
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    releaseSlot();
  }
}
