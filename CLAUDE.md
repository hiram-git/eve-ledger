# EVE Ledger

Control de ingresos, gastos e inventario consolidado de mis 5 personajes de EVE Online, vía ESI.
Proyecto personal, corre solo en localhost. Responder siempre en español neutro.

## Stack
- `apps/api`: Bun + Elysia + Drizzle + SQLite (`bun:sqlite`)
- `apps/web`: Astro (SSR con `@astrojs/node`), lee la API vía `API_URL`
- Un solo usuario, sin multitenant ni login propio. Si crece: migrar a PostgreSQL con Drizzle.

## Decisiones tomadas (no cambiar sin preguntar)
- SSO de EVE con client secret en el backend + `state` (no PKCE: el secreto vive en el servidor).
- Access y refresh tokens cifrados con AES-GCM usando `ENC_KEY` (32 bytes base64). Ver `src/lib/crypto.ts`.
- EVE rota el refresh token en cada renovación: siempre guardar el nuevo (`src/lib/tokens.ts`).
- Si cambia el `owner_hash` de un personaje, se rechaza y hay que revincularlo.
- Todas las llamadas a ESI pasan por `esiGet()` (`src/lib/esi.ts`), que añade `X-Compatibility-Date` y `User-Agent`.
- Sincronización idempotente: los IDs de ESI (`journal_id`, `transaction_id`) son PK; insertar con `onConflictDoNothing`.
- `/summary` excluye las transferencias internas (ambas partes son personajes vinculados): en el consolidado se anulan. El saldo por personaje es el `balance` del último movimiento del journal.
- Migraciones: `bun run db:generate` las crea; se aplican solas al arrancar (`runMigrations()`).

## Esquema (`src/db/schema.ts`)
`characters`, `wallet_journal`, `wallet_transactions`, `sync_log`.

## Estado
- [x] 1. App registrada en developers.eveonline.com (scopes: `esi-wallet.read_character_wallet.v1`, `esi-assets.read_assets.v1`)
- [x] 2. Esquema Drizzle + migración
- [x] 3. Flujo SSO (`/auth/login`, `/auth/callback`) + `GET /characters` + `GET /characters/:id/wallet`
- [x] 4. Sync del wallet journal (`src/services/sync.ts`, `POST /sync/:characterId`, `POST /sync/all`, `GET /sync/log`)
- [x] 5. `GET /summary?days=N` (`src/services/summary.ts`) + dashboard mínimo en Astro (`apps/web`)
- [x] 6b. Cron dentro de la API (`src/services/scheduler.ts`): `syncAll()` cada `SYNC_INTERVAL_MIN` (60 por defecto, 0 lo desactiva). Al arrancar retoma el ritmo desde el último `sync_log`; estado en `GET /sync/status`. Al vincular un personaje se lanza su primer sync en segundo plano.
- [ ] 6a. Vincular los 5 personajes (manual: `http://localhost:3000/auth/login` con cada uno)
- [ ] Después: wallet transactions con nombres de ítems (`/universe/names` o SDE), inventario con `/characters/{id}/assets`

## Paso 4 — especificación
- `src/services/sync.ts`: `syncJournal(characterId)`
  - `GET /characters/{id}/wallet/journal?page=N`, leer header `X-Pages` y recorrer todas las páginas.
  - Mapear a `wallet_journal`, insertar con `onConflictDoNothing`, contar filas nuevas.
  - Registrar inicio/fin/filas/error en `sync_log`; actualizar `characters.last_sync_at`.
- Rutas: `POST /sync/:characterId` y `POST /sync/all` (secuencial, un personaje tras otro).
- ESI cachea el journal ~1 h y solo retiene ~30 días: el valor está en acumular historial desde ya.
- Respetar errores 420/429 de ESI (rate limit): leer headers y esperar, no reintentar en bucle.
  - Implementado en `esiGet()`: pausa global según `X-ESI-Error-Limit-Remain/Reset` (también preventiva si quedan < 10 errores) y `Retry-After` en 429; como mucho un reintento.

## Comandos
- API (`apps/api`): `bun install` · `bun run db:generate` · `bun run dev` (puerto 3000)
- Web (`apps/web`): `bun install` · `bun run dev` (puerto 4321)
