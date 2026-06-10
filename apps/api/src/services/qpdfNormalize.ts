/**
 * qpdf normalization step for the remediation pipeline.
 *
 * `qpdf --object-streams=disable in out` rewrites the document with a clean
 * xref — repairing recoverable damage along the way. When qpdf performs such
 * a repair it exits 3 ("operation succeeded with warnings") while still
 * writing a fully valid output file. Damaged-but-recoverable PDFs are the
 * primary remediation input, so exit 3 with output present is SUCCESS here
 * — the same contract as the audit's exit-3 recovery in
 * qpdfService.handleQpdfError. Anything else (exit 2, missing output)
 * remains a hard failure.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface NormalizeResult {
  /** qpdf repaired recoverable damage (exit 3) while writing valid output. */
  repairedWithWarnings: boolean;
}

export async function qpdfNormalize(
  input: string,
  output: string,
  timeoutMs?: number,
): Promise<NormalizeResult> {
  try {
    await execFileAsync("qpdf", ["--object-streams=disable", input, output], {
      maxBuffer: 16 * 1024 * 1024,
      // Bound the rewrite so an object-stream "bomb" (a small input whose
      // streams expand massively) can't pin CPU/disk indefinitely. Node
      // SIGTERMs qpdf when this elapses, surfacing as a normalize failure.
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
    });
    return { repairedWithWarnings: false };
  } catch (e: any) {
    const exitCode = e?.status ?? e?.code;
    if (exitCode === 3 && existsSync(output)) {
      return { repairedWithWarnings: true };
    }
    throw e;
  }
}
