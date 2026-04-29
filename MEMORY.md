# Token Cost Analyzer - 上下文记忆文件

> 创建时间: 2026-04-29
> 最后更新: 2026-04-29
> 用途: 确保上下文压缩或新会话后能无缝衔接当前工作

---

## 项目定位

本地 Token 消耗统计与分析桌面应用，同时读取 **Kimi Code** 和 **Claude Code** 的历史消耗记录，提供多维度统计、趋势可视化、成本估算。

技术栈: **Tauri v2 + React + TypeScript + ECharts + SQLite**

---

## 关键决策与状态

### 已确定的技术方案
- **桌面框架**: Tauri v2（用户从 Tauri/Electron/Wails 中选择了 Tauri）
- **前端**: React 19 + Vite + TailwindCSS v4
- **图表库**: ECharts 5（全量导入，待优化为按需加载）
- **状态管理**: Zustand（已扩展 theme 状态，支持 localStorage 持久化）
- **数据库**: SQLite（rusqlite bundled feature，单文件存储于 app_data_dir）
- **后端语言**: Rust

### 数据目录（本机）
- **Kimi Code**: `C:\Users\ASUS\.kimi\sessions\` — 已验证存在，296 个 wire.jsonl
- **Claude Code**: `C:\Users\ASUS\.claude\projects\` — 已验证存在，145 个 jsonl

### 数据格式
- Kimi: JSONL，`StatusUpdate` 类型，`token_usage.input_other/output/input_cache_read/input_cache_creation`
- Claude: JSONL，`type=="assistant"`，`message.usage.input_tokens/output_tokens/cache_creation_input_tokens/cache_read_input_tokens`

---

## 当前工作进度

### 代码审查已完成（2026-04-29）
已启动全方位代码审查，覆盖 Rust 后端、前端 React、架构安全三个维度。审查结论已汇总，详见 `PLAN.md`。

**审查评分**:
- Rust 后端: 4.7/10 → 修复后预计 7.5/10
- 前端: 5.5/10 → 修复后预计 7.5/10
- 架构与安全: 3.8/10 → 修复后预计 6.5/10

### 修复计划执行状态
详见 `PLAN.md`，当前状态：
- **Phase 1 (P0 紧急修复)**: ✅ 全部完成
- **Phase 2 (P1 重要修复)**: ✅ 全部完成
- **Phase 3 (P2 功能增强)**: 🔄 部分完成（暗黑模式 ✅、数据导出 ✅、增量同步 ⏳、桑基图 ⏳、测试覆盖 ⏳）

### 核心风险已解决
1. ✅ `token_records` 已添加唯一约束，同步不再重复插入
2. ✅ `HashRouter` 替换 `BrowserRouter`，刷新正常
3. ✅ CSP 已配置
4. ✅ `recalc_costs` 改为批量 UPDATE，性能提升 O(n×m) → O(n+m)
5. ✅ Mutex 使用 `unwrap_or_else(|e| e.into_inner())` 自动恢复中毒
6. ✅ SQL 数值拼接已改为参数化查询
7. ✅ 前端 `any` 类型断言已消除
8. ✅ `setTimeout` 内存泄漏已修复

### 待完成（按优先级）
1. **增量同步** — 启用 `sync_state` 表，基于文件 mtime 精准增量
2. **桑基图** — Token 流向可视化
3. **测试覆盖** — Rust 单元测试 + 前端组件测试

---

## 关键文件路径

```
D:\GIThub\DEV\17.Token-cost\token-cost-analyzer\
├── PLAN.md                       # 当前修复优化执行计划（必读）
├── src/                          # 前端
│   ├── utils/formatter.ts        # 新增：公共格式化函数
│   ├── api/tauriCommands.ts      # 新增 exportData API
│   ├── stores/useStatsStore.ts   # 新增 theme 状态管理
│   ├── routes/Dashboard.tsx      # 新增数据导出按钮
│   └── routes/Settings.tsx       # 新增主题切换
├── src-tauri/src/
│   ├── lib.rs                    # 新增 export_data command
│   ├── db/queries.rs             # 新增 get_all_records_for_export
│   ├── parsers/kimi.rs           # TOML crate + 错误日志 + 路径安全
│   └── parsers/claude.rs         # 错误日志 + 路径安全 + Option timestamp
```

---

## 注意事项（给未来的自己）

1. **Kimi 模型推断**: 目前只读取 config.toml 的默认模型字段，不同会话可能用不同模型，但 wire.jsonl 里不存模型名。如果要精确，需要解析 context.jsonl 或关联其他文件。

2. **Claude 子代理路径**: `projects/<project-slug>/<session-id>/subagents/agent-{agentId}.jsonl`，子代理文件数量可能很多。

3. **成本计算**: `cost_estimate` 字段在 `token_records` 中，由 `recalc_costs()` 根据 `model_pricing` 表更新。修改单价后会自动重新计算。

4. **筛选器联动**: Dashboard 的 FilterBar 修改 filters 后，Zustand 会触发 Dashboard 的 useEffect 重新加载数据。Analytics 和 Sessions 也监听同一 filters。

5. **不要打包**: 用户明确说先不要打包，继续开发。

6. **Git 状态**: 需要初始化 git 并提交当前代码。

7. **新会话启动流程**:
   - 读取 `PLAN.md` 了解当前执行阶段
   - 读取 `DEVELOPMENT_STATUS.md` 了解功能完成度
   - 检查代码修改进度
   - 按 `PLAN.md` 优先级继续执行未完成的修复项

8. **暗黑模式实现方式**:
   - `html` 元素上的 `.dark` class 切换
   - CSS 变量在 `:root` 和 `.dark` 中分别定义
   - Tailwind `@variant dark (&:where(.dark, .dark *))` 支持 `dark:` 前缀
   - localStorage 持久化用户偏好，默认跟随系统

9. **数据导出限制**:
   - 当前导出按 filters 条件筛选
   - CSV 使用纯字符串拼接，字段中若含逗号未做转义（待改进）
   - 大数据量时建议分页导出

---

## 常用命令

```bash
cd D:\GIThub\DEV\17.Token-cost\token-cost-analyzer

# 开发
npm run tauri dev

# 前端编译检查
npm run build

# Rust 检查
cd src-tauri && cargo check

# 数据库位置（运行时）
# C:\Users\ASUS\AppData\Roaming\com.asus.token-cost-analyzer\token_analyzer.db
```
