#!/bin/bash
# Deploy app-gox → https://remote.goxprint.com
set -e
cd /var/www/app-gox
echo "→ Pull code..."
git pull
echo "→ Rebuild Docker image..."
docker compose up -d --build
echo "✅ Done! https://remote.goxprint.com"
