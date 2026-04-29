import { useEffect, useCallback, useState, useRef } from "react";
import {
  Activity,
  DollarSign,
  Layers,
  Cpu,
  ArrowDownLeft,
  ArrowUpRight,
  Database,
  Download,
} from "lucide-react";
import { useStatsStore } from "../stores/useStatsStore";
import { getOverviewStats, getTrendData, getFilterOptions, refreshData, exportData } from "../api/tauriCommands";
import StatCard from "../components/StatCard";
import TrendChart from "../components/TrendChart";
import FilterBar from "../components/FilterBar";

import { formatNumber } from "../utils/formatter";

export default function Dashboard() {
  const filters = useStatsStore((s) => s.filters);
  const overview = useStatsStore((s) => s.overview);
  const trendData = useStatsStore((s) => s.trendData);
  const isLoading = useStatsStore((s) => s.isLoading);
  const setOverview = useStatsStore((s) => s.setOverview);
  const setTrendData = useStatsStore((s) => s.setTrendData);
  const setLoading = useStatsStore((s) => s.setLoading);
  const setAvailableOptions = useStatsStore((s) => s.setAvailableOptions);
  const [exporting, setExporting] = useState(false);
  const autoSyncedRef = useRef(false);
  const refreshVersion = useStatsStore((s) => s.refreshVersion);

  const fetchDashboardData = useCallback(async () => {
    const [stats, trend, options] = await Promise.all([
      getOverviewStats(filters),
      getTrendData(filters, "day"),
      getFilterOptions(),
    ]);
    setOverview(stats);
    setTrendData(trend);
    setAvailableOptions(options[0], options[1], options[2]);
    return options[0].length === 0;
  }, [filters, setOverview, setTrendData, setAvailableOptions]);

  const loadData = useCallback(async (autoSync = false) => {
    let cancelled = false;
    setLoading(true);
    try {
      const isEmpty = await fetchDashboardData();
      if (cancelled) return;
      if (autoSync && isEmpty && !autoSyncedRef.current) {
        autoSyncedRef.current = true;
        await refreshData();
        if (cancelled) return;
        await fetchDashboardData();
      }
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, [fetchDashboardData, setLoading]);

  useEffect(() => {
    loadData(true);
  }, [loadData, refreshVersion]);

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
      a.click();
      URL.revokeObjectURL(url);
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
          {isLoading && (
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
          value={`$${(overview?.total_cost || 0).toFixed(4)}`}
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
