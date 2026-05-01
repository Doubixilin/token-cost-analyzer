# Agent 开发指南

## 项目概述

Token Cost Analyzer - AI 编程助手 Token 消耗与成本分析工具
- Tauri v2 + React 19 + Vite + TailwindCSS v4 + Rust + SQLite
- 数据源自 `~/.kimi/sessions/` 和 `~/.claude/projects/`

## 已知问题（待修复）

### ~~🔴 高优先级：Release 模式打开白屏 / localhost 拒绝连接~~ ✅ 已修复

**根因**：`Cargo.toml` 中 `tauri = { version = "2", features = [] }` 缺少 `"custom-protocol"` feature。
Tauri 的 `build.rs` 在没有此 feature 时设置 `cfg(dev)=true`，导致前端资源未嵌入，运行时回退到 `devUrl`。

**修复**：
1. `src-tauri/Cargo.toml`: `features = ["custom-protocol"]`
2. `src-tauri/tauri.conf.json`: `frontendDist` 从绝对路径改为 `"../dist"`

**重要规则**：永远不要直接运行 `cargo build --release`，必须通过 `npm run tauri build` 构建。

### 🟡 中优先级

- **Claude subagents max_depth**：已修复（`max_depth(3)` → `max_depth(5)`）
- **~~模型定价显示 $0.0000~~ ✅ 已修复**：`ensure_all_models_priced` 对未知模型回退到 `"unknown"` 默认价格（2.0/8.0/0.2/2.0），不再插入 0
- **图表导出**：Word 图表截图方案废弃，当前使用 Excel 纯数据导出

### ~~🔴 高优先级：`get_session_detail` 参数名不匹配~~ ✅ 已修复（2026-05-01）

**根因**：前端 `invoke("get_session_detail", { sessionId })` 传递 camelCase 键，Rust 命令参数为 snake_case `session_id: String`。Tauri v2 命令宏通过 serde 精确匹配字段名，无自动大小写转换，导致运行时反序列化失败，会话详情功能不可用。

**修复**：`src/api/tauriCommands.ts` 改为 `{ session_id: sessionId }`。

### ~~🔴 高优先级：Sessions 列表筛选器不完整~~ ✅ 已修复（2026-05-01）

**根因**：`get_session_list` 手动构建 WHERE 条件，仅处理 `start_time` / `end_time` / `sources`，完全忽略 `filters.models` / `filters.projects` / `filters.agent_types`。

**修复**：`src-tauri/src/db/queries.rs` 添加 `projects` 直接筛选（`session_summary` 有 `project_path` 字段）；`models` / `agent_types` 通过 `token_records` 子查询筛选。

### ~~🔴 高优先级：桌面小组件多项功能未工作~~ ✅ 已修复（2026-05-01）

**问题清单与根因分析**：

#### 1. 悬浮窗不能拖拽 ✅
- **修复**：`WidgetApp.tsx` header div 添加 `data-tauri-drag-region` 启用 Tauri 原生拖拽，同时保留 `startDragging()` 编程式拖拽作为双保险。左侧 `pointer-events-none` 区域点击穿透到父 div 触发拖拽。

#### 2. 悬浮窗关闭按钮不工作 ✅
- **修复**：`capabilities/default.json` 已包含 `allow-hide` + `allow-close`；`WidgetApp.tsx` 调用 `getCurrentWindow().hide()`。

#### 3. 设置页小组件配置卡片不显示 ✅
- **修复**：`Settings.tsx` 中 `widgetConfig` 用完整默认值初始化，挂载即显示。

#### 4. 位置持久化性能问题 ✅
- **修复**：`widget.rs` 已使用 `tauri::async_runtime::spawn` + `tokio::time::sleep` 实现 500ms trailing-edge debounce。

#### 5. identifier 数据丢失风险 ✅
- **修复**：`tauri.conf.json` 保持 `com.asus.token-cost-analyzer` 未变更。

**本轮还修复了（见 `CODE_REVIEW_REPORT.md`）**：
- Windows 桌面钉入 CStr 解析 bug（`WorkerW` 永远匹配失败）
- Widget 线程炸弹（`std::thread::spawn` → `tokio::async_runtime::spawn`）
- ErrorToast 定时器无限重置（`useRef` 稳定引用）
- colorCache 模块级内存泄漏（`useColorMap` Hook）
- Layout 全应用重渲染（Zustand 细粒度 selector）
- Sessions 筛选不分页重置 + loadDetail 竞态
- AdvancedAnalytics ChartCard 组件内部定义（React 反模式）
- App.tsx ErrorBoundary 未包裹 Layout
- Dashboard `revokeObjectURL` 时机过早
- FilterBar 缺少 Project 筛选 UI
- useWidgetStore `saveTimer` 模块级变量 HMR 泄漏
- `refresh_data` 无并发互斥（`AtomicBool` + `SyncGuard`）
- `export_data` CSV 全量 clone
- Tray `std::process::exit(0)` 跳过析构
- `get_filter_options` 元组返回值无自描述性 → 结构体
- `hasMore` 最后一页等于 pageSize 时误判 → 后端 `limit + 1`
- 货币单位严重混淆（`¥` vs `$` vs USD）→ 统一为 `$`
- f64 mtime 相等比较不可靠 → `i64` 秒级
- `docx` 死依赖
- 版本号与 Git Tag 不匹配 → 统一 `0.3.0`

## 环境配置

### 开发环境

```powershell
# 项目目录
cd D:\GIThub\DEV\17.Token-cost\token-cost-analyzer

# 前端开发
npm run dev          # Vite dev server on :1420

# Tauri 开发模式
npm run tauri dev    # 启动桌面应用 + 前端热更新

# 前端生产构建
npm run build        # 输出到 dist/

# Rust 检查
cd src-tauri
cargo check

# Rust Release 编译（⚠️ 禁止直接使用！会导致白屏）
cargo build --release

# Tauri Release 构建（✅ 必须用此命令，CLI 自动注入 custom-protocol feature）
npm run tauri build -- --no-bundle
```

### GitHub CLI 使用

```powershell
# 检查登录状态
gh auth status

# 创建仓库并推送（需在项目根目录）
gh repo create token-cost-analyzer --public --description "..." --source=. --remote=origin --push

# 创建 Release
gh release create v0.1.0 --title "..." --notes "..."

# 上传/删除 Release Asset
gh release upload v0.1.0 token-cost-analyzer.exe
gh release delete-asset v0.1.0 token-cost-analyzer.exe --yes
```

## Git 仓库

- **GitHub**：https://github.com/Doubixilin/token-cost-analyzer
- **远端**：`origin  https://github.com/Doubixilin/token-cost-analyzer.git`
- **分支**：`master`（已推送）
- **Release**：https://github.com/Doubixilin/token-cost-analyzer/releases/tag/v0.1.0

### 提交历史

| Commit | 说明 |
|--------|------|
| `abc8991` | docs: update development status with phase 10 round 2 fixes |
| `b1e3044` | docs: add code review round 2 report |
| `5922af2` | fix: code review round 2 — session_detail param, session_list filters, model pricing defaults, settings store sub, widget drag lock, toast memo, excel revoke, schema type, widget position, cargo meta, csp |
| `862ac06` | fix: comprehensive code review fixes (drag, currency, mutex, hasMore, mtime, thread bomb, CStr, toast timer, color cache, layout perf, sessions race, chart card, error boundary, revokeObjectURL, filter projects, saveTimer, refresh mutex, export clone, tray exit, filter options struct, version 0.3.0) |
| `8ebf9bf` | fix: Claude subagents max_depth(3) -> max_depth(4) |
| `5cdedc6` | docs: add macOS build guide + build script, update bundle targets |
| `c0f4986` | feat: advanced analytics + Excel export + dark mode + data sync fixes |
| `963a1fa` | fix: P0/P1 code review fixes + dark mode + data export |
| `20e787e` | feat: initial implementation |

## 文件变更记录

### 新增文件
- `src/components/AdvancedAnalytics.tsx` — ABCD 四维度高级分析
- `src/components/ErrorBoundary.tsx` — React 错误边界
- `src/utils/excelExport.ts` — Excel 多 Sheet 导出
- `MACOS_BUILD.md` — macOS 打包指南 v1
- `MACOS_BUILD_V2.md` — macOS 打包指南 v2（含修复说明）
- `build-mac.sh` — macOS 一键打包脚本
- `src-tauri/Entitlements.plist` — macOS 权限配置
- `CODE_REVIEW_REPORT.md` — 第一轮代码审查报告（2026-05-01）
- `CODE_REVIEW_REPORT_V2.md` — 第二轮代码审查报告（2026-05-01）

### 修改文件（本次修复）
- `src-tauri/Cargo.toml` — 添加 `custom-protocol` feature + `csv` 依赖，移除 `md5`，简化 `crate-type`
- `src-tauri/tauri.conf.json` — `frontendDist` 改相对路径，添加 macOS bundle 配置
- `src-tauri/src/lib.rs` — CSV 注入修复，Mutex 中毒修复，refresh_data 拆分
- `src-tauri/src/db/mod.rs` — `get_db_path` 返回 Result，WAL 模式，删除 `get_connection`
- `src-tauri/src/sync/mod.rs` — 拆分 parse/insert，优化 recalc_costs SQL
- `src-tauri/src/models/mod.rs` — 删除 `SyncProgress` 死代码
- `src-tauri/src/db/schema.rs` — 删除 `project_aliases` 表
- `src/App.tsx` — 添加 ErrorBoundary 包裹
- `src/routes/Dashboard.tsx` — 细粒度 selector + 取消守卫
- `src/routes/Analytics.tsx` — 细粒度 selector + 取消守卫
- `src/routes/Sessions.tsx` — 细粒度 selector + 取消守卫
- `src/components/AdvancedAnalytics.tsx` — O(n²) 优化 + 取消守卫
- `build-mac.sh` — 添加 Xcode 检查 + 产物验证

### 删除文件
- `src/utils/reportExport.ts` — 死代码（未被任何文件导入）

## 打包分发

### Windows 便携版
- **产物**：`src-tauri/target/release/token-cost-analyzer.exe`
- **大小**：约 10.6 MB
- **构建命令**：`npm run tauri build -- --no-bundle`（必须用 tauri CLI）

### macOS 打包
- 见 `MACOS_BUILD_V2.md`
- 需在 Mac 上执行，无法从 Windows 交叉编译

## 数据路径

| 平台 | Kimi 数据 | Claude 数据 | 数据库存储 |
|------|-----------|-------------|------------|
| Windows | `%USERPROFILE%/.kimi/sessions/` | `%USERPROFILE%/.claude/projects/` | `%APPDATA%/com.asus.token-cost-analyzer/` |
| macOS | `~/.kimi/sessions/` | `~/.claude/projects/` | `~/Library/Application Support/com.asus.token-cost-analyzer/` |
