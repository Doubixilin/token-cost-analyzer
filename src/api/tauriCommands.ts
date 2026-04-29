import { invoke } from "@tauri-apps/api/core";
import type {
  OverviewStats,
  TrendPoint,
  DistributionItem,
  SessionSummary,
  TokenRecord,
  TopNItem,
  HeatmapPoint,
  ModelPricing,
  FilterParams,
  WidgetConfig,
} from "../types";

export const getOverviewStats = (filters: FilterParams): Promise<OverviewStats> =>
  invoke("get_overview_stats", { filters });

export const getTrendData = (filters: FilterParams, granularity: string): Promise<TrendPoint[]> =>
  invoke("get_trend_data", { filters, granularity });

export const getDistribution = (filters: FilterParams, dimension: string): Promise<DistributionItem[]> =>
  invoke("get_distribution", { filters, dimension });

export const getSessionList = (filters: FilterParams, limit: number, offset: number): Promise<SessionSummary[]> =>
  invoke("get_session_list", { filters, limit, offset });

export const getSessionDetail = (sessionId: string): Promise<TokenRecord[]> =>
  invoke("get_session_detail", { sessionId });

export const getTopN = (filters: FilterParams, dimension: string, metric: string, limit: number): Promise<TopNItem[]> =>
  invoke("get_top_n", { filters, dimension, metric, limit });

export const getHeatmapData = (filters: FilterParams, year: number): Promise<HeatmapPoint[]> =>
  invoke("get_heatmap_data", { filters, year });

export const getFilterOptions = (): Promise<[string[], string[], string[]]> =>
  invoke("get_filter_options");

export const refreshData = (): Promise<number> =>
  invoke("refresh_data");

export const getModelPricing = (): Promise<ModelPricing[]> =>
  invoke("get_model_pricing");

export const setModelPricing = (pricing: ModelPricing): Promise<void> =>
  invoke("set_model_pricing", { pricing });

export const exportData = (filters: FilterParams, format: string): Promise<string> =>
  invoke("export_data", { filters, format });

export const getHourlyDistribution = (filters: FilterParams): Promise<{ hour: number; tokens: number; requests: number }[]> =>
  invoke("get_hourly_distribution", { filters });

export const getModelTrend = (filters: FilterParams): Promise<{ date: string; model: string; tokens: number }[]> =>
  invoke("get_model_trend", { filters });

export const getCumulativeCost = (filters: FilterParams): Promise<{ date: string; cost: number }[]> =>
  invoke("get_cumulative_cost", { filters });

export const getScatterData = (filters: FilterParams, limit: number): Promise<{ input: number; output: number; model: string; cost: number }[]> =>
  invoke("get_scatter_data", { filters, limit });

export const getSankeyData = (filters: FilterParams): Promise<[string, string, number][]> =>
  invoke("get_sankey_data", { filters });

// --- 小组件命令 ---
export const toggleWidget = (): Promise<void> =>
  invoke("toggle_widget");

export const setWidgetIgnoreCursor = (label: string, ignore: boolean): Promise<void> =>
  invoke("set_widget_ignore_cursor", { label, ignore });

export const saveWidgetConfig = (config: WidgetConfig): Promise<void> =>
  invoke("save_widget_config", { config });

export const loadWidgetConfig = (): Promise<WidgetConfig> =>
  invoke("load_widget_config");

export const embedWidgetToDesktop = (): Promise<void> =>
  invoke("embed_widget_to_desktop");

export const unpinWidgetFromDesktop = (): Promise<void> =>
  invoke("unpin_widget_from_desktop");
