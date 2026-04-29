@echo off
title Install Java 25 for FreeRouting

set "JRE_URL=https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.2%%2B10/OpenJDK25U-jre_x64_windows_hotspot_25.0.2_10.zip"
set "JRE_DIR=%LOCALAPPDATA%\freerouting\jre-25"
set "JRE_ZIP=%TEMP%\temurin25-jre.zip"

if exist "%JRE_DIR%\bin\java.exe" (
    echo [OK] Java 25 JRE already installed at %JRE_DIR%
    "%JRE_DIR%\bin\java.exe" -version
    pause
    exit /b 0
)

echo ============================================================
echo  Install Temurin JRE 25 for FreeRouting
echo  Target: %JRE_DIR%
echo ============================================================
echo.

where curl >nul 2>&1
if errorlevel 1 (
    echo [ERROR] curl not found. Please install curl or download manually:
    echo %JRE_URL%
    pause
    exit /b 1
)

echo Downloading Temurin JRE 25 ...
curl -L -o "%JRE_ZIP%" "%JRE_URL%"
if errorlevel 1 (
    echo [ERROR] Download failed
    pause
    exit /b 1
)

echo Extracting ...
where tar >nul 2>&1
if errorlevel 1 (
    echo [ERROR] tar not found. Please extract manually:
    echo   %JRE_ZIP%
    echo to:
    echo   %JRE_DIR%
    pause
    exit /b 1
)

mkdir "%JRE_DIR%" 2>nul
tar -xf "%JRE_ZIP%" -C "%TEMP%"
if errorlevel 1 (
    echo [ERROR] Extract failed
    pause
    exit /b 1
)

xcopy /E /I /Y "%TEMP%\jdk-25.0.2+10-jre\*" "%JRE_DIR%\" >nul
rmdir /S /Q "%TEMP%\jdk-25.0.2+10-jre" 2>nul
del "%JRE_ZIP%" 2>nul

if exist "%JRE_DIR%\bin\java.exe" (
    echo.
    echo [OK] Java 25 JRE installed successfully
    "%JRE_DIR%\bin\java.exe" -version
) else (
    echo [ERROR] Installation failed
)

echo.
pause
