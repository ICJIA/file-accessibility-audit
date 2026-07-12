import { spawn } from "node:child_process";

interface SuiteResult {
  name: string;
  passed: number | null;
  failed: number | null;
  total: number | null;
  files: number | null;
  ok: boolean;
}

function runSuite(name: string, filter: string): Promise<SuiteResult> {
  return new Promise((resolve) => {
    const result: SuiteResult = {
      name,
      passed: null,
      failed: null,
      total: null,
      files: null,
      ok: false,
    };
    let output = "";

    const proc = spawn("pnpm", ["--filter", filter, "test"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    proc.stdout!.on("data", (d) => {
      const text = d.toString();
      output += text;
      process.stdout.write(text);
    });
    proc.stderr!.on("data", (d) => {
      const text = d.toString();
      output += text;
      process.stderr.write(text);
    });

    proc.on("close", (code) => {
      // Parse vitest output for test counts. This is best-effort: the exit
      // code is what actually determines pass/fail below, so if vitest ever
      // changes its summary format and these regexes stop matching, we fall
      // back to "n/a" counts instead of silently reporting a false 0.
      const testsLine = output.match(/Tests\s+(\d+)\s+passed/);
      const failedMatch = output.match(/Tests\s+(\d+)\s+failed/);
      const filesLine = output.match(/Test Files\s+(\d+)\s+passed/);
      const filesFailedMatch = output.match(/Test Files\s+(\d+)\s+failed/);

      if (testsLine || failedMatch) {
        result.passed = testsLine ? parseInt(testsLine[1], 10) : 0;
        result.failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
        result.total = result.passed + result.failed;
      }

      if (filesLine || filesFailedMatch) {
        result.files =
          (filesLine ? parseInt(filesLine[1], 10) : 0) +
          (filesFailedMatch ? parseInt(filesFailedMatch[1], 10) : 0);
      }

      // Exit code is authoritative regardless of whether counts parsed.
      result.ok = code === 0;

      resolve(result);
    });
  });
}

async function main() {
  console.log("\n");

  const results = await Promise.all([
    runSuite("API", "api"),
    runSuite("Web", "web"),
    // Package name, not a bare "cli" — pnpm --filter matches on the
    // package.json "name" field, and apps/cli is published as
    // @icjia/a11y-audit. A bare "cli" filter matches zero projects and
    // (silently) exits 0, which is how this suite went unrun before.
    runSuite("CLI", "@icjia/a11y-audit"),
  ]);

  const totalPassed = results.reduce((s, r) => s + (r.passed ?? 0), 0);
  const totalFailed = results.reduce((s, r) => s + (r.failed ?? 0), 0);
  const totalTests = totalPassed + totalFailed;
  const totalFiles = results.reduce((s, r) => s + (r.files ?? 0), 0);
  const allOk = results.every((r) => r.ok);

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("  TEST SUMMARY");
  console.log("═".repeat(60));

  for (const r of results) {
    const icon = r.ok ? "\x1b[32m✔\x1b[0m" : "\x1b[31m✖\x1b[0m";
    const counts =
      r.passed === null
        ? "n/a"
        : r.failed !== null && r.failed > 0
          ? `\x1b[32m${r.passed} passed\x1b[0m, \x1b[31m${r.failed} failed\x1b[0m`
          : `\x1b[32m${r.passed} passed\x1b[0m`;
    const files = r.files === null ? "n/a" : r.files;
    console.log(`  ${icon} ${r.name.padEnd(8)} ${counts} (${files} files)`);
  }

  console.log("─".repeat(60));

  if (allOk) {
    console.log(`  \x1b[32m✔ ${totalTests} tests passed\x1b[0m across ${totalFiles} files`);
  } else {
    console.log(
      `  \x1b[31m✖ ${totalFailed} failed\x1b[0m, \x1b[32m${totalPassed} passed\x1b[0m of ${totalTests} tests across ${totalFiles} files`,
    );
  }

  console.log("═".repeat(60) + "\n");

  process.exit(allOk ? 0 : 1);
}

main();
