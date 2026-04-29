# 桌面悬浮小组件开发方案

## 背景

Token Cost Analyzer 是一个 Tauri v2 + React 19 桌面应用，用于追踪 AI token 消耗。目前是单窗口应用，无托盘和后台模式。本方案为其添加一个**可自定义的桌面悬浮小组件**，以毛玻璃效果展示 token 统计数据，并集成系统托盘实现后台常驻。

## 整体架构

多窗口 Tauri 应用，共享 Rust 后端。小组件是第二个 `WebviewWindow`，配置为透明 + 无边框 + 置顶。两个窗口独立调用相同的 Tauri IPC 命令（独立浏览器上下文，独立 Zustand Store）。

```
Tauri 进程
  ├── 主窗口（现有，1400x900，标准窗口装饰）
  ├── 小组件窗口（新增，透明、无边框、置顶）
  └── 系统托盘图标（新增）
```

## 可选数据模块

| 模块 ID | 中文名 | 数据来源 | 显示方式 |
|---------|--------|---------|---------|
| `overview_cost` | 总成本 | `getOverviewStats` | 大号数字 + 货币单位 |
| `overview_tokens` | 总 Token 数 | `getOverviewStats` | 格式化 token 计数 |
| `overview_requests` | 总请求数 | `getOverviewStats` | 请求数量 |
| `mini_trend` | 消耗趋势 | `getTrendData`（7天） | 迷你面积图，无图例 |
| `source_split` | 工具分布 | `getDistribution("source")` | 紧凑甜甜图或条形图 |
| `model_dist` | 模型分布 | `getDistribution("model")` | 水平条形图（Top 5） |
| `cost_breakdown` | 成本明细 | `getDistribution("source")` 成本 | 两项带金额 |
| `session_count` | 会话统计 | `getOverviewStats` 派生 | 计数 + 平均成本 |
| `cache_stats` | 缓存效率 | `getOverviewStats` 派生 | 比率条 + 百分比 |

## 分阶段实施

### 阶段一：多窗口基础

**目标：** 创建第二个透明无边框窗口，显示占位内容。

**修改文件：**
- `vite.config.ts` — 添加多页面构建配置：
  ```ts
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        widget: resolve(__dirname, "widget.html")
      }
    }
  }
  ```
- `src-tauri/Cargo.toml` — tauri features 添加 `tray-icon`：
  ```toml
  tauri = { version = "2", features = ["custom-protocol", "tray-icon"] }
  ```
- `src-tauri/src/lib.rs` — 添加 `mod widget;`，注册 `toggle_widget` 命令
- `src-tauri/capabilities/default.json` — windows 数组添加 `"widget"`

**新增文件：**
- `widget.html` — 第二个 HTML 入口，html/body 背景设为 `transparent`
- `src/widget-main.tsx` — React 入口，渲染 `<WidgetApp />`
- `src/widget/WidgetApp.tsx` — 占位根组件
- `src-tauri/src/widget.rs` — `toggle_widget` 命令：通过 `WebviewWindowBuilder` 创建小组件窗口，配置 `decorations: false, transparent: true, always_on_top: true, skip_taskbar: true, shadow: false, focused: false`

### 阶段二：系统托盘

**目标：** 应用可最小化到托盘，通过托盘控制主窗口和小组件。

**新增文件：**
- `src-tauri/src/tray.rs` — `TrayIconBuilder` 构建托盘图标，菜单项：「显示主窗口」「显示/隐藏小组件」「退出」。左键单击显示主窗口。

**修改文件：**
- `src-tauri/src/lib.rs` — setup 中调用 `tray::setup_tray`；添加 `on_window_event` 拦截主窗口关闭事件 → 隐藏而非退出
- `src/components/Layout.tsx` — 侧边栏底部添加小组件切换按钮（lucide `Layers` 图标），调用 `toggleWidget()`
- `src/api/tauriCommands.ts` — 添加 `toggleWidget()` 包装函数

### 阶段三：小组件 UI — 毛玻璃 + 数据展示

**目标：** 美观的小组件展示真实 token 数据。

**新增文件：**
- `src/stores/useWidgetStore.ts` — 小组件专用 Zustand Store（config, overview, trendData, isLoading, refreshVersion）
- `src/widget/WidgetHeader.tsx` — 标题栏，带 `data-tauri-drag-region`，图标按钮：刷新、设置、锁定/解锁、钉入桌面、关闭
- `src/widget/WidgetBody.tsx` — 按竖向/网格布局渲染已选模块
- `src/widget/modules/index.ts` — 模块注册表，`WIDGET_MODULES` 数组
- `src/widget/modules/OverviewModule.tsx` — 3 个统计卡片（成本、token、请求数），使用 `getOverviewStats`
- `src/widget/modules/MiniTrendModule.tsx` — 紧凑面积图（120px），使用 `getTrendData`
- `src/widget/modules/SourceSplitModule.tsx` — Kimi vs Claude 分布，使用 `getDistribution`

**修改文件：**
- `src/index.css` — 添加 `.widget-glass`（backdrop-filter blur + rgba 背景）和 `.widget-card` 类

**Rust 侧：** 小组件窗口创建时应用 `WindowEffect::Acrylic` 窗口特效实现真正的毛玻璃效果。

### 阶段四：拖拽、锁定、透明度

**目标：** 定位和外观的交互控制。

- 解锁时标题栏带 `data-tauri-drag-region` 可拖拽，锁定后移除
- `src-tauri/src/widget.rs` — 添加 `set_widget_opacity` 和 `set_widget_ignore_cursor` 命令
- 新增 `src/widget/WidgetSettings.tsx` — 透明度滑块（0.3-1.0）、模块开关、布局选择器、主题选择器、刷新间隔

### 阶段五：设置持久化

**目标：** 所有小组件设置在重启后保留。

- `src-tauri/src/widget.rs` — `save_widget_config` / `load_widget_config` 命令，读写 `{app_data_dir}/widget_config.json`
- `src-tauri/Cargo.toml` — 添加 `tauri-plugin-window-state = "2"`
- `src-tauri/src/lib.rs` — 注册 window-state 插件
- `src/types/index.ts` — 添加 `WidgetConfig` 接口
- `useWidgetStore` — 挂载时 `loadConfig()`，变更时 `saveConfig()`（防抖）

**持久化内容：**
- `opacity`（透明度 0.3-1.0）
- `locked`（是否锁定）
- `pinned_to_desktop`（是否钉入桌面）
- `selected_modules`（已选模块 ID 数组）
- `layout`（"vertical" | "grid"）
- `width`, `height`, `x`, `y`（窗口尺寸和位置）
- `theme`（"light" | "dark" | "auto"）
- `refresh_interval_sec`（自动刷新间隔，默认 300 秒）

### 阶段六：扩展模块

- `src/widget/modules/ModelDistModule.tsx` — Top 5 模型水平条形图
- `src/widget/modules/CacheStatsModule.tsx` — 缓存效率比率条
- `WidgetSettings.tsx` — 完善模块开关复选框、布局切换

### 阶段七：桌面钉入（Windows）

- `src-tauri/Cargo.toml` — 添加 `windows` crate（cfg-gated）：
  ```toml
  [target.'cfg(windows)'.dependencies]
  windows = { version = "0.58", features = ["Win32_Foundation", "Win32_WindowsAndMessaging"] }
  ```
- `src-tauri/src/widget.rs` — `embed_widget_to_desktop`：FindWindowA("Progman") → SendMessage 0x052C → 找到 WorkerW → SetParent 嵌入。`unpin_widget_from_desktop`：SetParent(None) + 恢复 alwaysOnTop
- `WidgetHeader.tsx` — 钉入/取消钉入按钮（仅 Windows 显示）

### 阶段八：打磨优化

- 使用 `setInterval` + `refreshIntervalSec` 实现自动刷新
- 手动刷新按钮带旋转动画
- 创建轻量 `echarts-widget-setup.ts`（仅注册 LineChart + GridComponent）
- 小组件专用 ErrorBoundary
- 各模块空数据状态

## 文件变更总览

### 需修改的文件（9 个）

| 文件 | 变更内容 |
|------|---------|
| `src-tauri/Cargo.toml` | tray-icon feature、window-state 插件、windows crate |
| `src-tauri/src/lib.rs` | mod tray/widget、插件注册、托盘初始化、关闭拦截、新命令注册 |
| `src-tauri/capabilities/default.json` | 添加 "widget" 窗口、window-state 权限 |
| `vite.config.ts` | 多页面入口配置 |
| `src/index.css` | 小组件毛玻璃样式类 |
| `src/api/tauriCommands.ts` | 7 个新 IPC 包装函数 |
| `src/types/index.ts` | WidgetConfig 接口 |
| `src/components/Layout.tsx` | 侧边栏小组件切换按钮 |
| `src/routes/Settings.tsx` | 小组件设置区域 |

### 新增文件（15 个）

| 文件 | 用途 |
|------|------|
| `widget.html` | 小组件窗口 HTML 入口 |
| `src/widget-main.tsx` | 小组件 React 入口 |
| `src/widget/WidgetApp.tsx` | 小组件根组件 |
| `src/widget/WidgetHeader.tsx` | 标题栏 + 控制按钮 |
| `src/widget/WidgetBody.tsx` | 模块容器 |
| `src/widget/WidgetSettings.tsx` | 设置面板 |
| `src/widget/modules/index.ts` | 模块注册表 |
| `src/widget/modules/OverviewModule.tsx` | 统计卡片模块 |
| `src/widget/modules/MiniTrendModule.tsx` | 趋势图模块 |
| `src/widget/modules/SourceSplitModule.tsx` | 工具分布模块 |
| `src/widget/modules/ModelDistModule.tsx` | 模型分布模块 |
| `src/widget/modules/CacheStatsModule.tsx` | 缓存统计模块 |
| `src/stores/useWidgetStore.ts` | 小组件 Zustand Store |
| `src-tauri/src/tray.rs` | 系统托盘设置 |
| `src-tauri/src/widget.rs` | 小组件命令 + 配置管理 |

## 关键技术点

### Tauri v2 窗口配置

| 选项 | 值 | 作用 |
|------|-----|------|
| `transparent` | `true` | 窗口背景透明 |
| `decorations` | `false` | 无边框 |
| `alwaysOnTop` | `true` | 始终置顶 |
| `skipTaskbar` | `true` | 不显示在任务栏 |
| `shadow` | `false` | 无窗口阴影 |
| `focused` | `false` | 创建时不抢焦点 |
| `windowEffects` | `Acrylic` | Windows 毛玻璃特效 |

### 拖拽实现

标题栏设置 `data-tauri-drag-region` 属性实现原生拖拽。按钮设置 `data-tauri-drag-region="false"` 防止被拖拽捕获。锁定状态下移除拖拽区域属性。

### 透明度控制

通过 Tauri 的 `set_opacity()` 原生 API 控制窗口整体透明度（0.3-1.0），比 CSS 方案更可靠。

### 桌面钉入（Windows）

通过 Win32 API 将小组件窗口嵌入 WorkerW 层（壁纸和桌面图标之间）：
1. `FindWindowA("Progman", None)` 找到桌面管理器
2. `SendMessageA(0x052C)` 创建 WorkerW 层
3. 枚举窗口找到包含 SHELLDLL_DefView 的 WorkerW
4. `SetParent(widget_hwnd, workerw_hwnd)` 重新挂载

该技术在 Windows 7-11 上均可用，失败时优雅降级为普通置顶窗口。

### 低资源消耗

- 默认 5 分钟自动刷新，可配置为 1/5/15/30 分钟或仅手动
- 小组件专用精简 ECharts 配置（仅 LineChart + GridComponent）
- 窗口不可见时暂停图表动画
- `focusable: false` 防止抢夺焦点

## 验证清单

1. `npm run tauri dev` — 应用正常启动
2. 侧边栏点击小组件切换 → 透明无边框窗口出现
3. 毛玻璃效果正常（Windows Acrylic 模糊）
4. 拖拽标题栏移动小组件，锁定后无法拖拽
5. 调整透明度滑块，透明度实时变化
6. 设置中开关模块，小组件内容同步更新
7. 关闭主窗口 → 隐藏到托盘而非退出
8. 右键托盘 → 显示主窗口 / 切换小组件 / 退出 均正常
9. 重启应用 → 小组件设置保留
10. 钉入桌面（Windows）→ 小组件显示在桌面图标后方
11. `npm run tauri build` — 发布构建正常，无白屏
