# Brochure para la comunidad

Tres piezas de 2000 × 1000 px en español e inglés, para redes sociales y foros:

| Pieza | Archivos | Capturas |
|---|---|---|
| Portada: qué es EVE Ledger | `eve-ledger-brochure-es.png`, `eve-ledger-brochure-en.png` | resumen (delante) y una doctrina (detrás) |
| Doctrinas: quién vuela qué y cuánto cuesta | `eve-ledger-doctrinas-es.png`, `eve-ledger-doctrinas-en.png` | la doctrina (delante) y «Con qué se paga» (detrás) |
| Indicadores y Balances | `eve-ledger-indicadores-es.png`, `eve-ledger-indicadores-en.png` | indicadores (delante) y balances (detrás) |

Salen de `brochure.html` (`?slide=portada|doctrinas|indicadores&lang=es|en&v=0.1.13`), que sigue el design system del dashboard (`docs/design-system-prompt.md`), con las capturas `shot-<pantalla>-<idioma>.jpg`. Datos de demostración: el export real anonimizado («Piloto 1…6») con las fechas desplazadas para que «Hoy» tenga movimientos, y una doctrina de ejemplo (Hurricane, Scimitar y Rifter) con skills sembradas y ESI simulado (precios de Jita incluidos).

Para regenerarlo (fuentes de `apps/web/node_modules`, hace falta `bun install` en `apps/web`): `node render.cjs` con Playwright instalado. Capturas nuevas: levanta la API y la web con datos de demostración y captura a 1320 px de ancho y escala 2 en JPEG (calidad 88); la doctrina, a 1040 px de ancho para que la tabla entera (con los iconos de «Para volarlo ya») quepa en el hueco de la pieza.
