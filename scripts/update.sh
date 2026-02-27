#!/bin/bash
# Athletiq update script

echo "🔄 Updating Athletiq..."

# Pull latest (if using git)
# git pull

# Rebuild images
docker compose build --no-cache

# Restart with zero downtime
docker compose up -d

echo "✅ Update complete!"
docker compose ps
