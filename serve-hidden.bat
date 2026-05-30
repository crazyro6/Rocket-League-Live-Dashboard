@echo off
rem Runs the server with no console output. Launched hidden by start-hidden.vbs.
cd /d "%~dp0"
if not exist "dist\index.html" call npm run build
node proxy.js
