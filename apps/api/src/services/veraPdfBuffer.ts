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
  if (!REMEDIATION.VERAPDF_PATH) return unavailable();

  if (!(await acquireSlot())) {
    // Saturated. The check is supplementary — the report discloses "Did not
    // run" (v1.91.0) rather than failing the audit the user asked for.
    return unavailable();
  }

  const tmpDir = process.env.TMP_DIR || "/tmp";
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);
  const flavour = detectPdfUaFlavour(buffer);
  try {
    fs.writeFileSync(tmpPath, buffer);
    return await runVeraPdf(tmpPath, REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS, flavour);
  } catch {
    // The message here can carry the temp path (e.g. ENOENT ... '/tmp/x.pdf')
    // and this field is serialized to the client by routes/analyze.ts and
    // persisted into shared reports, so it must stay generic.
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
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    releaseSlot();
  }
}
