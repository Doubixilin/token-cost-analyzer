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

- **Claude subagents max_depth**：已修复（`max_depth(3)` → `max_depth(4)`）
- **模型定价显示 $0.0000**：自定义模型未在 `model_pricing` 表中插入默认值（已通过 `ensure_all_models_priced` 自动补充）
- **图表导出**：Word 图表截图方案废弃，当前使用 Excel 纯数据导出

## 功能特性

### ✅ macOS 菜单栏 (System Tray) — 已实现

**commit**: `60bd401` 之后

**功能**：
- macOS 菜单栏显示图标 + 今日成本数字（`$XX.XX`）
- 左键点击弹出原生上下文菜单：今日统计 / 总计统计 / 刷新 / 打开窗口 / 退出
- 关闭主窗口时隐藏到后台（不退出），通过菜单栏可重新打开
- 每 60 秒自动刷新菜单栏数据

**技术方案**：
- 使用 Tauri v2 内置 `TrayIconBuilder`（`tray-icon` 0.21.3，无需额外依赖）
- `src-tauri/src/tray.rs` — tray 模块（create_tray, build_menu, update_tray_display, spawn_tray_updater）
- `Cargo.toml` features: `["custom-protocol", "macos-private-api", "tray-icon"]`
- `tauri.conf.json`: `"macOSPrivateApi": true`
- 使用 `tokio::spawn` + `tokio::time::interval` 做 60 秒定时更新
- 窗口 `CloseRequested` 事件调用 `api.prevent_close()` + `window.hide()`
- `icon_as_template(true)` 适配 macOS 深色/浅色模式

**Tauri v2 Tray API 要点**：
- `TrayIconBuilder::with_id(id)` 设置 ID（不是 `.id()`，那是 getter）
- `.show_menu_on_left_click(true)`（不是 `.menu_on_left_click()`）
- `Menu::with_items(app, &[&dyn IsMenuItem<Wry>])` 需要 trait object 引用
- `TrayIconEvent::Click { rect, .. }` 提供图标位置信息

### ✅ 代码审查修复 — 已完成

**commit**: `60bd401`

修复了 28 个问题（2 Critical / 4 High / 9 Medium / 13 Low）：
- SQL 参数化（heatmap 时间戳）
- mountedRef 重置 bug（4 个组件）
- Mutex 中毒恢复
- 导出数据量限制（10 万条）
- session list 补全 models/projects/agent_types 过滤
- insert count 精确统计（total_changes）
- ensure_all_models_priced 移入事务
- ChartCard 提取为独立组件
- formatCost 统一使用
- WalkDir 错误日志
- build-mac.sh 自动创建 Entitlements.plist

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
| `60bd401` | fix: code review fixes — SQL safety, mountedRef bug, mutex recovery, export limits |
| `ca26b4b` | fix: release 白屏根因修复 + 代码审查修复 + macOS 适配 |
| `3cbd4d3` | docs: add AGENTS.md with dev guide, known issues, and env config |
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
