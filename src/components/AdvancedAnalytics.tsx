import { useEffect, useState, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import echarts from "../utils/echarts-setup";
import { useStatsStore } from "../stores/useStatsStore";
import {
  getHourlyDistribution,
  getModelTrend,
  getCumulativeCost,
  getScatterData,
  getSankeyData,
  getDistribution,
} from "../api/tauriCommands";
import { formatTokens } from "../utils/formatter";
import { getChartColors } from "../utils/chartColors";

// Extracted to module level to avoid React re-mounting on every parent render
const ChartCard = ({ option, height = 300, ariaLabel }: { option: any; height?: number; ariaLabel: string }) => (
  <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm" role="img" aria-label={ariaLabel}>
    <ReactECharts option={option} style={{ height }} lazyUpdate={true} echarts={echarts} />
  </div>
);

export default function AdvancedAnalytics() {
  const filters = useStatsStore((s) => s.filters);
  const refreshVersion = useStatsStore((s) => s.refreshVersion);
  const theme = useStatsStore((s) => s.theme);
  const cc = getChartColors(theme);
  const [hourly, setHourly] = useState<{ hour: number; tokens: number; requests: number }[]>([]);
  const [modelTrend, setModelTrend] = useState<{ date: string; model: string; tokens: number }[]>([]);
  const [cumulative, setCumulative] = useState<{ date: string; cost: number }[]>([]);
  const [scatter, setScatter] = useState<{ input: number; output: number; model: string; cost: number }[]>([]);
  const [sankey, setSankey] = useState<[string, string, number][]>([]);
  const [agentDist, setAgentDist] = useState<{ name: string; value: number; cost: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getHourlyDistribution(filters),
      getModelTrend(filters),
      getCumulativeCost(filters),
      getScatterData(filters, 300),
      getSankeyData(filters),
      getDistribution(filters, "agent_type"),
    ])
      .then(([h, mt, cc, sc, sk, ad]) => {
        if (cancelled) return;
        setHourly(h);
        setModelTrend(mt);
        setCumulative(cc);
        setScatter(sc);
        setSankey(sk);
        setAgentDist(ad);
      })
      .catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, [filters, refreshVersion]);

  // A. Input/Output Scatter
  const scatterOption = useMemo(() => {
    const models = Array.from(new Set(scatter.map((d) => d.model)));
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];
    const series = models.map((model, i) => ({
      name: model,
      type: "scatter",
      symbolSize: (data: number[]) => Math.max(4, Math.min(20, Math.sqrt(data[2]) / 100)),
      data: scatter
        .filter((d) => d.model === model)
        .map((d) => [d.input, d.output, d.input + d.output, d.cost]),
      itemStyle: { color: colors[i % colors.length] },
    }));
    return {
      title: { text: "Input / Output 分布（单轮调用）", left: "center", textStyle: { fontSize: 14 } },
      tooltip: {
        trigger: "item",
        formatter: (p: any) =>
          `${p.seriesName}<br/>Input: ${formatTokens(p.data[0])}<br/>Output: ${formatTokens(p.data[1])}<br/>Total: ${formatTokens(p.data[2])}<br/>Cost: ¥${p.data[3].toFixed(4)}`,
      },
      legend: { data: models, bottom: 0, type: "scroll" },
      grid: { left: "3%", right: "4%", bottom: "15%", top: "15%", containLabel: true },
      xAxis: {
        type: "value",
        name: "Input Tokens",
        axisLabel: { formatter: (v: number) => formatTokens(v), color: cc.textSecondary },
        splitLine: { lineStyle: { color: cc.border } },
      },
      yAxis: {
        type: "value",
        name: "Output Tokens",
        axisLabel: { formatter: (v: number) => formatTokens(v), color: cc.textSecondary },
        splitLine: { lineStyle: { color: cc.border } },
      },
      series,
    };
  }, [scatter, cc.textSecondary, cc.border]);

  // B1. Hourly Distribution
  const hourlyOption = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const tokenMap = new Map(hourly.map((h) => [h.hour, h.tokens]));
    const reqMap = new Map(hourly.map((h) => [h.hour, h.requests]));
    return {
      title: { text: "时段分布（24小时）", left: "center", textStyle: { fontSize: 14 } },
      tooltip: { trigger: "axis" },
      legend: { data: ["Tokens", "请求数"], bottom: 0 },
      grid: { left: "3%", right: "4%", bottom: "15%", top: "15%", containLabel: true },
      xAxis: {
        type: "category",
        data: hours,
        axisLabel: { color: cc.textSecondary },
      },
      yAxis: [
        { type: "value", name: "Tokens", axisLabel: { formatter: (v: number) => formatTokens(v) } },
        { type: "value", name: "请求数" },
      ],
      series: [
        {
          name: "Tokens",
          type: "bar",
          data: hours.map((_, i) => tokenMap.get(i) || 0),
          itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "请求数",
          type: "line",
          yAxisIndex: 1,
          data: hours.map((_, i) => reqMap.get(i) || 0),
          itemStyle: { color: "#f59e0b" },
          smooth: true,
        },
      ],
    };
  }, [hourly, cc.textSecondary]);

  // B2. Model Migration Trend (stacked area) — O(n) via Map lookup
  const modelTrendOption = useMemo(() => {
    const dates = Array.from(new Set(modelTrend.map((d) => d.date))).sort();
    const models = Array.from(new Set(modelTrend.map((d) => d.model)));
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];
    const trendMap = new Map(modelTrend.map((d) => [`${d.date}::${d.model}`, d.tokens]));
    const series = models.map((model, i) => ({
      name: model,
      type: "line",
      stack: "model",
      areaStyle: { opacity: 0.2 },
      smooth: true,
      data: dates.map((date) => trendMap.get(`${date}::${model}`) || 0),
      itemStyle: { color: colors[i % colors.length] },
    }));
    return {
      title: { text: "模型迁移趋势", left: "center", textStyle: { fontSize: 14 } },
      tooltip: { trigger: "axis" },
      legend: { data: models, bottom: 0, type: "scroll" },
      grid: { left: "3%", right: "4%", bottom: "15%", top: "15%", containLabel: true },
      xAxis: { type: "category", boundaryGap: false, data: dates, axisLabel: { color: cc.textSecondary } },
      yAxis: { type: "value", axisLabel: { formatter: (v: number) => formatTokens(v) } },
      series,
    };
  }, [modelTrend, cc.textSecondary]);

  // D. Cumulative Cost
  const cumulativeOption = useMemo(() => {
    let acc = 0;
    const data = cumulative.map((d) => {
      acc += d.cost;
      return [d.date, Number(acc.toFixed(4))];
    });
    return {
      title: { text: "累计成本曲线", left: "center", textStyle: { fontSize: 14 } },
      tooltip: { trigger: "axis", formatter: (p: any) => `${p.data[0]}<br/>累计成本: ¥${p.data[1]}` },
      grid: { left: "3%", right: "4%", bottom: "10%", top: "15%", containLabel: true },
      xAxis: { type: "category", data: cumulative.map((d) => d.date), axisLabel: { color: cc.textSecondary } },
      yAxis: { type: "value", name: "Cost (¥)", axisLabel: { formatter: "¥{value}" } },
      series: [
        {
          type: "line",
          data,
          smooth: true,
          areaStyle: { opacity: 0.2, color: "#10b981" },
          itemStyle: { color: "#10b981" },
          lineStyle: { width: 2 },
        },
      ],
    };
  }, [cumulative, cc.textSecondary]);

  // C. Sankey
  const sankeyOption = useMemo(() => {
    const nodesSet = new Set<string>();
    const links = sankey.map(([source, target, value]) => {
      nodesSet.add(source);
      nodesSet.add(target);
      return { source, target, value };
    });
    const data = Array.from(nodesSet).map((name) => ({ name }));
    return {
      title: { text: "Token 流向", left: "center", textStyle: { fontSize: 14 } },
      tooltip: { trigger: "item", triggerOn: "mousemove" },
      series: [
        {
          type: "sankey",
          layout: "none",
          emphasis: { focus: "adjacency" },
          data,
          links,
          lineStyle: { color: "gradient", curveness: 0.5 },
          label: { color: cc.text, fontSize: 11 },
        },
      ],
    };
  }, [sankey, cc.text]);

  // C. Agent Type Pie
  const agentPieOption = useMemo(() => ({
    title: { text: "代理类型分布", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
        label: { show: true, formatter: "{b}\n{d}%", color: cc.text },
        labelLine: { show: true },
        data: agentDist.map((d) => ({ name: d.name, value: d.value })),
      },
    ],
  }), [agentDist, cc.text]);

  return (
    <div className="space-y-6">
      {/* A. Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard option={scatterOption} height={350} ariaLabel="Input Output 散点图" />
        <ChartCard option={hourlyOption} height={350} ariaLabel="24小时时段分布" />
      </div>

      {/* B. Time Trend */}
      <div className="grid grid-cols-1 gap-6">
        <ChartCard option={modelTrendOption} height={350} ariaLabel="模型迁移趋势" />
      </div>

      {/* C. Agent Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard option={agentPieOption} height={300} ariaLabel="代理类型分布" />
      </div>

      {/* D. Cost + Sankey */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard option={cumulativeOption} height={300} ariaLabel="累计成本曲线" />
        {(sankey?.length ?? 0) > 0 ? (
          <ChartCard option={sankeyOption} height={300} ariaLabel="Token 流向桑基图" />
        ) : (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm h-[300px] flex items-center justify-center text-[var(--color-text-secondary)]">
            暂无桑基图数据
          </div>
        )}
      </div>
    </div>
  );
}
