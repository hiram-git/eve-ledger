//! La API (Elysia) y la web (Astro SSR) corren como dos procesos de Bun, el «sidecar» que trae el instalador.
//! Escuchan solo en 127.0.0.1; su salida va a api.log y web.log en la carpeta de registros.

use crate::config::Config;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Un proceso en marcha y, si terminó, cómo
struct Running {
    name: &'static str,
    child: Option<CommandChild>,
    exited: Arc<Mutex<Option<String>>>,
}

#[derive(Default)]
pub struct Services {
    running: Mutex<Vec<Running>>,
}

/// Rutas de la instalación y del usuario
pub struct Paths {
    pub server: PathBuf,
    pub data: PathBuf,
    pub logs: PathBuf,
}

pub fn paths(app: &AppHandle) -> Result<Paths, String> {
    let p = app.path();
    Ok(Paths {
        server: plain(p.resource_dir().map_err(|e| e.to_string())?.join("server")),
        data: plain(p.app_data_dir().map_err(|e| e.to_string())?),
        logs: plain(p.app_log_dir().map_err(|e| e.to_string())?),
    })
}

/// En Windows, Tauri da rutas «verbatim» (`\\?\C:\Program Files\…`) que Bun no sabe abrir
/// («Module not found»): se quita el prefijo. `\\?\UNC\servidor\…` pasa a `\\servidor\…`. En el resto, igual
pub fn plain(path: PathBuf) -> PathBuf {
    PathBuf::from(strip_verbatim(&path.to_string_lossy()))
}

/// Copia los recursos del servidor (API, web y lanzador) a `dest/<huella>` si aún no están, y devuelve esa carpeta.
/// La huella es la versión más el tamaño y la fecha de los archivos principales: una compilación nueva con la
/// misma versión también se vuelve a copiar. Las copias de versiones anteriores se borran
pub fn install_server(src: &Path, dest_root: &Path, version: &str) -> std::io::Result<PathBuf> {
    let mut stamp = version.to_string();
    for f in ["launch.js", "api/api.js", "web/server/entry.js"] {
        let meta = fs::metadata(src.join(f))?;
        let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
        stamp.push_str(&format!("-{}.{}", meta.len(), modified));
    }
    let name: String = stamp.chars().map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' }).collect();
    let dest = dest_root.join(&name);
    let marker = dest.join(".complete");
    if !marker.exists() {
        let _ = fs::remove_dir_all(&dest);
        copy_dir(src, &dest)?;
        fs::write(&marker, &stamp)?;
    }
    // Limpieza de copias viejas (si alguna está en uso, se queda para la próxima vez)
    if let Ok(entries) = fs::read_dir(dest_root) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy() != name.as_str() {
                let _ = fs::remove_dir_all(e.path());
            }
        }
    }
    Ok(dest)
}

fn copy_dir(src: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let to = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

fn strip_verbatim(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path.to_string()
    }
}

/// Evento con el resultado de vincular un piloto (la consulta de `/pilotos?…`: `linked=ID` o `error=…`)
pub const AUTH_RESULT_EVENT: &str = "auth-result";

/// La API escribe `[auth] result:<consulta>` al terminar el login de EVE (apps/api/src/routes/auth.ts)
fn auth_result(output: &str) -> Option<String> {
    output.lines().find_map(|l| l.trim().strip_prefix("[auth] result:")).map(str::to_string)
}

fn port_free(port: u16) -> bool {
    TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port))).is_ok()
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(&SocketAddr::from((Ipv4Addr::LOCALHOST, port)), Duration::from_millis(300)).is_ok()
}

/// Las últimas líneas de un registro, para explicar por qué no arrancó
pub fn log_tail(path: &Path, lines: usize) -> String {
    let text = fs::read_to_string(path).unwrap_or_default();
    let all: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    all[all.len().saturating_sub(lines)..].join("\n")
}

impl Services {
    /// Para lo que esté en marcha y arranca la API y la web con esta configuración
    pub fn start(&self, app: &AppHandle, cfg: &Config) -> Result<(), String> {
        self.stop();
        let p = paths(app)?;
        for port in [cfg.api_port, cfg.web_port] {
            if !port_free(port) {
                return Err(format!("port:{port}"));
            }
        }
        fs::create_dir_all(&p.data).map_err(|e| e.to_string())?;
        fs::create_dir_all(&p.logs).map_err(|e| e.to_string())?;
        // Bun no ejecuta nada desde la carpeta de instalación (en Windows, «EPERM reading» en C:\Program Files):
        // corre una copia en la carpeta de datos local del usuario
        let local = plain(app.path().app_local_data_dir().map_err(|e| e.to_string())?);
        let server = install_server(&p.server, &local.join("server"), &app.package_info().version.to_string())
            .map_err(|e| format!("copy:{e}"))?;

        let version = app.package_info().version.to_string();
        let mut api_env = cfg.api_env(&version);
        api_env.push(("DB_PATH".into(), p.data.join("ledger.db").to_string_lossy().into()));
        api_env.push(("MIGRATIONS_DIR".into(), server.join("api").join("drizzle").to_string_lossy().into()));

        let launcher = server.join("launch.js");
        let api = self.spawn(app, "api", &launcher, &server.join("api").join("api.js"), api_env, &p)?;
        let web = self.spawn(app, "web", &launcher, &server.join("web").join("server").join("entry.js"), cfg.web_env(), &p)?;
        let mut running = self.running.lock().unwrap();
        running.push(api);
        running.push(web);
        Ok(())
    }

    fn spawn(
        &self,
        app: &AppHandle,
        name: &'static str,
        launcher: &Path,
        script: &Path,
        env: Vec<(String, String)>,
        p: &Paths,
    ) -> Result<Running, String> {
        let (mut rx, child) = app
            .shell()
            .sidecar("bun")
            .map_err(|e| e.to_string())?
            // launch.js sale cuando se cierra la app (aunque muera sin avisar) y luego importa el script
            .args([launcher.to_string_lossy().to_string(), script.to_string_lossy().to_string()])
            .envs(env)
            .current_dir(&p.data)
            .spawn()
            .map_err(|e| format!("spawn:{name}:{e}"))?;

        let log_path = p.logs.join(format!("{name}.log"));
        let exited = Arc::new(Mutex::new(None));
        let exited_task = exited.clone();
        let app_task = app.clone();
        tauri::async_runtime::spawn(async move {
            // Se reescribe en cada arranque: lo que interesa es la sesión actual
            let mut log = OpenOptions::new().create(true).write(true).truncate(true).open(&log_path).ok();
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                        if name == "api" {
                            if let Some(query) = auth_result(&String::from_utf8_lossy(&bytes)) {
                                let _ = app_task.emit(AUTH_RESULT_EVENT, query);
                            }
                        }
                        if let Some(f) = log.as_mut() {
                            let _ = f.write_all(&bytes);
                            if !bytes.ends_with(b"\n") {
                                let _ = f.write_all(b"\n");
                            }
                        }
                    }
                    CommandEvent::Terminated(status) => {
                        *exited_task.lock().unwrap() = Some(format!("{:?}", status.code));
                    }
                    CommandEvent::Error(err) => {
                        *exited_task.lock().unwrap() = Some(err);
                    }
                    _ => {}
                }
            }
        });
        Ok(Running { name, child: Some(child), exited })
    }

    /// Espera a que los dos procesos acepten conexiones. Si uno termina antes, devuelve qué dijo
    pub fn wait_ready(&self, app: &AppHandle, cfg: &Config, timeout: Duration) -> Result<(), String> {
        let logs = paths(app)?.logs;
        let start = Instant::now();
        loop {
            for r in self.running.lock().unwrap().iter() {
                if let Some(code) = r.exited.lock().unwrap().clone() {
                    let tail = log_tail(&logs.join(format!("{}.log", r.name)), 12);
                    return Err(format!("exited:{}:{code}\n{tail}", r.name));
                }
            }
            if port_open(cfg.api_port) && port_open(cfg.web_port) {
                return Ok(());
            }
            if start.elapsed() > timeout {
                return Err("timeout".into());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    pub fn stop(&self) {
        let mut running = self.running.lock().unwrap();
        for r in running.iter_mut() {
            if let Some(child) = r.child.take() {
                let _ = child.kill();
            }
        }
        running.clear();
        drop(running);
        // Que los puertos queden libres antes de volver a arrancar
        std::thread::sleep(Duration::from_millis(300));
    }
}

#[cfg(test)]
mod tests {
    use super::{auth_result, install_server, strip_verbatim};
    use std::fs;

    #[test]
    fn copia_el_servidor_una_vez_por_huella_y_borra_las_viejas() {
        let tmp = std::env::temp_dir().join(format!("eve-ledger-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let src = tmp.join("recursos");
        for (f, body) in [("launch.js", "l"), ("api/api.js", "a"), ("api/drizzle/0000.sql", "s"), ("web/server/entry.js", "w"), ("web/client/x.css", "c")] {
            let path = src.join(f);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, body).unwrap();
        }
        let root = tmp.join("local").join("server");
        fs::create_dir_all(root.join("0.0.9-viejo")).unwrap();
        let dest = install_server(&src, &root, "0.1.1").unwrap();
        assert_eq!(fs::read_to_string(dest.join("api/drizzle/0000.sql")).unwrap(), "s");
        assert_eq!(fs::read_to_string(dest.join("web/client/x.css")).unwrap(), "c");
        assert!(!root.join("0.0.9-viejo").exists());
        // Segunda vez: misma carpeta, sin volver a copiar (un archivo tocado en la copia sigue igual)
        fs::write(dest.join("web/client/x.css"), "tocado").unwrap();
        assert_eq!(install_server(&src, &root, "0.1.1").unwrap(), dest);
        assert_eq!(fs::read_to_string(dest.join("web/client/x.css")).unwrap(), "tocado");
        // Otra versión: carpeta nueva
        assert_ne!(install_server(&src, &root, "0.1.2").unwrap(), dest);
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn lee_el_resultado_del_login_en_la_salida_de_la_api() {
        assert_eq!(auth_result("Listening\n[auth] result:linked=9001\n"), Some("linked=9001".into()));
        assert_eq!(auth_result("[auth] result:error=sso&detail=x%0Ay"), Some("error=sso&detail=x%0Ay".into()));
        assert_eq!(auth_result("[auth] sync inicial de X: 3 movimientos"), None);
    }

    #[test]
    fn quita_el_prefijo_verbatim_de_windows() {
        assert_eq!(strip_verbatim(r"\\?\C:\Program Files\EVE Ledger\server"), r"C:\Program Files\EVE Ledger\server");
        assert_eq!(strip_verbatim(r"\\?\UNC\nas\juegos\EVE Ledger"), r"\\nas\juegos\EVE Ledger");
        assert_eq!(strip_verbatim(r"C:\Users\Piloto\AppData"), r"C:\Users\Piloto\AppData");
        assert_eq!(strip_verbatim("/usr/lib/EVE Ledger/server"), "/usr/lib/EVE Ledger/server");
    }
}
