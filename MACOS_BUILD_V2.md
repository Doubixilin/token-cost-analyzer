# macOS 构建指南 v2 — 修复版

本文档适用于在 Mac 上拉取修复后的代码并重新打包的完整流程。

---

## 本次修复对 macOS 的影响

### 已修复的关键问题

| 问题 | 修复内容 | macOS 影响 |
|------|----------|-----------|
| Release 白屏 | `Cargo.toml` 添加 `custom-protocol` feature | **直接修复** — macOS 构建同样需要此 feature |
| `frontendDist` 绝对路径 | 改为相对路径 `"../dist"` | **直接修复** — 之前的 `D:/GIThub/...` 在 Mac 上不存在，构建会失败 |
| Mutex 中毒恢复 | 改为返回错误而非静默吞错 | 通用修复 |
| CSV 注入漏洞 | 使用 `csv` crate 替代手动拼接 | 通用修复 |
| `get_db_path` 启动崩溃 | `unwrap()` 改为返回 `Result` | 通用修复 |
| SQLite WAL 模式 | 添加 `PRAGMA journal_mode=WAL` | 通用修复，提升并发读写性能 |
| React ErrorBoundary | 新增错误边界组件 | 通用修复，防止白屏崩溃 |
| 数据同步阻塞 UI | 解析移出 Mutex 锁 | 通用修复，同步期间 UI 可读 |
| SQL 性能优化 | N+1 UPDATE 改为单条 UPDATE...FROM | 通用修复，大数据量下显著提速 |
| macOS 权限配置 | 新增 `Entitlements.plist` | **macOS 专属** — 解决 Gatekeeper 拦截 |
| macOS bundle 配置 | `tauri.conf.json` 添加 `macOS` 段 | **macOS 专属** — 指定最低系统版本和权限文件 |

---

## 前置条件

- macOS 12 (Monterey) 或更新版本
- Apple Silicon (M1/M2/M3/M4) 或 Intel Mac
- 约 2GB 磁盘空间（Rust 依赖 + 编译产物）

---

## Step 1: 安装系统依赖

### 1.1 Xcode Command Line Tools

```bash
xcode-select --install
```

如果已安装会提示 `already installed`。验证：
```bash
xcode-select -p
# 应输出 /Library/Developer/CommandLineTools 或 /Applications/Xcode.app/...
```

### 1.2 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

验证：
```bash
rustc --version   # 需要 1.78+
cargo --version
```

### 1.3 Node.js (v20+)

```bash
# 方式一：Homebrew
brew install node

# 方式二：官网下载 https://nodejs.org
```

验证：
```bash
node -v   # v20.x+
npm -v
```

### 1.4 国内镜像（可选，加速 npm）

```bash
npm config set registry https://registry.npmmirror.com
```

---

## Step 2: 拉取代码

```bash
git clone https://github.com/Doubixilin/token-cost-analyzer.git
cd token-cost-analyzer
```

如果已有本地仓库，直接拉取最新代码：
```bash
cd token-cost-analyzer
git pull origin master
```

---

## Step 3: 构建前确认清单

在开始构建前，确认以下文件内容正确：

### 3.1 确认 `custom-protocol` feature 已添加

```bash
grep "custom-protocol" src-tauri/Cargo.toml
# 应输出: tauri = { version = "2", features = ["custom-protocol"] }
```

### 3.2 确认 `frontendDist` 是相对路径

```bash
grep "frontendDist" src-tauri/tauri.conf.json
# 应输出: "frontendDist": "../dist"
# 如果是 "D:/GIThub/..." 则说明代码未更新
```

### 3.3 确认 `Entitlements.plist` 存在

```bash
ls -la src-tauri/Entitlements.plist
# 应该存在此文件
```

### 3.4 确认 macOS bundle 配置存在

```bash
grep -A3 "macOS" src-tauri/tauri.conf.json
# 应看到 "minimumSystemVersion": "10.15" 和 "entitlements": "Entitlements.plist"
```

---

## Step 4: 构建

### 方式一：使用构建脚本（推荐）

```bash
chmod +x build-mac.sh
./build-mac.sh
```

脚本会自动：检查 Xcode CLI → 检查 Rust/Node → 安装依赖 → 构建 → 验证产物。

### 方式二：手动构建

```bash
# 安装前端依赖
npm install

# 构建发布版（必须用 tauri CLI，不能用 cargo build --release）
npm run tauri build
```

**重要**：永远不要直接运行 `cargo build --release`。Tauri CLI 会自动注入 `custom-protocol` feature，裸 cargo 不会。

构建过程约 3-5 分钟（首次编译较慢，后续增量编译较快）。

---

## Step 5: 找到产物

构建完成后：

```
src-tauri/target/release/bundle/
├── dmg/
│   └── token-cost-analyzer_0.1.0_aarch64.dmg   # Apple Silicon
│   └── token-cost-analyzer_0.1.0_x64.dmg       # Intel
└── macos/
    └── Token Cost Analyzer.app
```

---

## Step 6: 首次运行

macOS 默认阻止未签名应用。首次运行需要：

### 方法一：右键打开
1. 右键点击 `Token Cost Analyzer.app`
2. 选择「打开」
3. 弹窗中点击「打开」

### 方法二：系统设置
1. 双击应用，会被阻止
2. 打开「系统设置 → 隐私与安全性 → 安全性」
3. 找到被阻止的应用，点击「仍要打开」

### 方法三：命令行移除隔离属性
```bash
xattr -cr "src-tauri/target/release/bundle/macos/Token Cost Analyzer.app"
```

---

## 验证应用正常工作

1. 启动应用后，应自动扫描 `~/.kimi/sessions/` 和 `~/.claude/projects/` 数据
2. 仪表盘应显示统计数据和图表
3. 切换页面（分析视图/会话浏览器/设置）无白屏
4. 设置页修改模型定价后，成本应自动重算
5. 导出 CSV 功能应正常工作

---

## 常见问题

### Q: 构建报错 `error: could not find system library`

确保 Xcode Command Line Tools 已正确安装：
```bash
xcode-select -p
# 应输出路径，如 /Library/Developer/CommandLineTools
```

### Q: `npm install` 卡住

使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: 构建后双击 .app 无反应或闪退

在终端运行查看错误信息：
```bash
./src-tauri/target/release/bundle/macos/Token\ Cost\ Analyzer.app/Contents/MacOS/token-cost-analyzer
```

### Q: 构建后仍然白屏

这说明 `custom-protocol` feature 未生效。检查：
```bash
# 清理缓存
cd src-tauri && cargo clean && cd ..

# 重新构建（必须用 tauri CLI）
npm run tauri build

# 检查构建输出中是否还有 cfg(dev)
grep "rustc-cfg=dev" src-tauri/target/release/build/token-cost-analyzer-*/output
# 应无匹配。如果仍有匹配，说明缓存未完全清理
```

### Q: 数据库位置

```
~/Library/Application Support/com.asus.token-cost-analyzer/token_analyzer.db
```

如需重置数据，删除此文件后重新启动应用。

### Q: 如何构建通用二进制（同时支持 Intel + Apple Silicon）

```bash
npm run tauri build -- --target universal-apple-darwin
```

产物为 `token-cost-analyzer_0.1.0_universal.dmg`。

---

## 数据路径

| 类型 | macOS 路径 |
|------|-----------|
| SQLite 数据库 | `~/Library/Application Support/com.asus.token-cost-analyzer/` |
| Kimi 会话数据 | `~/.kimi/sessions/` |
| Claude 项目数据 | `~/.claude/projects/` |
| Kimi 配置文件 | `~/.kimi/config.toml` |

---

## 关于代码签名和公证

当前构建的应用未签名，用户需要手动绕过 Gatekeeper。如果需要分发给更多人，建议：

1. 注册 Apple Developer Program（$99/年）
2. 获取 Developer ID Application 证书
3. 在 `tauri.conf.json` 中配置 `signingIdentity`
4. 使用 `xcrun notarytool` 进行公证

详见 [Tauri 官方文档 - macOS 签名](https://v2.tauri.app/distribute/macos-application-signing/)。
