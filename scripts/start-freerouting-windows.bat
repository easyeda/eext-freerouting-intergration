@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo  FreeRouting API Server Launcher (Windows)
echo ============================================
echo.

:: Search for FreeRouting exe
set "FR_EXE="

:: 1. %LOCALAPPDATA%\freerouting\app\
if not defined FR_EXE (
    if exist "%LOCALAPPDATA%\freerouting\app\freerouting.exe" (
        set "FR_EXE=%LOCALAPPDATA%\freerouting\app\freerouting.exe"
    )
)

:: 2. %LOCALAPPDATA%\freerouting\
if not defined FR_EXE (
    if exist "%LOCALAPPDATA%\freerouting\freerouting.exe" (
        set "FR_EXE=%LOCALAPPDATA%\freerouting\freerouting.exe"
    )
)

:: 3. Current directory
if not defined FR_EXE (
    if exist "freerouting.exe" (
        set "FR_EXE=%CD%\freerouting.exe"
    )
)

if not defined FR_EXE (
    echo [ERROR] FreeRouting exe not found.
    echo.
    echo Please install FreeRouting from:
    echo   https://github.com/freerouting/freerouting/releases
    echo.
    pause
    exit /b 1
)

echo Found: %FR_EXE%
echo.
echo [INFO] Starting FreeRouting API server on http://127.0.0.1:37864 ...
echo.

"%FR_EXE%" ^
    --gui.enabled=false ^
    --api_server.enabled=true ^
    --api_server.endpoints=http://127.0.0.1:37864 ^
    --api_server.authentication.enabled=false ^
    --api_server.cors_origins=* ^
    --logging.console.level=ERROR

echo.
echo [INFO] FreeRouting API server stopped.
