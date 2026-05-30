@echo off
setlocal
cd /d "%~dp0"

set "VBS=%~dp0start-hidden.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\RL Stats Server.lnk"

echo Installing auto-start...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%'); $s.TargetPath='%VBS%'; $s.WorkingDirectory='%~dp0'; $s.Description='RL Stats local server'; $s.Save()"

if exist "%LNK%" (
  echo Done. The server will start hidden every time you log in.
  echo Starting it now...
  start "" "%VBS%"
  timeout /t 2 >nul
  echo.
  echo You can now open the app at http://localhost:3001
  echo (or its installed PWA icon^). Run uninstall-autostart.bat to undo.
) else (
  echo [ERROR] Could not create the startup shortcut.
)
echo.
pause
endlocal
