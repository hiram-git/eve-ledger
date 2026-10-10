# EVE Ledger: instalación

EVE Ledger te dice si ganas o pierdes ISK con tus pilotos de EVE Online: ingresos, gastos, naves perdidas, inventario e indicadores, juntando los wallets de todos tus pilotos. **Corre solo en tu equipo.** Tus tokens de EVE se guardan cifrados con una clave que se genera al instalar, y el programa no envía nada a nadie salvo las llamadas a ESI (la API oficial de CCP).

## 1. Instala el programa

Descarga el instalador de tu sistema:

| Sistema | Archivo |
|---|---|
| Windows 10/11 | `EVE Ledger_x.y.z_x64-setup.exe` (o el `.msi`) |
| macOS (Apple Silicon: M1 o posterior) | `EVE Ledger_x.y.z_aarch64.dmg` |
| Linux | `.deb` (Debian, Ubuntu, Mint) o `.AppImage` (cualquiera) |

Los instaladores **no están firmados** (un certificado cuesta dinero), así que el sistema avisa la primera vez:

- **Windows:** «Windows protegió su PC» → *Más información* → *Ejecutar de todas formas*.
- **macOS:** si dice que la app «está dañada» o «no se puede abrir», ábrela con clic derecho → *Abrir*. Si no basta, en la Terminal: `xattr -cr "/Applications/EVE Ledger.app"`.
- **Linux (.AppImage):** dale permiso de ejecución (`chmod +x`) y ábrelo.

## 2. Configura y vincula tus pilotos

No hace falta crear nada en el portal de desarrolladores de EVE: el programa ya trae su aplicación de EVE. Al abrirlo por primera vez, el asistente solo te pide tus preferencias:

- **Pilotos que vas a vincular:** las plazas de la página de pilotos.
- **Sincronizar cada (minutos):** 60 por defecto; 0 = solo a mano.
- **Cuentas en Omega** y **PLEX por mes de Omega:** para el indicador del Omega.
- **Contacto para ESI** (opcional): tu nombre en EVE o un email.

Pulsa **Guardar y abrir el ledger**. Se abre el dashboard. Ve a **Pilotos → Vincular piloto**: el login de EVE se abre en tu navegador. Inicia sesión allí y elige el personaje; al terminar, el navegador dice «Piloto vinculado · Puedes cerrar esta página» y la ventana del ledger muestra el piloto en Pilotos. Repite con cada uno de tus personajes. El primer sync tarda unos segundos por piloto.

> **¿Ya tenías pilotos de una versión anterior?** La pestaña **Doctrinas** necesita leer sus skills, un permiso nuevo. En Pilotos, los que no lo tienen dicen «Skills (doctrinas) · falta el permiso»: pulsa **Revincular** y entra con ese mismo personaje. Marca también en Pilotos qué cuentas son **Alfa** (entrenan a la mitad y no pueden usar todas las skills).

> ESI solo guarda unos 30 días del wallet. EVE Ledger acumula el historial desde el primer sync: cuanto antes lo instales, más historial tendrás. El programa tiene que estar abierto para sincronizar.

## Cambiar la configuración después

Menú **EVE Ledger → Configuración…** (o `Ctrl+,`, `Cmd+,` en macOS). Al guardar, el ledger se reinicia con los nuevos valores.

- El **puerto del dashboard** se puede cambiar en «Avanzado»; el de la API es fijo (47300), porque es el que conoce la aplicación de EVE incluida. Si otro programa lo usa, ciérralo.
- La **clave de cifrado** solo se regenera si hace falta (por ejemplo, si se filtró tu archivo de configuración). Después hay que volver a vincular los pilotos.

## Actualizaciones

Si instalaste EVE Ledger desde la página de releases, se actualiza solo: al arrancar y cada pocas horas busca una versión nueva, la descarga y te pregunta si **reiniciar ahora** o instalarla **al cerrar la app**. Tus pilotos, tu historial y tu configuración se conservan. También puedes buscarla en el menú: **EVE Ledger → Buscar actualizaciones…**. En Windows, el instalador se ve un momento al aplicarla.

## Dónde están tus datos

En el menú: **Abrir la carpeta de datos** (tu historial, `ledger.db`) y **Abrir los registros** (`api.log` y `web.log`, por si algo falla).

| Sistema | Configuración (`ledger.env`) | Datos y registros |
|---|---|---|
| Windows | `%APPDATA%\net.eveledger.desktop\` | `%APPDATA%\net.eveledger.desktop\` y `%LOCALAPPDATA%\net.eveledger.desktop\logs\` |
| macOS | `~/Library/Application Support/net.eveledger.desktop/` | ídem y `~/Library/Logs/net.eveledger.desktop/` |
| Linux | `~/.config/net.eveledger.desktop/` | `~/.local/share/net.eveledger.desktop/` |

Para hacer una copia de seguridad, cierra el programa y copia `ledger.db`. Desinstalar el programa **no borra** tus datos.

## Privacidad

- El dashboard y la API solo escuchan en tu equipo (`127.0.0.1`): nadie de tu red local puede verlos.
- Los tokens de EVE van cifrados (AES-GCM) con la clave de tu `ledger.env`: no compartas ese archivo. En Linux y macOS solo lo puede leer tu usuario.
- Solo responde a páginas de tu propio equipo: una web que visites no puede leer tu ledger ni lanzar un sync.
- Nadie más (tampoco quien te pasó el instalador) ve tus datos.

*EVE Online y sus marcas son de CCP hf. EVE Ledger no está afiliado a CCP.*
