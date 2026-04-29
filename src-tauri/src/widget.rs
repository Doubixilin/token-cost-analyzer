use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

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

#[tauri::command]
pub fn toggle_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("widget") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    } else {
        // 加载配置以恢复窗口尺寸和位置
        let config = load_config_from_disk(&app);
        let (w, h) = (config.width, config.height);

        let mut builder = WebviewWindowBuilder::new(&app, "widget", WebviewUrl::App("widget.html".into()))
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
            .visible(true);

        if let (Some(x), Some(y)) = (config.x, config.y) {
            builder = builder.position(x, y);
        }

        // Windows Acrylic 毛玻璃特效
        #[cfg(target_os = "windows")]
        {
            builder = builder.effects(tauri::utils::config::WindowEffectsConfig {
                effects: vec![tauri::utils::WindowEffect::Acrylic],
                state: Some(tauri::utils::WindowEffectState::Active),
                radius: Some(14.0),
                color: Some(tauri::utils::config::Color(0, 0, 0, 0)),
            });
        }

        let _widget = builder
            .build()
            .map_err(|e| format!("创建小组件窗口失败: {}", e))?;
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
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_widget_config(app: tauri::AppHandle) -> Result<WidgetConfig, String> {
    Ok(load_config_from_disk(&app))
}

fn load_config_from_disk(app: &tauri::AppHandle) -> WidgetConfig {
    match config_path(app) {
        Ok(path) if path.exists() => {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        }
        _ => WidgetConfig::default(),
    }
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
            let name = CStr::from_bytes_until_nul(&class_name[..len as usize])
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
