#!/bin/bash
echo "============================================"
echo " FreeRouting API Server Launcher (Linux)"
echo "============================================"
echo

# Search for FreeRouting executable
FR_EXE=""

# 1. ~/.local/share/freerouting/
if [ -z "$FR_EXE" ] && [ -x "$HOME/.local/share/freerouting/freerouting" ]; then
    FR_EXE="$HOME/.local/share/freerouting/freerouting"
fi

# 2. /opt/freerouting/
if [ -z "$FR_EXE" ] && [ -x "/opt/freerouting/freerouting" ]; then
    FR_EXE="/opt/freerouting/freerouting"
fi

# 3. /usr/local/bin/
if [ -z "$FR_EXE" ] && [ -x "/usr/local/bin/freerouting" ]; then
    FR_EXE="/usr/local/bin/freerouting"
fi

# 4. Current directory
if [ -z "$FR_EXE" ] && [ -x "./freerouting" ]; then
    FR_EXE="./freerouting"
fi

if [ -z "$FR_EXE" ]; then
    echo "[ERROR] FreeRouting executable not found."
    echo
    echo "Please install FreeRouting from:"
    echo "  https://github.com/freerouting/freerouting/releases"
    echo
    exit 1
fi

echo "Found: $FR_EXE"
echo
echo "[INFO] Starting FreeRouting API server on http://127.0.0.1:37864 ..."
echo "[INFO] Please run FreeRouting extension at EasyEDA Pro/JLCEDA Pro."
echo

"$FR_EXE" \
    --gui.enabled=false \
    --api_server.enabled=true \
    --api_server.endpoints=http://127.0.0.1:37864 \
    --api_server.authentication.enabled=false \
    --api_server.cors_origins=* \
    --logging.console.level=ERROR
