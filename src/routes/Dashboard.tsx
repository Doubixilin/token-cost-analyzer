import { useEffect, useCallback } from "react";
import {
  Activity,
  DollarSign,
  Layers,
  Cpu,
  ArrowDownLeft,
  ArrowUpRight,
  Database,
} from "lucide-react";
import { useStatsStore } from "../stores/useStatsStore";
import { getOverviewStats, getTrendData, getFilterOptions, refreshData } from "../api/tauriCommands";
import StatCard from "../components/StatCard";
import TrendChart from "../components/TrendChart";
import FilterBar from "../components/FilterBar";

function formatNumber(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + "亿";
  if (num >= 10000) return (num / 10000).toFixed(1) + "万";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toLocaleString();
}

export default function Dashboard() {
  const {
    filters,
    overview,
    trendData,
    isLoading,
    setOverview,
    setTrendData,
    setLoading,
    setAvailableOptions,
  } = useStatsStore();

  const loadData = useCallback(async (autoSync = false) => {
    setLoading(true);
    try {
      const [stats, trend, options] = await Promise.all([
        getOverviewStats(filters),
        getTrendData(filters, "day"),
        getFilterOptions(),
      ]);
      setOverview(stats);
      setTrendData(trend);
      setAvailableOptions(options[0], options[1], options[2]);
      
      // Auto-sync if no data exists
      if (autoSync && options[0].length === 0) {
        await handleRefresh();
      }
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }, [filters, setOverview, setTrendData, setLoading, setAvailableOptions]);

  const handleRefresh = async () => {
    try {
      await refreshData();
      const [stats, trend, options] = await Promise.all([
        getOverviewStats(filters),
        getTrendData(filters, "day"),
        getFilterOptions(),
      ]);
      setOverview(stats);
      setTrendData(trend);
      setAvailableOptions(options[0], options[1], options[2]);
    } catch (e) {
      console.error("Refresh failed:", e);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const inputTokens = overview?.total_input || 0;
  const outputTokens = overview?.total_output || 0;
  const cacheRead = overview?.total_cache_read || 0;
  const cacheCreation = overview?.total_cache_creation || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--color-text)]">仪表盘</h2>
        {isLoading && (
          <span className="text-sm text-[var(--color-text-secondary)]">加载中...</span>
        )}
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
          title="Input Tokens"
          value={formatNumber(inputTokens)}
          icon={ArrowDownLeft}
          color="#3b82f6"
        />
        <StatCard
          title="Output Tokens"
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
