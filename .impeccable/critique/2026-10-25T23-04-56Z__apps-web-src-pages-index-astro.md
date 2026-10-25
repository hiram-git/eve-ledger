---
target: el resumen (index.astro), tras la ronda 3 de review/audit y la crítica 19
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:9b499651f83ba7041be0bbbdc4e4b3f137914711fdd15ba6d9051cb172fea42b"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-25T23-04-56Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Vigésima crítica — Resumen (`apps/web/src/pages/index.astro`), tras la tercera ronda de review/audit y la crítica 19

Demo recién sembrada (6 pilotos al día, último sync hace 15 min), ES, 1320×900, 960 y 390×844. Evaluaciones aisladas y en paralelo; la A puntuó antes de ver el detector.

## Design Health Score

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Badge (también «hace 15 min» en móvil), frescura y chips correctos; la tira del mapa en móvil es un punto sin texto dentro de su caja |
| 2 | Lenguaje del usuario | 3 | La misma cifra con tres nombres («Naves que no volvieron», «No repuesto (patrimonio que no volvió)», «No volvió»); «Margen neto» en una fila sin margen |
| 3 | Control y libertad | 3 | El conmutador «Wallets / + inventario» salta ~350 px al pulsarlo; «Naves perdidas» (1040 px) no se pliega |
| 4 | Consistencia | 3 | El azul es Ingresos, PvE y Aria en tres paneles seguidos; el naranja, Gastos, PvP y Lio; «0» y «—» para el cero |
| 5 | Prevención de errores | 3 | Poco que romper; las pestañas conservan piloto e inventario |
| 6 | Reconocer mejor que recordar | 3 | «Ver detalle por actividad» lleva a un panel sin los netos de la tarjeta (+615 M de Trading hay que calcularlo) |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos; 28 Tabs hasta el gráfico; 4073 px en escritorio y 6782 en móvil |
| 8 | Estética y minimalismo | 3 | Vistazo limpio; el pie de la tarjeta de Neto son tres franjas (133 de 497 px); huecos junto a las tortas |
| 9 | Recuperación de errores | 3 | Según las decisiones; no observable en una demo sana |
| 10 | Ayuda y documentación | 3 | Cobertura y conciliación bien; «Trading es el margen» en vistas sin Trading |
| **Total** | | **29/40** | **Bueno** |

## Veredicto de especificidad

**Revisión (A):** por encima del pliegue, hecho para este producto (ruta Jita–Amarr, ecuación del Resultado con el PLEX devuelto y las naves que no volvieron, hora EVE, día de PLEX recortado y rayado, pulso de VFK-IV). Por debajo, tres paneles seguidos con la misma plantilla (título, pareja de tortas, tabla); en «Por actividad» y «Pilotos» las tortas quedan a la izquierda con ~900 px vacíos a la derecha; solo «Naves perdidas» pone cada torta junto a su tabla. La paleta categórica choca con los colores de datos.

**Detector (B):** CLI limpio (código 0, `[]`) en la página, los 14 componentes y `Base.astro`. En el navegador, 6 reglas: `gpt-thin-border-wide-shadow` (aviso «Hay datos nuevos» y tooltip, capas flotantes ocultas: falso positivo), `text-overflow` en la lista del mapa (solo para lectores de pantalla en escritorio: falso positivo), `em-dash-overuse` («—» de sin dato: falso positivo), `repeating-stripes-gradient` (rayado del PLEX en el gráfico, su leyenda y ahora la muestra de la torta: intencionado) y **un problema real menor**: `text-overflow` en los nombres de sede de «Dónde está tu inventario» (`BarList`, columna de 11rem: «Amarr VIII (Oris) - Emperor Family Academy» se corta 93 px; el nombre completo solo en `title`, que no se ve en táctil).

## Estado de la crítica 19
Resueltos: ingresos y gastos en la fila «Neto del wallet», color por piloto en todas las tortas, PLEX rayado en «Por actividad», mini-mapa en tira en escritorio, badge móvil. A medias: el rayado del PLEX no llegó a «Gastos por piloto», y en móvil la tira es un punto en una caja con el texto fuera.

## Lo que funciona
1. La ecuación con los brutos en su fila: se audita sin prosa y cuadra también en la vista de un piloto.
2. El gráfico diario: una parada de Tab, `aria-label` con la barra recortada, tooltip por teclado, pista solo con foco de teclado.
3. El color que sigue al piloto en pérdidas y en Pilotos, con las naves en grises.

## Problemas prioritarios
1. **[P2] «Ver detalle por actividad» lleva a un panel sin los netos de la tarjeta.** El panel solo tiene brutos; la pista de Trading dice «Margen neto» sin mostrarlo; «Trading es el margen» sale en vistas sin Trading; con una sola actividad, anillo al 100 %. Arreglo: el neto en cada fila (columna o `.row-meta`), pista «ventas − compras − comisiones = +615 M», nota solo con Trading, sin anillo con una actividad. Choca con la decisión de la cuarta crítica («panel = detalle, sin repetir netos»). → `/impeccable clarify`
2. **[P2] La paleta categórica repite los colores de ingresos y gastos en paneles contiguos.** `--cat-1` (azul) es PvE y Aria justo después de un gráfico donde azul es ingreso; `--cat-2` (naranja) es PvP y Lio junto al rojo de gastos. Arreglo: la paleta solo para pilotos; actividades con otro canal (tono neutro con tintes, o un tramo lejos del azul y el rojo), validado con la skill dataviz. → `/impeccable colorize`
3. **[P2] El PLEX va aparte en «Gastos por actividad» pero no en «Gastos por piloto».** Allí es el 74 % sólido de Aria. Arreglo: la porción de PLEX de cada piloto rayada en su color y «X sin PLEX» bajo la torta; decidir un solo color base para el rayado (en el gráfico va sobre rojo, en la torta sobre gris). → `/impeccable clarify`
4. **[P2] El pie de la tarjeta de Neto son tres franjas y el conmutador cambia de sitio.** «No incluye 350 M movidos entre tus pilotos» es tautológico en el consolidado; dos enlaces a Indicadores; con «+ inventario» el conmutador salta ~350 px. Arreglo: una fila de pie (naves | Omega), la línea de transferencias solo en la vista de un piloto, un enlace a Indicadores, el conmutador siempre en el mismo sitio. → `/impeccable distill`
5. **[P3] La página no tiene atajos para recorrerla.** 4073/6782 px; «Naves perdidas» siempre abierto (1040 px). Arreglo: plegar la tabla por nave, tortas junto a su tabla en «Por actividad» y «Pilotos», atajos de período. → `/impeccable layout`

## Señales de alarma por persona
- **Alex:** sin atajos; 28 Tabs hasta el gráfico; el conmutador se mueve; sin neto por actividad en el detalle.
- **Sam:** «Hoy (EVE)» no es encabezado; los `summary` de «Por actividad» se anuncian sin pausas («TradingMargen neto; los totales son brutosIngresos 1,63 B…»); dos enlaces seguidos a Indicadores; Aria y PvE con el mismo color.
- **Rin (segundo monitor, 960 px):** +9,91 B y +203 M se leen bien; los chips se parten en dos filas; PvP −288 M es un punto rojo de 3 px en las barras.

## Observaciones menores
- En móvil la columna del operador de la ecuación toca la etiqueta («resultado+»).
- Coste sin signo en las tablas de las tortas de pérdidas frente a «−385 M» en el centro.
- La etiqueta «PLEX −4,09 B» se monta sobre la barra rayada.
- `figure.new-eden.gains` mide 171 px con un SVG de 62 px.
- Con `?inv=1`, columnas vacías de 200–470 px bajo «Hoy» y Patrimonio.
- Nombres de sede cortados en «Dónde está tu inventario» (detector).

## Preguntas para pensar
1. Si PvE es el 96 % de lo positivo, ¿qué dicen las cinco barras de la tarjeta que no digan las cifras?
2. ¿Debería la paleta categórica ser solo de los pilotos, y las actividades nombrarse por texto y posición?
3. Si el enlace promete el detalle de los netos, ¿por qué el detalle no contiene ninguno?
