@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo  FreeRouting API Server Launcher (Windows)
echo ============================================
echo.

:: Search for FreeRouting jar
set "FR_JAR="

:: 1. %LOCALAPPDATA%\freerouting\app\
if not defined FR_JAR (
    if exist "%LOCALAPPDATA%\freerouting\app\freerouting-executable.jar" (
        set "FR_JAR=%LOCALAPPDATA%\freerouting\app\freerouting-executable.jar"
    )
)
if not defined FR_JAR (
    if exist "%LOCALAPPDATA%\freerouting\app" (
        for /f "delims=" %%f in ('dir /b /o-n "%LOCALAPPDATA%\freerouting\app\freerouting-*.jar" 2^>nul') do (
            if not defined FR_JAR set "FR_JAR=%LOCALAPPDATA%\freerouting\app\%%f"
        )
    )
)

:: 2. %LOCALAPPDATA%\freerouting\lib\
if not defined FR_JAR (
    if exist "%LOCALAPPDATA%\freerouting\lib" (
        for /f "delims=" %%f in ('dir /b /o-n "%LOCALAPPDATA%\freerouting\lib\freerouting-*.jar" 2^>nul') do (
            if not defined FR_JAR set "FR_JAR=%LOCALAPPDATA%\freerouting\lib\%%f"
        )
    )
)

:: 3. Current directory
if not defined FR_JAR (
    if exist "freerouting-executable.jar" (
        set "FR_JAR=%CD%\freerouting-executable.jar"
    )
)
if not defined FR_JAR (
    for /f "delims=" %%f in ('dir /b /o-n "freerouting-*.jar" 2^>nul') do (
        if not defined FR_JAR set "FR_JAR=%CD%\%%f"
    )
)

if not defined FR_JAR (
    echo [ERROR] FreeRouting jar not found.
    echo.
    echo Please install FreeRouting from:
    echo   https://github.com/freerouting/freerouting/releases
    echo.
    pause
    exit /b 1
)

echo Found: %FR_JAR%
echo.

:: Search for Java 25+ (required by FreeRouting)
set "JAVA_CMD="

:: 1. Eclipse Adoptium JDK/JRE 25
for /d %%d in ("%PROGRAMFILES%\Eclipse Adoptium\jdk-25*" "%PROGRAMFILES%\Eclipse Adoptium\jre-25*") do (
    if not defined JAVA_CMD (
        if exist "%%d\bin\java.exe" set "JAVA_CMD=%%d\bin\java.exe"
    )
)

:: 2. Common JDK 25 install paths
for /d %%d in ("%PROGRAMFILES%\Java\jdk-25*" "%PROGRAMFILES%\Java\jre-25*") do (
    if not defined JAVA_CMD (
        if exist "%%d\bin\java.exe" set "JAVA_CMD=%%d\bin\java.exe"
    )
)

:: 3. JAVA_HOME (if set and is version 25+)
if not defined JAVA_CMD (
    if defined JAVA_HOME (
        if exist "%JAVA_HOME%\bin\java.exe" set "JAVA_CMD=%JAVA_HOME%\bin\java.exe"
    )
)

:: 4. FreeRouting bundled runtime (fallback)
if not defined JAVA_CMD (
    if exist "%LOCALAPPDATA%\freerouting\runtime\bin\java.exe" (
        set "JAVA_CMD=%LOCALAPPDATA%\freerouting\runtime\bin\java.exe"
        echo [WARN] Using bundled JRE. If API fails, install JDK 25+.
        echo   https://adoptium.net/temurin/releases/?version=25
        echo.
    )
)

if not defined JAVA_CMD (
    echo [ERROR] Java not found.
    echo.
    echo FreeRouting API server requires JDK 25+.
    echo Please install from: https://adoptium.net/temurin/releases/?version=25
    echo.
    pause
    exit /b 1
)

echo Java: %JAVA_CMD%
echo.
echo Starting FreeRouting API server on http://127.0.0.1:37864 ...
echo Press Ctrl+C to stop.
echo.

"%JAVA_CMD%" -jar "%FR_JAR%" ^
    --gui.enabled=false ^
    --api_server.enabled=true ^
    --api_server.endpoints=http://127.0.0.1:37864 ^
    --api_server.authentication.enabled=false ^
    --api_server.cors_origins=* ^
    --logging.console.level=ERROR

pause
