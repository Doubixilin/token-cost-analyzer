# Token Cost Analyzer - 开发进度文档

> 最后更新: 2026-04-29
> 当前阶段: Phase 3 功能增强（暗黑模式 + 数据导出已完成）

---

## 项目概述

基于 Tauri + React + ECharts + SQLite 的本地 Token 消耗统计与分析桌面应用，同时支持 Kimi Code 和 Claude Code 的 Token 消耗记录读取、统计与可视化。

---

## 已完成功能

### Phase 1: 基础骨架 ✅
- [x] 初始化 Tauri v2 + React + TypeScript 项目
- [x] 配置 TailwindCSS v4（使用 @import 语法）
- [x] 搭建前端路由（react-router-dom）和页面框架（Layout + Sidebar）
- [x] Rust 后端 SQLite 初始化与基础 schema
- [x] 基础 Tauri Command 通信（12 个 API 端点 + 新增 export_data）

### Phase 2: 数据引擎 ✅
- [x] Kimi Code JSONL 解析器（wire.jsonl StatusUpdate 提取）
  - 支持主代理和子代理分离读取
  - 支持从 config.toml 读取默认模型配置（改用 toml crate）
  - 扫描路径: `%USERPROFILE%/.kimi/sessions/`
  - 新增：错误日志、路径安全验证
- [x] Claude Code JSONL 解析器（assistant usage 提取）
  - 支持主会话和子代理读取
  - 解析 ISO 8601 时间戳（返回 Option，过滤非法值）
  - 扫描路径: `%USERPROFILE%/.claude/projects/`
  - 新增：错误日志、路径安全验证
- [x] 目录递归扫描与批量导入（使用 walkdir）
- [x] 统一数据模型（TokenRecord）归一化两种工具的数据格式
- [x] 会话汇总表自动计算（session_summary）
- [x] 成本计算与模型单价关联（性能优化为按 model 批量 UPDATE）

### Phase 3: 核心统计与图表 ✅
- [x] 聚合查询 SQL 与 Rust API（7 种查询类型 + export 查询）
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

### Phase 5: 代码审查与修复 ✅
- [x] 全方位代码审查（Rust/前端/架构三维度）
- [x] 审查报告与修复计划文档 (`PLAN.md`)
- [x] P0 紧急修复（数据正确 + 应用可用）
- [x] P1 重要修复（健壮性 + 代码质量）

### Phase 6: 功能增强 🔄 (进行中)
- [x] 暗黑模式（CSS 变量 + class 切换 + localStorage 持久化）
- [x] 数据导出（CSV/JSON，按当前筛选条件）
- [ ] 增量同步（sync_state 表已创建，逻辑待实现）
- [ ] 桑基图（Token 流向分析）
- [ ] 测试覆盖（Rust + 前端）

---

## 已知问题与修复状态

| 问题 | 严重度 | 状态 | 说明 |
|------|--------|------|------|
| token_records 无唯一约束 | 🔴 高 | ✅ 已修复 | 已添加 UNIQUE 索引 |
| BrowserRouter 刷新 404 | 🔴 高 | ✅ 已修复 | 已替换为 HashRouter |
| CSP 完全缺失 | 🔴 高 | ✅ 已修复 | 已配置 CSP 策略 |
| recalc_costs correlated subquery | 🔴 高 | ✅ 已修复 | 改为按 model 批量 UPDATE |
| Mutex 阻塞 + Poison | 🔴 高 | ✅ 已修复 | unwrap_or_else 恢复中毒锁 |
| SQL 数值拼接 | 🔴 高 | ✅ 已修复 | 改为参数化查询 |
| Settings.tsx `any` 类型 | 🔴 高 | ✅ 已修复 | 使用精确类型 |
| Layout.tsx setTimeout 泄漏 | 🔴 高 | ✅ 已修复 | useEffect cleanup |
| 解析错误静默吞掉 | 🟡 中 | ✅ 已修复 | 改为 eprintln! 日志 |
| TOML 手工字符串解析 | 🟡 中 | ✅ 已修复 | 改用 toml crate |
| 无增量同步 | 🟡 中 | ⏳ 待修复 | sync_state 表存在，逻辑待实现 |
| 代码重复 | 🟡 中 | ✅ 已修复 | 提取 utils/formatter.ts |
| 前端图表未 useMemo | 🟡 中 | ✅ 已修复 | Analytics 已缓存 |
| 可访问性缺失 | 🟡 中 | 🔄 部分修复 | aria-pressed/aria-label 已添加 |
| 编译 warnings | 🟢 低 | ⏳ 待修复 | 剩余 dead_code 警告（ClaudeMessage 字段） |
| 前端 chunk 体积较大 | 🟢 低 | ⏳ 待优化 | ECharts 全量导入约 1.4MB |
| 热力图中文 locale | 🟢 低 | ⏳ 待修复 | ECharts 日历热力图的 nameMap |

---

## 技术栈

- **桌面框架**: Tauri v2 (Rust 后端)
- **前端框架**: React 19 + TypeScript + Vite
- **样式**: TailwindCSS v4（支持暗黑模式 class 策略）
- **图表**: ECharts 5 (echarts-for-react)
- **状态管理**: Zustand（含 theme 持久化）
- **路由**: react-router-dom v7 (HashRouter)
- **时间处理**: dayjs
- **数据库**: SQLite (rusqlite bundled)
- **文件遍历**: walkdir
- **配置解析**: toml

---

## 项目结构

```
token-cost-analyzer/
├── PLAN.md                       # 修复优化执行计划（当前核心文档）
├── src/                          # 前端源码
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 路由配置（HashRouter）
│   ├── index.css                 # Tailwind CSS + 暗黑模式变量
│   ├── types/index.ts            # TypeScript 类型定义
│   ├── api/tauriCommands.ts      # Tauri API 封装（含 exportData）
│   ├── stores/useStatsStore.ts   # Zustand 状态管理（含 theme）
│   ├── utils/formatter.ts        # 公共格式化函数
│   ├── components/               # 可复用组件
│   │   ├── Layout.tsx            # 侧边栏布局
│   │   ├── StatCard.tsx          # 统计卡片
│   │   ├── TrendChart.tsx        # 趋势折线图
│   │   └── FilterBar.tsx         # 筛选栏
│   └── routes/                   # 页面路由
│       ├── Dashboard.tsx         # 仪表盘（含导出按钮）
│       ├── Analytics.tsx         # 分析视图
│       ├── Sessions.tsx          # 会话浏览器
│       └── Settings.tsx          # 设置页（含主题切换）
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 程序入口
│   │   ├── lib.rs                # Tauri 命令与状态管理（含 export_data）
│   │   ├── db/                   # 数据库模块
│   │   │   ├── mod.rs            # 连接管理
│   │   │   ├── schema.rs         # 表结构与初始化（含唯一索引）
│   │   │   └── queries.rs        # 查询函数（含 export）
│   │   ├── models/mod.rs         # 数据模型定义
│   │   ├── parsers/              # 解析器
│   │   │   ├── kimi.rs           # Kimi Code 解析（toml crate）
│   │   │   └── claude.rs         # Claude Code 解析
│   │   └── sync/mod.rs           # 同步引擎（批量 UPDATE 优化）
│   ├── Cargo.toml
│   └── tauri.conf.json           # CSP 已配置
├── DEVELOPMENT_STATUS.md         # 本文档
└── MEMORY.md                     # 上下文记忆文件
```

---

## 数据库 Schema

### token_records
- 存储每条 API 调用的原始 token 消耗记录
- 字段: id, source, session_id, agent_type, agent_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, project_path, message_id, cost_estimate
- **唯一索引**: `UNIQUE(source, session_id, agent_type, COALESCE(agent_id, ''), timestamp, COALESCE(message_id, ''))`

### session_summary
- 会话维度汇总，加速查询
- 字段: session_id, source, project_path, start_time, end_time, total_input, total_output, total_cache_read, total_cache_creation, total_cost, message_count, agent_count

### model_pricing
- 用户可编辑的模型单价表
- 字段: model, input_price, output_price, cache_read_price, cache_creation_price, currency

### sync_state
- 预留：记录各数据源最后扫描时间（待启用）

### project_aliases
- 预留：项目路径别名映射（待启用）

---

## 下一步计划

### 近期（本周）
1. **增量同步实现**
   - 启用 `sync_state` 表记录各文件 mtime
   - 仅解析变更文件，提升刷新速度

2. **前端可访问性完善**
   - 补充剩余 ARIA 标签
   - 键盘导航优化

### 中期（两周内）
3. **桑基图**
   - ECharts Sankey 展示 Token 流向（工具 → 模型 → 代理类型）

4. **测试覆盖**
   - Rust: parsers 测试、queries 测试
   - 前端: 关键组件测试

5. **编译警告清理**
   - 处理剩余 unused import / dead_code 警告

### 远期（一个月内）
6. **ECharts 按需加载**
   - 减少 bundle 体积

7. **打包与发布**
   - Windows 安装程序构建
   - 应用图标替换
   - 使用文档

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
