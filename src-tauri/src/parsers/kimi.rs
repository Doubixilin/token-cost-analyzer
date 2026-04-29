use serde::Deserialize;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::models::TokenRecord;

#[derive(Debug, Deserialize)]
pub struct WireMessage {
    pub timestamp: f64,
    pub message: MessageWrapper,
}

#[derive(Debug, Deserialize)]
pub struct MessageWrapper {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub payload: Option<StatusPayload>,
}

#[derive(Debug, Deserialize)]
pub struct StatusPayload {
    pub token_usage: Option<TokenUsage>,
    #[serde(rename = "message_id")]
    pub message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TokenUsage {
    #[serde(rename = "input_other")]
    pub input_other: i64,
    pub output: i64,
    #[serde(rename = "input_cache_read")]
    pub input_cache_read: i64,
    #[serde(rename = "input_cache_creation")]
    pub input_cache_creation: i64,
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

fn load_kimi_default_model() -> Option<String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let config_path = Path::new(&home).join(".kimi").join("config.toml");
    if !config_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&config_path).ok()?;
    let config: toml::Value = toml::from_str(&content).ok()?;

    // Try top-level "default_model" first (e.g. "kimi-code/kimi-for-coding")
    if let Some(dm) = config.get("default_model").and_then(|v| v.as_str()) {
        // Extract the model name after the slash: "kimi-code/kimi-for-coding" -> "kimi-for-coding"
        let model_name = dm.rsplit('/').next().unwrap_or(dm);
        return Some(model_name.to_string());
    }

    // Fallback: try top-level "model" key
    config.get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub fn parse_all_kimi_records(
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    let sessions_dir = match find_kimi_sessions() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    // Collect all wire.jsonl files
    // On Windows, canonicalize() returns \\?\ prefixed paths, so we must
    // canonicalize the base dir too for starts_with() to work correctly.
    let canonical_sessions_dir = sessions_dir.canonicalize().unwrap_or_else(|_| sessions_dir.clone());
    let mut files: Vec<PathBuf> = vec![];
    for entry in WalkDir::new(&sessions_dir).max_depth(5).into_iter().filter_map(|e| e.ok()) {
        if entry.file_name() == "wire.jsonl" {
            // Security: verify the file is still within sessions_dir after canonicalization
            if let Ok(canonical) = entry.path().canonicalize() {
                if canonical.starts_with(&canonical_sessions_dir) {
                    files.push(entry.path().to_path_buf());
                }
            }
        }
    }

    let total_files = files.len();
    let mut all_records: Vec<TokenRecord> = Vec::new();
    let default_model = load_kimi_default_model().unwrap_or_else(|| "unknown".to_string());

    for (idx, file_path) in files.iter().enumerate() {
        progress_cb("kimi", idx, total_files);
        
        let relative = file_path.strip_prefix(&sessions_dir).unwrap_or(file_path);
        let parts: Vec<&str> = relative.components()
            .filter_map(|c| c.as_os_str().to_str())
            .collect();
        
        if parts.len() < 2 {
            eprintln!("[kimi] Skipping unexpected path structure: {:?}", file_path);
            continue;
        }
        
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
            Err(e) => {
                eprintln!("[kimi] Failed to open {:?}: {}", file_path, e);
                continue;
            }
        };
        let reader = BufReader::new(file);

        for (line_no, line) in reader.lines().enumerate() {
            let line = match line {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[kimi] Failed to read line {} from {:?}: {}", line_no, file_path, e);
                    continue;
                }
            };
            if line.trim().is_empty() {
                continue;
            }
            let msg: WireMessage = match serde_json::from_str(&line) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("[kimi] JSON parse error at line {} in {:?}: {}", line_no, file_path, e);
                    continue;
                }
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
