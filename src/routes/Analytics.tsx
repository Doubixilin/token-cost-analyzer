import { useEffect, useState, useCallback } from "react";
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

  const loadData = useCallback(async () => {
    try {
      const [models, sources, heatmap, top] = await Promise.all([
        getDistribution(filters, "model"),
        getDistribution(filters, "source"),
        getHeatmapData(filters, new Date().getFullYear()),
        getTopN(filters, "session", "tokens", 10),
      ]);
      setModelDist(models);
      setSourceDist(sources);
      setHeatmapData(heatmap);
      setTopSessions(top);
    } catch (e) {
      console.error(e);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const pieOption = (title: string, data: DistributionItem[]) => ({
    title: { text: title, left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: "bold" } },
        data: data.map((d) => ({ name: d.name, value: d.value })),
      },
    ],
  });

  const barOption = (title: string, data: TopNItem[]) => ({
    title: { text: title, left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: data.map((d) => d.name.slice(0, 20)).reverse() },
    series: [
      {
        type: "bar",
        data: data.map((d) => d.value).reverse(),
        itemStyle: { color: "#3b82f6", borderRadius: [0, 4, 4, 0] },
      },
    ],
  });

  const heatmapOption = (data: HeatmapPoint[]) => {
    const values = data.map((d) => d.value);
    const maxVal = Math.max(...values, 1);
    return {
      tooltip: {
        position: "top",
        formatter: (p: any) => `${p.data[0]}: ${p.data[1].toLocaleString()} tokens`,
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
        range: new Date().getFullYear().toString(),
        itemStyle: { borderWidth: 0.5 },
        yearLabel: { show: true },
        dayLabel: { firstDay: 1, nameMap: "cn" },
        monthLabel: { nameMap: "cn" },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data: data.map((d) => [d.date, d.value]),
        },
      ],
    };
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-[var(--color-text)]">分析视图</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <ReactECharts option={pieOption("模型分布", modelDist)} style={{ height: 300 }} />
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <ReactECharts option={pieOption("工具分布", sourceDist)} style={{ height: 300 }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <ReactECharts option={barOption("Top 10 会话", topSessions)} style={{ height: 350 }} />
        </div>
        <div className="bg-white rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          {heatmapData.length > 0 ? (
            <ReactECharts option={heatmapOption(heatmapData)} style={{ height: 350 }} />
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
