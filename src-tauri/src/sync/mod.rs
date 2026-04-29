use rusqlite::{Connection, Transaction};
use std::collections::HashMap;
use std::path::PathBuf;
use crate::models::TokenRecord;
use crate::parsers::{parse_all_kimi_records, parse_all_claude_records};

/// Read file sync state from database (modification times)
pub fn get_file_sync_state(conn: &Connection) -> Result<HashMap<String, f64>, Box<dyn std::error::Error>> {
    let mut stmt = conn.prepare("SELECT file_path, last_modified FROM sync_state")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (path, mtime) = row?;
        map.insert(path, mtime);
    }
    Ok(map)
}

/// Scan session directories and return file paths with modification times
pub fn scan_session_files() -> Vec<(PathBuf, f64, &'static str)> {
    use walkdir::WalkDir;
    use std::path::Path;

    let mut files: Vec<(PathBuf, f64, &'static str)> = vec![];

    // Scan Kimi sessions
    if let Some(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok() {
        let kimi_dir = Path::new(&home).join(".kimi").join("sessions");
        if kimi_dir.exists() {
            for entry in WalkDir::new(&kimi_dir).max_depth(5).into_iter().filter_map(|e| e.ok()) {
                if entry.file_name() == "wire.jsonl" {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(modified) = meta.modified() {
                            let mtime = modified.duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default().as_secs_f64();
                            files.push((entry.path().to_path_buf(), mtime, "kimi"));
                        }
                    }
                }
            }
        }

        let claude_dir = Path::new(&home).join(".claude").join("projects");
        if claude_dir.exists() {
            for entry in WalkDir::new(&claude_dir).max_depth(5).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_file() { continue; }
                if path.extension().and_then(|e| e.to_str()) != Some("jsonl") { continue; }
                if let Ok(meta) = entry.metadata() {
                    if let Ok(modified) = meta.modified() {
                        let mtime = modified.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default().as_secs_f64();
                        files.push((entry.path().to_path_buf(), mtime, "claude"));
                    }
                }
            }
        }
    }

    files
}

/// Parse only changed files (incremental sync)
pub fn parse_changed_files(
    files: &[(PathBuf, f64, &str)],
    prev_state: &HashMap<String, f64>,
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> (Vec<TokenRecord>, Vec<String>) {
    let kimi_files: Vec<PathBuf> = files.iter()
        .filter(|(p, mtime, src)| {
            *src == "kimi" && prev_state.get(p.to_str().unwrap_or("")) != Some(mtime)
        })
        .map(|(p, _, _)| p.clone())
        .collect();

    let claude_files: Vec<PathBuf> = files.iter()
        .filter(|(p, mtime, src)| {
            *src == "claude" && prev_state.get(p.to_str().unwrap_or("")) != Some(mtime)
        })
        .map(|(p, _, _)| p.clone())
        .collect();

    let total = kimi_files.len() + claude_files.len();
    let mut all_records = Vec::new();
    let mut changed_paths: Vec<String> = Vec::new();

    if !kimi_files.is_empty() {
        changed_paths.extend(kimi_files.iter().filter_map(|p| p.to_str().map(|s| s.to_string())));
        match parse_selected_kimi_files(&kimi_files, progress_cb) {
            Ok(records) => all_records.extend(records),
            Err(e) => eprintln!("[sync] Failed to parse Kimi files: {}", e),
        }
    }

    if !claude_files.is_empty() {
        changed_paths.extend(claude_files.iter().filter_map(|p| p.to_str().map(|s| s.to_string())));
        match parse_selected_claude_files(&claude_files, progress_cb) {
            Ok(records) => all_records.extend(records),
            Err(e) => eprintln!("[sync] Failed to parse Claude files: {}", e),
        }
    }

    progress_cb("sync", total, total);
    (all_records, changed_paths)
}

/// Insert parsed records and update sync state (called inside mutex lock)
pub fn insert_and_update_sync(
    conn: &mut Connection,
    records: &[TokenRecord],
    _changed_paths: &[String],
    file_mtimes: &[(String, f64)],
    current_paths: &[String],
) -> Result<usize, Box<dyn std::error::Error>> {
    let tx = conn.transaction()?;

    // Clean up synthetic error messages from previous versions
    tx.execute("DELETE FROM token_records WHERE model = '<synthetic>'", [])?;

    // Delete old records for changed sessions before re-inserting
    // This ensures removed records from source files are also removed from DB
    let mut sessions_seen = std::collections::HashSet::new();
    for record in records {
        let key = (&record.source, &record.session_id);
        if sessions_seen.insert(key) {
            tx.execute(
                "DELETE FROM token_records WHERE source = ?1 AND session_id = ?2",
                rusqlite::params![&record.source, &record.session_id],
            )?;
        }
    }

    let count = insert_records(&tx, records)?;

    // Update sync state for changed files
    for (path, mtime) in file_mtimes {
        tx.execute(
            "INSERT OR REPLACE INTO sync_state (file_path, last_modified, record_count) VALUES (?1, ?2, 0)",
            rusqlite::params![path, mtime],
        )?;
    }

    // Remove sync_state entries for files that no longer exist
    if !current_paths.is_empty() {
        tx.execute(
            &format!(
                "DELETE FROM sync_state WHERE file_path NOT IN ({})",
                current_paths.iter().map(|_| "?").collect::<Vec<_>>().join(", ")
            ),
            rusqlite::params_from_iter(current_paths.iter()),
        )?;
    }

    tx.commit()?;

    // Ensure all models have pricing entries
    ensure_all_models_priced(conn)?;

    Ok(count)
}

/// Full scan (legacy fallback)
pub fn parse_all_records() -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    let mut progress = |phase: &str, current: usize, total: usize| {
        println!("[{}] Progress: {}/{}", phase, current, total);
    };

    let mut all_records = Vec::new();

    match parse_all_kimi_records(&mut progress) {
        Ok(records) => all_records.extend(records),
        Err(e) => eprintln!("[sync] Failed to parse Kimi records: {}", e),
    }
    match parse_all_claude_records(&mut progress) {
        Ok(records) => all_records.extend(records),
        Err(e) => eprintln!("[sync] Failed to parse Claude records: {}", e),
    }

    Ok(all_records)
}

/// Insert all records (legacy)
pub fn insert_parsed_records(conn: &mut Connection, records: &[TokenRecord]) -> Result<usize, Box<dyn std::error::Error>> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM token_records WHERE model = '<synthetic>'", [])?;
    let count = insert_records(&tx, records)?;
    tx.commit()?;
    ensure_all_models_priced(conn)?;
    Ok(count)
}

pub fn sync_all_data(conn: &mut Connection) -> Result<usize, Box<dyn std::error::Error>> {
    let records = parse_all_records()?;
    insert_parsed_records(conn, &records)
}

fn insert_records(tx: &Transaction, records: &[TokenRecord]) -> Result<usize, rusqlite::Error> {
    if records.is_empty() {
        return Ok(0);
    }

    let mut stmt = tx.prepare(
        "INSERT OR IGNORE INTO token_records
        (source, session_id, agent_type, agent_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, project_path, message_id, cost_estimate)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"
    )?;

    let mut count = 0;
    for record in records {
        stmt.execute(rusqlite::params![
            &record.source,
            &record.session_id,
            &record.agent_type,
            record.agent_id.as_ref(),
            record.timestamp,
            record.model.as_ref(),
            record.input_tokens,
            record.output_tokens,
            record.cache_read_tokens,
            record.cache_creation_tokens,
            record.project_path.as_ref(),
            record.message_id.as_ref(),
            record.cost_estimate,
        ])?;
        count += 1;
    }

    Ok(count)
}

pub fn recalc_session_summaries(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM session_summary", [])?;

    conn.execute(
        "INSERT INTO session_summary
        (session_id, source, project_path, start_time, end_time, total_input, total_output, total_cache_read, total_cache_creation, total_cost, message_count, agent_count)
        SELECT
            session_id,
            source,
            MAX(project_path),
            MIN(timestamp),
            MAX(timestamp),
            SUM(input_tokens),
            SUM(output_tokens),
            SUM(cache_read_tokens),
            SUM(cache_creation_tokens),
            SUM(cost_estimate),
            COUNT(*),
            COUNT(DISTINCT agent_id)
        FROM token_records
        GROUP BY session_id, source",
        [],
    )?;

    Ok(())
}

fn ensure_all_models_priced(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    let models: Vec<String> = conn.prepare(
        "SELECT DISTINCT COALESCE(model, 'unknown') FROM token_records WHERE model NOT IN (SELECT model FROM model_pricing)"
    )?
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;

    for model in models {
        conn.execute(
            "INSERT INTO model_pricing (model, input_price, output_price, cache_read_price, cache_creation_price, currency) VALUES (?1, 0, 0, 0, 0, 'USD')",
            [&model],
        )?;
    }
    Ok(())
}

pub fn recalc_costs(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    let tx = conn.transaction()?;

    tx.execute(
        "UPDATE token_records SET cost_estimate = (
            COALESCE(input_tokens, 0) * mp.input_price +
            COALESCE(output_tokens, 0) * mp.output_price +
            COALESCE(cache_read_tokens, 0) * mp.cache_read_price +
            COALESCE(cache_creation_tokens, 0) * mp.cache_creation_price
        ) / 1000000.0
        FROM model_pricing mp
        WHERE COALESCE(token_records.model, 'unknown') = mp.model",
        [],
    )?;

    tx.execute(
        "UPDATE token_records SET cost_estimate = 0
        WHERE COALESCE(model, 'unknown') NOT IN (SELECT model FROM model_pricing)",
        [],
    )?;

    recalc_session_summaries(&tx)?;

    tx.commit()?;
    Ok(())
}

// --- Selected file parsers (only parse specific changed files) ---

use std::fs::File;
use std::io::{BufRead, BufReader};

fn parse_selected_kimi_files(
    files: &[PathBuf],
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    use crate::parsers::kimi::find_kimi_sessions;

    let sessions_dir = match find_kimi_sessions() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    let default_model = {
        let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
        home.and_then(|h| {
            let config_path = std::path::Path::new(&h).join(".kimi").join("config.toml");
            std::fs::read_to_string(&config_path).ok().and_then(|content| {
                toml::from_str::<toml::Value>(&content).ok().and_then(|c| {
                    // Try "default_model" first: "kimi-code/kimi-for-coding" -> "kimi-for-coding"
                    c.get("default_model").and_then(|v| v.as_str()).map(|dm| {
                        dm.rsplit('/').next().unwrap_or(dm).to_string()
                    })
                    // Fallback: try "model" key
                    .or_else(|| c.get("model").and_then(|v| v.as_str()).map(|s| s.to_string()))
                })
            })
        }).unwrap_or_else(|| "unknown".to_string())
    };

    let total = files.len();
    let mut all_records = Vec::new();

    for (idx, file_path) in files.iter().enumerate() {
        progress_cb("kimi-inc", idx, total);

        let relative = file_path.strip_prefix(&sessions_dir).unwrap_or(file_path);
        let parts: Vec<&str> = relative.components()
            .filter_map(|c| c.as_os_str().to_str())
            .collect();

        if parts.len() < 2 {
            eprintln!("[kimi] Skipping unexpected path structure: {:?}", file_path);
            continue;
        }

        let session_id = parts.get(1).unwrap_or(&"unknown").to_string();
        let agent_type = if parts.iter().any(|p| *p == "subagents") { "subagent" } else { "root" };
        let agent_id = if agent_type == "subagent" {
            parts.iter().position(|p| *p == "subagents")
                .and_then(|idx| parts.get(idx + 1))
                .map(|s| s.to_string())
        } else { None };
        let work_dir_md5 = parts.get(0).unwrap_or(&"unknown").to_string();

        let file = match File::open(file_path) {
            Ok(f) => f,
            Err(e) => { eprintln!("[kimi] Failed to open {:?}: {}", file_path, e); continue; }
        };
        let reader = BufReader::new(file);

        for (line_no, line) in reader.lines().enumerate() {
            let line = match line { Ok(l) => l, Err(e) => { eprintln!("[kimi] Read error: {}", e); continue; } };
            if line.trim().is_empty() { continue; }
            let msg: crate::parsers::kimi::WireMessage = match serde_json::from_str(&line) {
                Ok(m) => m,
                Err(e) => { eprintln!("[kimi] JSON error at line {}: {}", line_no, e); continue; }
            };
            // Re-use the same parsing logic as the main parser
            if msg.message.msg_type != "StatusUpdate" { continue; }
            let payload = match msg.message.payload { Some(p) => p, None => continue };
            let usage = match payload.token_usage { Some(u) => u, None => continue };

            all_records.push(TokenRecord {
                id: None,
                source: "kimi".to_string(),
                session_id: session_id.clone(),
                agent_type: agent_type.to_string(),
                agent_id: agent_id.clone(),
                timestamp: msg.timestamp,
                model: Some(default_model.clone()),
                input_tokens: usage.input_other,
                output_tokens: usage.output,
                cache_read_tokens: usage.input_cache_read,
                cache_creation_tokens: usage.input_cache_creation,
                project_path: Some(work_dir_md5.clone()),
                message_id: payload.message_id,
                cost_estimate: 0.0,
            });
        }
    }

    progress_cb("kimi-inc", total, total);
    Ok(all_records)
}

fn parse_selected_claude_files(
    files: &[PathBuf],
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    use crate::parsers::claude::find_claude_projects;

    let projects_dir = match find_claude_projects() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    let total = files.len();
    let mut all_records = Vec::new();

    for (idx, file_path) in files.iter().enumerate() {
        progress_cb("claude-inc", idx, total);

        let relative = file_path.strip_prefix(&projects_dir).unwrap_or(file_path);
        let parts: Vec<&str> = relative.components()
            .filter_map(|c| c.as_os_str().to_str())
            .collect();

        let is_subagent = file_path.components().any(|c| c.as_os_str().to_str() == Some("subagents"));
        let session_id = if is_subagent {
            parts.get(1).unwrap_or(&"unknown").to_string()
        } else {
            file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string()
        };
        let agent_type = if is_subagent { "subagent" } else { "root" };
        let agent_id = if is_subagent {
            file_path.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string())
        } else { None };
        let project_slug = parts.get(0).unwrap_or(&"unknown").to_string();

        let file = match File::open(file_path) {
            Ok(f) => f,
            Err(e) => { eprintln!("[claude] Failed to open {:?}: {}", file_path, e); continue; }
        };
        let reader = BufReader::new(file);

        for (line_no, line) in reader.lines().enumerate() {
            let line = match line { Ok(l) => l, Err(e) => { eprintln!("[claude] Read error: {}", e); continue; } };
            if line.trim().is_empty() { continue; }
            let msg: crate::parsers::claude::ClaudeMessage = match serde_json::from_str(&line) {
                Ok(m) => m,
                Err(e) => { eprintln!("[claude] JSON error at line {}: {}", line_no, e); continue; }
            };
            if msg.msg_type != "assistant" { continue; }
            let inner = match msg.message { Some(m) => m, None => continue };
            if inner.model.as_deref() == Some("<synthetic>") { continue; }
            let usage = match inner.usage { Some(u) => u, None => continue };
            let timestamp = msg.timestamp.as_ref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp() as f64)
                .unwrap_or(0.0);

            all_records.push(TokenRecord {
                id: None,
                source: "claude".to_string(),
                session_id: session_id.clone(),
                agent_type: agent_type.to_string(),
                agent_id: agent_id.clone(),
                timestamp,
                model: inner.model,
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_read_tokens: usage.cache_read_input_tokens.unwrap_or(0),
                cache_creation_tokens: usage.cache_creation_input_tokens.unwrap_or(0),
                project_path: Some(project_slug.clone()),
                message_id: None,
                cost_estimate: 0.0,
            });
        }
    }

    progress_cb("claude-inc", total, total);
    Ok(all_records)
}
