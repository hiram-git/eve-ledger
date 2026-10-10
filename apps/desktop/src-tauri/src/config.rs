//! Configuración del usuario: lo que antes iba en apps/api/.env y apps/web/.env, en un solo archivo
//! `ledger.env` (CLAVE=valor) en la carpeta de configuración de la app. El asistente lo crea en el primer
//! arranque y la ventana «Configuración…» lo edita después.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// App de EVE: la que trae el instalador (EVE_LEDGER_CLIENT_ID). El asistente ya no la pide (decisión del
    /// usuario: nadie tiene que crear una en developers.eveonline.com); si ledger.env trae otra (quien la configuró
    /// en una versión anterior), se conserva para no obligar a revincular los pilotos
    pub client_id: String,
    /// Solo la de una app propia de versiones anteriores; la app incluida va sin secreto (PKCE, apps/api/src/lib/sso.ts)
    pub client_secret: String,
    /// 32 bytes en base64: cifra los tokens de EVE. Cambiarla obliga a revincular los pilotos
    pub enc_key: String,
    /// Contacto para el User-Agent de ESI (CCP pide poder avisar a quien hace las llamadas)
    pub esi_contact: String,
    pub sync_interval_min: u32,
    pub pilot_slots: u32,
    pub omega_accounts: u32,
    pub omega_plex_per_month: u32,
    pub api_port: u16,
    pub web_port: u16,
}

// Puertos poco habituales para no chocar con otros programas (3000 y 4321 los usan muchos servidores de desarrollo)
pub const DEFAULT_API_PORT: u16 = 47300;
pub const DEFAULT_WEB_PORT: u16 = 47321;

/// Client ID de una app de EVE incluido al compilar (variable `EVE_LEDGER_CLIENT_ID`): quien instala no tiene que
/// crear la suya. Va sin secreto (login con PKCE) y su Callback URL es la del puerto de la API por defecto
pub fn bundled_client_id() -> Option<&'static str> {
    option_env!("EVE_LEDGER_CLIENT_ID").map(str::trim).filter(|s| !s.is_empty())
}

impl Default for Config {
    fn default() -> Self {
        Config {
            client_id: bundled_client_id().unwrap_or_default().into(),
            client_secret: String::new(),
            enc_key: generate_enc_key(),
            esi_contact: String::new(),
            sync_interval_min: 60,
            pilot_slots: 5,
            omega_accounts: 5,
            omega_plex_per_month: 500,
            api_port: DEFAULT_API_PORT,
            web_port: DEFAULT_WEB_PORT,
        }
    }
}

/// Clave nueva de 32 bytes aleatorios en base64
pub fn generate_enc_key() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("sin fuente de aleatoriedad del sistema");
    STANDARD.encode(bytes)
}

/// La URL que hay que registrar en la app de EVE (tiene que coincidir exactamente)
pub fn callback_url(api_port: u16) -> String {
    format!("http://127.0.0.1:{api_port}/auth/callback")
}

/// Errores de validación, en claves que la interfaz traduce (vacío = válida)
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
    // La app de EVE del instalador solo conoce la Callback URL del puerto por defecto
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
        Config {
            client_id: m.get("EVE_CLIENT_ID").cloned().filter(|v| !v.is_empty()).unwrap_or(d.client_id),
            client_secret: s("EVE_CLIENT_SECRET"),
            enc_key: m.get("ENC_KEY").cloned().filter(|v| !v.is_empty()).unwrap_or(d.enc_key),
            esi_contact: s("ESI_CONTACT"),
            sync_interval_min: n("SYNC_INTERVAL_MIN", d.sync_interval_min),
            pilot_slots: n("PILOT_SLOTS", d.pilot_slots),
            omega_accounts: n("OMEGA_ACCOUNTS", d.omega_accounts),
            omega_plex_per_month: n("OMEGA_PLEX_PER_MONTH", d.omega_plex_per_month),
            api_port: p("API_PORT", d.api_port),
            web_port: p("WEB_PORT", d.web_port),
        }
    }

    pub fn to_env(&self) -> String {
        format!(
            "# EVE Ledger: configuración (la escribe la app; se puede editar desde «Configuración…»)\n\
             # App de EVE: la incluida en el instalador (no hace falta tocarla). Callback: {callback}\n\
             # Sin Secret Key, el login usa PKCE\n\
             EVE_CLIENT_ID={}\nEVE_CLIENT_SECRET={}\n\
             # Cifra los tokens de EVE. Si cambia, hay que revincular los pilotos\n\
             ENC_KEY={}\n\
             # Contacto para el User-Agent de ESI\n\
             ESI_CONTACT={}\n\
             SYNC_INTERVAL_MIN={}\nPILOT_SLOTS={}\nOMEGA_ACCOUNTS={}\nOMEGA_PLEX_PER_MONTH={}\n\
             API_PORT={}\nWEB_PORT={}\n",
            self.client_id.trim(),
            self.client_secret.trim(),
            self.enc_key.trim(),
            self.esi_contact.trim(),
            self.sync_interval_min,
            self.pilot_slots,
            self.omega_accounts,
            self.omega_plex_per_month,
            self.api_port,
            self.web_port,
            callback = callback_url(self.api_port),
        )
    }

    /// Variables de entorno de la API (apps/api/src/lib/env.ts)
    pub fn api_env(&self, version: &str) -> Vec<(String, String)> {
        let ua = if self.esi_contact.trim().is_empty() {
            format!("eve-ledger-desktop/{version}")
        } else {
            format!("eve-ledger-desktop/{version} ({})", self.esi_contact.trim())
        };
        vec![
            ("EVE_CLIENT_ID".into(), self.client_id.trim().into()),
            ("EVE_CLIENT_SECRET".into(), self.client_secret.trim().into()),
            ("EVE_CALLBACK_URL".into(), callback_url(self.api_port)),
            ("ENC_KEY".into(), self.enc_key.trim().into()),
            ("ESI_USER_AGENT".into(), ua),
            ("PORT".into(), self.api_port.to_string()),
            ("HOST".into(), "127.0.0.1".into()),
            ("WEB_URL".into(), self.web_url()),
            // El login va al navegador del sistema (lib.rs): al volver, una página que se cierra, no el dashboard
            ("AUTH_DONE_PAGE".into(), "1".into()),
            ("SYNC_INTERVAL_MIN".into(), self.sync_interval_min.to_string()),
            ("OMEGA_ACCOUNTS".into(), self.omega_accounts.to_string()),
            ("OMEGA_PLEX_PER_MONTH".into(), self.omega_plex_per_month.to_string()),
        ]
    }

    /// Variables de entorno de la web (Astro: API_URL y PILOT_SLOTS se leen al arrancar)
    pub fn web_env(&self, version: &str) -> Vec<(String, String)> {
        vec![
            // Pie del dashboard: «v0.1.8»
            ("APP_VERSION".into(), version.into()),
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

/// None si aún no hay archivo (primer arranque). Si el archivo no trae ENC_KEY (editado a mano), se genera una y se
/// guarda en el acto: antes cada arranque usaba una clave nueva sin guardarla, y los pilotos vinculados se perdían
/// una y otra vez. Con una clave nueva, los que estaban vinculados con la anterior hay que revincularlos
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

/// Guarda el archivo. En Linux y macOS solo lo puede leer el usuario desde que se crea (lleva ENC_KEY y, si la hay,
/// la Secret Key). Se escribe en un temporal que se renombra encima: un corte de luz no deja el archivo a medias
/// (con ENC_KEY truncada, los tokens de los pilotos ya no se podrían descifrar)
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
            // Por si el temporal ya existía con otros permisos (mode solo vale al crearlo)
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))?;
        }
        file.write_all(c.to_env().as_bytes())?;
        file.sync_all()?;
    }
    // En Windows, rename reemplaza el archivo existente (MoveFileExW con MOVEFILE_REPLACE_EXISTING)
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
        c.client_secret = "s3cr3t".into();
        c.sync_interval_min = 0;
        c.api_port = 48000;
        assert_eq!(Config::from_map(&parse(&c.to_env())), c);
    }

    #[test]
    fn valida_lo_obligatorio() {
        // La Secret Key es opcional (PKCE)
        assert!(validate(&valid()).is_empty());
        assert!(validate(&Config { client_secret: "s3cr3t".into(), ..valid() }).is_empty());
        let c = Config { client_id: String::new(), ..Config::default() };
        assert_eq!(validate(&c), vec!["clientId"]);
        let mut c = valid();
        c.enc_key = "corta".into();
        c.web_port = c.api_port;
        assert_eq!(validate(&c), vec!["encKey", "ports"]);
    }

    #[test]
    fn la_app_del_instalador_exige_el_puerto_por_defecto() {
        // Solo se comprueba si se compiló con EVE_LEDGER_CLIENT_ID
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
        assert_eq!(env["ESI_USER_AGENT"], "eve-ledger-desktop/0.1.0");
        assert_eq!(env["WEB_URL"], format!("http://127.0.0.1:{DEFAULT_WEB_PORT}"));
        let web: BTreeMap<_, _> = valid().web_env("0.1.0").into_iter().collect();
        assert_eq!(web["APP_VERSION"], "0.1.0");
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
        // El siguiente arranque lee la misma clave (antes salía otra cada vez)
        assert_eq!(load(&path).unwrap().enc_key, first.enc_key);
        assert!(fs::read_to_string(&path).unwrap().contains(&format!("ENC_KEY={}", first.enc_key)));
        // Lo demás se conserva
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
    fn ignora_comentarios_y_rellena_lo_que_falta() {
        let c = Config::from_map(&parse("# hola\nEVE_CLIENT_ID = x \nPILOT_SLOTS=6\nAPI_PORT=nope\n"));
        assert_eq!(c.client_id, "x");
        assert_eq!(c.pilot_slots, 6);
        assert_eq!(c.api_port, DEFAULT_API_PORT);
    }
}
