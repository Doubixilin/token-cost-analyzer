import { useEffect, useState, useCallback, useRef, useMemo, Component, type ReactNode, memo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Activity, RefreshCw, Settings, Lock, Unlock, Pin, PinOff, X, AlertCircle, GripVertical } from "lucide-react";
import { getOverviewStats, getTrendData, getDistribution, getHourlyDistribution, getTopN, embedWidgetToDesktop, unpinWidgetFromDesktop } from "../api/tauriCommands";
import { formatCost, formatTokens, formatNumber } from "../utils/formatter";
import { useWidgetStore } from "../stores/useWidgetStore";
import type { FilterParams, TimePeriod } from "../types";
import dayjs from "dayjs";

// --- Color palette ---
const PALETTE = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];
function useColorMap(keys: string[]): Map<string, string> {
  return useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, PALETTE[idx % PALETTE.length]);
        idx++;
      }
    }
    return map;
  }, [keys]);
}

// --- Filter helpers ---
function getFiltersFromPeriod(period: TimePeriod): FilterParams {
  const base = { sources: null, models: null, projects: null, agent_types: null };
  switch (period) {
    case "today":
      return { ...base, start_time: dayjs().startOf("day").unix(), end_time: dayjs().endOf("day").unix() };
    case "7d":
      return { ...base, start_time: dayjs().subtract(7, "day").startOf("day").unix(), end_time: dayjs().endOf("day").unix() };
    case "30d":
      return { ...base, start_time: dayjs().subtract(30, "day").startOf("day").unix(), end_time: dayjs().endOf("day").unix() };
    case "all":
    default:
      return { ...base, start_time: null, end_time: null };
  }
}

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "today", label: "今天" },
  { value: "7d", label: "7天" },
  { value: "30d", label: "30天" },
  { value: "all", label: "全部" },
];

// --- Stat Mini Card ---
const StatMini = memo(function StatMini({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="widget-card flex items-center gap-2.5 px-2.5 py-2">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0" style={{ backgroundColor: color + "20", color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-[var(--color-text-secondary)] leading-tight">{label}</p>
        <p className="text-[15px] font-bold text-[var(--color-text)] leading-tight truncate">{value}</p>
      </div>
    </div>
  );
});

// --- Empty placeholder ---
function EmptyModule({ text }: { text: string }) {
  return (
    <div className="widget-card px-3 py-4 text-center">
      <p className="text-[11px] text-[var(--color-text-secondary)]">{text}</p>
    </div>
  );
}

// --- Overview Module (2x2 grid) ---
const OverviewModule = memo(function OverviewModule() {
  const overview = useWidgetStore(s => s.overview);
  if (!overview) return <EmptyModule text="暂无数据 — 请先在主窗口同步" />;

  const totalCache = overview.total_cache_read + overview.total_cache_creation;
  const cacheHitRate = totalCache > 0 ? (overview.total_cache_read / totalCache) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <StatMini icon="$" label="总成本" value={formatCost(overview.total_cost)} color="#10b981" />
      <StatMini icon="T" label="总 Token" value={formatTokens(overview.total_tokens)} color="#3b82f6" />
      <StatMini icon="#" label="总请求" value={formatNumber(overview.total_requests)} color="#8b5cf6" />
      <StatMini icon="%" label="缓存命中" value={totalCache > 0 ? `${cacheHitRate.toFixed(0)}%` : "—"} color="#f59e0b" />
    </div>
  );
});

// --- Sparkline Trend Module ---
const TrendModule = memo(function TrendModule() {
  const trendData = useWidgetStore(s => s.trendData);
  if (trendData.length === 0) return <EmptyModule text="暂无趋势数据" />;

  const recent = trendData.slice(-30);
  const values = recent.map(d => d.input_tokens + d.output_tokens);
  const maxVal = Math.max(...values, 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const w = 280;
  const h = 48;
  const padX = 2;
  const padY = 4;
  const plotW = w - padX * 2;
  const plotH = h - padY * 2;

  const points = values.map((v, i) => {
    const x = padX + (i / Math.max(values.length - 1, 1)) * plotW;
    const y = padY + plotH - ((v - minVal) / range) * plotH;
    return `${x},${y}`;
  });

  const linePoints = points.join(" ");
  const areaPoints = `${padX},${padY + plotH} ${linePoints} ${padX + plotW},${padY + plotH}`;

  const latestVal = values[values.length - 1] || 0;

  return (
    <div className="widget-card px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] text-[var(--color-text-secondary)]">消耗趋势</p>
        <span className="text-[11px] font-medium text-[var(--color-text)]">{formatTokens(latestVal)}</span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#sparkFill)" />
        <polyline points={linePoints} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-[var(--color-text-secondary)]">{dayjs(recent[0].date).format("MM/DD")}</span>
        <span className="text-[9px] text-[var(--color-text-secondary)]">{dayjs(recent[recent.length - 1].date).format("MM/DD")}</span>
      </div>
    </div>
  );
});

// --- Source Split Module ---
const SourceSplitModule = memo(function SourceSplitModule() {
  const distribution = useWidgetStore(s => s.distribution);
  const colorMap = useColorMap(distribution.map(d => d.name));
  if (distribution.length === 0) return <EmptyModule text="暂无工具分布数据" />;
  const total = distribution.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div className="widget-card px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">工具分布</p>
      <div className="space-y-1.5">
        {distribution.map(d => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorMap.get(d.name.toLowerCase()) }} />
            <span className="text-[11px] text-[var(--color-text)] flex-1 truncate">{d.name}</span>
            <span className="text-[11px] font-medium text-[var(--color-text)]">{((d.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-[var(--color-border)]">
        {distribution.map(d => (
          <div key={d.name} className="h-full transition-[width]" style={{ width: `${(d.value / total) * 100}%`, backgroundColor: colorMap.get(d.name.toLowerCase()) }} />
        ))}
      </div>
    </div>
  );
});

// --- Model Distribution Module ---
const ModelDistModule = memo(function ModelDistModule() {
  const modelDistribution = useWidgetStore(s => s.modelDistribution);
  if (modelDistribution.length === 0) return <EmptyModule text="暂无模型分布数据" />;
  const top5 = modelDistribution.slice(0, 5);
  const maxVal = Math.max(...top5.map(d => d.value), 1);

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
              <div className="h-full rounded-full transition-[width]" style={{ width: `${(d.value / maxVal) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// --- Hourly Distribution Module ---
const HourlyDistModule = memo(function HourlyDistModule() {
  const hourlyData = useWidgetStore(s => s.hourlyData);
  if (hourlyData.length === 0) return <EmptyModule text="暂无时段分布数据" />;

  const map = new Map<number, number>();
  for (const d of hourlyData) map.set(d.hour, d.tokens);
  const maxVal = Math.max(...Array.from(map.values()), 1);

  return (
    <div className="widget-card px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">时段分布</p>
      <div className="flex items-end gap-[2px] h-[40px]">
        {Array.from({ length: 24 }, (_, i) => {
          const val = map.get(i) || 0;
          const pct = (val / maxVal) * 100;
          return (
            <div key={i} className="flex-1 flex items-end h-full">
              <div
                className="w-full rounded-t-[1px] transition-[height]"
                style={{ height: `${Math.max(pct, 2)}%`, backgroundColor: val > 0 ? "#8b5cf6" : "var(--color-border)", opacity: val > 0 ? 0.8 : 0.3 }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[8px] text-[var(--color-text-secondary)]">0h</span>
        <span className="text-[8px] text-[var(--color-text-secondary)]">12h</span>
        <span className="text-[8px] text-[var(--color-text-secondary)]">23h</span>
      </div>
    </div>
  );
});

// --- Top Projects Module ---
const TopProjectsModule = memo(function TopProjectsModule() {
  const topProjects = useWidgetStore(s => s.topProjects);
  if (topProjects.length === 0) return <EmptyModule text="暂无项目消耗数据" />;
  const maxVal = Math.max(...topProjects.map(d => d.value), 1);

  return (
    <div className="widget-card px-3 py-2.5">
      <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">项目消耗 Top 5</p>
      <div className="space-y-1.5">
        {topProjects.slice(0, 5).map((d, i) => {
          const shortName = d.name.split(/[/\\]/).pop() || d.name;
          return (
            <div key={d.id} className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-[10px] text-[var(--color-text)] truncate max-w-[70%]" title={d.name}>{shortName}</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">{formatTokens(d.value)}</span>
              </div>
              <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-[width]" style={{ width: `${(d.value / maxVal) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// --- Module Registry ---
const MODULE_MAP: Record<string, React.FC> = {
  overview: OverviewModule,
  trend: TrendModule,
  source_split: SourceSplitModule,
  model_dist: ModelDistModule,
  hourly_dist: HourlyDistModule,
  top_projects: TopProjectsModule,
};

const MODULE_LABELS: Record<string, string> = {
  overview: "概览统计",
  trend: "消耗趋势",
  source_split: "工具分布",
  model_dist: "模型分布",
  hourly_dist: "时段分布",
  top_projects: "项目消耗",
};

// --- Time Period Selector ---
const TimePeriodSelector = memo(function TimePeriodSelector() {
  const timePeriod = useWidgetStore(s => s.config.time_period);
  const setConfig = useWidgetStore(s => s.setConfig);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      {PERIOD_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => setConfig({ time_period: opt.value })}
          className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
            timePeriod === opt.value
              ? "bg-[var(--color-primary)] text-white shadow-sm"
              : "bg-white/10 border border-white/15 text-[var(--color-text-secondary)] hover:bg-white/20 dark:bg-white/5 dark:border-white/10"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
});

// --- Settings Panel ---
const SettingsPanel = memo(function SettingsPanel() {
  const config = useWidgetStore(s => s.config);
  const setConfig = useWidgetStore(s => s.setConfig);
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
});

// --- Widget Header ---
const WidgetHeader = memo(function WidgetHeader() {
  const locked = useWidgetStore(s => s.config.locked);
  const pinned = useWidgetStore(s => s.config.pinned_to_desktop);
  const setConfig = useWidgetStore(s => s.setConfig);
  const toggleSettings = useWidgetStore(s => s.toggleSettings);
  const bumpRefresh = useWidgetStore(s => s.bumpRefresh);
  const isLoading = useWidgetStore(s => s.isLoading);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      if (e.button === 0 && !locked) {
        getCurrentWindow().startDragging().catch(err =>
          console.error("[Widget] startDragging failed:", err)
        );
      }
    };
    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, [locked]);

  const handleClose = useCallback(async () => {
    try { await getCurrentWindow().hide(); } catch (e) { console.error("hide failed:", e); }
  }, []);

  const handlePin = useCallback(async () => {
    try {
      if (pinned) {
        await unpinWidgetFromDesktop();
        setConfig({ pinned_to_desktop: false });
      } else {
        await embedWidgetToDesktop();
        setConfig({ pinned_to_desktop: true });
      }
    } catch (e) {
      console.error("桌面钉入操作失败:", e);
    }
  }, [pinned, setConfig]);

  return (
    <div
      ref={headerRef}
      data-tauri-drag-region
      className={`flex items-center justify-between px-3 py-2 select-none ${locked ? "cursor-default" : "cursor-grab"}`}
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <Activity size={14} className="text-[var(--color-primary)]" />
        <span className="text-[12px] font-semibold text-[var(--color-text)]">Token 小组件</span>
        {!locked && <GripVertical size={12} className="text-[var(--color-text-secondary)] opacity-40" />}
      </div>
      <div data-no-drag className="flex items-center gap-0.5">
        <button onClick={bumpRefresh} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" aria-label="刷新数据">
          <RefreshCw size={13} className={`text-[var(--color-text-secondary)] ${isLoading ? "animate-spin" : ""}`} />
        </button>
        <button onClick={toggleSettings} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" aria-label="设置">
          <Settings size={13} className="text-[var(--color-text-secondary)]" />
        </button>
        <button onClick={handlePin} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" aria-label={pinned ? "取消钉入" : "钉入桌面"}>
          {pinned
            ? <PinOff size={13} className="text-[var(--color-primary)]" />
            : <Pin size={13} className="text-[var(--color-text-secondary)]" />
          }
        </button>
        <button onClick={() => setConfig({ locked: !locked })} className="p-1.5 rounded-md hover:bg-white/20 dark:hover:bg-white/10 transition-colors" aria-label={locked ? "解锁" : "锁定"}>
          {locked ? <Lock size={13} className="text-[var(--color-text-secondary)]" /> : <Unlock size={13} className="text-[var(--color-text-secondary)]" />}
        </button>
        <button onClick={handleClose} className="p-1.5 rounded-md hover:bg-red-500/20 transition-colors" aria-label="关闭">
          <X size={13} className="text-[var(--color-text-secondary)]" />
        </button>
      </div>
    </div>
  );
});

// --- Error toast ---
const ErrorToast = memo(function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const t = setTimeout(() => onDismissRef.current(), 4000);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <div className="mx-2.5 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/20 text-[10px] text-red-400">
      <AlertCircle size={12} />
      <span className="flex-1 truncate">{message}</span>
      <button onClick={onDismiss} className="shrink-0 hover:opacity-70"><X size={10} /></button>
    </div>
  );
});

// --- Widget Body (memo isolated) ---
const WidgetBody = memo(function WidgetBody() {
  const selectedModules = useWidgetStore(s => s.config.selected_modules);
  const isLoading = useWidgetStore(s => s.isLoading);
  const overview = useWidgetStore(s => s.overview);

  if (!overview && isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[11px] text-[var(--color-text-secondary)]">加载数据中...</p>
      </div>
    );
  }

  if (selectedModules.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[11px] text-[var(--color-text-secondary)]">请在设置中选择显示模块</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2.5 pb-2.5 space-y-2">
      {selectedModules.map(id => {
        const Comp = MODULE_MAP[id];
        if (!Comp) return null;
        return <Comp key={id} />;
      })}
    </div>
  );
});

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
  const config = useWidgetStore(s => s.config);
  const showSettings = useWidgetStore(s => s.showSettings);
  const loadConfig = useWidgetStore(s => s.loadConfig);
  const refreshVersion = useWidgetStore(s => s.refreshVersion);
  const setOverview = useWidgetStore(s => s.setOverview);
  const setTrendData = useWidgetStore(s => s.setTrendData);
  const setDistribution = useWidgetStore(s => s.setDistribution);
  const setModelDistribution = useWidgetStore(s => s.setModelDistribution);
  const setHourlyData = useWidgetStore(s => s.setHourlyData);
  const setTopProjects = useWidgetStore(s => s.setTopProjects);
  const setLoading = useWidgetStore(s => s.setLoading);

  const [error, setError] = useState<string | null>(null);

  // Initialize config
  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Listen for config changes from main app Settings page
  useEffect(() => {
    const unlisten = listen("widget-config-changed", () => {
      loadConfig();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [loadConfig]);

  // Apply theme
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

  // Apply opacity
  useEffect(() => {
    const root = document.documentElement;
    const glass = root.querySelector('.widget-glass') as HTMLElement | null;
    if (!glass) return;
    const alpha = config.opacity;
    const isDark = root.classList.contains("dark");
    glass.style.background = isDark
      ? `rgba(15, 23, 42, ${0.82 * alpha})`
      : `rgba(255, 255, 255, ${0.78 * alpha})`;
  }, [config.opacity, config.theme]);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const filters = getFiltersFromPeriod(config.time_period);
        const trendGranularity = config.time_period === "today" ? "hour" : "day";
        const [ov, trend, dist, modelDist, hourly, projects] = await Promise.all([
          getOverviewStats(filters),
          getTrendData(filters, trendGranularity),
          getDistribution(filters, "source"),
          getDistribution(filters, "model"),
          getHourlyDistribution(filters),
          getTopN(filters, "project", "tokens", 5),
        ]);
        if (!cancelled) {
          setOverview(ov);
          setTrendData(trend);
          setDistribution(dist);
          setModelDistribution(modelDist);
          setHourlyData(hourly);
          setTopProjects(projects);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError("数据加载失败，请检查主窗口同步状态");
        console.error("小组件数据加载失败:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [refreshVersion, config.time_period, setLoading, setOverview, setTrendData, setDistribution, setModelDistribution, setHourlyData, setTopProjects]);

  // Auto-refresh
  useEffect(() => {
    if (config.refresh_interval_sec <= 0) return;
    const timer = setInterval(() => {
      useWidgetStore.getState().bumpRefresh();
    }, config.refresh_interval_sec * 1000);
    return () => clearInterval(timer);
  }, [config.refresh_interval_sec]);

  return (
    <WidgetErrorBoundary>
      <div className="h-full flex flex-col">
        <div className="widget-glass h-full flex flex-col overflow-hidden">
          <WidgetHeader />
          <TimePeriodSelector />
          {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
          {showSettings && <SettingsPanel />}
          <WidgetBody />
        </div>
      </div>
    </WidgetErrorBoundary>
  );
}
