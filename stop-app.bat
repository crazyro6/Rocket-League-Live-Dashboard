@echo off
rem Stops only the RL Stats server (the node process running proxy.js),
rem leaving any other Node apps untouched.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*proxy.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo RL Stats server stopped (if it was running).
echo.
pause
