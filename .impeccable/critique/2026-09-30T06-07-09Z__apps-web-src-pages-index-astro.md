---
target: Resumen (index.astro) + Indicadores + Pilotos
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:afe437f5f966a39813b952168c88021a7da57557199aba857e61a708ed6dd007"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-09-30T06-07-09Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: revisión de diseño en subagente aislado · B: detector + navegador en subagente aislado)

# Crítica de diseño — EVE Ledger (Resumen, Indicadores y Pilotos)

## Design Health Score

| # | Heurística | Nota | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «Al último sync» usa el sync más reciente de todos los pilotos (`index.astro:86-90`), también en `?pilot=`: en la vista de Lio dice «hace 12 min» bajo un chip «hace 3 d». |
| 2 | Correspondencia con el mundo real | 3 | Vocabulario de EVE impecable; nombres de configuración en texto visible: «(OMEGA_ACCOUNTS)», «SYNC_INTERVAL_MIN=0». |
| 3 | Control y libertad | 3 | Pilotos se recarga sola cada 15 s mientras haya un «Primer sync en curso…», y ese estado no caduca. |
| 4 | Consistencia y estándares | 3 | Dos precios de PLEX (5,29 M en Indicadores, 5,20 M en «Lo más valioso»); sufijo «ISK» azul vs gris; comparación en rojo bajo neto verde. |
| 5 | Prevención de errores | 3 | Botón deshabilitado al sincronizar; «Revincular» sustituye a «Sincronizar» cuando no serviría. |
| 6 | Reconocimiento antes que recuerdo | 3 | Pistas de actividad y cifras completas solo en `title`. |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos para período/piloto, sin «abrir todo» en Por actividad, sin modo compacto para el segundo monitor. |
| 8 | Estética y minimalismo | 3 | Tres señales ámbar apiladas; notas al pie de 2-3 líneas en tres paneles; tarjeta de Indicadores estirada a 1200 px. |
| 9 | Reconocer y recuperarse de errores | 3 | Token caducado explicado con acción; primer sync atascado sin diagnóstico. |
| 10 | Ayuda y documentación | 3 | Notas como párrafos de salvedades al final de cada panel. |
| **Total** | | **29/40** | **Good** |

## Veredicto de especificidad
Específico, no intercambiable: neto con signo/flecha/color, «Hoy (EVE)» que se apaga, barras divergentes por actividad, franja de pilotos con neto, mapa con coordenadas reales. La única pieza genérica es la tarjeta de Omega (etiqueta + número + barra + dl).
Escaneo determinista: `impeccable detect --json apps/web/src` → `[]` (exit 0). Overlay inyectado en 5 vistas (puerto 8400, parado): 20 mensajes, todos falsos positivos (elementos `hidden`, lista `sr-only` del mapa, elipsis intencional de BarList, cabeceras «Neto» repetidas por estructura). Aporte mecánico: en `/pilotos` a 390 px botones de 35,5-37,5 px y enlaces de nombre de 20 px; orden de Tab móvil salta de fila 2 a fila 1.

## Problemas prioritarios
1. [P1] La marca de frescura miente cuando hay pilotos rotos: `lastSync` es el máximo de todos los personajes aunque haya `?pilot=`. Fix: usar el `lastSyncAt` del piloto seleccionado y marcar la tarjeta como vieja con causa; en consolidado «2 de 4 pilotos al día · hace 12 min». → harden
2. [P2] «Primer sync en curso…» no caduca y dispara recargas cada 15 s (×8) por visita cuando no hay error registrado. Fix: pending solo si `status.running` o vínculo < ~10 min; si no, «Sin primer sync» con Sincronizar; sin recarga si no hay sync en marcha. → harden
3. [P2] Sobrecarga de ámbar en la cabecera del Resumen (chip de cron permanente + 2 chips + línea de salud). Fix: una línea con acciones inline, chips solo icono + edad, cron apagado en neutro. → quieter / distill
4. [P2] Indicadores: tarjeta estirada a 1200 px, cierra con «(OMEGA_ACCOUNTS)», contradice el Resumen (500 PLEX en inventario = 1 cuenta; PLEX 5,29 M vs 5,20 M). Fix: tarjeta ~640 px o rejilla 60/40, cerrar con el ETA, nota → línea meta, decir que el PLEX del inventario no cuenta, unificar/etiquetar el precio. → layout + clarify
5. [P2] En móvil «Hoy» cae a y=924 (segunda pantalla). Fix: «Hoy» como fila compacta bajo el neto en ≤520 px; línea de salud como chip corto. → adapt

## Personas
- Alex: franja 118 px + 2 filas antes del neto; sin atajos; 4 details uno a uno; cifras exactas solo en hover; dos precios de PLEX; no puede silenciar el aviso de Lio.
- Sam: 8 paradas antes del contenido; pistas e importes en `title`; chip «Inventario» solo sr-only; recarga cada 15 s roba el foco; Tab móvil fila 2 → fila 1.
- Piloto en segundo monitor: frescura en 13 px gris; ámbar gastado; nada recuerda Sincronizar con cron apagado; aviso de datos nuevos de 13 px abajo a la derecha; −116 M «de hace 12 min» que es de hace 3 d; franja animada en visión periférica.

## Observaciones menores
Comparación de 7 d en rojo bajo neto verde y «M)» en segunda línea; sufijo ISK azul vs gris; «vendido 19,5 B» vs «Ingresos 3,81 B» sin reconciliación; franja de marca con texto a 7-9 px; mapa móvil de tres puntos; subtítulo de Trading críptico; «Nyx Adari —» sin edad; «Sin 30 días anteriores…» primero bajo el héroe; `/pilotos` móvil bajo 40 px; notas al pie largas.

## Preguntas
1. ¿La alarma es la configuración (cron apagado) o la edad de los datos?
2. ¿El PLEX es inventario o es dinero? ¿«Solo wallets» es principio o atajo?
3. ¿Qué gana el jugador con 118 px de franja animada durante 4 horas?
4. ¿Indicadores como página aparte o como fila del vistazo («Omega ×5: faltan 8,03 B · 78 días»)?
