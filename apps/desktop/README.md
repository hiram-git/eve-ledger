# EVE Ledger de escritorio (Tauri)

Empaqueta el ledger personal (`apps/api` + `apps/web`) como una app de escritorio con instalador, para compartirlo (por ejemplo, con la corp). Guía para quien lo instala: [INSTALAR.md](INSTALAR.md).

## Cómo funciona

- **Tauri 2** (Rust) abre una ventana. En el primer arranque muestra el asistente (`ui/`, páginas locales en ES/EN/DE), que crea `ledger.env` en la carpeta de configuración del usuario. Lleva las mismas claves que los `.env` de `apps/api` y `apps/web`.
- Con la configuración válida, `src-tauri/src/services.rs` copia el servidor de los recursos a la carpeta de datos local del usuario (`server/<versión-huella>`, una vez por compilación). En Windows, Bun no puede leer archivos en `C:\Program Files` («EPERM reading»). Después arranca dos procesos con **Bun como sidecar**:
  - la API (`resources/server/api/api.js`), con `DB_PATH` en la carpeta de datos del usuario y `MIGRATIONS_DIR` en los recursos;
  - la web (Astro SSR, `resources/server/web/server/entry.js`), con `API_URL` y `PILOT_SLOTS` leídos al arrancar.
- Los dos escuchan solo en `127.0.0.1`, por defecto en los puertos 47300 (API) y 47321 (web). La ventana principal navega a `http://127.0.0.1:47321`; esa página remota no puede invocar ningún comando de Tauri (lo deniega el ACL de las capacidades).
- **Configuración…** (menú, `Ctrl/Cmd+,`) reabre el asistente en otra ventana; guardar reinicia los servicios.
- La salida de los procesos va a `api.log` y `web.log` en la carpeta de registros. Una sola instancia (los puertos y la base son únicos).

## Compilar

Requisitos: [Bun](https://bun.sh) 1.3, [Rust](https://rustup.rs) estable y las [dependencias de Tauri](https://v2.tauri.app/start/prerequisites/) de tu sistema:
- **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con «Desarrollo para el escritorio con C++», y Rust con el toolchain MSVC (el de `rustup` por defecto). WebView2 ya viene con Windows 10/11. La CLI de Tauri descarga NSIS y WiX ella sola la primera vez.
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux:** `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`…

```sh
cd apps/desktop
bun run prepare:server   # dependencias (también la CLI de Tauri), API y web empaquetadas en src-tauri/resources/server, y Bun en src-tauri/binaries
bun run tauri dev        # o: bun run tauri build  → src-tauri/target/release/bundle/
```

`prepare:server` hay que correrlo en cada sistema para el que se compila (copia el Bun de esa máquina como sidecar) y cada vez que cambian `apps/api` o `apps/web`.

### La app de EVE incluida (obligatoria)

Quien instala no crea ninguna app en el portal de desarrolladores de EVE (decisión del usuario): el instalador trae el Client ID de una app de EVE y el login usa PKCE, sin secreto. El asistente ya no tiene pasos ni campos para una app propia.

1. Crea una vez la app en <https://developers.eveonline.com/applications> con los cuatro scopes (`esi-wallet.read_character_wallet.v1`, `esi-assets.read_assets.v1`, `esi-killmails.read_killmails.v1`, `esi-contracts.read_character_contracts.v1`) y la Callback URL `http://127.0.0.1:47300/auth/callback`: cada uno la abre en su propio equipo, por eso el puerto de la API es fijo. La Secret Key no hace falta y no se debe repartir.
2. Compila con su Client ID en `EVE_LEDGER_CLIENT_ID` (es público: va en la URL del login):
   ```sh
   EVE_LEDGER_CLIENT_ID=tu-client-id bun run tauri build          # PowerShell: $env:EVE_LEDGER_CLIENT_ID="tu-client-id"; bun run tauri build
   ```
   En GitHub Actions es la variable del repositorio `EVE_LEDGER_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables). **Sin ella, el workflow falla** con un mensaje que lo dice: un instalador sin app de EVE no podría vincular pilotos.

Quien configuró su propia app en una versión anterior la conserva: `ledger.env` guarda su Client ID (y su Secret Key, si la puso) y el asistente no los toca, así que sus pilotos no tienen que revincularse.

Para los tres sistemas sin tenerlos todos: el workflow [`.github/workflows/desktop.yml`](../../.github/workflows/desktop.yml) los compila en GitHub Actions. Se lanza solo cuando una versión nueva de `src-tauri/tauri.conf.json` llega a `main` (merge): compila los tres instaladores y deja un borrador de release «EVE Ledger x.y.z» con la etiqueta `desktop-vx.y.z` (si esa release ya existe, no hace nada: hay que subir la versión). También a mano (Actions → «Instaladores de escritorio» → Run workflow: los instaladores quedan como artefactos y, con la casilla «release», también el borrador) o con una etiqueta `desktop-v0.1.0` que coincida con la versión.

## Actualizaciones automáticas

La app busca una versión nueva al arrancar y cada 6 horas en la última release publicada de este repositorio (`latest.json`), la descarga en segundo plano, comprueba su firma y pregunta: **Reiniciar ahora** o **Al cerrar la app**. También en el menú: «Buscar actualizaciones…». Los datos y la configuración están en las carpetas del usuario y no se tocan. Registro en `updates.log`, en la carpeta de registros.

Cada versión va firmada; la app solo acepta lo firmado con tu clave. Solo se actualizan las copias instaladas desde una release de GitHub Actions con la clave configurada: una compilación local no lleva la clave pública y no busca actualizaciones.

**Una vez:**
1. Genera el par de claves en tu equipo (te pide una contraseña):
   ```sh
   cd apps/desktop
   bunx tauri signer generate -w ~/.tauri/eve-ledger.key      # Windows: -w %USERPROFILE%\.tauri\eve-ledger.key
   ```
2. En GitHub → Settings → Secrets and variables → Actions:
   - **Secrets:** `TAURI_SIGNING_PRIVATE_KEY` = el contenido de `eve-ledger.key` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = su contraseña.
   - **Variables:** `EVE_LEDGER_UPDATER_PUBKEY` = el contenido de `eve-ledger.key.pub`.
3. Guarda `eve-ledger.key` y la contraseña en un sitio seguro y no la subas al repositorio. Si la pierdes, las apps instaladas ya no aceptarán versiones nuevas y habrá que reinstalar a mano con una clave nueva.

**Cada versión:**
1. Sube la versión en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` (la app solo se actualiza a una versión mayor).
2. Commit y merge a `main` (o etiqueta y push: `git tag desktop-v0.1.6 && git push origin desktop-v0.1.6`).
3. Cuando terminen los tres sistemas en Actions, revisa el borrador de la release y pulsa **Publish release**. Desde ese momento, las apps instaladas la reciben al arrancar o en menos de 6 horas.

## Notas

- **Iconos:** se generan desde `icons/app-icon.png` (el emblema de `apps/web/public/favicon.svg` a 1024 px) con `bun run icons`.
- **Versión:** en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
- **Firma de código:** no hay (Windows y macOS avisan; ver INSTALAR.md). Para firmar, ver la [guía de Tauri](https://v2.tauri.app/distribute/sign/).
- **Tests de la configuración:** `cd src-tauri && cargo test` (con `EVE_LEDGER_CLIENT_ID=x` también prueba la app incluida).
