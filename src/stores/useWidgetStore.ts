import { create } from "zustand";
import type { OverviewStats, TrendPoint, DistributionItem, WidgetConfig } from "../types";
import { saveWidgetConfig, loadWidgetConfig } from "../api/tauriCommands";

const DEFAULT_CONFIG: WidgetConfig = {
  opacity: 0.92,
  locked: false,
  pinned_to_desktop: false,
  selected_modules: ["overview", "trend", "source_split"],
  layout: "vertical",
  width: 360,
  height: 480,
  x: null,
  y: null,
  theme: "auto",
  refresh_interval_sec: 300,
};

interface WidgetState {
  config: WidgetConfig;
  overview: OverviewStats | null;
  trendData: TrendPoint[];
  distribution: DistributionItem[];
  modelDistribution: DistributionItem[];
  isLoading: boolean;
  refreshVersion: number;
  showSettings: boolean;

  setConfig: (partial: Partial<WidgetConfig>) => void;
  setOverview: (data: OverviewStats) => void;
  setTrendData: (data: TrendPoint[]) => void;
  setDistribution: (data: DistributionItem[]) => void;
  setModelDistribution: (data: DistributionItem[]) => void;
  setLoading: (v: boolean) => void;
  bumpRefresh: () => void;
  toggleSettings: () => void;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useWidgetStore = create<WidgetState>((set, get) => ({
  config: DEFAULT_CONFIG,
  overview: null,
  trendData: [],
  distribution: [],
  modelDistribution: [],
  isLoading: false,
  refreshVersion: 0,
  showSettings: false,

  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
    // 防抖保存
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => get().saveConfig(), 500);
  },

  setOverview: (data) => set({ overview: data }),
  setTrendData: (data) => set({ trendData: data }),
  setDistribution: (data) => set({ distribution: data }),
  setModelDistribution: (data) => set({ modelDistribution: data }),
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
}));
