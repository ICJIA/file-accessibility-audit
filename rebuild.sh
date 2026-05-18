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
if [ -n "$REMEDIATION_VERAPDF_PATH" ]; then
  if [ ! -x "$REMEDIATION_VERAPDF_PATH" ]; then
    echo "WARNING: REMEDIATION_VERAPDF_PATH is set to '$REMEDIATION_VERAPDF_PATH'"
    echo "  but that path is not executable. veraPDF conformance checks will"
    echo "  be skipped and the result-page disclaimer will show 'veraPDF not"
    echo "  configured'. Verify the path or unset the variable."
    echo ""
  fi
else
  echo "NOTE: veraPDF not configured (REMEDIATION_VERAPDF_PATH unset)."
  echo "  PDF/UA-1 conformance reporting on the remediation result page will"
  echo "  show 'veraPDF check was not run'. To enable: download from"
  echo "  https://verapdf.org/ , install, and set REMEDIATION_VERAPDF_PATH"
  echo "  to the installed 'verapdf' shell script."
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
