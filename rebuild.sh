#!/bin/bash
set -e

cd "$(dirname "$0")"

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
