@echo off
setlocal
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\RL Stats Server.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo Auto-start removed. The server will no longer launch at login.
) else (
  echo Auto-start was not installed.
)
echo (If the server is currently running, use stop-app.bat to stop it.^)
echo.
pause
endlocal
