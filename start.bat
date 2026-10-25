@echo off
chcp 65001 >nul
title XueYinYue - 学音乐
cd /d "%~dp0web"
echo.
echo   学音乐启动中... 浏览器将自动打开 http://localhost:5173
echo   关闭本窗口或按 Ctrl+C 即可停止应用（学习进度不受影响）
echo.
call npm run dev
pause
