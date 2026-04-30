#!/bin/bash
echo "============================================"
echo " FreeRouting API Server Launcher (Linux)"
echo "============================================"
echo

# Search for FreeRouting jar
FR_JAR=""

# 1. ~/.local/share/freerouting/app/
if [ -z "$FR_JAR" ] && [ -d "$HOME/.local/share/freerouting/app" ]; then
    FR_JAR=$(ls -t "$HOME/.local/share/freerouting/app"/freerouting-executable.jar 2>/dev/null | head -1)
    [ -z "$FR_JAR" ] && FR_JAR=$(ls -t "$HOME/.local/share/freerouting/app"/freerouting-*.jar 2>/dev/null | head -1)
fi

# 2. ~/.local/share/freerouting/lib/
if [ -z "$FR_JAR" ] && [ -d "$HOME/.local/share/freerouting/lib" ]; then
    FR_JAR=$(ls -t "$HOME/.local/share/freerouting/lib"/freerouting-*.jar 2>/dev/null | head -1)
fi

# 3. /opt/freerouting/
if [ -z "$FR_JAR" ] && [ -d "/opt/freerouting/lib" ]; then
    FR_JAR=$(ls -t /opt/freerouting/lib/freerouting-*.jar 2>/dev/null | head -1)
fi

# 4. Current directory
if [ -z "$FR_JAR" ]; then
    FR_JAR=$(ls -t freerouting-executable.jar 2>/dev/null | head -1)
    [ -z "$FR_JAR" ] && FR_JAR=$(ls -t freerouting-*.jar 2>/dev/null | head -1)
fi

if [ -z "$FR_JAR" ]; then
    echo "[ERROR] FreeRouting jar not found."
    echo
    echo "Please install FreeRouting from:"
    echo "  https://github.com/freerouting/freerouting/releases"
    echo
    exit 1
fi

echo "Found: $FR_JAR"
echo

# Search for Java 25+ (required by FreeRouting)
JAVA_CMD=""

# 1. Common JDK/JRE 25 install paths
for d in /usr/lib/jvm/java-25-* /usr/lib/jvm/jdk-25* /usr/lib/jvm/temurin-25-*; do
    if [ -z "$JAVA_CMD" ] && [ -x "$d/bin/java" ]; then
        JAVA_CMD="$d/bin/java"
    fi
done

# 2. JAVA_HOME
if [ -z "$JAVA_CMD" ] && [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_CMD="$JAVA_HOME/bin/java"
fi

# 3. System PATH
if [ -z "$JAVA_CMD" ] && command -v java &>/dev/null; then
    JAVA_CMD="java"
fi

# 4. FreeRouting bundled JRE (fallback)
if [ -z "$JAVA_CMD" ] && [ -x "$HOME/.local/share/freerouting/runtime/bin/java" ]; then
    JAVA_CMD="$HOME/.local/share/freerouting/runtime/bin/java"
    echo "[WARN] Using bundled JRE. If API fails, install JDK 25+."
    echo "  https://adoptium.net/temurin/releases/?version=25"
    echo
fi

if [ -z "$JAVA_CMD" ]; then
    echo "[ERROR] Java not found."
    echo
    echo "FreeRouting API server requires JDK 25+."
    echo "Please install from: https://adoptium.net/temurin/releases/?version=25"
    echo
    exit 1
fi

echo "Java: $JAVA_CMD"
echo
echo "Starting FreeRouting API server on http://127.0.0.1:37864 ..."
echo "Press Ctrl+C to stop."
echo

"$JAVA_CMD" -jar "$FR_JAR" \
    --gui.enabled=false \
    --api_server.enabled=true \
    --api_server.endpoints=http://127.0.0.1:37864 \
    --api_server.authentication.enabled=false \
    --api_server.cors_origins=* \
    --logging.console.level=ERROR
