---
target: el resumen (index.astro)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:9933101b977e2c04ded273f93a4022081489b2c1d531b74661bfef165d7dec8a"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-02T03-06-51Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Decimoquinta crítica — Resumen (`apps/web/src/pages/index.astro`), datos de demostración

## Design Health Score
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Coste de filas pendientes en rojo (estimado pintado como definitivo) |
| 2 | Lenguaje del usuario | 2 | Aria: Trading −458 M = reposición de la Raven de Kade junto a «Trading es el margen»; «todo esto ya está en el neto» falso para 80 M |
| 3 | Control y libertad | 3 | Sin problemas nuevos |
| 4 | Consistencia | 2 | Dos notaciones en el panel; «sin reponer» = dos estados; desglose sin fila «=» |
| 5 | Prevención de errores de lectura | 3 | Riesgo de restar dos veces las pérdidas al neto |
| 6 | Reconocer mejor que recordar | 3 | El Coste no sale de las columnas visibles (Rifter «— — — — −2,55 M») |
| 7 | Flexibilidad y eficiencia | 3 | 21 Tabs hasta «Ver naves perdidas» |
| 8 | Estética y minimalismo | 2 | Capas en el panel de pérdidas; hueco bajo Ingresos/Gastos |
| 9 | Recuperación de errores | 3 | Línea de salud y estado vacío de Nyx bien |
| 10 | Ayuda y documentación | 3 | Falta qué parte de «te costaron» ya está en el neto |
| **Total** | | **27/40** | **Aceptable** |

## Design Specificity Verdict
LLM: específico de EVE; lo genérico ya es la contabilidad: dos modelos del mismo ISK (actividades por ref_type en la tarjeta de Neto, flujo por nave en el panel) sin conciliar.
Detector: CLI `[]` en apps/web/src, index.astro y ShipLosses.astro. Navegador (5 vistas, headless): 0 reales; falsos positivos verificados (em-dash = celdas «—», sombras de capas ocultas, franja «Sin sync», mapa plegado, «Neto» estructural, elipsis intencionada con title). Sin superposición visible.
Verificado en código: el Coste de filas pending se colorea por signo sin mirar el estado (ShipLosses.astro:194); `lossesNote` dice «todo esto ya está en el neto» con unreplaced/toReplace fuera del neto.

## Priority Issues
- [P1] «Te costaron» no se concilia con el neto y la nota lo niega (−252 M en el neto, −80 M de patrimonio fuera). Fix: «−252 M ya en este neto, −80 M de patrimonio» en la tarjeta y filas de conciliación en el panel; nota corregida. Comando: /impeccable clarify
- [P1] La reposición sale como Trading y el PvP como ganancia (Aria Trading −458 M; PvP +211 M = seguro). Fix sin tocar clasificación: «incl. −458 M de reposición de naves» bajo Trading; de fondo, fila «PvP con naves» (decisión tomada). Comando: /impeccable clarify (o shape)
- [P2] Lo estimado se pinta como definitivo (filas pending en rojo; a 7 d «−5,10 M · ~5,10 M por reponer»). Fix: rojo solo en lo firme, pendientes en gris con «~». Comando: /impeccable clarify + polish
- [P2] Aritmética por fila que no cierra; «sin reponer» ambiguo; sin fila «=». Fix: columna «No volvió» (cambia columnas fijadas), «por reponer» para pending, fila «= Te costaron». Comando: /impeccable distill
- [P3] Hueco en la tarjeta de Neto (~90 px a 1280, ~230 px a 900). Fix: línea de pérdidas al pie a todo el ancho. Comando: /impeccable layout

## Persona Red Flags
Alex: sumar a mano tarjeta + panel para el PvP; sin ordenar por Coste.
Sam: rowheader de ~200 caracteres repetido por celda; «Hoy» repite el cero; Wallet/Coste solo en title.
Jugador en el segundo monitor: tres cifras de color compiten; Rifter 7 días en rojo; Aria parece mal trading.

## Minor Observations
- Franja de Lio con causa y acción fuera de la línea de salud (y su causa principal es el token).
- «Lio Tanaka, Nyx Adari» dos veces en las notas.
- Primas en la vista de Kade sin decir de quién.
- Tarjetas móviles con cuatro «—».
- Comentario obsoleto en index.astro (~l. 575).
- «See ships lost» salta de línea en EN.

## Questions to Consider
- ¿Un «resultado económico» con lo que no volvió como respuesta de la tarjeta?
- ¿Agrupar pérdidas menores?
- ¿Respetar la pausa hasta tener datos reales (los P1 dependen del flujo real)?
