#!/bin/bash
set -e

echo "🚀 Token Cost Analyzer - macOS 打包脚本"
echo "=========================================="

# 检查依赖
echo "📋 检查环境..."

# 检查 Xcode Command Line Tools（必需：C 编译器 + macOS SDK）
if ! xcode-select -p &> /dev/null; then
    echo "❌ Xcode Command Line Tools 未安装"
    echo "   请运行: xcode-select --install"
    echo "   安装完成后再重新运行此脚本"
    exit 1
fi
echo "✅ Xcode CLI: $(xcode-select -p)"

if ! command -v rustc &> /dev/null; then
    echo "❌ Rust 未安装，请先运行: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js v20+"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Cargo 未找到，请检查 Rust 安装"
    exit 1
fi

echo "✅ Rust: $(rustc --version)"
echo "✅ Node: $(node -v)"
echo "✅ Cargo: $(cargo --version)"

# 确认 Entitlements.plist 存在
if [ ! -f "src-tauri/Entitlements.plist" ]; then
    echo "⚠️  未找到 src-tauri/Entitlements.plist，macOS 可能会阻止应用运行"
fi

# 安装前端依赖
echo ""
echo "📦 安装前端依赖..."
npm install

# 构建前端 + 打包 Tauri（必须用 tauri CLI，不能裸 cargo build）
echo ""
echo "🔨 开始编译打包..."
echo "   这可能需要 3-5 分钟，取决于你的 Mac 性能"
echo "   注意：请勿使用 cargo build --release，必须通过 npm run tauri build 构建"
echo ""
npm run tauri build

# 验证产物
echo ""
echo "📁 检查打包产物..."

DMG_DIR="src-tauri/target/release/bundle/dmg"
APP_DIR="src-tauri/target/release/bundle/macos"

if [ -d "$DMG_DIR" ]; then
    echo "✅ DMG 安装包: $DMG_DIR/"
    ls -lh "$DMG_DIR"/*.dmg 2>/dev/null || echo "   (未找到 .dmg 文件)"
else
    echo "❌ DMG 产物未生成，请检查构建日志"
    exit 1
fi

if [ -d "$APP_DIR" ]; then
    echo "✅ APP 应用:   $APP_DIR/"
else
    echo "⚠️  APP 目录不存在"
fi

echo ""
echo "🎉 打包完成！"
echo ""
echo "首次运行提示："
echo "  macOS 可能会阻止未签名的应用。解决方法："
echo "  1. 右键点击 .app → 选择「打开」"
echo "  2. 或 系统设置 → 隐私与安全性 → 安全性 → 点击「仍要打开」"
