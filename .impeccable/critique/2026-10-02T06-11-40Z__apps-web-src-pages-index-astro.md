---
target: el resumen (index.astro) con datos reales
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:0d1b5a8799df0d6f6ad483ab60ecb5f35ce3c88314833838dd1c6c646ccb3493"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-02T06-11-40Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Decimosexta crítica — Resumen (`apps/web/src/pages/index.astro`), primera con datos reales (export anonimizado, 6 pilotos)

Antes de la crítica se corrigió un bug que solo salía con datos reales: las compras de mercado (`market_escrow`, el piloto es primera y segunda parte) se tomaban como transferencias internas y no contaban como gasto (neto 30 d +20,0 B → −13,4 B). Commit propio.

## Design Health Score
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Frescura bien; sin estado de integridad: el wallet de Piloto 6 no cuadra y nada lo avisa |
| 2 | Lenguaje del usuario | 2 | PLEX bajo «Trading es el margen»; carga (15 Mobile Tractor Unit) llamada «equipo»; Capsule «sin seguro» |
| 3 | Control y libertad | 3 | Filtros claros; no se puede reclasificar una compra |
| 4 | Consistencia | 3 | Cuatro cifras rojas parecidas: Resultado −16,6 B, Neto −13,4 B, te costaron −13,6 B, Piloto 6 −13,8 B |
| 5 | Prevención de errores de lectura | 2 | Doble cuenta con módulos sustitutos; a 90 d, pérdidas sin historial como «no volvió» |
| 6 | Reconocer mejor que recordar | 3 | El dato decisivo (PLEX 18,8 B) solo plegado al final |
| 7 | Flexibilidad y eficiencia | 3 | Sin agrupación por evento |
| 8 | Estética y minimalismo | 2 | 21 filas de pérdidas, 9 triviales; un día de −12,7 B aplasta el gráfico |
| 9 | Recuperación de errores | 2 | Huecos de datos no detectados ni explicados |
| 10 | Ayuda y documentación | 3 | Notas buenas, pero no cubren PLEX ni bóveda |
| **Total** | | **26/40** | **Aceptable** |

## Design Specificity Verdict
LLM: específico de EVE (ecuación del resultado, reposición del alter de Jita, seguridad del sistema por pérdida). Con datos reales falla antes el modelo contable que el visual: −16,6 B exacto en aritmética, engañoso en significado (sobre todo PLEX y naves, sin nombrarlo).
Detector: CLI `[]` en index.astro, ShipLosses.astro y apps/web/src. Navegador (5 vistas): solo falsos positivos (capas ocultas con sombra, celdas «—», «Neto» estructural, franja «Sin historial», mapa plegado, dark-glow del propio overlay). 0 desbordes, 0 solapes, 0 texto HTML < 12 px. Reales vistos en capturas: «Sin h» recortado en el gráfico de Piloto 6; «~−» poco legible en celdas estimadas.

## Priority Issues
- [P1] El PLEX decide el titular y sale como Trading: 3.840 PLEX = 18,75 B (8 y 12 sept); Omega ve plexOwned 0. Fix: categoría o línea propia «PLEX / cuentas» y decir dónde está (bóveda invisible a ESI o gastado). /impeccable clarify
- [P1] Doble cuenta con módulos sustitutos: ANI del 14 sept, Piloto 6 compró ~2,18 B y solo se emparejan 588 M → «equipo sin reponer 1,99 B». Fix: emparejar por grupo de mercado/ranura o por ISK del comprador en la ventana, o confirmación manual. /impeccable harden
- [P1] Wallet de Piloto 6 sin ingresos y saldo que sube sin entradas: causa raíz verificada, `journal_id` es compartido por las dos partes de una donación y la PK descarta el lado del receptor (todas las donaciones internas están solo en Piloto 1). Fix: PK (journal_id, character_id) + resync de los 30 d que ESI conserva; nota de movidos en ambos sentidos; aviso de conciliación. /impeccable harden
- [P1] A 90 d, pérdidas anteriores al primer movimiento cuentan como «no volvió» (2,80 B → 6,04 B). Fix: estado «sin historial» en gris, fuera del Resultado. /impeccable harden
- [P2] Tabla de pérdidas con ruido y textos incorrectos: 6 Capsule y 3 Ibis triviales; Ferox «solo equipo… falta equipo» cuando falta el casco; carga como equipo; emboscada del 1 oct (7,94 B en 3 min) en 6 filas; día del PLEX sin anotar en el gráfico. Fix: plegar < 1 M, agrupar por evento, casco/equipo/carga, anotar días atípicos. /impeccable distill + clarify

## Persona Red Flags
Alex: no puede reclasificar PLEX ni confirmar reposiciones; sin vista por evento; ISK/h solo en Indicadores; «6 de 5 vinculados» y Omega con 5 cuentas.
Sam: región del vistazo «Neto» con titular «Resultado»; «Te costaron» y «Resultado» no son encabezados; «5,09 BISK»; actividades leídas dos veces con 14 dígitos; tabla de 21 filas.
Jugador en el segundo monitor: −16,6 B dominado por PLEX de hace tres semanas; «Hoy 0 ISK» sin ritmo de sesión; lo útil («ratting − naves = +1,2 B») no aparece.

## Minor Observations
- «−13,4  B» con espacio ancho en la frase; seguridad del sistema ausente en unas filas.
- Apotheosis (lanzadera conmemorativa) deja una pérdida abierta; ANI del 1 oct pending por 4 % con el casco repuesto.
- «Otros +1,76 B» es sobre todo `player_donation` de fuera.
- Con 6 pilotos la franja parte a 900 px; PILOT_SLOTS = 5.
- «Sin h» recortado en la franja del gráfico; «~−» poco legible.
- Indicadores: ritmo del Omega «−1,3 B al día» por PLEX y naves.

## Questions to Consider
- ¿El PLEX es una pérdida o el coste de jugar? Separado: «tu ratting (+14,8 B) pagó las naves (−13,6 B) y te quedó +1,2 B».
- ¿Pensar en eventos (salidas de flota) en vez de killmails sueltos?
- ¿Qué es Piloto 6: un piloto con neto o la tarjeta de gastos de la flota?
- ¿Un Resultado que depende del emparejamiento debe ir en rojo a 72 px?
