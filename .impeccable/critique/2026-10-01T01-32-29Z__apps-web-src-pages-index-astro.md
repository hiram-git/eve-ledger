---
target: Resumen (filtro de inventario y fila Total) + Indicadores + Pilotos
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:2fce179d819dd1a64e8aa8c23f51011bfdca94504725c7d6f3dc43865c5aa3d5"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-01T01-32-29Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: revisión de diseño en subagente aislado · B: detector + navegador en subagente aislado)

# Crítica de diseño — EVE Ledger (Resumen con filtro de inventario y fila Total)

## Design Health Score
| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Estado del filtro de inventario apenas visible. |
| 2 | Mundo real | 3 | «Con/Sin inventario» es un modo de vista presentado como filtro; «fila» en móvil. |
| 3 | Control y libertad | 3 | inv=0 se pierde con «Resumen»/marca y no se recuerda. |
| 4 | Consistencia | 2 | Dos estilos de estado activo; columnas en distinto orden escritorio/móvil; nota del Total falsa en vista de piloto. |
| 5 | Prevención de errores | 3 | Estados vacíos honestos. |
| 6 | Reconocer | 3 | Cuadrar el Total exige recordar la tarjeta de Neto (~1.800 px arriba). |
| 7 | Flexibilidad | 2 | Sin preferencia persistente ni atajos. |
| 8 | Estética | 2 | Tres franjas de control antes del dato; nota larga. |
| 9 | Recuperación | 3 | Causa y acción por piloto. |
| 10 | Ayuda | 3 | Notas de conciliación, a veces de más. |
| **Total** | | **27/40** | **Acceptable** |

## Veredicto de especificidad
De EVE Ledger; lo genérico es el control segmentado nuevo. Detector `[]`. Overlay en 6 vistas (8400, parado): real `line-length` en la nota del Total (349 caracteres a 1.198 px); discutibles: rayado «Sin sync», «Neto» ×5 en tarjetas, cramped-padding en chip de permiso; resto falsos positivos conocidos. Total = tarjeta de Neto carácter a carácter en 7/30/90 con y sin inventario. Sin desbordes; conmutador 40 px en móvil.

## Contexto del usuario
El wallet es lo que importa: compra el Omega directamente. El inventario hay que venderlo antes.

## Problemas prioritarios
1. [P1] Filtro de inventario en la franja del período, efecto casi invisible (solo Patrimonio), se pierde con «Resumen»/marca, no persiste, aria-current. Fix: wallet por defecto; interruptor local en la tarjeta de Patrimonio («Wallets | + inventario») recordado en cookie; aria-pressed. → layout + clarify
2. [P2] Nota del Total falsa en vista de piloto; «4 pilotos» cuenta a Nyx; «fila» en móvil; nota larga (line-length). Fix: «Total · 4 pilotos (3 con datos)», «Total · todos tus pilotos» con nota propia en vista de piloto, nota corta con max-width. → clarify
3. [P2] Orden de columnas: saldos antes que flujos en escritorio, inverso en móvil. Fix: Ingresos · Gastos · Neto | Saldo · (Inventario) · Último sync con separador Período/Ahora. → layout
4. [P2] Tres franjas de control antes del dato; estados activos distintos; en móvil el conmutador empuja Ingresos/Gastos al borde. Fix: se resuelve con 1. → adapt
5. [P3] Cuatro aria-current="page"; nav «Período» contiene el inventario; nombre accesible del chip pegado y repetido. → harden

## Personas
- Alex: vuelve a pulsar «Sin inventario» en cada entrada.
- Sam: «página actual» ×4; nada anuncia el cambio; chip de Lio pegado.
- Segundo monitor: el conmutador estorba; le serviría ver junto al saldo cuánto falta para el Omega.

## Observaciones menores
Conmutador visible en Nyx sin efecto; antigüedad de precios en gris; PLEX 2,60 vs 2,65 B sin explicar en el Resumen; title del neto sin «+»; ~8 ámbar (coste conocido).

## Preguntas
1. ¿Saldo del wallet con lo que falta para el Omega en el Resumen?
2. ¿Total en la vista de un piloto: consolidado, resto o nada?
3. ¿Pilotos sin sync cuentan en «Total · N»?
4. ¿El PLEX guardado cuenta como wallet?
