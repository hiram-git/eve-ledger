---
target: dashboard (apps/web/src/pages/index.astro)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:05213054571ecc8c89ec42271c7ab61d58c38beb81a6e1a6351a4bd9647c0bc2"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-29T18-21-23Z
slug: apps-web-src-pages-index-astro
---
# Crítica: dashboard de EVE Ledger (apps/web/src/pages/index.astro)

Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Salud del diseño (Nielsen)

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Estado del sistema | 3 | «Hoy 0» sin «hasta el último sync»; frescura en 13 px gris lejos de la cifra; móvil reduce el estado del cron a un punto. |
| 2 | Lenguaje del mundo real | 3 | Trading como margen con totales brutos, aclarado en 12 px; «Otros» cajón de sastre. |
| 3 | Control y libertad | 3 | Período y piloto no se recuerdan; los details abiertos y el scroll se pierden en cada recarga. |
| 4 | Consistencia | 3 | Mismo neto en barra azul y cifra verde; gastos positivos en la fila y negativos en el desplegable; eje Y con formatos mezclados. |
| 5 | Prevención de errores | 3 | Solo lectura; la recarga automática destruye el estado de lectura. |
| 6 | Reconocer antes que recordar | 3 | Cifras completas solo en title; mapa sin título visible. |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos ni vista compacta; nada se recuerda; 24 paradas de Tab. |
| 8 | Estética y minimalismo | 3 | Actividades dos veces; dos mapas estelares; animación de la marca. |
| 9 | Recuperación de errores | 3 | Avisos con acción; chips ámbar sin causa ni enlace. |
| 10 | Ayuda y documentación | 2 | Notas lejos de lo que aclaran. |
| **Total** | | **28/40** | **Bueno bajo (antes 27/40)** |

## Veredicto de especificidad
Del producto a medias (~65-70 %): la honestidad de datos (banda «Sin historial», «solo 42 con historial», transferencias internas anuladas), el mapa «tu New Eden», k/M/B, hora EVE, chips de piloto y el punto de neto son propios; el envoltorio (azul noche, cian, esquinas de mira, tarjetas KPI) es un dashboard HUD genérico.
Detector CLI: 0 hallazgos. Overlay (5 vistas, headless): reales: blinking-cursor del «_» de la marca (reduced-motion lo cubre; CLAUDE.md no lo lista), text-overflow real solo en «Amarr VIII…» con title, repeated-container-text «Neto» ×4 en móvil (filas de «Por actividad»). Falsos positivos: n-name/n-val (sr-only), tooltip 0×0, SVG del mapa estelar, skip-link fuera de pantalla, imágenes bloqueadas. Medidas: h1 + seis h2; sin scroll horizontal con details cerrados y abiertos; 0 fallos de contraste; 0 enfocables sin nombre; neto y Hoy dentro del primer viewport; 24 Tab (1280/900), 28 (390); ES/EN/DE 38,9×40.

## Problemas prioritarios
1. [P2] La franja de marca decorativa habla el mismo idioma que los datos: anillo .ping sobre JITA (StarMap.astro:82) como el pulso de «ganancias hoy» y cursor «_» parpadeante sin fin; con Hoy=0 el único anillo pulsante es falso. Fix: quitar el .ping, cursor fijo, atenuar nombres del fondo. → quieter
2. [P2] La frescura está lejos de la cifra que califica: «Sin movimientos hoy» sin sello de tiempo; «Actualizado hace 11 min» a ~800 px; estado del cron reducido a un punto en móvil; chips ámbar sin causa ni enlace. Fix: «al último sync, hace 11 min» junto a Neto/Hoy, chip con texto en móvil, causa con enlace a Pilotos. → clarify
3. [P2] La recarga automática destruye el estado de lectura (location.reload() pierde scroll, details abiertos y foco). Fix: recargar solo con la pestaña arriba y sin details[open]; si no, aviso «Hay datos nuevos · actualizar». → harden
4. [P2] Las actividades salen dos veces (.acts en la tarjeta de Neto y el panel «Por actividad») y la barra usa color de dato mientras la cifra usa color de estado. Fix: el panel de abajo solo detalle, filas de la tarjeta enlazadas a él, una sola familia de color. → distill
5. [P2] Legibilidad desde el segundo monitor: 55 textos de 11 px y 43 de 12 px; Patrimonio y Hoy casi iguales; eje del gráfico a 11 px. Fix: suelo de 13-14 px, escalón claro para Patrimonio, eje a 12 px. → typeset

## Personas
- Jugador con el segundo monitor: anillo y cursor parecen datos; «Hoy 0» sin hora; eje y tabla ilegibles a >1 m; la recarga le devuelve al inicio.
- Usuario de teclado y lector de pantalla: neto/Hoy/Patrimonio son etiquetas, no encabezados; cifras completas solo en title; cinco chips de filtro como cinco paradas con aria-current; estado del cron solo con color en móvil.

## Observaciones menores
- Vista de piloto: ~100 px de vacío en la tarjeta de Neto; desaparece la fila Trading si no tiene movimientos.
- Eje Y hasta −200 M con el mayor gasto en ~−105 M y formatos mezclados.
- La comparación a 7 días sale en rojo y contradice en color al +828 M verde.
- Inventario: dos filas «Amarr», ID de estructura como etiqueta, ~110 px de hueco.
- «Ver como tabla» con ,00 y columnas muy separadas.
- El vistazo no tiene encabezado (solo aria-label).
- ES/EN/DE de 38,9 px de ancho a 390.

## Preguntas
1. ¿Merece «Hoy» el 50 % de la tarjeta principal, o un «esta sesión»?
2. ¿Y si el mapa real de New Eden fuera la cabecera?
3. ¿El estado de los pilotos como frase («2 de 4 al día»)?
4. ¿Dos respuestas a «¿de dónde viene el ISK?» separadas por 300 px, o una que se despliega?
