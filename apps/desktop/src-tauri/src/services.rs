//! La API (Elysia) y la web (Astro SSR) corren como dos procesos de Bun, el «sidecar» que trae el instalador.
//! Escuchan solo en 127.0.0.1; su salida va a api.log y web.log en la carpeta de registros.

use crate::config::Config;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
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
        server: p.resource_dir().map_err(|e| e.to_string())?.join("server"),
        data: p.app_data_dir().map_err(|e| e.to_string())?,
        logs: p.app_log_dir().map_err(|e| e.to_string())?,
    })
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

        let version = app.package_info().version.to_string();
        let mut api_env = cfg.api_env(&version);
        api_env.push(("DB_PATH".into(), p.data.join("ledger.db").to_string_lossy().into()));
        api_env.push(("MIGRATIONS_DIR".into(), p.server.join("api").join("drizzle").to_string_lossy().into()));

        let api = self.spawn(app, "api", &p.server.join("api").join("api.js"), api_env, &p)?;
        let web = self.spawn(app, "web", &p.server.join("web").join("server").join("entry.js"), cfg.web_env(), &p)?;
        let mut running = self.running.lock().unwrap();
        running.push(api);
        running.push(web);
        Ok(())
    }

    fn spawn(
        &self,
        app: &AppHandle,
        name: &'static str,
        script: &Path,
        env: Vec<(String, String)>,
        p: &Paths,
    ) -> Result<Running, String> {
        let (mut rx, child) = app
            .shell()
            .sidecar("bun")
            .map_err(|e| e.to_string())?
            // launch.js sale cuando se cierra la app (aunque muera sin avisar) y luego importa el script
            .args([p.server.join("launch.js").to_string_lossy().to_string(), script.to_string_lossy().to_string()])
            .envs(env)
            .current_dir(&p.data)
            .spawn()
            .map_err(|e| format!("spawn:{name}:{e}"))?;

        let log_path = p.logs.join(format!("{name}.log"));
        let exited = Arc::new(Mutex::new(None));
        let exited_task = exited.clone();
        tauri::async_runtime::spawn(async move {
            // Se reescribe en cada arranque: lo que interesa es la sesión actual
            let mut log = OpenOptions::new().create(true).write(true).truncate(true).open(&log_path).ok();
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
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
