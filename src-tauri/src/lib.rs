pub mod db;
pub mod models;
pub mod parsers;
pub mod sync;
pub mod tray;
pub mod widget;

use std::sync::Mutex;
use tauri::Manager;

use crate::db::queries;
use crate::models::*;
use crate::sync::{scan_session_files, get_file_sync_state, parse_changed_files, insert_and_update_sync, recalc_costs};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[tauri::command]
fn get_overview_stats(state: tauri::State<AppState>, filters: FilterParams) -> Result<OverviewStats, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_overview_stats(&conn, &filters).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_trend_data(state: tauri::State<AppState>, filters: FilterParams, granularity: String) -> Result<Vec<TrendPoint>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_trend_data(&conn, &filters, &granularity).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_distribution(state: tauri::State<AppState>, filters: FilterParams, dimension: String) -> Result<Vec<DistributionItem>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_distribution(&conn, &filters, &dimension).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_list(state: tauri::State<AppState>, filters: FilterParams, limit: i64, offset: i64) -> Result<Vec<SessionSummary>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_session_list(&conn, &filters, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_detail(state: tauri::State<AppState>, session_id: String) -> Result<Vec<TokenRecord>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_session_detail(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_top_n(state: tauri::State<AppState>, filters: FilterParams, dimension: String, metric: String, limit: i64) -> Result<Vec<TopNItem>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_top_n(&conn, &filters, &dimension, &metric, limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_heatmap_data(state: tauri::State<AppState>, filters: FilterParams, year: i32) -> Result<Vec<HeatmapPoint>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_heatmap_data(&conn, &filters, year).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_filter_options(state: tauri::State<AppState>) -> Result<(Vec<String>, Vec<String>, Vec<String>), String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_filter_options(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn refresh_data(state: tauri::State<AppState>) -> Result<usize, String> {
    eprintln!("[sync] Step 1: Scanning session files...");
    let files = scan_session_files();
    eprintln!("[sync] Found {} session files", files.len());
    let prev_state = {
        let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
        get_file_sync_state(&conn).unwrap_or_else(|_| std::collections::HashMap::new())
    };
    eprintln!("[sync] Previous sync state has {} entries", prev_state.len());

    // Step 2: Parse only changed files (outside lock)
    let mut progress = |phase: &str, current: usize, total: usize| {
        println!("[{}] Progress: {}/{}", phase, current, total);
    };
    eprintln!("[sync] Step 2: Parsing changed files...");
    let (records, changed_paths) = parse_changed_files(&files, &prev_state, &mut progress);
    eprintln!("[sync] Parsed {} records from {} changed files", records.len(), changed_paths.len());

    // Step 3: Insert and update sync state (inside lock)
    eprintln!("[sync] Step 3: Acquiring DB lock...");
    let mut conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    eprintln!("[sync] DB lock acquired, inserting records...");
    let current_paths: Vec<String> = files.iter()
        .filter_map(|(p, _, _)| p.to_str().map(|s| s.to_string()))
        .collect();
    let file_mtimes: Vec<(String, f64)> = files.iter()
        .filter(|(p, _, _)| changed_paths.contains(&p.to_str().unwrap_or("").to_string()))
        .map(|(p, m, _)| (p.to_str().unwrap_or("").to_string(), *m))
        .collect();

    let count = insert_and_update_sync(&mut conn, &records, &changed_paths, &file_mtimes, &current_paths)
        .map_err(|e| e.to_string())?;
    eprintln!("[sync] Inserted {} records, recalculating costs...", count);
    recalc_costs(&mut conn).map_err(|e| e.to_string())?;
    eprintln!("[sync] Done! {} records inserted", count);
    Ok(count)
}

#[tauri::command]
fn get_model_pricing(state: tauri::State<AppState>) -> Result<Vec<ModelPricing>, String> {
    eprintln!("[pricing] Fetching model pricing...");
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    let result = queries::get_model_pricing(&conn).map_err(|e| e.to_string())?;
    eprintln!("[pricing] Got {} models", result.len());
    Ok(result)
}

#[tauri::command]
fn set_model_pricing(state: tauri::State<AppState>, pricing: ModelPricing) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::set_model_pricing(&conn, &pricing).map_err(|e| e.to_string())?;
    recalc_costs(&mut conn).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn export_data(state: tauri::State<AppState>, filters: FilterParams, format: String) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    let records = queries::get_all_records_for_export(&conn, &filters).map_err(|e| e.to_string())?;
    
    match format.as_str() {
        "csv" => {
            let mut wtr = csv::Writer::from_writer(vec![]);
            wtr.write_record(["source", "session_id", "agent_type", "agent_id", "timestamp", "model", "input_tokens", "output_tokens", "cache_read_tokens", "cache_creation_tokens", "project_path", "message_id", "cost_estimate"])
                .map_err(|e| e.to_string())?;
            for r in &records {
                wtr.write_record(&[
                    r.source.clone(),
                    r.session_id.clone(),
                    r.agent_type.clone(),
                    r.agent_id.clone().unwrap_or_default(),
                    r.timestamp.to_string(),
                    r.model.clone().unwrap_or_default(),
                    r.input_tokens.to_string(),
                    r.output_tokens.to_string(),
                    r.cache_read_tokens.to_string(),
                    r.cache_creation_tokens.to_string(),
                    r.project_path.clone().unwrap_or_default(),
                    r.message_id.clone().unwrap_or_default(),
                    format!("{:.6}", r.cost_estimate),
                ])
                .map_err(|e| e.to_string())?;
            }
            wtr.flush().map_err(|e| e.to_string())?;
            String::from_utf8(wtr.into_inner().map_err(|e| e.to_string())?).map_err(|e| e.to_string())
        }
        "json" => serde_json::to_string(&records).map_err(|e| e.to_string()),
        _ => Err("unsupported format, use 'csv' or 'json'".to_string()),
    }
}

#[tauri::command]
fn get_hourly_distribution(state: tauri::State<AppState>, filters: FilterParams) -> Result<Vec<HourlyPoint>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_hourly_distribution(&conn, &filters).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_model_trend(state: tauri::State<AppState>, filters: FilterParams) -> Result<Vec<ModelTrendPoint>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_model_trend(&conn, &filters).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_cumulative_cost(state: tauri::State<AppState>, filters: FilterParams) -> Result<Vec<CumulativePoint>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_cumulative_cost(&conn, &filters).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_scatter_data(state: tauri::State<AppState>, filters: FilterParams, limit: i64) -> Result<Vec<ScatterPoint>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_scatter_data(&conn, &filters, limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sankey_data(state: tauri::State<AppState>, filters: FilterParams) -> Result<Vec<(String, String, i64)>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_sankey_data(&conn, &filters).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["widget"]).build())
        .setup(|app| {
            let conn = db::init_db(&app.handle()).map_err(|e| e.to_string())?;
            app.manage(AppState { db: Mutex::new(conn) });

            // 初始化系统托盘
            tray::setup_tray(app.handle()).map_err(|e| e.to_string())?;

            // 主窗口关闭时隐藏到托盘而非退出
            if let Some(main_win) = app.get_webview_window("main") {
                let win_clone = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            // 预创建小组件窗口（必须在主线程，setup 是主线程）
            if let Err(e) = widget::precreate_widget(app.handle()) {
                eprintln!("[Widget] Precreate failed: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_overview_stats,
            get_trend_data,
            get_distribution,
            get_session_list,
            get_session_detail,
            get_top_n,
            get_heatmap_data,
            get_filter_options,
            refresh_data,
            get_model_pricing,
            set_model_pricing,
            export_data,
            get_hourly_distribution,
            get_model_trend,
            get_cumulative_cost,
            get_scatter_data,
            get_sankey_data,
            widget::toggle_widget,
            widget::set_widget_ignore_cursor,
            widget::save_widget_config,
            widget::load_widget_config,
            widget::embed_widget_to_desktop,
            widget::unpin_widget_from_desktop,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("应用运行失败: {}", e);
        });
}
