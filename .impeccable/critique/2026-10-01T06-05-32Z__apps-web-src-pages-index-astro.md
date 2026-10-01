---
target: el resumen con naves perdidas (index.astro)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:6aa51b0b7f70baace44e1b8accf6b0660ae201564713ebbc5f2a34c436e32f33"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-01T06-05-32Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Duodécima crítica — Resumen con «Naves perdidas» (`apps/web/src/pages/index.astro`)

## Design Health Score
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Reposición dentro de la ventana de 7 días parece cerrada (Rifter 27 sept: «sin compras en los 7 días siguientes» con la ventana abierta) |
| 2 | Lenguaje del usuario | 3 | «PvP +211 M» en verde con naves perdidas |
| 3 | Control y libertad | 3 | Filtros y conmutador; nada de qué escapar en el panel |
| 4 | Consistencia | 3 | Las filas no suman el total de la ecuación (−231 M vs −244 M) |
| 5 | Prevención de errores de lectura | 2 | PvP parece rentable; primas de naves vivas suman al efecto de las perdidas |
| 6 | Reconocer mejor que recordar | 2 | Porqué de cada fila solo en `title`; cuadrar PvP exige recordar una cifra de 2 pantallas arriba |
| 7 | Flexibilidad y eficiencia | 2 | Sin enlace a `#perdidas`, sin atajos, sin ordenar |
| 8 | Estética y minimalismo | 3 | Panel limpio; dos notas largas; estado sin permiso a panel completo |
| 9 | Recuperación de errores | 3 | Mensaje de permiso claro; Nyx: línea de salud solo «Sincronizar» |
| 10 | Ayuda y documentación | 3 | Notas en línea buenas; ayuda por fila depende del hover |
| **Total** | | **27/40** | **Aceptable (borde alto)** |

## Design Specificity Verdict
LLM: panel específico de EVE (seguridad del sistema, atacantes, casco + equipo, hora EVE, ecuación contable como Omega); genérico solo el chasis común de paneles.
Detector: CLI `[]` en apps/web/src, index.astro y ShipLosses.astro. Navegador (5 vistas, headless): 0 hallazgos en `#perdidas`; fuera, 1 real (`line-length` ~100 car. en `.pilots-note p`) y falsos positivos ya verificados (rayado «Sin sync», mapa plegado, `<dt>` «Neto», sombras de capas ocultas). Sin superposición visible para el usuario.
Verificación propia: el desajuste reposición/wallet que vio A era un fallo del seed demo (IDs de journal repetidos), no del código; corregido, las compras de mercado del wallet (636 M) cuadran con la revisión de mercado.

## Overall Impression
El panel responde a la pregunta pero llega tarde y desconectado del vistazo: PvP +211 M en verde arriba (es el seguro) frente a −244 M en el wallet dos pantallas más abajo.

## What's Working
1. Separa pérdida económica (contexto neutro) de movimiento de caja (ecuación con signo solo en el resultado), y lo explica.
2. Estados honestos: sin permiso ≠ cero pérdidas, cobertura parcial con nombres, Nyx sin panel, tarjetas 2×2 en móvil, DE cabe.
3. Lenguaje nativo del juego.

## Priority Issues
- [P1] El vistazo contradice al panel: PvP +211 M = seguro cobrado; la reposición (−458 M) queda dentro del margen de Trading (decisión tomada: naves compradas = trading). Fix sin tocarla: línea «Naves perdidas: −244 M en el wallet → ver» bajo PvP en la tarjeta de Neto con enlace a `#perdidas`; «Hoy» dice «1 nave perdida hoy». Comando: /impeccable clarify
- [P1] Total ≠ suma de filas: las primas son de todo el período (7 d: −31,8 M con una fila de −19,3 M; Kade 7 d «Sin naves perdidas» callando −12,5 M). Fix: primas fuera de la ecuación, en línea propia; estado sin pérdidas muestra primas. Comando: /impeccable clarify
- [P2] Porqué de cada fila solo en `title` (0 paradas de Tab, sin hover en táctil; Rifter «— — 0»; filas en ventana parecen cerradas). Fix: sub-línea visible por fila («recomprada el…», «solo equipo», «sin reponer», «en ventana · faltan 3 d»); total provisional si alguna fila abierta. Comando: /impeccable harden
- [P2] Jerarquía invertida: valor perdido a 24 px sobre el efecto en el wallet a 15 px. Fix: efecto en el wallet como titular, valor como contexto, o frase puente. Comando: /impeccable typeset

## Persona Red Flags
Alex: panel a ~1760 px sin enlace desde el vistazo; sin ordenar por efecto.
Sam: operadores `aria-hidden` (reposición se oye positiva); caption repite el h2; porqué solo en `title`.
Jugador PvP en el segundo monitor: tras perder un Raven el vistazo no cambia (PvP verde, «Hoy» sin rastro); para verlo baja 2 pantallas y la recarga se suspende.

## Minor Observations
- Fecha de `.meta` se parte en móvil (faltan espacios duros).
- «0» en Wallet frente a «—» en la misma fila.
- Estado sin permiso de Lio a panel completo.
- Nyx: panel dice sin permiso de killmails; línea de salud solo «Sincronizar».
- Dos notas finales fusionables; la idea clave mejor junto a la ecuación.
- `.pilots-note p` ~100 car./línea (detector).

## Questions to Consider
- ¿Cuál es «la» cifra de perder el Raven: 417 M, −212 M o −225 M?
- ¿Debería la reposición tras una pérdida contar como PvP en vez de Trading? (decisión tomada)
- ¿Merece una pérdida romper la calma de «Hoy»?
