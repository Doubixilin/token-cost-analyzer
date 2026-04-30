use rusqlite::Connection;
use std::path::PathBuf;
use tauri::Manager;

pub mod queries;
pub mod schema;

pub fn get_db_path(app_handle: &tauri::AppHandle) -> std::result::Result<PathBuf, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("无法创建数据目录: {}", e))?;
    Ok(app_dir.join("token_analyzer.db"))
}

pub fn init_db(app_handle: &tauri::AppHandle) -> std::result::Result<Connection, String> {
    let db_path = get_db_path(app_handle)?;
    eprintln!("[db] Opening database at {:?}", db_path);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;").map_err(|e| e.to_string())?;
    schema::create_tables(&conn).map_err(|e| e.to_string())?;
    schema::init_default_pricing(&conn).map_err(|e| e.to_string())?;
    eprintln!("[db] Database initialized successfully");
    Ok(conn)
}
