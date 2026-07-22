import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { REMEDIATION } from "#config";
import { runVeraPdf, type VeraPdfVerdict } from "./veraPdf.js";

/**
 * Run veraPDF's PDF/UA-1 check against an in-memory PDF buffer.
 * Writes a short-lived temp copy (same TMP_DIR||/tmp + UUID.pdf pattern the
 * qpdf audit path already uses and the privacy docs already disclose), runs
 * veraPDF, and deletes it in `finally`. Never throws; returns available:false
 * (with no temp file) when veraPDF isn't configured.
 */
export async function runVeraPdfOnBuffer(buffer: Buffer): Promise<VeraPdfVerdict> {
  if (!REMEDIATION.VERAPDF_PATH) {
    return { available: false, passed: false, profile: "ua1", failures: [], totalFailureCount: 0 };
  }
  const tmpDir = process.env.TMP_DIR || "/tmp";
  const tmpPath = path.join(tmpDir, `${randomUUID()}.pdf`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    return await runVeraPdf(tmpPath, REMEDIATION.VERAPDF_AUDIT_TIMEOUT_MS);
  } catch (err: any) {
    return {
      available: true, passed: false, profile: "ua1",
      failures: [], totalFailureCount: 0,
      error: err?.message ? String(err.message) : "veraPDF invocation failed",
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}
