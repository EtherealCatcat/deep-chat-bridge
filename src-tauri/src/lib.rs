use std::{
  fs::{create_dir_all, OpenOptions},
  io::{BufRead, BufReader, Write},
  net::{TcpListener, TcpStream},
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
  time::Duration,
};
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

struct ServerState {
  port: u16,
  child: Mutex<Option<Child>>,
}

#[tauri::command]
fn server_port(state: State<ServerState>) -> u16 {
  state.port
}

#[tauri::command]
fn focus_main(app: tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

fn log_dir() -> PathBuf {
  let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
  PathBuf::from(home).join("Library").join("Logs").join("DeepHome")
}

#[tauri::command]
fn open_logs() -> Result<(), String> {
  let dir = log_dir();
  create_dir_all(&dir).map_err(|error| error.to_string())?;
  Command::new("open")
    .arg(&dir)
    .spawn()
    .map_err(|error| error.to_string())?;
  Ok(())
}

fn free_port() -> Result<u16, String> {
  let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
  let port = listener.local_addr().map_err(|error| error.to_string())?.port();
  drop(listener);
  Ok(port)
}

fn pipe_logs<R: std::io::Read + Send + 'static>(reader: R, path: PathBuf) {
  std::thread::spawn(move || {
    let mut file = match OpenOptions::new().create(true).append(true).open(&path) {
      Ok(file) => file,
      Err(_) => return,
    };
    for line in BufReader::new(reader).lines().map_while(Result::ok) {
      let _ = writeln!(file, "{line}");
      let _ = file.flush();
    }
  });
}

fn spawn_server(app: &tauri::AppHandle) -> Result<(u16, Child), String> {
  let resource = app.path().resource_dir().map_err(|error| error.to_string())?;
  let node = resource.join("node");
  let server = resource.join("server.mjs");
  let assets = resource.join("assets");
  if !node.exists() || !server.exists() {
    return Err(format!("sidecar 资源不完整：{} / {}", node.display(), server.display()));
  }

  let dir = log_dir();
  create_dir_all(&dir).map_err(|error| error.to_string())?;
  let mut log = OpenOptions::new()
    .create(true)
    .append(true)
    .open(dir.join("server.log"))
    .map_err(|error| error.to_string())?;
  let _ = writeln!(log, "\n--- DeepHome sidecar start {} ---", chrono_like_now());

  let port = free_port()?;
  let mut child = Command::new(&node)
    .arg(&server)
    .env("CHATBRIDGE_PORT", port.to_string())
    .env("CHATBRIDGE_ASSETS_DIR", &assets)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|error| format!("启动 sidecar 失败：{error}"))?;

  if let Some(stdout) = child.stdout.take() {
    pipe_logs(stdout, dir.join("server.log"));
  }
  if let Some(stderr) = child.stderr.take() {
    pipe_logs(stderr, dir.join("server.log"));
  }

  for _ in 0..120 {
    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
      return Ok((port, child));
    }
    std::thread::sleep(Duration::from_millis(100));
  }
  let _ = child.kill();
  Err(format!("sidecar 没有在 12 秒内监听端口 {port}"))
}

fn chrono_like_now() -> String {
  use std::time::{SystemTime, UNIX_EPOCH};
  let seconds = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
  seconds.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let (port, child) = if cfg!(debug_assertions) {
        (7788_u16, None)
      } else {
        let (port, child) = spawn_server(app.handle())?;
        (port, Some(child))
      };
      app.manage(ServerState {
        port,
        child: Mutex::new(child),
      });

      WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("DeepHome")
        .inner_size(1180.0, 780.0)
        .min_inner_size(900.0, 620.0)
        .center()
        .build()?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![server_port, focus_main, open_logs])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let tauri::RunEvent::Exit = event {
        if let Some(state) = app_handle.try_state::<ServerState>() {
          if let Some(mut child) = state.child.lock().ok().and_then(|mut guard| guard.take()) {
            let _ = child.kill();
          }
        }
      }
    });
}
