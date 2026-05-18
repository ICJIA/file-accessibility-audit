#!/bin/bash
set -e

cd "$(dirname "$0")"

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

echo "Restarting PM2..."
pm2 restart ecosystem.config.cjs

echo "Done. Checking status..."
pm2 status
