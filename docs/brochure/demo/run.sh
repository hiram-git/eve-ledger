#!/usr/bin/env bash
# Regenera las capturas del README y del brochure con datos inventados (seed.ts) y el ESI simulado (esi-mock.ts):
# base nueva en una carpeta temporal, API y web de la demo en puertos propios, doctrina de ejemplo y capturas.
# El sync automático va encendido para que la cabecera no avise; el siguiente toca a la hora del último sync
# sembrado (hace 12 min), así que no llega a correr mientras se capturan.
# Requisitos: bun install en apps/api y apps/web, y Playwright con Chromium. Uso: docs/brochure/demo/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"
API_PORT=3998
WEB_PORT=4398
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$TMP"' EXIT

export DB_PATH="$TMP/ledger.db" MIGRATIONS_DIR="$ROOT/apps/api/drizzle" BACKUP_DIR="$TMP/backups"
bun "$HERE/seed.ts"

(cd "$HERE" && PORT=$API_PORT HOST=127.0.0.1 SYNC_INTERVAL_MIN=60 EVE_CLIENT_ID=demo \
  EVE_CALLBACK_URL="http://127.0.0.1:$API_PORT/auth/callback" WEB_URL="http://127.0.0.1:$WEB_PORT" \
  ENC_KEY="$(head -c 32 /dev/urandom | base64)" bun --preload ./esi-mock.ts "$ROOT/apps/api/src/index.ts" >"$TMP/api.log" 2>&1) &
[ -f "$ROOT/apps/web/dist/server/entry.mjs" ] || (cd "$ROOT/apps/web" && bunx astro build)
(cd "$ROOT/apps/web" && API_URL="http://127.0.0.1:$API_PORT" PORT=$WEB_PORT HOST=127.0.0.1 bun ./dist/server/entry.mjs >"$TMP/web.log" 2>&1) &
for _ in $(seq 40); do curl -sf "http://127.0.0.1:$API_PORT/characters" >/dev/null && curl -sf -o /dev/null "http://127.0.0.1:$WEB_PORT/" && break; sleep 0.5; done

DEMO_API="http://127.0.0.1:$API_PORT" bun "$HERE/doctrine.ts"
DEMO_WEB="http://127.0.0.1:$WEB_PORT" node "$HERE/shots.cjs"
node "$HERE/../render.cjs"
