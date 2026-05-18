/**
 * Detached worker for a single remediation job. Spawned by the
 * /api/remediate route with `tsx src/jobs/remediate.ts <jobId>`. The
 * API does not wait for this process — status updates flow through the
 * `remediation_jobs` and `remediation_events` tables, which the
 * frontend polls.
 *
 * Pipeline (see docs/pdf-remediation-integration-plan.md):
 *   preparing  → qpdf normalize, delete input
 *   tagging    → ODL convert tagged-pdf, delete normalized
 *   validating → qpdf --check the output
 *   comparing  → re-audit, require score ≥ input
 *
 * Any failure (validation or comparison) marks the job failed and
 * removes the partial output. Scratch directories are always cleaned
 * up in the finally block.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  promises as fs,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { convert } from "@opendataloader/pdf";
import { REMEDIATION } from "#config";
import { analyzePDF } from "../services/pdfAnalyzer.js";
import {
  recordEvent,
  verifyAbsent,
  deleteAndVerify,
} from "../services/remediationEvents.js";
import {
  getJob,
  setComplete,
  setFailed,
  setOutputAudit,
  setRunning,
  setScores,
  setStep,
  setVeraPdfResult,
} from "../services/remediationJobs.js";
import { runVeraPdf } from "../services/veraPdf.js";

const execFileAsync = promisify(execFile);

const OUTPUT_ROOT = resolve(REMEDIATION.OUTPUT_DIR);

function jobPaths(jobId: string) {
  const jobDir = join(OUTPUT_ROOT, jobId);
  const workDir = join(jobDir, "work");
  return {
    jobDir,
    workDir,
    inputPath: join(workDir, "input.pdf"),
    normalizedPath: join(workDir, "normalized.pdf"),
    odlOutDir: join(workDir, "odl"),
    finalOutputPath: join(jobDir, "output.pdf"),
  };
}

/**
 * Configure JAVA_HOME / PATH inline so the JVM child spawned by
 * @opendataloader/pdf can find `java`. On Ubuntu with
 * `apt install openjdk-17-jre-headless`, `java` is on PATH already
 * and JAVA_PATH stays null.
 */
function setupJavaEnv(): void {
  const javaPath = REMEDIATION.JAVA_PATH;
  if (!javaPath) return;
  const javaBinDir = dirname(javaPath);
  const javaHome = dirname(javaBinDir); // .../bin/java → .../bin → ...
  if (!process.env.PATH?.includes(javaBinDir)) {
    process.env.PATH = `${javaBinDir}:${process.env.PATH ?? ""}`;
  }
  if (!process.env.JAVA_HOME) {
    process.env.JAVA_HOME = javaHome;
  }
  // Cap JVM heap as a safety rail against runaway documents
  const heapFlag = `-Xmx${REMEDIATION.JVM_HEAP_MB}m`;
  if (!(process.env.JAVA_TOOL_OPTIONS ?? "").includes(heapFlag)) {
    process.env.JAVA_TOOL_OPTIONS =
      `${process.env.JAVA_TOOL_OPTIONS ?? ""} ${heapFlag}`.trim();
  }
}

async function qpdfNormalize(input: string, output: string): Promise<void> {
  await execFileAsync(
    "qpdf",
    ["--object-streams=disable", input, output],
    { maxBuffer: 16 * 1024 * 1024 },
  );
}

async function qpdfCheckPasses(path: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    const { stdout, stderr } = await execFileAsync("qpdf", ["--check", path], {
      maxBuffer: 8 * 1024 * 1024,
    });
    const combined = `${stdout}\n${stderr}`;
    if (/operation succeeded with warnings/i.test(combined)) {
      return { ok: false, reason: extractReason(combined) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message.split("\n")[0] };
  }
}

function extractReason(qpdfOutput: string): string {
  if (/xref not found/i.test(qpdfOutput)) return "xref damage";
  if (/Invalid object stream/i.test(qpdfOutput)) return "invalid object stream";
  if (/file is damaged/i.test(qpdfOutput)) return "file damaged";
  return "qpdf reported warnings";
}

async function cleanScratch(workDir: string): Promise<void> {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

export async function runRemediationJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) {
    throw new Error(`remediation job ${jobId} not found`);
  }
  if (job.status !== "pending") {
    throw new Error(
      `remediation job ${jobId} is ${job.status}; expected pending`,
    );
  }

  setupJavaEnv();
  const paths = jobPaths(jobId);

  if (!existsSync(paths.inputPath)) {
    setFailed(jobId, "input file missing at job start");
    recordEvent(jobId, "error", {
      error_type: "input_missing",
      message: "expected input file not present in scratch dir",
    });
    return;
  }

  setRunning(jobId);
  recordEvent(jobId, "processing_started");

  try {
    // 1. Preparing: qpdf normalize
    setStep(jobId, "preparing", 10);
    const normalizeStart = Date.now();
    try {
      await qpdfNormalize(paths.inputPath, paths.normalizedPath);
    } catch (e) {
      recordEvent(jobId, "error", {
        error_type: "qpdf_normalize_failed",
        message: (e as Error).message,
      });
      setFailed(jobId, "qpdf normalization failed");
      return;
    }
    recordEvent(jobId, "normalize_complete", {
      duration_ms: Date.now() - normalizeStart,
    });

    // Delete the original input now that we have a normalized copy
    await deleteAndVerify(jobId, paths.inputPath, "cleanup");
    recordEvent(jobId, "input_deleted", { stage: "after_normalize" });

    // 2. Tagging: ODL convert
    setStep(jobId, "tagging", 35);
    const tagStart = Date.now();
    await fs.mkdir(paths.odlOutDir, { recursive: true, mode: 0o700 });
    try {
      await convert(paths.normalizedPath, {
        outputDir: paths.odlOutDir,
        format: "tagged-pdf",
        quiet: true,
      });
    } catch (e) {
      recordEvent(jobId, "error", {
        error_type: "odl_convert_failed",
        message: (e as Error).message,
      });
      setFailed(jobId, "OpenDataLoader tagging failed");
      return;
    }
    const odlFiles = readdirSync(paths.odlOutDir).filter((f) =>
      f.toLowerCase().endsWith(".pdf"),
    );
    if (odlFiles.length === 0) {
      recordEvent(jobId, "error", {
        error_type: "odl_no_output",
        message: "ODL produced no tagged PDF",
      });
      setFailed(jobId, "OpenDataLoader produced no output");
      return;
    }
    const taggedPath = join(paths.odlOutDir, odlFiles[0]);
    recordEvent(jobId, "tagging_complete", {
      duration_ms: Date.now() - tagStart,
    });

    // Delete the intermediate normalized PDF
    await deleteAndVerify(jobId, paths.normalizedPath, "cleanup");
    recordEvent(jobId, "intermediate_deleted", {
      stage: "after_tagging",
    });

    // 3. Validating: qpdf --check the output
    setStep(jobId, "validating", 70);
    const validity = await qpdfCheckPasses(taggedPath);
    if (!validity.ok) {
      recordEvent(jobId, "validation_failed", {
        reason: validity.reason ?? "unknown",
      });
      await deleteAndVerify(jobId, taggedPath, "cleanup");
      setFailed(jobId, `output failed validity check: ${validity.reason}`);
      return;
    }
    recordEvent(jobId, "validation_passed");

    // 3b. veraPDF PDF/UA-1 conformance check (optional — only if
    //     VERAPDF_PATH is configured). Result is informational, not
    //     blocking: even if veraPDF reports non-conformance, the
    //     remediated PDF is still served. The receipt + disclaimer
    //     surface the verdict honestly.
    try {
      const vera = await runVeraPdf(taggedPath);
      setVeraPdfResult(
        jobId,
        vera.available,
        vera.passed,
        JSON.stringify(vera),
      );
      if (vera.available) {
        recordEvent(jobId, vera.passed ? "verapdf_passed" : "verapdf_failed", {
          profile: vera.profile,
          failure_count: vera.totalFailureCount,
          top_failures: vera.failures.slice(0, 5).map((f) => f.ruleId),
        });
      } else {
        recordEvent(jobId, "verapdf_unavailable", {
          reason:
            "VERAPDF_PATH not configured — skipping PDF/UA conformance check",
        });
      }
    } catch (e) {
      recordEvent(jobId, "error", {
        error_type: "verapdf_threw",
        message: (e as Error).message,
      });
      setVeraPdfResult(jobId, false, false, JSON.stringify({
        available: false,
        passed: false,
        profile: "ua1",
        failures: [],
        totalFailureCount: 0,
        error: (e as Error).message,
      }));
    }

    // 4. Comparing: re-audit and require score ≥ input
    setStep(jobId, "comparing", 90);
    let inputScore: number;
    let outputScore: number;
    try {
      // We deleted the original input — re-audit by reading from the
      // tagged output (for output_score) and… we need the input score.
      // It's already in the job row from the API's pre-flight audit.
      // For now, re-audit the tagged output only; input_score is set
      // by the API at job creation time.
      inputScore = job.inputScore ?? 0;
      const outputBuf = await fs.readFile(taggedPath);
      const audit = await analyzePDF(
        outputBuf,
        `${job.inputFilename} (remediated)`,
      );
      outputScore = audit.overallScore;
      // Persist the full output audit so the result page can render
      // category-level before/after without a second pass.
      setOutputAudit(jobId, JSON.stringify(audit));
    } catch (e) {
      recordEvent(jobId, "error", {
        error_type: "reaudit_failed",
        message: (e as Error).message,
      });
      await deleteAndVerify(jobId, taggedPath, "cleanup");
      setFailed(jobId, "re-audit of remediated output failed");
      return;
    }

    setScores(jobId, inputScore, outputScore, true);

    if (outputScore < inputScore) {
      recordEvent(jobId, "validation_failed", {
        reason: "score regressed",
        input_score: inputScore,
        output_score: outputScore,
      });
      await deleteAndVerify(jobId, taggedPath, "cleanup");
      setFailed(
        jobId,
        `auto-remediation regressed the score (${inputScore} → ${outputScore})`,
      );
      return;
    }

    // 5. Move tagged output to canonical location and finalize
    await fs.rename(taggedPath, paths.finalOutputPath);
    recordEvent(jobId, "output_ready", {
      output_size_bytes: (await fs.stat(paths.finalOutputPath)).size,
      ttl_seconds: Math.floor(REMEDIATION.OUTPUT_TTL_MS / 1000),
      input_score: inputScore,
      output_score: outputScore,
    });
    setComplete(jobId, paths.finalOutputPath);
  } catch (e) {
    recordEvent(jobId, "error", {
      error_type: "unhandled_exception",
      message: (e as Error).message,
    });
    setFailed(jobId, `worker crashed: ${(e as Error).message}`);
  } finally {
    // Always remove the scratch dir; the final output (if any) is at
    // paths.finalOutputPath, outside workDir.
    await cleanScratch(paths.workDir);
  }
}

// Entry point when invoked as `tsx src/jobs/remediate.ts <jobId>`
const isMain = process.argv[1] && (() => {
  try {
    return resolve(process.argv[1]) === resolve(import.meta.filename ?? "");
  } catch {
    return false;
  }
})();

if (isMain) {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("usage: tsx src/jobs/remediate.ts <jobId>");
    process.exit(2);
  }
  runRemediationJob(jobId).then(
    () => process.exit(0),
    (e) => {
      console.error(`remediation worker failed for ${jobId}:`, e);
      process.exit(1);
    },
  );
}
