// PM2 ecosystem config.
//
// Remediation feature flag + tool paths are forwarded from the shell
// environment (process.env), so the flow is:
//
//   export REMEDIATION_ENABLED=true                                # enable feature
//   export REMEDIATION_JAVA_PATH=/path/to/java                     # only if not on PATH
//   export REMEDIATION_VERAPDF_PATH=/opt/verapdf/verapdf           # optional PDF/UA check
//   ./rebuild.sh
//
// `pm2 restart ecosystem.config.cjs --update-env` re-evaluates this file
// for ENVIRONMENT variables only — env values are picked up fresh on every
// redeploy, and unset variables fall back to safe defaults (feature off,
// tool not configured).
//
// It does NOT apply changed RESTART OPTIONS (max_restarts, min_uptime,
// restart_delay, exp_backoff_restart_delay, …) to an already-registered
// process — proved on production 2026-08-08, where 20 deploys had left
// max_restarts unset since v1.59.3 added it. After editing any option here,
// re-register from this file and persist the new process list:
//
//   pm2 delete file-audit-api file-audit-web
//   pm2 start ecosystem.config.cjs
//   pm2 save
//
// (Check required env is exported in the shell first — the delete drops the
// old process's environment. Verify with:
//   pm2 prettylist | grep -E "max_restarts|min_uptime" )
//
// For permanent enable in production, set the vars in /etc/environment
// (or Forge's "Environment" page) so they survive shell sessions.

const remediationEnv = {
  REMEDIATION_ENABLED: process.env.REMEDIATION_ENABLED || "false",
  REMEDIATION_JAVA_PATH: process.env.REMEDIATION_JAVA_PATH || "",
  REMEDIATION_VERAPDF_PATH: process.env.REMEDIATION_VERAPDF_PATH || "",
};

// Restart policy, shared by both apps.
//
// `max_restarts` + `min_uptime` are the pair that matters. Without them PM2
// restarts a process that dies instantly, for ever: a bad deploy or a missing
// binary becomes a silent hot loop that burns CPU and fills the log disk while
// `pm2 status` shows the app "online" between crashes. With them, a process
// that cannot stay up for `min_uptime` 10 times in a row is marked **errored**
// and left down — which is what /status is watching for, and what a human
// should be paged about. Failing visibly beats failing invisibly.
//
// exp_backoff_restart_delay makes the retries spread out rather than hammer,
// so a dependency that is merely slow to come back (the database on a host
// reboot) still recovers on its own.
//
// PM2 STARTS NODE ITSELF (v1.168.1, 2026-11-12) — so max_memory_restart
// measures the server.
//
// Both apps used to start as `script: "pnpm"`, `args: "start"`. The process
// PM2 spawned, and the only pid it measures, was then the pnpm wrapper; the
// server was two processes further down (pnpm -> `sh -c` -> node). Measured on
// production 2026-11-12: PM2 reported about 42 MB for each app while the API
// was using 241 MB and the web app 130 MB. PM2 samples memory on the pid it
// spawned and does not add up children, so the memory cap could never fire.
//
// `script: "node"` below is the same command line `pnpm start` resolves to in
// each app's package.json ("node --import tsx src/index.ts" and
// "node .output/server/index.mjs"), run from the same cwd with the same env.
// If either "start" script changes, change it here too —
// ecosystemConfig.test.ts fails when the two disagree.
//
// A CHANGED `script`/`args` DOES NOT REACH A PROCESS PM2 ALREADY KNOWS through
// `pm2 restart ecosystem.config.cjs` (what rebuild.sh runs): PM2 keeps the
// executable it resolved when the process was first registered. After any
// edit to `script`, `args` or a restart option, re-register on the server:
//
//   pm2 delete file-audit-api file-audit-web     # never `pm2 delete all`:
//   pm2 start ecosystem.config.cjs               # other apps share this PM2
//   pm2 save
//   ./rebuild.sh                                 # refreshes env, health-checks
//
// rebuild.sh compares PM2's pid with the pid listening on each port after
// every deploy and says which of the two states the server is in.
//
// THE CAPS. Until this change the 512M figure had never been enforced, so it
// had never been tested against real use. The API idles near 240 MB and a
// large PDF audit adds the upload and pdf.js working memory on top, so it
// gets 768M (user decision, 2026-11-12); the web app, at about 130 MB, keeps
// 512M. A restart mid-audit loses that audit, which is why the API's cap sits
// well above its working range rather than just above its idle size.
/** The API's own cap — see THE CAPS above. Overrides restartPolicy's. */
const API_MAX_MEMORY = "768M";

const restartPolicy = {
  max_memory_restart: "512M",
  restart_delay: 3000,
  exp_backoff_restart_delay: 100,
  /** Consecutive failed restarts before PM2 gives up and marks it errored. */
  max_restarts: 10,
  /** A process must stay up this long to count as a successful start. */
  min_uptime: 20000,
  /** Log rotation is handled by the pm2-logrotate MODULE, installed on the
   *  server — see docs/process-supervision.md. These two keep the files it
   *  rotates timestamped and in one stream per app. */
  time: true,
  merge_logs: true,
};

module.exports = {
  apps: [
    {
      name: "file-audit-api",
      cwd: "./apps/api",
      script: "node",
      args: "--import tsx src/index.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: 5103,
        // Privileged rate-limit + allowlist-bypass token (see audit.config.ts).
        // Forwarded from the shell / Forge / /etc/environment; empty = off.
        API_PRIVILEGED_TOKEN: process.env.API_PRIVILEGED_TOKEN || "",
        ...remediationEnv,
      },
      watch: false,
      ...restartPolicy,
      max_memory_restart: API_MAX_MEMORY,
    },
    {
      name: "file-audit-web",
      cwd: "./apps/web",
      script: "node",
      args: ".output/server/index.mjs",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: 5102,
        // Bind Nitro to loopback so 5102 is reachable only from this host —
        // nginx proxies to 127.0.0.1. Mirrors the API's DEPLOY.BIND_HOST
        // (pinned equal by bindLoopback.test.ts). New env var: the first
        // deploy must refresh the process env (pm2 restart --update-env) for
        // it to take effect.
        HOST: "127.0.0.1",
        // Web doesn't read the API-side paths but forwarding is harmless
        // and keeps both processes in sync if the flag ever moves.
        ...remediationEnv,
      },
      watch: false,
      ...restartPolicy,
    },
  ],
};
