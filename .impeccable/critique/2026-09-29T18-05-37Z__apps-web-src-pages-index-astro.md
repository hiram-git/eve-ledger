---
target: dashboard (apps/web/src/pages/index.astro)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:c4a3f4d9c8fee914888ba6166f30f3112c280081ad3213d22e8e3b367e30ea3d"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-29T18-05-37Z
slug: apps-web-src-pages-index-astro
closed: true
---
# Crítica: dashboard de EVE Ledger (apps/web/src/pages/index.astro)

Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Salud del diseño (Nielsen)

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Estado del sistema | 3 | Antigüedad a ~800 px de la cifra que califica, en 13 px gris. |
| 2 | Lenguaje del mundo real | 3 | «Wallets» y «entra/sale»; Trading como margen con totales brutos, aclarado solo al pie. |
| 3 | Control y libertad | 3 | Período y piloto reversibles; no se recuerdan. |
| 4 | Consistencia | 2 | Nyx «—» vs 0; sin h2; orden de «Por actividad» cambia con el período. |
| 5 | Prevención de errores | 3 | Revisión de mercado sin reconciliar con los totales. |
| 6 | Reconocer antes que recordar | 3 | Cifras completas y razón de los chips solo en title. |
| 7 | Flexibilidad y eficiencia | 2 | 16 Tab antes del gráfico; 4 enlaces de piloto repetidos; sin atajos. |
| 8 | Estética y minimalismo | 3 | Hueco de ~100 px en la tarjeta de Neto; mapa duplica la lista de inventario. |
| 9 | Recuperación de errores | 3 | Avisos con acción; revisado por código. |
| 10 | Ayuda y documentación | 2 | Ayuda en title y notas de 12 px al pie. |
| **Total** | | **27/40** | **Aceptable (antes 28/40)** |

## Veredicto de especificidad
Del producto a medias: la franja, el mapa «tu New Eden», Hoy (EVE), la hora EVE y la honestidad de datos son propios; desde «Flujo diario» hacia abajo es un panel de datos intercambiable. El mapa, lo único con identidad, da la menor información (3 puntos, etiquetas de 8 px) y repite «Dónde está tu inventario».
Detector CLI: 0 hallazgos. Overlay (5 vistas, headless): reales: skipped-heading (h1→h3), wide-tracking del pie (0,06em), blinking-cursor (cubierto por prefers-reduced-motion), text-overflow real solo en «Amarr VIII…» con title, repeated-container-text «Neto» ×4 en móvil. Falsos positivos: n-name/n-val (sr-only), tooltip 0×0, SVG del mapa estelar, sr-only, imágenes bloqueadas. Contraste 0 fallos; consola limpia; neto y Hoy dentro del primer viewport (y=346 en 1280/900, y=521 en 390); 28 paradas de Tab.

## Problemas prioritarios
1. [P1] «Ver como tabla» rompe el ancho de la página en móvil: a 390 px scrollWidth pasa de 390 a 616 (tabla de 583 px en 324) por las cifras completas con «ISK»; sin envoltorio .scroll. Regresión del último pase. Fix: .scroll y quitar «ISK» de las celdas. → harden
2. [P1] «¿De dónde viene el ISK?» está colapsado tres pantallas más abajo y el mapa (40 % de la primera fila, 3 puntos, etiquetas de 8 px) se lleva el espacio más caro; la tarjeta de Neto tiene ~100 px vacíos. Fix: desglose por actividad visible (4 filas con barra y cifra) en el hueco; mapa compacto con etiquetas ≥11 px o a la sección de inventario. → distill, layout
3. [P2] Bruto y margen se contradicen sin aviso; el orden de «Por actividad» cambia con el período; la comparación con el período anterior (12 px) se lee mal. Fix: orden fijo PvE/PvP/Trading/Otros, subtítulo «margen; no suma a los totales», frase legible. → clarify, typeset
4. [P2] Móvil y tablet: cabecera de 4 filas antes de la marca, micro-brand 26×40, secciones/idioma/Sincronizar de 36-37 px, «Lo más valioso» pierde la columna de precio a 900 px, .scroll enfocable sin nombre. Fix: una sola fila de cabecera, objetivos de 40 px, ocultar precio unitario <1040 px, aria-label y tabindex en .scroll. → adapt
5. [P2] Consistencia y semántica: sin h2; Nyx «—» vs 0; «Wallets», entra/sale; chip de Nyx leído «guion»; 4 enlaces de piloto redundantes; «Hoy 0» a 44 px. Fix: h2, un criterio de «sin datos», «Hoy» apagado si es 0, vocabulario único. → clarify, harden

## Personas
- Jugador con el segundo monitor: antigüedad a ~800 px del neto; «Hoy 0 ISK» compite con el neto; etiquetas del mapa ilegibles; composición del ISK a ~1240 px; tres ámbar seguidos.
- Usuario de teclado y lector de pantalla: sin h2; summary cuyo nombre repite todo su contenido; chip de Nyx leído «guion»; 4 paradas redundantes; parada sin nombre a 900 px.

## Observaciones menores
- Revisión de mercado (vendido 21,6 B) vs ingresos (3,93 B): artefacto de la demo; la nota debería decir que cuenta transacciones y no movimientos de wallet.
- El eje del gráfico se reescala con el filtro por piloto.
- «+4,44 B» de 90 días cubre 42 días con la etiqueta «últimos 90 días».
- «Ver como tabla» repite «ISK» en cada celda.
- Inventario: 5 filas junto a 8, ~250 px vacíos.
- Pie con wide-tracking 0,06em → 0,04em.
- «Sync automático desactivado» en ámbar toda la sesión.
- Etiquetas del mapa «New Eden» de 8,4 px (1280) y 6,3 px (390).

## Preguntas
1. ¿Y si la primera pantalla fuera solo neto, Hoy, la barra PvE/PvP/Trading y la frescura, y lo demás en «Detalle»?
2. ¿Merece el mapa el 40 % de la primera fila con tres puntos?
3. Cuando «Hoy» es 0, ¿qué debe saber el jugador?
4. ¿Debería «Revisión de mercado» ser la vista que explique bruto contra margen?
