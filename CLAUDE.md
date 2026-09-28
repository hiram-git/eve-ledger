# EVE Ledger

Control de ingresos, gastos e inventario consolidado de mis 5 personajes de EVE Online, vía ESI.
Proyecto personal, corre solo en localhost. Responder siempre en español neutro.

## Stack
- `apps/api`: Bun + Elysia + Drizzle + SQLite (`bun:sqlite`)
- `apps/web`: Astro (pendiente)
- Un solo usuario, sin multitenant ni login propio. Si crece: migrar a PostgreSQL con Drizzle.

## Decisiones tomadas (no cambiar sin preguntar)
- SSO de EVE con client secret en el backend + `state` (no PKCE: el secreto vive en el servidor).
- Access y refresh tokens cifrados con AES-GCM usando `ENC_KEY` (32 bytes base64). Ver `src/lib/crypto.ts`.
- EVE rota el refresh token en cada renovación: siempre guardar el nuevo (`src/lib/tokens.ts`).
- Si cambia el `owner_hash` de un personaje, se rechaza y hay que revincularlo.
- Todas las llamadas a ESI pasan por `esiGet()` (`src/lib/esi.ts`), que añade `X-Compatibility-Date` y `User-Agent`.
- Sincronización idempotente: los IDs de ESI (`journal_id`, `transaction_id`) son PK; insertar con `onConflictDoNothing`.
- Migraciones: `bun run db:generate` las crea; se aplican solas al arrancar (`runMigrations()`).

## Esquema (`src/db/schema.ts`)
`characters`, `wallet_journal`, `wallet_transactions`, `sync_log`.

## Estado
- [x] 1. App registrada en developers.eveonline.com (scopes: `esi-wallet.read_character_wallet.v1`, `esi-assets.read_assets.v1`)
- [x] 2. Esquema Drizzle + migración
- [x] 3. Flujo SSO (`/auth/login`, `/auth/callback`) + `GET /characters` + `GET /characters/:id/wallet`
- [ ] 4. Sync del wallet journal
- [ ] 5. `GET /summary` + dashboard mínimo en Astro
- [ ] 6. Vincular los 5 personajes + cron cada 60 min (`POST /sync/all`)
- [ ] Después: wallet transactions con nombres de ítems (`/universe/names` o SDE), inventario con `/characters/{id}/assets`

## Paso 4 — especificación
- `src/services/sync.ts`: `syncJournal(characterId)`
  - `GET /characters/{id}/wallet/journal?page=N`, leer header `X-Pages` y recorrer todas las páginas.
  - Mapear a `wallet_journal`, insertar con `onConflictDoNothing`, contar filas nuevas.
  - Registrar inicio/fin/filas/error en `sync_log`; actualizar `characters.last_sync_at`.
- Rutas: `POST /sync/:characterId` y `POST /sync/all` (secuencial, un personaje tras otro).
- ESI cachea el journal ~1 h y solo retiene ~30 días: el valor está en acumular historial desde ya.
- Respetar errores 420/429 de ESI (rate limit): leer headers y esperar, no reintentar en bucle.

## Comandos
- `bun install` · `bun run db:generate` · `bun run dev`
