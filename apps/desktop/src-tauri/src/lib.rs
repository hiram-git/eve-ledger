//! EVE Ledger de escritorio: un envoltorio de Tauri para el ledger personal.
//! - Primer arranque: la ventana principal muestra el asistente (ui/index.html) para crear `ledger.env`.
//! - Después: arranca la API y la web (services.rs) y la ventana principal navega al dashboard
//!   (http://127.0.0.1:<puerto web>), que no tiene acceso a ningún comando de Tauri.
//! - «Configuración…» (menú, Ctrl/Cmd+,) abre la misma página en otra ventana; al guardar, reinicia los servicios.

mod config;
mod services;

use config::Config;
use serde::Serialize;
use services::Services;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
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
    config_path: String,
    data_dir: String,
    log_dir: String,
    version: String,
    status: Status,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("ledger.env"))
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

/// Textos del menú según el idioma del sistema (la interfaz de la web tiene su propio selector ES/EN/DE)
fn menu_text(key: &str) -> &'static str {
    let lang = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    let lang = if lang.starts_with("de") { "de" } else if lang.starts_with("en") { "en" } else { "es" };
    match (lang, key) {
        ("en", "menu") => "EVE Ledger",
        ("en", "settings") => "Settings…",
        ("en", "settingsTitle") => "EVE Ledger · Settings",
        ("en", "reload") => "Reload",
        ("en", "data") => "Open data folder",
        ("en", "logs") => "Open logs",
        ("en", "quit") => "Quit",
        ("de", "menu") => "EVE Ledger",
        ("de", "settings") => "Einstellungen…",
        ("de", "settingsTitle") => "EVE Ledger · Einstellungen",
        ("de", "reload") => "Neu laden",
        ("de", "data") => "Datenordner öffnen",
        ("de", "logs") => "Protokolle öffnen",
        ("de", "quit") => "Beenden",
        (_, "menu") => "EVE Ledger",
        (_, "settings") => "Configuración…",
        (_, "settingsTitle") => "EVE Ledger · Configuración",
        (_, "reload") => "Recargar",
        (_, "data") => "Abrir la carpeta de datos",
        (_, "logs") => "Abrir los registros",
        (_, "quit") => "Salir",
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
        .manage(Services::default())
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
            let menu = MenuBuilder::new(handle)
                .item(
                    &SubmenuBuilder::new(handle, menu_text("menu"))
                        .item(&MenuItemBuilder::with_id("settings", menu_text("settings")).accelerator("CmdOrCtrl+,").build(handle)?)
                        .item(&MenuItemBuilder::with_id("reload", menu_text("reload")).accelerator("CmdOrCtrl+R").build(handle)?)
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
                "data" => {
                    let _ = open_dir(app.clone(), "data".into());
                }
                "logs" => {
                    let _ = open_dir(app.clone(), "logs".into());
                }
                "quit" => app.exit(0),
                _ => {}
            });

            WebviewWindowBuilder::new(handle, "main", WebviewUrl::App("index.html".into()))
                .title("EVE Ledger")
                .inner_size(1320.0, 900.0)
                .min_inner_size(380.0, 560.0)
                .build()?;

            match load_config(handle) {
                Some(cfg) if config::validate(&cfg).is_empty() => launch(handle, cfg),
                _ => set_status(handle, "setup", None),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar EVE Ledger");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<Services>().stop();
        }
    });
}
