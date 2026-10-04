//! Actualizaciones automáticas (tauri-plugin-updater) desde las releases de GitHub (`latest.json`, ver tauri.conf.json).
//! Solo si el instalador se compiló con la clave pública de firma (`plugins.updater.pubkey`, que pone el workflow
//! desde la variable `EVE_LEDGER_UPDATER_PUBKEY`): cada versión va firmada con la clave privada, que solo tiene
//! GitHub Actions, y el plugin rechaza lo que no esté firmado con ella. Una compilación local no se actualiza sola.
//! Al arrancar y cada 6 h busca una versión nueva y la descarga en segundo plano; luego pregunta si reiniciar ahora
//! o instalarla al cerrar la app. Los datos y `ledger.env` están en las carpetas del usuario: la actualización no los toca.

use crate::services::{self, Services};
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const EVERY: Duration = Duration::from_secs(6 * 3600);

pub fn enabled(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

/// Una versión ya descargada y verificada, a la espera de instalarse
#[derive(Default)]
pub struct Pending(Mutex<Option<(Update, Vec<u8>)>>);

/// Comprobación periódica en segundo plano (no hace nada si esta copia no tiene la clave pública)
pub fn start(app: &AppHandle) {
    if !enabled(app) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        if let Err(e) = tauri::async_runtime::block_on(check(&app, false)) {
            log(&app, &format!("error al buscar actualizaciones: {e}"));
        }
        std::thread::sleep(EVERY);
    });
}

/// Busca, descarga y pregunta. `manual` (menú «Buscar actualizaciones…») también avisa si no hay nada nuevo o falla
pub async fn check(app: &AppHandle, manual: bool) -> Result<(), String> {
    let current = app.package_info().version.to_string();
    // Ya hay una descargada: solo se vuelve a preguntar si lo pide el usuario
    let waiting = app.state::<Pending>().0.lock().unwrap().as_ref().map(|(u, _)| u.version.clone());
    if let Some(version) = waiting {
        if manual {
            ask(app, &version, &current);
        }
        return Ok(());
    }
    let result = async {
        let updater = app.updater().map_err(|e| e.to_string())?;
        let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
            return Ok(None);
        };
        let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
        Ok::<_, String>(Some((update, bytes)))
    }
    .await;
    match result {
        Ok(Some((update, bytes))) => {
            let version = update.version.clone();
            log(app, &format!("descargada la versión {version} (tienes {current})"));
            *app.state::<Pending>().0.lock().unwrap() = Some((update, bytes));
            ask(app, &version, &current);
            Ok(())
        }
        Ok(None) => {
            if manual {
                message(app, &text("upToDate").replace("{v}", &current));
            }
            Ok(())
        }
        Err(e) => {
            if manual {
                message(app, &format!("{} {e}", text("checkFailed")));
            }
            Err(e)
        }
    }
}

fn ask(app: &AppHandle, version: &str, current: &str) {
    let handle = app.clone();
    app.dialog()
        .message(text("ready").replace("{v}", version).replace("{cur}", current))
        .title(text("title"))
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(text("restartNow").into(), text("onClose").into()))
        .show(move |restart| {
            if restart {
                install(&handle, true);
            }
        });
}

fn message(app: &AppHandle, body: &str) {
    app.dialog().message(body).title(text("title")).kind(MessageDialogKind::Info).show(|_| {});
}

/// Instala la versión descargada, si la hay. `restart`: ahora y vuelve a abrir la app; si no, al cerrarla.
/// Antes se paran la API y la web (en Windows el instalador cierra el proceso sin pasar por RunEvent::Exit)
pub fn install(app: &AppHandle, restart: bool) {
    let Some((update, bytes)) = app.state::<Pending>().0.lock().unwrap().take() else { return };
    app.state::<Services>().stop();
    log(app, &format!("instalando la versión {}", update.version));
    if let Err(e) = update.restart_after_install(restart).install(&bytes) {
        log(app, &format!("no se pudo instalar: {e}"));
        return;
    }
    if restart {
        app.restart();
    }
}

fn log(app: &AppHandle, line: &str) {
    let Ok(p) = services::paths(app) else { return };
    let _ = std::fs::create_dir_all(&p.logs);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(p.logs.join("updates.log")) {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
        let _ = writeln!(f, "{now} {line}");
    }
}

/// Textos de los avisos según el idioma del sistema, como el menú
pub fn text(key: &str) -> &'static str {
    let lang = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    let lang = if lang.starts_with("de") { "de" } else if lang.starts_with("en") { "en" } else { "es" };
    match (lang, key) {
        ("en", "title") => "EVE Ledger update",
        ("en", "ready") => "EVE Ledger {v} is ready to install (you have {cur}). Your data and settings are kept.",
        ("en", "restartNow") => "Restart now",
        ("en", "onClose") => "When I close the app",
        ("en", "upToDate") => "You have the latest version ({v}).",
        ("en", "checkFailed") => "Could not check for updates:",
        ("de", "title") => "EVE Ledger-Update",
        ("de", "ready") => "EVE Ledger {v} ist bereit zur Installation (du hast {cur}). Deine Daten und Einstellungen bleiben erhalten.",
        ("de", "restartNow") => "Jetzt neu starten",
        ("de", "onClose") => "Beim Schließen der App",
        ("de", "upToDate") => "Du hast die neueste Version ({v}).",
        ("de", "checkFailed") => "Nach Updates suchen fehlgeschlagen:",
        (_, "title") => "Actualización de EVE Ledger",
        (_, "ready") => "EVE Ledger {v} está lista para instalarse (tienes la {cur}). Tus datos y tu configuración se conservan.",
        (_, "restartNow") => "Reiniciar ahora",
        (_, "onClose") => "Al cerrar la app",
        (_, "upToDate") => "Tienes la última versión ({v}).",
        (_, "checkFailed") => "No se pudo buscar actualizaciones:",
        _ => "",
    }
}
