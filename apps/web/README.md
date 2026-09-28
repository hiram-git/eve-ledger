# EVE Ledger — Web

Dashboard mínimo en Astro (SSR con `@astrojs/node`). Lee `GET /summary` de la API en cada visita.

## Arranque
1. Arranca la API (`apps/api`: `bun run dev`)
2. `cp .env.example .env` si la API no está en `http://localhost:3000`
3. `bun install`
4. `bun run dev` → http://localhost:4321

Producción local: `bun run build && bun run start`.

## Idiomas
Español (predeterminado), inglés y alemán, con el selector ES · EN · DE de la barra superior; la elección se guarda en una cookie. Los textos están en `src/lib/i18n.ts`.

## Qué muestra
- Neto del período (7 / 30 / 90 días) con signo, comparación con el período anterior y la cifra de «Hoy» (hora EVE)
- Patrimonio (wallets + inventario) con el mapa «tu New Eden»: dónde está tu inventario y dónde ganaste ISK hoy
- Avisos de historial parcial y de datos desactualizados; se recarga sola tras cada sync automático
- Flujo diario (ingresos arriba, gastos abajo) con tooltip y vista de tabla
- Ingresos y gastos por `ref_type`
- Mercado por ítem (lo más vendido y comprado)
- Inventario: valor total, dónde está y los ítems más valiosos (precio medio de ESI)
- Tabla por personaje con saldo, inventario, neto y último sync
- Página **Pilotos** (`/pilotos`): vincular personajes (vuelta del login de EVE con aviso de éxito o error), estado de sync, permisos, cifras y sync o revinculación por piloto; plazas libres según `PILOT_SLOTS`
- Botón «Sincronizar ahora» → `POST /sync/all` de la API

Diseño: tema oscuro tipo HUD (`src/styles/theme.css`), con el mapa de New Eden en el panel de patrimonio (`NewEdenMap.astro`). Fuentes autoalojadas (`@fontsource`), funciona sin conexión. Las animaciones se desactivan con «reducir movimiento» del sistema. Revisado con el skill impeccable (`/impeccable polish`).

Las transferencias entre tus propios personajes se excluyen del consolidado (se anulan entre sí).
