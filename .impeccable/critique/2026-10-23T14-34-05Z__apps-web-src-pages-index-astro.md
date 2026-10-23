---
target: el resumen (index.astro), tras la tanda 17
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:cf8a99e3f73c8ce95f0d58887c693389f6e1db433f0594d6058eeb7a5c61a988"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-23T14-34-05Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Decimoctava crítica — Resumen (`apps/web/src/pages/index.astro`), tras la tanda 17

Demo recién sembrada (6 pilotos al día, último sync hace 14 min, ningún piloto roto), ES, 1320×900 y 390×844. Evaluaciones aisladas y en paralelo; la A puntuó antes de ver el detector. El sync automático de la demo no corrió durante la evaluación.

## Design Health Score

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 4 | Badge con próximo sync, frescura junto a «Hoy» y por piloto, cobertura del historial; cada pestaña es una recarga de ~1 s sin indicador |
| 2 | Lenguaje del usuario | 3 | Vocabulario del juego; «PLEX (cuentas, aparte) + 4,09 B» dice «más» de algo que el piloto pagó |
| 3 | Control y libertad | 3 | Filtros en URL, details reversibles, cookie de inventario; nada pliega «Naves perdidas» ni las tortas |
| 4 | Consistencia | 2 | La misma cifra con dos signos en la tarjeta (ecuación «+ 4,09 B», pie «−4,09 B» en rojo); el coste de las naves en siete números |
| 5 | Prevención de errores | 3 | Poco que romper; las pestañas conservan piloto e inventario |
| 6 | Reconocer mejor que recordar | 3 | Leyendas y cabeceras que ordenan; hay que recordar que 435 = 385 + 49,4 y que −271 M no es el PvP −288 M |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos, 27 Tabs hasta el gráfico, cada cambio una recarga, gráfico a 1100 px con inventario |
| 8 | Estética y minimalismo | 2 | Seis tortas en tres parejas, dos con el mismo centro; pie con tres frases y cinco cifras; «Saldo de los wallets» repite el chip |
| 9 | Recuperación de errores | 3 | Línea de salud, badge en error, estado vacío: correcto, no observable en una demo sana |
| 10 | Ayuda y documentación | 3 | Cada cifra con su fuente o cobertura; la pista de teclado aparece tras un toque en móvil |
| **Total** | | **28/40** | **Bueno** |

## Design Specificity Verdict
LLM: anclado en el producto (ruta Jita–Amarr, mapa con «+94,4 M hoy», mono k/M/B, hora EVE, la ecuación del Resultado, filas de pérdida como bitácora) con una estructura intercambiable: paneles idénticos y seis anillos en tres parejas, dos con el mismo centro (11,5 B / 5,51 B en Por actividad y Pilotos; 435 M / 435 M en Naves perdidas). Carácter perdido: sin icono del casco en las pérdidas, eje sin nada del juego, HUD solo en la franja. Tokens coherentes.
Detector: CLI `[]` en index.astro, components/, layouts/ y todo pages/. Navegador (6 vistas): 18 avisos en el Resumen, todos con contraevidencia (13× text-overflow en la lista sr-only del mapa, 2× elipsis deliberada en BarList, 2× thin-border en elementos hidden, stripes que codifican datos, em-dash por los «—» de sin dato, dark-glow #ffba00 = el propio overlay). Fuera del objetivo: line-length 86–94 en p.price-meta (Indicadores) y p.panel-note (Balances), real y menor; all-caps en grupos de Balances, decisión. Sin pestaña [Human] (Playwright sin cabeza).
Medidas (B): 0 desbordes a 1320 y 390; 0 errores de consola; 27 Tabs antes del gráfico y 1 dentro; 4 animaciones → 0 con reduced-motion; eje −0,4…1,0 B; 1 barra recortada «PLEX −4,09 B»; notas visibles 138 palabras (antes 506); página móvil 8358 px; 320 KB, 8 peticiones en móvil.

## Impresión general
La tanda 17 hizo lo prometido (ecuación auditable, gráfico legible, notas de 506 a 138 palabras). Queda que la tarjeta cuenta el mismo hecho con varios números y dos signos, la página repite sus figuras (tres parejas de tortas, la tarjeta de saldo que duplica el chip) y «dónde ganaste hoy» vive detrás de la preferencia de inventario. Mayor oportunidad: cada hecho con una cifra, un signo y un sitio.

## What's Working
1. La ecuación del Resultado: auditable sin frase, misma gramática en Naves perdidas.
2. El gráfico diario: una parada de Tab, tooltip por teclado, hover y toque, día de PLEX recortado y rotulado, eje legible.
3. Honestidad cuantificada sin ruido; cero desbordes, cero errores, animaciones apagables.

## Priority Issues
- [P1] Una cifra, dos signos; una pérdida, siete cifras: ecuación «PLEX + 4,09 B» vs pie «PLEX / cuentas: −4,09 B» en rojo; naves −115 M / −385 M / −271 M / ~49,4 M / −288 M / 435 M / 505 M. Fix: renombrar la fila («Compra de PLEX, devuelta al resultado»), quitar la línea de PLEX del pie, pie de naves a «−385 M · Ver naves perdidas», centro de los anillos = «Te costaron» o sin centro. /impeccable clarify
- [P1] Seis anillos en tres parejas, dos con centros idénticos (~230 px a 1320, ~700 px en móvil cada pareja). Fix: conservar la de Pilotos; Por actividad con barra apilada o nada; Naves perdidas un anillo o ninguno. Toca la decisión «tortas en las tres tablas». /impeccable distill
- [P1] «Ganado hoy» detrás del conmutador de inventario (por defecto apagado): sin /map ni mapa con «Wallets». Fix: pedir /map siempre que haya ganancias hoy y pintar el mini-mapa en la columna de «Hoy»; el inventario sigue opcional. /impeccable layout
- [P2] La tarjeta «Saldo de los wallets» (1200×80) repite el chip «Todos 29,1 B». Fix: Omega y conmutador al pie de la tarjeta de Resultado; la tarjeta solo con inventario. Toca la décima crítica. /impeccable distill
- [P2] Pista de teclado visible tras un toque (focus-within desde la tanda 17) y cabecera móvil con 125 px para ES/EN/DE y un punto sin texto para el sync. Fix: `.chart:has(:focus-visible)`; idioma al pie en ≤600 px y «hace 14 min» junto al punto. /impeccable adapt
- [P3] La ecuación mide exactamente los 358 px de su columna (cero aire contra el divisor; cifras cortadas en la captura de A): 10 px de aire en la última celda. Retrato sin imagen = cuadrado vacío: iniciales como respaldo. /impeccable polish

## Persona Red Flags
- Alex: recargas de ~1 s sin espera; sin atajos; 27 Tabs; no pliega paneles; vista de un PvE puro medio vacía.
- Sam: titular anunciado tres veces; centros «435 M ISK» sin relación con «Te costaron −385 M»; «más 4,09 B» sin porqué. Bien: h1 único, salto, una parada, aria-current/aria-sort, caption, operadores, salud con nombres.
- Rin (mientras juega): «Hoy +203 M» legible de lejos; «dónde gané hoy» no existe por defecto; pie del vistazo no es lectura de vistazo.
- Dax (revisión del mes): conciliación cuadra; «PLEX 74 % de los gastos» en el anillo frente al PLEX «aparte» del vistazo; la página acaba en Revisión de mercado plegada, sin enlace a Balances.

## Minor Observations
Marca dos veces en 60 px; «ISK» tres veces en el tooltip; mapa móvil sin etiquetas; etiquetas PLEX pegadas a las fechas en 90 días; «neto» como única señal entre vistazo y panel de actividad; «—» de Otros se lee como guion; franja móvil sin indicador de más chips; line-length en Indicadores/Balances; flecha roja primer rojo junto al titular verde.

## Questions to Consider
1. Si los wallets crecieron 5,99 B, ¿por qué la cifra más grande es 9,91 B? ¿Resultado de juego o neto del wallet desde el otro monitor?
2. ¿Por qué el único dato con movimiento se apaga con la preferencia de inventario?
3. Si solo quedara un gráfico además del flujo diario, ¿cuál? ¿Qué responden los otros cinco anillos que la tabla no responda?
4. ¿Debería el Resumen tomar la forma del piloto (PvE puro vs trader con pérdidas)?
