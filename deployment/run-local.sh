#!/usr/bin/env bash
# Run the Bringin' It Home API on a local server.
# Usage: bash deployment/run-local.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies"
  npm install
fi

echo "==> Initializing local database"
npm run app:db:init

PORT="${PORT:-3000}"
echo "==> Starting API at http://localhost:${PORT}"
exec node app/bringin-it-home/server.js
