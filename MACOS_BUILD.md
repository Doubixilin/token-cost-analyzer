# macOS 打包指南

Token Cost Analyzer 原生支持 macOS，但由于 Tauri 的限制，**必须从 macOS 系统上编译**才能生成 `.app` 或 `.dmg`。Windows 无法交叉编译 macOS 版本。

---

## 环境要求

- macOS 12+ (Monterey 或更新版本)
- Apple Silicon (M1/M2/M3) 或 Intel Mac 均可

---

## 第一步：安装系统依赖

### 1.1 Xcode Command Line Tools

```bash
xcode-select --install
```

如果已经安装，会提示 `command line tools are already installed`。

### 1.2 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

验证：
```bash
rustc --version  # 应显示 1.78+
cargo --version
```

### 1.3 Node.js (建议 v20+)

```bash
# 方式一：官方安装包
# 下载 https://nodejs.org 并安装

# 方式二：Homebrew
brew install node

# 验证
node -v  # v20.x+
npm -v
```

---

## 第二步：克隆仓库

```bash
git clone https://github.com/Doubixilin/token-cost-analyzer.git
cd token-cost-analyzer
```

---

## 第三步：安装依赖并编译

```bash
# 安装前端依赖
npm install

# 编译并打包（开发模式测试）
npm run tauri dev

# 或者打包发布版本（生成 .dmg 安装包）
npm run tauri build
```

---

## 第四步：找到打包产物

打包完成后，文件位于：

```
src-tauri/target/release/bundle/dmg/
├── token-cost-analyzer_0.1.0_aarch64.dmg   # Apple Silicon (M1/M2/M3)
├── token-cost-analyzer_0.1.0_x64.dmg       # Intel Mac
└── token-cost-analyzer_0.1.0_universal.dmg # 通用版（两种架构都支持）
```

> 如果你是 Apple Silicon Mac，推荐分发 `aarch64.dmg` 或 `universal.dmg`。

同时还会生成可直接运行的 `.app`：

```
src-tauri/target/release/bundle/macos/Token Cost Analyzer.app
```

---

## 数据目录说明

macOS 上的数据存储位置：

| 类型 | 路径 |
|------|------|
| SQLite 数据库 | `~/Library/Application Support/com.asus.token-cost-analyzer/` |
| Kimi 会话数据 | `~/.kimi/sessions/` |
| Claude 项目数据 | `~/.claude/projects/` |
| Kimi 配置文件 | `~/.kimi/config.toml` |

---

## 常见问题

### Q: 编译报错 `error: could not find system library`

确保 Xcode Command Line Tools 已正确安装：
```bash
xcode-select -p
# 应输出 /Library/Developer/CommandLineTools 或 /Applications/Xcode.app/...
```

### Q: `npm install` 卡住

换国内镜像源：
```bash
npm config set registry https://registry.npmmirror.com
```

### Q: 运行时报 "无法打开，因为无法验证开发者"

macOS 默认阻止未签名的应用。右键点击 `.app` → 打开，或在系统设置 → 隐私与安全性 → 安全性 → 点击"仍要打开"。

### Q: Tauri 前端资源路径找不到

确保前端构建成功（`dist/` 目录存在），Tauri 会自动嵌入这些文件。

---

## 一键打包脚本

如果你不想手动敲命令，项目根目录提供了 `build-mac.sh`：

```bash
chmod +x build-mac.sh
./build-mac.sh
```

脚本会自动完成：安装依赖 → 前端构建 → Rust 编译 → 打包 dmg。
