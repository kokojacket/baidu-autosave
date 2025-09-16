#!/bin/bash

# 百度网盘自动转存工具前端启动脚本

echo "=== 百度网盘自动转存工具前端启动 ==="
echo ""

# 检查Node.js版本
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js (>= 16.0.0)"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js 版本过低，当前版本：$(node -v)，需要：>= 16.0.0"
    exit 1
fi

echo "✅ Node.js 版本：$(node -v)"

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

echo "✅ npm 版本：$(npm -v)"
echo ""

# 检查是否存在node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖中..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "✅ 依赖已存在，跳过安装"
fi

echo ""
echo "⚠️  重要提醒："
echo "   请先在项目根目录执行: python web_app.py"
echo "   确保后端服务运行在: http://localhost:5000"
echo "   否则前端将无法正常工作！"
echo ""
echo "🚀 启动前端开发服务器..."
echo "📍 前端地址: http://localhost:3000"
echo "🔗 API代理: http://localhost:5000 → http://localhost:3000/api"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 启动开发服务器
npm run dev
