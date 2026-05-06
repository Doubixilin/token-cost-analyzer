import type { CostDisplaySettings, DisplayCurrency } from "../types";

const COST_DISPLAY_SETTINGS_KEY = "cost-display-settings";

export const DEFAULT_COST_DISPLAY_SETTINGS: CostDisplaySettings = {
  display_currency: "CNY",
  usd_to_cny_rate: 6.8304,
  exchange_rate_date: "2026-05-06",
  exchange_rate_note: "默认汇率参考 2026-05-05 18:10 UTC 的 USD/CNY 中间价 6.8304",
};

function normalizeCurrency(value: unknown): DisplayCurrency {
  return value === "USD" ? "USD" : "CNY";
}

export function normalizeCostDisplaySettings(value: Partial<CostDisplaySettings> | null | undefined): CostDisplaySettings {
  const rate = Number(value?.usd_to_cny_rate);
  return {
    display_currency: normalizeCurrency(value?.display_currency),
    usd_to_cny_rate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_COST_DISPLAY_SETTINGS.usd_to_cny_rate,
    exchange_rate_date: value?.exchange_rate_date?.trim() || DEFAULT_COST_DISPLAY_SETTINGS.exchange_rate_date,
    exchange_rate_note: value?.exchange_rate_note?.trim() || DEFAULT_COST_DISPLAY_SETTINGS.exchange_rate_note,
  };
}

export function getCostDisplaySettings(): CostDisplaySettings {
  if (typeof window === "undefined") return DEFAULT_COST_DISPLAY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(COST_DISPLAY_SETTINGS_KEY);
    return normalizeCostDisplaySettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_COST_DISPLAY_SETTINGS;
  }
}

export function saveCostDisplaySettings(settings: CostDisplaySettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COST_DISPLAY_SETTINGS_KEY, JSON.stringify(normalizeCostDisplaySettings(settings)));
}

export function convertCostFromUsd(costUsd: number, settings = getCostDisplaySettings()): number {
  return settings.display_currency === "CNY" ? costUsd * settings.usd_to_cny_rate : costUsd;
}

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

export function formatCost(costUsd: number, settings = getCostDisplaySettings()): string {
  const converted = convertCostFromUsd(costUsd, settings);
  const symbol = settings.display_currency === "CNY" ? "¥" : "$";
  return symbol + converted.toFixed(4);
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
