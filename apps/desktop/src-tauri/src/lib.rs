//! EVE Ledger desktop: a Tauri wrapper for the personal ledger.
//! - First launch: the main window shows the wizard (ui/index.html) to create `ledger.env`.
//! - After that: it starts the API and the web (services.rs) and the main window navigates to the dashboard
//!   (http://127.0.0.1:<web port>), which has no access to any Tauri command.
//! - «Configuración…» (menu, Ctrl/Cmd+,) opens the same page in another window; saving restarts the services.
//! - Background: an icon in the system tray; closing the window leaves it there, syncing, and with
//!   «Iniciar con el sistema» the app starts at login without a window (`--hidden`). ESI only gives ~30 days of
//!   wallet: if the app isn't opened for a month, those days are lost.

mod config;
mod services;
mod updates;

use config::Config;
use serde::Serialize;
use services::Services;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

/// Argument the system opens the app with at login: it starts in the tray, without a window
const HIDDEN_ARG: &str = "--hidden";
const TRAY_ID: &str = "main";

/// The tray's «Iniciar con el sistema» checkbox, to tick it when it changes from «Configuración…»
struct Tray {
    autostart: CheckMenuItem<Wry>,
}

/// Service state for the UI: starting | ready | error (with the reason) | setup
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

/// Starts (or restarts) the services in the background and, once they respond, takes the main window to the dashboard
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
        config: cfg,
        config_path: config_path(&app)?.to_string_lossy().into(),
        data_dir: p.data.to_string_lossy().into(),
        log_dir: p.logs.to_string_lossy().into(),
        version: app.package_info().version.to_string(),
        status: app.state::<AppState>().status.lock().unwrap().clone(),
    })
}

/// Saves the configuration and (re)starts the services. Returns the validation errors, if any
#[tauri::command]
fn save_config(app: AppHandle, config: Config) -> Result<Vec<&'static str>, String> {
    let errors = config::validate(&config);
    if !errors.is_empty() {
        return Ok(errors);
    }
    config::save(&config_path(&app)?, &config).map_err(|e| e.to_string())?;
    apply_autostart(&app, config.start_at_login);
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

/// The configuration window: if the main one is still on the wizard, it's that one; otherwise a separate one
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

/// Shows the main window (from the tray, another launch or the Dock). If it was hidden in the tray, the
/// dashboard is the one from when it was hidden, maybe hours ago: it's reloaded to show what was synced since then
fn show_main(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    let was_hidden = !w.is_visible().unwrap_or(true);
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
    if was_hidden && w.url().is_ok_and(|u| u.scheme() == "http") {
        let _ = w.eval("location.reload()");
    }
}

/// Start with the system according to ledger.env: the system (Windows registry, macOS LaunchAgent, XDG
/// autostart on Linux) is brought in line with the configuration, and so is the tray checkbox
fn apply_autostart(app: &AppHandle, enabled: bool) {
    let launcher = app.autolaunch();
    if launcher.is_enabled().unwrap_or(!enabled) != enabled {
        let result = if enabled { launcher.enable() } else { launcher.disable() };
        if let Err(e) = result {
            eprintln!("[autostart] {e}");
        }
    }
    if let Some(tray) = app.try_state::<Tray>() {
        let _ = tray.autostart.set_checked(enabled);
    }
}

/// The tray checkbox changed: it's saved to ledger.env (without restarting the services: it doesn't affect them)
fn toggle_autostart(app: &AppHandle) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let checked = tray.autostart.is_checked().unwrap_or(false);
    let (Some(mut cfg), Ok(path)) = (load_config(app), config_path(app)) else {
        // Still in the wizard: it's decided there
        let _ = tray.autostart.set_checked(!checked);
        return;
    };
    cfg.start_at_login = checked;
    if let Err(e) = config::save(&path, &cfg) {
        eprintln!("[autostart] no se pudo guardar ledger.env: {e}");
    }
    apply_autostart(app, checked);
}

fn set_tray_tooltip(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

/// POST to the local API and the status line of the response (the API only answers once done: a sync of all
/// pilots can take minutes). No HTTP dependencies: it's a single request to 127.0.0.1
fn post_local(port: u16, path: &str) -> std::io::Result<String> {
    use std::io::{Read, Write};
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port))?;
    stream.set_read_timeout(Some(Duration::from_secs(30 * 60)))?;
    write!(stream, "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")?;
    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    while stream.read(&mut byte)? == 1 && byte[0] != b'\n' {
        line.push(byte[0]);
    }
    Ok(String::from_utf8_lossy(&line).trim().to_string())
}

/// The tray's «Sincronizar ahora»: all pilots, like the dashboard button
fn sync_now(app: &AppHandle) {
    let Some(cfg) = load_config(app) else { return };
    let app = app.clone();
    std::thread::spawn(move || {
        set_tray_tooltip(&app, menu_text("traySyncing"));
        let ok = post_local(cfg.api_port, "/sync/all").is_ok_and(|status| status.split(' ').nth(1).is_some_and(|c| c.starts_with('2')));
        set_tray_tooltip(&app, if ok { menu_text("trayTooltip") } else { menu_text("traySyncFailed") });
        // With the dashboard in view, have it show what's new
        if let Some(w) = app.get_webview_window("main") {
            if w.is_visible().unwrap_or(false) && w.url().is_ok_and(|u| u.scheme() == "http") {
                let _ = w.eval("location.reload()");
            }
        }
    });
}

/// The first time the window closes to the tray, a notice: otherwise it looks like the app quit
fn tray_hint_once(app: &AppHandle) {
    let Ok(dir) = app.path().app_config_dir() else { return };
    let marker = services::plain(dir.join("tray-hint-shown"));
    if marker.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(services::plain(dir));
    let _ = std::fs::write(&marker, "1");
    app.dialog()
        .message(menu_text("trayHint"))
        .title(menu_text("trayHintTitle"))
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

/// The tray icon: open, sync, start with the system and quit. Clicking the icon opens the window
/// (on Linux, the icon only opens the menu)
fn build_tray(app: &AppHandle, start_at_login: bool) -> tauri::Result<()> {
    let autostart = CheckMenuItemBuilder::with_id("tray-autostart", menu_text("trayAutostart"))
        .checked(start_at_login)
        .build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("tray-open", menu_text("trayOpen")).build(app)?)
        .item(&MenuItemBuilder::with_id("tray-sync", menu_text("traySync")).build(app)?)
        .separator()
        .item(&autostart)
        .separator()
        .item(&MenuItemBuilder::with_id("tray-quit", menu_text("quit")).build(app)?)
        .build()?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(menu_text("trayTooltip"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => show_main(app),
            "tray-sync" => sync_now(app),
            "tray-autostart" => toggle_autostart(app),
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    app.manage(Tray { autostart });
    Ok(())
}

/// What opens inside the window: the wizard, the dashboard and the API (all on 127.0.0.1).
/// The EVE login (`/auth/login`, «Vincular piloto» and «Revincular») and any outside site go to the system
/// browser: that's where the user has their EVE session and password manager (RFC 8252), and the app
/// window doesn't navigate to pages that aren't its own. The callback returns to the local API, which notifies the app (AUTH_RESULT_EVENT)
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
        // Outside the navigation handler, which must not touch the same view
        let app = app.clone();
        std::thread::spawn(move || {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.eval(&login_notice_script());
            }
        });
    }
    false
}

/// Notice on the dashboard while the EVE login is in the browser (the dashboard has no Tauri commands:
/// the notice is injected from here and disappears on navigation)
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

/// Menu texts by system language (the web UI has its own ES/EN/DE selector)
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
        ("en", "trayTooltip") => "EVE Ledger",
        ("en", "trayOpen") => "Open EVE Ledger",
        ("en", "traySync") => "Sync now",
        ("en", "traySyncing") => "EVE Ledger · syncing…",
        ("en", "traySyncFailed") => "EVE Ledger · the last sync failed (see Pilots)",
        ("en", "trayAutostart") => "Start with the system",
        ("en", "trayHintTitle") => "EVE Ledger keeps running",
        ("en", "trayHint") => "EVE Ledger is still in the system tray and keeps syncing your pilots. To quit completely, use Quit in its tray icon. You can change this in Settings…",
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
        ("de", "trayTooltip") => "EVE Ledger",
        ("de", "trayOpen") => "EVE Ledger öffnen",
        ("de", "traySync") => "Jetzt synchronisieren",
        ("de", "traySyncing") => "EVE Ledger · synchronisiert…",
        ("de", "traySyncFailed") => "EVE Ledger · die letzte Synchronisierung schlug fehl (siehe Piloten)",
        ("de", "trayAutostart") => "Mit dem System starten",
        ("de", "trayHintTitle") => "EVE Ledger läuft weiter",
        ("de", "trayHint") => "EVE Ledger bleibt im Infobereich und synchronisiert deine Piloten weiter. Zum vollständigen Beenden: Beenden im Symbol im Infobereich. Ändern kannst du das unter Einstellungen…",
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
        (_, "trayTooltip") => "EVE Ledger",
        (_, "trayOpen") => "Abrir EVE Ledger",
        (_, "traySync") => "Sincronizar ahora",
        (_, "traySyncing") => "EVE Ledger · sincronizando…",
        (_, "traySyncFailed") => "EVE Ledger · el último sync falló (mira Pilotos)",
        (_, "trayAutostart") => "Iniciar con el sistema",
        (_, "trayHintTitle") => "EVE Ledger sigue abierto",
        (_, "trayHint") => "EVE Ledger sigue en la bandeja del sistema y continúa sincronizando tus pilotos. Para salir del todo, usa «Salir» en su icono. Puedes cambiarlo en Configuración…",
        _ => "",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // Single instance: the ports are fixed and there's one database
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        // At login, in the tray and without a window (`--hidden`)
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![HIDDEN_ARG])))
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
                // Copy and paste in the fields (macOS needs them in the menu)
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

            // Opened by the system at login: no window (unless it still needs configuring: the wizard is shown)
            let saved = load_config(handle).filter(|c| config::validate(c).is_empty());
            let hidden = saved.is_some() && std::env::args().any(|a| a == HIDDEN_ARG);
            let nav = handle.clone();
            WebviewWindowBuilder::new(handle, "main", WebviewUrl::App("index.html".into()))
                .on_navigation(move |url| on_navigation(&nav, url))
                .title("EVE Ledger")
                .inner_size(1320.0, 900.0)
                .min_inner_size(380.0, 560.0)
                .visible(!hidden)
                .build()?;
            build_tray(handle, saved.as_ref().is_some_and(|c| c.start_at_login))?;

            // The API finished an EVE login (in the browser): the window shows the result in Pilotos
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

            match saved {
                Some(cfg) => {
                    apply_autostart(handle, cfg.start_at_login);
                    launch(handle, cfg);
                }
                None => set_status(handle, "setup", None),
            }
            updates::start(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("no se pudo iniciar EVE Ledger");

    app.run(|app, event| match event {
        // Closing the main window leaves it in the tray, syncing (if it's configured and that's what's wanted;
        // in the wizard, closing quits). «Salir» from the tray or the menu quits the app entirely
        RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } if label == "main" => {
            if load_config(app).is_some_and(|c| c.close_to_tray && config::validate(&c).is_empty()) {
                api.prevent_close();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
                tray_hint_once(app);
            }
        }
        // macOS: click on the Dock with the window hidden
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { has_visible_windows: false, .. } => show_main(app),
        RunEvent::Exit => {
            app.state::<Services>().stop();
            // A downloaded update that was left for «al salir de la app» (on quitting the app)
            updates::install(app, false);
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn sincronizar_ahora_hace_un_post_local_y_no_espera_a_que_cierren_la_conexion() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut conn, _) = listener.accept().unwrap();
            let mut request = Vec::new();
            let mut buf = [0u8; 256];
            while !request.windows(4).any(|w| w == b"\r\n\r\n") {
                let n = conn.read(&mut buf).unwrap();
                request.extend_from_slice(&buf[..n]);
            }
            conn.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}").unwrap();
            // The connection stays open (keep-alive): post_local must not wait for it to close
            std::thread::sleep(Duration::from_secs(2));
            String::from_utf8(request).unwrap()
        });
        let started = std::time::Instant::now();
        assert_eq!(post_local(port, "/sync/all").unwrap(), "HTTP/1.1 200 OK");
        assert!(started.elapsed() < Duration::from_secs(1));
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /sync/all HTTP/1.1\r\n"));
        // The API only accepts a local Host (src/lib/local-only.ts)
        assert!(request.contains(&format!("Host: 127.0.0.1:{port}\r\n")));
    }
}
