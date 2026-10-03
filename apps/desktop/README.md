# EVE Ledger de escritorio (Tauri)

Empaqueta el ledger personal (`apps/api` + `apps/web`) como una app de escritorio con instalador, para compartirlo (por ejemplo, con la corp). Guía para quien lo instala: [INSTALAR.md](INSTALAR.md).

## Cómo funciona

- **Tauri 2** (Rust) abre una ventana. En el primer arranque muestra el asistente (`ui/`, páginas locales en ES/EN/DE), que crea `ledger.env` en la carpeta de configuración del usuario. Lleva las mismas claves que los `.env` de `apps/api` y `apps/web`.
- Con la configuración válida, `src-tauri/src/services.rs` arranca dos procesos con **Bun como sidecar**:
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

Para los tres sistemas sin tenerlos todos: el workflow [`.github/workflows/desktop.yml`](../../.github/workflows/desktop.yml) los compila en GitHub Actions. Se lanza a mano (los instaladores quedan como artefactos) o con una etiqueta `desktop-v0.1.0`, que además crea un borrador de release.

## Notas

- **Iconos:** se generan desde `icons/app-icon.png` (el emblema de `apps/web/public/favicon.svg` a 1024 px) con `bun run icons`.
- **Versión:** en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
- **Firma de código:** no hay (Windows y macOS avisan; ver INSTALAR.md). Para firmar, ver la [guía de Tauri](https://v2.tauri.app/distribute/sign/).
- **Tests de la configuración:** `cd src-tauri && cargo test`.
