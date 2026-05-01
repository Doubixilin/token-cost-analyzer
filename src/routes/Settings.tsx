import { useEffect, useState, useCallback } from "react";
import {
  getModelPricing,
  setModelPricing,
  loadWidgetConfig,
  saveWidgetConfig,
  toggleWidget,
  embedWidgetToDesktop,
  unpinWidgetFromDesktop,
} from "../api/tauriCommands";
import type { ModelPricing, WidgetConfig, TimePeriod } from "../types";
import { Moon, Sun, Layers, RotateCw, Eye, MonitorSmartphone } from "lucide-react";
import { useStatsStore } from "../stores/useStatsStore";

type PriceField = "input_price" | "output_price" | "cache_read_price" | "cache_creation_price";

export default function Settings() {
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const theme = useStatsStore((s) => s.theme);
  const setTheme = useStatsStore((s) => s.setTheme);
  const [newModel, setNewModel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Widget config state — 初始化为默认值，确保卡片始终显示
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>({
    opacity: 0.92,
    locked: false,
    pinned_to_desktop: false,
    selected_modules: ["overview", "trend", "source_split"],
    layout: "vertical",
    width: 360,
    height: 480,
    x: null,
    y: null,
    theme: "auto",
    refresh_interval_sec: 300,
    time_period: "7d",
  });
  const [widgetSaved, setWidgetSaved] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);

  useEffect(() => {
    loadWidgetConfig()
      .then((cfg) => setWidgetConfig((prev) => ({ ...prev, ...cfg })))
      .catch((e) => console.error("[Settings] loadWidgetConfig failed:", e));
  }, []);

  const updateWidget = (partial: Partial<WidgetConfig>) => {
    setWidgetConfig((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const handleSaveWidget = async () => {
    try {
      await saveWidgetConfig(widgetConfig);
      setWidgetSaved(true);
      setWidgetError(null);
      setTimeout(() => setWidgetSaved(false), 3000);
    } catch (e) {
      setWidgetError("保存配置失败，请重试");
      console.error(e);
    }
  };

  const MODULE_OPTIONS = [
    { id: "overview", label: "概览统计" },
    { id: "trend", label: "消耗趋势" },
    { id: "source_split", label: "工具分布" },
    { id: "model_dist", label: "模型分布" },
    { id: "hourly_dist", label: "时段分布" },
    { id: "top_projects", label: "项目消耗" },
  ];

  const loadPricing = useCallback(async () => {
    try {
      const data = await getModelPricing();
      setPricing(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadPricing();
  }, [loadPricing]);

  const updatePrice = (index: number, field: PriceField, value: string) => {
    const next = [...pricing];
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      next[index] = { ...next[index], [field]: num };
      setPricing(next);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await Promise.all(pricing.map((p) => setModelPricing(p)));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddModel = async () => {
    const model = newModel.trim();
    if (!model) return;
    if (pricing.some((p) => p.model === model)) {
      alert("该模型已存在");
      return;
    }
    const newPricing: ModelPricing = {
      model,
      input_price: 0,
      output_price: 0,
      cache_read_price: 0,
      cache_creation_price: 0,
      currency: "USD",
    };
    try {
      await setModelPricing(newPricing);
      setPricing((prev) => [...prev, newPricing].sort((a, b) => a.model.localeCompare(b.model)));
      setNewModel("");
      setShowAddForm(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-[var(--color-text)]">设置</h2>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">模型单价配置</h3>
          <span className="text-xs text-[var(--color-text-secondary)]">单位: $ / 1M tokens</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">模型</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Input</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Output</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Cache Read</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Cache Creation</th>
              </tr>
            </thead>
            <tbody>
              {pricing.map((p, idx) => (
                <tr key={p.model} className="border-b border-[var(--color-border)]">
                  <td className="px-3 py-2 font-medium">{p.model}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={p.input_price}
                      onChange={(e) => updatePrice(idx, "input_price", e.target.value)}
                      className="w-24 text-right px-2 py-1 rounded border border-[var(--color-border)] text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={p.output_price}
                      onChange={(e) => updatePrice(idx, "output_price", e.target.value)}
                      className="w-24 text-right px-2 py-1 rounded border border-[var(--color-border)] text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={p.cache_read_price}
                      onChange={(e) => updatePrice(idx, "cache_read_price", e.target.value)}
                      className="w-24 text-right px-2 py-1 rounded border border-[var(--color-border)] text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={p.cache_creation_price}
                      onChange={(e) => updatePrice(idx, "cache_creation_price", e.target.value)}
                      className="w-24 text-right px-2 py-1 rounded border border-[var(--color-border)] text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
          >
            {loading ? "保存中..." : "保存配置"}
          </button>
          <button
            onClick={() => setShowAddForm((s) => !s)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] transition-colors"
          >
            {showAddForm ? "取消" : "+ 添加模型"}
          </button>
          {saved && <span className="text-sm text-[var(--color-success)]">保存成功！成本已重新计算</span>}
        </div>

        {showAddForm && (
          <div className="mt-4 p-4 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">模型名称</label>
                <input
                  type="text"
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  placeholder="例如: tokenplan"
                  className="px-3 py-1.5 rounded border border-[var(--color-border)] text-sm w-48"
                />
              </div>
              <button
                onClick={handleAddModel}
                className="px-4 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-dark)]"
              >
                添加
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              添加后请设置该模型的单价，然后点击"保存配置"
            </p>
          </div>
        )}
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">外观</h3>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              theme === "light"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200"
            }`}
          >
            <Sun size={16} />
            浅色
          </button>
          <button
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              theme === "dark"
                ? "bg-[var(--color-primary)] text-white"
                : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200"
            }`}
          >
            <Moon size={16} />
            深色
          </button>
        </div>
      </div>

      {/* Widget Configuration */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-[var(--color-primary)]" />
              <h3 className="text-base font-semibold">桌面小组件</h3>
            </div>
            <button
              onClick={() => toggleWidget().catch(console.error)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-[var(--color-text-secondary)] transition-colors"
            >
              <MonitorSmartphone size={13} />
              打开/关闭小组件
            </button>
          </div>

          <div className="space-y-5">
            {/* Widget Theme */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-2">小组件主题</p>
              <div className="flex items-center gap-3">
                {(["auto", "light", "dark"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateWidget({ theme: t })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      widgetConfig.theme === t
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                    }`}
                  >
                    {t === "auto" ? "跟随系统" : t === "light" ? "浅色" : "深色"}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[var(--color-text)]">透明度</p>
                <span className="text-xs text-[var(--color-text-secondary)]">{Math.round(widgetConfig.opacity * 100)}%</span>
              </div>
              <input
                type="range" min={30} max={100} step={5}
                value={Math.round(widgetConfig.opacity * 100)}
                onChange={(e) => updateWidget({ opacity: Number(e.target.value) / 100 })}
                className="w-full h-1.5 rounded-full appearance-none bg-[var(--color-border)] accent-[var(--color-primary)]"
              />
            </div>

            {/* Refresh Interval */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[var(--color-text)]">自动刷新间隔</p>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {widgetConfig.refresh_interval_sec <= 0 ? "关闭" : `${widgetConfig.refresh_interval_sec}秒`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "关闭", value: 0 },
                  { label: "30秒", value: 30 },
                  { label: "1分钟", value: 60 },
                  { label: "5分钟", value: 300 },
                  { label: "10分钟", value: 600 },
                  { label: "30分钟", value: 1800 },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateWidget({ refresh_interval_sec: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      widgetConfig.refresh_interval_sec === opt.value
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Period */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-2">默认时间周期</p>
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { value: "today" as TimePeriod, label: "今天" },
                  { value: "7d" as TimePeriod, label: "最近7天" },
                  { value: "30d" as TimePeriod, label: "最近30天" },
                  { value: "all" as TimePeriod, label: "全部" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateWidget({ time_period: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      widgetConfig.time_period === opt.value
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Modules */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-2">显示模块</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MODULE_OPTIONS.map((mod) => {
                  const active = widgetConfig.selected_modules.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      onClick={() => {
                        const current = widgetConfig.selected_modules;
                        updateWidget({
                          selected_modules: active
                            ? current.filter((m) => m !== mod.id)
                            : [...current, mod.id],
                        });
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30"
                          : "bg-gray-50 text-[var(--color-text-secondary)] border border-transparent dark:bg-slate-800"
                      }`}
                    >
                      <Eye size={12} className={active ? "opacity-100" : "opacity-40"} />
                      {mod.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Layout */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-2">布局方式</p>
              <div className="flex items-center gap-3">
                {([
                  { value: "vertical", label: "垂直排列" },
                  { value: "grid", label: "网格布局" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateWidget({ layout: opt.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      widgetConfig.layout === opt.value
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Position Lock */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">位置锁定</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">锁定后无法拖拽小组件</p>
              </div>
              <button
                onClick={() => updateWidget({ locked: !widgetConfig.locked })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  widgetConfig.locked ? "bg-[var(--color-primary)]" : "bg-gray-300 dark:bg-slate-600"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  widgetConfig.locked ? "translate-x-5" : ""
                }`} />
              </button>
            </div>

            {/* Pin to Desktop */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">钉入桌面</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">嵌入桌面壁纸层，显示在图标下方</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    setWidgetError(null);
                    if (widgetConfig.pinned_to_desktop) {
                      await unpinWidgetFromDesktop();
                      updateWidget({ pinned_to_desktop: false });
                    } else {
                      await embedWidgetToDesktop();
                      updateWidget({ pinned_to_desktop: true });
                    }
                  } catch (e: any) {
                    const msg = e?.message || String(e) || "桌面钉入操作失败";
                    setWidgetError(msg);
                    console.error("桌面钉入操作失败:", e);
                  }
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  widgetConfig.pinned_to_desktop ? "bg-[var(--color-primary)]" : "bg-gray-300 dark:bg-slate-600"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  widgetConfig.pinned_to_desktop ? "translate-x-5" : ""
                }`} />
              </button>
            </div>

            {/* Size */}
            <div>
              <p className="text-sm font-medium text-[var(--color-text)] mb-2">小组件尺寸</p>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--color-text-secondary)]">宽</span>
                  <input
                    type="number" min={240} max={800} step={10}
                    value={Math.round(widgetConfig.width)}
                    onChange={(e) => updateWidget({ width: Math.max(240, Math.min(800, Number(e.target.value) || 240)) })}
                    className="w-20 text-center px-2 py-1 rounded border border-[var(--color-border)] text-sm"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">px</span>
                </div>
                <span className="text-[var(--color-text-secondary)]">×</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--color-text-secondary)]">高</span>
                  <input
                    type="number" min={200} max={1200} step={10}
                    value={Math.round(widgetConfig.height)}
                    onChange={(e) => updateWidget({ height: Math.max(200, Math.min(1200, Number(e.target.value) || 200)) })}
                    className="w-20 text-center px-2 py-1 rounded border border-[var(--color-border)] text-sm"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">px</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {[
                  { label: "小", w: 280, h: 360 },
                  { label: "中", w: 360, h: 480 },
                  { label: "大", w: 420, h: 600 },
                ].map((preset) => {
                  const active = Math.round(widgetConfig.width) === preset.w && Math.round(widgetConfig.height) === preset.h;
                  return (
                    <button
                      key={preset.label}
                      onClick={() => updateWidget({ width: preset.w, height: preset.h })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? "bg-[var(--color-primary)] text-white"
                          : "bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
                      }`}
                    >
                      {preset.label} ({preset.w}×{preset.h})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSaveWidget}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              保存小组件配置
            </button>
            <button
              onClick={() => loadWidgetConfig().then((cfg) => setWidgetConfig((prev) => ({ ...prev, ...cfg }))).catch(console.error)}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] transition-colors"
            >
              <RotateCw size={14} className="inline mr-1" />
              重置
            </button>
            <button
              onClick={() => updateWidget({ x: null, y: null })}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] transition-colors"
            >
              重置位置
            </button>
            {widgetSaved && <span className="text-sm text-[var(--color-success)]">保存成功！</span>}
            {widgetError && <span className="text-sm text-[var(--color-danger)]">{widgetError}</span>}
          </div>
        </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
        <h3 className="text-base font-semibold mb-2">关于</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Token Cost Analyzer v0.3.0
        </p>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          支持 Kimi Code 与 Claude Code 的 Token 消耗统计与分析
        </p>
      </div>
    </div>
  );
}
