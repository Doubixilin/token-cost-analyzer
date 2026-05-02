export function formatNumber(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + "亿";
  if (num >= 10000) return (num / 10000).toFixed(1) + "万";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toLocaleString();
}

export function formatTokens(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toLocaleString();
}

export function formatCost(cost: number): string {
  return "¥" + cost.toFixed(4);
}

export const SOURCE_LABELS: Record<string, string> = {
  kimi: "Kimi Code",
  claude: "Claude Code",
  codex: "Codex",
};

export const SOURCE_STYLES: Record<string, string> = {
  kimi: "bg-blue-100 text-blue-700",
  claude: "bg-orange-100 text-orange-700",
  codex: "bg-green-100 text-green-700",
};

export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source;
}

export function getSourceStyle(source: string): string {
  return SOURCE_STYLES[source] || "bg-gray-100 text-gray-700";
}
