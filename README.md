# Token Cost Analyzer

本地 AI 编码助手 Token 消耗统计与分析桌面应用。支持 **Kimi Code**、**Claude Code** 和 **Codex** 的 Token 使用记录自动读取、成本估算与可视化分析。

---

## 支持的 AI 工具

| 工具 | 数据来源 | 数据格式 |
|------|---------|---------|
| **Kimi Code** | `~/.kimi/sessions/wire.jsonl` | JSONL，`StatusUpdate` 事件 |
| **Claude Code** | `~/.claude/projects/*.jsonl` | JSONL，`assistant` 消息 usage |
| **Codex** | `~/.codex/sessions/**/rollout-*.jsonl` | JSONL，事件流（`session_meta` → `turn_context` → `token_count`） |

> 应用启动后自动扫描上述目录，基于文件修改时间实现**增量同步**，只处理新增或变更的会话文件。

---

## 功能特性

### 核心统计
- 📊 **总览仪表盘** — 总请求数、总成本、总 Token、缓存 Token 等核心指标
- 📈 **趋势分析** — 日/周/月 Token 消耗趋势折线图（堆叠面积 + 双 Y 轴）
- 🥧 **分布图表** — 模型分布、工具分布、代理类型分布饼图
- 🔥 **活动热力图** — GitHub 风格的每日消耗热力图

### 会话管理
- 📁 **会话浏览器** — 按时间倒序浏览所有会话，支持分页
- 🔍 **多维度筛选** — 按时间范围（今天/7天/30天/90天）、工具来源、模型、项目路径、代理类型筛选
- 📝 **会话详情** — 查看单条会话的逐条 Token 记录（输入 / 输出 / 缓存 / 成本）

### 高级分析
- 📉 **桑基图** — 工具 → 模型的 Token 流向
- 🎯 **Top-N 排行** — 最消耗 Token 的会话、模型、项目
- 💰 **累计成本曲线** — 随时间累积的成本趋势
- 🔬 **散点图** — 输入 vs 输出 Token 分布
- 🕐 **时段分布** — 24 小时使用频率分布

### 数据导出
- 📤 支持导出为 **CSV**、**JSON**、**Excel** 格式
- 🔄 一键同步最新数据

### 桌面小组件
- 🪟 透明悬浮窗，实时显示核心指标
- 📌 支持钉入桌面（Windows）
- 🌓 支持暗黑模式

---

## 技术栈

- **桌面框架**: [Tauri v2](https://tauri.app/) (Rust)
- **前端**: React 19 + TypeScript + Vite 7
- **样式**: TailwindCSS v4
- **图表**: ECharts 6（按需导入）
- **状态管理**: Zustand
- **数据库**: SQLite (rusqlite)
- **文件遍历**: walkdir

---

## 下载与安装

### Windows 便携版

从 [Releases](https://github.com/Doubixilin/token-cost-analyzer/releases) 页面下载 `token-cost-analyzer.exe`，双击即可运行。

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/Doubixilin/token-cost-analyzer.git
cd token-cost-analyzer

# 安装依赖
npm install

# 开发模式（热重载）
npm run tauri dev

# 构建 Release（生成便携版 exe）
npm run tauri build -- --no-bundle

# 完整打包（NSIS 安装程序）
npm run tauri build
```

> ⚠️ **注意**: 必须使用 `npm run tauri build` 构建，不能直接运行 `cargo build --release`，否则缺少 `custom-protocol` feature 会导致白屏。

---

## 使用说明

1. **首次启动** — 应用会自动扫描本地已安装的 Kimi Code / Claude Code / Codex 历史记录
2. **点击同步** — 点击右上角「同步数据」按钮读取最新记录
3. **查看统计** — 在仪表盘、分析、会话浏览器等页面查看多维度统计
4. **筛选数据** — 使用筛选器按时间、工具、模型、项目等维度过滤
5. **配置定价** — 在设置页调整各模型的单价（默认使用参考定价）

---

## 定价说明

应用内置了各模型的参考定价（单位：元/百万 Token），用于估算成本：

| 模型系列 | 输入 | 输出 | 缓存读取 | 缓存创建 |
|---------|------|------|---------|---------|
| Claude Opus 4 | ¥15.0 | ¥75.0 | ¥1.5 | ¥18.75 |
| Claude Sonnet 4 | ¥3.0 | ¥15.0 | ¥0.3 | ¥3.75 |
| Kimi K2.5 | ¥2.0 | ¥8.0 | ¥0.2 | ¥2.0 |
| GPT-4o | ¥2.5 | ¥10.0 | ¥1.25 | ¥2.5 |
| GPT-5.4 / Codex High | ¥5.0 | ¥20.0 | ¥2.5 | ¥5.0 |
| DeepSeek V4 Pro | ¥0.27 | ¥1.1 | ¥0.07 | ¥0.27 |

> 定价仅供参考，实际费用以各平台账单为准。可在设置页手动修改。

---

## 数据存储

| 平台 | 数据位置 |
|------|---------|
| Windows | `%APPDATA%/com.asus.token-cost-analyzer/token_analyzer.db` |
| macOS | `~/Library/Application Support/com.asus.token-cost-analyzer/token_analyzer.db` |

所有数据均存储在本地 SQLite 数据库中，不会上传至任何服务器。

---

## 版本历史

| 版本 | 日期 | 主要更新 |
|------|------|---------|
| v0.3.2 | 2026-05-02 | ✅ 新增 Codex Token 统计支持 |
| v0.3.1 | 2026-05-02 | 移除透明度功能（WebView2 限制），货币统一为 CNY |
| v0.3.0 | 2026-05-01 | 全面代码审查修复，Widget 桌面钉入重构 |
| v0.2.0 | 2026-04-29 | 增量同步、数据准确性修复、ECharts 按需导入 |
| v0.1.0 | 2026-04-28 | 初始版本，支持 Kimi + Claude 基础统计 |

---

## 许可证

MIT License
