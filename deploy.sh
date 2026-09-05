#!/bin/bash
# Deploy app-gox → https://remote.goxprint.com
# Usage: bash deploy.sh (run on VPS where docker is installed)
set -e

cd /var/www/app-gox

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploying app-gox (React SPA)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "→ Step 1: Pull latest code..."
git pull origin main || git pull

echo ""
echo "→ Step 2: Rebuild Docker image and start container..."
docker compose up -d --build

echo ""
echo "→ Step 3: Verify container is running..."
docker compose ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Access: https://remote.goxprint.com"
echo ""
