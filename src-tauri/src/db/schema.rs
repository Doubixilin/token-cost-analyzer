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
            file_path TEXT PRIMARY KEY,
            last_modified REAL NOT NULL,
            record_count INTEGER DEFAULT 0
        );
        "#,
    )?;

    // Migrate: sync_state table schema changed from (source, last_scan_time, last_record_count)
    // to (file_path, last_modified, record_count). Drop and recreate if old schema detected.
    let has_old_schema: bool = conn.query_row(
        "SELECT 1 FROM pragma_table_info('sync_state') WHERE name = 'source'",
        [],
        |_| Ok(true),
    ).unwrap_or(false);

    if has_old_schema {
        conn.execute("DROP TABLE sync_state", [])?;
        conn.execute_batch(
            "CREATE TABLE sync_state (
                file_path TEXT PRIMARY KEY,
                last_modified REAL NOT NULL,
                record_count INTEGER DEFAULT 0
            );",
        )?;
    }

    // Migrate: create unique index for deduplication
    // If index doesn't exist yet, deduplicate existing records first
    let index_exists: bool = conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_token_records_unique'",
        [],
        |_| Ok(true),
    ).unwrap_or(false);

    if !index_exists {
        // Remove duplicate records before creating unique index
        conn.execute(
            "DELETE FROM token_records WHERE rowid NOT IN (
                SELECT MIN(rowid) FROM token_records
                GROUP BY source, session_id, agent_type, COALESCE(agent_id, ''), timestamp, COALESCE(message_id, '')
            )",
            [],
        )?;

        conn.execute(
            "CREATE UNIQUE INDEX idx_token_records_unique ON token_records(source, session_id, agent_type, COALESCE(agent_id, ''), timestamp, COALESCE(message_id, ''))",
            [],
        )?;
    }

    // Migrate: fix Kimi records that had model='unknown' due to config.toml field name bug.
    // Delete them and clear their sync_state so incremental sync re-parses with correct model.
    let has_unknown_kimi: bool = conn.query_row(
        "SELECT 1 FROM token_records WHERE source = 'kimi' AND (model = 'unknown' OR model IS NULL) LIMIT 1",
        [],
        |_| Ok(true),
    ).unwrap_or(false);

    if has_unknown_kimi {
        eprintln!("[migration] Found Kimi records with model='unknown', clearing for re-sync...");
        conn.execute("DELETE FROM token_records WHERE source = 'kimi' AND (model = 'unknown' OR model IS NULL)", [])?;
        // Clear all sync_state so ALL files get re-parsed (safe: incremental sync rebuilds it)
        conn.execute("DELETE FROM sync_state", [])?;
    }

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
        ("kimi-for-coding", 2.0, 8.0, 0.2, 2.0),
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
