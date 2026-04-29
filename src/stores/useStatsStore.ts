import { create } from "zustand";
import type { OverviewStats, FilterParams, TrendPoint } from "../types";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
}

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
  theme: Theme;
  refreshVersion: number;
  setFilters: (filters: Partial<FilterParams>) => void;
  setOverview: (overview: OverviewStats) => void;
  setTrendData: (data: TrendPoint[]) => void;
  setLoading: (loading: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSyncTime: (time: Date) => void;
  setAvailableOptions: (sources: string[], models: string[], projects: string[]) => void;
  resetFilters: () => void;
  setTheme: (theme: Theme) => void;
  notifyRefresh: () => void;
}

const defaultFilters: FilterParams = {
  start_time: null,
  end_time: null,
  sources: null,
  models: null,
  projects: null,
  agent_types: null,
};

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

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
  theme: initialTheme,
  refreshVersion: 0,
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setOverview: (overview) => set({ overview }),
  setTrendData: (trendData) => set({ trendData }),
  setLoading: (isLoading) => set({ isLoading }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
  setAvailableOptions: (availableSources, availableModels, availableProjects) =>
    set({ availableSources, availableModels, availableProjects }),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  notifyRefresh: () => set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
}));
