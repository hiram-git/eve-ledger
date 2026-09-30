---
target: Resumen (index.astro) + Indicadores + Pilotos
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:ca2a54219698e4380fd6912163bd2357ce3bcf4fb89a5627f9374bde323e9f33"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-30T14-14-32Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: revisión de diseño en subagente aislado · B: detector + navegador en subagente aislado)

# Crítica de diseño — EVE Ledger (Resumen, Indicadores y Pilotos)

## Design Health Score
| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | El mismo estado se repite tanto que pierde peso. |
| 2 | Mundo real | 3 | kill_right_fee y war_fee en crudo (faltan en format.ts). |
| 3 | Control y libertad | 3 | Filtro conservado, salida al consolidado. |
| 4 | Consistencia | 2 | Lio con 4 fórmulas; Revincular con icono de Sincronizar; error en rosa #d9aab1; cobertura de Patrimonio solo en consolidado. |
| 5 | Prevención de errores | 3 | Sin ceros para Nyx, neto viejo apagado. |
| 6 | Reconocer | 3 | Ritmo de 7 días en Indicadores frente a 30 en Resumen. |
| 7 | Flexibilidad | 2 | Sin atajos ni comparación de pilotos. |
| 8 | Estética y minimalismo | 2 | ~18 marcas ámbar en el primer pantallazo; Lio 5 veces. |
| 9 | Recuperación | 3 | Misma acción hasta 3 veces. |
| 10 | Ayuda | 3 | .hint y .error-msg de Pilotos a 12 px. |
| **Total** | | **27/40** | **Acceptable** |

## Veredicto de especificidad
De EVE en datos y vocabulario; por debajo de la franja, paneles idénticos de dashboard genérico. Detector `[]`. Overlay en 6 vistas (8400, parado): falsos positivos conocidos + cramped-padding marginal en el chip de permiso. Sin desbordes, sin texto < 12 px, sin form en p; contraste ámbar 9,3–9,8:1; nota de Patrimonio fuera de la primera pantalla en móvil.

## Problemas prioritarios
1. [P1] Saturación ámbar: el problema de Lio contado 5 veces sobre el pliegue; Revincular ×2, Sincronizar ×3. Fix: una sola fuente de causa y acción (línea de salud); el resto solo cuantifica en neutro con icono pequeño; frescura de Hoy en gris salvo vieja global; Patrimonio sin acciones repetidas. → quieter + distill
2. [P2] Vista de piloto sin cobertura en Patrimonio (CoverageNote solo con !selected, index.astro:575); inventario de Lio sin fecha; gráfico sin atenuar. → harden
3. [P2] «Lo cubres en 54 días» ignora que el coste es mensual. Fix: línea de sostenibilidad (coste ~441 M/día vs ganas 100 M/día) o % del coste mensual. → clarify
4. [P2] Pilotos/nav: Revincular con icono de refresco; error rosa a 12 px; «Pilotos 4» + punto se lee como 4 problemas; fecha partida. → polish
5. [P3] kill right fee/war fee en crudo; revisión de mercado ordenada por volumen sin decirlo. → clarify

## Personas
- Alex: sin atajos, período propio ni comparación.
- Sam: chip de Lio repite la edad; «Pilotos 4 2 pilotos…»; Tab móvil fuera de orden visual.
- Segundo monitor: verde en 2 s, pero la mancha ámbar domina.

## Observaciones menores
«Todos» fijo deja ver «40 M» sin signo; pestañas y lema a 12 px en móvil; barra gris parece progreso vacío; nota de actividad duplicada; «gastos 0» vs «—»; tarjeta huérfana en Indicadores.

## Preguntas
1. ¿Escalar el ámbar con el peso del dato viejo?
2. ¿«¿Mis pilotos se pagan su Omega?»?
3. ¿Qué haría la segunda pantalla tan de EVE como la primera?
4. ¿La franja con 6 chips sigue siendo filtro?
