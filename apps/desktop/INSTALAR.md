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

## 2. Crea tu aplicación de EVE (una vez, dos minutos)

EVE Ledger habla con EVE a través de una aplicación tuya en el portal de desarrolladores de CCP. Es gratis y solo la usas tú. Al abrir EVE Ledger por primera vez, el asistente te lo explica paso a paso:

1. Entra en <https://developers.eveonline.com/applications> con tu cuenta de EVE y crea una aplicación.
2. Ponle cualquier nombre (por ejemplo «EVE Ledger») y elige **Authentication & API Access**.
3. Añade estos cuatro permisos (scopes). El asistente tiene un botón para copiarlos:
   - `esi-wallet.read_character_wallet.v1`
   - `esi-assets.read_assets.v1`
   - `esi-killmails.read_killmails.v1`
   - `esi-contracts.read_character_contracts.v1`
4. Como **Callback URL**, pega exactamente la que te muestra el asistente: `http://127.0.0.1:47300/auth/callback` (cambia si cambias el puerto de la API).
5. Crea la aplicación y copia su **Client ID** y su **Secret Key** en el asistente.

## 3. Configura y vincula tus pilotos

En el asistente, además del Client ID y la Secret Key, puedes ajustar:

- **Pilotos que vas a vincular:** las plazas de la página de pilotos.
- **Sincronizar cada (minutos):** 60 por defecto; 0 = solo a mano.
- **Cuentas en Omega** y **PLEX por mes de Omega:** para el indicador del Omega.
- **Contacto para ESI** (opcional): tu nombre en EVE o un email.

Pulsa **Guardar y abrir el ledger**. Se abre el dashboard. Ve a **Pilotos → Vincular piloto**: el login de EVE se abre en tu navegador. Inicia sesión allí y elige el personaje; al terminar, la ventana del ledger muestra el piloto vinculado (la pestaña del navegador se puede cerrar). Repite con cada uno de tus personajes. El primer sync tarda unos segundos por piloto.

> ESI solo guarda unos 30 días del wallet. EVE Ledger acumula el historial desde el primer sync: cuanto antes lo instales, más historial tendrás. El programa tiene que estar abierto para sincronizar.

## Cambiar la configuración después

Menú **EVE Ledger → Configuración…** (o `Ctrl+,`, `Cmd+,` en macOS). Al guardar, el ledger se reinicia con los nuevos valores.

- Si cambias el **puerto de la API**, cambia también la Callback URL en tu aplicación de EVE.
- La **clave de cifrado** solo se regenera si hace falta (por ejemplo, si se filtró tu archivo de configuración). Después hay que volver a vincular los pilotos.

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
- Los tokens de EVE van cifrados (AES-GCM) con la clave de tu `ledger.env`. Ese archivo también lleva la Secret Key de tu aplicación de EVE: no lo compartas.
- Nadie más (tampoco quien te pasó el instalador) ve tus datos.

*EVE Online y sus marcas son de CCP hf. EVE Ledger no está afiliado a CCP.*
