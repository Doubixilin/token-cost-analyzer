export interface OverviewStats {
  total_requests: number;
  total_cost: number;
  total_tokens: number;
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_cache_creation: number;
  currency: string;
}

export interface TrendPoint {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost: number;
}

export interface DistributionItem {
  name: string;
  value: number;
  cost: number;
}

export interface SessionSummary {
  session_id: string;
  source: string;
  project_path: string | null;
  start_time: number | null;
  end_time: number | null;
  total_input: number;
  total_output: number;
  total_cache_read: number;
  total_cache_creation: number;
  total_cost: number;
  message_count: number;
  agent_count: number;
}

export interface TokenRecord {
  id: number | null;
  source: string;
  session_id: string;
  agent_type: string;
  agent_id: string | null;
  timestamp: number;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  project_path: string | null;
  message_id: string | null;
  cost_estimate: number;
}

export interface TopNItem {
  id: string;
  name: string;
  value: number;
  cost: number;
}

export interface HeatmapPoint {
  date: string;
  value: number;
}

export interface ModelPricing {
  model: string;
  input_price: number;
  output_price: number;
  cache_read_price: number;
  cache_creation_price: number;
  currency: string;
}

export interface FilterParams {
  start_time: number | null;
  end_time: number | null;
  sources: string[] | null;
  models: string[] | null;
  projects: string[] | null;
  agent_types: string[] | null;
}

export type TimePeriod = "today" | "7d" | "30d" | "all";

export interface WidgetConfig {
  opacity: number;
  locked: boolean;
  pinned_to_desktop: boolean;
  selected_modules: string[];
  layout: "vertical" | "grid";
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  theme: "light" | "dark" | "auto";
  refresh_interval_sec: number;
  time_period: TimePeriod;
}
