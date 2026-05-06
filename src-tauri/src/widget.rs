use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

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
    pub background_mode: String,
    pub background_opacity: f64,
    pub resizable: bool,
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
            background_mode: "solid".into(),
            background_opacity: 0.88,
            resizable: false,
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

const MIN_WIDGET_WIDTH: f64 = 240.0;
const MAX_WIDGET_WIDTH: f64 = 420.0;
const MIN_WIDGET_HEIGHT: f64 = 200.0;
const MAX_WIDGET_HEIGHT: f64 = 600.0;
const MAX_ABS_WIDGET_POSITION: f64 = 10000.0;
const MIN_BACKGROUND_OPACITY: f64 = 0.25;
const MAX_BACKGROUND_OPACITY: f64 = 1.0;
const MIN_REFRESH_INTERVAL_SEC: u32 = 5;
const DEFAULT_POSITION_MARGIN: f64 = 20.0;
const ALLOWED_MODULES: &[&str] = &[
    "overview",
    "trend",
    "source_split",
    "model_dist",
    "hourly_dist",
    "top_projects",
];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WidgetPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WidgetRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn normalize_widget_config(mut config: WidgetConfig) -> WidgetConfig {
    let defaults = WidgetConfig::default();

    if !config.width.is_finite()
        || config.width < MIN_WIDGET_WIDTH
        || config.width > MAX_WIDGET_WIDTH
    {
        config.width = defaults.width;
    }

    if !config.height.is_finite()
        || config.height < MIN_WIDGET_HEIGHT
        || config.height > MAX_WIDGET_HEIGHT
    {
        config.height = defaults.height;
    }

    if config.refresh_interval_sec > 0 && config.refresh_interval_sec < MIN_REFRESH_INTERVAL_SEC {
        config.refresh_interval_sec = MIN_REFRESH_INTERVAL_SEC;
    }

    if !config.background_opacity.is_finite() {
        config.background_opacity = defaults.background_opacity;
    }
    config.background_opacity = config
        .background_opacity
        .clamp(MIN_BACKGROUND_OPACITY, MAX_BACKGROUND_OPACITY);

    match (config.x, config.y) {
        (Some(x), Some(y))
            if x.is_finite()
                && y.is_finite()
                && x.abs() <= MAX_ABS_WIDGET_POSITION
                && y.abs() <= MAX_ABS_WIDGET_POSITION => {}
        _ => {
            config.x = None;
            config.y = None;
        }
    }

    config
        .selected_modules
        .retain(|module| ALLOWED_MODULES.contains(&module.as_str()));
    if config.selected_modules.is_empty() {
        config.selected_modules = vec!["overview".into()];
    }

    if !matches!(config.layout.as_str(), "vertical" | "grid") {
        config.layout = defaults.layout;
    }
    if !matches!(config.background_mode.as_str(), "solid" | "glass") {
        config.background_mode = defaults.background_mode;
    }
    if !matches!(config.theme.as_str(), "auto" | "light" | "dark") {
        config.theme = defaults.theme;
    }
    if !matches!(config.time_period.as_str(), "today" | "7d" | "30d" | "all") {
        config.time_period = defaults.time_period;
    }

    config
}

pub fn merge_widget_config_for_save(
    mut incoming: WidgetConfig,
    existing: Option<&WidgetConfig>,
    preserve_position: bool,
) -> WidgetConfig {
    if preserve_position {
        if let Some(existing) = existing {
            incoming.x = existing.x;
            incoming.y = existing.y;
        }
    }

    normalize_widget_config(incoming)
}

pub fn clamp_widget_position_to_monitor(
    position: WidgetPosition,
    width: f64,
    height: f64,
    monitor: WidgetRect,
) -> WidgetPosition {
    let min_x = monitor.x + DEFAULT_POSITION_MARGIN;
    let min_y = monitor.y + DEFAULT_POSITION_MARGIN;
    let max_x = (monitor.x + monitor.width - width - DEFAULT_POSITION_MARGIN).max(min_x);
    let max_y = (monitor.y + monitor.height - height - DEFAULT_POSITION_MARGIN).max(min_y);

    WidgetPosition {
        x: position.x.clamp(min_x, max_x),
        y: position.y.clamp(min_y, max_y),
    }
}

pub fn should_apply_native_widget_config(current: &WidgetConfig, next: &WidgetConfig) -> bool {
    let current = normalize_widget_config(current.clone());
    let next = normalize_widget_config(next.clone());

    (current.width - next.width).abs() > f64::EPSILON
        || (current.height - next.height).abs() > f64::EPSILON
        || current.x != next.x
        || current.y != next.y
        || current.resizable != next.resizable
        || current.pinned_to_desktop != next.pinned_to_desktop
}

fn monitor_rect(monitor: &tauri::Monitor) -> WidgetRect {
    let pos = monitor.position();
    let size = monitor.size();
    WidgetRect {
        x: pos.x as f64,
        y: pos.y as f64,
        width: size.width as f64,
        height: size.height as f64,
    }
}

fn default_widget_position(app: &tauri::AppHandle, width: f64, height: f64) -> Option<WidgetPosition> {
    let main_win = app.get_webview_window("main")?;
    let candidate = main_win
        .outer_position()
        .ok()
        .map(|pos| {
            let x = main_win
                .inner_size()
                .ok()
                .map(|size| pos.x as f64 + size.width as f64 + DEFAULT_POSITION_MARGIN)
                .unwrap_or(pos.x as f64 + 1420.0);
            WidgetPosition {
                x,
                y: pos.y as f64,
            }
        })?;

    let monitor = main_win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| main_win.primary_monitor().ok().flatten());

    monitor
        .as_ref()
        .map(|monitor| clamp_widget_position_to_monitor(candidate, width, height, monitor_rect(monitor)))
        .or(Some(candidate))
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
    let config = normalize_widget_config(load_config_from_disk(app));
    let w = config.width;
    let h = config.height;
    eprintln!("[Widget] Size: {}x{} (raw config: {}x{})", w, h, config.width, config.height);

    // In dev mode, use the devUrl directly to avoid Tauri's asset protocol
    // falling back to index.html for non-root HTML paths.
    // In production, use the asset protocol via WebviewUrl::App.
    let widget_url = if cfg!(dev) { match &app.config().build.dev_url {
        Some(dev_url) => {
            let base = dev_url.as_str().trim_end_matches('/');
            let url: url::Url = format!("{}/widget.html", base)
                .parse()
                .map_err(|e| format!("无效的小组件 URL: {}", e))?;
            WebviewUrl::External(url)
        }
        None => WebviewUrl::App("widget.html".into()),
    }} else {
        WebviewUrl::App("widget.html".into())
    };

    let mut builder = WebviewWindowBuilder::new(app, "widget", widget_url)
        .title("Token Widget")
        .inner_size(w, h)
        .decorations(false)
        .transparent(true)
        .always_on_top(!config.pinned_to_desktop)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .visible(false);
    builder = if config.resizable {
        builder
            .min_inner_size(MIN_WIDGET_WIDTH, MIN_WIDGET_HEIGHT)
            .max_inner_size(MAX_WIDGET_WIDTH, MAX_WIDGET_HEIGHT)
            .resizable(true)
    } else {
        builder
            .min_inner_size(w, h)
            .max_inner_size(w, h)
            .resizable(false)
    };

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
    if let (Some(x), Some(y)) = (config.x, config.y) {
        let _ = widget_win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    } else if let Some(pos) = default_widget_position(app, w, h) {
        let _ = widget_win.set_position(PhysicalPosition::new(pos.x.round() as i32, pos.y.round() as i32));
    }

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
                    if (MIN_WIDGET_WIDTH..=MAX_WIDGET_WIDTH).contains(&w)
                        && (MIN_WIDGET_HEIGHT..=MAX_WIDGET_HEIGHT).contains(&h)
                    {
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
        let config = load_widget_config(app.clone())?;
        apply_widget_config_to_existing_window(&app, &config, true)?;
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
pub fn save_widget_config(
    app: tauri::AppHandle,
    config: WidgetConfig,
    preserve_position: Option<bool>,
) -> Result<(), String> {
    let existing = load_config_from_disk(&app);
    let mut existing_for_merge = existing.clone();
    if preserve_position.unwrap_or(true) && existing_for_merge.x.is_none() && existing_for_merge.y.is_none() {
        if let Some(win) = app.get_webview_window("widget") {
            if win.is_visible().unwrap_or(false) {
                if let Ok(pos) = win.outer_position() {
                    existing_for_merge.x = Some(pos.x as f64);
                    existing_for_merge.y = Some(pos.y as f64);
                }
            }
        }
    }
    let config = merge_widget_config_for_save(
        config,
        Some(&existing_for_merge),
        preserve_position.unwrap_or(true),
    );
    save_widget_config_internal(&app, &config)?;
    if should_apply_native_widget_config(&existing, &config) {
        apply_widget_config_to_existing_window(&app, &config, false)?;
    }
    // Notify widget window to reload config
    let _ = app.emit("widget-config-changed", &config);
    Ok(())
}

#[tauri::command]
pub fn load_widget_config(app: tauri::AppHandle) -> Result<WidgetConfig, String> {
    Ok(normalize_widget_config(load_config_from_disk(&app)))
}

fn load_config_from_disk(app: &tauri::AppHandle) -> WidgetConfig {
    match config_path(app) {
        Ok(path) if path.exists() => {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str(&content) {
                    Ok(config) => normalize_widget_config(config),
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
    let config = normalize_widget_config(config.clone());
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn apply_widget_config_to_existing_window(
    app: &tauri::AppHandle,
    config: &WidgetConfig,
    show_if_hidden: bool,
) -> Result<(), String> {
    let Some(win) = app.get_webview_window("widget") else {
        return Ok(());
    };

    let was_hidden = !win.is_visible().unwrap_or(false);
    if show_if_hidden && was_hidden {
        win.show().map_err(|e| e.to_string())?;
    }

    win.set_size(tauri::LogicalSize::new(config.width, config.height))
        .map_err(|e| e.to_string())?;
    if config.resizable {
        let _ = win.set_min_size(Some(tauri::LogicalSize::new(
            MIN_WIDGET_WIDTH,
            MIN_WIDGET_HEIGHT,
        )));
        let _ = win.set_max_size(Some(tauri::LogicalSize::new(
            MAX_WIDGET_WIDTH,
            MAX_WIDGET_HEIGHT,
        )));
        let _ = win.set_resizable(true);
    } else {
        let logical_size = tauri::LogicalSize::new(config.width, config.height);
        let _ = win.set_min_size(Some(logical_size));
        let _ = win.set_max_size(Some(logical_size));
        let _ = win.set_resizable(false);
    }

    if let (Some(x), Some(y)) = (config.x, config.y) {
        if x.is_finite() && y.is_finite() {
            let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
        }
    } else if show_if_hidden && was_hidden {
        if let Some(pos) = default_widget_position(app, config.width, config.height) {
            let _ = win.set_position(PhysicalPosition::new(pos.x.round() as i32, pos.y.round() as i32));
        }
    }

    if win.is_visible().unwrap_or(false) || !config.pinned_to_desktop {
        apply_widget_desktop_mode(&win, config.pinned_to_desktop)?;
    }

    win.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
    Ok(())
}

// --- Windows 桌面钉入 ---
#[cfg(target_os = "windows")]
#[allow(dead_code)]
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

#[cfg(target_os = "windows")]
fn apply_widget_desktop_mode(win: &WebviewWindow, pinned: bool) -> Result<(), String> {
    if pinned {
        win.set_always_on_top(false).map_err(|e| e.to_string())?;
        let hwnd = win.hwnd().map_err(|e| e.to_string())?;
        win_desktop::pin_window_to_bottom(hwnd.0 as isize);

        if PINNED_BOTTOM
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            let win_clone = win.clone();
            tauri::async_runtime::spawn(async move {
                while PINNED_BOTTOM.load(Ordering::SeqCst) {
                    tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
                    if let Ok(hwnd) = win_clone.hwnd() {
                        win_desktop::pin_window_to_bottom(hwnd.0 as isize);
                    }
                }
            });
        }
    } else {
        PINNED_BOTTOM.store(false, Ordering::SeqCst);
        let hwnd = win.hwnd().map_err(|e| e.to_string())?;
        win_desktop::unpin_window_from_bottom(hwnd.0 as isize);
        win.set_always_on_top(true).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn apply_widget_desktop_mode(win: &WebviewWindow, pinned: bool) -> Result<(), String> {
    win.set_always_on_top(!pinned).map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn embed_widget_to_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let _win = app
        .get_webview_window("widget")
        .ok_or("小组件窗口不存在，请先打开小组件")?;

    let mut config = load_widget_config(app.clone())?;
    config.pinned_to_desktop = true;
    save_widget_config_internal(&app, &config)?;
    apply_widget_config_to_existing_window(&app, &config, true)?;

    eprintln!("[Widget] pinned to bottom (desktop layer)");
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn unpin_widget_from_desktop(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("widget")
        .ok_or("小组件窗口不存在")?;

    let mut config = load_widget_config(app.clone())?;
    config.pinned_to_desktop = false;
    save_widget_config_internal(&app, &config)?;
    apply_widget_desktop_mode(&win, false)?;

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
