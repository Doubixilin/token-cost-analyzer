use rusqlite::{Connection, Result};

pub fn create_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS token_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            session_id TEXT NOT NULL,
            agent_type TEXT NOT NULL,
            agent_id TEXT,
            timestamp REAL NOT NULL,
            model TEXT,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            cache_read_tokens INTEGER DEFAULT 0,
            cache_creation_tokens INTEGER DEFAULT 0,
            project_path TEXT,
            message_id TEXT,
            cost_estimate REAL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_token_records_session ON token_records(session_id);
        CREATE INDEX IF NOT EXISTS idx_token_records_timestamp ON token_records(timestamp);
        CREATE INDEX IF NOT EXISTS idx_token_records_source ON token_records(source);
        CREATE INDEX IF NOT EXISTS idx_token_records_model ON token_records(model);

        CREATE TABLE IF NOT EXISTS session_summary (
            session_id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            project_path TEXT,
            start_time REAL,
            end_time REAL,
            total_input INTEGER DEFAULT 0,
            total_output INTEGER DEFAULT 0,
            total_cache_read INTEGER DEFAULT 0,
            total_cache_creation INTEGER DEFAULT 0,
            total_cost REAL DEFAULT 0,
            message_count INTEGER DEFAULT 0,
            agent_count INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_session_source ON session_summary(source);
        CREATE INDEX IF NOT EXISTS idx_session_time ON session_summary(start_time);

        CREATE TABLE IF NOT EXISTS model_pricing (
            model TEXT PRIMARY KEY,
            input_price REAL DEFAULT 0,
            output_price REAL DEFAULT 0,
            cache_read_price REAL DEFAULT 0,
            cache_creation_price REAL DEFAULT 0,
            currency TEXT DEFAULT 'USD'
        );

        CREATE TABLE IF NOT EXISTS sync_state (
            source TEXT PRIMARY KEY,
            last_scan_time REAL,
            last_record_count INTEGER
        );

        CREATE TABLE IF NOT EXISTS project_aliases (
            md5_hash TEXT PRIMARY KEY,
            project_path TEXT,
            alias TEXT
        );
        "#,
    )?;
    Ok(())
}

pub fn init_default_pricing(conn: &Connection) -> Result<()> {
    let defaults = vec![
        ("claude-sonnet-4-6", 3.0, 15.0, 0.3, 3.75),
        ("claude-3-7-sonnet", 3.0, 15.0, 0.3, 3.75),
        ("claude-3-5-sonnet", 3.0, 15.0, 0.3, 3.75),
        ("claude-3-opus", 15.0, 75.0, 1.5, 18.75),
        ("claude-3-haiku", 0.25, 1.25, 0.03, 0.3),
        ("gpt-4o", 2.5, 10.0, 1.25, 2.5),
        ("gpt-4o-mini", 0.15, 0.6, 0.075, 0.15),
        ("o1", 15.0, 60.0, 7.5, 15.0),
        ("o3-mini", 1.1, 4.4, 0.55, 1.1),
        ("kimi-k1.5", 2.0, 8.0, 0.2, 2.0),
        ("kimi-k2", 2.0, 8.0, 0.2, 2.0),
        ("unknown", 2.0, 8.0, 0.2, 2.0),
    ];

    for (model, input, output, cache_read, cache_creation) in defaults {
        conn.execute(
            "INSERT OR IGNORE INTO model_pricing (model, input_price, output_price, cache_read_price, cache_creation_price, currency) VALUES (?1, ?2, ?3, ?4, ?5, 'USD')",
            rusqlite::params![model, input, output, cache_read, cache_creation],
        )?;
    }
    Ok(())
}
