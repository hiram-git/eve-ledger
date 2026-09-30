---
target: dashboard (apps/web/src/pages/index.astro)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:f3ca78c9eea47b980c7f25920a8654e09b03eaf055952e2b7c03c26d0fe665b6"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-30T02-59-14Z
slug: apps-web-src-pages-index-astro
---
# Crítica: dashboard de EVE Ledger (apps/web/src/pages/index.astro)

Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Salud del diseño (Nielsen)

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Estado del sistema | 3 | Nyx «nunca» en el resumen y «Primer sync en curso…» en /pilotos; el sync manual no muestra progreso. |
| 2 | Lenguaje del mundo real | 3 | «ESS» y «kill rights» sin glosa; «Neto» no dice si es bruto o margen. |
| 3 | Control y libertad | 3 | Filtro y período reversibles; sin rango propio. |
| 4 | Consistencia | 3 | Enlace «Ver detalle por actividad» huérfano; chip de Lio en rojo fuerte con datos de hace 3 d. |
| 5 | Prevención de errores | 3 | «PvE +1,61 B» bajo «Hoy 0 ISK» invita a malinterpretar. |
| 6 | Reconocer antes que recordar | 3 | Cifras completas solo en title. |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos ni rango libre; skip link aterriza tras las pestañas de período; 26 paradas de Tab. |
| 8 | Estética y minimalismo | 3 | Tarjeta de Neto con ~11 elementos; mapa duplica inventario; ~100 px de hueco. |
| 9 | Recuperación de errores | 3 | /pilotos ejemplar; el resumen solo dice «hace 3 d» sin causa. |
| 10 | Ayuda y documentación | 3 | Bruto/margen y «Hoy = 00:00 UTC» lejos de las cifras. |
| **Total** | | **29/40** | **Bueno (antes 28/40)** |

## Veredicto de especificidad
Del producto, con esqueleto de dashboard genérico. Lo propio: mapa «tu New Eden», rutas estelares, hora EVE, k/M/B, notas de honestidad. Lo intercambiable: hero-KPI + tarjetas + paneles con tablas.
Detector CLI: 0 hallazgos. Overlay (4 vistas, headless): sin hallazgos reales de diseño (gpt-thin-border-wide-shadow = aviso de datos nuevos y tooltip, transitorios; repeated-container-text «Neto» ×4 en móvil = una por tarjeta). Falsos positivos: n-name/n-val (sr-only), «Amarr VIII…» con title, SVG del mapa estelar, skip-link fuera de pantalla, imágenes bloqueadas. Medidas: 0 textos HTML <12 px; contraste del contenido real OK (solo fallan textos decorativos del mapa estelar, aria-hidden); sin scroll horizontal con details cerrados y abiertos; h1 + siete h2; 0 enfocables sin nombre; consola limpia; neto y Hoy en el primer viewport (y=382 a 1280, y=523 a 390); 26 Tab (1280/900), 30 (390); movimiento solo en rutas y couriers, nada con reduced-motion.

## Problemas prioritarios
1. [P1] El desglose por actividad se lee como el desglose de «Hoy»: las 4 filas caen en la columna derecha bajo «Hoy 0 ISK», separadas del neto por un filete; el enlace queda en la otra columna. En móvil «Hoy» se interpone entre el neto y su Ingresos/Gastos. Fix: «Hoy» como bloque propio; barra, Ingresos/Gastos y actividades en una fila de ancho completo bajo la pareja, con el enlace al final. → layout
2. [P2] Patrimonio con mapa: el bloque más caro es el que menos informa; a 960 px apila Patrimonio y mapa antes del gráfico (empieza en y≈1107). Fix: mapa protagonista solo con ganancias hoy; si no, Patrimonio compacto y el mapa junto al inventario; bajar el corte a una columna. → distill, adapt
3. [P2] La causa de los avisos solo vive en /pilotos: «nunca» ámbar parece fallo cuando es espera; chip de Lio en rojo fuerte con dato de 3 d. Fix: reutilizar «Revincular» y «Primer sync en curso…»; bajar la saturación con datos viejos y añadir la edad. → clarify
4. [P2] Teclado y lector de pantalla: 16 paradas antes del contenido; skip link salta las pestañas de período; cifras completas solo en title; barra de «Otros» de ~1 px. Fix: mover el destino, ingreso/gasto visibles, ancho mínimo de la barra negativa. → harden
5. [P3] Huecos y ruido: ~100 px de vacío bajo Ingresos/Gastos, doble espacio en «Al último sync:  hace N min», subtítulo de la marca que el usuario ya conoce. → polish

## Personas
- Jugador con el segundo monitor (960 px): «Hoy 0» con «PvE +1,61 B» debajo parece contradictorio; el gráfico queda fuera de la primera pantalla; casi todo en 12-13 px; Sincronizar disputa el foco; Lio en rojo con dato de 3 d.
- Usuario de teclado y lector de pantalla: 16 Tab antes del contenido; skip link aterriza pasadas las pestañas; title inalcanzable; barra de actividad oculta.
- Usuario avanzado: sin atajos ni período libre; el filtro recarga y devuelve el scroll arriba.

## Observaciones menores
- Eje del gráfico a −150 M con mínimo −105 M.
- Vista de piloto: 2 filas de inventario con ~80 px vacíos.
- /pilotos: chip ámbar «Inventario» de Lio no dice qué falta.
- Alemán y móvil: la comparación ocupa dos líneas.
- Chip «Kade Morrow» cortado sin degradado.
- ES/EN/DE de 39×40 a 390.
- Texto SVG del mapa estelar a 1,7:1 (atenuado a propósito).

## Preguntas
1. ¿«Hoy» primero cuando hubo movimientos y el neto del período al abrir por la mañana?
2. ¿Un mapa que solo se dibuja cuando hay ganancias hoy?
3. ¿Una frase antes de las cifras?
4. ¿Chip, fila y tarjeta con el mismo neto: cuál sobra?
