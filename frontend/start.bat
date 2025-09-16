@echo off
chcp 65001 > nul

echo === 百度网盘自动转存工具前端启动 ===
echo.

REM 检查Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装，请先安装 Node.js ^(^>= 16.0.0^)
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js 版本：%NODE_VERSION%

REM 检查npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm 未安装
    pause
    exit /b 1
)

for /f %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm 版本：%NPM_VERSION%
echo.

REM 检查依赖
if not exist "node_modules" (
    echo 📦 安装依赖中...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo ✅ 依赖安装完成
) else (
    echo ✅ 依赖已存在，跳过安装
)

echo.
echo ⚠️  重要提醒：
echo    请先在项目根目录执行: python web_app.py
echo    确保后端服务运行在: http://localhost:5000
echo    否则前端将无法正常工作！
echo.
echo 🚀 启动前端开发服务器...
echo 📍 前端地址: http://localhost:3000
echo 🔗 API代理: http://localhost:5000 → http://localhost:3000/api
echo.
echo 按 Ctrl+C 停止服务器
echo.

REM 启动开发服务器
npm run dev

pause
