# EVE Ledger

Control de ingresos, gastos e inventario consolidado de mis 5 personajes de EVE Online, vía ESI.
Proyecto personal, corre solo en localhost. Responder siempre en español neutro.

## Stack
- `apps/api`: Bun + Elysia + Drizzle + SQLite (`bun:sqlite`)
- `apps/web`: Astro (SSR con `@astrojs/node`), lee la API vía `API_URL`. Tema oscuro tipo HUD en `src/styles/theme.css`. Fuentes autoalojadas con `@fontsource` (Inter para la interfaz, IBM Plex Mono solo para cifras y datos, Barlow Condensed solo para el logotipo). Colores de datos: ingresos `#2a98c0`, gastos `#e8604c`, inventario `#9a7cf0`, validados sobre el fondo de los paneles; no reutilizarlos como colores de interfaz.
- Contexto de producto para el diseño en `PRODUCT.md` (generado con `/impeccable init`: usuario, uso mientras juega y en revisión, «¿gano o pierdo ISK?» como pregunta principal, pilotos PvE + PvP). Live mode configurado en `.impeccable/live/config.json`.
- Diseño: skill **impeccable** instalado en `.claude/skills/impeccable` (versión y origen en `UPSTREAM`; agentes en `.claude/agents/`). Sin sus hooks automáticos: tras cambiar UI, correr `.claude/skills/impeccable/scripts/impeccable detect --json <archivos>`. Reglas adoptadas: sin eyebrows sobre títulos ni números de sección, el cian solo para acciones/estado, el signo del neto en verde/rojo (`--positive`/`--critical`) y avisos en ámbar (`--warning`). Único movimiento: el pulso de los sistemas con ganancias hoy en el mapa.
- Un solo usuario, sin multitenant ni login propio. Si crece: migrar a PostgreSQL con Drizzle.

## Decisiones tomadas (no cambiar sin preguntar)
- SSO de EVE con client secret en el backend + `state` (no PKCE: el secreto vive en el servidor).
- Access y refresh tokens cifrados con AES-GCM usando `ENC_KEY` (32 bytes base64). Ver `src/lib/crypto.ts`.
- EVE rota el refresh token en cada renovación: siempre guardar el nuevo (`src/lib/tokens.ts`).
- Si cambia el `owner_hash` de un personaje, se rechaza y hay que revincularlo.
- Todas las llamadas a ESI pasan por `esiGet()` / `esiPost()` (`src/lib/esi.ts`), que añaden `X-Compatibility-Date` y `User-Agent` y comparten el control de rate limit.
- Sincronización idempotente: los IDs de ESI (`journal_id`, `transaction_id`) son PK; insertar con `onConflictDoNothing`.
- Nombres de ESI (ítems, estaciones…) en la tabla `names`, resueltos con `POST /universe/names` (`src/services/names.ts`). Los IDs que ESI no reconoce se guardan como `unknown` para no repetir el 404. Las estructuras de jugadores (IDs > 1e12) quedan sin nombre: requieren el scope `esi-universe.read_structures.v1`.
- Las compras/ventas entre personajes propios (`client_id` vinculado) se excluyen del top de ítems.
- Inventario (`assets`): es una foto, no un historial. En cada sync se reemplazan los assets del personaje (upsert por `item_id`, así un ítem que pasa a otro personaje se mueve). `root_location_id` = estación/estructura/sistema final, subiendo por naves y contenedores.
- Valoración: precio medio global de `GET /markets/prices` (tabla `market_prices`, refresco como mucho cada hora). No es el precio de venta de Jita. Las copias de blueprint valen 0.
- Si un personaje no tiene el scope `esi-assets.read_assets.v1`, se salta su inventario (hay que revincularlo).
- Mapa «tu New Eden» (`GET /map`, `src/services/geo.ts`): sistemas con inventario (tamaño = valor) y sistemas donde se ganó ISK hoy (journal con `context_id_type = system_id`). Estación → sistema → coordenadas vía `/universe/stations` y `/universe/systems` (públicos), en caché en `station_systems` y `systems`; se resuelven en cada sync (tope 150 llamadas). Las citadelas quedan «sin ubicar».
- «Hoy» = desde las 00:00 EVE (UTC). La comparación con el período anterior solo se muestra si el historial lo cubre entero; los días anteriores al primer sync se muestran como «sin historial», no como cero.
- Datos «desactualizados» cuando el último sync supera 2× el intervalo (2 h si el cron está apagado). El dashboard se recarga solo tras cada sync automático (`/status.json` en la web).
- `/summary` excluye las transferencias internas (ambas partes son personajes vinculados): en el consolidado se anulan. El saldo por personaje es el `balance` del último movimiento del journal.
- Migraciones: `bun run db:generate` las crea; se aplican solas al arrancar (`runMigrations()`).

## Esquema (`src/db/schema.ts`)
`characters`, `wallet_journal`, `wallet_transactions` (con `client_id` y `journal_ref_id`), `names`, `assets`, `market_prices`, `systems`, `station_systems`, `sync_log` (con `kind`: `journal` | `transactions` | `assets`).

## Estado
- [x] 1. App registrada en developers.eveonline.com (scopes: `esi-wallet.read_character_wallet.v1`, `esi-assets.read_assets.v1`)
- [x] 2. Esquema Drizzle + migración
- [x] 3. Flujo SSO (`/auth/login`, `/auth/callback`) + `GET /characters` + `GET /characters/:id/wallet`
- [x] 4. Sync del wallet journal (`src/services/sync.ts`, `POST /sync/:characterId`, `POST /sync/all`, `GET /sync/log`)
- [x] 5. `GET /summary?days=N` (`src/services/summary.ts`) + dashboard mínimo en Astro (`apps/web`)
- [x] 6b. Cron dentro de la API (`src/services/scheduler.ts`): `syncAll()` cada `SYNC_INTERVAL_MIN` (60 por defecto, 0 lo desactiva). Al arrancar retoma el ritmo desde el último `sync_log`; estado en `GET /sync/status`. Al vincular un personaje se lanza su primer sync en segundo plano.
- [ ] 6a. Vincular los 5 personajes (manual: `http://localhost:3000/auth/login` con cada uno)
- [x] 7. Wallet transactions + nombres de ítems: `syncCharacter()` hace journal → transacciones (paginando con `from_id`) → nombres pendientes. `GET /transactions`, `market` en `/summary` y tablas de ítems en el dashboard.
- [x] 9. Rediseño guiado por `/impeccable critique` (25/40): vistazo mientras juegas (neto + «Hoy» arriba, auto-refresco), mapa «tu New Eden», neto con signo y comparación, avisos de cobertura y antigüedad.
- [x] 8. Inventario + precios: `syncCharacter()` añade assets → precios (si tienen > 1 h) → nombres. `GET /inventory` (valor por personaje, ubicación e ítem), `GET /assets` (detalle) y sección de inventario en el dashboard.

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
