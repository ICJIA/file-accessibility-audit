#!/bin/bash
set -e

cd "$(dirname "$0")"

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
git checkout -- .
git pull origin main

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building..."
pnpm build

# Load app secrets persisted in /etc/environment so PM2 inherits them even when
# this script runs in a shell that didn't pick them up at login (/etc/environment
# is only applied to fresh login sessions — the gotcha that makes a rotated
# token silently fail to deploy). Extract specific vars BY NAME; never source the
# whole file, so a PATH= line there can't clobber the PATH that resolves pnpm/pm2.
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
pm2 restart ecosystem.config.cjs --update-env

echo "Done. Checking status..."
pm2 status
