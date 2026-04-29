import { useEffect, Component, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Activity, RefreshCw, Settings, Lock, Unlock, Pin, PinOff, X } from "lucide-react";
import { getOverviewStats, getTrendData, getDistribution, embedWidgetToDesktop, unpinWidgetFromDesktop } from "../api/tauriCommands";
import { formatCost, formatTokens, formatNumber } from "../utils/formatter";
import { useWidgetStore } from "../stores/useWidgetStore";
import type { OverviewStats, TrendPoint, DistributionItem } from "../types";
import dayjs from "dayjs";

// --- Stat Mini Card ---
function StatMini({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="widget-card flex items-center gap-3 px-3 py-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold" style={{ backgroundColor: color + "20", color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-[var(--color-text-secondary)] leading-tight">{label}</p>
        <p className="text-[15px] font-bold text-[var(--color-text)] leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

// --- Overview Module ---
function OverviewModule({ overview }: { overview: OverviewStats | null }) {
  if (!overview) return (
    <div className="widget-card px-3 py-4 text-center">
      <p className="text-[11px] text-[var(--color-text-secondary)]">暂无数据</p>
      <p className="text-[9px] text-[var(--color-text-secondary)] mt-1">请先在主窗口同步数据</p>
    </div>
  );
  return (
    <div className="space-y-1.5">
      <StatMini icon="$" label="总成本" value={formatCost(overview.total_cost)} color="#10b981" />
      <StatMini icon="T" label="总 Token" value={formatTokens(overview.total_tokens)} color="#3b82f6" />
      <StatMini icon="#" label="总请求" value={formatNumber(overview.total_requests)} color="#8b5cf6" />
    </div>
  );
}

// --- Mini Trend Module ---
function MiniTrendModule({ trendData }: { trendData: TrendPoint[] }) {
  if (trendData.length === 0) return null;
  const recent = trendData.slice(-14);
  const maxVal = Math.max(...recent.map(d => d.input_tokens + d.output_tokens), 1);

  return (
    <div className="widget-card px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">近 {recent.length} 天趋势</p>
      <div className="flex items-end gap-[2px] h-[48px]">
        {recent.map((d, i) => {
          const total = d.input_tokens + d.output_tokens || 1;
          const h = (total / maxVal) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end h-full gap-[1px]">
              <div className="rounded-t-[2px] bg-[#3b82f6] opacity-80" style={{ height: `${(d.input_tokens / total) * h}%` }} />
              <div className="rounded-t-[2px] bg-[#10b981] opacity-80" style={{ height: `${(d.output_tokens / total) * h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-[var(--color-text-secondary)]">{dayjs(recent[0].date).format("MM/DD")}</span>
        <span className="text-[9px] text-[var(--color-text-secondary)]">{dayjs(recent[recent.length - 1].date).format("MM/DD")}</span>
      </div>
    </div>
  );
}

// --- Source Split Module ---
function SourceSplitModule({ distribution }: { distribution: DistributionItem[] }) {
  if (distribution.length === 0) return null;
  const total = distribution.reduce((s, d) => s + d.value, 0) || 1;
  const colors: Record<string, string> = { claude: "#8b5cf6", kimi: "#3b82f6" };

  return (
    <div className="widget-card px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">工具分布</p>
      <div className="space-y-1.5">
        {distribution.map(d => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[d.name.toLowerCase()] || "#94a3b8" }} />
            <span className="text-[11px] text-[var(--color-text)] flex-1 truncate">{d.name}</span>
            <span className="text-[11px] font-medium text-[var(--color-text)]">{((d.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-[var(--color-border)]">
        {distribution.map(d => (
          <div key={d.name} className="h-full" style={{ width: `${(d.value / total) * 100}%`, backgroundColor: colors[d.name.toLowerCase()] || "#94a3b8" }} />
        ))}
      </div>
    </div>
  );
}

// --- Model Distribution Module ---
function ModelDistModule({ modelDistribution }: { modelDistribution: DistributionItem[] }) {
  if (modelDistribution.length === 0) return null;
  const top5 = modelDistribution.slice(0, 5);
  const maxVal = Math.max(...top5.map(d => d.value), 1);
  const barColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

  return (
    <div className="widget-card px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">模型分布 (Top 5)</p>
      <div className="space-y-1.5">
        {top5.map((d, i) => (
          <div key={d.name} className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-[var(--color-text)] truncate max-w-[70%]">{d.name}</span>
              <span className="text-[10px] text-[var(--color-text-secondary)]">{formatTokens(d.value)}</span>
            </div>
            <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${(d.value / maxVal) * 100}%`, backgroundColor: barColors[i % barColors.length] }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Cache Stats Module ---
function CacheStatsModule({ overview }: { overview: OverviewStats | null }) {
  if (!overview) return null;
  const totalCache = overview.total_cache_read + overview.total_cache_creation;
  if (totalCache === 0) return null;
  const readPct = (overview.total_cache_read / totalCache) * 100;

  return (
    <div className="widget-card px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">缓存效率</p>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex h-2 rounded-full overflow-hidden bg-[var(--color-border)]">
            <div className="h-full bg-[#10b981]" style={{ width: `${readPct}%` }} />
            <div className="h-full bg-[#f59e0b]" style={{ width: `${100 - readPct}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-[#10b981]">读取 {formatTokens(overview.total_cache_read)}</span>
            <span className="text-[9px] text-[#f59e0b]">创建 {formatTokens(overview.total_cache_creation)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[16px] font-bold text-[var(--color-text)]">{readPct.toFixed(0)}%</p>
          <p className="text-[9px] text-[var(--color-text-secondary)]">命中率</p>
        </div>
      </div>
    </div>
  );
}

// --- Module Registry ---
interface ModuleProps {
  overview: OverviewStats | null;
  trendData: TrendPoint[];
  distribution: DistributionItem[];
  modelDistribution: DistributionItem[];
}

const MODULE_MAP: Record<string, React.FC<ModuleProps>> = {
  overview: ({ overview }) => <OverviewModule overview={overview} />,
  trend: ({ trendData }) => <MiniTrendModule trendData={trendData} />,
  source_split: ({ distribution }) => <SourceSplitModule distribution={distribution} />,
  model_dist: ({ modelDistribution }) => <ModelDistModule modelDistribution={modelDistribution} />,
  cache_stats: ({ overview }) => <CacheStatsModule overview={overview} />,
};

const MODULE_LABELS: Record<string, string> = {
  overview: "概览统计",
  trend: "消耗趋势",
  source_split: "工具分布",
  model_dist: "模型分布",
  cache_stats: "缓存效率",
};

// --- Settings Panel ---
function SettingsPanel() {
  const { config, setConfig } = useWidgetStore();
  const allModuleIds = Object.keys(MODULE_MAP);

  const toggleModule = (id: string) => {
    const current = config.selected_modules;
    setConfig({ selected_modules: current.includes(id) ? current.filter(m => m !== id) : [...current, id] });
  };

  return (
    <div className="px-3 py-2.5 space-y-3 border-t border-[var(--color-border)]">
      <div>
        <p className="text-[11px] text-[var(--color-text-secondary)] mb-1.5">透明度</p>
        <input
          type="range" min={30} max={100} step={5} value={Math.round(config.opacity * 100)}
          onChange={e => setConfig({ opacity: Number(e.target.value) / 100 })}
          className="w-full h-1.5 rounded-full appearance-none bg-[var(--color-border)] accent-[var(--color-primary)]"
        />
      </div>
      <div>
        <p className="text-[11px] text-[var(--color-text-secondary)] mb-1.5">显示模块</p>
        <div className="space-y-1">
          {allModuleIds.map(id => (
            <label key={id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox" checked={config.selected_modules.includes(id)}
                onChange={() => toggleModule(id)}
                className="w-3.5 h-3.5 rounded accent-[var(--color-primary)]"
              />
              <span className="text-[11px] text-[var(--color-text)]">{MODULE_LABELS[id] || id}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Widget Header ---
function WidgetHeader() {
  const { config, setConfig, toggleSettings, bumpRefresh, isLoading } = useWidgetStore();

  const handleClose = async () => {
    try { await getCurrentWindow().hide(); } catch (e) { console.error(e); }
  };

  const handlePin = async () => {
    try {
      if (config.pinned_to_desktop) {
        await unpinWidgetFromDesktop();
        setConfig({ pinned_to_desktop: false });
      } else {
        await embedWidgetToDesktop();
        setConfig({ pinned_to_desktop: true });
      }
    } catch (e) {
      console.error("桌面钉入操作失败:", e);
    }
  };

  return (
    <div className="flex items-center justify-between px-3 py-2 select-none" {...(!config.locked ? { "data-tauri-drag-region": "" } : {})}>
      <div className="flex items-center gap-2 pointer-events-none">
        <Activity size={14} className="text-[var(--color-primary)]" />
        <span className="text-[12px] font-semibold text-[var(--color-text)]">Token 小组件</span>
      </div>
      <div className="flex items-center gap-0.5">
        <button onClick={bumpRefresh} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" title="刷新">
          <RefreshCw size={13} className={`text-[var(--color-text-secondary)] ${isLoading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={toggleSettings} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" title="设置">
          <Settings size={13} className="text-[var(--color-text-secondary)]" />
        </button>
        <button onClick={handlePin} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" title={config.pinned_to_desktop ? "取消钉入" : "钉入桌面"}>
          {config.pinned_to_desktop
            ? <PinOff size={13} className="text-[var(--color-primary)]" />
            : <Pin size={13} className="text-[var(--color-text-secondary)]" />
          }
        </button>
        <button onClick={() => setConfig({ locked: !config.locked })} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" title={config.locked ? "解锁" : "锁定"}>
          {config.locked ? <Lock size={13} className="text-[var(--color-text-secondary)]" /> : <Unlock size={13} className="text-[var(--color-text-secondary)]" />}
        </button>
        <button onClick={handleClose} className="p-1.5 rounded-md hover:bg-red-500/20 transition-colors" title="关闭">
          <X size={13} className="text-[var(--color-text-secondary)]" />
        </button>
      </div>
    </div>
  );
}

// --- Error Boundary ---
class WidgetErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: "" };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="widget-glass h-full flex flex-col items-center justify-center p-4 text-center">
          <p className="text-[12px] text-[var(--color-danger)] mb-2">组件加载出错</p>
          <p className="text-[10px] text-[var(--color-text-secondary)] mb-3">{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false })} className="text-[11px] px-3 py-1 rounded-md bg-[var(--color-primary)] text-white">
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main Widget App ---
export default function WidgetApp() {
  const {
    config, overview, trendData, distribution, modelDistribution,
    setOverview, setTrendData, setDistribution, setModelDistribution, setLoading,
    isLoading, refreshVersion, showSettings, loadConfig,
  } = useWidgetStore();

  // 初始化：加载配置
  useEffect(() => { loadConfig(); }, []);

  // 应用主题
  useEffect(() => {
    const applyTheme = () => {
      if (config.theme === "dark" || (config.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };
    applyTheme();
    if (config.theme === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", applyTheme);
      return () => mq.removeEventListener("change", applyTheme);
    }
  }, [config.theme]);

  // 应用透明度
  useEffect(() => {
    document.documentElement.style.opacity = String(config.opacity);
  }, [config.opacity]);

  // 拉取数据
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const emptyFilters = { start_time: null, end_time: null, sources: null, models: null, projects: null, agent_types: null };
        const [ov, trend, dist, modelDist] = await Promise.all([
          getOverviewStats(emptyFilters),
          getTrendData(emptyFilters, "day"),
          getDistribution(emptyFilters, "source"),
          getDistribution(emptyFilters, "model"),
        ]);
        if (!cancelled) {
          setOverview(ov);
          setTrendData(trend);
          setDistribution(dist);
          setModelDistribution(modelDist);
        }
      } catch (e) {
        console.error("小组件数据加载失败:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [refreshVersion]);

  // 自动刷新
  useEffect(() => {
    if (config.refresh_interval_sec <= 0) return;
    const timer = setInterval(() => {
      useWidgetStore.getState().bumpRefresh();
    }, config.refresh_interval_sec * 1000);
    return () => clearInterval(timer);
  }, [config.refresh_interval_sec]);

  const dataProps = { overview, trendData, distribution, modelDistribution };

  return (
    <WidgetErrorBoundary>
      <div className="h-full flex flex-col">
        <div className="widget-glass h-full flex flex-col overflow-hidden">
          <WidgetHeader />

          <div className="flex-1 overflow-y-auto px-2.5 pb-2.5 space-y-2">
            {!overview && isLoading && (
              <div className="text-center py-8 text-[11px] text-[var(--color-text-secondary)]">
                加载数据中...
              </div>
            )}
            {config.selected_modules.map(id => {
              const Comp = MODULE_MAP[id];
              if (!Comp) return null;
              return <Comp key={id} {...dataProps} />;
            })}
            {config.selected_modules.length === 0 && (
              <div className="text-center py-8 text-[11px] text-[var(--color-text-secondary)]">
                请在设置中选择显示模块
              </div>
            )}
          </div>

          {showSettings && <SettingsPanel />}
        </div>
      </div>
    </WidgetErrorBoundary>
  );
}
