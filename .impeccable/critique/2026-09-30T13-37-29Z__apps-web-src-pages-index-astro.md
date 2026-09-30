---
target: Resumen (index.astro) + Indicadores + Pilotos
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:a9aafa331c6a30338a82b022c108c15ed06bfa0d600063ca000228c332476a26"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-30T13-37-29Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: revisión de diseño en subagente aislado · B: detector + navegador en subagente aislado)

# Crítica de diseño — EVE Ledger (Resumen, Indicadores y Pilotos)

## Design Health Score
| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Patrimonio e Indicadores no dicen que suman a Lio con datos de hace 3 d ni que falta Nyx. |
| 2 | Mundo real | 3 | «Falló el sync de journal» es jerga interna. |
| 3 | Control y libertad | 3 | Filtro conservado, «Ver todos los pilotos», recarga que respeta la lectura. |
| 4 | Consistencia | 2 | Lio con tres nombres para un estado; rojo = error y neto negativo en Pilotos. |
| 5 | Prevención de errores | 3 | Revincular nombra el personaje. |
| 6 | Reconocer antes que recordar | 3 | Chip «Inventario» de Lio (falta permiso) solo en sr-only. |
| 7 | Flexibilidad | 2 | 20 Tabs hasta el gráfico, sin atajos ni exportar. |
| 8 | Estética y minimalismo | 3 | ~6 señales ámbar para 2 problemas; inventario ×3 en móvil. |
| 9 | Recuperación de errores | 3 | Falta explicar a la vista el permiso que falta. |
| 10 | Ayuda | 3 | Notas en contexto. |
| **Total** | | **28/40** | **Good** |

## Veredicto de especificidad
Hecho para el producto. Detector `[]` exit 0. Overlay en 6 vistas (8400, parado): solo falsos positivos conocidos. Nuevos: Sincronizar del estado vacío 37,5 px; ES/EN/DE 39×40; Tab móvil fila 2 → 1. Etiquetas del mapa a 12 px sin solapes; «Todos» fijo en x=0; sin desbordes; sin texto < 12 px.

## Problemas prioritarios
1. [P1] Patrimonio, «Saldo de los wallets» y Omega incluyen a Lio con datos viejos (y un inventario no refrescable) y excluyen a Nyx sin decirlo; Indicadores sin frescura. Fix: línea de cobertura con acción bajo Patrimonio y bajo la ecuación; icono ámbar en el saldo. → harden + clarify
2. [P2] Lio con tres nombres de estado; permiso de inventario invisible; «Datos hace 3 d ·» con separador colgando. Fix: una etiqueta por estado en pilot-state.ts, «wallet» en vez de «journal», texto visible del permiso, «·» dentro del bloque sin partir. → clarify
3. [P2] Botón Sincronizar relleno cian más brillante que el neto; ~6 señales ámbar. (Chip del cron en ámbar: decisión del usuario, se mantiene.) Fix: Sincronizar con contorno; iconos de chips a punto pequeño. → quieter
4. [P2] Revisión de mercado no concilia (vendido 19,5 B vs ingresos 3,81 B; Lio comprado 6,31 B vs gastos 216 M), probablemente fixture. Fix: verificar marketReview() por período/piloto; línea de conciliación. → harden
5. [P3] Mapa repite el inventario sin ganancias hoy (×3 en móvil). Fix: fundir con las barras o «Ver en el mapa». → distill

## Personas
- Alex: sin atajos ni exportar; 20 Tabs; 2.870 px hasta el mercado; sin comparar pilotos.
- Sam: chip de Lio repite la edad; Revincular es la parada 18; Tab móvil fila 2 → 1.
- Segundo monitor: botón más brillante que el neto; consolidado verde pleno con Lio roto.

## Observaciones menores
Barra ingresos/gastos de Lio sin apagar; tres Sincronizar en la vista de Nyx; «−5,19 B» del saldo en la ecuación; Indicadores con media página vacía y cabecera apretada en móvil; «Pilotos 4» sin señal de problemas; rojo de error = rojo de neto; balanceAt de Lio posterior a su último sync (demo).

## Preguntas
1. ¿«Todos» debería marcarse parcialmente si depende de un piloto con datos viejos?
2. ¿Omega debería responder «¿llegas a la próxima renovación?» con sí/no y fecha?
3. ¿Qué aporta la franja de marca de 118 px al segundo monitor?
4. ¿La revisión de mercado debería ser su propia pestaña?
