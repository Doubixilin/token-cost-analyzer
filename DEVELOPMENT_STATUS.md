# Token Cost Analyzer - 开发进度文档

> 最后更新: 2026-04-29

## 项目概述

基于 Tauri + React + ECharts + SQLite 的本地 Token 消耗统计与分析桌面应用，同时支持 Kimi Code 和 Claude Code 的 Token 消耗记录读取、统计与可视化。

---

## 已完成功能

### Phase 1: 基础骨架 ✅
- [x] 初始化 Tauri v2 + React + TypeScript 项目
- [x] 配置 TailwindCSS v4（使用 @import 语法）
- [x] 搭建前端路由（react-router-dom）和页面框架（Layout + Sidebar）
- [x] Rust 后端 SQLite 初始化与基础 schema（token_records, session_summary, model_pricing, sync_state, project_aliases）
- [x] 基础 Tauri Command 通信（12 个 API 端点）

### Phase 2: 数据引擎 ✅
- [x] Kimi Code JSONL 解析器（wire.jsonl StatusUpdate 提取）
  - 支持主代理和子代理分离读取
  - 支持从 config.toml 读取默认模型配置
  - 扫描路径: `%USERPROFILE%/.kimi/sessions/`
- [x] Claude Code JSONL 解析器（assistant usage 提取）
  - 支持主会话和子代理读取
  - 解析 ISO 8601 时间戳
  - 扫描路径: `%USERPROFILE%/.claude/projects/`
- [x] 目录递归扫描与批量导入（使用 walkdir）
- [x] 统一数据模型（TokenRecord）归一化两种工具的数据格式
- [x] 会话汇总表自动计算（session_summary）
- [x] 成本计算与模型单价关联

### Phase 3: 核心统计与图表 ✅
- [x] 聚合查询 SQL 与 Rust API（7 种查询类型）
- [x] 前端仪表盘核心指标卡片（6 个统计卡片）
- [x] 前端趋势折线图（ECharts，支持堆叠面积 + 成本双 Y 轴）
- [x] 时间段筛选器（快捷选项: 全部/今天/7天/30天/90天）
- [x] 多维度筛选器（工具来源、模型、代理类型）
- [x] 成本计算器与单价配置（可编辑的模型单价表）

### Phase 4: 高级分析与详情 ✅
- [x] 饼图/环形图（模型分布、工具分布）
- [x] Top-N 排行柱状图（Top 10 最耗 Token 会话）
- [x] GitHub 风格贡献热力图（按年度日历）
- [x] 会话列表表格（支持分页）
- [x] 会话详情页（每次 API 调用的 token 明细时间线）
- [x] 模型单价设置页面（CRUD 操作，保存后自动重新计算成本）

### Phase 5: 优化与封装 🔄 (部分完成)
- [x] 首次加载自动同步数据（数据库为空时自动触发）
- [x] 响应式布局适配
- [ ] 暗黑模式
- [ ] 性能优化（大数据量虚拟滚动）
- [ ] 错误边界处理
- [ ] 应用图标与打包配置
- [ ] Windows 安装程序构建
- [ ] 使用文档

---

## 已知问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| Kimi 模型名不准确 | 中 | Kimi wire.jsonl 不直接包含模型名，目前仅通过 config.toml 的默认模型推断，实际不同会话可能使用不同模型 |
| 工作目录 MD5 映射不直观 | 低 | Kimi 使用 WORK_DIR_MD5 作为项目标识，显示为 MD5 字符串而非可读路径 |
| 编译 warnings | 低 | Rust 后端有 6 个 unused import/mut warnings，不影响功能 |
| 前端 chunk 体积较大 | 低 | ECharts 全量导入导致 JS chunk 约 1.4MB，后续可拆分为按需加载 |
| 无增量同步 | 中 | 当前每次刷新会重新全量扫描和插入（INSERT OR IGNORE），未实现基于文件 mtime 的精准增量 |
| 热力图中文 locale | 低 | ECharts 日历热力图的 month/day 标签使用中文 nameMap，但可能需确认 locale 配置 |

---

## 技术栈

- **桌面框架**: Tauri v2 (Rust 后端)
- **前端框架**: React 19 + TypeScript + Vite
- **样式**: TailwindCSS v4
- **图表**: ECharts 5 (echarts-for-react)
- **状态管理**: Zustand
- **路由**: react-router-dom v7
- **时间处理**: dayjs
- **数据库**: SQLite (rusqlite bundled)
- **文件遍历**: walkdir

---

## 项目结构

```
token-cost-analyzer/
├── src/                          # 前端源码
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 路由配置
│   ├── index.css                 # Tailwind CSS
│   ├── types/index.ts            # TypeScript 类型定义
│   ├── api/tauriCommands.ts      # Tauri API 封装
│   ├── stores/useStatsStore.ts   # Zustand 状态管理
│   ├── components/               # 可复用组件
│   │   ├── Layout.tsx            # 侧边栏布局
│   │   ├── StatCard.tsx          # 统计卡片
│   │   ├── TrendChart.tsx        # 趋势折线图
│   │   └── FilterBar.tsx         # 筛选栏
│   └── routes/                   # 页面路由
│       ├── Dashboard.tsx         # 仪表盘
│       ├── Analytics.tsx         # 分析视图
│       ├── Sessions.tsx          # 会话浏览器
│       └── Settings.tsx          # 设置页
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 程序入口
│   │   ├── lib.rs                # Tauri 命令与状态管理
│   │   ├── db/                   # 数据库模块
│   │   │   ├── mod.rs            # 连接管理
│   │   │   ├── schema.rs         # 表结构与初始化
│   │   │   └── queries.rs        # 查询函数
│   │   ├── models/mod.rs         # 数据模型定义
│   │   ├── parsers/              # 解析器
│   │   │   ├── kimi.rs           # Kimi Code 解析
│   │   │   └── claude.rs         # Claude Code 解析
│   │   └── sync/mod.rs           # 同步引擎
│   ├── Cargo.toml
│   └── tauri.conf.json
├── DEVELOPMENT_STATUS.md         # 本文档
└── MEMORY.md                     # 上下文记忆文件
```

---

## 数据库 Schema

### token_records
- 存储每条 API 调用的原始 token 消耗记录
- 字段: id, source, session_id, agent_type, agent_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, project_path, message_id, cost_estimate

### session_summary
- 会话维度汇总，加速查询
- 字段: session_id, source, project_path, start_time, end_time, total_input, total_output, total_cache_read, total_cache_creation, total_cost, message_count, agent_count

### model_pricing
- 用户可编辑的模型单价表
- 字段: model, input_price, output_price, cache_read_price, cache_creation_price, currency

---

## 下一步计划

1. **实现精准增量同步**
   - 记录每个文件的 mtime 和大小
   - 仅解析变更的文件，提升刷新速度

2. **暗黑模式**
   - 使用 CSS 变量切换 light/dark 主题
   - 在 Settings 页面添加主题切换开关

3. **性能优化**
   - ECharts 按需加载（减少 bundle 体积）
   - 会话列表大数据量虚拟滚动

4. **功能增强**
   - 数据导出（CSV/JSON）
   - 桑基图（Token 流向分析）
   - 模型使用偏好迁移分析
   - 子代理类型消耗占比分析
   - 实时文件监听（notify crate）自动刷新

5. **打包与发布**
   - 构建 Windows MSI/EXE 安装程序
   - 应用图标替换
   - 编写用户手册

---

## 开发命令

```bash
# 开发模式（热重载）
npm run tauri dev

# 前端生产构建
npm run build

# Rust 检查
cd src-tauri && cargo check

# 打包（Windows）
npm run tauri build
```
