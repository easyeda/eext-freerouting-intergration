#!/bin/bash
echo "============================================"
echo " FreeRouting API Server Launcher (macOS)"
echo "============================================"
echo

# Search for FreeRouting jar
FR_JAR=""

# 1. /Applications/freerouting.app/
if [ -d "/Applications/freerouting.app/Contents/app" ]; then
    FR_JAR=$(ls -t /Applications/freerouting.app/Contents/app/freerouting-executable.jar 2>/dev/null | head -1)
    [ -z "$FR_JAR" ] && FR_JAR=$(ls -t /Applications/freerouting.app/Contents/app/freerouting-*.jar 2>/dev/null | head -1)
fi

# 2. ~/Applications/freerouting.app/
if [ -z "$FR_JAR" ] && [ -d "$HOME/Applications/freerouting.app/Contents/app" ]; then
    FR_JAR=$(ls -t "$HOME/Applications/freerouting.app/Contents/app"/freerouting-executable.jar 2>/dev/null | head -1)
    [ -z "$FR_JAR" ] && FR_JAR=$(ls -t "$HOME/Applications/freerouting.app/Contents/app"/freerouting-*.jar 2>/dev/null | head -1)
fi

# 3. ~/.local/share/freerouting/
if [ -z "$FR_JAR" ] && [ -d "$HOME/.local/share/freerouting/lib" ]; then
    FR_JAR=$(ls -t "$HOME/.local/share/freerouting/lib"/freerouting-*.jar 2>/dev/null | head -1)
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

# 1. JAVA_HOME
if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    JAVA_CMD="$JAVA_HOME/bin/java"
fi

# 2. macOS java_home (request version 25)
if [ -z "$JAVA_CMD" ] && [ -x "/usr/libexec/java_home" ]; then
    JH=$(/usr/libexec/java_home -v 25 2>/dev/null)
    if [ -z "$JH" ]; then
        JH=$(/usr/libexec/java_home 2>/dev/null)
    fi
    if [ -n "$JH" ] && [ -x "$JH/bin/java" ]; then
        JAVA_CMD="$JH/bin/java"
    fi
fi

# 3. Homebrew JDK 25
for d in /Library/Java/JavaVirtualMachines/temurin-25*/Contents/Home; do
    if [ -z "$JAVA_CMD" ] && [ -x "$d/bin/java" ]; then
        JAVA_CMD="$d/bin/java"
    fi
done

# 4. System PATH
if [ -z "$JAVA_CMD" ] && command -v java &>/dev/null; then
    JAVA_CMD="java"
fi

# 5. FreeRouting bundled JRE (fallback)
if [ -z "$JAVA_CMD" ]; then
    for runtime_path in \
        "/Applications/freerouting.app/Contents/runtime/Contents/Home/bin/java" \
        "$HOME/Applications/freerouting.app/Contents/runtime/Contents/Home/bin/java"; do
        if [ -x "$runtime_path" ]; then
            JAVA_CMD="$runtime_path"
            echo "[WARN] Using bundled JRE. If API fails, install JDK 25+."
            echo "  https://adoptium.net/temurin/releases/?version=25"
            echo
            break
        fi
    done
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
