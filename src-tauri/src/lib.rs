use std::{
  fs::{create_dir_all, OpenOptions},
  io::{BufRead, BufReader, Write},
  net::{TcpListener, TcpStream},
  path::PathBuf,
  process::{Child, Command, Stdio},
  sync::Mutex,
  time::Duration,
};
use tauri::{
  image::Image,
  menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem},
  tray::{TrayIcon, TrayIconBuilder},
  AppHandle, Emitter, Manager, State, Theme, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry,
};

struct ServerState {
  port: u16,
  child: Mutex<Option<Child>>,
}

struct TrayState {
  tray: Mutex<Option<TrayIcon<Wry>>>,
  msg_item: MenuItem<Wry>,
  own_item: MenuItem<Wry>,
  style: Mutex<String>,
}

const TRAY_TEMPLATE: &[u8] = include_bytes!("../tray-icons/dark/template.png");

fn tray_asset(style: &str, theme: Theme) -> (&'static [u8], bool) {
  let dark = matches!(theme, Theme::Dark);
  match style {
    "outline" => (
      if dark {
        include_bytes!("../tray-icons/dark/outline.png")
      } else {
        include_bytes!("../tray-icons/light/outline.png")
      },
      false,
    ),
    "grayscale" => (
      if dark {
        include_bytes!("../tray-icons/dark/grayscale.png")
      } else {
        include_bytes!("../tray-icons/light/grayscale.png")
      },
      false,
    ),
    _ => (TRAY_TEMPLATE, true),
  }
}

fn update_tray_icon(app: &AppHandle) -> Result<(), String> {
  let state = app
    .try_state::<TrayState>()
    .ok_or_else(|| "tray is not ready".to_string())?;
  let style = state
    .style
    .lock()
    .map_err(|_| "tray style lock failed".to_string())?
    .clone();
  let theme = app
    .get_webview_window("main")
    .and_then(|window| window.theme().ok())
    .unwrap_or(Theme::Dark);
  let (bytes, template) = tray_asset(&style, theme);
  let icon = Image::from_bytes(bytes).map_err(|error| error.to_string())?;
  if let Some(tray) = state
    .tray
    .lock()
    .map_err(|_| "tray lock failed".to_string())?
    .as_ref()
  {
    tray
      .set_icon_with_as_template(Some(icon), template)
      .map_err(|error| error.to_string())?;
  }
  Ok(())
}

fn show_main(app: &AppHandle, page: Option<&str>) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
  if let Some(page) = page {
    let _ = app.emit("navigate", page);
  }
}

fn handle_menu(app: &AppHandle, id: &str) {
  match id {
    "msg" => show_main(app, Some("chat")),
    "own" => show_main(app, Some("today")),
    "diary" => show_main(app, Some("diary")),
    "growth" => show_main(app, Some("growth")),
    "settings" => show_main(app, Some("settings")),
    "quit" => app.exit(0),
    _ => {}
  }
}

#[tauri::command]
fn server_port(state: State<ServerState>) -> u16 {
  state.port
}

#[tauri::command]
fn focus_main(app: tauri::AppHandle) {
  show_main(&app, None);
}

#[tauri::command]
fn set_tray_style(app: AppHandle, style: String) -> Result<(), String> {
  let style = match style.as_str() {
    "outline" | "grayscale" => style,
    _ => "template".to_string(),
  };
  if let Some(state) = app.try_state::<TrayState>() {
    *state
      .style
      .lock()
      .map_err(|_| "tray style lock failed".to_string())? = style;
    update_tray_icon(&app)?;
  }
  Ok(())
}

#[tauri::command]
fn update_tray(app: AppHandle, unread: u32, own: u32, label: String) {
  if let Some(state) = app.try_state::<TrayState>() {
    let msg_text = if unread > 0 {
      format!("{unread} 条新消息")
    } else {
      "暂无新消息".to_string()
    };
    let _ = state.msg_item.set_text(msg_text);

    let own_text = if own > 0 {
      let clean = label.replace(['\n', '\r'], " ").trim().to_string();
      let short: String = if clean.chars().count() > 18 {
        format!("{}…", clean.chars().take(18).collect::<String>())
      } else {
        clean
      };
      if short.is_empty() {
        "有新活动".to_string()
      } else {
        format!("有新活动：{short}")
      }
    } else {
      "暂无新活动".to_string()
    };
    let _ = state.own_item.set_text(own_text);
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
      show_main(app, None);
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

      let msg_item = MenuItem::with_id(app, "msg", "暂无新消息", true, None::<&str>)?;
      let own_item = MenuItem::with_id(app, "own", "暂无新活动", true, None::<&str>)?;
      let diary_item = MenuItem::with_id(app, "diary", "查看日记", true, None::<&str>)?;
      let growth_item = MenuItem::with_id(app, "growth", "查看成长", true, None::<&str>)?;
      let settings_item = MenuItem::with_id(app, "settings", "转到设置", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let sep1 = PredefinedMenuItem::separator(app)?;
      let sep2 = PredefinedMenuItem::separator(app)?;
      let items: [&dyn IsMenuItem<Wry>; 8] = [
        &msg_item,
        &own_item,
        &sep1,
        &diary_item,
        &growth_item,
        &sep2,
        &settings_item,
        &quit_item,
      ];
      let menu = Menu::with_items(app, &items)?;
      let tray = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(TRAY_TEMPLATE)?)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .build(app)?;
      app.manage(TrayState {
        tray: Mutex::new(Some(tray)),
        msg_item,
        own_item,
        style: Mutex::new("template".to_string()),
      });

      let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("DeepHome")
        .inner_size(1180.0, 780.0)
        .min_inner_size(900.0, 620.0)
        .center()
        .build()?;

      let app_handle = app.handle().clone();
      let window_handle = window.clone();
      window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          let _ = window_handle.hide();
        } else if let WindowEvent::ThemeChanged(_) = event {
          let _ = update_tray_icon(&app_handle);
        }
      });

      let _ = update_tray_icon(app.handle());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      server_port,
      focus_main,
      open_logs,
      set_tray_style,
      update_tray
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| match event {
      tauri::RunEvent::Exit => {
        if let Some(state) = app_handle.try_state::<ServerState>() {
          if let Some(mut child) = state.child.lock().ok().and_then(|mut guard| guard.take()) {
            let _ = child.kill();
          }
        }
      }
      #[cfg(target_os = "macos")]
      tauri::RunEvent::Reopen {
        has_visible_windows,
        ..
      } => {
        if !has_visible_windows {
          show_main(app_handle, None);
        }
      }
      _ => {}
    });
}
