use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

static WIDGET_CREATING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WidgetConfig {
    pub opacity: f64,
    pub locked: bool,
    pub pinned_to_desktop: bool,
    pub selected_modules: Vec<String>,
    pub layout: String,
    pub width: f64,
    pub height: f64,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub theme: String,
    pub refresh_interval_sec: u32,
    pub time_period: String,
}

impl Default for WidgetConfig {
    fn default() -> Self {
        Self {
            opacity: 0.92,
            locked: false,
            pinned_to_desktop: false,
            selected_modules: vec![
                "overview".into(),
                "trend".into(),
                "source_split".into(),
            ],
            layout: "vertical".into(),
            width: 360.0,
            height: 480.0,
            x: None,
            y: None,
            theme: "auto".into(),
            refresh_interval_sec: 300,
            time_period: "7d".into(),
        }
    }
}

fn config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("widget_config.json"))
}

fn create_widget_window(app: &tauri::AppHandle) -> Result<(), String> {
    if WIDGET_CREATING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        eprintln!("[Widget] Already creating, skipping");
        return Ok(());
    }
    eprintln!("[Widget] Creating widget window...");
    let config = load_config_from_disk(app);
    // Clamp size to prevent corrupted/full-screen dimensions from being used
    let default_w = 360.0;
    let default_h = 480.0;
    let w = if config.width > 50.0 && config.width <= 800.0 { config.width } else { default_w };
    let h = if config.height > 50.0 && config.height <= 1000.0 { config.height } else { default_h };
    eprintln!("[Widget] Size: {}x{} (raw config: {}x{})", w, h, config.width, config.height);

    // In dev mode, use the devUrl directly to avoid Tauri's asset protocol
    // falling back to index.html for non-root HTML paths.
    // In production, use the asset protocol via WebviewUrl::App.
    let widget_url = match &app.config().build.dev_url {
        Some(dev_url) => {
            let base = dev_url.as_str().trim_end_matches('/');
            let url: url::Url = format!("{}/widget.html", base)
                .parse()
                .map_err(|e| format!("无效的小组件 URL: {}", e))?;
            WebviewUrl::External(url)
        }
        None => WebviewUrl::App("widget.html".into()),
    };

    let mut builder = WebviewWindowBuilder::new(app, "widget", widget_url)
        .title("Token Widget")
        .inner_size(w, h)
        .min_inner_size(280.0, 200.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .visible(false);

    if let (Some(x), Some(y)) = (config.x, config.y) {
        builder = builder.position(x, y);
    } else {
        // Default: position to the right of the main window to avoid overlap
        if let Some(main_win) = app.get_webview_window("main") {
            if let Ok(pos) = main_win.outer_position() {
                builder = builder.position(pos.x as f64 + 1408.0 + 20.0, pos.y as f64);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.effects(tauri::utils::config::WindowEffectsConfig {
            effects: vec![tauri::utils::WindowEffect::Acrylic],
            state: Some(tauri::utils::WindowEffectState::Active),
            radius: Some(14.0),
            color: Some(tauri::utils::config::Color(0, 0, 0, 0)),
        });
    }

    let widget_win = match builder.build() {
        Ok(win) => win,
        Err(e) => {
            WIDGET_CREATING.store(false, Ordering::SeqCst);
            return Err(format!("创建小组件窗口失败: {}", e));
        }
    };
    WIDGET_CREATING.store(false, Ordering::SeqCst);

    // Explicitly set size after build to prevent DWM from expanding the window
    let _ = widget_win.set_size(tauri::LogicalSize::new(w, h));

    eprintln!("[Widget] Window built successfully, setting up listeners...");

    // Trailing-edge debounce: persist position/size 500ms after the last event,
    // so the final resting position/size is captured rather than lost.
    if let Some(win) = app.get_webview_window("widget") {
        let app_handle = app.clone();
        let save_version: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));

        win.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Moved(pos) => {
                    let v = save_version.fetch_add(1, Ordering::SeqCst) + 1;
                    let app = app_handle.clone();
                    let sv = save_version.clone();
                    let x = pos.x as f64;
                    let y = pos.y as f64;
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        if sv.load(Ordering::SeqCst) == v {
                            let mut config = load_config_from_disk(&app);
                            config.x = Some(x);
                            config.y = Some(y);
                            let _ = save_widget_config_internal(&app, &config);
                        }
                    });
                }
                tauri::WindowEvent::Resized(size) => {
                    let v = save_version.fetch_add(1, Ordering::SeqCst) + 1;
                    let app = app_handle.clone();
                    let sv = save_version.clone();
                    let w = size.width as f64;
                    let h = size.height as f64;
                    // Only save if within reasonable bounds (prevent corrupted full-screen dimensions)
                    if w > 50.0 && w <= 800.0 && h > 50.0 && h <= 1000.0 {
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            if sv.load(Ordering::SeqCst) == v {
                                let mut config = load_config_from_disk(&app);
                                config.width = w;
                                config.height = h;
                                let _ = save_widget_config_internal(&app, &config);
                            }
                        });
                    }
                }
                _ => {}
            }
        });
    }

    Ok(())
}

/// Pre-create the widget window during app setup (on the main thread).
/// Window operations like build() must run on the main thread in Tauri v2.
pub fn precreate_widget(app: &tauri::AppHandle) -> Result<(), String> {
    create_widget_window(app)
}

#[tauri::command]
pub fn toggle_widget(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("widget")
        .ok_or_else(|| "小组件窗口尚未创建".to_string())?;
    if win.is_visible().unwrap_or(false) {
        eprintln!("[Widget] Hiding widget");
        win.hide().map_err(|e| e.to_string())?;
    } else {
        eprintln!("[Widget] Showing widget");
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_widget_ignore_cursor(app: tauri::AppHandle, label: String, ignore: bool) -> Result<(), String> {
    let win = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("窗口 '{}' 不存在", label))?;
    win.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_widget_config(app: tauri::AppHandle, config: WidgetConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    // Notify widget window to reload config
    let _ = app.emit("widget-config-changed", &config);
    Ok(())
}

#[tauri::command]
pub fn load_widget_config(app: tauri::AppHandle) -> Result<WidgetConfig, String> {
    Ok(load_config_from_disk(&app))
}

fn load_config_from_disk(app: &tauri::AppHandle) -> WidgetConfig {
    match config_path(app) {
        Ok(path) if path.exists() => {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(config) => config,
                    Err(e) => {
                        eprintln!("[Widget] 配置文件 JSON 解析失败: {}, 使用默认配置", e);
                        WidgetConfig::default()
                    }
                },
                Err(e) => {
                    eprintln!("[Widget] 配置文件读取失败: {}, 使用默认配置", e);
                    WidgetConfig::default()
                }
            }
        }
        Ok(_) => {
            eprintln!("[Widget] 配置文件不存在，使用默认配置");
            WidgetConfig::default()
        }
        Err(e) => {
            eprintln!("[Widget] 无法获取配置路径: {}, 使用默认配置", e);
            WidgetConfig::default()
        }
    }
}

fn save_widget_config_internal(app: &tauri::AppHandle, config: &WidgetConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

// --- Windows 桌面钉入 ---
#[cfg(target_os = "windows")]
mod win_desktop {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowA, GetClassNameA, GetParent, SendMessageA, SetParent,
    };
    use std::ffi::CStr;
    use std::sync::Mutex;

    static WORKERW_HWND: Mutex<Option<isize>> = Mutex::new(None);

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        unsafe {
            let mut class_name = [0u8; 256];
            let len = GetClassNameA(hwnd, class_name.as_mut_ptr(), class_name.len() as i32);
            if len == 0 { return 1; }
            let name = CStr::from_bytes_until_nul(&class_name)
                .unwrap_or_default()
                .to_str()
                .unwrap_or_default();

            if name == "WorkerW" {
                let shell_view = FindWindowA(
                    b"SHELLDLL_DefView\0".as_ptr(),
                    std::ptr::null(),
                );
                if !shell_view.is_null() && GetParent(shell_view) == hwnd {
                    return 1; // 跳过有 SHELLDLL_DefView 的 WorkerW
                }

                let mut hw = WORKERW_HWND.lock().unwrap();
                if hw.is_none() {
                    *hw = Some(hwnd as isize);
                    return 0;
                }
            }

            1
        }
    }

    pub fn embed_to_desktop(hwnd: isize) -> Result<(), String> {
        unsafe {
            let progman = FindWindowA(b"Progman\0".as_ptr(), std::ptr::null());
            if progman.is_null() {
                return Err("找不到 Progman 窗口".into());
            }

            SendMessageA(progman, 0x052C, 0, 0);

            {
                let mut hw = WORKERW_HWND.lock().unwrap();
                *hw = None;
            }
            EnumWindows(Some(enum_windows_proc), 0);

            let workerw = {
                let hw = WORKERW_HWND.lock().unwrap();
                hw.ok_or("找不到 WorkerW 窗口")?
            };

            let prev = SetParent(hwnd as HWND, workerw as HWND);
            if prev.is_null() {
                // SetParent 返回 NULL 可能表示失败，但也可能是原来就没有父窗口
                // 不一定代表错误，忽略
            }

            Ok(())
        }
    }

    pub fn unpin_from_desktop(hwnd: isize) -> Result<(), String> {
        unsafe {
            SetParent(hwnd as HWND, std::ptr::null_mut());
            Ok(())
        }
    }
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn embed_widget_to_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("widget")
        .ok_or("小组件窗口不存在，请先打开小组件")?;

    // 获取窗口句柄
    let hwnd = win.hwnd().map_err(|e| e.to_string())?;
    win_desktop::embed_to_desktop(hwnd.0 as isize)?;

    // 设置为不可置顶（因为已经嵌入桌面层）
    win.set_always_on_bottom(true).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn unpin_widget_from_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("widget")
        .ok_or("小组件窗口不存在")?;

    let hwnd = win.hwnd().map_err(|e| e.to_string())?;
    win_desktop::unpin_from_desktop(hwnd.0 as isize)?;

    // 恢复置顶
    win.set_always_on_top(true).map_err(|e| e.to_string())?;

    Ok(())
}

// Non-Windows stubs: these functions are Windows-only (desktop pinning).
// Provide stub implementations so the command handler compiles on all platforms.
#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub fn embed_widget_to_desktop(_app: tauri::AppHandle) -> Result<(), String> {
    Err("桌面钉入仅在 Windows 上可用".into())
}

#[tauri::command]
#[cfg(not(target_os = "windows"))]
pub fn unpin_widget_from_desktop(_app: tauri::AppHandle) -> Result<(), String> {
    Err("桌面钉入仅在 Windows 上可用".into())
}
