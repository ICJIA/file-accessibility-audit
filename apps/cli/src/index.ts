import { runAudit } from "./commands/audit.js";
import { runPublist } from "./commands/publist.js";
import { helpText } from "./audit/options.js";
import { RESET, BOLD, DIM, RED } from "./lib/colors.js";
import { VERSION } from "./version.js";

function printHelp(): void {
  console.log(helpText({ bold: BOLD, dim: DIM, reset: RESET }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sub = args[0];

  if (sub === "--help" || sub === "-h") {
    printHelp();
    process.exit(0);
  }

  if (sub === "--version" || sub === "-v") {
    console.log(`a11y-audit v${VERSION}`);
    process.exit(0);
  }

  if (sub === "publist") {
    await runPublist(args.slice(1));
  } else if (sub === "audit") {
    await runAudit(args.slice(1));
  } else {
    // No command word: the arguments are paths to audit (the original form).
    await runAudit(args);
  }
}

main().catch((err) => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  process.exit(1);
});
