import { useEffect, useState, useCallback, useRef } from "react";
import { useStatsStore } from "../stores/useStatsStore";
import { getSessionList, getSessionDetail } from "../api/tauriCommands";
import type { SessionSummary, TokenRecord } from "../types";
import dayjs from "dayjs";
import { formatTokens, formatCost, getSourceLabel, getSourceStyle } from "../utils/formatter";

export default function Sessions() {
  const filters = useStatsStore((s) => s.filters);
  const costDisplaySettings = useStatsStore((s) => s.costDisplaySettings);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [detail, setDetail] = useState<TokenRecord[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 20;

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  const loadSessions = useCallback(async (cancelled: { current: boolean }) => {
    try {
      const result = await getSessionList(filters, pageSize, page * pageSize);
      if (cancelled.current) return;
      setSessions(result.items);
      setHasMore(result.has_more);
    } catch (e) {
      console.error(e);
    }
  }, [filters, page]);

  useEffect(() => {
    const cancelled = { current: false };
    loadSessions(cancelled);
    return () => { cancelled.current = true; };
  }, [loadSessions]);

  const latestSessionId = useRef<string | null>(null);
  const loadDetail = useCallback(async (sessionId: string) => {
    latestSessionId.current = sessionId;
    try {
      const data = await getSessionDetail(sessionId);
      if (latestSessionId.current !== sessionId) return; // 丢弃过期响应
      setDetail(data);
      setSelectedSession(sessionId);
    } catch (e) {
      console.error(e);
    }
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-[var(--color-text)]">会话浏览器</h2>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">来源</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">会话ID</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-secondary)]">时间</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">总Token</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">成本</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--color-text-secondary)]">消息数</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr
                  key={session.session_id}
                  className={`border-b border-[var(--color-border)] hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                    selectedSession === session.session_id ? "bg-blue-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getSourceStyle(session.source)}`}>
                      {getSourceLabel(session.source)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                    {session.session_id.slice(0, 16)}...
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {session.start_time ? dayjs.unix(session.start_time).format("MM-DD HH:mm") : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatTokens(session.total_input + session.total_output + session.total_cache_read + session.total_cache_creation)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--color-success)]">
                    {formatCost(session.total_cost, costDisplaySettings)}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                    <button
                      onClick={() => loadDetail(session.session_id)}
                      className="text-[var(--color-primary)] hover:underline"
                      aria-label={`查看会话 ${session.session_id.slice(0, 8)} 详情`}
                    >
                      {session.message_count}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(sessions?.length ?? 0) === 0 && (
          <div className="p-8 text-center text-[var(--color-text-secondary)]">
            暂无会话数据，请先同步数据
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-xs text-[var(--color-text-secondary)]">第 {page + 1} 页</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>

      {/* Session Detail */}
      {selectedSession && (detail?.length ?? 0) > 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
          <h3 className="text-base font-semibold mb-4">会话详情</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {detail.map((record, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg)] text-xs">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded ${
                    record.agent_type === "root" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                  }`}>
                    {record.agent_type === "root" ? "主" : "子"}
                  </span>
                  <span className="text-[var(--color-text-secondary)]">
                    {dayjs.unix(record.timestamp).format("HH:mm:ss")}
                  </span>
                  <span className="font-mono text-[var(--color-text-secondary)]">
                    {record.model || "unknown"}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-blue-600">In: {formatTokens(record.input_tokens)}</span>
                  <span className="text-green-600">Out: {formatTokens(record.output_tokens)}</span>
                  <span className="text-orange-600">Cache: {formatTokens(record.cache_read_tokens + record.cache_creation_tokens)}</span>
                  <span className="font-medium">{formatCost(record.cost_estimate, costDisplaySettings)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
