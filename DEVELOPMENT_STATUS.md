# Token Cost Analyzer - 开发进度文档

> 最后更新: 2026-04-29
> 当前阶段: v0.3.0 桌面悬浮小组件 + 系统托盘

---

## 项目概述

基于 Tauri + React + ECharts + SQLite 的本地 Token 消耗统计与分析桌面应用，同时支持 Kimi Code 和 Claude Code 的 Token 消耗记录读取、统计与可视化。

---

## 已完成功能

### Phase 1: 基础骨架 ✅
- [x] 初始化 Tauri v2 + React + TypeScript 项目
- [x] 配置 TailwindCSS v4
- [x] 搭建前端路由（HashRouter）和页面框架
- [x] Rust 后端 SQLite 初始化与基础 schema
- [x] 17 个 Tauri Command API 端点

### Phase 2: 数据引擎 ✅
- [x] Kimi Code JSONL 解析器（wire.jsonl StatusUpdate）
- [x] Claude Code JSONL 解析器（assistant usage）
- [x] 目录递归扫描与批量导入
- [x] 统一数据模型（TokenRecord）
- [x] 会话汇总表自动计算
- [x] 成本计算与模型单价关联

### Phase 3: 核心统计与图表 ✅
- [x] 聚合查询 SQL（7 种查询类型）
- [x] 仪表盘核心指标卡片（6 个）
- [x] 趋势折线图（双 Y 轴 + 堆叠面积）
- [x] 时间段筛选器（全部/今天/7天/30天/90天）
- [x] 多维度筛选器（工具来源、模型、代理类型）
- [x] 模型单价配置

### Phase 4: 高级分析与详情 ✅
- [x] 饼图/环形图（模型分布、工具分布）
- [x] Top-N 排行柱状图
- [x] GitHub 风格热力图（中文 locale 修复）
- [x] 会话列表 + 分页 + 详情页
- [x] 高级分析：散点图、时段分布、模型迁移趋势、累计成本、桑基图、代理分布、项目 Top 10

### Phase 5: 代码审查与安全加固 ✅
- [x] 全方位代码审查 + P0/P1 修复
- [x] SQL 注入防护（参数化查询）
- [x] 路径遍历防护（canonicalize + starts_with）
- [x] Mutex 中毒恢复
- [x] CSP 配置
- [x] ErrorBoundary

### Phase 6: 功能增强 ✅
- [x] 暗黑模式（CSS 变量 + localStorage 持久化）
- [x] 数据导出（CSV/JSON/Excel 多格式）
- [x] macOS 构建支持

### Phase 7: v0.2.0 Bug 修复与优化 ✅ (2026-04-29)
- [x] **筛选器失效修复** — mountedRef cleanup 导致 useEffect 重执行时跳过数据加载
- [x] **数据自动刷新** — 首次进入自动同步 + 侧边栏刷新后通知 Dashboard 重新获取
- [x] **增量同步** — 基于文件 mtime 的增量解析，只处理变更文件
- [x] **Windows 数据丢失修复** — `canonicalize()` 返回 `\\?\` 前缀路径导致 `starts_with()` 永远 false，所有文件被跳过
- [x] **Kimi 模型识别修复** — config.toml 中 `default_model` 字段名与 parser 不匹配 + 增量同步跳过未变更文件导致旧 "unknown" 记录残留，添加数据库迁移强制清理并重新同步
- [x] **ECharts 按需导入** — 创建 echarts-setup.ts，只注册使用的图表类型
- [x] **热力图中文 locale** — `nameMap: "cn"` 改为显式中文数组
- [x] **UI 中文化** — 仪表盘卡片和趋势图图例改为中文
- [x] **index.html 标题** — 改为 "Token Cost Analyzer"
- [x] **sync_state 表迁移** — 旧 schema 自动迁移到文件级追踪
- [x] **Rust 编译零警告** — 公开 parser 结构体字段 + 修复 unused_mut

### Phase 8: 桌面悬浮小组件 + 系统托盘 ✅ (2026-04-29)
- [x] **多窗口架构** — 第二个透明无边框 WebviewWindow，Vite 多页面构建
- [x] **系统托盘** — TrayIconBuilder + 菜单（显示主窗口/切换小组件/退出），主窗口关闭隐藏到托盘
- [x] **毛玻璃效果** — Windows Acrylic 窗口特效 + CSS backdrop-filter 双层叠加
- [x] **5 个可选数据模块** — 概览统计、消耗趋势、工具分布、模型分布、缓存效率
- [x] **拖拽 + 锁定** — data-tauri-drag-region 原生拖拽，锁定后禁用
- [x] **透明度调节** — CSS opacity 0.3-1.0 滑块控制
- [x] **设置持久化** — JSON 配置文件 + window-state 插件自动保存窗口位置/尺寸
- [x] **桌面钉入** — Win32 WorkerW 嵌入（windows-sys crate），窗口显示在壁纸和桌面图标之间
- [x] **自动/手动刷新** — 可配置间隔（1/5/15/30 分钟），手动刷新按钮带旋转动画
- [x] **ErrorBoundary** — 小组件专用错误边界，出错时显示重试按钮

---

## 已知问题与修复状态

| 问题 | 严重度 | 状态 | 说明 |
|------|--------|------|------|
| Windows canonicalize 路径前缀 | 🔴 高 | ✅ 已修复 | `\\?\` 前缀导致所有文件被跳过 |
| Kimi 模型显示 unknown | 🔴 高 | ✅ 已修复 | config.toml 字段名不匹配 |
| 筛选器点击无反应 | 🔴 高 | ✅ 已修复 | mountedRef cleanup bug |
| 数据不自动更新 | 🔴 高 | ✅ 已修复 | 添加 refreshVersion 信号 |
| 无增量同步 | 🟡 中 | ✅ 已修复 | 基于文件 mtime 增量解析 |
| ECharts 全量导入 | 🟢 低 | ✅ 已修复 | 按需导入 tree-shaking |
| 热力图中文 locale | 🟢 低 | ✅ 已修复 | 显式中文数组 |
| 编译 warnings | 🟢 低 | ✅ 已修复 | 零警告 |

---

## 技术栈

- **桌面框架**: Tauri v2 (Rust)
- **前端**: React 19 + TypeScript + Vite 7
- **样式**: TailwindCSS v4（暗黑模式）
- **图表**: ECharts 6（按需导入 via echarts-setup.ts）
- **状态管理**: Zustand
- **路由**: react-router-dom v7 (HashRouter)
- **数据库**: SQLite (rusqlite)
- **文件遍历**: walkdir

---

## 重要注意事项

### 构建规则
**绝对不能**直接运行 `cargo build --release`，必须用 `npm run tauri build`。缺少 `custom-protocol` feature 会导致 release 白屏。

### Windows canonicalize
Windows 上 `std::fs::canonicalize()` 返回 `\\?\C:\...` 格式路径。比较路径时必须对两端都做 canonicalize，否则 `starts_with()` 永远返回 false。macOS 无此问题。

### Kimi config.toml
Kimi 的配置文件顶层键是 `default_model`（不是 `model`），值格式为 `provider/model-name`（如 `kimi-code/kimi-for-coding`），需要提取斜杠后的部分。

---

## 开发命令

```bash
npm run tauri dev          # 开发模式（热重载）
npm run build              # 前端构建
npm run tauri build -- --no-bundle  # 便携版 exe
npm run tauri build        # 完整打包（NSIS/DMG）
```
