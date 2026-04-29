# Agent 开发指南

## 项目概述

Token Cost Analyzer - AI 编程助手 Token 消耗与成本分析工具
- Tauri v2 + React 19 + Vite + TailwindCSS v4 + Rust + SQLite
- 数据源自 `~/.kimi/sessions/` 和 `~/.claude/projects/`

## 已知问题（待修复）

### 🔴 高优先级：Release 模式打开白屏 / localhost 拒绝连接

**现象**：`cargo build --release` 或 `npm run tauri build -- --no-bundle` 生成的 exe，双击运行后窗口显示：
> 嗯… 无法访问此页面。localhost 拒绝连接。ERR_CONNECTION_REFUSED

**排查记录**：
1. Vite `base: "./"` 已改为相对路径，dist/index.html 中资源路径已变为 `./assets/...`
2. 多次清理 `target/release/build/token-cost-analyzer-*` 缓存后重新编译，问题依旧
3. `tauri-codegen-assets` 目录在构建输出中不存在，怀疑 Tauri v2 资源嵌入机制未触发
4. `tauri.conf.json` 中已尝试添加 `"url": "index.html"`，无效
5. `frontendDist` 已尝试相对路径 `"../dist"` 和绝对路径 `"D:/GIThub/.../dist"`，均无效
6. 字符串搜索发现 exe 中包含 `http://localhost:1420` 和 `index.html`，说明配置被读取但窗口仍连 devUrl

**可能原因**：
- Tauri v2 的 `tauri-build` 构建脚本在 Windows 上未正确生成嵌入资源
- `generate_context!()` 宏在编译时未把 dist/ 资源正确嵌入
- `tauri.conf.json` 缺少某个 v2 必填字段导致配置回退到 devUrl
- 或需用 `npm run tauri build`（完整流程）而非单独 `cargo build --release`

**建议排查方向**：
1. 检查 `tauri-build = "2.5.6"` 是否存在已知 Windows 资源嵌入 bug
2. 对比全新 Tauri v2 项目模板的 `tauri.conf.json` 逐项检查缺失字段
3. 尝试降级 `tauri-build` 到 `2.0.x` 或 `2.1.x`
4. 检查 `Cargo.toml` 中 `tauri` feature 是否缺少 `protocol-asset` 等
5. 用 `tauri inspect` 或增加日志查看运行时实际加载的 URL

### 🟡 中优先级

- **Claude subagents max_depth**：已修复（`max_depth(3)` → `max_depth(4)`）
- **模型定价显示 $0.0000**：自定义模型未在 `model_pricing` 表中插入默认值
- **图表导出**：Word 图表截图方案废弃，当前使用 Excel 纯数据导出

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

# Rust Release 编译（注意：当前有 localhost 白屏问题）
cargo build --release

# Tauri Release 构建（推荐尝试修复后使用）
npm run tauri build -- --no-bundle
```

### 代理设置（GitHub CLI + Git）

系统有本地代理 `127.0.0.1:33210`，浏览器可走通 GitHub，但 CLI 默认不走：

```powershell
# Git 全局代理（已配置，所有仓库生效）
git config --global http.proxy http://127.0.0.1:33210
git config --global https.proxy http://127.0.0.1:33210

# GitHub CLI 代理（需每次设置环境变量）
$env:HTTP_PROXY = "http://127.0.0.1:33210"
$env:HTTPS_PROXY = "http://127.0.0.1:33210"

# 永久生效：写入 PowerShell Profile
notepad $PROFILE
# 添加：
# $env:HTTP_PROXY = "http://127.0.0.1:33210"
# $env:HTTPS_PROXY = "http://127.0.0.1:33210"
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
| `8ebf9bf` | fix: Claude subagents max_depth(3) -> max_depth(4) |
| `5cdedc6` | docs: add macOS build guide + build script, update bundle targets |
| `c0f4986` | feat: advanced analytics + Excel export + dark mode + data sync fixes |
| `963a1fa` | fix: P0/P1 code review fixes + dark mode + data export |
| `20e787e` | feat: initial implementation |

## 文件变更记录

### 新增文件
- `src/components/AdvancedAnalytics.tsx` — ABCD 四维度高级分析
- `src/utils/excelExport.ts` — Excel 多 Sheet 导出
- `src/utils/reportExport.ts` — Word 报告导出（已废弃）
- `MACOS_BUILD.md` — macOS 打包指南
- `build-mac.sh` — macOS 一键打包脚本

### 修改文件
- `vite.config.ts` — `base: "./"` 相对路径
- `src-tauri/tauri.conf.json` — bundle targets: `["nsis", "dmg"]`, url: "index.html"
- `src-tauri/src/parsers/claude.rs` — max_depth(3) -> max_depth(4)
- `src/routes/Analytics.tsx` — 添加 Excel 导出按钮
- `src/routes/Dashboard.tsx` — 移除 AdvancedAnalytics

## 打包分发

### Windows 便携版
- **产物**：`src-tauri/target/release/token-cost-analyzer.exe`
- **大小**：约 10.6 MB
- **注意**：当前 release exe 有 localhost 白屏问题，修复前不要对外发布

### macOS 打包
- 见 `MACOS_BUILD.md`
- 需在 Mac 上执行，无法从 Windows 交叉编译

## 数据路径

| 平台 | Kimi 数据 | Claude 数据 | 数据库存储 |
|------|-----------|-------------|------------|
| Windows | `%USERPROFILE%/.kimi/sessions/` | `%USERPROFILE%/.claude/projects/` | `%APPDATA%/com.asus.token-cost-analyzer/` |
| macOS | `~/.kimi/sessions/` | `~/.claude/projects/` | `~/Library/Application Support/com.asus.token-cost-analyzer/` |
