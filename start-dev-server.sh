#!/bin/bash
# start-dev-server.sh — local dev convenience wrapper around `pnpm dev`.
#
# Sets the remediation feature flag and any environment paths needed for
# the PDF auto-remediation pipeline to run end-to-end on a developer's
# machine. Without this script you'd have to remember to export these
# variables every time you start the dev server:
#
#   REMEDIATION_ENABLED=true
#   REMEDIATION_JAVA_PATH=<path to brew openjdk>
#   REMEDIATION_VERAPDF_PATH=<path to verapdf>  # optional
#
# The script auto-detects the Java path for macOS (Apple Silicon + Intel)
# and Ubuntu/Linux. It does not require sudo. It is safe to re-run.

set -e
cd "$(dirname "$0")"

# Colour helpers (only when stdout is a TTY)
if [ -t 1 ]; then
  C_RESET=$'\033[0m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'
else
  C_RESET=""; C_DIM=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""
fi

print_header() {
  echo ""
  echo "${C_BOLD}${C_BLUE}┃ ${1}${C_RESET}"
}
print_ok()    { echo "  ${C_GREEN}✓${C_RESET} ${1}"; }
print_warn()  { echo "  ${C_YELLOW}!${C_RESET} ${1}"; }
print_info()  { echo "  ${C_DIM}${1}${C_RESET}"; }

# --------------------------------------------------------------------
# 1. Feature flag
# --------------------------------------------------------------------
print_header "Feature flag"
export REMEDIATION_ENABLED=true
print_ok "REMEDIATION_ENABLED=true (auto-remediation feature ON)"

# --------------------------------------------------------------------
# 2. Java path detection
# --------------------------------------------------------------------
print_header "Java runtime"
JAVA_CANDIDATES=(
  "/opt/homebrew/opt/openjdk@17/bin/java"   # macOS Apple Silicon (brew)
  "/opt/homebrew/opt/openjdk/bin/java"      # macOS Apple Silicon (brew latest)
  "/usr/local/opt/openjdk@17/bin/java"      # macOS Intel (brew)
  "/usr/local/opt/openjdk/bin/java"         # macOS Intel (brew latest)
  "/usr/lib/jvm/java-17-openjdk-amd64/bin/java"   # Ubuntu/Debian amd64
  "/usr/lib/jvm/java-17-openjdk-arm64/bin/java"   # Ubuntu/Debian arm64
  "/usr/bin/java"                                  # last-resort (Ubuntu apt install)
)
JAVA_PATH=""
for candidate in "${JAVA_CANDIDATES[@]}"; do
  if [ -x "$candidate" ]; then
    JAVA_PATH="$candidate"
    break
  fi
done

if [ -z "$JAVA_PATH" ]; then
  print_warn "Could not auto-detect a Java 11+ installation."
  print_info "Remediation will fail at runtime until Java is installed."
  print_info "Install: brew install openjdk@17 (macOS) or"
  print_info "         sudo apt install -y openjdk-17-jre-headless (Ubuntu)"
else
  # Verify it actually works
  JAVA_VERSION_RAW=$("$JAVA_PATH" -version 2>&1 | head -1 || true)
  if echo "$JAVA_VERSION_RAW" | grep -q "Unable to locate a Java Runtime"; then
    # macOS stub at /usr/bin/java
    print_warn "Found '$JAVA_PATH' but it's the macOS stub (no real JRE behind it)."
    print_info "Install brew openjdk: brew install openjdk@17"
    JAVA_PATH=""
  else
    JAVA_MAJOR=$(echo "$JAVA_VERSION_RAW" | grep -oE '"[0-9]+' | tr -d '"' | head -1)
    if [ -z "$JAVA_MAJOR" ] || [ "$JAVA_MAJOR" -lt 11 ]; then
      print_warn "Java at '$JAVA_PATH' reports version $JAVA_MAJOR (need 11+)."
    else
      export REMEDIATION_JAVA_PATH="$JAVA_PATH"
      print_ok "Java $JAVA_MAJOR found: $JAVA_PATH"
      print_info "REMEDIATION_JAVA_PATH exported"
    fi
  fi
fi

# --------------------------------------------------------------------
# 3. veraPDF detection (optional)
# --------------------------------------------------------------------
print_header "veraPDF (PDF/UA conformance validator, optional)"
VERAPDF_CANDIDATES=(
  "/opt/verapdf/verapdf"
  "/Applications/verapdf/verapdf"
  "$HOME/verapdf/verapdf"
  "/usr/local/bin/verapdf"
)
VERAPDF_PATH=""
for candidate in "${VERAPDF_CANDIDATES[@]}"; do
  if [ -x "$candidate" ]; then
    VERAPDF_PATH="$candidate"
    break
  fi
done
# Also check the PATH directly
if [ -z "$VERAPDF_PATH" ] && command -v verapdf > /dev/null 2>&1; then
  VERAPDF_PATH=$(command -v verapdf)
fi

if [ -n "$VERAPDF_PATH" ]; then
  export REMEDIATION_VERAPDF_PATH="$VERAPDF_PATH"
  print_ok "veraPDF found: $VERAPDF_PATH"
  print_info "REMEDIATION_VERAPDF_PATH exported"
else
  print_info "veraPDF not detected (optional)."
  print_info "Remediation will still work; the result page will show"
  print_info "'veraPDF check was not run' in the compliance disclaimer."
  print_info "Install: download from https://verapdf.org/"
fi

# --------------------------------------------------------------------
# 4. qpdf check (required at runtime; not exported but verified)
# --------------------------------------------------------------------
print_header "qpdf"
if command -v qpdf > /dev/null 2>&1; then
  QPDF_VERSION_LINE=$(qpdf --version 2>/dev/null | head -1)
  print_ok "${QPDF_VERSION_LINE}"
  # qpdf 12.x reorganized help into topic pages, so grepping the
  # top-level --help for 'object-streams' produces a false negative.
  # Version-based check is reliable: --object-streams=disable shipped
  # in qpdf 10.x and remains supported in every release since.
  QPDF_MAJOR=$(echo "$QPDF_VERSION_LINE" | grep -oE '[0-9]+' | head -1)
  if [ -z "$QPDF_MAJOR" ] || [ "$QPDF_MAJOR" -lt 10 ]; then
    print_warn "qpdf < 10.x detected — --object-streams=disable may not be supported."
    print_info "Remediation will skip preprocessing on tagged-input PDFs."
    print_info "Upgrade: brew upgrade qpdf (macOS) or apt upgrade qpdf (Ubuntu)."
  fi
else
  print_warn "qpdf not found on PATH."
  print_info "Audit pipeline and remediation BOTH need this."
  print_info "Install: brew install qpdf (macOS)"
  print_info "         sudo apt install -y qpdf (Ubuntu)"
fi

# --------------------------------------------------------------------
# 5. Summary + launch
# --------------------------------------------------------------------
print_header "Starting pnpm dev"
echo "  ${C_DIM}API:${C_RESET} http://localhost:5103"
echo "  ${C_DIM}Web:${C_RESET} http://localhost:5102"
echo "  ${C_DIM}Press Ctrl-C to stop.${C_RESET}"
echo ""

# exec replaces the shell so Ctrl-C cleanly propagates to pnpm
exec pnpm dev
