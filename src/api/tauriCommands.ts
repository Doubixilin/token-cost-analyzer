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
