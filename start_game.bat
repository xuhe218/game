@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set PORT=4177
set URL=http://127.0.0.1:%PORT%/

echo 正在启动 双人召唤战线 ...
echo 浏览器地址：%URL%

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  python -m http.server %PORT% --bind 127.0.0.1
  goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  py -3 -m http.server %PORT% --bind 127.0.0.1
  goto :end
)

echo 没有找到 Python。也可以直接双击 index.html 运行。
pause

:end
endlocal
