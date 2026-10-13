//! User configuration: what used to live in apps/api/.env and apps/web/.env, in a single
//! `ledger.env` file (KEY=value) in the app's config folder. The wizard creates it on first
//! launch and the «Configuración…» (Settings…) window edits it afterwards.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// EVE app: the one bundled with the installer (EVE_LEDGER_CLIENT_ID). The wizard no longer asks for it (user's
    /// decision: nobody has to create one at developers.eveonline.com); if ledger.env has another one (set up
    /// in an earlier version), it is kept so the pilots don't have to be relinked
    /// Client ID only: login uses PKCE and the Secret Key is no longer used (user's decision). An
    /// `EVE_CLIENT_SECRET` from earlier versions is ignored and removed from ledger.env on save
    pub client_id: String,
    /// 32 bytes in base64: encrypts the EVE tokens. Changing it forces relinking the pilots
    pub enc_key: String,
    /// Contact for the ESI User-Agent (CCP asks to be able to reach whoever makes the calls)
    pub esi_contact: String,
    pub sync_interval_min: u32,
    pub pilot_slots: u32,
    pub omega_accounts: u32,
    pub omega_plex_per_month: u32,
    pub api_port: u16,
    pub web_port: u16,
    /// Open the app at login, in the tray and without a window: that way it syncs even if never opened (ESI only gives
    /// ~30 days of wallet). The OS (registry, LaunchAgent, XDG autostart) is brought in line with this at startup
    pub start_at_login: bool,
    /// Closing the window leaves it in the system tray, syncing; «Salir» (Quit, tray or menu) closes it completely
    pub close_to_tray: bool,
}

// Unusual ports so as not to clash with other programs (3000 and 4321 are used by many dev servers)
pub const DEFAULT_API_PORT: u16 = 47300;
pub const DEFAULT_WEB_PORT: u16 = 47321;

/// Client ID of an EVE app embedded at build time (variable `EVE_LEDGER_CLIENT_ID`): whoever installs doesn't have to
/// create their own. It has no secret (PKCE login) and its Callback URL uses the default API port
pub fn bundled_client_id() -> Option<&'static str> {
    option_env!("EVE_LEDGER_CLIENT_ID").map(str::trim).filter(|s| !s.is_empty())
}

/// GitHub repository the installer comes from ("owner/name"; set by the workflow from GITHUB_REPOSITORY).
/// Goes into the ESI User-Agent (CCP asks to be able to contact the developer) and the legal notice; a local build
/// doesn't have it
pub fn bundled_repo_url() -> Option<String> {
    repo_url(option_env!("EVE_LEDGER_REPO"))
}

fn repo_url(repo: Option<&str>) -> Option<String> {
    let r = repo?.trim();
    let ok = r.split('/').count() == 2 && r.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c));
    ok.then(|| format!("https://github.com/{r}"))
}

/// ESI User-Agent: the app and its version, the project URL and, if the user gave one, their contact (no control
/// characters: it goes in an HTTP header)
fn user_agent(version: &str, repo: Option<&str>, contact: &str) -> String {
    let contact: String = contact.chars().filter(|c| !c.is_control()).collect::<String>().trim().to_string();
    let parts: Vec<String> = repo.map(|r| format!("+{r}")).into_iter().chain((!contact.is_empty()).then_some(contact)).collect();
    if parts.is_empty() {
        format!("eve-ledger-desktop/{version}")
    } else {
        format!("eve-ledger-desktop/{version} ({})", parts.join("; "))
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            client_id: bundled_client_id().unwrap_or_default().into(),
            enc_key: generate_enc_key(),
            esi_contact: String::new(),
            sync_interval_min: 60,
            pilot_slots: 5,
            omega_accounts: 5,
            omega_plex_per_month: 500,
            api_port: DEFAULT_API_PORT,
            web_port: DEFAULT_WEB_PORT,
            // The wizard suggests it checked; anyone with an older ledger.env is not opted in automatically (from_map)
            start_at_login: true,
            close_to_tray: true,
        }
    }
}

/// New key of 32 random bytes in base64
pub fn generate_enc_key() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("sin fuente de aleatoriedad del sistema");
    STANDARD.encode(bytes)
}

/// The URL to register in the EVE app (must match exactly)
pub fn callback_url(api_port: u16) -> String {
    format!("http://127.0.0.1:{api_port}/auth/callback")
}

/// Validation errors, as keys the UI translates (empty = valid)
pub fn validate(c: &Config) -> Vec<&'static str> {
    let mut errors = Vec::new();
    if c.client_id.trim().is_empty() {
        errors.push("clientId");
    }
    if STANDARD.decode(c.enc_key.trim()).map(|k| k.len()) != Ok(32) {
        errors.push("encKey");
    }
    if c.api_port < 1024 || c.web_port < 1024 || c.api_port == c.web_port {
        errors.push("ports");
    }
    if c.pilot_slots == 0 || c.omega_plex_per_month == 0 {
        errors.push("numbers");
    }
    // The installer's EVE app only knows the Callback URL for the default port
    if bundled_client_id() == Some(c.client_id.trim()) && c.api_port != DEFAULT_API_PORT {
        errors.push("bundledPort");
    }
    errors
}

fn parse(text: &str) -> BTreeMap<String, String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .collect()
}

impl Config {
    fn from_map(m: &BTreeMap<String, String>) -> Config {
        let d = Config::default();
        let s = |k: &str| m.get(k).cloned().unwrap_or_default();
        let n = |k: &str, def: u32| m.get(k).and_then(|v| v.parse().ok()).unwrap_or(def);
        let p = |k: &str, def: u16| m.get(k).and_then(|v| v.parse().ok()).unwrap_or(def);
        let b = |k: &str, def: bool| m.get(k).map_or(def, |v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"));
        Config {
            client_id: m.get("EVE_CLIENT_ID").cloned().filter(|v| !v.is_empty()).unwrap_or(d.client_id),
            enc_key: m.get("ENC_KEY").cloned().filter(|v| !v.is_empty()).unwrap_or(d.enc_key),
            esi_contact: s("ESI_CONTACT"),
            sync_interval_min: n("SYNC_INTERVAL_MIN", d.sync_interval_min),
            pilot_slots: n("PILOT_SLOTS", d.pilot_slots),
            omega_accounts: n("OMEGA_ACCOUNTS", d.omega_accounts),
            omega_plex_per_month: n("OMEGA_PLEX_PER_MONTH", d.omega_plex_per_month),
            api_port: p("API_PORT", d.api_port),
            web_port: p("WEB_PORT", d.web_port),
            // Without the key (ledger.env from an earlier version): not added to system startup without asking
            start_at_login: b("START_AT_LOGIN", false),
            close_to_tray: b("CLOSE_TO_TRAY", d.close_to_tray),
        }
    }

    pub fn to_env(&self) -> String {
        format!(
            "# EVE Ledger: configuración (la escribe la app; se puede editar desde «Configuración…»)\n\
             # App de EVE: la incluida en el instalador (no hace falta tocarla). Callback: {callback}\n\
             # Solo el Client ID: el login usa PKCE (sin Secret Key)\n\
             EVE_CLIENT_ID={}\n\
             # Cifra los tokens de EVE. Si cambia, hay que revincular los pilotos\n\
             ENC_KEY={}\n\
             # Contacto para el User-Agent de ESI\n\
             ESI_CONTACT={}\n\
             SYNC_INTERVAL_MIN={}\nPILOT_SLOTS={}\nOMEGA_ACCOUNTS={}\nOMEGA_PLEX_PER_MONTH={}\n\
             API_PORT={}\nWEB_PORT={}\n\
             # Segundo plano: abrir al iniciar sesión (en la bandeja) y seguir en la bandeja al cerrar la ventana\n\
             START_AT_LOGIN={}\nCLOSE_TO_TRAY={}\n",
            self.client_id.trim(),
            self.enc_key.trim(),
            self.esi_contact.trim(),
            self.sync_interval_min,
            self.pilot_slots,
            self.omega_accounts,
            self.omega_plex_per_month,
            self.api_port,
            self.web_port,
            u8::from(self.start_at_login),
            u8::from(self.close_to_tray),
            callback = callback_url(self.api_port),
        )
    }

    /// API environment variables (apps/api/src/lib/env.ts)
    pub fn api_env(&self, version: &str) -> Vec<(String, String)> {
        let ua = user_agent(version, bundled_repo_url().as_deref(), &self.esi_contact);
        vec![
            ("EVE_CLIENT_ID".into(), self.client_id.trim().into()),
            ("EVE_CALLBACK_URL".into(), callback_url(self.api_port)),
            ("ENC_KEY".into(), self.enc_key.trim().into()),
            ("ESI_USER_AGENT".into(), ua),
            ("PORT".into(), self.api_port.to_string()),
            ("HOST".into(), "127.0.0.1".into()),
            ("WEB_URL".into(), self.web_url()),
            // Login goes to the system browser (lib.rs): on return, a page that closes itself, not the dashboard
            ("AUTH_DONE_PAGE".into(), "1".into()),
            ("SYNC_INTERVAL_MIN".into(), self.sync_interval_min.to_string()),
            ("OMEGA_ACCOUNTS".into(), self.omega_accounts.to_string()),
            ("OMEGA_PLEX_PER_MONTH".into(), self.omega_plex_per_month.to_string()),
        ]
    }

    /// Web environment variables (Astro: API_URL and PILOT_SLOTS are read at startup)
    pub fn web_env(&self, version: &str) -> Vec<(String, String)> {
        vec![
            // Dashboard footer: «v0.1.8»
            ("APP_VERSION".into(), version.into()),
            ("APP_REPO".into(), bundled_repo_url().unwrap_or_default()),
            ("PORT".into(), self.web_port.to_string()),
            ("HOST".into(), "127.0.0.1".into()),
            ("API_URL".into(), format!("http://127.0.0.1:{}", self.api_port)),
            ("PILOT_SLOTS".into(), self.pilot_slots.to_string()),
        ]
    }

    pub fn web_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.web_port)
    }
}

/// None if there is no file yet (first launch). If the file has no ENC_KEY (edited by hand), one is generated and
/// saved right away: previously each launch used a new key without saving it, and linked pilots were lost
/// over and over. With a new key, pilots linked under the previous one must be relinked
pub fn load(path: &Path) -> Option<Config> {
    let map = parse(&fs::read_to_string(path).ok()?);
    let c = Config::from_map(&map);
    if map.get("ENC_KEY").map_or(true, |v| v.trim().is_empty()) {
        if let Err(e) = save(path, &c) {
            eprintln!("[config] no se pudo guardar la ENC_KEY nueva en {}: {e}", path.display());
        }
    }
    Some(c)
}

/// Saves the file. On Linux and macOS only the user can read it from the moment it is created (it holds ENC_KEY). It is
/// written to a temp file that is renamed over it: a power cut doesn't leave the file half-written
/// (with a truncated ENC_KEY, the pilots' tokens could no longer be decrypted)
pub fn save(path: &Path, c: &Config) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("env.tmp");
    {
        let mut opts = OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut file = opts.open(&tmp)?;
        #[cfg(unix)]
        {
            // In case the temp file already existed with other permissions (mode only applies on creation)
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))?;
        }
        file.write_all(c.to_env().as_bytes())?;
        file.sync_all()?;
    }
    // On Windows, rename replaces the existing file (MoveFileExW with MOVEFILE_REPLACE_EXISTING)
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> Config {
        Config {
            client_id: "abc".into(),
            ..Config::default()
        }
    }

    #[test]
    fn la_clave_generada_son_32_bytes() {
        assert_eq!(STANDARD.decode(generate_enc_key()).unwrap().len(), 32);
        assert_ne!(generate_enc_key(), generate_enc_key());
    }

    #[test]
    fn ida_y_vuelta_por_el_archivo() {
        let mut c = valid();
        c.esi_contact = "Piloto Uno".into();
        c.sync_interval_min = 0;
        c.api_port = 48000;
        assert_eq!(Config::from_map(&parse(&c.to_env())), c);
    }

    #[test]
    fn valida_lo_obligatorio() {
        assert!(validate(&valid()).is_empty());
        let c = Config { client_id: String::new(), ..Config::default() };
        assert_eq!(validate(&c), vec!["clientId"]);
        let mut c = valid();
        c.enc_key = "corta".into();
        c.web_port = c.api_port;
        assert_eq!(validate(&c), vec!["encKey", "ports"]);
    }

    #[test]
    fn la_app_del_instalador_exige_el_puerto_por_defecto() {
        // Only checked when built with EVE_LEDGER_CLIENT_ID
        if let Some(id) = bundled_client_id() {
            assert_eq!(Config::default().client_id, id);
            assert!(validate(&Config::default()).is_empty());
            assert_eq!(validate(&Config { api_port: 48000, ..Config::default() }), vec!["bundledPort"]);
            assert!(validate(&Config { api_port: 48000, client_id: "mia".into(), ..Config::default() }).is_empty());
        }
    }

    #[test]
    fn el_entorno_de_la_api_lleva_el_callback_y_solo_localhost() {
        let env: BTreeMap<_, _> = valid().api_env("0.1.0").into_iter().collect();
        assert_eq!(env["EVE_CALLBACK_URL"], format!("http://127.0.0.1:{DEFAULT_API_PORT}/auth/callback"));
        assert_eq!(env["HOST"], "127.0.0.1");
        assert_eq!(env["AUTH_DONE_PAGE"], "1");
        assert!(env["ESI_USER_AGENT"].starts_with("eve-ledger-desktop/0.1.0"));
        assert_eq!(env["WEB_URL"], format!("http://127.0.0.1:{DEFAULT_WEB_PORT}"));
        let web: BTreeMap<_, _> = valid().web_env("0.1.0").into_iter().collect();
        assert_eq!(web["APP_VERSION"], "0.1.0");
    }

    #[test]
    fn el_user_agent_lleva_el_repositorio_y_el_contacto() {
        let repo = repo_url(Some("dueno/eve-ledger"));
        assert_eq!(repo.as_deref(), Some("https://github.com/dueno/eve-ledger"));
        assert_eq!(repo_url(Some("dueno/eve ledger\r\nX: y")), None);
        assert_eq!(repo_url(Some("solo-un-nombre")), None);
        assert_eq!(repo_url(None), None);
        assert_eq!(
            user_agent("0.1.16", repo.as_deref(), " Piloto Uno\r\n"),
            "eve-ledger-desktop/0.1.16 (+https://github.com/dueno/eve-ledger; Piloto Uno)"
        );
        assert_eq!(user_agent("0.1.16", repo.as_deref(), ""), "eve-ledger-desktop/0.1.16 (+https://github.com/dueno/eve-ledger)");
        assert_eq!(user_agent("0.1.16", None, "yo@example.com"), "eve-ledger-desktop/0.1.16 (yo@example.com)");
        assert_eq!(user_agent("0.1.16", None, "  "), "eve-ledger-desktop/0.1.16");
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("eve-ledger-config-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn sin_enc_key_genera_una_y_la_guarda() {
        let path = temp_dir("sin-clave").join("ledger.env");
        fs::write(&path, "EVE_CLIENT_ID=abc\nAPI_PORT=47300\n").unwrap();
        let first = load(&path).unwrap();
        assert_eq!(STANDARD.decode(&first.enc_key).unwrap().len(), 32);
        // The next launch reads the same key (previously a new one came out each time)
        assert_eq!(load(&path).unwrap().enc_key, first.enc_key);
        assert!(fs::read_to_string(&path).unwrap().contains(&format!("ENC_KEY={}", first.enc_key)));
        // Everything else is kept
        assert_eq!(load(&path).unwrap().client_id, "abc");
    }

    #[test]
    fn guardar_no_deja_temporales_y_solo_lo_lee_el_usuario() {
        let dir = temp_dir("guardar");
        let path = dir.join("ledger.env");
        save(&path, &valid()).unwrap();
        save(&path, &Config { pilot_slots: 6, ..valid() }).unwrap();
        assert_eq!(load(&path).unwrap().pilot_slots, 6);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }
    }

    #[test]
    fn la_secret_key_de_versiones_anteriores_se_ignora_y_se_borra_al_guardar() {
        let path = temp_dir("secreto").join("ledger.env");
        fs::write(&path, format!("EVE_CLIENT_ID=abc\nEVE_CLIENT_SECRET=s3cr3t\nENC_KEY={}\n", generate_enc_key())).unwrap();
        let c = load(&path).unwrap();
        assert!(!c.api_env("0.1.0").iter().any(|(k, _)| k == "EVE_CLIENT_SECRET"));
        save(&path, &c).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(!text.contains("EVE_CLIENT_SECRET") && !text.contains("s3cr3t"));
        assert_eq!(load(&path).unwrap().client_id, "abc");
    }

    #[test]
    fn segundo_plano_ida_y_vuelta_y_sin_apuntarse_solo() {
        let c = Config { start_at_login: false, close_to_tray: false, ..valid() };
        assert_eq!(Config::from_map(&parse(&c.to_env())), c);
        assert!(Config::from_map(&parse(&valid().to_env())).start_at_login);
        // An older ledger.env (without the keys): closing keeps it in the tray, but it doesn't start with the system
        let old = Config::from_map(&parse("EVE_CLIENT_ID=abc\n"));
        assert!(!old.start_at_login);
        assert!(old.close_to_tray);
    }

    #[test]
    fn ignora_comentarios_y_rellena_lo_que_falta() {
        let c = Config::from_map(&parse("# hola\nEVE_CLIENT_ID = x \nPILOT_SLOTS=6\nAPI_PORT=nope\n"));
        assert_eq!(c.client_id, "x");
        assert_eq!(c.pilot_slots, 6);
        assert_eq!(c.api_port, DEFAULT_API_PORT);
    }
}
