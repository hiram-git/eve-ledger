---
target: el resumen con naves perdidas según el flujo real (index.astro)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:abacba41a136ef8ddbc0e0c1e65a0678e85032856a5877ce6578e557e3560036"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-01T06-32-02Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Decimotercera crítica — Resumen con «Naves perdidas» según el flujo real (`apps/web/src/pages/index.astro`)

## Design Health Score
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «Provisional: 3 pérdidas» con el VNI ya repuesto y Rifters de 2,55 M; «repuesta · ventana abierta» a la vez |
| 2 | Lenguaje del usuario | 3 | «Efecto en el wallet» no es «lo que me costó» si no repones (Hurricane «0») |
| 3 | Control y libertad | 3 | Filtros, conmutador, anclas |
| 4 | Consistencia | 2 | Vista de un piloto: «en el wallet» = en los wallets de todos; Nyx en Pilotos «pulsa Sincronizar» con botón Revincular |
| 5 | Prevención de errores de lectura | 2 | Kade −233 M con −137 M de gastos propios; pérdida asegurada sin reponer = +seguro en verde |
| 6 | Reconocer mejor que recordar | 3 | Porqué visible; la reposición de Aria para Kade no aparece en la vista de Aria |
| 7 | Flexibilidad y eficiencia | 2 | Dos enlaces seguidos a `#perdidas`; sin ordenar/filtrar en el panel |
| 8 | Estética y minimalismo | 3 | Titular claro; columna de actividades con 8 elementos; 3 notas al pie |
| 9 | Recuperación de errores | 3 | Estados sin permiso proporcionados |
| 10 | Ayuda y documentación | 3 | Nota de privacidad de Pilotos desfasada (2 de 4 permisos) |
| **Total** | | **27/40** | **Aceptable (borde alto)** |

## Design Specificity Verdict
LLM: específico de EVE (porqué por fila con el flujo alter de Jita → courier, seguridad, atacantes, casco + equipo, hora EVE, Logística); genérico solo el chasis de paneles.
Detector: CLI `[]` en apps/web/src, index.astro y ShipLosses.astro. Navegador (5 vistas, headless): nada en `#perdidas`, `.acts-losses`, `.today-lost`; falsos positivos verificados (em-dash = celdas vacías «—», rayado «Sin sync», mapa plegado, `<dt>` «Neto», elipsis intencionada); sombras anchas de `.update-notice` y tooltip reales pero en capas ocultas en reposo. Sin superposición visible.

## Overall Impression
Muy bueno con datos cerrados; falla al perder la nave (verde) y en la vista de un piloto (atribución por pagador).

## What's Working
1. Porqué por fila con la historia real; total = suma de filas; primas aparte.
2. Titular = efecto en el wallet con frase puente; desglose accesible («más/menos»).
3. Estados sin permiso proporcionados; EN/DE caben a 390.

## Priority Issues
- [P1] Vista de un piloto carga a su wallet lo que pagó otro (Kade −233 M vs +121 M real en su wallet; Aria Trading −458 M sin rastro en su panel). Fix: partir por pagador; en Aria «Reposiciones para tus otros pilotos». Comando: /impeccable clarify
- [P1] Pérdida asegurada sin reponer = +seguro en verde; cerrada sin reponer = «0». Fix: gris «hasta ahora» + «por reponer ~X» mientras falte algo; «sin reponer (−X de patrimonio)» al cerrar; verde solo cerrado. Comando: /impeccable harden
- [P2] «Provisional» casi permanente y contradictorio. Fix: cerrar al reponer todo; provisional solo si queda algo y nombrarlo; fila «por reponer · faltan 7 d». Comando: /impeccable clarify
- [P2] Señales repetidas: dos enlaces a `#perdidas`, «Efecto en el wallet» ×2 (caption), línea del vistazo se presta a restarse del neto. Fix: «De este neto, naves perdidas: −252 M · Ver»; «Hoy» sin enlace con nave y valor; sin caption. Comando: /impeccable distill
- [P3] Tarjeta móvil: «Wallet» en fila 2 col 2. Fix: efecto en la cabecera de la tarjeta. Comando: /impeccable adapt

## Persona Red Flags
Alex: dos enlaces iguales; cuadrar Trading de Aria exige el consolidado; sin ordenar.
Sam: foco en BODY tras «Ver pérdidas»; «−252 MISK» sin espacio; etiqueta repetida.
Jugador en el segundo monitor: «1 nave perdida hoy» sin nave ni valor; verde en el momento de la pérdida.

## Minor Observations
- Última fila de la tabla con borde solo bajo la nave.
- «sin seguro» se parte (900/390).
- Falta `scroll-margin-top` en `#perdidas`.
- Pilotos a 1280: «Vinculado 16 sept 2026» se solapa con «Último sync».
- Nota de privacidad de Pilotos desfasada.
- Nyx en Pilotos: «pulsa Sincronizar» con botón Revincular.
- Último párrafo de notas con cuatro ideas.

## Questions to Consider
- ¿«Lo que me costó» es el efecto en el wallet o volver a estar igual?
- En la vista de Kade, ¿el Raven es de quien lo vuela o de quien lo paga?
- ¿Una pérdida en curso debe pesar en «Hoy» con su valor?
