use serde::Deserialize;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::models::TokenRecord;

#[derive(Debug, Deserialize)]
struct ClaudeMessage {
    #[serde(rename = "type")]
    msg_type: String,
    message: Option<ClaudeInnerMessage>,
    timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "agentId")]
    agent_id: Option<String>,
    #[serde(rename = "isSidechain")]
    is_sidechain: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ClaudeInnerMessage {
    model: Option<String>,
    usage: Option<ClaudeUsage>,
}

#[derive(Debug, Deserialize)]
struct ClaudeUsage {
    #[serde(rename = "input_tokens")]
    input_tokens: i64,
    #[serde(rename = "output_tokens")]
    output_tokens: i64,
    #[serde(rename = "cache_creation_input_tokens")]
    cache_creation_input_tokens: Option<i64>,
    #[serde(rename = "cache_read_input_tokens")]
    cache_read_input_tokens: Option<i64>,
}

pub fn find_claude_projects() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let claude_dir = Path::new(&home).join(".claude").join("projects");
    if claude_dir.exists() {
        Some(claude_dir)
    } else {
        None
    }
}

fn parse_iso_timestamp(ts: &str) -> Option<f64> {
    // Parse ISO 8601 like "2026-04-23T23:17:10.770Z"
    chrono::DateTime::parse_from_rfc3339(ts).ok().map(|dt| dt.timestamp() as f64)
}

pub fn parse_all_claude_records(
    progress_cb: &mut dyn FnMut(&str, usize, usize),
) -> Result<Vec<TokenRecord>, Box<dyn std::error::Error>> {
    let projects_dir = match find_claude_projects() {
        Some(d) => d,
        None => return Ok(vec![]),
    };

    // Collect all JSONL files in projects dir
    let mut files: Vec<(PathBuf, bool)> = vec![]; // (path, is_subagent)
    
    for entry in WalkDir::new(&projects_dir).max_depth(4).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("jsonl") {
            continue;
        }
        // Security: verify the file is still within projects_dir
        if let Ok(canonical) = path.canonicalize() {
            if !canonical.starts_with(&projects_dir) {
                continue;
            }
        }
        // Check if inside subagents dir by examining path components
        let is_subagent = path.components().any(|c| {
            c.as_os_str().to_str() == Some("subagents")
        });
        files.push((path.to_path_buf(), is_subagent));
    }

    let total_files = files.len();
    let mut all_records: Vec<TokenRecord> = Vec::with_capacity(total_files * 100);

    for (idx, (file_path, is_subagent)) in files.iter().enumerate() {
        progress_cb("claude", idx, total_files);

        // Derive session_id from path
        // projects/<project-slug>/<session-id>.jsonl (main)
        // projects/<project-slug>/<session-id>/subagents/agent-{id}.jsonl (subagent)
        let relative = file_path.strip_prefix(&projects_dir).unwrap_or(file_path);
        let parts: Vec<&str> = relative.components()
            .filter_map(|c| c.as_os_str().to_str())
            .collect();
        
        let session_id = if *is_subagent {
            parts.get(1).unwrap_or(&"unknown").to_string()
        } else {
            // File name without extension
            file_path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        };
        
        let agent_type = if *is_subagent { "subagent" } else { "root" };
        let agent_id = if *is_subagent {
            file_path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        } else {
            None
        };
        
        let project_slug = parts.get(0).unwrap_or(&"unknown").to_string();

        let file = match File::open(file_path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[claude] Failed to open {:?}: {}", file_path, e);
                continue;
            }
        };
        let reader = BufReader::new(file);

        for (line_no, line) in reader.lines().enumerate() {
            let line = match line {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[claude] Failed to read line {} from {:?}: {}", line_no, file_path, e);
                    continue;
                }
            };
            if line.trim().is_empty() {
                continue;
            }
            let msg: ClaudeMessage = match serde_json::from_str(&line) {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("[claude] JSON parse error at line {} in {:?}: {}", line_no, file_path, e);
                    continue;
                }
            };
            if msg.msg_type != "assistant" {
                continue;
            }
            let inner = match msg.message {
                Some(m) => m,
                None => continue,
            };
            // Skip synthetic error messages (API errors, rate limits, etc.)
            if inner.model.as_deref() == Some("<synthetic>") {
                continue;
            }
            let usage = match inner.usage {
                Some(u) => u,
                None => continue,
            };

            let timestamp = msg.timestamp.as_ref()
                .and_then(|t| parse_iso_timestamp(t))
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

    progress_cb("claude", total_files, total_files);
    Ok(all_records)
}
