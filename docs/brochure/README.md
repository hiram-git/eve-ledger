# Brochure para la comunidad

Tres piezas de 2000 × 1000 px en español e inglés, para redes sociales y foros:

| Pieza | Archivos | Capturas |
|---|---|---|
| Portada: qué es EVE Ledger | `eve-ledger-brochure-es.png`, `eve-ledger-brochure-en.png` | resumen (delante) y una doctrina (detrás) |
| Doctrinas: quién vuela qué y cuánto cuesta | `eve-ledger-doctrinas-es.png`, `eve-ledger-doctrinas-en.png` | la doctrina (delante) y «Con qué se paga» (detrás) |
| Indicadores y Balances | `eve-ledger-indicadores-es.png`, `eve-ledger-indicadores-en.png` | indicadores (delante) y balances (detrás) |

Salen de `brochure.html` (`?slide=portada|doctrinas|indicadores&lang=es|en&v=0.1.14`), que sigue el design system del dashboard (`docs/design-system-prompt.md`), con las capturas `shot-<pantalla>-<idioma>.jpg` (también las usa el `README.md` de la raíz).

**Datos de demostración, todos inventados** (`demo/seed.ts`): seis pilotos ficticios con 65 días de historial relativos a hoy (ratting en Deklein con ESS, escalaciones y loot vendido, misiones, trading en Jita, couriers, PLEX, donaciones entre ellos), tres naves perdidas (una repuesta con su courier, otra sin reponer, otra con la ventana abierta), inventario en estaciones y citadelas, y una doctrina de ejemplo (Hurricane, Scimitar y Rifter) con skills sembradas y ESI simulado (`demo/esi-mock.ts`, `demo/types.ts`; precios de Jita incluidos). Nada sale de una cuenta real.

Para regenerarlo todo (hace falta `bun install` en `apps/api` y `apps/web`, y Playwright con Chromium): `docs/brochure/demo/run.sh`. Crea una base nueva en una carpeta temporal, levanta la API (con el ESI simulado) y la web en los puertos 3998 y 4398, añade la doctrina, hace las capturas a 1320 px y escala 2 en JPEG (calidad 88; la doctrina a 1040 px, para que la tabla entera con los iconos de «Para volarlo ya» quepa en el hueco de la pieza) y renderiza las piezas con `render.cjs`.
