use serde::Deserialize;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::models::TokenRecord;

#[derive(Debug, Deserialize)]
struct CodexEvent {
    timestamp: String,
    #[serde(rename = "type")]
    event_type: String,
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct TokenCountInfo {
    #[serde(rename = "last_token_usage")]
    last_token_usage: Option<TokenUsage>,
    #[serde(rename = "total_token_usage")]
    total_token_usage: Option<TokenUsage>,
}

#[derive(Debug, Deserialize)]
struct TokenUsage {
    #[serde(rename = "input_tokens")]
    input_tokens: i64,
    #[serde(rename = "output_tokens")]
    output_tokens: i64,
    #[serde(rename = "cached_input_tokens")]
    cached_input_tokens: Option<i64>,
    #[allow(dead_code)]
    #[serde(rename = "reasoning_output_tokens")]
    reasoning_output_tokens: Option<i64>,
}

pub fn find_codex_sessions() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let codex_dir = Path::new(&home).join(".codex").join("sessions");
    if codex_dir.exists() {
        Some(codex_dir)
    } else {
        None
    }
}

fn parse_iso_timestamp(ts: &str) -> Option<f64> {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.timestamp_millis() as f64 / 1000.0)
}

fn usage_signature(usage: &TokenUsage) -> (i64, i64, i64, i64) {
    (
        usage.input_tokens,
        usage.output_tokens,
        usage.cached_input_tokens.unwrap_or(0),
        usage.reasoning_output_tokens.unwrap_or(0),
    )
}

fn extract_session_id_from_filename(path: &Path) -> Option<String> {
    // Use the full filename stem as fallback session id.
    // The actual session id from session_meta will override this.
    path.file_stem()?.to_str().map(|s| s.to_string())
}

fn parse_codex_file(
    file_path: &Path,
    sessions_dir: &Path,
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    let mut records = Vec::new();

    // Derive session_id from filename as fallback
    let filename_session_id = extract_session_id_from_filename(file_path).unwrap_or_else(|| "unknown".to_string());

    // Derive a project path from the relative directory structure
    let relative = file_path.strip_prefix(sessions_dir).unwrap_or(file_path);
    let project_path = relative.to_string_lossy().to_string();

    let file = match File::open(file_path) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[codex] Failed to open {:?}: {}", file_path, e);
            return Ok(records);
        }
    };
    let reader = BufReader::new(file);

    // State machine variables
    let mut current_session_id = filename_session_id.clone();
    let mut current_model: Option<String> = None;
    let mut current_cwd: Option<String> = None;
    let mut last_total_usage_signature: Option<(i64, i64, i64, i64)> = None;

    for (line_no, line) in reader.lines().enumerate() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[codex] Failed to read line {} from {:?}: {}", line_no, file_path, e);
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        let event: CodexEvent = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[codex] JSON parse error at line {} in {:?}: {}", line_no, file_path, e);
                continue;
            }
        };

        match event.event_type.as_str() {
            "session_meta" => {
                // Extract session id and cwd from payload
                if let Some(id) = event.payload.get("id").and_then(|v| v.as_str()) {
                    current_session_id = id.to_string();
                }
                if let Some(cwd) = event.payload.get("cwd").and_then(|v| v.as_str()) {
                    current_cwd = Some(cwd.to_string());
                }
            }
            "turn_context" => {
                if let Some(model) = event.payload.get("model").and_then(|v| v.as_str()) {
                    current_model = Some(model.to_string());
                }
            }
            "event_msg" => {
                // Check if this is a token_count event
                let msg_type = event.payload.get("type").and_then(|v| v.as_str());
                if msg_type != Some("token_count") {
                    continue;
                }

                let info_val = match event.payload.get("info") {
                    Some(v) if !v.is_null() => v,
                    _ => continue,
                };

                let info: TokenCountInfo = match serde_json::from_value(info_val.clone()) {
                    Ok(i) => i,
                    Err(e) => {
                        eprintln!("[codex] Failed to parse token_count info at line {} in {:?}: {}", line_no, file_path, e);
                        continue;
                    }
                };

                let usage = match info.last_token_usage.as_ref() {
                    Some(u) => u,
                    None => continue,
                };
                let total_signature = info
                    .total_token_usage
                    .as_ref()
                    .map(usage_signature)
                    .unwrap_or_else(|| usage_signature(usage));
                if last_total_usage_signature.as_ref() == Some(&total_signature) {
                    continue;
                }
                last_total_usage_signature = Some(total_signature);

                // Skip zero-usage records (they don't provide meaningful data)
                let cache_read_tokens = usage.cached_input_tokens.unwrap_or(0);
                if usage.input_tokens == 0 && usage.output_tokens == 0 && cache_read_tokens == 0 {
                    continue;
                }

                let timestamp = parse_iso_timestamp(&event.timestamp).unwrap_or(0.0);

                records.push(TokenRecord {
                    id: None,
                    source: "codex".to_string(),
                    session_id: current_session_id.clone(),
                    agent_type: "root".to_string(),
                    agent_id: None,
                    timestamp,
                    model: current_model.clone(),
                    input_tokens: usage.input_tokens,
                    output_tokens: usage.output_tokens,
                    cache_read_tokens,
                    cache_creation_tokens: 0, // Codex doesn't seem to expose this separately
                    project_path: current_cwd.clone().or_else(|| Some(project_path.clone())),
                    message_id: None,
                    cost_estimate: 0.0,
                });
            }
            _ => {}
        }
    }

    Ok(records)
}

pub fn parse_all_codex_records(
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    let sessions_dir = match find_codex_sessions() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    let canonical_sessions_dir = sessions_dir.canonicalize().unwrap_or_else(|_| sessions_dir.clone());
    let mut files: Vec<PathBuf> = vec![];

    for entry in WalkDir::new(&sessions_dir).max_depth(5).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("jsonl") {
            continue;
        }
        let fname = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
        if !fname.starts_with("rollout-") {
            continue;
        }
        if let Ok(canonical) = path.canonicalize() {
            if canonical.starts_with(&canonical_sessions_dir) {
                files.push(path.to_path_buf());
            }
        }
    }

    let total_files = files.len();
    let mut all_records: Vec<TokenRecord> = Vec::new();

    for (idx, file_path) in files.iter().enumerate() {
        progress_cb("codex", idx, total_files);
        match parse_codex_file(file_path, &sessions_dir) {
            Ok(mut records) => all_records.append(&mut records),
            Err(e) => eprintln!("[codex] Failed to parse {:?}: {}", file_path, e),
        }
    }

    progress_cb("codex", total_files, total_files);
    Ok(all_records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn parse_iso_timestamp_preserves_milliseconds() {
        let ts = parse_iso_timestamp("2026-05-06T00:55:15.751Z").unwrap();

        assert!((ts - 1_778_028_915.751).abs() < 0.001);
    }

    #[test]
    fn parse_codex_file_skips_duplicate_token_count_status_events() {
        let root = std::env::temp_dir().join(format!(
            "token_cost_codex_parser_test_{}",
            std::process::id()
        ));
        let sessions_dir = root.join("sessions");
        fs::create_dir_all(&sessions_dir).unwrap();
        let file_path = sessions_dir.join("rollout-test.jsonl");
        let mut file = fs::File::create(&file_path).unwrap();

        writeln!(
            file,
            r#"{{"timestamp":"2026-05-06T00:55:10.000Z","type":"session_meta","payload":{{"id":"session-a","cwd":"D:/work"}}}}"#
        )
        .unwrap();
        writeln!(
            file,
            r#"{{"timestamp":"2026-05-06T00:55:11.000Z","type":"turn_context","payload":{{"model":"gpt-5.4"}}}}"#
        )
        .unwrap();
        for ts in ["2026-05-06T00:55:15.751Z", "2026-05-06T00:55:25.516Z"] {
            writeln!(
                file,
                r#"{{"timestamp":"{}","type":"event_msg","payload":{{"type":"token_count","info":{{"last_token_usage":{{"input_tokens":23004,"cached_input_tokens":6528,"output_tokens":67,"reasoning_output_tokens":49,"total_tokens":23071}},"total_token_usage":{{"input_tokens":23004,"cached_input_tokens":6528,"output_tokens":67,"reasoning_output_tokens":49,"total_tokens":23071}}}}}}}}"#,
                ts
            )
            .unwrap();
        }
        writeln!(
            file,
            r#"{{"timestamp":"2026-05-06T00:55:28.602Z","type":"event_msg","payload":{{"type":"token_count","info":{{"last_token_usage":{{"input_tokens":24831,"cached_input_tokens":22912,"output_tokens":46,"reasoning_output_tokens":28,"total_tokens":24877}},"total_token_usage":{{"input_tokens":47835,"cached_input_tokens":29440,"output_tokens":113,"reasoning_output_tokens":77,"total_tokens":47948}}}}}}}}"#
        )
        .unwrap();
        drop(file);

        let records = parse_codex_file(&file_path, &sessions_dir).unwrap();
        fs::remove_dir_all(&root).ok();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].input_tokens, 23004);
        assert_eq!(records[0].cache_read_tokens, 6528);
        assert_eq!(records[1].input_tokens, 24831);
    }
}

/// Parse only selected Codex files (for incremental sync)
pub fn parse_selected_codex_files(
    files: &[PathBuf],
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    let sessions_dir = match find_codex_sessions() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    let total = files.len();
    let mut all_records = Vec::new();

    for (idx, file_path) in files.iter().enumerate() {
        progress_cb("codex-inc", idx, total);
        match parse_codex_file(file_path, &sessions_dir) {
            Ok(mut records) => all_records.append(&mut records),
            Err(e) => eprintln!("[codex] Failed to parse {:?}: {}", file_path, e),
        }
    }

    progress_cb("codex-inc", total, total);
    Ok(all_records)
}
