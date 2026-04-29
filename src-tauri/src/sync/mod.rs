use rusqlite::{Connection, Transaction};
use crate::models::TokenRecord;
use crate::parsers::{parse_all_kimi_records, parse_all_claude_records};

pub fn sync_all_data(conn: &mut Connection) -> Result<usize, Box<dyn std::error::Error>> {
    let mut total_inserted = 0usize;
    
    // Parse Kimi records
    let mut progress = |phase: &str, current: usize, total: usize| {
        println!("[{}] Progress: {}/{}", phase, current, total);
    };
    
    let kimi_records = parse_all_kimi_records(&mut progress).unwrap_or_else(|e| {
        eprintln!("[sync] Failed to parse Kimi records: {}", e);
        vec![]
    });
    let claude_records = parse_all_claude_records(&mut progress).unwrap_or_else(|e| {
        eprintln!("[sync] Failed to parse Claude records: {}", e);
        vec![]
    });
    
    let tx = conn.transaction()?;
    
    // Clean up synthetic error messages from previous versions
    tx.execute("DELETE FROM token_records WHERE model = '<synthetic>'", [])?;
    
    // Insert Kimi records
    total_inserted += insert_records(&tx, &kimi_records)?;
    
    // Insert Claude records
    total_inserted += insert_records(&tx, &claude_records)?;
    
    tx.commit()?;
    
    // Ensure all models in token_records have a pricing entry (default to 0)
    ensure_all_models_priced(conn)?;
    
    Ok(total_inserted)
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

fn recalc_session_summaries(conn: &Connection) -> Result<(), rusqlite::Error> {
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
    
    tx.execute("UPDATE token_records SET cost_estimate = 0", [])?;
    
    // Get distinct models to avoid correlated subqueries
    let models: Vec<String> = tx.prepare("SELECT DISTINCT COALESCE(model, 'unknown') FROM token_records")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;
    
    for model in models {
        let pricing = tx.query_row(
            "SELECT input_price, output_price, cache_read_price, cache_creation_price FROM model_pricing WHERE model = ?1",
            [&model],
            |row| Ok((
                row.get::<_, f64>(0).unwrap_or(0.0),
                row.get::<_, f64>(1).unwrap_or(0.0),
                row.get::<_, f64>(2).unwrap_or(0.0),
                row.get::<_, f64>(3).unwrap_or(0.0),
            ))
        ).unwrap_or((0.0, 0.0, 0.0, 0.0));
        
        tx.execute(
            "UPDATE token_records SET cost_estimate = (input_tokens * ?1 + output_tokens * ?2 + cache_read_tokens * ?3 + cache_creation_tokens * ?4) / 1000000.0 WHERE COALESCE(model, 'unknown') = ?5",
            rusqlite::params![pricing.0, pricing.1, pricing.2, pricing.3, model],
        )?;
    }
    
    // Recalc session summaries with new costs
    recalc_session_summaries(&tx)?;
    
    tx.commit()?;
    Ok(())
}
