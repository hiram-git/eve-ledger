# Prompt: design system de EVE Ledger

Prompt autocontenido para diseñar pantallas nuevas (o una versión para corporaciones) con el mismo sistema visual que el dashboard actual. Cópialo entero desde la línea siguiente, en Claude u otra herramienta de diseño, y completa la última sección con lo que quieres diseñar.

Fuente de verdad: `apps/web/src/styles/theme.css`, `PRODUCT.md` y las reglas de diseño de `CLAUDE.md`. Si cambian, actualiza este archivo. Versión en inglés: `design-system-prompt.en.md` (mantener las dos al día).

---

Eres diseñador de producto y front-end. Vas a diseñar para **EVE Ledger** siguiendo su design system al pie de la letra. No inventes tokens, fuentes ni componentes nuevos si uno de los de abajo resuelve el caso; si hace falta uno nuevo, constrúyelo con estos tokens y dilo.

## 1. Producto

- **Qué es:** contabilidad local y privada de los pilotos de EVE Online de un jugador, vía ESI (la API oficial de CCP). Consolida wallets, inventario y naves perdidas de varios personajes como una sola economía.
- **Pregunta principal:** «¿gano o pierdo ISK?». Cada vista responde eso antes que nada (el neto del período y qué lo explica); el resto es detalle.
- **Uso:** de vistazo, en un segundo monitor mientras juega (se lee en segundos), y en revisión al terminar la sesión o cada semana (tablas y desgloses).
- **Usuarios:** pilotos PvE (ratting, ESS, misiones) y PvP. Trading, industria y minería son secundarios.
- **Plataformas:** web (Astro) y app de escritorio (Tauri). Dark mode únicamente. Escritorio 1280 px y móvil 390 px.

## 2. Principios

1. **El neto primero.** La cifra más luminosa de la pantalla es el dato, no un botón ni la decoración.
2. **Vistazo arriba, detalle abajo.** La primera pantalla cabe sin scroll: neto del período + «Hoy (EVE)» + patrimonio.
3. **Honestidad sobre los datos.** Siempre de cuándo son los datos y qué excluyen. Lo estimado se marca y va en gris; lo que falta se dice («—», «Sin datos de hoy»), nunca se pinta como cero.
4. **Una sola economía.** Los movimientos entre pilotos propios se anulan.
5. **Calma.** HUD de ciencia ficción sobrio: líneas finas, poco brillo, casi nada se mueve.

## 3. Tokens

Úsalos como variables CSS con estos nombres.

### Superficies y líneas

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#070c13` | Fondo de página (azul noche). Encima, dos degradados radiales: `radial-gradient(ellipse 70% 40% at 50% -5%, #13304680, transparent 70%)` y `radial-gradient(ellipse 40% 30% at 100% 0%, #2a1f4a33, transparent 70%)` |
| `--panel` | `#0f1822` | Superficie base de paneles |
| `--panel-2` | `#0b131c` | Superficie hundida (inputs, bloques de código, listas internas) |
| `--surface-raised` | `#13212d` | Superficie elevada (avisos flotantes, menús) |
| `--line` | `#1f2d3a` | Bordes y separadores |
| `--line-strong` | `#2d4556` | Bordes de inputs, cabeceras de tabla |
| `--corner` | `#4d7185` | Esquinas de mira de los paneles |
| `--grid` / `--axis` | `#1b2833` / `#2e4252` | Rejilla y eje de gráficos |

### Tinta

| Token | Valor | Uso |
|---|---|---|
| `--text` | `#e6eef5` | Texto principal y títulos |
| `--text-secondary` | `#9fb3c2` | Etiquetas, texto de apoyo |
| `--text-muted` | `#7890a2` | Notas, metadatos, lo estimado, lo apagado |

### Acentos de interfaz (estado y acción, nunca datos)

| Token | Valor | Uso |
|---|---|---|
| `--cyan` | `#61cce5` | **Solo** acciones (enlaces, botones, foco) y estado activo |
| `--cyan-dim` | `#3b7f94` | Bordes de acción en reposo, iconos de etiqueta |
| `--positive` | `#8ed7bc` | Signo positivo de un neto (ganas ISK) y estado «al día» |
| `--critical` | `#f0857a` | Signo negativo de un neto (pierdes ISK). No se usa para errores de sistema |
| `--warning` | `#e7b75f` | Avisos: datos viejos, permiso que falta, sync desactivado |

### Colores de datos (series de gráficos y leyendas, nunca interfaz)

| Token | Valor | Serie |
|---|---|---|
| `--income` | `#2a98c0` | Ingresos |
| `--expenses` | `#e8604c` | Gastos |
| `--inventory` | `#9a7cf0` | Inventario |
| `--balance` | `#6b8799` | Saldo, neutro junto al inventario |

Validados en contraste sobre `--panel`. No los reutilices como colores de botones, bordes o texto de interfaz, y no uses los acentos de interfaz como series.

### Forma y espacio

- Radio: `--radius: 10px` en paneles; 5–7 px en botones, chips y avisos; 4 px en retratos e iconos de ítem.
- Contenedor: `max-width: 1200px`, márgenes laterales de 32 px en escritorio y **16 px en móvil**. Separación entre secciones: 20 px.
- Panel: cabecera de 58 px de alto mínimo con padding de 16 × 22 px y borde inferior `#26313b88`; cuerpo con padding de 20 × 22 px; nota al pie de 12 × 22 px con borde superior.
- Objetivos táctiles de **40 px** en móvil (pestañas, chips, selector de idioma, acciones en línea).
- Bordes de 1 px; sombras casi nulas (como mucho `0 6px 18px -8px #61cce599` al pasar sobre el botón principal).

## 4. Tipografía

- **Inter** (variable): toda la interfaz. 14 px / 1.5 de base.
- **IBM Plex Mono** (400 y 500): **solo cifras y datos** (importes, fechas en tablas, IDs). Siempre con `font-variant-numeric: tabular-nums` en columnas.
- **Barlow Condensed** (500 y 700): **solo el logotipo** «EVE LEDGER_» (mayúsculas, 46 px en la franja de marca; el «_» en cian, fijo).
- Escala: neto principal 44 px mono 500 (`letter-spacing: -0.04em`) · cifra titular de un panel 32 px · KPI 28 px · Patrimonio 24 px · títulos de sección (`h2`) 15 px 600 · texto 14 px · notas, metadatos y sub-textos **13 px (suelo)** · etiquetas de tabla, ejes y pie **12 px (suelo)**.
- Cabeceras de tabla: 12 px, 600, mayúsculas, `letter-spacing: 0.06em`, color `#8ba4b5`.
- Jerarquía: el `h1` de cada página es solo para lectores de pantalla; las secciones son `h2`. **Sin eyebrows** (etiquetas pequeñas sobre títulos) y **sin números de sección**.

## 5. Componentes

- **Panel con esquinas de mira:** fondo `linear-gradient(135deg, #111c27, #0d1620 70%)`, borde `--line`, radio 10 px. Dos esquinas de 12 × 12 px en `--corner` (arriba-izquierda y abajo-derecha, con `::before` y `::after`), que siguen el radio.
- **Panel destacado (KPI principal):** borde `#345469`, fondo `linear-gradient(150deg, #13283875, #0f1924 55%)`, esquinas en `--cyan-dim`.
- **KPI:** etiqueta de 13 px en `--text-secondary` con icono de 14 px en `--cyan-dim`; valor en mono (color `#cfe3ee`, o verde/rojo si es un neto); sub-texto de 13 px en `--text-muted`.
- **Barra superior:** 52 px; marca compacta (cuadrado de 26 px con «E» en Barlow y borde `--cyan-dim`), estado del sync (punto de 6 px: verde al día, ámbar desactivado, cian latiendo mientras sincroniza), selector ES/EN/DE y botón Sincronizar.
- **Franja de marca:** 118 px (92 px en móvil) con el logotipo sobre un mapa estelar decorativo. Nunca empuja el neto fuera de la primera pantalla.
- **Navegación de secciones:** pestañas de 13 px 550, texto `#93a6b7`. La activa lleva fondo `#16304070`, texto `#8addee`, borde `#30506480` y una línea inferior de 2 px en cian; `aria-current="page"`.
- **Filtros** (pestañas de período, chips de piloto): `aria-current="true"`. Cada chip lleva el nombre y su neto con signo; un piloto con problemas lleva solo un icono ámbar pequeño y la edad en gris, con borde neutro.
- **Botones:**
  - principal: fondo `#60c8e0`, texto `#06202b`, 13 px 650, padding 8 × 14 px, radio 5 px;
  - principal en contorno (`.outline`, el habitual en la cabecera para que el dato brille más): fondo `#61cce514`, borde `--cyan-dim`, texto `#8addee`;
  - secundario: fondo `#14232f`, borde `#365164`, texto `#a4c5d9`;
  - acción en línea (Sincronizar, Revincular, Revisar dentro de una frase): texto cian 550 sin subrayado, zona táctil de 40 px sin mover el texto.
- **Avisos (`.notice`):** padding 14 × 18 px, radio 7 px, 13 px, icono a la izquierda.
  - info: borde `#34566b`, fondo `#14273688`, texto `#a6c8db`, icono cian;
  - warning: borde `#6b5530`, fondo `#2a2216`, texto `#e9d3a8`, icono ámbar;
  - error: borde `#663b44`, fondo `#281a21`, texto `#dfa5ad`, icono `--critical`.
- **Tablas:** celdas de 10 × 12 px; números alineados a la derecha en mono 13 px (`#c0d4e1`); la primera columna en Inter, alineada a la izquierda y en `--text`; separadores `--line`; hover de fila `#61cce508`; `td.pos` y `td.neg` en verde y rojo. Una fila **Total** al final cuando la tabla suma. Si tiene scroll horizontal: `role="group"` y `aria-label`.
- **Tarjetas móviles:** a ≤ 600 px, las tablas de pilotos pasan a tarjetas: ingresos, gastos y neto primero en cada una, y una tarjeta Total al final. En tablas con una cifra que manda por fila (p. ej. el coste de una nave perdida), esa cifra va arriba a la derecha de la tarjeta.
- **Tortas:** un reparto (ingresos por actividad, coste por piloto) es un anillo de 120 px con el total en el centro y sin texto sobre el anillo; porciones en la paleta de datos por índice fijo, con un hueco de 2 px, como mucho 7 (la séptima es «Otros N»). La leyenda es la propia tabla o lista de al lado (muestra de color de 10 px junto al nombre) o una tabla corta Nombre · n · Cifra; cada arco lleva `title` y el svg un `aria-label` con el reparto. Nunca para dos valores (eso es una cifra) ni para comparar cifras parecidas.
- **Cabeceras que ordenan:** en tablas largas (pilotos), cada cabecera es un botón sin aspecto de botón con `aria-sort`; primer clic de mayor a menor (el nombre de la A a la Z), el segundo invierte, el tercero vuelve al orden original; sin dato siempre al final y la fila Total fija. En móvil, donde la tabla son tarjetas, un selector «Ordenar por» hace lo mismo.
- **Estado contable:** una tabla «libro» (`.statement`) para balances y resultados: etiqueta con su nota debajo (13 px, gris), columna de operador (+, −, =; en `sr-only` «más», «menos», «igual a»), importe en mono y, si aplica, el % del total en 12 px gris; cabeceras de grupo en mayúsculas de 12 px, líneas indentadas (`.sub`), totales con línea fuerte arriba y resultados con doble línea; lo estimado en gris con «~». Las cifras de stock (patrimonio, saldo) sin «+»; las de flujo (resultado) con signo y color.
- **Ecuación:** para explicar una cifra derivada (p. ej. «Coste − Saldo − PLEX en inventario = Te faltan»), una tabla con columna de operador (−, =) y valores en positivo.
- **Iconos:** de trazo, estilo Lucide; 16 px (14 px en etiquetas), `stroke-width: 1.7`, color heredado. Sin iconos de colores ni emojis.

## 6. Cifras y datos

- **ISK abreviado** como en el juego, con espacio: `2,85 B` · `302 M` · `10,9 M` · `845 k`. Tres cifras significativas (100 o más sin decimales, 10–99 con uno, menos de 10 con dos). La notación k/M/B no se traduce. La cifra completa (`−302.114.560,00 ISK`) va en el `title` o en «Ver como tabla».
- **Signo:** menos tipográfico `−` (U+2212). Los netos llevan `+` cuando son positivos.
- **Color del signo:** solo los netos (ganancia o pérdida de ISK) van en verde/rojo. Ingresos y gastos van en tinta normal (o en su color de serie en los gráficos).
- **Estimado:** «~» + espacio fino delante (`~ 10,9 M`), siempre en `--text-muted`. **Lo estimado nunca va en rojo ni en verde**; el verde/rojo solo cuando la cifra ya no puede cambiar.
- **Sin dato:** «—», o la frase que lo dice («Sin datos de hoy», «Sin historial»). Nunca 0 si no hay datos.
- **Frescura:** «Al último sync: hace 11 min», pegada a la cifra que afecta. Las edades relativas llevan espacios duros («hace 3 d» no se parte).
- **Hora:** de EVE (UTC). «Hoy» empieza a las 00:00 EVE.

## 7. Estados

- **Datos viejos o incompletos:** la tarjeta se apaga (cifras en gris) y una línea neutra con un icono ámbar pequeño **cuantifica** («−140 M de este neto vienen de datos de hace 3 d»). La causa y la acción viven en un solo sitio (la línea de salud bajo los filtros), no repetidas por la pantalla.
- **Vacío honesto:** sin datos, un bloque que dice qué falta, por qué y una sola acción (p. ej. «Aún sin datos de X · Sincronizar · Ver todos los pilotos»).
- **Cargando o sincronizando:** el icono del botón gira; el botón se deshabilita con `cursor: progress`.
- **Error de sistema:** aviso `.notice.error` con la causa en palabras y el detalle técnico en 13 px gris.
- El ámbar es para avisos, el rojo solo para el neto negativo y el cian solo para acciones.

## 8. Gráficos

- Barras diarias de ingresos y gastos en sus colores de serie, con un punto por día para el neto (verde/rojo).
- El eje usa una sola unidad y los mismos decimales (`0 · 500 M · 1,0 B`); las etiquetas se omiten según el ancho.
- Los días sin historial van rayados con la etiqueta «Sin historial» (los días sin sync, igual, con «Sin sync»). Un día sin movimientos deja una marca corta en el eje, distinta del rayado.
- La parte de una barra que no es juego (PLEX / cuentas) va rayada, con leyenda.
- Accesibilidad: el gráfico es una lista (`role="list"` y `listitem`) con una sola parada de Tab (← → Inicio Fin), `aria-label` por día, tooltip con cifras abreviadas y una tabla completa en «Ver como tabla».

## 9. Movimiento

Casi nada se mueve. Solo en dos sitios:

1. el pulso de los sistemas donde se ganó ISK hoy en el mapa «tu New Eden», el único anillo pulsante de la interfaz;
2. las rutas del mapa estelar decorativo de la franja de marca, sin anillos ni brillos.

Nada decorativo imita un dato. Transiciones de color de 0,18 s en botones y enlaces. Todo se desactiva con `prefers-reduced-motion`.

## 10. Accesibilidad

- Foco visible: `outline: 2px solid var(--cyan); outline-offset: 3px`.
- Enlace «Saltar al contenido» como primera parada de Tab.
- Las pistas que solo dan el color o la posición (signo, operadores «más»/«menos», estado) van también en texto `sr-only`. Un neto de 0 se anuncia como «sin cambio».
- Contraste AA sobre `--panel`; nada por debajo de 12 px.
- Etiquetas `aria-label` compuestas en los chips («Lio Tanaka, −145 M, sin sync hace 4 d»).

## 11. Voz y textos

- Español neutro, directo, con la terminología del juego: pilotos, wallet, ISK, Saldo, Ingresos y Gastos, PvE, PvP, Trading, Logística, ratting, ESS, killmail, courier, Omega, PLEX, «Hoy (EVE)».
- Tres idiomas: español (predeterminado), inglés y alemán. Ningún texto fijo en el diseño que no pueda traducirse; los nombres de ESI (ítems, sistemas, pilotos) no se traducen.
- Comillas angulares «» en español. Frases que cuantifican en lugar de alarmar: «2 de 4 pilotos al día · hace 12 min», no «¡Atención!». Sin exclamaciones ni emojis.
- Números y fechas con el formato de cada idioma (`Intl`): «25 sept, 09:47».

## 12. No hagas

- Eyebrows sobre los títulos, números de sección, texto en degradado, tarjetas dentro de tarjetas.
- Cian para datos, colores de datos para la interfaz, rojo para avisos o errores de sistema.
- Anillos, brillos o pulsos decorativos; animaciones de entrada; parallax.
- Fuentes distintas de Inter, IBM Plex Mono (cifras) y Barlow Condensed (solo logotipo).
- Cifras sin unidad o con decimales distintos en la misma columna; ceros donde no hay datos.
- Logos de CCP como identidad propia (el pie lleva el aviso «EVE Online y todo lo relacionado son marcas de CCP hf.»).

## 13. Entrega

- HTML + CSS con los tokens de arriba como variables en `:root` (`color-scheme: dark`), fuentes de `@fontsource` o Google Fonts.
- Dos anchos: 1280 px y 390 px, sin scroll horizontal en móvil.
- Textos en español con datos de ejemplo verosímiles. Los pilotos de ejemplo son ficticios (p. ej. «Aria Vex», «Kade Morrow», «Lio Tanaka»): no presentes cifras inventadas como reales.
- Al final, una lista corta de los componentes que usaste y de cualquier pieza nueva que hayas tenido que crear.

## 14. Lo que quiero diseñar

[Describe aquí la pantalla o el flujo: para quién es, qué pregunta responde, qué datos tiene y en qué momento se usa.]
