use rusqlite::{Connection, Result};
use std::path::PathBuf;
use tauri::Manager;

pub mod queries;
pub mod schema;

pub fn get_db_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    std::fs::create_dir_all(&app_dir).unwrap();
    app_dir.join("token_analyzer.db")
}

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection> {
    let db_path = get_db_path(app_handle);
    let conn = Connection::open(&db_path)?;
    schema::create_tables(&conn)?;
    schema::init_default_pricing(&conn)?;
    Ok(conn)
}

pub fn get_connection(app_handle: &tauri::AppHandle) -> Result<Connection> {
    let db_path = get_db_path(app_handle);
    Connection::open(&db_path)
}
