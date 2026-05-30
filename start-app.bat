@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install it from https://nodejs.org first.
  pause
  exit /b 1
)

rem If the server is already running (e.g. via auto-start), just open the app.
curl -s -o nul --max-time 2 "http://localhost:3001/"
if %errorlevel%==0 (
  echo Server already running. Opening the app...
  start "" http://localhost:3001
  exit /b 0
)

rem First run (or after deleting dist): install deps and build.
if not exist "dist\index.html" (
  echo Building the app for the first time...
  call npm install
  call npm run build
)

echo.
echo Rocket League Stats is running.  URL: http://localhost:3001
echo Close this window to stop it.
echo.

start "" http://localhost:3001
node proxy.js

endlocal
