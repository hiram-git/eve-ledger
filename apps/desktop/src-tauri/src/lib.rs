//! EVE Ledger de escritorio: un envoltorio de Tauri para el ledger personal.
//! - Primer arranque: la ventana principal muestra el asistente (ui/index.html) para crear `ledger.env`.
//! - Después: arranca la API y la web (services.rs) y la ventana principal navega al dashboard
//!   (http://127.0.0.1:<puerto web>), que no tiene acceso a ningún comando de Tauri.
//! - «Configuración…» (menú, Ctrl/Cmd+,) abre la misma página en otra ventana; al guardar, reinicia los servicios.

mod config;
mod services;
mod updates;

use config::Config;
use serde::Serialize;
use services::Services;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Listener, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

/// Estado de los servicios para la interfaz: starting | ready | error (con el motivo) | setup
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct Status {
    state: String,
    message: Option<String>,
}

#[derive(Default)]
struct AppState {
    status: Mutex<Status>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StateView {
    configured: bool,
    config: Config,
    callback_url: String,
    /// Client ID de la app de EVE que trae el instalador, si la trae
    bundled_client_id: Option<String>,
    config_path: String,
    data_dir: String,
    log_dir: String,
    version: String,
    status: Status,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(services::plain(app.path().app_config_dir().map_err(|e| e.to_string())?.join("ledger.env")))
}

fn load_config(app: &AppHandle) -> Option<Config> {
    config_path(app).ok().and_then(|p| config::load(&p))
}

fn set_status(app: &AppHandle, state: &str, message: Option<String>) {
    let status = Status { state: state.into(), message };
    *app.state::<AppState>().status.lock().unwrap() = status.clone();
    let _ = app.emit("ledger-status", status);
}

/// Arranca (o reinicia) los servicios en segundo plano y, cuando responden, lleva la ventana principal al dashboard
fn launch(app: &AppHandle, cfg: Config) {
    set_status(app, "starting", None);
    let app = app.clone();
    std::thread::spawn(move || {
        let services = app.state::<Services>();
        let result = services
            .start(&app, &cfg)
            .and_then(|_| services.wait_ready(&app, &cfg, Duration::from_secs(45)));
        match result {
            Ok(()) => {
                set_status(&app, "ready", None);
                if let (Some(main), Ok(url)) = (app.get_webview_window("main"), Url::parse(&cfg.web_url())) {
                    let _ = main.navigate(url);
                }
                if let Some(settings) = app.get_webview_window("settings") {
                    let _ = settings.close();
                }
            }
            Err(e) => {
                services.stop();
                set_status(&app, "error", Some(e));
            }
        }
    });
}

#[tauri::command]
fn get_state(app: AppHandle) -> Result<StateView, String> {
    let saved = load_config(&app);
    let p = services::paths(&app)?;
    let cfg = saved.clone().unwrap_or_default();
    Ok(StateView {
        configured: saved.as_ref().is_some_and(|c| config::validate(c).is_empty()),
        callback_url: config::callback_url(cfg.api_port),
        bundled_client_id: config::bundled_client_id().map(str::to_string),
        config: cfg,
        config_path: config_path(&app)?.to_string_lossy().into(),
        data_dir: p.data.to_string_lossy().into(),
        log_dir: p.logs.to_string_lossy().into(),
        version: app.package_info().version.to_string(),
        status: app.state::<AppState>().status.lock().unwrap().clone(),
    })
}

/// Guarda la configuración y (re)arranca los servicios. Devuelve los errores de validación, si los hay
#[tauri::command]
fn save_config(app: AppHandle, config: Config) -> Result<Vec<&'static str>, String> {
    let errors = config::validate(&config);
    if !errors.is_empty() {
        return Ok(errors);
    }
    config::save(&config_path(&app)?, &config).map_err(|e| e.to_string())?;
    launch(&app, config);
    Ok(vec![])
}

#[tauri::command]
fn retry(app: AppHandle) {
    if let Some(cfg) = load_config(&app) {
        launch(&app, cfg);
    }
}

#[tauri::command]
fn new_enc_key() -> String {
    config::generate_enc_key()
}

#[tauri::command]
fn callback_url_for(port: u16) -> String {
    config::callback_url(port)
}

#[tauri::command]
fn open_dir(app: AppHandle, which: String) -> Result<(), String> {
    let p = services::paths(&app)?;
    let dir = if which == "logs" { p.logs } else { p.data };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    show_settings(&app);
}

/// La ventana de configuración: si la principal sigue en el asistente, es esa; si no, una aparte
fn show_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.set_focus();
        return;
    }
    let main_is_local = app
        .get_webview_window("main")
        .and_then(|w| w.url().ok())
        .is_some_and(|u| u.scheme() != "http");
    if main_is_local {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_focus();
        }
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html".into()))
        .title(menu_text("settingsTitle"))
        .inner_size(720.0, 860.0)
        .min_inner_size(420.0, 560.0)
        .build();
}

/// Qué se abre dentro de la ventana: el asistente, el dashboard y la API (todo en 127.0.0.1).
/// El login de EVE (`/auth/login`, «Vincular piloto» y «Revincular») y cualquier sitio de fuera van al navegador
/// del sistema: ahí el usuario tiene su sesión de EVE y su gestor de contraseñas (RFC 8252), y la ventana de
/// la app no navega a páginas que no son suyas. La callback vuelve a la API local, que avisa a la app (AUTH_RESULT_EVENT)
fn on_navigation(app: &AppHandle, url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return true;
    }
    let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "tauri.localhost"));
    let login = local && url.path() == "/auth/login";
    if local && !login {
        return true;
    }
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
    if login {
        // Fuera del manejador de navegación, que no debe tocar la misma vista
        let app = app.clone();
        std::thread::spawn(move || {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.eval(&login_notice_script());
            }
        });
    }
    false
}

/// Aviso en el dashboard mientras el login de EVE está en el navegador (el dashboard no tiene comandos de Tauri:
/// el aviso se inyecta desde aquí y desaparece al navegar)
fn login_notice_script() -> String {
    let text = serde_json::to_string(menu_text("loginNotice")).unwrap_or_default();
    let close = serde_json::to_string(menu_text("close")).unwrap_or_default();
    format!(
        r#"(() => {{
  document.getElementById('desktop-login-notice')?.remove();
  const box = document.createElement('div');
  box.id = 'desktop-login-notice';
  box.setAttribute('role', 'status');
  box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1000;max-width:min(560px,calc(100vw - 32px));display:flex;gap:12px;align-items:center;padding:12px 16px;border:1px solid var(--line-strong, #2b3a4a);border-radius:var(--radius, 8px);background:var(--surface-raised, #111a24);color:var(--text-primary, #e6edf3);font:14px/1.45 var(--font, system-ui, sans-serif);box-shadow:0 8px 24px rgba(0,0,0,.4)';
  const p = document.createElement('span');
  p.textContent = {text};
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = '×';
  b.setAttribute('aria-label', {close});
  b.style.cssText = 'min-width:40px;min-height:40px;border:0;background:none;color:inherit;font-size:20px;cursor:pointer';
  b.onclick = () => box.remove();
  box.append(p, b);
  document.body.append(box);
}})()"#
    )
}

/// Textos del menú según el idioma del sistema (la interfaz de la web tiene su propio selector ES/EN/DE)
fn menu_text(key: &str) -> &'static str {
    let lang = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    let lang = if lang.starts_with("de") { "de" } else if lang.starts_with("en") { "en" } else { "es" };
    match (lang, key) {
        ("en", "menu") => "EVE Ledger",
        ("en", "settings") => "Settings…",
        ("en", "settingsTitle") => "EVE Ledger · Settings",
        ("en", "reload") => "Reload",
        ("en", "updates") => "Check for updates…",
        ("en", "data") => "Open data folder",
        ("en", "logs") => "Open logs",
        ("en", "quit") => "Quit",
        ("en", "loginNotice") => "EVE login opened in your browser. When you finish there, this window shows the linked pilot (you can close that tab).",
        ("en", "close") => "Close",
        ("de", "menu") => "EVE Ledger",
        ("de", "settings") => "Einstellungen…",
        ("de", "settingsTitle") => "EVE Ledger · Einstellungen",
        ("de", "reload") => "Neu laden",
        ("de", "updates") => "Nach Updates suchen…",
        ("de", "data") => "Datenordner öffnen",
        ("de", "logs") => "Protokolle öffnen",
        ("de", "quit") => "Beenden",
        ("de", "loginNotice") => "Der EVE-Login wurde in deinem Browser geöffnet. Wenn du dort fertig bist, zeigt dieses Fenster den verknüpften Piloten (den Tab kannst du schließen).",
        ("de", "close") => "Schließen",
        (_, "menu") => "EVE Ledger",
        (_, "settings") => "Configuración…",
        (_, "settingsTitle") => "EVE Ledger · Configuración",
        (_, "reload") => "Recargar",
        (_, "updates") => "Buscar actualizaciones…",
        (_, "data") => "Abrir la carpeta de datos",
        (_, "logs") => "Abrir los registros",
        (_, "quit") => "Salir",
        (_, "loginNotice") => "Se abrió el login de EVE en tu navegador. Al terminar allí, esta ventana muestra el piloto vinculado (puedes cerrar esa pestaña).",
        (_, "close") => "Cerrar",
        _ => "",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Una sola instancia: los puertos son fijos y la base de datos, una
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Services::default())
        .manage(updates::Pending::default())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            get_state,
            save_config,
            retry,
            new_enc_key,
            callback_url_for,
            open_dir,
            open_settings
        ])
        .setup(|app| {
            let handle = app.handle();
            let mut ledger_menu = SubmenuBuilder::new(handle, menu_text("menu"))
                .item(&MenuItemBuilder::with_id("settings", menu_text("settings")).accelerator("CmdOrCtrl+,").build(handle)?)
                .item(&MenuItemBuilder::with_id("reload", menu_text("reload")).accelerator("CmdOrCtrl+R").build(handle)?);
            if updates::enabled(handle) {
                ledger_menu = ledger_menu.item(&MenuItemBuilder::with_id("updates", menu_text("updates")).build(handle)?);
            }
            let menu = MenuBuilder::new(handle)
                .item(
                    &ledger_menu
                        .separator()
                        .item(&MenuItemBuilder::with_id("data", menu_text("data")).build(handle)?)
                        .item(&MenuItemBuilder::with_id("logs", menu_text("logs")).build(handle)?)
                        .separator()
                        .item(&MenuItemBuilder::with_id("quit", menu_text("quit")).accelerator("CmdOrCtrl+Q").build(handle)?)
                        .build()?,
                )
                // Copiar y pegar en los campos (macOS los necesita en el menú)
                .item(
                    &SubmenuBuilder::new(handle, "Edit")
                        .item(&PredefinedMenuItem::undo(handle, None)?)
                        .item(&PredefinedMenuItem::redo(handle, None)?)
                        .separator()
                        .item(&PredefinedMenuItem::cut(handle, None)?)
                        .item(&PredefinedMenuItem::copy(handle, None)?)
                        .item(&PredefinedMenuItem::paste(handle, None)?)
                        .item(&PredefinedMenuItem::select_all(handle, None)?)
                        .build()?,
                )
                .build()?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| match event.id().as_ref() {
                "settings" => show_settings(app),
                "reload" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.eval("location.reload()");
                    }
                }
                "updates" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = updates::check(&app, true).await;
                    });
                }
                "data" => {
                    let _ = open_dir(app.clone(), "data".into());
                }
                "logs" => {
                    let _ = open_dir(app.clone(), "logs".into());
                }
                "quit" => app.exit(0),
                _ => {}
            });

            let nav = handle.clone();
            WebviewWindowBuilder::new(handle, "main", WebviewUrl::App("index.html".into()))
                .on_navigation(move |url| on_navigation(&nav, url))
                .title("EVE Ledger")
                .inner_size(1320.0, 900.0)
                .min_inner_size(380.0, 560.0)
                .build()?;

            // La API terminó un login de EVE (en el navegador): la ventana muestra el resultado en Pilotos
            let linked = handle.clone();
            app.listen(services::AUTH_RESULT_EVENT, move |event| {
                let query: String = serde_json::from_str(event.payload()).unwrap_or_default();
                let (Some(cfg), Some(main)) = (load_config(&linked), linked.get_webview_window("main")) else { return };
                if let Ok(url) = Url::parse(&format!("{}/pilotos?{query}", cfg.web_url())) {
                    let _ = main.navigate(url);
                    let _ = main.unminimize();
                    let _ = main.set_focus();
                }
            });

            match load_config(handle) {
                Some(cfg) if config::validate(&cfg).is_empty() => launch(handle, cfg),
                _ => set_status(handle, "setup", None),
            }
            updates::start(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar EVE Ledger");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<Services>().stop();
            // Una actualización descargada que se dejó «al cerrar la app»
            updates::install(app, false);
        }
    });
}
