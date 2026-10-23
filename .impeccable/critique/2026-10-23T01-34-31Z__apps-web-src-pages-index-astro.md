---
target: el resumen (index.astro), versión 1.0.0 tras el audit
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:790febb87fc35c2120e406a45b1d2c41a967bba042d1a787365a016510f87640"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-23T01-34-31Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Decimoséptima crítica — Resumen (`apps/web/src/pages/index.astro`), versión 1.0.0 tras el audit

Datos inventados de la demo (6 pilotos), ES, 1320×900 y 390×844. Las dos evaluaciones corrieron aisladas y en paralelo; la A puntuó antes de ver ningún hallazgo del detector. Durante la sesión el sync automático de la demo falló en los 6 pilotos (ESI simulado): artefacto del entorno que sirvió para ver el estado «fallo de sync» en vivo, además del estado sano.

## Design Health Score

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Frescura y «Hay datos nuevos» muy bien; con 6/6 pilotos fallando el badge sigue en verde «Sync auto · próximo dentro de 57 min» (el fallo solo en su `title`) |
| 2 | Lenguaje del usuario | 3 | Vocabulario de juego impecable; tres «netos» en la tarjeta (Resultado / Neto del wallet / Neto en juego) y columnas de pérdidas explicadas solo en `title` |
| 3 | Control y libertad | 3 | Filtros en URL y recarga que respeta la lectura; las cinco secciones descartan `?days` y `?pilot` |
| 4 | Consistencia | 2 | Tortas de pérdidas con «435 M» a 300 px del titular «−385 M» sin leyenda visible; chips sin punto ámbar mientras salud y «Pilotos •» sí avisan; nota «el trading se muestra como su margen» sobre columnas brutas |
| 5 | Prevención de errores de lectura | 3 | «—» en vez de ceros, botón ocupado, `safeBack`; «Las naves de Aria Vex te costaron 0 ISK» a 32 px cuando pagó −107 M por naves de otros |
| 6 | Reconocer mejor que recordar | 2 | 237 `title` con información solo para ratón (cifras completas, significado de columnas, detalle del neto viejo); leyendas de torta en sr-only |
| 7 | Flexibilidad y eficiencia | 3 | Teclado completo en el gráfico, orden por columna, tres idiomas; sin atajos de período ni «expandir todo» |
| 8 | Estética y minimalismo | 2 | 26 notas = 506 palabras (31 % del texto de `main`), 7 tortas iguales, móvil de 7.096 px (8,4 pantallas) sin inventario y 8.707 con él |
| 9 | Recuperación de errores | 3 | Línea de salud con causa y acción funciona en vivo; seis veces la misma línea sin agrupar (177 px en móvil) |
| 10 | Ayuda y documentación | 3 | Contextual y honesta, pero repartida en 26 notas y 237 tooltips; sin un «Cómo se calcula» único |
| **Total** | | **27/40** | **Aceptable** |

## Design Specificity Verdict
LLM: anclado en EVE por el vocabulario (k/M/B en mono, hora EVE, pilotos como entidad, actividades con pistas, filas de pérdida como bitácora, PLEX/Omega, mapa «tu New Eden»), no por la forma: cada sección es el mismo panel y tres seguidas abren con el mismo par de tortas de 120 px (siete en la página); el vistazo habla al piloto y los paneles al contable. Oportunidades perdidas: el mapa con datos solo existe con «+ inventario» aunque «ganado hoy» es dato del journal; marcos de icono vacíos de 26 px; el eje no marca «hoy» ni el downtime.
Detector: CLI `[]` en index.astro, components/, layouts/ y todo pages/ (comprobado que procesa .astro). Navegador (6 vistas): 18 avisos en el Resumen a 1320, todos clasificados: 13× text-overflow en la lista sr-only del mapa (falso positivo), 2× text-overflow con elipsis deliberada en BarList (falso positivo), 2× thin-border-wide-shadow en elementos `hidden` (advisory), 1× repeating-stripes por las franjas documentadas (advisory). Fuera del objetivo: line-length 86–94 en `p.price-meta` (Indicadores) y `p.panel-note` (Balances), real y menor; all-caps en grupos de Balances (decisión). El dark-glow #ffba00 es el propio overlay. Inyección correcta en Playwright sin cabeza: no hay pestaña [Human] visible en esta sesión.

## Impresión general
La respuesta llega la primera (titular a y=346 / y=427, ~1 s) y la honestidad ya es sistema; falla lo que viene justo después: la tarjeta da y quita en el mismo golpe de vista, el único gráfico está escalado por una compra de PLEX que el Resultado dice que va «aparte», y la página se explica en cada carga con 506 palabras. Mayor oportunidad: que el PLEX salga de todas las vistas de flujo por defecto y que cada panel se explique una vez, plegado.

## What's Working
1. La pregunta se contesta antes de leer: «+9,91 B» con flecha, «Hoy» con ingresos/gastos y la frescura pegada; gráfico accesible (una parada de Tab, flechas, Inicio/Fin, tooltip al foco, toque que elige el día más cercano en móvil).
2. Degradación con calma en el fallo de sync en vivo: tarjeta gris, «Datos de hace 1 h» ámbar, gráfico desaturado, chip en gris; causa y acción en un solo sitio.
3. La fila de pérdida como narración: quién, dónde, cuánto y qué falta en una línea de 13 px que no se contradice.

## Priority Issues
- [P1] El gráfico diario está escalado por el PLEX (eje −5 B…1 B por una barra de −4,19 B; ingresos ≤ 31 px, gastos normales ≤ 12 px; `DailyChart.astro` l. 37–41 usa income/expenses con accounts). Fix: eje sin `accounts`, día con PLEX recortado al borde con etiqueta, cifra completa en la tabla. /impeccable clarify
- [P1] Tres «netos» en la tarjeta y la comparación es de otra cifra que el titular (Resultado +9,91 B vs flecha roja del Neto del wallet; en la vista de Aria el PLEX dobla el titular). Fix: comparar Resultado con Resultado anterior (previous.accounts + pérdidas del período anterior desde computeLosses) y frase → `.equation` como en Indicadores. /impeccable clarify
- [P1] Prosa explicativa permanente: 26 notas, 506 palabras (31 % de main), cuatro párrafos bajo Pilotos, lección de pérdidas en cada carga, nota obsoleta «se muestra como su margen» (i18n l. 548) sobre columnas brutas; móvil 7.096–8.707 px. Fix: una nota cuantitativa por panel + details «Cómo se calcula»; plegar tortas y tabla de pérdidas en ≤600 px; tarjetas de piloto reducidas. /impeccable distill + adapt
- [P2] Patrimonio: `.coverage-note { flex-basis: 100% }` en columna flex (index.astro l. 1755–1757) deja el ⚠ huérfano a 120 px del texto; sin nota, 270 px vacíos bajo el mapa. Fix: width: 100%; figure.new-eden flex: 1 1 auto; min-height 160px. /impeccable layout
- [P2] Señales de sync que no se ponen de acuerdo: badge verde con 6/6 fallos (Base.astro solo off/busy), chips sin punto (isStale por tiempo, no hasIssue), seis líneas de salud idénticas, badge móvil de 6 px sin texto. Fix: cls error con «6 pilotos con error», chips con hasIssue(), agrupar la línea de salud, icono en móvil. /impeccable harden

## Persona Red Flags
- Alex: las secciones descartan ?days/?pilot; 27 Tabs hasta el gráfico; conmutadores y pestañas son navegaciones completas que cierran los details; cifras completas solo en 237 title; «quién ganó qué» a 3,4 pantallas.
- Sam: titular anunciado dos veces (sr-only con céntimos); seis «Revisar» idénticos sin piloto; cabeceras de pérdidas explicadas solo en title. Bien: una parada de Tab, aria-sort, aria-current, operadores sr-only, fieldsets con leyenda.
- Rin (ratter mientras juega): el mapa «Ganado hoy» exige + inventario; Resultado y Hoy al mismo tamaño; «próximo dentro de N min» a 12 px y ausente en móvil; sin recarga automática con un details abierto.
- Dax (revisión del mes): gráfico inutilizado por el PLEX; seis details de uno en uno; tres totales de pérdidas sin leyenda; Revisión de mercado toda en rojo y sin orden; sin antes/ahora por actividad o piloto; pierde el filtro al cambiar de sección.

## Minor Observations
Tres relojes idénticos en las pestañas de período; --cyan-dim 3,96:1 no sirve para texto; 24 nodos de texto a 7–9 px en el mapa decorativo; «+5,99 B de este neto vienen de datos viejos» cuando es el 100 %; tagline móvil parte «vía / ESI»; tooltip táctil tapa ~60 % del trazado; torta de ingresos por piloto al 72 % aporta poco; «hace 1 h» seis veces en Último sync; h2 sr-only «Resultado · Patrimonio» une dos tarjetas; pie de la tarjeta con cinco cifras en 14 px; line-length en Indicadores/Balances; marcos de icono vacíos.

## Questions to Consider
1. Si el PLEX va «aparte», ¿por qué domina el gráfico, la torta de gastos (74 %) y la Revisión de mercado?
2. ¿Para quién son las 506 palabras de notas: para ti (ya las sabes) o para la corp (una vez, en «Cómo se calcula»)?
3. El saldo sale tres veces y «quién ganó hoy» ninguna hasta la tabla: ¿la franja no debería mostrar el dato de la pregunta principal?
4. ¿Debe una tarjeta apagarse en gris por un fallo de hace 3 min sobre datos de hace 1 h?
