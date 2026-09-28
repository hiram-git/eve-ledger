# EVE Ledger — API

## Arranque
1. Crea la app en https://developers.eveonline.com
   - Callback: `http://localhost:3000/auth/callback`
   - Scopes: `esi-wallet.read_character_wallet.v1`, `esi-assets.read_assets.v1`
2. `cp .env.example .env` y completa CLIENT_ID, CLIENT_SECRET y ENC_KEY
3. `bun install`
4. `bun run db:generate` (genera las migraciones; se aplican solas al arrancar)
5. `bun run dev`
6. Abre http://localhost:3000/auth/login y entra con un personaje
7. Prueba: http://localhost:3000/characters/<id>/wallet
8. Sincroniza wallet e inventario (journal + transacciones + assets + precios + nombres):
   - `curl -X POST http://localhost:3000/sync/<id>` (un personaje)
   - `curl -X POST http://localhost:3000/sync/all` (todos, en secuencia)
   - `curl http://localhost:3000/sync/log` (últimas ejecuciones y errores)
9. Sync automático: la API sincroniza todos los personajes cada `SYNC_INTERVAL_MIN` minutos (60 por defecto; `0` lo desactiva).
   Estado en http://localhost:3000/sync/status. Al vincular un personaje se sincroniza enseguida.
10. Resumen consolidado: http://localhost:3000/summary?days=30 (lo consume el dashboard de `apps/web`)
11. Transacciones con nombres: http://localhost:3000/transactions?days=30 (filtros opcionales: `characterId`, `typeId`, `limit`)
12. Inventario valorado: http://localhost:3000/inventory · detalle en http://localhost:3000/assets (filtros: `characterId`, `locationId`, `typeId`, `limit`)
13. Mapa «tu New Eden»: http://localhost:3000/map (sistemas con inventario y ganancias de hoy, con coordenadas de ESI)
