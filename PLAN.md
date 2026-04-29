# Token Cost Analyzer — 修复与优化执行计划

> 创建时间: 2026-04-29
> 最后更新: 2026-04-29
> 状态: Phase 1 ✅ 完成 | Phase 2 ✅ 完成 | Phase 3 部分完成

---

## 执行原则

1. **先修复数据正确性，再优化体验** — 数据重复、SQL 注入等问题优先
2. **先后端再前端** — 后端是数据源头，先确保数据正确
3. **保持最小侵入** — 每次修改聚焦一个模块，避免大面积重构导致回归
4. **每步可验证** — 修改后确保 `cargo check` 和 `npm run build` 通过

---

## Phase 1: P0 紧急修复（数据正确 + 应用可用）✅ 已完成

### 1.1 Rust 后端 — 数据库 Schema 修复 ✅
**文件**: `src-tauri/src/db/schema.rs`
**修改内容**:
- 为 `token_records` 添加唯一索引: `UNIQUE(source, session_id, agent_type, COALESCE(agent_id, ''), timestamp, COALESCE(message_id, ''))`
- 使 `INSERT OR IGNORE` 真正生效，解决数据重复问题

### 1.2 Rust 后端 — SQL 安全修复 ✅
**文件**: `src-tauri/src/db/queries.rs`
**修改内容**:
- `get_heatmap_data`: `start_ts`/`end_ts` 改为参数化查询，加入 `params`
- 非法 `year` 返回 `Err` 而非 `unwrap()` panic
- `get_trend_data`/`get_distribution`/`get_top_n`: 非法参数返回 `Err` 而非默认回退

### 1.3 Rust 后端 — 性能修复 ✅
**文件**: `src-tauri/src/sync/mod.rs`
**修改内容**:
- `recalc_costs`: 改为按 model 批量 UPDATE，复杂度从 O(n×m) 降至 O(n+m)
- `recalc_costs` 和 `recalc_session_summaries` 包裹在显式事务中
- `sync_all_data` 中 Kimi/Claude 解析失败不再互相阻塞，各自返回空数据并记录错误
- 移除 `insert_records` 冗余的 `source` 参数覆盖

### 1.4 Rust 后端 — Mutex 与并发修复 ✅
**文件**: `src-tauri/src/lib.rs`
**修改内容**:
- 所有 command 使用 `lock().unwrap_or_else(|e| e.into_inner())` 替代 `map_err`，自动恢复中毒锁

### 1.5 前端 — BrowserRouter 修复 ✅
**文件**: `src/App.tsx`
**修改内容**:
- `BrowserRouter` → `HashRouter`，解决 Tauri 桌面应用刷新 404

### 1.6 前端 — 类型安全修复 ✅
**文件**: `src/routes/Settings.tsx`, `src/routes/Analytics.tsx`
**修改内容**:
- Settings: 移除 `(next[index] as any)`，使用 `PriceField` 精确类型 + 不可变更新
- Analytics: 移除 `p: any`，使用 ECharts tooltip 参数具体类型 `{ data: [string, number] }`

### 1.7 前端 — 内存泄漏修复 ✅
**文件**: `src/components/Layout.tsx`
**修改内容**:
- 使用 `useEffect` 返回 cleanup 函数清除 `setTimeout`
- 移除 `handleRefresh` 中内联的 `setTimeout`，统一由 effect 管理

### 1.8 配置 — CSP 修复 ✅
**文件**: `src-tauri/tauri.conf.json`
**修改内容**:
- `security.csp`: `"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"`

---

## Phase 2: P1 重要修复（健壮性 + 代码质量）✅ 已完成

### 2.1 后端 — 错误处理与日志 ✅
**文件**: `src-tauri/src/parsers/kimi.rs`, `src-tauri/src/parsers/claude.rs`
**修改内容**:
- 所有 `Err(_) => continue` 改为 `eprintln!` 记录错误（文件打开失败、行读取失败、JSON 解析失败均带上下文）
- Kimi TOML 解析改用 `toml` crate（已添加依赖），替换脆弱的手工字符串匹配
- `parse_iso_timestamp` 返回 `Option<f64>`，过滤非法时间戳（不再回退到 1970）

### 2.2 后端 — 路径安全 ✅
**文件**: `src-tauri/src/parsers/kimi.rs`, `src-tauri/src/parsers/claude.rs`
**修改内容**:
- 禁用 `follow_links(true)`（改为 `max_depth` 限制）
- 添加 `canonicalize()` 路径验证，确保解析的文件仍在预期目录内
- Claude `is_subagent` 检测改为检查 path components 而非字符串包含

### 2.3 前端 — 性能优化 ✅
**文件**: `src/routes/Analytics.tsx`, `src/components/TrendChart.tsx`
**修改内容**:
- Analytics: 图表 option 使用 `useMemo` 缓存，避免每次渲染重建
- ECharts 组件添加 `lazyUpdate={true}`
- 图表容器添加 `role="img"` + `aria-label`
- 缓存当前年份，避免每次渲染重新计算

### 2.4 前端 — 代码重构 ✅
**文件**: 全局
**修改内容**:
- 提取 `src/utils/formatter.ts`（`formatNumber` / `formatTokens` / `formatCost` / `SOURCE_LABELS`）
- Dashboard 重构 `loadData` 与 `handleRefresh` 重复逻辑，提取 `fetchDashboardData`
- Sessions 移除不必要的 `as number` 类型断言
- Layout 导航链接添加 `aria-current`

### 2.5 前端 — 可访问性基础 ✅
**文件**: `src/components/FilterBar.tsx`, `src/routes/Sessions.tsx`
**修改内容**:
- FilterBar: 所有筛选按钮添加 `aria-pressed`
- Sessions: 表格操作改为 `<button>` 元素，支持键盘聚焦，添加 `aria-label`
- 全局 source 标签使用 `getSourceLabel()` 集中映射

---

## Phase 3: P2 功能增强（体验 + 扩展）🔄 部分完成

### 3.1 暗黑模式 ✅
**文件**: `src/index.css`, `src/stores/useStatsStore.ts`, `src/routes/Settings.tsx`, 全局组件
**修改内容**:
- CSS 添加 `@variant dark` 支持 class 切换
- `:root` / `.dark` 两套变量（bg, surface, text, border, scrollbar）
- Zustand store 添加 `theme` 状态，localStorage 持久化，自动读取系统偏好
- Settings 页面添加主题切换按钮（浅色/深色）
- 全局组件 `bg-white` → `bg-[var(--color-surface)]`
- `bg-gray-100` / `hover:bg-gray-200` → 添加 `dark:bg-slate-700` / `dark:hover:bg-slate-600`

### 3.2 数据导出 ✅
**文件**: `src-tauri/src/db/queries.rs`, `src-tauri/src/lib.rs`, `src/api/tauriCommands.ts`, `src/routes/Dashboard.tsx`
**修改内容**:
- 后端: `export_data` command 支持 CSV/JSON 格式，按当前 filters 导出
- 前端: Dashboard 添加 CSV/JSON 导出按钮，浏览器 Blob 下载

### 3.3 增量同步 ⏳ 待实现
**说明**: 计划利用 `sync_state` 表记录文件 mtime，当前仍全量扫描

### 3.4 桑基图 ⏳ 待实现
**说明**: Token 流向可视化，待后续迭代

### 3.5 测试覆盖 ⏳ 待实现
**说明**: 零测试覆盖问题尚未解决

---

## 执行检查清单

### Phase 1 完成标准 ✅
- [x] `cargo check` 通过无新增错误
- [x] `npm run build` 通过无错误
- [x] 数据库唯一约束已添加
- [x] Tauri 应用内刷新页面正常（HashRouter）
- [x] 同步期间 Mutex 可恢复

### Phase 2 完成标准 ✅
- [x] 解析错误有日志输出
- [x] 无重复工具函数
- [x] Analytics 页面图表切换流畅（useMemo）

### Phase 3 完成标准 🔄
- [x] 暗黑模式切换正常
- [x] 数据导出功能可用
- [ ] 增量同步实现
- [ ] 桑基图实现
- [ ] 至少一组单元测试通过

---

## 记忆锚点

- **当前执行阶段**: Phase 3 部分完成（暗黑模式 + 数据导出已完成）
- **上次修改模块**: Dashboard 导出按钮、全局暗黑模式样式
- **已知阻塞问题**: 无
- **剩余高价值任务**: 增量同步、桑基图、测试覆盖
- **下次启动应优先执行**: 检查本计划完成进度，继续未完成的 P2 项

> 新会话启动后，首先读取本 PLAN.md，然后读取 MEMORY.md 和 DEVELOPMENT_STATUS.md，确认当前进度后按优先级继续执行。
