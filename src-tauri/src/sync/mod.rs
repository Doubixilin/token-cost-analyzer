use rusqlite::{Connection, Transaction};
use crate::models::TokenRecord;
use crate::parsers::{parse_all_kimi_records, parse_all_claude_records};

pub fn sync_all_data(conn: &mut Connection) -> Result<usize, Box<dyn std::error::Error>> {
    let mut total_inserted = 0usize;
    
    // Parse Kimi records
    let mut progress = |phase: &str, current: usize, total: usize| {
        println!("[{}] Progress: {}/{}", phase, current, total);
    };
    
    let kimi_records = parse_all_kimi_records(&mut progress)?;
    let claude_records = parse_all_claude_records(&mut progress)?;
    
    let tx = conn.transaction()?;
    
    // Insert Kimi records
    total_inserted += insert_records(&tx, &kimi_records, "kimi")?;
    
    // Insert Claude records
    total_inserted += insert_records(&tx, &claude_records, "claude")?;
    
    tx.commit()?;
    
    // Recalculate session summaries
    recalc_session_summaries(conn)?;
    
    Ok(total_inserted)
}

fn insert_records(tx: &Transaction, records: &[TokenRecord], source: &str) -> Result<usize, rusqlite::Error> {
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
            source,
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

fn recalc_session_summaries(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM session_summary",
        [],
    )?;
    
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

pub fn recalc_costs(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE token_records SET cost_estimate = 0",
        [],
    )?;
    
    conn.execute(
        "UPDATE token_records 
        SET cost_estimate = (
            input_tokens * COALESCE((SELECT input_price FROM model_pricing WHERE model = COALESCE(token_records.model, 'unknown')), 0) +
            output_tokens * COALESCE((SELECT output_price FROM model_pricing WHERE model = COALESCE(token_records.model, 'unknown')), 0) +
            cache_read_tokens * COALESCE((SELECT cache_read_price FROM model_pricing WHERE model = COALESCE(token_records.model, 'unknown')), 0) +
            cache_creation_tokens * COALESCE((SELECT cache_creation_price FROM model_pricing WHERE model = COALESCE(token_records.model, 'unknown')), 0)
        ) / 1000000.0",
        [],
    )?;
    
    // Recalc session summaries with new costs
    recalc_session_summaries(conn)?;
    
    Ok(())
}
