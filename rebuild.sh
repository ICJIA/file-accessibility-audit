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

echo "Pulling latest changes..."
git pull origin main

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building..."
pnpm build

echo "Restarting PM2..."
pm2 restart ecosystem.config.cjs

echo "Done. Checking status..."
pm2 status
