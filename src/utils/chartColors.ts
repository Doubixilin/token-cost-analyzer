export type Theme = "light" | "dark";

export function getChartColors(theme: Theme) {
  const isDark = theme === "dark";
  return {
    text: isDark ? "#e2e8f0" : "#1e293b",
    textSecondary: isDark ? "#94a3b8" : "#64748b",
    border: isDark ? "#334155" : "#e2e8f0",
    surface: isDark ? "#1e293b" : "#ffffff",
  };
}
