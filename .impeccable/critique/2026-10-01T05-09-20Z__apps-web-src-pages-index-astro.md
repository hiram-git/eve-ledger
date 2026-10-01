---
target: el resumen (index.astro)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:8fe1075af1199e8e80202c55adc97a079a439255fbf0656a975a1b5ad044b0e9"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-01T05-09-20Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Undécima crítica — Resumen (`apps/web/src/pages/index.astro`)

## Design Health Score
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «Hoy» muestra la edad del sync («hace 11 min»), no la del dato; ESI va hasta ~1 h detrás y no se dice |
| 2 | Lenguaje del usuario | 3 | Trading es margen en la tarjeta (+1,66 B) y bruto en el panel (1,94 B / 281 M) |
| 3 | Control y libertad | 3 | En escritorio el nombre del piloto en la tabla no filtra (en móvil sí) |
| 4 | Consistencia | 3 | «Saldo de los wallets» / «Wallets» / «Saldo» en la misma tarjeta; Sincronizar en línea sin aria-label |
| 5 | Prevención de errores de lectura | 3 | Comparación con el período anterior sin matiz con pilotos atascados |
| 6 | Reconocer mejor que recordar | 3 | Franja rayada «Sin sync» sin etiqueta bajo el 15 % y fuera de la leyenda |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos, sin rango libre, sin exportación |
| 8 | Estética y minimalismo | 2 | ~18 piezas en la tarjeta de Neto; trading explicado 3 veces, historial 4 veces a 90 d |
| 9 | Recuperación de errores | 3 | El aviso de errores de sync enlaza al registro técnico de la API |
| 10 | Ayuda y documentación | 2 | Ayuda en `title`, inaccesible por teclado y en táctil |
| **Total** | | **27/40** | **Aceptable (borde alto)** |

## Design Specificity Verdict
LLM: mayormente propio en el contenido (neto con transferencias anuladas, Total que cuadra, ecuación Omega/PLEX, hora EVE, línea de salud, mapa real); piel del género (azul noche, cian, mono, paneles con borde luminoso). Oportunidad perdida: la identidad EVE no vive en la capa de datos; «Tu New Eden» desaparece en modo solo wallets.
Detector: CLI `[]` (0 hallazgos). Navegador (5 vistas, inyección en Chromium headless): 19 marcas, 1 real (`line-length` ~100 car./línea en `.pilots-note p`, max-width 78ch a 13 px). Falsos positivos: rayado de `.nodata-band` (codificación «Sin sync»), «Neto» ×5 en `.pilot-cards` (`<dt>`), text-overflow del mapa (details cerrado + lista sr-only), elipsis intencionada de «Amarr VIII…». `gpt-thin-border-wide-shadow` en `.update-notice` y tooltip: real como estilo, defendible en capas flotantes. Sin superposición visible para el usuario (headless).

## Overall Impression
La honestidad de los datos es un sistema y la tanda de wallet primero quedó limpia. El punto débil es el uso principal: «Hoy» de reojo mientras juegas da «0 ISK · hace 11 min» como si fuera definitivo.

## What's Working
1. Honestidad como sistema: estado vacío de Nyx, tarjeta/gráfico/Patrimonio apagados de Lio, CoverageNote que cuantifica, Total al céntimo.
2. Disciplina de color y tipografía: colores de datos solo para datos, cian solo para acciones, contraste de notas ≥ 5,4:1, foco cian de 2 px.
3. Móvil cuidado: «Todos» fijo con el chip activo al lado, tarjetas con Total, sin scroll horizontal a 390, alemán cabe.

## Priority Issues
- [P1] La frescura de «Hoy» mide el sync, no el dato. Fix: «Último movimiento 12:41 EVE · sync hace 11 min»; retraso de ESI (~1 h) en title y sr-only; próximo dato según `Expires` si se guarda. Comando: /impeccable clarify
- [P2] «Hoy» pinta 0 ISK cuando el dato es desconocido (`/?pilot=2119000003`; sr-only «sin cambio (0,00 ISK)»). Fix: «—» sin ISK y sr-only «sin datos de hoy» con `todayUnknown`. Comando: /impeccable harden
- [P2] Comparación con el período anterior sin matiz con pilotos atascados («258 M menos…» a 7 d con 4 d de Lio sin sync). Fix: «(sin los últimos 4 d de Lio)» o suprimir por umbral. Comando: /impeccable harden
- [P2] Explicaciones repetidas: trading ×3 (nota de tarjeta, pista de fila, párrafo del panel; también sin fila de Trading en Aria), historial ×4 a 90 d. Fix: una por concepto; nota de trading solo si hay fila; a 90 d solo period-meta y franja. Comando: /impeccable distill
- [P3] Franjas rayadas sin leyenda (< 15 % sin etiqueta). Fix: muestra rayada en la leyenda cuando aparezca. Comando: /impeccable clarify

## Persona Red Flags
Alex: sin atajos (período, piloto, sync); 12 Tab hasta el primer chip; nombre en la tabla de escritorio no filtra; sin rango libre ni CSV.
Sam: «Sincronizar» en línea indistinguible del de la cabecera; sr-only de «Hoy» repite el cero tres veces; desglose de «−145 M de este neto…» solo en title.
Jugador en el segundo monitor: «Hoy» es lo que importa en sesión y es secundario y con frescura del sync; línea ámbar de Lio/Nyx durante días sin poder aparcarla; a 900×900 la línea del Omega bajo el pliegue.

## Minor Observations
- Patrimonio compacto solo wallets a 1280: ~70 % vacío.
- `.pilots-note p` ~100 car./línea (detector).
- Línea de salud con `role="status"` desde la carga.
- Aviso de errores de sync enlaza a `syncLogUrl` en vez de Pilotos.
- «Sin movimientos hoy» en consolidado con solo 2 de 4 al día.
- «1 stacks» sin concordancia.
- Vocabulario Saldo / Wallets / Saldo de los wallets.

## Questions to Consider
- ¿Y si «Hoy» midiera la sesión de juego en vez de desde las 00:00 EVE?
- ¿Debería poder aparcarse un problema conocido y estable hasta revincular?
- ¿Y si la revisión semanal cerrara con una conclusión («+637 M; a este ritmo cubres el Omega el 14 oct»)?
