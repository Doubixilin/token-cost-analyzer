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
  return "$" + cost.toFixed(4);
}

export const SOURCE_LABELS: Record<string, string> = {
  kimi: "Kimi Code",
  claude: "Claude Code",
};

export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source;
}
