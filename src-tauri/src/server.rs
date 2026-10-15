use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Url};

const LOG_LIMIT: u64 = 500 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub app_version: String,
    pub phase: String,
    pub message: String,
    pub url: Option<String>,
    pub log_path: String,
}

enum Signal {
    Restart,
    #[cfg(target_os = "macos")]
    Pause(mpsc::Sender<()>),
    Stop,
}

pub struct Server {
    tx: mpsc::Sender<Signal>,
    status: Arc<Mutex<Status>>,
    thread: Mutex<Option<JoinHandle<()>>>,
    pub asset_url: Url,
}

impl Server {
    pub fn start(app: AppHandle, asset_url: Url) -> Result<Self, Box<dyn std::error::Error>> {
        let data = app.path().app_data_dir()?;
        fs::create_dir_all(&data)?;
        let log_path = data.join("server.log");
        let log = Arc::new(Mutex::new(RollingLog::open(log_path.clone())?));
        let status = Arc::new(Mutex::new(Status {
            app_version: app.package_info().version.to_string(),
            phase: "starting".into(),
            message: "正在启动… / Starting…".into(),
            url: None,
            log_path: log_path.display().to_string(),
        }));
        let (tx, rx) = mpsc::channel();
        let worker_status = status.clone();
        let home = asset_url.clone();
        let resource_dir = app.path().resource_dir()?.join("resources/server");
        let port_file = data.join("server-port");
        // Development is always loopback; release builds ignore inherited dev overrides.
        let dev_port = if cfg!(debug_assertions) {
            std::env::var("DESKTOP_DEV_PORT")
                .ok()
                .and_then(|s| s.parse::<u16>().ok())
        } else {
            None
        };
        let thread = thread::spawn(move || {
            supervise(
                app,
                home,
                resource_dir,
                dev_port,
                port_file,
                worker_status,
                log,
                rx,
            );
        });
        Ok(Self {
            tx,
            status,
            thread: Mutex::new(Some(thread)),
            asset_url,
        })
    }

    pub fn status(&self) -> Status {
        self.status.lock().unwrap().clone()
    }

    pub fn restart(&self) -> Result<(), String> {
        self.tx.send(Signal::Restart).map_err(|e| e.to_string())
    }

    pub fn stop(&self) {
        let _ = self.tx.send(Signal::Stop);
        if let Some(thread) = self.thread.lock().unwrap().take() {
            let _ = thread.join();
        }
    }

    #[cfg(target_os = "macos")]
    pub fn pause(&self) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx.send(Signal::Pause(tx)).map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(2))
            .map_err(|e| e.to_string())
    }
}

// A single mutex serializes both pipes, bounding the file even across restarts.
struct RollingLog(File);

impl RollingLog {
    fn open(path: PathBuf) -> std::io::Result<Self> {
        let mut log = Self(
            OpenOptions::new()
                .create(true)
                .truncate(false)
                .read(true)
                .write(true)
                .open(path)?,
        );
        log.append(b"\n--- Desktop server session ---\n")?;
        Ok(log)
    }

    fn append(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        let bytes = &bytes[bytes.len().saturating_sub(LOG_LIMIT as usize)..];
        let length = self.0.metadata()?.len();
        if length + bytes.len() as u64 > LOG_LIMIT {
            let keep = (LOG_LIMIT as usize).saturating_sub(bytes.len());
            self.0
                .seek(SeekFrom::Start(length.saturating_sub(keep as u64)))?;
            let mut tail = Vec::new();
            self.0.read_to_end(&mut tail)?;
            self.0.set_len(0)?;
            self.0.rewind()?;
            self.0.write_all(&tail)?;
        }
        self.0.seek(SeekFrom::End(0))?;
        self.0.write_all(bytes)?;
        self.0.flush()
    }
}

fn pipe_log(pipe: impl Read + Send + 'static, log: Arc<Mutex<RollingLog>>) {
    thread::spawn(move || {
        let mut reader = pipe;
        let mut buffer = [0_u8; 4096];
        while let Ok(count) = reader.read(&mut buffer) {
            if count == 0 {
                break;
            }
            let _ = log.lock().unwrap().append(&buffer[..count]);
        }
    });
}

fn terminate(child: &mut Option<Child>) {
    if let Some(mut process) = child.take() {
        let _ = process.kill();
        let _ = process.wait();
    }
}

fn set_status(status: &Mutex<Status>, phase: &str, message: &str, url: Option<String>) {
    let mut state = status.lock().unwrap();
    state.phase = phase.into();
    state.message = message.into();
    state.url = url;
}

fn show_launcher(app: &AppHandle, home: &Url) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(home.clone());
    }
}

fn spawn_server(
    directory: &PathBuf,
    port: u16,
    log: Arc<Mutex<RollingLog>>,
) -> std::io::Result<Child> {
    let node = directory.join(if cfg!(windows) { "node.exe" } else { "node" });
    let mut command = Command::new(node);
    command
        .arg(directory.join("server.js"))
        .current_dir(directory)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn()?;
    pipe_log(child.stdout.take().unwrap(), log.clone());
    pipe_log(child.stderr.take().unwrap(), log);
    Ok(child)
}

fn healthy(client: &reqwest::blocking::Client, url: &str) -> bool {
    client
        .get(format!("{url}/api/auth"))
        .send()
        .ok()
        .filter(|response| response.status().is_success())
        .and_then(|response| response.json::<serde_json::Value>().ok())
        .is_some_and(|body| body["requiresAuth"].is_boolean() && body["authenticated"].is_boolean())
}

fn local_port(path: &PathBuf) -> std::io::Result<u16> {
    // localStorage is origin-scoped (including the port). Reuse the initially
    // allocated port so history and API keys survive relaunches and updates.
    let saved = match fs::read_to_string(path) {
        Ok(value) => Some(value.trim().parse::<u16>().map_err(std::io::Error::other)?),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    if let Some(port) = saved.filter(|port| *port != 0) {
        // Node sets SO_REUSEADDR; probing with std::TcpListener would falsely
        // reject the saved port while connections from the last run are in TIME_WAIT.
        return Ok(port);
    }
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    fs::write(path, port.to_string())?;
    Ok(port)
}

fn supervise(
    app: AppHandle,
    home: Url,
    directory: PathBuf,
    dev_port: Option<u16>,
    port_file: PathBuf,
    status: Arc<Mutex<Status>>,
    log: Arc<Mutex<RollingLog>>,
    rx: mpsc::Receiver<Signal>,
) {
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_millis(800))
        .build()
        .expect("loopback HTTP client");
    let mut child = None;
    let mut launch = true;
    let mut retries = 0;
    let mut started = Instant::now();
    let mut url = String::new();
    let mut running = false;
    loop {
        if launch {
            terminate(&mut child);
            running = false;
            set_status(&status, "starting", "正在启动… / Starting…", None);
            let result = (|| -> Result<u16, Box<dyn std::error::Error>> {
                if let Some(port) = dev_port {
                    return Ok(port);
                }
                let port = local_port(&port_file)?;
                child = Some(spawn_server(&directory, port, log.clone())?);
                Ok(port)
            })();
            match result {
                Ok(port) => {
                    url = format!("http://127.0.0.1:{port}");
                    started = Instant::now();
                }
                Err(error) => {
                    let message = format!("服务启动失败 / Could not start server: {error}");
                    let _ = log.lock().unwrap().append(message.as_bytes());
                    set_status(&status, "error", &message, None);
                }
            }
            launch = false;
        }

        match rx.recv_timeout(Duration::from_millis(250)) {
            #[cfg(target_os = "macos")]
            Ok(Signal::Pause(ack)) => {
                terminate(&mut child);
                running = false;
                set_status(
                    &status,
                    "paused",
                    "正在安装更新… / Installing update…",
                    None,
                );
                let _ = ack.send(());
                continue;
            }
            Ok(Signal::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Ok(Signal::Restart) => {
                retries = 0;
                launch = true;
                show_launcher(&app, &home);
                continue;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }

        if let Some(process) = child.as_mut() {
            if let Ok(Some(exit)) = process.try_wait() {
                child = None;
                let message = format!("服务已退出 / Server exited ({exit}).");
                let _ = log.lock().unwrap().append(message.as_bytes());
                if running && retries == 0 {
                    retries = 1;
                    launch = true;
                    set_status(
                        &status,
                        "starting",
                        "服务正在重启… / Restarting server…",
                        None,
                    );
                } else {
                    set_status(&status, "error", &message, None);
                }
                show_launcher(&app, &home);
                continue;
            }
        }
        if matches!(status.lock().unwrap().phase.as_str(), "error" | "paused") || running {
            continue;
        }
        if healthy(&client, &url) {
            running = true;
            set_status(&status, "running", "就绪 / Ready", Some(url.clone()));
            if let Some(window) = app.get_webview_window("main") {
                // JSON encoding prevents script injection; origin is constructed solely from a u16 port.
                let script = format!(
                    "window.location.href={}",
                    serde_json::to_string(&url).unwrap()
                );
                if let Err(error) = window.eval(&script) {
                    let _ = log
                        .lock()
                        .unwrap()
                        .append(format!("Navigation failed: {error}\n").as_bytes());
                    let _ = window.navigate(url.parse().unwrap());
                }
            }
        } else if started.elapsed() >= Duration::from_secs(30) {
            terminate(&mut child);
            set_status(
                &status,
                "error",
                "启动超过 30 秒，请查看日志并重试。 / Startup timed out. Check the log and retry.",
                None,
            );
            show_launcher(&app, &home);
        }
    }
    terminate(&mut child);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relaunch_reuses_the_origin_port() {
        let path =
            std::env::temp_dir().join(format!("japanese-analyzer-port-{}", std::process::id()));
        let first = local_port(&path).unwrap();
        assert_ne!(first, 0);
        assert_eq!(local_port(&path).unwrap(), first);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn rolling_log_preserves_recent_output_and_caps_size() {
        let path =
            std::env::temp_dir().join(format!("japanese-analyzer-log-{}.txt", std::process::id()));
        {
            let mut log = RollingLog::open(path.clone()).unwrap();
            log.append(&vec![b'a'; LOG_LIMIT as usize + 100]).unwrap();
            log.append(b"latest").unwrap();
            assert_eq!(log.0.metadata().unwrap().len(), LOG_LIMIT);
        }
        assert!(fs::read(&path).unwrap().ends_with(b"latest"));
        fs::remove_file(path).unwrap();
    }
}
