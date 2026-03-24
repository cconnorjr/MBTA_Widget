@echo off
title Central Square MBTA — Setup

:: ── Self-elevate to Administrator via UAC ──────────────────────────────────
net session >nul 2>&1
if %errorlevel% == 0 goto :ADMIN

echo  Requesting administrator privileges...
powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c cd /d ""%~dp0"" && ""%~f0""' -Verb RunAs -Wait"
exit /b

:ADMIN
cd /d "%~dp0"

echo.
echo  =====================================================
echo   Central Square Red Line - Desktop App Setup
echo   Running as Administrator
echo  =====================================================
echo.

:: Check Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed.
    echo  Please download and install it from: https://nodejs.org
    echo  Then re-run this script.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% found.
echo.
echo  Installing dependencies (this may take a minute)...
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
)

echo.
echo  [OK] Setup complete!
echo.
echo  -----------------------------------------------------
echo  Launching app now...
echo  Next time, just double-click run.bat
echo  -----------------------------------------------------
echo.

call npm start
pause
