import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  ImageRun,
  Packer,
} from "docx";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import type { OverviewStats, DistributionItem, TopNItem, TrendPoint } from "../types";
import { formatNumber, formatCost } from "./formatter";

function findEChartsInstance(root: Element): ECharts | null {
  const instance = echarts.getInstanceByDom(root as HTMLElement);
  if (instance) return instance;
  for (const child of root.children) {
    const found = findEChartsInstance(child);
    if (found) return found;
  }
  return null;
}

async function chartToImage(selector: string): Promise<Uint8Array | null> {
  const chartDom = document.querySelector(selector);
  if (!chartDom) {
    console.warn(`Chart container not found: ${selector}`);
    return null;
  }

  const instance = findEChartsInstance(chartDom);
  if (!instance) {
    console.warn(`ECharts instance not found in: ${selector}`);
    return null;
  }

  // Force render: resize + flush pending lazy updates
  instance.resize();
  await new Promise((resolve) => setTimeout(resolve, 200));

  try {
    const dataURL = instance.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#fff",
    });
    if (!dataURL || !dataURL.startsWith("data:image/png;base64,")) {
      console.warn(`Invalid dataURL for: ${selector}`);
      return null;
    }
    const base64 = dataURL.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error(`ECharts getDataURL failed for ${selector}:`, e);
    return null;
  }
}

function boldCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function textCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun(text)] })],
  });
}

export async function exportWordReport(options: {
  overview: OverviewStats | null;
  modelDist: DistributionItem[];
  sourceDist: DistributionItem[];
  topSessions: TopNItem[];
  trendData: TrendPoint[];
}) {
  const { overview, modelDist, sourceDist, topSessions, trendData } = options;
  const dateStr = new Date().toLocaleDateString("zh-CN");

  // Collect all available chart images
  const chartSelectors = [
    { key: "modelPie", label: "模型分布饼图", title: "模型分布图" },
    { key: "sourcePie", label: "工具分布饼图", title: "工具分布图" },
    { key: "topBar", label: "Top 10 会话柱状图", title: "Top 10 会话" },
    { key: "heatmap", label: "Token 消耗热力图", title: "Token 消耗热力图" },
    { key: "scatter", label: "Input Output 散点图", title: "Input / Output 散点图" },
    { key: "hourly", label: "24小时时段分布", title: "24 小时时段分布" },
    { key: "modelTrend", label: "模型迁移趋势", title: "模型迁移趋势" },
    { key: "cumulative", label: "累计成本曲线", title: "累计成本曲线" },
    { key: "sankey", label: "Token 流向桑基图", title: "Token 流向桑基图" },
    { key: "agentPie", label: "代理类型分布", title: "代理类型分布" },
    { key: "projectBar", label: "项目消耗排行", title: "项目消耗排行" },
  ];

  const images: Map<string, Uint8Array> = new Map();
  for (const sel of chartSelectors) {
    const img = await chartToImage(`[aria-label='${sel.label}']`);
    if (img) {
      images.set(sel.key, img);
    }
  }

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: "Token Cost Analyzer 使用报告",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: `生成日期: ${dateStr}`, color: "64748b" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ];

  // Overview Section
  children.push(
    new Paragraph({ text: "一、核心指标概览", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } }),
    new Paragraph({
      children: [
        new TextRun({ text: "总请求数: ", bold: true }),
        new TextRun({ text: formatNumber(overview?.total_requests || 0) }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "总成本: ", bold: true }),
        new TextRun({ text: formatCost(overview?.total_cost || 0) }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "总 Token 数: ", bold: true }),
        new TextRun({ text: formatNumber(overview?.total_tokens || 0) }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Input / Output: ", bold: true }),
        new TextRun({ text: `${formatNumber(overview?.total_input || 0)} / ${formatNumber(overview?.total_output || 0)}` }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "缓存读取 / 创建: ", bold: true }),
        new TextRun({ text: `${formatNumber(overview?.total_cache_read || 0)} / ${formatNumber(overview?.total_cache_creation || 0)}` }),
      ],
      spacing: { after: 300 },
    })
  );

  // Model Distribution Table
  children.push(
    new Paragraph({ text: "二、模型使用分析", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } }),
    new Paragraph({ text: "各模型 Token 消耗分布", heading: HeadingLevel.HEADING_2, spacing: { after: 150 } })
  );

  const modelTotal = modelDist.reduce((sum, d) => sum + d.value, 0) || 1;
  const modelTableRows = [
    new TableRow({ children: ["模型", "Token 数", "占比", "成本"].map(boldCell) }),
    ...modelDist.map((item) =>
      new TableRow({
        children: [
          textCell(item.name),
          textCell(formatNumber(item.value)),
          textCell(`${((item.value / modelTotal) * 100).toFixed(1)}%`),
          textCell(formatCost(item.cost)),
        ],
      })
    ),
  ];

  children.push(
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: modelTableRows }),
    new Paragraph({ spacing: { after: 300 } })
  );

  // Tool Distribution Table
  children.push(
    new Paragraph({ text: "三、工具来源分析", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } }),
    new Paragraph({ text: "Kimi Code vs Claude Code 消耗对比", heading: HeadingLevel.HEADING_2, spacing: { after: 150 } })
  );

  const sourceTotal = sourceDist.reduce((sum, d) => sum + d.value, 0) || 1;
  const sourceTableRows = [
    new TableRow({ children: ["工具", "Token 数", "占比", "成本"].map(boldCell) }),
    ...sourceDist.map((item) =>
      new TableRow({
        children: [
          textCell(item.name),
          textCell(formatNumber(item.value)),
          textCell(`${((item.value / sourceTotal) * 100).toFixed(1)}%`),
          textCell(formatCost(item.cost)),
        ],
      })
    ),
  ];

  children.push(
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: sourceTableRows }),
    new Paragraph({ spacing: { after: 300 } })
  );

  // Top Sessions
  children.push(
    new Paragraph({ text: "四、Top 10 最耗 Token 会话", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } })
  );

  const topTableRows = [
    new TableRow({ children: ["排名", "会话ID", "Token 数", "成本"].map(boldCell) }),
    ...topSessions.slice(0, 10).map((item, idx) =>
      new TableRow({
        children: [
          textCell(String(idx + 1)),
          textCell(item.name.slice(0, 20)),
          textCell(formatNumber(item.value)),
          textCell(formatCost(item.cost)),
        ],
      })
    ),
  ];

  children.push(
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: topTableRows }),
    new Paragraph({ spacing: { after: 300 } })
  );

  // Trend Summary
  if (trendData.length > 0) {
    const avgDaily = trendData.reduce((sum, d) => sum + d.input_tokens + d.output_tokens + d.cache_read_tokens + d.cache_creation_tokens, 0) / trendData.length;
    children.push(
      new Paragraph({ text: "五、趋势摘要", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } }),
      new Paragraph({
        children: [
          new TextRun({ text: "统计天数: ", bold: true }),
          new TextRun({ text: String(trendData.length) }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "日均 Token 消耗: ", bold: true }),
          new TextRun({ text: formatNumber(Math.round(avgDaily)) }),
        ],
      }),
      new Paragraph({ spacing: { after: 300 } })
    );
  }

  // Charts
  const addImage = (label: string, img: Uint8Array | undefined) => {
    if (!img) return;
    children.push(
      new Paragraph({ text: label, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 200 } }),
      new Paragraph({
        children: [
          new ImageRun({
            data: img,
            transformation: { width: 550, height: 300 },
            type: "png",
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ spacing: { after: 300 } })
    );
  };

  for (const sel of chartSelectors) {
    addImage(sel.title, images.get(sel.key));
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Token_Cost_Report_${new Date().toISOString().slice(0, 10)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
