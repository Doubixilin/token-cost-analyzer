import { useEffect, useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import echarts from "../utils/echarts-setup";
import { FileSpreadsheet } from "lucide-react";
import { useStatsStore } from "../stores/useStatsStore";
import { getDistribution, getHeatmapData, getTopN } from "../api/tauriCommands";
import type { DistributionItem, HeatmapPoint, TopNItem } from "../types";
import { formatTokens } from "../utils/formatter";
import { exportExcelReport } from "../utils/excelExport";
import { getChartColors } from "../utils/chartColors";
import AdvancedAnalytics from "../components/AdvancedAnalytics";

export default function Analytics() {
  const filters = useStatsStore((s) => s.filters);
  const refreshVersion = useStatsStore((s) => s.refreshVersion);
  const overview = useStatsStore((s) => s.overview);
  const trendData = useStatsStore((s) => s.trendData);
  const theme = useStatsStore((s) => s.theme);
  const cc = getChartColors(theme);
  const [modelDist, setModelDist] = useState<DistributionItem[]>([]);
  const [sourceDist, setSourceDist] = useState<DistributionItem[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [topSessions, setTopSessions] = useState<TopNItem[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDistribution(filters, "model"),
      getDistribution(filters, "source"),
      getHeatmapData(filters, currentYear),
      getTopN(filters, "session", "tokens", 10),
    ])
      .then(([models, sources, heatmap, top]) => {
        if (cancelled) return;
        setModelDist(models);
        setSourceDist(sources);
        setHeatmapData(heatmap);
        setTopSessions(top);
      })
      .catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, [filters, currentYear, refreshVersion]);

  const modelPieOption = useMemo(() => ({
    title: { text: "模型分布", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          formatter: "{b}\n{d}%",
          color: cc.text,
        },
        labelLine: { show: true, length: 15, length2: 10 },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" } },
        data: modelDist.map((d, i) => ({
          name: d.name,
          value: d.value,
          label: { show: i < 3 },
          labelLine: { show: i < 3 },
        })),
      },
    ],
  }), [modelDist, cc.text]);

  const sourcePieOption = useMemo(() => ({
    title: { text: "工具分布", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          formatter: "{b}\n{d}%",
          color: cc.text,
        },
        labelLine: { show: true, length: 15, length2: 10 },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" } },
        data: sourceDist.map((d, i) => ({
          name: d.name,
          value: d.value,
          label: { show: i < 3 },
          labelLine: { show: i < 3 },
        })),
      },
    ],
  }), [sourceDist, cc.text]);

  const barOption = useMemo(() => ({
    title: { text: "Top 10 会话", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: {
      type: "value",
      interval: 100000000,
      axisLabel: {
        formatter: (value: number) => formatTokens(value),
        color: cc.textSecondary,
      },
    },
    yAxis: { type: "category", data: topSessions.map((d) => d.name.slice(0, 20)).reverse() },
    series: [
      {
        type: "bar",
        data: topSessions.map((d) => d.value).reverse(),
        itemStyle: { color: "#3b82f6", borderRadius: [0, 4, 4, 0] },
      },
    ],
  }), [topSessions, cc.textSecondary]);

  const heatmapOption = useMemo(() => {
    const values = heatmapData.map((d) => d.value);
    const maxVal = Math.max(...values, 1);
    return {
      tooltip: {
        position: "top",
        formatter: (p: { data: [string, number] }) => `${p.data[0]}: ${p.data[1].toLocaleString()} tokens`,
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        inRange: { color: ["#e2e8f0", "#3b82f6", "#1e40af"] },
      },
      calendar: {
        top: 40,
        left: 30,
        right: 30,
        cellSize: ["auto", 18],
        range: currentYear.toString(),
        itemStyle: { borderWidth: 0.5 },
        yearLabel: { show: true },
        dayLabel: { firstDay: 1, nameMap: ["日", "一", "二", "三", "四", "五", "六"] },
        monthLabel: { nameMap: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"] },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: heatmapData.map((d) => [d.date, d.value]),
        },
      ],
    };
  }, [heatmapData, currentYear]);

  const handleExportReport = () => {
    setReportLoading(true);
    try {
      exportExcelReport({
        overview,
        modelDist,
        sourceDist,
        topSessions,
        trendData,
      });
    } catch (e) {
      console.error("Report export failed:", e);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--color-text)]">分析视图</h2>
        <button
          onClick={handleExportReport}
          disabled={reportLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet size={14} />
          {reportLoading ? "导出中..." : "导出 Excel"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="模型分布饼图">
          <ReactECharts option={modelPieOption} style={{ height: 300 }} lazyUpdate={true} echarts={echarts} />
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="工具分布饼图">
          <ReactECharts option={sourcePieOption} style={{ height: 300 }} lazyUpdate={true} echarts={echarts} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="Top 10 会话柱状图">
          <ReactECharts option={barOption} style={{ height: 350 }} lazyUpdate={true} echarts={echarts} />
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="Token 消耗热力图">
          {heatmapData.length > 0 ? (
            <ReactECharts option={heatmapOption} style={{ height: 350 }} lazyUpdate={true} echarts={echarts} />
          ) : (
            <div className="h-[350px] flex items-center justify-center text-[var(--color-text-secondary)]">
              暂无热力图数据
            </div>
          )}
        </div>
      </div>

      <AdvancedAnalytics />
    </div>
  );
}
