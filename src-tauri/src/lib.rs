pub mod db;
pub mod models;
pub mod parsers;
pub mod sync;

use std::sync::Mutex;
use tauri::Manager;

use crate::db::queries;
use crate::models::*;
use crate::sync::{sync_all_data, recalc_costs};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[tauri::command]
fn get_overview_stats(state: tauri::State<AppState>, filters: FilterParams) -> Result<OverviewStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_overview_stats(&conn, &filters).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_trend_data(state: tauri::State<AppState>, filters: FilterParams, granularity: String) -> Result<Vec<TrendPoint>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_trend_data(&conn, &filters, &granularity).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_distribution(state: tauri::State<AppState>, filters: FilterParams, dimension: String) -> Result<Vec<DistributionItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_distribution(&conn, &filters, &dimension).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_list(state: tauri::State<AppState>, filters: FilterParams, limit: i64, offset: i64) -> Result<Vec<SessionSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_session_list(&conn, &filters, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_detail(state: tauri::State<AppState>, session_id: String) -> Result<Vec<TokenRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_session_detail(&conn, &session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_top_n(state: tauri::State<AppState>, filters: FilterParams, dimension: String, metric: String, limit: i64) -> Result<Vec<TopNItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_top_n(&conn, &filters, &dimension, &metric, limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_heatmap_data(state: tauri::State<AppState>, filters: FilterParams, year: i32) -> Result<Vec<HeatmapPoint>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_heatmap_data(&conn, &filters, year).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_filter_options(state: tauri::State<AppState>) -> Result<(Vec<String>, Vec<String>, Vec<String>), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_filter_options(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn refresh_data(state: tauri::State<AppState>) -> Result<usize, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    let count = sync_all_data(&mut conn).map_err(|e| e.to_string())?;
    recalc_costs(&mut conn).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
fn get_model_pricing(state: tauri::State<AppState>) -> Result<Vec<ModelPricing>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_model_pricing(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_model_pricing(state: tauri::State<AppState>, pricing: ModelPricing) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::set_model_pricing(&conn, &pricing).map_err(|e| e.to_string())?;
    recalc_costs(&mut conn).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = db::init_db(&app.handle()).map_err(|e| e.to_string())?;
            app.manage(AppState { db: Mutex::new(conn) });
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
