use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};

use crate::db::queries;
use crate::models::{FilterParams, OverviewStats};
use crate::AppState;

/// Build a FilterParams for "today" (start of day to end of day)
fn today_filters() -> FilterParams {
    let now = chrono::Local::now();
    let today_start = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(chrono::Local)
        .unwrap()
        .timestamp() as f64;
    let today_end = now
        .date_naive()
        .and_hms_opt(23, 59, 59)
        .unwrap()
        .and_local_timezone(chrono::Local)
        .unwrap()
        .timestamp() as f64;
    FilterParams {
        start_time: Some(today_start),
        end_time: Some(today_end),
        sources: None,
        models: None,
        projects: None,
        agent_types: None,
    }
}

/// Format token count for display (e.g. 1234567 -> "1.2M")
fn fmt_tokens(n: i64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}k", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

/// Query today's and all-time stats from the database
fn query_stats(conn: &rusqlite::Connection) -> (OverviewStats, OverviewStats) {
    let empty = FilterParams {
        start_time: None,
        end_time: None,
        sources: None,
        models: None,
        projects: None,
        agent_types: None,
    };
    let today = queries::get_overview_stats(conn, &today_filters()).unwrap_or(OverviewStats {
        total_requests: 0,
        total_cost: 0.0,
        total_tokens: 0,
        total_input: 0,
        total_output: 0,
        total_cache_read: 0,
        total_cache_creation: 0,
        currency: "USD".to_string(),
    });
    let total = queries::get_overview_stats(conn, &empty).unwrap_or(OverviewStats {
        total_requests: 0,
        total_cost: 0.0,
        total_tokens: 0,
        total_input: 0,
        total_output: 0,
        total_cache_read: 0,
        total_cache_creation: 0,
        currency: "USD".to_string(),
    });
    (today, total)
}

/// Build the tray context menu with current stats
fn build_menu(app: &AppHandle, today: &OverviewStats, total: &OverviewStats) -> Menu<Wry> {
    use tauri::Wry;

    // Today's stats
    let today_cost = MenuItem::with_id(
        app,
        "today_cost",
        format!("  今日成本: ${:.2}", today.total_cost),
        false,
        None::<&str>,
    )
    .unwrap();
    let today_tokens = MenuItem::with_id(
        app,
        "today_tokens",
        format!("  今日 Token: {}", fmt_tokens(today.total_tokens)),
        false,
        None::<&str>,
    )
    .unwrap();
    let today_requests = MenuItem::with_id(
        app,
        "today_requests",
        format!("  今日请求数: {}", today.total_requests),
        false,
        None::<&str>,
    )
    .unwrap();

    let sep1 = PredefinedMenuItem::separator(app).unwrap();

    // Total stats
    let total_cost = MenuItem::with_id(
        app,
        "total_cost",
        format!("  总计成本: ${:.2}", total.total_cost),
        false,
        None::<&str>,
    )
    .unwrap();
    let total_tokens = MenuItem::with_id(
        app,
        "total_tokens",
        format!("  总计 Token: {}", fmt_tokens(total.total_tokens)),
        false,
        None::<&str>,
    )
    .unwrap();

    let sep2 = PredefinedMenuItem::separator(app).unwrap();

    // Actions
    let refresh = MenuItem::with_id(app, "refresh", "刷新数据", true, None::<&str>).unwrap();
    let show_window =
        MenuItem::with_id(app, "show_window", "打开主窗口", true, None::<&str>).unwrap();
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>).unwrap();

    Menu::with_items(
        app,
        &[
            &today_cost as &dyn tauri::menu::IsMenuItem<Wry>,
            &today_tokens,
            &today_requests,
            &sep1,
            &total_cost,
            &total_tokens,
            &sep2,
            &refresh,
            &show_window,
            &quit,
        ],
    )
    .unwrap()
}

/// Update tray title and menu with current stats
fn update_tray_display(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };

    let state = app.state::<AppState>();
    let stats = {
        let guard = state.db.lock();
        match guard {
            Ok(conn) => query_stats(&conn),
            Err(_) => return,
        }
    };

    let (today, _total) = &stats;

    // Update menu bar title (shows next to the icon)
    let _ = tray.set_title(Some(&format!("${:.2}", today.total_cost)));

    // Update context menu
    let menu = build_menu(app, &stats.0, &stats.1);
    let _ = tray.set_menu(Some(menu));
}

/// Create the system tray icon and set up event handlers
pub fn create_tray(app: &AppHandle) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let menu = {
        let state = app.state::<AppState>();
        let conn = state.db.lock().map_err(|e| format!("lock: {}", e))?;
        let (today, total) = query_stats(&conn);
        build_menu(app, &today, &total)
    };

    // Load tray icon (22x22 template image for macOS menu bar)
    let icon = if let Some(icon) = app.default_window_icon() {
        icon.clone()
    } else {
        return Err("no default icon available".into());
    };

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true) // macOS: auto-adapt to dark/light mode
        .tooltip("Token Cost Analyzer")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "refresh" => {
                let app = app.clone();
                std::thread::spawn(move || {
                    let state = app.state::<AppState>();
                    let Ok(mut conn) = state.db.lock() else {
                        return;
                    };
                    let _ = crate::sync::recalc_costs(&mut conn);
                    drop(conn);
                    update_tray_display(&app);
                });
            }
            "show_window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // On macOS, menu_on_left_click handles the menu.
                // This handler is for potential future use (e.g., toggle window).
                let _ = tray;
            }
        })
        .build(app)?;

    // Set initial title from today's stats
    let state = app.state::<AppState>();
    if let Ok(conn) = state.db.lock() {
        let (today, _) = query_stats(&conn);
        let _ = tray.set_title(Some(&format!("${:.2}", today.total_cost)));
    }

    Ok(tray)
}

/// Spawn a background task that updates the tray every 60 seconds
pub fn spawn_tray_updater(app: AppHandle) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            update_tray_display(&app);
        }
    });
}
