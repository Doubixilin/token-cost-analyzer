import { useEffect, useState, useCallback } from "react";
import { getModelPricing, setModelPricing } from "../api/tauriCommands";
import type { ModelPricing } from "../types";
import { Moon, Sun } from "lucide-react";
import { useStatsStore } from "../stores/useStatsStore";

type PriceField = "input_price" | "output_price" | "cache_read_price" | "cache_creation_price";

export default function Settings() {
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const { theme, setTheme } = useStatsStore();
  const [newModel, setNewModel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

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

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
        <h3 className="text-base font-semibold mb-2">关于</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Token Cost Analyzer v0.1.0
        </p>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          支持 Kimi Code 与 Claude Code 的 Token 消耗统计与分析
        </p>
      </div>
    </div>
  );
}
