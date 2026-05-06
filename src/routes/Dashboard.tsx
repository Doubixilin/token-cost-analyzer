import { useEffect, useCallback, useState } from "react";
import {
  Activity,
  DollarSign,
  Layers,
  Cpu,
  ArrowDownLeft,
  ArrowUpRight,
  Database,
  Download,
  RefreshCw,
} from "lucide-react";
import { useStatsStore } from "../stores/useStatsStore";
import { getOverviewStats, getTrendData, getFilterOptions, refreshData, exportData } from "../api/tauriCommands";
import { emit } from "@tauri-apps/api/event";
import StatCard from "../components/StatCard";
import TrendChart from "../components/TrendChart";
import FilterBar from "../components/FilterBar";

import { formatNumber, formatCost } from "../utils/formatter";

export default function Dashboard() {
  const filters = useStatsStore((s) => s.filters);
  const refreshVersion = useStatsStore((s) => s.refreshVersion);
  const overview = useStatsStore((s) => s.overview);
  const trendData = useStatsStore((s) => s.trendData);
  const costDisplaySettings = useStatsStore((s) => s.costDisplaySettings);
  const isLoading = useStatsStore((s) => s.isLoading);
  const isSyncing = useStatsStore((s) => s.isSyncing);
  const setOverview = useStatsStore((s) => s.setOverview);
  const setTrendData = useStatsStore((s) => s.setTrendData);
  const setLoading = useStatsStore((s) => s.setLoading);
  const setSyncing = useStatsStore((s) => s.setSyncing);
  const setAvailableOptions = useStatsStore((s) => s.setAvailableOptions);
  const notifyRefresh = useStatsStore((s) => s.notifyRefresh);
  const [exporting, setExporting] = useState(false);
  const [dataChecked, setDataChecked] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    const [stats, trend, options] = await Promise.all([
      getOverviewStats(filters),
      getTrendData(filters, "day"),
      getFilterOptions(),
    ]);
    setOverview(stats);
    setTrendData(trend);
    setAvailableOptions(options.sources, options.models, options.projects);
  }, [filters, setOverview, setTrendData, setAvailableOptions]);

  // Re-fetch when filters change or sidebar triggers refresh
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDashboardData()
      .catch((e) => console.error("Failed to load dashboard data:", e))
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setDataChecked(true);
        }
      });
    return () => { cancelled = true; };
  }, [fetchDashboardData, refreshVersion, setLoading]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const count = await refreshData();
      console.log(`[Dashboard] Manual sync completed: ${count} records`);
      notifyRefresh();
      emit("data-synced", {}).catch(() => {});
    } catch (e) {
      console.error("Manual sync failed:", e);
    } finally {
      setSyncing(false);
    }
  };

  const inputTokens = overview?.total_input || 0;
  const outputTokens = overview?.total_output || 0;
  const cacheRead = overview?.total_cache_read || 0;
  const cacheCreation = overview?.total_cache_creation || 0;

  const handleExport = async (format: string) => {
    setExporting(true);
    try {
      const data = await exportData(filters, format);
      const blob = new Blob([data], { type: format === "csv" ? "text/csv" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `token_export_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--color-text)]">仪表盘</h2>
        <div className="flex items-center gap-3">
          {isSyncing && (
            <span className="text-sm text-[var(--color-primary)] flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              正在同步数据...
            </span>
          )}
          {isLoading && !isSyncing && (
            <span className="text-sm text-[var(--color-text-secondary)]">加载中...</span>
          )}
          <button
            onClick={() => handleExport("csv")}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            {exporting ? "导出中..." : "导出 CSV"}
          </button>
          <button
            onClick={() => handleExport("json")}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
          >
            <Download size={14} />
            JSON
          </button>

        </div>
      </div>

      <FilterBar />

      {/* Empty state prompt */}
      {dataChecked && overview === null && !isSyncing && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center shadow-sm">
          <Database size={40} className="mx-auto mb-4 text-[var(--color-text-secondary)]" />
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">暂无数据</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            数据库中暂无 Token 记录。首次同步可能需要几分钟（约 1,100+ 文件）。
          </p>
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "同步中..." : "立即同步数据"}
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="总请求数"
          value={formatNumber(overview?.total_requests || 0)}
          icon={Activity}
          color="#3b82f6"
        />
        <StatCard
          title="总成本"
          value={formatCost(overview?.total_cost || 0, costDisplaySettings)}
          icon={DollarSign}
          color="#10b981"
        />
        <StatCard
          title="总 Token 数"
          value={formatNumber(overview?.total_tokens || 0)}
          subValue={`Input: ${formatNumber(inputTokens)} / Output: ${formatNumber(outputTokens)}`}
          icon={Layers}
          color="#8b5cf6"
        />
        <StatCard
          title="缓存 Token"
          value={formatNumber(cacheRead + cacheCreation)}
          subValue={`创建: ${formatNumber(cacheCreation)} / 命中: ${formatNumber(cacheRead)}`}
          icon={Database}
          color="#f59e0b"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="输入 Tokens"
          value={formatNumber(inputTokens)}
          icon={ArrowDownLeft}
          color="#3b82f6"
        />
        <StatCard
          title="输出 Tokens"
          value={formatNumber(outputTokens)}
          icon={ArrowUpRight}
          color="#10b981"
        />
        <StatCard
          title="缓存读取"
          value={formatNumber(cacheRead)}
          icon={Cpu}
          color="#f59e0b"
        />
      </div>

      {/* Trend Chart */}
      <TrendChart data={trendData} showCost={true} />
    </div>
  );
}
