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
  REMEDIATION_ENABLED: process.env.REMEDIATION_ENABLED || 'false',
  REMEDIATION_JAVA_PATH: process.env.REMEDIATION_JAVA_PATH || '',
  REMEDIATION_VERAPDF_PATH: process.env.REMEDIATION_VERAPDF_PATH || '',
}

module.exports = {
  apps: [
    {
      name: 'file-audit-api',
      cwd: './apps/api',
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 5103,
        // Privileged rate-limit + allowlist-bypass token (see audit.config.ts).
        // Forwarded from the shell / Forge / /etc/environment; empty = off.
        API_PRIVILEGED_TOKEN: process.env.API_PRIVILEGED_TOKEN || '',
        ...remediationEnv,
      },
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
    },
    {
      name: 'file-audit-web',
      cwd: './apps/web',
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 5102,
        // Web doesn't read the API-side paths but forwarding is harmless
        // and keeps both processes in sync if the flag ever moves.
        ...remediationEnv,
      },
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
    },
  ],
}
