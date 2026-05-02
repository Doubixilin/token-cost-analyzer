use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

static WIDGET_CREATING: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static PINNED_BOTTOM: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WidgetConfig {
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
            locked: false,
            pinned_to_desktop: false,
            selected_modules: vec![
                "overview".into(),
                "trend".into(),
                "source_split".into(),
            ],
            layout: "vertical".into(),
            width: 320.0,
            height: 440.0,
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
    let default_w = 320.0;
    let default_h = 440.0;
    let w = if config.width > 50.0 && config.width <= 600.0 { config.width } else { default_w };
    let h = if config.height > 50.0 && config.height <= 800.0 { config.height } else { default_h };
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
        .transparent(true)
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
                if let Ok(size) = main_win.inner_size() {
                    builder = builder.position(pos.x as f64 + size.width as f64 + 20.0, pos.y as f64);
                } else {
                    builder = builder.position(pos.x as f64 + 1420.0, pos.y as f64);
                }
            }
        }
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

    // Explicitly ensure cursor events are NOT ignored.
    // On Windows with decorations(false) + Acrylic, the window may default to
    // ignoring cursor events (WebView2 treats transparent HTML regions as pass-through).
    let _ = widget_win.set_ignore_cursor_events(false);

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
                    if w > 50.0 && w <= 600.0 && h > 50.0 && h <= 800.0 {
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
        win.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
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
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowA, GetClassNameA, GetParent, SendMessageA, SetParent,
        SetWindowPos, ShowWindow, GetWindowRect, IsWindowVisible, GetWindowLongA,
        SWP_NOSIZE, SWP_NOMOVE, SWP_FRAMECHANGED, SWP_SHOWWINDOW, SWP_NOZORDER,
        SW_SHOW, HWND_TOP,
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

            // Debug: inspect WorkerW before reparenting
            let workerw_style = GetWindowLongA(workerw as HWND, -16); // GWL_STYLE
            let workerw_visible = IsWindowVisible(workerw as HWND);
            let mut workerw_rect: RECT = std::mem::zeroed();
            GetWindowRect(workerw as HWND, &mut workerw_rect);
            eprintln!("[Widget] WorkerW style={:#x}, visible={}, rect=({},{} {}x{})",
                workerw_style, workerw_visible,
                workerw_rect.left, workerw_rect.top,
                workerw_rect.right - workerw_rect.left,
                workerw_rect.bottom - workerw_rect.top);

            // Hide before reparenting to avoid DWM compositor glitches
            // when a WebView2 window is re-parented across processes.
            ShowWindow(hwnd as HWND, 0); // SW_HIDE = 0
            SetParent(hwnd as HWND, workerw as HWND);

            // WorkerW must be visible for its children to show. If it is hidden,
            // make it visible so our widget can appear.
            if workerw_visible == 0 {
                eprintln!("[Widget] WorkerW was hidden, making it visible");
                ShowWindow(workerw as HWND, SW_SHOW);
            }

            // Restore visibility and force style refresh after reparenting.
            // SWP_NOZORDER removed: explicitly place this window at the top of
            // WorkerW's child z-order so it is not occluded by other children.
            ShowWindow(hwnd as HWND, SW_SHOW);
            SetWindowPos(
                hwnd as HWND,
                HWND_TOP,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
            );

            Ok(())
        }
    }

    pub fn unpin_from_desktop(hwnd: isize) -> Result<(), String> {
        unsafe {
            SetParent(hwnd as HWND, std::ptr::null_mut());
            // After restoring to a top-level window, force a style refresh so
            // WebView2 regains its proper popup frame and rendering surface.
            SetWindowPos(
                hwnd as HWND,
                std::ptr::null_mut(), // HWND_TOP (0) as proper pointer type
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
            );
            Ok(())
        }
    }

    /// Place window at the bottom of the z-order without changing its parent.
    /// This avoids WebView2 rendering breakage caused by cross-process SetParent.
    pub fn pin_window_to_bottom(hwnd: isize) {
        unsafe {
            SetWindowPos(
                hwnd as HWND,
                1 as HWND, // HWND_BOTTOM
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | 0x0010 | SWP_SHOWWINDOW, // 0x0010 = SWP_NOACTIVATE
            );
        }
    }

    /// Restore window to normal z-order (top of its layer).
    pub fn unpin_window_from_bottom(hwnd: isize) {
        unsafe {
            SetWindowPos(
                hwnd as HWND,
                std::ptr::null_mut(), // HWND_TOP
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | 0x0010 | SWP_SHOWWINDOW, // 0x0010 = SWP_NOACTIVATE
            );
        }
    }
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn embed_widget_to_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("widget")
        .ok_or("小组件窗口不存在，请先打开小组件")?;

    if !win.is_visible().unwrap_or(false) {
        win.show().map_err(|e| e.to_string())?;
    }

    // Remove topmost so the window can live in the normal desktop layer.
    win.set_always_on_top(false).map_err(|e| e.to_string())?;

    let hwnd = win.hwnd().map_err(|e| e.to_string())?;

    // Windows 10/11: cross-process SetParent into Explorer's WorkerW breaks
    // WebView2 rendering and clips the window to WorkerW's tiny 262x71 rect.
    // Instead, keep the window as a popup and pin it to the bottom of the
    // z-order so it stays behind all other apps (desktop-widget behaviour).
    win_desktop::pin_window_to_bottom(hwnd.0 as isize);

    // Keep the window at the bottom of the z-order every 2s so it does not
    // get pushed above normal apps when the user interacts with the desktop.
    PINNED_BOTTOM.store(true, Ordering::SeqCst);
    let win_clone = win.clone();
    tauri::async_runtime::spawn(async move {
        while PINNED_BOTTOM.load(Ordering::SeqCst) {
            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
            if let Ok(hwnd) = win_clone.hwnd() {
                win_desktop::pin_window_to_bottom(hwnd.0 as isize);
            }
        }
    });

    eprintln!("[Widget] pinned to bottom (desktop layer)");
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn unpin_widget_from_desktop(app: tauri::AppHandle) -> Result<(), String> {
    PINNED_BOTTOM.store(false, Ordering::SeqCst);

    let win = app
        .get_webview_window("widget")
        .ok_or("小组件窗口不存在")?;

    let hwnd = win.hwnd().map_err(|e| e.to_string())?;
    win_desktop::unpin_window_from_bottom(hwnd.0 as isize);

    // Restore topmost so the widget floats above normal windows again.
    win.set_always_on_top(true).map_err(|e| e.to_string())?;

    eprintln!("[Widget] unpinned from bottom");
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
