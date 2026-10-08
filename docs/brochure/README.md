# Brochure para redes sociales

`eve-ledger-brochure-es.png` y `eve-ledger-brochure-en.png` (2000 × 1000 px) salen de `brochure.html`, que sigue el design system del dashboard (`docs/design-system-prompt.md`) y monta dos capturas (`shot-dashboard.png`, `shot-losses.png`) tomadas con datos de demostración (el export real anonimizado: «Piloto 1…6», fechas desplazadas para que «Hoy» tenga movimientos).

Para regenerarlo (fuentes de `apps/web/node_modules`, hace falta `bun install` en `apps/web`): `node render.cjs` con Playwright instalado; `brochure.html?lang=en&v=0.2.0` cambia idioma y versión. Para capturas nuevas, levanta la API y la web con datos de demostración y repite las capturas a 1320 px de ancho y escala 2.
