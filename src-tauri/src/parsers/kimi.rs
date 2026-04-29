use serde::Deserialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::models::TokenRecord;

#[derive(Debug, Deserialize)]
struct WireMessage {
    timestamp: f64,
    message: MessageWrapper,
}

#[derive(Debug, Deserialize)]
struct MessageWrapper {
    #[serde(rename = "type")]
    msg_type: String,
    payload: Option<StatusPayload>,
}

#[derive(Debug, Deserialize)]
struct StatusPayload {
    token_usage: Option<TokenUsage>,
    #[serde(rename = "message_id")]
    message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenUsage {
    #[serde(rename = "input_other")]
    input_other: i64,
    output: i64,
    #[serde(rename = "input_cache_read")]
    input_cache_read: i64,
    #[serde(rename = "input_cache_creation")]
    input_cache_creation: i64,
}

pub fn find_kimi_sessions() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let kimi_dir = Path::new(&home).join(".kimi").join("sessions");
    if kimi_dir.exists() {
        Some(kimi_dir)
    } else {
        None
    }
}

pub fn parse_all_kimi_records(
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    let sessions_dir = match find_kimi_sessions() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    // Collect all wire.jsonl files
    let mut files: Vec<PathBuf> = vec![];
    for entry in WalkDir::new(&sessions_dir).follow_links(true).into_iter().filter_map(|e| e.ok()) {
        if entry.file_name() == "wire.jsonl" {
            files.push(entry.path().to_path_buf());
        }
    }

    let total_files = files.len();
    let mut all_records: Vec<TokenRecord> = Vec::with_capacity(total_files * 100);
    let mut model_map: HashMap<String, String> = HashMap::new();

    // Try to load config.toml for model info
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok();
    if let Some(home) = home {
        let config_path = Path::new(&home).join(".kimi").join("config.toml");
        if config_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                for line in content.lines() {
                    if line.trim_start().starts_with("model") {
                        if let Some(val) = line.split('=').nth(1) {
                            let model = val.trim().trim_matches('"').to_string();
                            model_map.insert("default".to_string(), model);
                        }
                    }
                }
            }
        }
    }

    let default_model = model_map.get("default").cloned().unwrap_or_else(|| "unknown".to_string());

    for (idx, file_path) in files.iter().enumerate() {
        progress_cb("kimi", idx, total_files);
        
        let relative = file_path.strip_prefix(&sessions_dir).unwrap_or(file_path);
        let parts: Vec<&str> = relative.components()
            .filter_map(|c| c.as_os_str().to_str())
            .collect();
        
        let session_id = parts.get(1).unwrap_or(&"unknown").to_string();
        let agent_type = if parts.iter().any(|p| *p == "subagents") {
            "subagent"
        } else {
            "root"
        };
        let agent_id = if agent_type == "subagent" {
            parts.iter().position(|p| *p == "subagents")
                .and_then(|idx| parts.get(idx + 1))
                .map(|s| s.to_string())
        } else {
            None
        };
        let work_dir_md5 = parts.get(0).unwrap_or(&"unknown").to_string();

        let file = match File::open(file_path) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let reader = BufReader::new(file);

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };
            if line.trim().is_empty() {
                continue;
            }
            let msg: WireMessage = match serde_json::from_str(&line) {
                Ok(m) => m,
                Err(_) => continue,
            };
            if msg.message.msg_type != "StatusUpdate" {
                continue;
            }
            let payload = match msg.message.payload {
                Some(p) => p,
                None => continue,
            };
            let usage = match payload.token_usage {
                Some(u) => u,
                None => continue,
            };

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

    progress_cb("kimi", total_files, total_files);
    Ok(all_records)
}
