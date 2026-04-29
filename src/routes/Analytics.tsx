import { useEffect, useState, useCallback, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { useStatsStore } from "../stores/useStatsStore";
import { getDistribution, getHeatmapData, getTopN } from "../api/tauriCommands";
import type { DistributionItem, HeatmapPoint, TopNItem } from "../types";

export default function Analytics() {
  const { filters } = useStatsStore();
  const [modelDist, setModelDist] = useState<DistributionItem[]>([]);
  const [sourceDist, setSourceDist] = useState<DistributionItem[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [topSessions, setTopSessions] = useState<TopNItem[]>([]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const loadData = useCallback(async () => {
    try {
      const [models, sources, heatmap, top] = await Promise.all([
        getDistribution(filters, "model"),
        getDistribution(filters, "source"),
        getHeatmapData(filters, currentYear),
        getTopN(filters, "session", "tokens", 10),
      ]);
      setModelDist(models);
      setSourceDist(sources);
      setHeatmapData(heatmap);
      setTopSessions(top);
    } catch (e) {
      console.error(e);
    }
  }, [filters, currentYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const modelPieOption = useMemo(() => ({
    title: { text: "模型分布", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" } },
        data: modelDist.map((d) => ({ name: d.name, value: d.value })),
      },
    ],
  }), [modelDist]);

  const sourcePieOption = useMemo(() => ({
    title: { text: "工具分布", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" } },
        data: sourceDist.map((d) => ({ name: d.name, value: d.value })),
      },
    ],
  }), [sourceDist]);

  const barOption = useMemo(() => ({
    title: { text: "Top 10 会话", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: topSessions.map((d) => d.name.slice(0, 20)).reverse() },
    series: [
      {
        type: "bar",
        data: topSessions.map((d) => d.value).reverse(),
        itemStyle: { color: "#3b82f6", borderRadius: [0, 4, 4, 0] },
      },
    ],
  }), [topSessions]);

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
        dayLabel: { firstDay: 1, nameMap: "cn" },
        monthLabel: { nameMap: "cn" },
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

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-[var(--color-text)]">分析视图</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="模型分布饼图">
          <ReactECharts option={modelPieOption} style={{ height: 300 }} lazyUpdate={true} />
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="工具分布饼图">
          <ReactECharts option={sourcePieOption} style={{ height: 300 }} lazyUpdate={true} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="Top 10 会话柱状图">
          <ReactECharts option={barOption} style={{ height: 350 }} lazyUpdate={true} />
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label="Token 消耗热力图">
          {heatmapData.length > 0 ? (
            <ReactECharts option={heatmapOption} style={{ height: 350 }} lazyUpdate={true} />
          ) : (
            <div className="h-[350px] flex items-center justify-center text-[var(--color-text-secondary)]">
              暂无热力图数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
