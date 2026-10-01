---
target: el resumen con pérdidas por pagador (index.astro)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:d5cf38bee905d670e462f94f8ffa00cbf5973a752215f3a0aa2325c9db659efc"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-01T06-47-04Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Decimocuarta crítica — Resumen con pérdidas por pagador y estados de reposición (`apps/web/src/pages/index.astro`)

## Design Health Score
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Titular en gris «hasta ahora» si queda cualquier cosa por reponer (10,9 M de 252 M) |
| 2 | Lenguaje del usuario | 2 | Hurricane sin seguro ni reposición: «Total 0»; Kade «naves perdidas +121 M» en verde; «repuesta · sin reponer 69 M» |
| 3 | Control y libertad | 3 | Período, piloto, inventario y vuelta a «Todos» |
| 4 | Consistencia | 2 | Kade: desglose «Reposición —» y fila «−354 M»; vistazo en blanco vs panel en gris; «(hasta ahora)» vs «· hasta ahora» |
| 5 | Prevención de errores de lectura | 3 | La columna «Total» invita a leerla como coste |
| 6 | Reconocer mejor que recordar | 3 | El coste real exige sumar tres cifras de sitios distintos |
| 7 | Flexibilidad y eficiencia | 3 | Sin camino de «Rifter perdido» (Hoy) a su fila |
| 8 | Estética y minimalismo | 2 | ~16 elementos en la tarjeta de Neto; 6 notas para 4 filas en el panel |
| 9 | Recuperación de errores | 3 | Línea de salud con acción; franja compacta sin permiso |
| 10 | Ayuda y documentación | 3 | El modelo se explica en párrafos |
| **Total** | | **27/40** | **Aceptable (techo de la banda)** |

## Design Specificity Verdict
LLM: alta (Tama 0.3 · 7 atacantes, repuesta por Aria Vex en Jita, courier, hora EVE); oportunidad perdida: el panel se lee como conciliación contable, no como «¿cuánto me costó?».
Detector: CLI `[]` en apps/web/src, index.astro y ShipLosses.astro. Navegador (5 vistas, headless): 0 hallazgos reales; falsos positivos verificados (em-dash = celdas «—», sombras de capas ocultas, mapa plegado, elipsis intencionada, `<dt>` «Neto»). Nada en `#perdidas`, `.acts-losses`, `.today-lost`. Sin superposición visible.

## Overall Impression
Mejoró la mecánica (estados, pagador), no la respuesta: la cifra «lo que me costó» no aparece y la vista de un piloto puede salir en verde por perder un Raven.

## What's Working
1. Porqué de cada fila visible y en idioma del juego; tarjeta móvil con el total arriba.
2. Desglose como ecuación accesible («más/menos»).
3. Sin permiso = «no se sabe», no «cero pérdidas».

## Priority Issues
- [P1] El panel no responde «¿cuánto me costó?» y «Total» responde mal (Hurricane y Rifters «0»; al Raven le faltan los 69 M que no volvieron). Fix: titular «Te costaron −332 M» = wallet −252 − sin reponer 69 − por reponer ~10,9; columna «Coste» por nave y «Total» → «Wallet». Toca una decisión tomada (titular = efecto en el wallet). Comando: /impeccable clarify
- [P1] Vista de un piloto contradictoria (Kade: «naves perdidas +121 M» en verde sobre una fila −233 M; «Reposición —» en desglose y −354 M en la fila). Fix: titular = sus naves (−233 M o su coste), el flujo de su wallet como línea secundaria; «naves perdidas» nunca en verde. Comando: /impeccable clarify
- [P2] La línea de pérdidas del vistazo es la señal más brillante y la menos coherente (blanco mono, sin color cerrado ni gris pendiente; «Ver» huérfano a 900). Fix: separarla de las actividades, mismo color que el panel, parte cerrada con color y lo pendiente aparte. Comando: /impeccable quieter + /impeccable polish
- [P2] Señales repetidas y estados contradictorios en palabras (notas de arriba duplican filas; «repuesta · sin reponer»). Fix: quitar lista de naves de la nota; «casco repuesto… · equipo sin reponer 69 M»; una sola línea de cobertura abajo. Comando: /impeccable distill
- [P3] «Hoy» de Lio muestra «0 ISK» y anuncia «sin cambio» sin datos. Fix: «—» y «sin datos de hoy». Comando: /impeccable harden

## Persona Red Flags
Alex: coste del Raven = −233 + 69 a mano; «Rifter perdido» sin camino a su fila; sin ordenar por coste.
Sam: enlace «Ver» sin contexto; «Total» solo en `title`; «−252 M (hasta ahora)» sin palabra de pérdida; «Hoy» de Lio anuncia «sin cambio».
Jugador en el segundo monitor: la línea blanca compite con el neto; Kade en verde por perder un Raven; chips cortados sin signo en estrecho.

## Minor Observations
- Género/número: «Rifter perdido» vs «Vexor Navy Issue repuesta»; «al comprarlo» para tres naves.
- «faltan 27 h» se parte a 390 (fragmento > 28 caracteres).
- Icono ámbar de la línea de salud solo en su línea a 390.
- Hueco bajo Ingresos/Gastos a 900.
- Pilotos: Lio «Inventario 212 M» con «falta el permiso»; 4 chips de permisos concedidos en pilotos sanos; avatar vacío sin iniciales.
- «patrimonio que no volvió» no conecta con la tarjeta Patrimonio.

## Questions to Consider
- ¿Y si la cifra del panel fuera «te costaron X» y el efecto en el wallet su desglose?
- Con ventana de 7 días, ¿tendrá color alguna vez el titular de quien pierde naves cada semana?
- En la vista de un piloto, ¿su wallet o sus naves?
- ¿Necesita el vistazo la línea de pérdidas todos los días?
