import * as XLSX from "xlsx";
import type { OverviewStats, DistributionItem, TopNItem, TrendPoint } from "../types";
import { formatNumber, formatCost } from "./formatter";

function s2ab(s: string) {
  const buf = new ArrayBuffer(s.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < s.length; i++) {
    view[i] = s.charCodeAt(i) & 0xff;
  }
  return buf;
}

function downloadExcel(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
  const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportExcelReport(options: {
  overview: OverviewStats | null;
  modelDist: DistributionItem[];
  sourceDist: DistributionItem[];
  topSessions: TopNItem[];
  trendData: TrendPoint[];
}) {
  const { overview, modelDist, sourceDist, topSessions, trendData } = options;
  const dateStr = new Date().toISOString().slice(0, 10);
  const wb = XLSX.utils.book_new();

  // Sheet 1: 概览
  const overviewRows = [
    ["指标", "数值"],
    ["总请求数", formatNumber(overview?.total_requests || 0)],
    ["总成本", formatCost(overview?.total_cost || 0)],
    ["总 Token 数", formatNumber(overview?.total_tokens || 0)],
    ["Input Tokens", formatNumber(overview?.total_input || 0)],
    ["Output Tokens", formatNumber(overview?.total_output || 0)],
    ["缓存读取", formatNumber(overview?.total_cache_read || 0)],
    ["缓存创建", formatNumber(overview?.total_cache_creation || 0)],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
  wsOverview["!cols"] = [{ wch: 20 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, "概览");

  // Sheet 2: 模型分布
  const modelTotal = modelDist.reduce((sum, d) => sum + d.value, 0) || 1;
  const modelRows = [["模型", "Token 数", "占比", "成本"]];
  modelDist.forEach((item) => {
    modelRows.push([
      item.name,
      formatNumber(item.value),
      `${((item.value / modelTotal) * 100).toFixed(1)}%`,
      formatCost(item.cost),
    ]);
  });
  const wsModel = XLSX.utils.aoa_to_sheet(modelRows);
  wsModel["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsModel, "模型分布");

  // Sheet 3: 工具来源
  const sourceTotal = sourceDist.reduce((sum, d) => sum + d.value, 0) || 1;
  const sourceRows = [["工具", "Token 数", "占比", "成本"]];
  sourceDist.forEach((item) => {
    sourceRows.push([
      item.name,
      formatNumber(item.value),
      `${((item.value / sourceTotal) * 100).toFixed(1)}%`,
      formatCost(item.cost),
    ]);
  });
  const wsSource = XLSX.utils.aoa_to_sheet(sourceRows);
  wsSource["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 12 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsSource, "工具来源");

  // Sheet 4: Top 10 会话
  const topRows = [["排名", "会话ID", "Token 数", "成本"]];
  topSessions.slice(0, 10).forEach((item, idx) => {
    topRows.push([
      String(idx + 1),
      item.name,
      formatNumber(item.value),
      formatCost(item.cost),
    ]);
  });
  const wsTop = XLSX.utils.aoa_to_sheet(topRows);
  wsTop["!cols"] = [{ wch: 8 }, { wch: 40 }, { wch: 18 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsTop, "Top 10 会话");

  // Sheet 5: 趋势数据
  if (trendData.length > 0) {
    const trendRows: any[][] = [
      ["日期", "Input", "Output", "Cache Read", "Cache Creation", "Cost"],
    ];
    trendData.forEach((d) => {
      trendRows.push([
        d.date,
        d.input_tokens,
        d.output_tokens,
        d.cache_read_tokens,
        d.cache_creation_tokens,
        Number(d.cost.toFixed(4)),
      ]);
    });
    const wsTrend = XLSX.utils.aoa_to_sheet(trendRows);
    wsTrend["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsTrend, "趋势");
  }

  downloadExcel(wb, `Token_Cost_Report_${dateStr}.xlsx`);
}
