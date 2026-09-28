---
target: dashboard (apps/web/src/pages/index.astro)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:e9236cd27a5a5a1b465daad4583c6b57deb65786b9907a9818149e753c5cd714"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-28T08-28-26Z
slug: apps-web-src-pages-index-astro
---
# Crítica: dashboard de EVE Ledger (apps/web/src/pages/index.astro)

Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Salud del diseño (Nielsen)

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 2 | Frescura siempre en gris pequeño, nunca escala; la página SSR no se refresca sola; a 90 días no avisa que el historial empieza hace ~20. |
| 2 | Lenguaje del mundo real | 3 | Terminología EVE correcta; ingresos agrupados por ref_type de ESI, no por actividad (PvE/PvP). |
| 3 | Control y libertad | 3 | Pestañas son enlaces (Atrás funciona); el ticker no se puede pausar con teclado. |
| 4 | Consistencia | 2 | Neto cian en el héroe pero verde/rojo en tabla y ticker; guion ASCII en tooltip vs U+2212; «Vincular piloto» duplicado. |
| 5 | Prevención de errores | 3 | Botón de sync con estado de carga; poco más en riesgo. |
| 6 | Reconocer antes que recordar | 3 | Salvedades clave solo en `title`; el ticker obliga a memorizar valores. |
| 7 | Flexibilidad y eficiencia | 2 | Sin vista «hoy»/sesión, sin atajos, tablas sin ordenar; 37 paradas de Tab (30 del gráfico). |
| 8 | Estética y minimalismo | 2 | Marca 3 veces; H1 de 56 px mayor que la respuesta; 170 px de héroe antes de datos; dos tablas de mercado completas. |
| 9 | Recuperación de errores | 2 | Error de sync apunta a «/sync/log» como texto; falta de scope de assets se ve como «—» sin explicar. |
| 10 | Ayuda y documentación | 3 | Notas honestas (valoración, transferencias internas, UTC), pero lejos de lo que explican. |
| **Total** | | **25/40** | **Aceptable** |

## Especificidad del diseño
Piel específica de EVE (HUD, mapa de New Eden, ISK k/M/B, hora EVE) sobre una estructura de plantilla de analítica intercambiable. El elemento más propio (mapa estelar) es decoración con rutas genéricas mientras la geografía real del usuario está en «Dónde está tu inventario». Detector CLI: 0 hallazgos. Overlay en navegador: 19 (30 d), 21 (7 d), 16 (móvil): texto de UI de 10 px ×11–13 (ejes, «TELEMETRÍA»), 3 oclusiones del mapa por el título (DODIXIE, RENS, 0.9), text-overflow sin title en ubicaciones, marquee, glow-line cian, tracking ancho en el pie. 32 etiquetas del mapa bajo contraste (3,35:1 y 2,27:1).

## Problemas prioritarios
1. [P1] El vistazo mientras juegas falla: la respuesta empieza en y≈457 tras marca de 170 px, nav y ticker en movimiento; sin auto-refresco; ventana mínima 7 días. Fix: plegar marca en la barra superior, mapa como franja fina o detrás del neto, neto primero, cifra «Hoy (EVE)», refresco tras cada sync con «actualizado hace X», ticker estático. → layout, distill
2. [P1] El signo del neto no se codifica: `.hero-stat .value` siempre cian; mismo dato verde/rojo en otras partes; rompe «cian solo para acción/estado». Fix: `--positive`/`--critical` o flecha up/down; comparación con período anterior. → colorize, clarify
3. [P1] Cobertura y antigüedad de los datos no se muestran: 90 días sin aviso de historial parcial; frescura no escala; «Sync auto desactivado» casi invisible. Fix: «Historial desde 20 ago (39 de 90 días)», zona sin datos sombreada, aviso cuando > 2× intervalo, piloto desactualizado por fila. → harden, clarify
4. [P2] La arquitectura ignora las prioridades del producto: desglose por ref_type crudo (Mercado bruto a ambos lados), dos tablas de mercado antes de Pilotos. Fix: agrupar por actividad (PvE, PvP/otros, Trading como margen neto) en una lista neta; Pilotos tras el gráfico; mercado fusionado y plegado en «Revisión». → layout, distill
5. [P2] Accesibilidad del gráfico y del ticker: 30–90 divs enfocables sin nombre dentro de role=img, foco casi invisible, tooltip no anunciado, ticker sin pausa (WCAG 2.2.2), sin skip link, ejes a 10 px. Fix: una parada con flechas y aria-label por columna, anillo de foco 2 px, aria-live en tooltip, pausa del ticker, «Saltar al neto», ejes ≥11 px. → harden, audit

## Personas
- Alex (usuario experto): cambio de período recarga todo, sin atajos, sin «hoy», 37 paradas de Tab, tablas sin ordenar, tooltip con cifras completas lentas de leer.
- Sam (teclado/lector de pantalla): columnas sin nombre dentro de role=img, foco invisible, tooltip no anunciado, ticker sin pausa, textos de 10 px, salvedades solo en title, tablas sin caption.
- Piloto mirando el segundo monitor en plena pelea: ticker, naves y ping de Jita en la visión periférica; neto bajo el pliegue en ventana a media altura; no se actualiza tras el sync; ganar y perder se ven igual; sin «esta sesión».

## Observaciones menores
- «Estado de la flota» no es una flota; el subtítulo repite la pestaña activa (mejor el rango de fechas real).
- «Vincular piloto» duplicado y en la misma fila que las pestañas de período.
- Tooltip fijo arriba tapa barras altas; resaltado de columna casi invisible.
- Salvedad de valoración solo al final; falta «precio medio ESI» junto a Inventario.
- Etiquetas de ubicación truncadas sin title (detector: text-overflow).
- Tracking 0.14em en el pie (detector: wide-tracking); glow-line con degradado cian (detector: ai-color-palette).
- Móvil: subtítulo del héroe a 11 px y texto a 14–15 px del borde.
- Mercado vendido (Large Skill Injector 10,1 B) no cuadra con ingresos de Mercado (1,97 B): artefacto de los datos de prueba, pero la UI no permite conciliarlo.
- El primer uso real es el estado vacío: una línea bajo el héroe, sin explicar la retención de 30 días ni por qué vincular los 5 pilotos.
- Falsos positivos del detector: tooltip oculto (sombra), svg del mapa sin aria-hidden (el contenedor sí lo tiene); marquee está permitido por la regla del proyecto, pero sigue necesitando pausa.

## Preguntas
1. ¿Y si el mapa estelar fuera tu New Eden: nodos según dónde está tu inventario y encendidos donde tus pilotos ganaron hoy?
2. Si a mitad de sesión la pregunta es «¿esta sesión voy en positivo?», ¿por qué la ventana mínima es de 7 días?
3. ¿El ticker es información o teatro?
4. ¿El trading debe contar como «ingreso» o ser una sola línea de margen neto para que PvE y PvP sean el titular?
