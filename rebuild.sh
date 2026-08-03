#!/bin/bash
set -e

cd "$(dirname "$0")"

# ---------------------------------------------------------------------
# Failure banner.
#
# set -e above aborts this script on the first failed command, so a
# broken build can never reach the pm2 restart at the bottom. That
# abort is easy to miss under a wall of compiler output, though — so
# this EXIT trap spells out what happened: whether PM2 was touched,
# and (once git pull has moved HEAD) how to put the source tree back.
#
# The trap only prints. It never rolls anything back by itself.
# ---------------------------------------------------------------------
_stage="preflight"
_pre_pull_sha=""
_on_exit() {
  _status=$?
  set +e  # a failure inside the banner must not truncate the banner
  if [ "$_status" -eq 0 ]; then
    exit 0
  fi
  echo ""
  echo "======================================================================"
  case "$_stage" in
    pm2-restart)
      echo "  DEPLOY FAILED during PM2 restart (exit $_status)."
      echo "  Process state is uncertain — inspect it with:"
      echo "      pm2 status && pm2 logs --lines 50"
      ;;
    pm2-restarted)
      echo "  Deploy succeeded, but a post-restart step failed (exit $_status)."
      echo "  The new version IS live; verify with: pm2 status"
      ;;
    *)
      echo "  DEPLOY ABORTED during: $_stage (exit $_status)"
      echo "  PM2 was NOT restarted — the previously deployed version is still"
      echo "  running."
      _head_now=$(git rev-parse HEAD 2>/dev/null)
      if [ -n "$_pre_pull_sha" ] && [ -n "$_head_now" ] && \
         [ "$_head_now" != "$_pre_pull_sha" ]; then
        echo ""
        echo "  NOTE: git pull already moved this checkout to ${_head_now:0:12}."
        echo "  The API runs from source via tsx, so an unrelated PM2 restart"
        echo "  (crash, memory limit, reboot) would boot that unvalidated code."
        echo "  To roll the source back to the last deployed commit:"
        echo "      git reset --hard $_pre_pull_sha && pnpm install --frozen-lockfile"
      fi
      ;;
  esac
  echo "======================================================================"
  exit "$_status"
}
trap _on_exit EXIT

# ---------------------------------------------------------------------
# Remediation feature flag.
#
# Three ways to set this on a deploy, in priority order:
#
#   1. Pre-set the env var when invoking — wins outright:
#        REMEDIATION_ENABLED=true  ./rebuild.sh   # explicit on
#        REMEDIATION_ENABLED=false ./rebuild.sh   # explicit off
#
#   2. Interactive prompt — only when run from a TTY (typing
#      `./rebuild.sh` at an ssh session). Defaults to YES; hit Enter
#      to accept, or type `n` to deploy audit-only.
#
#   3. Non-interactive default (Forge webhook, CI, anything without a
#      TTY) — falls through to YES so a stock auto-deploy stands up
#      the full pipeline without manual intervention.
#
# This pairs with the auto-detection of REMEDIATION_VERAPDF_PATH
# below, so a fresh deploy on a server with veraPDF installed lights
# up the full pipeline end-to-end with one ./rebuild.sh call.
# ---------------------------------------------------------------------
if [ -n "$REMEDIATION_ENABLED" ]; then
  : # already set by the caller — respect it
elif [ -t 0 ]; then
  # Interactive TTY — ask. Default is yes; hit Enter or type y/yes
  # for on, type n/no for off. Anything else falls through to on.
  echo ""
  printf "Enable remediation feature on this deploy? [Y/n] "
  read -r _ans
  case "$_ans" in
    [nN]|[nN][oO]) REMEDIATION_ENABLED=false ;;
    *)             REMEDIATION_ENABLED=true ;;
  esac
  unset _ans
else
  # Non-interactive (webhook / CI / piped stdin) — default to on.
  REMEDIATION_ENABLED=true
fi
export REMEDIATION_ENABLED

if [ "$REMEDIATION_ENABLED" = "true" ]; then
  echo "Remediation feature: ENABLED"
else
  echo "Remediation feature: disabled (audit-only deploy)"
fi
echo ""

# Check for required system dependencies
echo "Checking system dependencies..."

if ! command -v qpdf &> /dev/null; then
  echo "WARNING: qpdf is not installed. Image detection and PDF structure analysis will be limited."
  echo "  Install with: sudo apt-get install qpdf  (Debian/Ubuntu)"
  echo "            or: brew install qpdf           (macOS)"
  echo ""
fi

if ! command -v pnpm &> /dev/null; then
  echo "ERROR: pnpm is not installed. Install with: npm install -g pnpm"
  exit 1
fi

# Java runtime for OpenDataLoader (PDF auto-remediation feature)
if ! command -v java &> /dev/null; then
  echo "WARNING: java is not installed. PDF auto-remediation will be"
  echo "  unavailable until you install OpenJDK 17:"
  echo "    sudo apt install -y openjdk-17-jre-headless    (Ubuntu/Debian)"
  echo "    brew install openjdk@17                        (macOS)"
  echo ""
else
  JAVA_VERSION_LINE=$(java -version 2>&1 | head -1)
  JAVA_MAJOR=$(echo "$JAVA_VERSION_LINE" | grep -oE '"[0-9]+' | tr -d '"' | head -1)
  if [ -z "$JAVA_MAJOR" ] || [ "$JAVA_MAJOR" -lt 11 ]; then
    echo "WARNING: java ${JAVA_MAJOR:-?} found; PDF remediation needs 11 or"
    echo "  newer. Upgrade with: sudo apt install -y openjdk-17-jre-headless"
    echo ""
  fi
fi

# Confirm qpdf supports --object-streams (used by remediation preprocessing).
# qpdf 12.x reorganized help output, so version-based check is reliable.
# --object-streams=disable shipped in qpdf 10.x.
if command -v qpdf &> /dev/null; then
  QPDF_VERSION_LINE=$(qpdf --version 2>/dev/null | head -1)
  QPDF_MAJOR=$(echo "$QPDF_VERSION_LINE" | grep -oE '[0-9]+' | head -1)
  if [ -z "$QPDF_MAJOR" ] || [ "$QPDF_MAJOR" -lt 10 ]; then
    echo "WARNING: qpdf < 10.x detected — --object-streams=disable may not be supported."
    echo "  PDF remediation will skip the preprocessing step on tagged-input"
    echo "  PDFs, which may cause output corruption on InDesign/Word inputs."
    echo "  Upgrade qpdf to 10.x or newer."
    echo ""
  fi
fi

# veraPDF for PDF/UA-1 conformance reporting (optional but recommended
# for IITAA compliance disclosure on the remediation result page).
# Auto-detects at common install locations if REMEDIATION_VERAPDF_PATH
# isn't already set in the environment.
if [ -z "$REMEDIATION_VERAPDF_PATH" ]; then
  for candidate in \
    /opt/verapdf/verapdf \
    /home/forge/verapdf/verapdf \
    "$HOME/verapdf/verapdf" \
    /usr/local/bin/verapdf; do
    if [ -x "$candidate" ]; then
      REMEDIATION_VERAPDF_PATH="$candidate"
      export REMEDIATION_VERAPDF_PATH
      break
    fi
  done
fi

if [ -n "$REMEDIATION_VERAPDF_PATH" ] && [ -x "$REMEDIATION_VERAPDF_PATH" ]; then
  VERAPDF_VERSION=$("$REMEDIATION_VERAPDF_PATH" --version 2>/dev/null | head -1 || echo "unknown")
  echo "✓ veraPDF found: $REMEDIATION_VERAPDF_PATH ($VERAPDF_VERSION)"
  # Warn if the path isn't persisted in /etc/environment — PM2 won't see
  # it on a fresh server boot otherwise.
  if [ -f /etc/environment ] && ! grep -q '^REMEDIATION_VERAPDF_PATH' /etc/environment 2>/dev/null; then
    echo "  NOTE: this path is set in the current shell only. To persist it"
    echo "  so PM2 inherits it across reboots, run:"
    echo "    echo 'REMEDIATION_VERAPDF_PATH=$REMEDIATION_VERAPDF_PATH' | sudo tee -a /etc/environment"
    echo ""
  fi
elif [ -n "$REMEDIATION_VERAPDF_PATH" ]; then
  echo "WARNING: REMEDIATION_VERAPDF_PATH is set to '$REMEDIATION_VERAPDF_PATH'"
  echo "  but that path is not executable. veraPDF conformance checks will"
  echo "  be skipped. Verify the path or unset the variable."
  echo ""
else
  echo "NOTE: veraPDF not installed. PDF/UA-1 conformance reporting on the"
  echo "  remediation result page will show 'veraPDF check was not run'."
  echo ""
  echo "  To install on this Ubuntu server (one-time, ~30 MB download,"
  echo "  requires OpenJDK 17+ which the Java check above already verifies):"
  echo ""
  echo "    cd /opt"
  echo "    sudo curl -L -o verapdf-installer.zip \\"
  echo "         https://software.verapdf.org/rel/verapdf-installer.zip"
  echo "    sudo unzip verapdf-installer.zip"
  echo "    cd verapdf-greenfield-*"
  echo "    # Text-mode installer. Type 1 to accept license; press Enter for"
  echo "    # each remaining prompt (default install path will be /opt/verapdf)."
  echo "    sudo java -jar verapdf-izpack-installer-*.jar -console"
  echo "    cd /opt && sudo rm -rf verapdf-greenfield-* verapdf-installer.zip"
  echo "    /opt/verapdf/verapdf --version    # verify"
  echo ""
  echo "  Then make the path persistent for PM2 (one-time):"
  echo ""
  echo "    echo 'REMEDIATION_VERAPDF_PATH=/opt/verapdf/verapdf' | sudo tee -a /etc/environment"
  echo "    source /etc/environment"
  echo ""
  echo "  Then re-run ./rebuild.sh — the preflight above will find veraPDF"
  echo "  and the result-page disclaimer card will start showing the actual"
  echo "  PDF/UA-1 verdict for every remediation."
  echo ""
fi

echo "Pulling latest changes..."
_stage="git-pull"
_pre_pull_sha=$(git rev-parse HEAD 2>/dev/null || true)
git checkout -- .
git pull origin main

# ---------------------------------------------------------------------
# Re-exec after the pull, because that pull may have replaced THIS FILE.
#
# bash reads a script lazily, by byte offset — it does not slurp the whole
# file up front. So when `git pull` rewrites rebuild.sh mid-run, bash keeps
# reading from its saved offset into the NEW contents. Best case it silently
# runs the previous version of the later steps (which is exactly what
# happened on the v1.41.1 deploy: the fixed smoke checks were pulled but the
# OLD ones executed). Worst case the offset lands mid-line and bash executes
# a fragment of a command.
#
# Re-executing once, only when the pull actually moved HEAD, means the rest
# of the deploy always runs the code that was just fetched. The guard env var
# stops this from recursing.
# ---------------------------------------------------------------------
if [ -z "${REBUILD_REEXECED:-}" ]; then
  _post_pull_sha=$(git rev-parse HEAD 2>/dev/null || true)
  if [ -n "$_pre_pull_sha" ] && [ "$_pre_pull_sha" != "$_post_pull_sha" ]; then
    echo "Pull moved HEAD ${_pre_pull_sha:0:12} -> ${_post_pull_sha:0:12}; re-running the updated script..."
    export REBUILD_REEXECED=1
    export REBUILD_PRE_PULL_SHA="$_pre_pull_sha"
    exec bash "$0" "$@"
  fi
fi
# Preserve the original pre-pull SHA across the re-exec so the failure banner
# still prints a rollback target that predates this deploy.
if [ -n "${REBUILD_PRE_PULL_SHA:-}" ]; then
  _pre_pull_sha="$REBUILD_PRE_PULL_SHA"
fi

echo "Installing dependencies..."
_stage="pnpm-install"
pnpm install --frozen-lockfile

echo "Building..."
_stage="build"
pnpm build

# Load app secrets persisted in /etc/environment so PM2 inherits them even when
# this script runs in a shell that didn't pick them up at login (/etc/environment
# is only applied to fresh login sessions — the gotcha that makes a rotated
# token silently fail to deploy). Extract specific vars BY NAME; never source the
# whole file, so a PATH= line there can't clobber the PATH that resolves pnpm/pm2.
_stage="load-secrets"
if [ -f /etc/environment ]; then
  for _var in API_PRIVILEGED_TOKEN; do
    _line=$(grep -E "^${_var}=" /etc/environment | tail -n1 || true)
    if [ -n "$_line" ]; then
      _val=${_line#*=}
      _val=${_val#\"}; _val=${_val%\"}   # tolerate optional surrounding quotes
      export "${_var}=${_val}"
    fi
  done
  unset _var _line _val
fi
if [ -n "$API_PRIVILEGED_TOKEN" ]; then
  echo "API_PRIVILEGED_TOKEN: set (${#API_PRIVILEGED_TOKEN} chars) — privileged rate-limit tier ON"
else
  echo "API_PRIVILEGED_TOKEN: not set — privileged rate-limit tier OFF (everyone strict)"
fi

echo "Restarting PM2..."
# --update-env so rotated secrets (e.g. API_PRIVILEGED_TOKEN) actually refresh;
# a plain `pm2 restart` reuses the env snapshot from the original `pm2 start`.
_stage="pm2-restart"
pm2 restart ecosystem.config.cjs --update-env
_stage="pm2-restarted"

echo "Done. Checking status..."
pm2 status

# ---------------------------------------------------------------------
# Post-deploy smoke checks.
#
# Non-fatal by design: PM2 has already restarted successfully by this
# point, so a failed probe here is information, not a reason to abort a
# deploy that otherwise worked.
#
# These exist because two of the paths below have silently 404'd in
# production for months. Nothing in the build catches it: the files are
# correct in .output/public, and every OTHER static asset serves fine —
# nginx intercepts these two specific paths before they ever reach Nuxt.
# ---------------------------------------------------------------------
SMOKE_URL="${SMOKE_URL:-https://audit.icjia.app}"

# One request. Prints the HTTP status, or 000 if there was no response.
#
# Uses --head for HEAD, NEVER `-X HEAD`. With -X HEAD curl still waits for a
# response body, which a HEAD response never sends, so it blocks until
# --max-time and exits non-zero — which on the first version of this script
# printed the real code AND the fallback, producing a nonsense "502000".
#
# `|| true` keeps `set -e` from aborting the deploy on a failed probe: by this
# point PM2 has already restarted successfully and a bad probe is information,
# not a reason to abort.
_http_code() {
  _m=""
  [ "${2:-GET}" = "HEAD" ] && _m="--head"
  _c=$(curl -s $_m -o /dev/null -w '%{http_code}' --max-time 20 "${SMOKE_URL}$1" 2>/dev/null || true)
  [ -n "$_c" ] || _c="000"
  printf '%s' "$_c"
}

# Wait for the app to actually accept requests before probing.
#
# `pm2 restart` returns as soon as the process is SPAWNED, not when it is
# listening. Probing immediately measures our own impatience: the first
# version of this block reported 502s against a completely healthy deploy.
echo ""
printf "Waiting for the app to accept requests"
_ready=0
for _i in $(seq 1 30); do
  if [ "$(_http_code /healthz GET)" = "200" ]; then
    _ready=1
    echo " ready."
    break
  fi
  printf "."
  sleep 2
done
if [ "$_ready" -eq 0 ]; then
  echo ""
  echo "  (still not answering after 60s — probing anyway; results below may"
  echo "   reflect a slow start rather than a real fault)"
fi

echo ""
echo "Post-deploy smoke checks against ${SMOKE_URL} ..."

_probe() {
  # $1 = path, $2 = expected status, $3 = method (GET | HEAD)
  _code=$(_http_code "$1" "${3:-GET}")
  if [ "$_code" = "$2" ]; then
    echo "  ✓ ${3:-GET} $1 -> $_code"
    return 0
  fi
  echo "  ✗ ${3:-GET} $1 -> $_code (expected $2)"
  return 1
}

_smoke_failed=0

# The app itself. HEAD is checked explicitly because uptime monitors
# send it by default and these routes 404'd it before v1.40.3.
_probe /healthz 200 GET  || _smoke_failed=1
_probe /status  200 GET  || _smoke_failed=1
_probe /status  200 HEAD || _smoke_failed=1

# Static files nginx is known to intercept. See the note below.
_robots_ok=1
_probe /robots.txt  200 GET || _robots_ok=0
_probe /favicon.ico 200 GET || _robots_ok=0

if [ "$_robots_ok" -eq 0 ]; then
  cat <<'ROBOTS_HINT'

  ---------------------------------------------------------------
  robots.txt and/or favicon.ico are 404ing.

  This is an nginx configuration issue, NOT a build problem — both
  files ARE present in apps/web/.output/public, and every other
  static asset serves correctly.

  Cause: Laravel Forge's default vhost template contains

      location = /favicon.ico { access_log off; log_not_found off; }
      location = /robots.txt  { access_log off; log_not_found off; }

  An exact-match `location =` block outranks the proxy_pass to
  Nuxt, and resolves against the vhost `root` (Forge's default
  /home/forge/<site>/public) — which holds neither file for a Nuxt
  app. So nginx answers 404 itself and never forwards the request.

  Fix: edit the site's nginx config (Forge UI, or
  /etc/nginx/sites-available/<site>), DELETE those two location
  blocks, then:

      sudo nginx -t && sudo service nginx reload

  Impact while broken: the entire robots.txt is missing in
  production, so no Disallow rule is being honoured by crawlers.
  /status and /healthz are still protected by their X-Robots-Tag
  response headers, but /login, /my-history, /history and /publist
  have no such backstop.
  ---------------------------------------------------------------

ROBOTS_HINT
  _smoke_failed=1
fi

if [ "$_smoke_failed" -eq 0 ]; then
  echo ""
  echo "✓ All post-deploy smoke checks passed."
else
  echo ""
  echo "WARNING: one or more post-deploy checks failed (see above)."
  echo "         The deploy itself succeeded; these are runtime/config issues."
fi
