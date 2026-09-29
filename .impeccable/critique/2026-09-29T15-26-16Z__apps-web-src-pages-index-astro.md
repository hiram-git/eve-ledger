---
target: dashboard (apps/web/src/pages/index.astro)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:27d03632a1c79f7f3f50d79c6ee02f7c288168eb721a463ebda54b17b7590b2c"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-29T15-26-16Z
slug: apps-web-src-pages-index-astro
---
# Crítica: dashboard de EVE Ledger (apps/web/src/pages/index.astro)

Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Salud del diseño (Nielsen)

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Estado del sistema | 3 | Antigüedad bien resuelta pero repartida en tres sitios. |
| 2 | Lenguaje del mundo real | 3 | «Wallets» en inglés; tres pares de vocabulario (Ingresos/Gastos, entran/salen, entra/sale). |
| 3 | Control y libertad | 3 | Piloto y período reversibles; ninguno se recuerda entre visitas. |
| 4 | Consistencia | 3 | Cifras completas en tooltip y aria-label contra la regla k/M/B; Nyx «—» en el chip y 0/0/0 en la tabla. |
| 5 | Prevención de errores | 3 | Solo lectura; objetivos táctiles de 16 a 21 px. |
| 6 | Reconocer antes que recordar | 3 | «En qué se va» (−343 M) exige abrir «Por actividad». |
| 7 | Flexibilidad y eficiencia | 2 | 28 paradas de Tab (16 antes del primer dato); sin atajos; nada se recuerda. |
| 8 | Estética y minimalismo | 2 | Neto de «Todos» tres veces; tarjeta Neto con ~130 px vacíos; mapa de 398 px para 3 puntos. |
| 9 | Recuperación de errores | 3 | Avisos con acción; revisado por código. |
| 10 | Ayuda y documentación | 3 | Notas honestas pero a 12 px, en gris y al fondo. |
| **Total** | | **28/40** | **Bueno, en el límite inferior (antes 25/40)** |

## Veredicto de especificidad
La marca es de este producto (mapa «tu New Eden», franja con mapa estelar, hora EVE, ISK k/M/B, PvE/PvP/ESS, honestidad de datos); el cuerpo desde «Flujo diario» es intercambiable (paneles redondeados con título, meta y tabla). El mapa, lo único que solo podría existir aquí, está encerrado en «Patrimonio».
Detector CLI: 0 hallazgos. Overlay en navegador (5 vistas, 7 a 11 hallazgos): reales: h1→h3 sin h2, wide-tracking del pie (0,06em), gutter móvil de 14-16 px, cursor parpadeante no listado en CLAUDE.md (cubierto por prefers-reduced-motion), «Amarr VIII…» truncado con title. Falsos positivos: text-overflow en ul.node-list (sr-only), tooltip 0×0 aria-hidden, textos SVG del mapa estelar (decorativos), col del gráfico (no son paradas de Tab), errores de consola de imágenes bloqueadas. Contraste: 0 fallos (mínimo 5,41:1). Sin scroll horizontal. Neto sin scroll en 1280×900 (y=346) y 390×844 (y=481).

## Problemas prioritarios
1. [P1] La primera pantalla no responde «¿gano o pierdo?» con el peso que merece: Neto y Patrimonio+mapa son dos tarjetas iguales de 398 px; «Hoy (EVE)» mide 22 px; el neto se repite tres veces. Fix: rejilla asimétrica, pareja de cifras grandes (período y Hoy), Patrimonio compacto, mapa a su propia sección, quitar el neto duplicado. → layout, distill
2. [P2] La comparación con el período anterior es ilegible (`.delta` a 12 px; el significado se deduce del signo). Fix: frase de 14 px con flecha y aviso de ausencia más apagado. → typeset, clarify
3. [P2] En móvil la tabla de pilotos oculta Neto y Último sync (694 px en 360) y los toques miden 16-21 px. Fix: tarjetas por piloto, áreas de 40 px, pista de deslizamiento. → adapt
4. [P2] El gráfico diario no muestra el neto por día; aria-label y tooltip con cifras completas; columnas role=img con foco; el foco inicial cae en el día más reciente aunque esté vacío. Fix: marca de neto, k/M/B, lista/botones, foco en el último día con datos. → harden, polish
5. [P2] Inconsistencias de datos y vocabulario: Nyx «—» vs 0/0/0, «Wallets», entran/entra, h1→h3, antigüedad lejos del neto. → clarify, harden

## Personas
- Jugador con el segundo monitor: «Sin 30 días anteriores completos» a 12 px sin dato; «Hoy» 22 px; antigüedad a 700 px del neto; dos chips ámbar empiezan cada visita con «algo va mal».
- Usuario de teclado y lector de pantalla: 16 Tab antes del primer dato (28 en total); treinta anuncios con doce cifras; columnas con role=img enfocables.
- Piloto que revisa por semanas: abrir 5 `<details>` en cada carga.

## Observaciones menores
- Revisión de mercado (vendido 21,6 B) frente a ingresos (3,93 B): artefacto de la demo; la nota podría aclarar que cuenta transacciones y no movimientos de wallet.
- Inventario: 5 filas junto a 8 (con ?pilot=, 2). ID crudo «Estructura #1035466617946».
- Tres pestañas con el mismo icono de reloj; barra ingresos/gastos sin etiqueta propia.
- La franja de marca ocupa 118 px (92 en móvil) con un subtítulo que el usuario ya conoce.
- Pie con wide-tracking (0,06em → 0,04em); gutter móvil 14 px < 16 px; «Large Skill Injector» truncado sin title en móvil.

## Preguntas
1. Si «Hoy» es lo que mira el jugador mientras juega, ¿por qué es la segunda cifra?
2. ¿Y si el mapa fuera el filtro de ubicación de todo el resumen?
3. ¿Y si el gráfico diario mostrara solo el neto por día?
4. ¿Deberían los 118 px de marca llevar en vivo el neto de hoy y la antigüedad del sync?
