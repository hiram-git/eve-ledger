# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Un único jugador de EVE Online, dueño del proyecto, que maneja 5 personajes. Es la única persona que usa la herramienta; no hay otros roles ni cuentas.

Lo consulta en dos momentos:

- **Mientras juega:** abierto en un segundo monitor junto al cliente de EVE, con vistazos rápidos entre acciones.
- **Revisión periódica:** al terminar una sesión o una vez por semana, para entender cómo fue el período.

## Product Purpose

EVE Ledger consolida los wallets y el inventario de los 5 personajes en una sola economía y responde, antes que nada, **«¿gano o pierdo ISK?»**: el neto del período, de dónde viene el ISK y en qué se va.

Existe porque el juego no consolida entre personajes y porque ESI solo retiene unos 30 días del wallet journal: EVE Ledger sincroniza cada hora y acumula el historial localmente, así que el valor crece con el tiempo que lleva funcionando.

Éxito: de un vistazo se sabe si el período va en positivo o en negativo y qué lo explica; en la revisión se puede ver el detalle por actividad, piloto e ítem, y el patrimonio total (saldo + inventario).

## Positioning

Una contabilidad local y privada de *tus* 5 pilotos como una sola economía: los tokens de EVE SSO se guardan cifrados en tu máquina, sin servicios de terceros; las transferencias entre tus propios pilotos se anulan en lugar de inflar ingresos y gastos; y el historial sobrevive a la retención de 30 días de ESI porque se acumula desde el primer sync.

## Operating Context

- Corre solo en localhost: API en `http://localhost:3000`, dashboard en `http://localhost:4321`.
- Sync automático cada 60 minutos (configurable) y botón de sync manual. ESI cachea el journal, las transacciones y los assets alrededor de 1 hora, así que los datos pueden ir hasta ~1 h por detrás del juego; la antigüedad de los datos es información relevante para el usuario.
- La hora de referencia es la hora de EVE (UTC).
- Actividades principales de los pilotos: **PvE** (ratting, ESS, misiones de agentes) y **PvP/otros** (seguros, contratos, alts de soporte). Mercado/trading, industria, minería y PI no son el foco: esas secciones son secundarias.
- Sesiones de juego largas; el dashboard convive con el cliente del juego en otra pantalla.

## Capabilities and Constraints

Confirmado en el código:

- Vinculación de personajes con EVE SSO (scopes `esi-wallet.read_character_wallet.v1`, `esi-assets.read_assets.v1` y `esi-killmails.read_killmails.v1`).
- Sync idempotente de wallet journal, wallet transactions e inventario (assets); nombres de ítems, estaciones y sistemas vía `/universe/names`.
- Resumen consolidado por período (7 / 30 / 90 días): neto, ingresos, gastos, desglose por tipo de movimiento, por piloto y por día; top de ítems comprados y vendidos; patrimonio = saldo + inventario valorado.
- Idioma: español neutro. Terminología de EVE: ISK con sufijos k / M / B, «pilotos», hora de EVE.

Restricciones:

- Un solo usuario, sin login propio. Si crece, migrar a PostgreSQL.
- Límites de ESI: rate limit (420/429), caché de ~1 h y retención del journal de ~30 días.
- El inventario se valora con el precio medio global de ESI, no con el precio de venta de Jita; las copias de blueprint valen 0.
- Las estructuras de jugadores (citadelas) aparecen sin nombre: requieren el scope `esi-universe.read_structures.v1`.

Decisiones abiertas (no inventar):

- **Pérdidas de naves en PvP:** una nave perdida no es un movimiento del wallet; solo se ve el pago del seguro y la bajada del inventario. Registrar pérdidas reales requeriría killmails (scope `esi-killmails.read_killmails.v1`), aún no decidido.
- Precio de valoración alternativo (p. ej. venta en Jita) y historial del patrimonio: pendientes.

## Brand Commitments

- Nombre: **EVE Ledger**.
- Voz: español neutro, directo, con la terminología del juego.
- El usuario pidió un estilo oscuro, futurista y de ciencia ficción, inspirado en una hoja de estilos de referencia (fondo azul noche, acentos cian). La implementación actual vive en `apps/web/src/styles/theme.css`.
- EVE Online y sus marcas son de CCP hf.: no usar logos de CCP como identidad propia; mantener el aviso de marcas en el pie.

## Evidence on Hand

- Aún no hay datos reales: ningún personaje vinculado todavía.
- Las capturas y pruebas usan datos ficticios (pilotos «Aria Vex», «Kade Morrow», «Lio Tanaka») que no deben presentarse como datos reales.
- No existen testimonios, métricas de uso ni comparativas: no fabricarlos.

## Product Principles

1. **El neto primero.** Cada vista responde antes que nada «¿gano o pierdo ISK?» y qué lo explica; el resto es detalle.
2. **Un vistazo mientras juegas, el detalle al revisar.** Lo esencial se lee en segundos desde otro monitor; las tablas y desgloses sirven a la revisión periódica.
3. **Honestidad sobre los datos.** Mostrar siempre de cuándo son los datos, de dónde salen y qué se excluye (transferencias internas, precios medios, BPC = 0) en lugar de aparentar precisión.
4. **Una sola economía.** Los 5 pilotos cuentan como uno; lo que se mueve entre ellos se anula.
5. **Local y privado.** Nada sale de la máquina salvo las llamadas a ESI.
