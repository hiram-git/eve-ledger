---
target: Resumen (index.astro) + Indicadores + Pilotos
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:0516890170f4e9a413887c85d4ea55ec16660a978a07fba026316a475e179b33"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-30T12-08-56Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: revisión de diseño en subagente aislado · B: detector + navegador en subagente aislado)

# Crítica de diseño — EVE Ledger (Resumen, Indicadores y Pilotos)

## Design Health Score
| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Frescura por piloto bien; Nyx muestra «0 ISK» en blanco mientras franja y tabla dicen «—». |
| 2 | Correspondencia con el mundo real | 4 | Vocabulario del jugador de punta a punta. |
| 3 | Control y libertad | 3 | En móvil con piloto filtrado, «Todos» queda fuera de pantalla sin afordancia. |
| 4 | Consistencia y estándares | 3 | «Sincronizar» en tres formas (link-button POST, enlace a /pilotos, botón primario). |
| 5 | Prevención de errores | 3 | «Revincular» abre el login sin nombrar el personaje. |
| 6 | Reconocimiento antes que recuerdo | 3 | Omega: hay que calcular el valor del PLEX guardado para que cuadre. |
| 7 | Flexibilidad y eficiencia | 3 | Cada sync recarga y pierde el scroll. |
| 8 | Estética y minimalismo | 3 | Gráfico vacío de Nyx con eje 1/0; nota de Omega es el bloque más largo. |
| 9 | Recuperación de errores | 3 | Causa + acción por piloto; lo baja Nyx. |
| 10 | Ayuda y documentación | 3 | «Trading = margen neto» solo en title. |
| **Total** | | **31/40** | **Good** |

## Veredicto de especificidad
Hecho para este producto (mapa de hubs, neto con signo, PvE/PvP/Trading/Otros, Omega/PLEX). Detector: `[]` exit 0. Overlay en 6 vistas, live server parado: solo falsos positivos conocidos (update-notice y tooltip ocultos, lista sr-only del mapa, elipsis de BarList, «Neto» en 4 cabeceras). Desborde 0 en todo; solo skip-link a 39 px.

## Problemas prioritarios
1. [P1] Vista de piloto sin primer sync fabrica ceros: `.hero-stat .value.zero { color: var(--text) }` (index.astro:962) gana a `.hero-stat.stale`; Ingresos/Gastos/Patrimonio 0, gráfico vacío eje 1/0, sr-only «0 ISK (ganancia)». Fix: estado «Aún sin datos de X · Sincronizar» (POST), «—» en Patrimonio, sin gráfico/actividad. → harden
2. [P1] «Te faltan 5,39 B» no cuadra con Coste 13,2 B − Saldo 5,19 B: el PLEX guardado (2,65 B) no aparece en ISK; dos progresos (59 % y 2 de 5 = 40 %). Fix: desglose como ecuación, una sola medida, nota a una línea. → clarify
3. [P2] Neto por actividad junto a brutos sin etiqueta («Trading +1,69 B» junto a «Gastos −341 M»). Fix: «Por actividad · neto» y pista visible. → clarify
4. [P2] Sincronizar en tres formas; tarjeta de Nyx enlaza a /pilotos; Revincular sin nombre; 4 señales ámbar por problema. Fix: un estilo de acción inline, mismo POST, «elige X en el login», chips solo icono + edad. → harden + quieter
5. [P2] Móvil: «Todos» fuera de vista con piloto filtrado; línea de salud corta sin acciones. Fix: «Todos» sticky + degradado, acción por piloto en la versión corta. → adapt

## Personas
- Alex: sin sync desde el chip; recarga pierde scroll y details; cifras completas solo en hover; Revincular deja elegir otro personaje.
- Sam: «0 ISK (ganancia)» sin datos; 30 listitem vacíos; pistas en title no anunciadas.
- Segundo monitor: cumple 2 s; ámbar permanente del cron se vuelve invisible; «Hay datos nuevos» exige clic.

## Observaciones menores
Cobertura global en la tarjeta de un piloto; transferencias internas consolidadas en vista de piloto; etiquetas del mapa a 11,5 px; ETA de Omega bajo el pliegue en 390; fila de Nyx seleccionada con todo «—»; Revincular en tercera línea en móvil; días sin movimientos iguales a «sin historial».

## Preguntas
1. ¿El neto consolidado debería apagarse parcialmente si un piloto roto aporta el 25 %?
2. ¿Cron apagado es estado o preferencia?
3. ¿«Hoy» a cero 6 h: «sin movimientos» o «¿estás jugando?»?
4. ¿Indicadores responde «cuánto» o «cuántos días»?
