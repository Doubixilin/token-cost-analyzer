# Token Cost Analyzer - 上下文记忆文件

> 创建时间: 2026-04-29
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
- **状态管理**: Zustand
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

核心功能 **已基本完成**，应用可在 `npm run tauri dev` 下正常运行并展示数据。

### 已完成模块
1. Rust 后端: 数据库 schema、查询引擎、Kimi/Claude 解析器、同步引擎、12 个 Tauri Commands
2. 前端: Layout、Dashboard（统计卡片+趋势图+筛选器）、Analytics（饼图+TopN+热力图）、Sessions（列表+详情）、Settings（单价配置）
3. 数据导入: 已在本机成功导入两种工具的历史数据

### 待完成（按优先级）
1. **增量同步** — 当前全量扫描，需基于文件 mtime 优化
2. **暗黑模式** — CSS 变量切换
3. **性能优化** — ECharts 按需加载、虚拟滚动
4. **功能增强** — 数据导出、桑基图、实时监听
5. **打包发布** — Windows 安装程序

---

## 关键文件路径

```
D:\GIThub\DEV\17.Token-cost\token-cost-analyzer\
├── src/                          # 前端
│   ├── api/tauriCommands.ts      # 所有后端 API 调用封装
│   ├── stores/useStatsStore.ts   # 全局状态（filters, overview, trendData）
│   ├── routes/Dashboard.tsx      # 主仪表盘，首次加载自动同步
│   └── routes/Analytics.tsx      # 分析视图（饼图/TopN/热力图）
├── src-tauri/src/
│   ├── lib.rs                    # Tauri 命令注册 + AppState
│   ├── db/queries.rs             # 7 种 SQL 聚合查询
│   ├── parsers/kimi.rs           # Kimi wire.jsonl 解析
│   ├── parsers/claude.rs         # Claude jsonl 解析
│   └── sync/mod.rs               # sync_all_data + recalc_costs
```

---

## 注意事项（给未来的自己）

1. **Kimi 模型推断**: 目前只读取 config.toml 的默认模型字段，不同会话可能用不同模型，但 wire.jsonl 里不存模型名。如果要精确，需要解析 context.jsonl 或关联其他文件。

2. **Claude 子代理路径**: `projects/<project-slug>/<session-id>/subagents/agent-{agentId}.jsonl`，子代理文件数量可能很多。

3. **成本计算**: `cost_estimate` 字段在 `token_records` 中，由 `recalc_costs()` 根据 `model_pricing` 表更新。修改单价后会自动重新计算。

4. **筛选器联动**: Dashboard 的 FilterBar 修改 filters 后，Zustand 会触发 Dashboard 的 useEffect 重新加载数据。Analytics 和 Sessions 也监听同一 filters。

5. **不要打包**: 用户明确说先不要打包，继续开发。

6. **Git 状态**: 需要初始化 git 并提交当前代码。

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
