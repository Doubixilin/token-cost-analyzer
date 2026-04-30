use rusqlite::{Connection, Result, Row};
use crate::models::*;

fn build_where_clause(filters: &FilterParams) -> (String, Vec<rusqlite::types::Value>) {
    let mut conditions = vec![];
    let mut params: Vec<rusqlite::types::Value> = vec![];

    if let Some(start) = filters.start_time {
        conditions.push("timestamp >= ?".to_string());
        params.push(start.into());
    }
    if let Some(end) = filters.end_time {
        conditions.push("timestamp <= ?".to_string());
        params.push(end.into());
    }
    if let Some(sources) = &filters.sources {
        if !sources.is_empty() {
            let placeholders: Vec<String> = sources.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!("source IN ({})", placeholders.join(", ")));
            params.extend(sources.iter().map(|s| s.clone().into()));
        }
    }
    if let Some(models) = &filters.models {
        if !models.is_empty() {
            let placeholders: Vec<String> = models.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!("model IN ({})", placeholders.join(", ")));
            params.extend(models.iter().map(|s| s.clone().into()));
        }
    }
    if let Some(projects) = &filters.projects {
        if !projects.is_empty() {
            let placeholders: Vec<String> = projects.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!("project_path IN ({})", placeholders.join(", ")));
            params.extend(projects.iter().map(|s| s.clone().into()));
        }
    }
    if let Some(agent_types) = &filters.agent_types {
        if !agent_types.is_empty() {
            let placeholders: Vec<String> = agent_types.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!("agent_type IN ({})", placeholders.join(", ")));
            params.extend(agent_types.iter().map(|s| s.clone().into()));
        }
    }

    let where_clause = if conditions.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    (where_clause, params)
}

fn row_to_session_summary(row: &Row) -> Result<SessionSummary> {
    Ok(SessionSummary {
        session_id: row.get(0)?,
        source: row.get(1)?,
        project_path: row.get(2)?,
        start_time: row.get(3)?,
        end_time: row.get(4)?,
        total_input: row.get(5)?,
        total_output: row.get(6)?,
        total_cache_read: row.get(7)?,
        total_cache_creation: row.get(8)?,
        total_cost: row.get(9)?,
        message_count: row.get(10)?,
        agent_count: row.get(11)?,
    })
}

pub fn get_overview_stats(conn: &Connection, filters: &FilterParams) -> Result<OverviewStats> {
    let (where_clause, params) = build_where_clause(filters);
    let sql = format!(
        "SELECT COUNT(*), SUM(cost_estimate), SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens), SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens), SUM(cache_creation_tokens) FROM token_records {}",
        where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let row = stmt.query_row(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(OverviewStats {
            total_requests: row.get(0)?,
            total_cost: row.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
            total_tokens: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
            total_input: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            total_output: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
            total_cache_read: row.get::<_, Option<i64>>(5)?.unwrap_or(0),
            total_cache_creation: row.get::<_, Option<i64>>(6)?.unwrap_or(0),
            currency: "USD".to_string(),
        })
    })?;
    Ok(row)
}

pub fn get_trend_data(conn: &Connection, filters: &FilterParams, granularity: &str) -> Result<Vec<TrendPoint>> {
    let (where_clause, params) = build_where_clause(filters);
    let date_format = match granularity {
        "hour" => "%Y-%m-%d %H:00",
        "day" => "%Y-%m-%d",
        "week" => "%Y-W%W",
        "month" => "%Y-%m",
        _ => return Err(rusqlite::Error::InvalidParameterName(format!("invalid granularity: {}", granularity))),
    };
    let sql = format!(
        "SELECT strftime('{}', datetime(timestamp, 'unixepoch')), SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens), SUM(cache_creation_tokens), SUM(cost_estimate) FROM token_records {} GROUP BY strftime('{}', datetime(timestamp, 'unixepoch')) ORDER BY 1",
        date_format, where_clause, date_format
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(TrendPoint {
            date: row.get(0)?,
            input_tokens: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            output_tokens: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
            cache_read_tokens: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
            cache_creation_tokens: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
            cost: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
        })
    })?;
    rows.collect()
}

pub fn get_distribution(conn: &Connection, filters: &FilterParams, dimension: &str) -> Result<Vec<DistributionItem>> {
    let (where_clause, params) = build_where_clause(filters);
    let column = match dimension {
        "model" => "COALESCE(model, 'unknown')",
        "source" => "source",
        "agent_type" => "agent_type",
        "project_path" => "COALESCE(project_path, 'unknown')",
        _ => return Err(rusqlite::Error::InvalidParameterName(format!("invalid dimension: {}", dimension))),
    };
    let sql = format!(
        "SELECT {}, SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens), SUM(cost_estimate) FROM token_records {} GROUP BY {} ORDER BY 2 DESC",
        column, where_clause, column
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(DistributionItem {
            name: row.get(0)?,
            value: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            cost: row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
        })
    })?;
    rows.collect()
}

pub fn get_session_list(conn: &Connection, filters: &FilterParams, limit: i64, offset: i64) -> Result<Vec<SessionSummary>> {
    let mut conditions = vec![];
    let mut params: Vec<rusqlite::types::Value> = vec![];

    if let Some(start) = filters.start_time {
        conditions.push("start_time >= ?".to_string());
        params.push(start.into());
    }
    if let Some(end) = filters.end_time {
        conditions.push("end_time <= ?".to_string());
        params.push(end.into());
    }
    if let Some(sources) = &filters.sources {
        if !sources.is_empty() {
            let placeholders: Vec<String> = sources.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!("source IN ({})", placeholders.join(", ")));
            params.extend(sources.iter().map(|s| s.clone().into()));
        }
    }
    if let Some(models) = &filters.models {
        if !models.is_empty() {
            let placeholders: Vec<String> = models.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!(
                "session_id IN (SELECT DISTINCT session_id FROM token_records WHERE COALESCE(model, 'unknown') IN ({}))",
                placeholders.join(", ")
            ));
            params.extend(models.iter().map(|s| s.clone().into()));
        }
    }
    if let Some(projects) = &filters.projects {
        if !projects.is_empty() {
            let placeholders: Vec<String> = projects.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!(
                "session_id IN (SELECT DISTINCT session_id FROM token_records WHERE COALESCE(project_path, 'unknown') IN ({}))",
                placeholders.join(", ")
            ));
            params.extend(projects.iter().map(|s| s.clone().into()));
        }
    }
    if let Some(agent_types) = &filters.agent_types {
        if !agent_types.is_empty() {
            let placeholders: Vec<String> = agent_types.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!(
                "session_id IN (SELECT DISTINCT session_id FROM token_records WHERE agent_type IN ({}))",
                placeholders.join(", ")
            ));
            params.extend(agent_types.iter().map(|s| s.clone().into()));
        }
    }

    let where_clause = if conditions.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let sql = format!(
        "SELECT session_id, source, project_path, start_time, end_time, total_input, total_output, total_cache_read, total_cache_creation, total_cost, message_count, agent_count FROM session_summary {} ORDER BY start_time DESC LIMIT ? OFFSET ?",
        where_clause
    );
    params.push(limit.into());
    params.push(offset.into());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), row_to_session_summary)?;
    rows.collect()
}

pub fn get_top_n(conn: &Connection, filters: &FilterParams, dimension: &str, metric: &str, limit: i64) -> Result<Vec<TopNItem>> {
    let (where_clause, params) = build_where_clause(filters);
    let (group_col, name_col) = match dimension {
        "session" => ("session_id", "session_id"),
        "project" => ("COALESCE(project_path, 'unknown')", "COALESCE(project_path, 'unknown')"),
        "model" => ("COALESCE(model, 'unknown')", "COALESCE(model, 'unknown')"),
        _ => return Err(rusqlite::Error::InvalidParameterName(format!("invalid dimension: {}", dimension))),
    };
    let metric_col = match metric {
        "tokens" => "SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens)",
        "cost" => "SUM(cost_estimate)",
        "input" => "SUM(input_tokens)",
        "output" => "SUM(output_tokens)",
        _ => return Err(rusqlite::Error::InvalidParameterName(format!("invalid metric: {}", metric))),
    };
    let sql = format!(
        "SELECT {}, {}, SUM(cost_estimate) FROM token_records {} GROUP BY {} ORDER BY 2 DESC LIMIT ?",
        name_col, metric_col, where_clause, group_col
    );
    let mut all_params = params.clone();
    all_params.push(limit.into());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(all_params.iter()), |row| {
        Ok(TopNItem {
            id: row.get(0)?,
            name: row.get(0)?,
            value: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            cost: row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
        })
    })?;
    rows.collect()
}

pub fn get_heatmap_data(conn: &Connection, filters: &FilterParams, year: i32) -> Result<Vec<HeatmapPoint>> {
    let (mut where_clause, mut params) = build_where_clause(filters);
    let year_start = chrono::NaiveDate::from_ymd_opt(year, 1, 1)
        .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("invalid year: {}", year)))?;
    let year_end = chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1)
        .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("invalid year: {}", year + 1)))?;
    let start_ts = year_start.and_hms_opt(0, 0, 0)
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("invalid start time".to_string()))?
        .and_utc().timestamp() as f64;
    let end_ts = year_end.and_hms_opt(0, 0, 0)
        .ok_or_else(|| rusqlite::Error::InvalidParameterName("invalid end time".to_string()))?
        .and_utc().timestamp() as f64;
    
    if where_clause.is_empty() {
        where_clause = "WHERE timestamp >= ? AND timestamp < ?".to_string();
    } else {
        where_clause = format!("{} AND timestamp >= ? AND timestamp < ?", where_clause);
    }
    params.push(start_ts.into());
    params.push(end_ts.into());

    let sql = format!(
        "SELECT strftime('%Y-%m-%d', datetime(timestamp, 'unixepoch')), SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) FROM token_records {} GROUP BY strftime('%Y-%m-%d', datetime(timestamp, 'unixepoch')) ORDER BY 1",
        where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(HeatmapPoint {
            date: row.get(0)?,
            value: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
        })
    })?;
    rows.collect()
}

pub fn get_session_detail(conn: &Connection, session_id: &str) -> Result<Vec<TokenRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, source, session_id, agent_type, agent_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, project_path, message_id, cost_estimate FROM token_records WHERE session_id = ? ORDER BY timestamp"
    )?;
    let rows = stmt.query_map([session_id], |row| {
        Ok(TokenRecord {
            id: row.get(0)?,
            source: row.get(1)?,
            session_id: row.get(2)?,
            agent_type: row.get(3)?,
            agent_id: row.get(4)?,
            timestamp: row.get(5)?,
            model: row.get(6)?,
            input_tokens: row.get(7)?,
            output_tokens: row.get(8)?,
            cache_read_tokens: row.get(9)?,
            cache_creation_tokens: row.get(10)?,
            project_path: row.get(11)?,
            message_id: row.get(12)?,
            cost_estimate: row.get(13)?,
        })
    })?;
    rows.collect()
}

pub fn get_filter_options(conn: &Connection) -> Result<(Vec<String>, Vec<String>, Vec<String>)> {
    let models: Vec<String> = conn.prepare("SELECT DISTINCT COALESCE(model, 'unknown') FROM token_records ORDER BY 1")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>>>()?;
    
    let projects: Vec<String> = conn.prepare("SELECT DISTINCT COALESCE(project_path, 'unknown') FROM token_records ORDER BY 1")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>>>()?;
    
    let sources: Vec<String> = conn.prepare("SELECT DISTINCT source FROM token_records ORDER BY 1")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>>>()?;

    Ok((sources, models, projects))
}

pub fn get_model_pricing(conn: &Connection) -> Result<Vec<ModelPricing>> {
    let mut stmt = conn.prepare("SELECT model, input_price, output_price, cache_read_price, cache_creation_price, currency FROM model_pricing ORDER BY model")?;
    let rows = stmt.query_map([], |row| {
        Ok(ModelPricing {
            model: row.get(0)?,
            input_price: row.get(1)?,
            output_price: row.get(2)?,
            cache_read_price: row.get(3)?,
            cache_creation_price: row.get(4)?,
            currency: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn set_model_pricing(conn: &Connection, pricing: &ModelPricing) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO model_pricing (model, input_price, output_price, cache_read_price, cache_creation_price, currency) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            &pricing.model,
            pricing.input_price,
            pricing.output_price,
            pricing.cache_read_price,
            pricing.cache_creation_price,
            &pricing.currency
        ],
    )?;
    Ok(())
}

pub fn get_hourly_distribution(conn: &Connection, filters: &FilterParams) -> Result<Vec<HourlyPoint>> {
    let (where_clause, params) = build_where_clause(filters);
    let sql = format!(
        "SELECT CAST(strftime('%H', datetime(timestamp, 'unixepoch')) AS INTEGER), SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens), COUNT(*) FROM token_records {} GROUP BY 1 ORDER BY 1",
        where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(HourlyPoint {
            hour: row.get(0)?,
            tokens: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
            requests: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
        })
    })?;
    rows.collect()
}

pub fn get_model_trend(conn: &Connection, filters: &FilterParams) -> Result<Vec<ModelTrendPoint>> {
    let (where_clause, params) = build_where_clause(filters);
    let sql = format!(
        "SELECT strftime('%Y-%m-%d', datetime(timestamp, 'unixepoch')), COALESCE(model, 'unknown'), SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) FROM token_records {} GROUP BY 1, 2 ORDER BY 1, 2",
        where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(ModelTrendPoint {
            date: row.get(0)?,
            model: row.get(1)?,
            tokens: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
        })
    })?;
    rows.collect()
}

pub fn get_cumulative_cost(conn: &Connection, filters: &FilterParams) -> Result<Vec<CumulativePoint>> {
    let (where_clause, params) = build_where_clause(filters);
    let sql = format!(
        "SELECT strftime('%Y-%m-%d', datetime(timestamp, 'unixepoch')), SUM(cost_estimate) FROM token_records {} GROUP BY 1 ORDER BY 1",
        where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(CumulativePoint {
            date: row.get(0)?,
            cost: row.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
        })
    })?;
    rows.collect()
}

pub fn get_scatter_data(conn: &Connection, filters: &FilterParams, limit: i64) -> Result<Vec<ScatterPoint>> {
    let (where_clause, params) = build_where_clause(filters);
    let sql = format!(
        "SELECT input_tokens, output_tokens, COALESCE(model, 'unknown'), cost_estimate FROM token_records {} ORDER BY timestamp DESC LIMIT ?",
        where_clause
    );
    let mut all_params = params.clone();
    all_params.push(limit.into());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(all_params.iter()), |row| {
        Ok(ScatterPoint {
            input: row.get(0)?,
            output: row.get(1)?,
            model: row.get(2)?,
            cost: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn get_sankey_data(conn: &Connection, filters: &FilterParams) -> Result<Vec<(String, String, i64)>> {
    let (where_clause, params) = build_where_clause(filters);
    let sql = format!(
        "SELECT source, COALESCE(model, 'unknown'), SUM(input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens) FROM token_records {} GROUP BY source, model ORDER BY 3 DESC",
        where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
    })?;
    rows.collect()
}

pub fn get_all_records_for_export(conn: &Connection, filters: &FilterParams) -> Result<Vec<TokenRecord>> {
    let (where_clause, params) = build_where_clause(filters);
    let sql = format!(
        "SELECT id, source, session_id, agent_type, agent_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, project_path, message_id, cost_estimate FROM token_records {} ORDER BY timestamp",
        where_clause
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
        Ok(TokenRecord {
            id: row.get(0)?,
            source: row.get(1)?,
            session_id: row.get(2)?,
            agent_type: row.get(3)?,
            agent_id: row.get(4)?,
            timestamp: row.get(5)?,
            model: row.get(6)?,
            input_tokens: row.get(7)?,
            output_tokens: row.get(8)?,
            cache_read_tokens: row.get(9)?,
            cache_creation_tokens: row.get(10)?,
            project_path: row.get(11)?,
            message_id: row.get(12)?,
            cost_estimate: row.get(13)?,
        })
    })?;
    rows.collect()
}
