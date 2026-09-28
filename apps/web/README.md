# EVE Ledger — Web

Dashboard mínimo en Astro (SSR con `@astrojs/node`). Lee `GET /summary` de la API en cada visita.

## Arranque
1. Arranca la API (`apps/api`: `bun run dev`)
2. `cp .env.example .env` si la API no está en `http://localhost:3000`
3. `bun install`
4. `bun run dev` → http://localhost:4321

Producción local: `bun run build && bun run start`.

## Qué muestra
- Neto, ingresos, gastos y saldo total del período (7 / 30 / 90 días)
- Flujo diario (ingresos arriba, gastos abajo) con tooltip y vista de tabla
- Ingresos y gastos por `ref_type`
- Mercado por ítem (lo más vendido y comprado)
- Inventario: valor total, dónde está y los ítems más valiosos (precio medio de ESI)
- Tabla por personaje con saldo, inventario, neto y último sync
- Botón «Sincronizar ahora» → `POST /sync/all` de la API

Diseño: tema oscuro tipo HUD (`src/styles/theme.css`), con mapa estelar animado en la cabecera (`StarMap.astro`) y ticker de telemetría. Fuentes autoalojadas (`@fontsource`), funciona sin conexión. Las animaciones se desactivan con «reducir movimiento» del sistema. Revisado con el skill impeccable (`/impeccable polish`).

Las transferencias entre tus propios personajes se excluyen del consolidado (se anulan entre sí).
