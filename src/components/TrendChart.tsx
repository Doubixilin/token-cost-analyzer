import ReactECharts from "echarts-for-react";
import type { TrendPoint } from "../types";
import { useMemo } from "react";

interface TrendChartProps {
  data: TrendPoint[];
  showCost?: boolean;
}

export default function TrendChart({ data, showCost = true }: TrendChartProps) {
  const option = useMemo(() => {
    const dates = data.map((d) => d.date);
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
      },
      legend: {
        data: showCost
          ? ["Input", "Output", "Cache Read", "Cache Creation", "Cost"]
          : ["Input", "Output", "Cache Read", "Cache Creation"],
        bottom: 0,
      },
      grid: {
        left: "3%",
        right: showCost ? "10%" : "4%",
        bottom: "15%",
        top: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
      },
      yAxis: [
        {
          type: "value",
          name: "Tokens",
          position: "left",
          axisLabel: {
            formatter: (value: number) => {
              if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
              if (value >= 1000) return (value / 1000).toFixed(1) + "k";
              return value.toString();
            },
          },
        },
        {
          type: "value",
          name: "Cost ($)",
          position: "right",
          show: showCost,
          axisLabel: {
            formatter: "${value}",
          },
        },
      ],
      series: [
        {
          name: "Input",
          type: "line",
          areaStyle: { opacity: 0.15 },
          smooth: true,
          data: data.map((d) => d.input_tokens),
          itemStyle: { color: "#3b82f6" },
        },
        {
          name: "Output",
          type: "line",
          areaStyle: { opacity: 0.15 },
          smooth: true,
          data: data.map((d) => d.output_tokens),
          itemStyle: { color: "#10b981" },
        },
        {
          name: "Cache Read",
          type: "line",
          areaStyle: { opacity: 0.15 },
          smooth: true,
          data: data.map((d) => d.cache_read_tokens),
          itemStyle: { color: "#f59e0b" },
        },
        {
          name: "Cache Creation",
          type: "line",
          areaStyle: { opacity: 0.15 },
          smooth: true,
          data: data.map((d) => d.cache_creation_tokens),
          itemStyle: { color: "#8b5cf6" },
        },
        ...(showCost
          ? [
              {
                name: "Cost",
                type: "line",
                yAxisIndex: 1,
                smooth: true,
                data: data.map((d) => Number(d.cost.toFixed(4))),
                itemStyle: { color: "#ef4444" },
                lineStyle: { type: "dashed" as const, width: 2 },
              },
            ]
          : []),
      ],
    };
  }, [data, showCost]);

  if (data.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-8 text-center text-[var(--color-text-secondary)]">
        暂无数据，请点击左侧"刷新数据"按钮同步
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
      <h3 className="text-base font-semibold text-[var(--color-text)] mb-4">消耗趋势</h3>
      <ReactECharts option={option} style={{ height: 400 }} />
    </div>
  );
}
