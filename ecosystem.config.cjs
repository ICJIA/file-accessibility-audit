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
// `pm2 restart ecosystem.config.cjs` re-evaluates this file, so the
// values are picked up fresh on every redeploy. Unset variables fall
// back to safe defaults (feature off, tool not configured).
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
      script: "pnpm",
      args: "start",
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
    },
    {
      name: "file-audit-web",
      cwd: "./apps/web",
      script: "pnpm",
      args: "start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: 5102,
        // Web doesn't read the API-side paths but forwarding is harmless
        // and keeps both processes in sync if the flag ever moves.
        ...remediationEnv,
      },
      watch: false,
      ...restartPolicy,
    },
  ],
};
