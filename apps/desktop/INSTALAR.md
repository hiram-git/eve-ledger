# EVE Ledger: instalación

EVE Ledger te dice si ganas o pierdes ISK con tus pilotos de EVE Online: ingresos, gastos, naves perdidas, inventario e indicadores, juntando los wallets de todos tus pilotos. **Corre solo en tu equipo.** Tus tokens de EVE se guardan cifrados con una clave que se genera al instalar, y el programa no envía nada a nadie salvo las llamadas a ESI (la API oficial de CCP).

## 1. Instala el programa

Descarga el instalador de tu sistema:

| Sistema | Archivo |
|---|---|
| Windows 10/11 | `EVE Ledger_x.y.z_x64-setup.exe` (o el `.msi`) |
| macOS (Apple Silicon: M1 o posterior) | `EVE Ledger_x.y.z_aarch64.dmg` |
| Linux | `.deb` (Debian, Ubuntu, Mint) o `.AppImage` (cualquiera) |

Los instaladores **no están firmados**: EVE Ledger es un proyecto libre y abierto, y un certificado de firma cuesta dinero cada año. Se compilan en público con GitHub Actions desde este repositorio. Por eso el sistema avisa la primera vez:

- **Windows:** «Windows protegió su PC» → *Más información* → *Ejecutar de todas formas*.
- **macOS:** si dice que la app «no se puede abrir» o «está dañada», ve a *Ajustes del Sistema → Privacidad y seguridad* y pulsa *Abrir igualmente* (en versiones anteriores de macOS, clic derecho sobre la app → *Abrir*). Si no basta, en la Terminal: `xattr -cr "/Applications/EVE Ledger.app"`.
- **Linux (.AppImage):** dale permiso de ejecución (`chmod +x`) y ábrelo.

**Comprobar la descarga (opcional).** Cada release trae `SHA256SUMS-windows.txt`, `SHA256SUMS-macos.txt` y `SHA256SUMS-linux.txt`, con la suma de cada instalador:

- Windows (PowerShell): `Get-FileHash "EVE Ledger_x.y.z_x64-setup.exe"` y compara el resultado con la línea de ese archivo.
- macOS: `shasum -a 256 "EVE Ledger_x.y.z_aarch64.dmg"`.
- Linux: `sha256sum -c SHA256SUMS-linux.txt --ignore-missing`, en la carpeta de la descarga.

Con la [CLI de GitHub](https://cli.github.com) también puedes comprobar que el archivo lo compiló el workflow de este repositorio: `gh attestation verify <archivo> --repo <propietario>/<repositorio>` (las notas de cada release traen el comando exacto).

Las **actualizaciones automáticas** sí van firmadas, con la clave del proyecto: la app solo instala una versión nueva si la firma coincide.

## 2. Configura y vincula tus pilotos

No hace falta crear nada en el portal de desarrolladores de EVE: el programa ya trae su aplicación de EVE. Al abrirlo por primera vez, el asistente solo te pide tus preferencias:

- **Pilotos que vas a vincular:** las plazas de la página de pilotos.
- **Sincronizar cada (minutos):** 60 por defecto; 0 = solo a mano.
- **Cuentas en Omega** y **PLEX por mes de Omega:** para el indicador del Omega.
- **Contacto para ESI** (opcional): tu nombre en EVE o un email.
- **En segundo plano:** abrir EVE Ledger al iniciar sesión y seguir en la bandeja al cerrar la ventana (las dos marcadas por defecto; ver más abajo).

Pulsa **Guardar y abrir el ledger**. Se abre el dashboard. Ve a **Pilotos → Vincular piloto**: el login de EVE se abre en tu navegador. Inicia sesión allí y elige el personaje; al terminar, el navegador dice «Piloto vinculado · Puedes cerrar esta página» y la ventana del ledger muestra el piloto en Pilotos. Repite con cada uno de tus personajes. El primer sync tarda unos segundos por piloto.

> **¿Ya tenías pilotos de una versión anterior?** La pestaña **Doctrinas** necesita leer sus skills, un permiso nuevo. En Pilotos, los que no lo tienen dicen «Skills (doctrinas) · falta el permiso»: pulsa **Revincular** y entra con ese mismo personaje. Marca también en Pilotos qué cuentas son **Alfa** (entrenan a la mitad y no pueden usar todas las skills).

> **Nombres de las citadelas (opcional):** desde la 0.1.14, EVE Ledger puede mostrar el nombre de las citadelas donde guardas cosas o comercias (si no, salen como «Estructura …»). Los pilotos vinculados antes muestran en Pilotos el chip «Nombres de citadelas · opcional»: púlsalo (o **Revincular**) y entra con ese personaje para concederlo. Solo se ven las citadelas a las que ese piloto tiene acceso.

> **¿Configuraste tu propia aplicación de EVE con una Secret Key en una versión anterior?** Desde la 0.1.13 la Secret Key no se usa (solo el Client ID). Los pilotos vinculados con ella salen como «Token caducado»: pulsa **Revincular** en cada uno.

> ESI solo guarda unos 30 días del wallet. EVE Ledger acumula el historial desde el primer sync: cuanto antes lo instales, más historial tendrás. El programa tiene que estar abierto (o en la bandeja) para sincronizar.

## En segundo plano

EVE Ledger pone un icono en la **bandeja del sistema** (junto al reloj; en macOS, en la barra de menús). Con él puedes abrir la ventana, **sincronizar ahora**, activar **Iniciar con el sistema** y **salir**.

- **Al cerrar la ventana, sigue en la bandeja** y sincronizando cada hora. La primera vez te lo recuerda con un aviso. Para salir del todo, usa **Salir** en el icono de la bandeja o en el menú (`Ctrl+Q`, `Cmd+Q` en macOS).
- **Iniciar con el sistema:** al iniciar sesión, EVE Ledger se abre en la bandeja, sin ventana, y sincroniza aunque no lo abras. Así no pierdes días de historial.

Las dos opciones se cambian en **Configuración…** (y «Iniciar con el sistema», también en el icono de la bandeja). Si actualizas desde una versión anterior, «Iniciar con el sistema» empieza desactivado: actívalo tú.

> **Linux:** el icono necesita AppIndicator (en Ubuntu y Debian viene con el escritorio; en GNOME puro, la extensión «AppIndicator and KStatusNotifierItem Support»). Clic en el icono abre su menú.

## Cambiar la configuración después

Menú **EVE Ledger → Configuración…** (o `Ctrl+,`, `Cmd+,` en macOS). Al guardar, el ledger se reinicia con los nuevos valores.

- El **puerto del dashboard** se puede cambiar en «Avanzado»; el de la API es fijo (47300), porque es el que conoce la aplicación de EVE incluida. Si otro programa lo usa, ciérralo.
- La **clave de cifrado** solo se regenera si hace falta (por ejemplo, si se filtró tu archivo de configuración). Después hay que volver a vincular los pilotos.

## Actualizaciones

Si instalaste EVE Ledger desde la página de releases, se actualiza solo: al arrancar y cada pocas horas busca una versión nueva, la descarga y te pregunta si **reiniciar ahora** o instalarla **al salir de la app** («Salir» en la bandeja o en el menú: cerrar la ventana la deja en la bandeja). Tus pilotos, tu historial y tu configuración se conservan. También puedes buscarla en el menú: **EVE Ledger → Buscar actualizaciones…**. En Windows, el instalador se ve un momento al aplicarla.

## Dónde están tus datos

En el menú: **Abrir la carpeta de datos** (tu historial, `ledger.db`) y **Abrir los registros** (`api.log` y `web.log`, por si algo falla).

| Sistema | Configuración (`ledger.env`) | Datos y registros |
|---|---|---|
| Windows | `%APPDATA%\net.eveledger.desktop\` | `%APPDATA%\net.eveledger.desktop\` y `%LOCALAPPDATA%\net.eveledger.desktop\logs\` |
| macOS | `~/Library/Application Support/net.eveledger.desktop/` | ídem y `~/Library/Logs/net.eveledger.desktop/` |
| Linux | `~/.config/net.eveledger.desktop/` | `~/.local/share/net.eveledger.desktop/` |

Desinstalar el programa **no borra** tus datos.

## Copias de seguridad

ESI solo da unos 30 días de wallet: lo anterior está únicamente en `ledger.db`. Por eso EVE Ledger guarda **una copia al día** (y otra antes de cada actualización) en la carpeta `backups`, junto a `ledger.db`; se quedan las últimas 14 diarias.

En **Pilotos → Copias de seguridad** puedes hacer una copia en el momento, **descargarla** y **restaurar** cualquiera (también un archivo descargado antes, por ejemplo al cambiar de equipo). Antes de restaurar, lo que hay se guarda como copia «Antes de restaurar». Si la copia viene de otro equipo, tendrás que revincular los pilotos (sus tokens van cifrados con la clave de aquel equipo); tu historial se conserva.

Descarga una de vez en cuando y guárdala fuera de este equipo: si el disco falla, es lo único que conserva tu historial.

## Privacidad

- El dashboard y la API solo escuchan en tu equipo (`127.0.0.1`): nadie de tu red local puede verlos.
- Los tokens de EVE van cifrados (AES-GCM) con la clave de tu `ledger.env`: no compartas ese archivo. En Linux y macOS solo lo puede leer tu usuario.
- Solo responde a páginas de tu propio equipo: una web que visites no puede leer tu ledger ni lanzar un sync.
- Nadie más (tampoco quien te pasó el instalador) ve tus datos.

*EVE Online y sus marcas son de CCP hf. EVE Ledger no está afiliado a CCP.*
