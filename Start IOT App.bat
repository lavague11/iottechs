@echo off
title IOT Techs - Proposal App
cd /d "%~dp0"
echo ============================================================
echo    IOT TECHS - Proposal App
echo ------------------------------------------------------------
echo    Starting the local server...
echo    Your browser will open at  http://localhost:3000
echo.
echo    KEEP THIS WINDOW OPEN while you use the app.
echo    Close this window to stop the server.
echo ============================================================
echo.

REM Open the browser a couple seconds after the server starts.
start "" /min cmd /c "ping -n 3 127.0.0.1 >nul & start "" http://localhost:3000"

REM Run the server (this blocks until the window is closed).
node server.js

echo.
echo Server stopped. Press any key to close.
pause >nul
