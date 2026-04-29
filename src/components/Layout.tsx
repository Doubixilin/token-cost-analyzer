import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  Settings,
  RefreshCw,
  Activity,
} from "lucide-react";
import { useStatsStore } from "../stores/useStatsStore";
import { refreshData, getFilterOptions } from "../api/tauriCommands";
import { useState, useEffect } from "react";

const navItems = [
  { path: "/", label: "仪表盘", icon: LayoutDashboard },
  { path: "/analytics", label: "分析", icon: BarChart3 },
  { path: "/sessions", label: "会话", icon: MessageSquare },
  { path: "/settings", label: "设置", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isSyncing, setSyncing, setLastSyncTime, setAvailableOptions, notifyRefresh } = useStatsStore();
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    if (!syncMessage) return;
    const timeoutMs = syncMessage.includes("失败") ? 5000 : 3000;
    const timer = setTimeout(() => setSyncMessage(""), timeoutMs);
    return () => clearTimeout(timer);
  }, [syncMessage]);

  const handleRefresh = async () => {
    setSyncing(true);
    setSyncMessage("正在同步数据...");
    try {
      const count = await refreshData();
      setSyncMessage(`同步完成，共 ${count} 条记录`);
      setLastSyncTime(new Date());
      const [sources, models, projects] = await getFilterOptions();
      setAvailableOptions(sources, models, projects);
      notifyRefresh();
    } catch (e) {
      setSyncMessage("同步失败: " + String(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-56 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col">
        <div className="p-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-[var(--color-primary)]">
            <Activity size={24} />
            <h1 className="text-lg font-bold">Token Analyzer</h1>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-[var(--color-text)]"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[var(--color-border)]">
          <button
            onClick={handleRefresh}
            disabled={isSyncing}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-[var(--color-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "同步中..." : "刷新数据"}
          </button>
          {syncMessage && (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)] px-3">{syncMessage}</p>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[var(--color-bg)]">
        {children}
      </main>
    </div>
  );
}
