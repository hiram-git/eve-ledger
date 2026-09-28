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
8. Sincroniza el wallet journal:
   - `curl -X POST http://localhost:3000/sync/<id>` (un personaje)
   - `curl -X POST http://localhost:3000/sync/all` (todos, en secuencia)
   - `curl http://localhost:3000/sync/log` (últimas ejecuciones y errores)
