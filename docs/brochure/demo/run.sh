#!/usr/bin/env bash
# Regenerates the README and brochure screenshots with made-up data (seed.ts) and the mocked ESI (esi-mock.ts):
# new database in a temporary folder, demo API and web on their own ports, sample doctrine and screenshots.
# Automatic sync is on so the header doesn't warn; the next one is due an hour after the last seeded
# sync (12 min ago), so it doesn't get to run while the screenshots are taken.
# Requirements: bun install in apps/api and apps/web, and Playwright with Chromium. Usage: docs/brochure/demo/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"
API_PORT=3998
WEB_PORT=4398
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$TMP"' EXIT

export DB_PATH="$TMP/ledger.db" MIGRATIONS_DIR="$ROOT/apps/api/drizzle" BACKUP_DIR="$TMP/backups"
bun "$HERE/seed.ts"

# A server left over from an earlier run would serve the old data: refuse to start on a busy port
for port in $API_PORT $WEB_PORT; do
  if curl -sf -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then echo "puerto $port ocupado: para ese servidor antes" >&2; exit 1; fi
done
# bun runs in the background directly (no subshell): the trap kills the servers, not just a shell around them
PORT=$API_PORT HOST=127.0.0.1 SYNC_INTERVAL_MIN=60 EVE_CLIENT_ID=demo \
  EVE_CALLBACK_URL="http://127.0.0.1:$API_PORT/auth/callback" WEB_URL="http://127.0.0.1:$WEB_PORT" \
  ENC_KEY="$(head -c 32 /dev/urandom | base64)" bun --preload "$HERE/esi-mock.ts" "$ROOT/apps/api/src/index.ts" >"$TMP/api.log" 2>&1 &
[ -f "$ROOT/apps/web/dist/server/entry.mjs" ] || (cd "$ROOT/apps/web" && bunx astro build)
API_URL="http://127.0.0.1:$API_PORT" PORT=$WEB_PORT HOST=127.0.0.1 bun "$ROOT/apps/web/dist/server/entry.mjs" >"$TMP/web.log" 2>&1 &
for _ in $(seq 40); do curl -sf "http://127.0.0.1:$API_PORT/characters" >/dev/null && curl -sf -o /dev/null "http://127.0.0.1:$WEB_PORT/" && break; sleep 0.5; done

DEMO_API="http://127.0.0.1:$API_PORT" bun "$HERE/doctrine.ts"
DEMO_WEB="http://127.0.0.1:$WEB_PORT" node "$HERE/shots.cjs"
node "$HERE/../render.cjs"
