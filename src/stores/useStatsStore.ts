import { create } from "zustand";
import type { OverviewStats, FilterParams, TrendPoint } from "../types";

interface StatsState {
  filters: FilterParams;
  overview: OverviewStats | null;
  trendData: TrendPoint[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  availableSources: string[];
  availableModels: string[];
  availableProjects: string[];
  setFilters: (filters: Partial<FilterParams>) => void;
  setOverview: (overview: OverviewStats) => void;
  setTrendData: (data: TrendPoint[]) => void;
  setLoading: (loading: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSyncTime: (time: Date) => void;
  setAvailableOptions: (sources: string[], models: string[], projects: string[]) => void;
  resetFilters: () => void;
}

const defaultFilters: FilterParams = {
  start_time: null,
  end_time: null,
  sources: null,
  models: null,
  projects: null,
  agent_types: null,
};

export const useStatsStore = create<StatsState>((set) => ({
  filters: { ...defaultFilters },
  overview: null,
  trendData: [],
  isLoading: false,
  isSyncing: false,
  lastSyncTime: null,
  availableSources: [],
  availableModels: [],
  availableProjects: [],
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setOverview: (overview) => set({ overview }),
  setTrendData: (trendData) => set({ trendData }),
  setLoading: (isLoading) => set({ isLoading }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
  setAvailableOptions: (availableSources, availableModels, availableProjects) =>
    set({ availableSources, availableModels, availableProjects }),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
}));
