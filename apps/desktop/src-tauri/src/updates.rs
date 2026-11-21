//! Automatic updates (tauri-plugin-updater) from the GitHub releases (`latest.json`, see tauri.conf.json).
//! Only if the installer was built with the signing public key (`plugins.updater.pubkey`, which the workflow sets
//! from the `EVE_LEDGER_UPDATER_PUBKEY` variable, together with `endpoints`: the releases of the repository that builds it): each version is signed with the private key, which only
//! GitHub Actions has, and the plugin rejects anything not signed with it. A local build does not update itself.
//! At startup and every 6 h it looks for a new version and downloads it in the background; then it asks whether to restart now
//! or install it when the app closes. The data and `ledger.env` are in the user's folders: the update does not touch them.

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

/// A version already downloaded and verified, waiting to be installed
#[derive(Default)]
pub struct Pending(Mutex<Option<(Update, Vec<u8>)>>);

/// Periodic background check (does nothing if this copy does not have the public key)
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

/// Looks, downloads and asks. `manual` (menu «Buscar actualizaciones…») also notifies if there is nothing new or it fails
pub async fn check(app: &AppHandle, manual: bool) -> Result<(), String> {
    let current = app.package_info().version.to_string();
    // One is already downloaded: only ask again if the user requests it
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

/// Installs the downloaded version, if any. `restart`: now, and reopens the app; otherwise, when it closes.
/// The API and the web are stopped first (on Windows the installer kills the process without going through RunEvent::Exit)
pub fn install(app: &AppHandle, restart: bool) {
    let Some((update, bytes)) = app.state::<Pending>().0.lock().unwrap().take() else { return };
    app.state::<Services>().stop();
    log(app, &format!("instalando la versión {}", update.version));
    if let Err(e) = update.restart_after_install(restart).install(&bytes) {
        log(app, &format!("no se pudo instalar: {e}"));
        // «Reiniciar ahora» failed (the admin prompt cancelled, no write access): the app keeps running, so do the
        // services; on exit there's nothing to start again
        if restart {
            crate::relaunch(app);
        }
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

/// UI language from the system locale: one of the six the app is translated into, Spanish otherwise
pub fn ui_lang() -> &'static str {
    let locale = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    ["en", "de", "pt", "zh", "ru"].into_iter().find(|l| locale.starts_with(l)).unwrap_or("es")
}

/// Notice texts according to the system language, like the menu
pub fn text(key: &str) -> &'static str {
    let lang = ui_lang();
    match (lang, key) {
        ("en", "title") => "IskPulse update",
        ("en", "ready") => "IskPulse {v} is ready to install (you have {cur}). Your data and settings are kept.",
        ("en", "restartNow") => "Restart now",
        ("en", "onClose") => "When I quit the app",
        ("en", "upToDate") => "You have the latest version ({v}).",
        ("en", "checkFailed") => "Could not check for updates:",
        ("de", "title") => "IskPulse-Update",
        ("de", "ready") => "IskPulse {v} ist bereit zur Installation (du hast {cur}). Deine Daten und Einstellungen bleiben erhalten.",
        ("de", "restartNow") => "Jetzt neu starten",
        ("de", "onClose") => "Beim Beenden der App",
        ("de", "upToDate") => "Du hast die neueste Version ({v}).",
        ("de", "checkFailed") => "Nach Updates suchen fehlgeschlagen:",
        ("pt", "title") => "Atualização do IskPulse",
        ("pt", "ready") => "O IskPulse {v} está pronto para instalar (você tem a {cur}). Seus dados e suas configurações são mantidos.",
        ("pt", "restartNow") => "Reiniciar agora",
        ("pt", "onClose") => "Ao sair do app",
        ("pt", "upToDate") => "Você tem a versão mais recente ({v}).",
        ("pt", "checkFailed") => "Não foi possível procurar atualizações:",
        ("zh", "title") => "IskPulse 更新",
        ("zh", "ready") => "IskPulse {v} 已可安装（你当前是 {cur}）。你的数据和设置会保留。",
        ("zh", "restartNow") => "立即重启",
        ("zh", "onClose") => "退出应用时",
        ("zh", "upToDate") => "你已是最新版本（{v}）。",
        ("zh", "checkFailed") => "无法检查更新：",
        ("ru", "title") => "Обновление IskPulse",
        ("ru", "ready") => "IskPulse {v} готов к установке (у тебя {cur}). Твои данные и настройки сохранятся.",
        ("ru", "restartNow") => "Перезапустить сейчас",
        ("ru", "onClose") => "При выходе из приложения",
        ("ru", "upToDate") => "У тебя последняя версия ({v}).",
        ("ru", "checkFailed") => "Не удалось проверить обновления:",
        (_, "title") => "Actualización de IskPulse",
        (_, "ready") => "IskPulse {v} está lista para instalarse (tienes la {cur}). Tus datos y tu configuración se conservan.",
        (_, "restartNow") => "Reiniciar ahora",
        (_, "onClose") => "Al salir de la app",
        (_, "upToDate") => "Tienes la última versión ({v}).",
        (_, "checkFailed") => "No se pudo buscar actualizaciones:",
        _ => "",
    }
}
