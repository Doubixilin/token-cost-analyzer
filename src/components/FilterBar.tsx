import { useStatsStore } from "../stores/useStatsStore";
import { Calendar, Filter, X } from "lucide-react";
import dayjs from "dayjs";

const timePresets = [
  { label: "全部", days: null },
  { label: "今天", days: 0 },
  { label: "最近7天", days: 7 },
  { label: "最近30天", days: 30 },
  { label: "最近90天", days: 90 },
];

export default function FilterBar() {
  const { filters, availableSources, availableModels, setFilters, resetFilters } = useStatsStore();

  const applyTimePreset = (days: number | null) => {
    if (days === null) {
      setFilters({ start_time: null, end_time: null });
    } else if (days === 0) {
      const start = dayjs().startOf("day").unix();
      const end = dayjs().endOf("day").unix();
      setFilters({ start_time: start, end_time: end });
    } else {
      const start = dayjs().subtract(days, "day").startOf("day").unix();
      const end = dayjs().endOf("day").unix();
      setFilters({ start_time: start, end_time: end });
    }
  };

  const toggleFilter = (key: "sources" | "models" | "projects" | "agent_types", value: string) => {
    const current = filters[key] || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ [key]: next.length > 0 ? next : null });
  };

  const hasActiveFilters =
    filters.start_time !== null ||
    filters.sources !== null ||
    filters.models !== null ||
    filters.projects !== null ||
    filters.agent_types !== null;

  return (
    <div className="bg-white rounded-xl border border-[var(--color-border)] p-4 shadow-sm space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Filter size={16} className="text-[var(--color-primary)]" />
        <span className="text-sm font-semibold text-[var(--color-text)]">筛选器</span>
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="ml-auto text-xs text-[var(--color-danger)] hover:underline flex items-center gap-1"
          >
            <X size={12} />
            清除筛选
          </button>
        )}
      </div>

      {/* Time Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar size={14} className="text-[var(--color-text-secondary)]" />
        {timePresets.map((preset) => {
          const isActive =
            preset.days === null
              ? filters.start_time === null
              : preset.days === 0
              ? filters.start_time === dayjs().startOf("day").unix()
              : filters.start_time === dayjs().subtract(preset.days, "day").startOf("day").unix();
          return (
            <button
              key={preset.label}
              onClick={() => applyTimePreset(preset.days)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                isActive
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
        {filters.start_time && filters.end_time && (
          <span className="text-xs text-[var(--color-text-secondary)]">
            {dayjs.unix(filters.start_time).format("YYYY-MM-DD")} ~ {dayjs.unix(filters.end_time).format("YYYY-MM-DD")}
          </span>
        )}
      </div>

      {/* Source Filter */}
      {availableSources.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--color-text-secondary)] w-12">工具:</span>
          {availableSources.map((source) => (
            <button
              key={source}
              onClick={() => toggleFilter("sources", source)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filters.sources?.includes(source)
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200"
              }`}
            >
              {source === "kimi" ? "Kimi Code" : source === "claude" ? "Claude Code" : source}
            </button>
          ))}
        </div>
      )}

      {/* Model Filter */}
      {availableModels.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--color-text-secondary)] w-12">模型:</span>
          <div className="flex gap-1 flex-wrap max-h-20 overflow-y-auto">
            {availableModels.map((model) => (
              <button
                key={model}
                onClick={() => toggleFilter("models", model)}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  filters.models?.includes(model)
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200"
                }`}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Agent Type Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--color-text-secondary)] w-12">代理:</span>
        {["root", "subagent"].map((type) => (
          <button
            key={type}
            onClick={() => toggleFilter("agent_types", type)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filters.agent_types?.includes(type)
                ? "bg-[var(--color-primary)] text-white"
                : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200"
            }`}
          >
            {type === "root" ? "主代理" : "子代理"}
          </button>
        ))}
      </div>
    </div>
  );
}
