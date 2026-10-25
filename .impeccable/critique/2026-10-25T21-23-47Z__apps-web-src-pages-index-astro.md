---
target: el resumen (index.astro), tras la tanda 18 y el review/audit
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/eve-ledger/apps/web/src/pages/index.astro"
target_fingerprint: "sha256:7f3486b50ceb60cb71df8b3b48c3cd6a2b36f60be9c3277b3d9f744c5d397d8f"
target_path: /home/user/eve-ledger/apps/web/src/pages/index.astro
timestamp: 2026-10-25T21-23-47Z
slug: apps-web-src-pages-index-astro
---
Method: dual-agent (A: subagente de revisión de diseño · B: subagente de detector y navegador)

# Decimonovena crítica — Resumen (`apps/web/src/pages/index.astro`), tras la tanda 18 y las correcciones del review/audit

Demo recién sembrada (6 pilotos al día, último sync hace 14 min, ningún piloto roto), ES, 1320×900 y 390×844. Evaluaciones aisladas y en paralelo; la A puntuó antes de ver el detector.

## Design Health Score

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Escritorio excelente; en móvil el badge dice «cada 60 min» con datos de hace 14 min (sin `lastRun` tras arrancar la API) |
| 2 | Lenguaje del usuario | 3 | Vocabulario del juego; «Neto del wallet» vs «Neto en juego» según la vista; columna «Wallet» de pérdidas poco obvia |
| 3 | Control y libertad | 3 | Filtros en la URL; el conmutador «Wallets / + inventario» cambia de sitio al pulsarlo; «Naves perdidas» (1043 px) no se pliega |
| 4 | Consistencia | 3 | El color categórico no sigue a la entidad entre paneles; PLEX con tres codificaciones; gastos sin signo en «Hoy» |
| 5 | Prevención de errores | 3 | Poco que romper; las pestañas conservan piloto e inventario |
| 6 | Reconocer mejor que recordar | 3 | La barra Ingresos/Gastos del período se lee como de hoy; cuadrar PvP −288 M, te costaron −385 M y −271 M en el neto a mano |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos; 28 Tabs hasta el gráfico; página de 4142 px sin paneles plegables |
| 8 | Estética y minimalismo | 3 | Más calma que en la 18; hueco de ~400×170 px bajo «Por actividad», mapa de un punto, tortas sueltas |
| 9 | Recuperación de errores | 3 | Línea de salud y estado vacío correctos (no observables en una demo sana) |
| 10 | Ayuda y documentación | 3 | Cada cifra con su fuente y cobertura; la diferencia PvP −288 M / −271 M en el neto no se explica |
| **Total** | | **29/40** | **Bueno** |

## Veredicto de especificidad

**Revisión (A):** hecho para este producto: ruta Jita–Amarr en la franja, ecuación del Resultado, filas de pérdida como bitácora, k/M/B en mono y hora EVE, día de PLEX recortado y rayado, pulso del sistema que ganó hoy. Lo intercambiable está por debajo del vistazo: paneles idénticos (título + tabla) y parejas de tortas a la izquierda con ~850 px vacíos a la derecha a 1320 px; la paleta categórica no dice nada del juego y cambia de dueño en cada panel.

**Detector (B):** CLI limpio (código 0, `[]`) en `index.astro`, los 14 componentes y `Base.astro`, también con `--no-config`. En el navegador (overlay inyectado en 5 vistas) 6 reglas, todas falsos positivos o intencionadas: `gpt-thin-border-wide-shadow` en el aviso «Hay datos nuevos» y el tooltip del gráfico (capas flotantes ocultas al escanear), `text-overflow` en la lista del mapa (solo para lectores de pantalla en escritorio) y en los nombres de sede del inventario (recorte con `title`, intencionado), `em-dash-overuse` (son marcadores «—» de sin dato, no frases) y `repeating-stripes-gradient` (el rayado del PLEX, que codifica un dato). De paso: el aviso y el tooltip usan hex copiado en vez de tokens, y «1 stacks» en el `title` del inventario en español.

## Impresión general

Los arreglos de la tanda 18 funcionan (PLEX que explica su signo, una cifra en el pie de naves, centro de las tortas = titular, mini-mapa con Wallets, sin tarjeta de saldo duplicada, pista solo con teclado, iniciales). Lo más débil ahora es la composición interna de la tarjeta de Neto y la coherencia del color entre paneles. La mayor oportunidad: que la barra del período viva en la fila de la ecuación que desglosa y que el color de un piloto sea el mismo en toda la página.

## Lo que funciona

1. **La ecuación del Resultado**: se audita sin frase, explica su signo y comparte gramática con el desglose de «Naves perdidas»; cuadra también en la vista de un piloto.
2. **El gráfico diario**: una parada de Tab, tooltip por teclado, pista solo con foco de teclado, día de PLEX recortado y rotulado con su `aria-label`.
3. **Honestidad sin ruido**: «Hoy» sin movimientos se apaga, chips con saldo y `aria-label` compuesto, tabla de pilotos que concilia al céntimo.

## Problemas prioritarios

1. **[P2] La barra de composición del período está bajo la columna «Hoy».** En escritorio, Ingresos 11,5 B / Gastos −5,51 B queda bajo el mini-mapa de hoy y la tercera columna deja un hueco de ~400×170 px; en móvil cae después de «Hoy». Por proximidad, «Gastos −5,51 B» se lee como el gasto de hoy (4,06 M). Arreglo: ingresos y gastos como `.row-meta` de la fila «Neto del wallet» de la ecuación (que es lo que desglosan), o la barra dentro de la columna del Resultado. → `/impeccable layout`
2. **[P2] El color categórico no sigue a la entidad entre paneles.** Nyx es azul en las tortas de pérdidas y verde en Pilotos; el azul es PvE, Aria, Nyx y Hurricane en paneles seguidos; el morado de PLEX casi coincide con Inventario. Rompe la regla «el color sigue a la entidad». Arreglo: cada piloto con el índice de su orden en `characters` también en las tortas de pérdidas; naves desde el final de la paleta o un solo tono; PLEX fuera de `--cat-6`. → `/impeccable colorize`
3. **[P2] PLEX con tres codificaciones; la torta de gastos contradice «aparte».** Fila en la ecuación, barra rayada en el gráfico y porción morada sólida del 74 % en «Gastos por actividad». Arreglo: la porción de PLEX con el mismo rayado (patrón SVG) y centro «5,51 B · 1,42 B sin PLEX», o PLEX fuera del anillo con una nota. → `/impeccable clarify`
4. **[P2] El mini-mapa de «Ganado hoy» con un solo sistema.** 300×164 px (300×202 en móvil) para un punto; en móvil empuja «Por actividad» ~230 px. Arreglo: altura según contenido: con 1–2 sistemas una tira de ~72 px (punto que pulsa + «VFK-IV · +94,4 M hoy»), el mapa de 120 px desde 3 sistemas. → `/impeccable layout`
5. **[P2] El badge móvil dice «cada 60 min» con datos de hace 14 min.** `agoAt` sale de `status.lastRun`, que es null tras cada arranque de la API (cada arranque de la app). Arreglo: sin `lastRun`, usar el sync más reciente de los pilotos (`globalLastSync`). → `/impeccable harden`

## Señales de alarma por persona

- **Alex (usuario avanzado):** sin atajos; 28 Tabs hasta el gráfico sin segundo salto; «Naves perdidas» y las tortas no se pliegan; el conmutador de inventario cambia de sitio.
- **Sam (accesibilidad):** el titular se anuncia tres veces (región, h2 y texto) y la tabla lo repite; «Hoy» no es encabezado; el mini-mapa se anuncia dos veces y «VFK-IV+94,4 M hoy» sin espacio; la torta dice «Otros 0 %» y la tabla «<1 %»; filas de «Por actividad» como grupos con nombres de >120 caracteres; «ISK» del centro de las tortas a 8 px.
- **Rin (piloto mirando de reojo mientras rattea):** +9,91 B y +203 M se leen de lejos; el primer rojo es la flecha «1,88 B menos», no algo que hacer; «Gastos −5,51 B» bajo el mapa de hoy parece de hoy; en móvil no sabe de cuándo son los datos.

## Observaciones menores

- «−~ 49,4 M» pegado en la ecuación; «=+8,17 B» sin espacio en la vista de Aria.
- Coste sin signo en las tablas de las tortas de pérdidas («225 M») frente a «−385 M» en el centro; cero como «0» en Pilotos y «—» en «Por actividad».
- «Trading es el margen…» en vistas de pilotos sin trading; «No incluye 350 M ISK movidos entre tus pilotos» en consolidado es tautológico.
- La etiqueta «PLEX −4,09 B» se monta sobre el extremo rayado de la barra.
- «Revisión de mercado» al final no lleva a Balances.
- Aviso «Hay datos nuevos» y tooltip con hex copiado; «1 stacks» en español.

## Preguntas para pensar

1. Si Ingresos/Gastos es el desglose del «Neto del wallet», ¿por qué no vive en esa fila? Con «Hoy» y su mapa, ¿hace falta una tercera columna con 170 px vacíos?
2. Seis tortas comparten siete colores: ¿debería la paleta quedarse para los pilotos, la única entidad que cruza paneles?
3. Si PLEX va aparte del resultado de juego, ¿por qué es la porción más grande de la primera figura del detalle? ¿Y si el rayado fuera en toda la página la marca de «cuentas, no juego»?
