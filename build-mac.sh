#!/bin/bash
set -e

echo "🚀 Token Cost Analyzer - macOS 打包脚本"
echo "=========================================="

# 检查依赖
echo "📋 检查环境..."

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

# 安装前端依赖
echo ""
echo "📦 安装前端依赖..."
npm install

# 构建前端 + 打包 Tauri
echo ""
echo "🔨 开始编译打包..."
echo "   这可能需要 3-5 分钟，取决于你的 Mac 性能"
echo ""
npm run tauri build

# 输出结果
echo ""
echo "✅ 打包完成！"
echo ""
echo "📁 产物位置:"
echo "   DMG 安装包: src-tauri/target/release/bundle/dmg/"
echo "   APP 应用:   src-tauri/target/release/bundle/macos/"
echo ""
echo "🎉 可以直接把 .dmg 文件发给其他人使用！"
