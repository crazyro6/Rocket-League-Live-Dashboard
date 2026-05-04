@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found. Install Node.js first.
  pause
  exit /b 1
)

echo Starting Rocket League Stats app...
echo.
echo Close this window to stop the app.
echo.
echo URL: http://localhost:5173
echo.

start "" http://localhost:5173
call npm run start

endlocal
