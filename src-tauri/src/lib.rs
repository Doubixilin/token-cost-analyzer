pub mod db;
pub mod models;
pub mod parsers;
pub mod sync;
pub mod tray;

use std::sync::Mutex;
use tauri::Manager;

use crate::db::queries;
use crate::models::*;
use crate::sync::{parse_all_records, insert_parsed_records, recalc_costs};

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
    if limit <= 0 || offset < 0 {
        return Err("limit must be > 0 and offset must be >= 0".to_string());
    }
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
    // Parse files outside the lock (expensive I/O)
    let parsed = parse_all_records().map_err(|e| e.to_string())?;
    // Acquire lock only for DB insert (fast)
    let mut conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    let count = insert_parsed_records(&mut conn, &parsed).map_err(|e| e.to_string())?;
    recalc_costs(&mut conn).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
fn get_model_pricing(state: tauri::State<AppState>) -> Result<Vec<ModelPricing>, String> {
    let conn = state.db.lock().map_err(|e| format!("数据库锁中毒: {}", e))?;
    queries::get_model_pricing(&conn).map_err(|e| e.to_string())
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
    if records.len() > 100_000 {
        return Err(format!("导出数据量过大 ({} 条记录)，请缩小筛选范围后重试", records.len()));
    }
    
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
        .setup(|app| {
            let conn = db::init_db(&app.handle()).map_err(|e| e.to_string())?;
            app.manage(AppState { db: Mutex::new(conn) });

            // Create system tray
            tray::create_tray(app.handle()).map_err(|e| e.to_string())?;

            // Hide window on close instead of quitting
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            // Start background tray updater (every 60s)
            tray::spawn_tray_updater(app.handle().clone());

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
