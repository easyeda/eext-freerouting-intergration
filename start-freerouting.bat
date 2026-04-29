@echo off
title FreeRouting API Server (Port 37864 + Proxy 37863)

set "FR_JAR=%LOCALAPPDATA%\freerouting\app\freerouting-executable.jar"
set "FR_JAVA="
set "PROXY_JS=%~dp0proxy.js"

:: Kill old instances
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":37863 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":37864 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%p >nul 2>&1
)

:: 1. Check bundled JRE 25 next to FreeRouting
if exist "%LOCALAPPDATA%\freerouting\jre-25\bin\java.exe" (
    set "FR_JAVA=%LOCALAPPDATA%\freerouting\jre-25\bin\java.exe"
)

:: 2. Check Program Files for Temurin JRE/JDK 25
if "%FR_JAVA%"=="" (
    for /d %%d in ("%ProgramFiles%\Eclipse Adoptium\jre-25*") do (
        if exist "%%d\bin\java.exe" set "FR_JAVA=%%d\bin\java.exe"
    )
)
if "%FR_JAVA%"=="" (
    for /d %%d in ("%ProgramFiles%\Eclipse Adoptium\jdk-25*") do (
        if exist "%%d\bin\java.exe" set "FR_JAVA=%%d\bin\java.exe"
    )
)

:: 3. Fallback to PATH
if "%FR_JAVA%"=="" (
    for /f "delims=" %%p in ('where java.exe 2^>nul') do (
        set "FR_JAVA=%%p"
    )
)

if not exist "%FR_JAR%" (
    echo [ERROR] FreeRouting jar not found
    echo Expected: %FR_JAR%
    echo.
    echo Please install FreeRouting v2.2.0+
    echo Download: https://github.com/freerouting/freerouting/releases
    pause
    exit /b 1
)

if "%FR_JAVA%"=="" (
    echo [ERROR] Java 25 not found
    echo.
    echo Run install-java.bat first, or manually install Temurin JRE 25 to:
    echo   %LOCALAPPDATA%\freerouting\jre-25\
    echo.
    echo Download: https://adoptium.net/temurin/releases/?version=25
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Required for the CORS proxy.
    pause
    exit /b 1
)

echo ============================================================
echo  FreeRouting API Server
echo  Java:  %FR_JAVA%
echo  JAR:   %FR_JAR%
echo  API:   http://127.0.0.1:37864
echo  Proxy: http://127.0.0.1:37863
echo  Mode:  Headless (no GUI)
echo ============================================================
echo.

:: Start FreeRouting in background
start /b "" "%FR_JAVA%" -jar "%FR_JAR%" --gui.enabled=false --api_server.enabled=true --api_server.cors_origins=* -da

:: Wait for FreeRouting to start
timeout /t 5 /nobreak >nul

:: Start CORS proxy (foreground - closing window stops everything)
echo Starting CORS proxy on port 37863...
node "%PROXY_JS%"
