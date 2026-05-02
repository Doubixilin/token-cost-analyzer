import { create } from "zustand";
import type { OverviewStats, TrendPoint, DistributionItem, TopNItem, WidgetConfig } from "../types";
import { saveWidgetConfig, loadWidgetConfig } from "../api/tauriCommands";

const DEFAULT_CONFIG: WidgetConfig = {
  locked: false,
  pinned_to_desktop: false,
  selected_modules: ["overview", "trend", "source_split"],
  layout: "vertical",
  width: 320,
  height: 440,
  x: null,
  y: null,
  theme: "auto",
  refresh_interval_sec: 300,
  time_period: "7d",
};

export type HourlyData = { hour: number; tokens: number; requests: number };

interface WidgetState {
  config: WidgetConfig;
  overview: OverviewStats | null;
  trendData: TrendPoint[];
  distribution: DistributionItem[];
  modelDistribution: DistributionItem[];
  hourlyData: HourlyData[];
  topProjects: TopNItem[];
  isLoading: boolean;
  refreshVersion: number;
  showSettings: boolean;

  setConfig: (partial: Partial<WidgetConfig>) => void;
  setOverview: (data: OverviewStats) => void;
  setTrendData: (data: TrendPoint[]) => void;
  setDistribution: (data: DistributionItem[]) => void;
  setModelDistribution: (data: DistributionItem[]) => void;
  setHourlyData: (data: HourlyData[]) => void;
  setTopProjects: (data: TopNItem[]) => void;
  setLoading: (v: boolean) => void;
  bumpRefresh: () => void;
  toggleSettings: () => void;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
}

export const useWidgetStore = create<WidgetState>((set, get) => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  return {
  config: DEFAULT_CONFIG,
  overview: null,
  trendData: [],
  distribution: [],
  modelDistribution: [],
  hourlyData: [],
  topProjects: [],
  isLoading: false,
  refreshVersion: 0,
  showSettings: false,

  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => get().saveConfig(), 2000);
  },

  setOverview: (data) => set({ overview: data }),
  setTrendData: (data) => set({ trendData: data }),
  setDistribution: (data) => set({ distribution: data }),
  setModelDistribution: (data) => set({ modelDistribution: data }),
  setHourlyData: (data) => set({ hourlyData: data }),
  setTopProjects: (data) => set({ topProjects: data }),
  setLoading: (v) => set({ isLoading: v }),
  bumpRefresh: () => set((s) => ({ refreshVersion: s.refreshVersion + 1 })),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),

  loadConfig: async () => {
    try {
      const config = await loadWidgetConfig();
      set({ config: { ...DEFAULT_CONFIG, ...config } });
    } catch {
      set({ config: DEFAULT_CONFIG });
    }
  },

  saveConfig: async () => {
    try {
      await saveWidgetConfig(get().config);
    } catch (e) {
      console.error("保存小组件配置失败:", e);
    }
  },
  };
});
