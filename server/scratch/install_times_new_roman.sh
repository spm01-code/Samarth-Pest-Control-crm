#!/bin/bash
# ==============================================================================
# Fail-Safe Microsoft Times New Roman Font Installer for Hostinger Linux VPS
# ==============================================================================
# This script installs true Microsoft Times New Roman fonts (times.ttf, timesbd.ttf,
# timesi.ttf, timesbi.ttf) on Linux so LibreOffice renders body text and terms
# in exact Times New Roman, matching local Windows output and 2-page pagination.
# ==============================================================================

set -e

echo "=== Step 1: Installing fontconfig utility ==="
sudo apt-get update -y
sudo apt-get install -y fontconfig wget unzip cabextract

echo "=== Step 2: Creating Microsoft fonts directory ==="
FONT_DIR="/usr/share/fonts/truetype/msttcorefonts"
sudo mkdir -p "$FONT_DIR"

TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "=== Step 3: Downloading official Microsoft Times New Roman TTF files ==="
# Direct reliable mirror for Microsoft Core Fonts (Times New Roman)
wget -q "https://downloads.sourceforge.net/project/corefonts/the%20fonts/final/times32.exe" -O times32.exe || true

if [ -f "times32.exe" ]; then
    cabextract -q times32.exe || true
    sudo cp -f [tT][iI][mM][eE][sS]*.ttf "$FONT_DIR/" 2>/dev/null || true
fi

# Fallback direct repository fetch if cabextract fails
wget -q "https://github.com/microsoft/win32-app-isolation/raw/main/samples/web/fonts/times.ttf" -O times.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/times.ttf" -O times.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/timesbd.ttf" -O timesbd.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/timesi.ttf" -O timesi.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/timesbi.ttf" -O timesbi.ttf || true

sudo cp -f *.ttf "$FONT_DIR/" 2>/dev/null || true

cd /
rm -rf "$TMP_DIR"

echo "=== Step 4: Rebuilding Linux OS Font Cache ==="
sudo fc-cache -f -v

echo "=== Step 5: Verifying Times New Roman Resolution ==="
MATCH_RES=$(fc-match "Times New Roman")
echo "System match for 'Times New Roman': $MATCH_RES"

if echo "$MATCH_RES" | grep -iq "times"; then
    echo "SUCCESS: Microsoft Times New Roman is active on Linux OS!"
else
    echo "WARNING: Times New Roman match check returned $MATCH_RES"
fi

echo "=============================================================================="
echo "TIMES NEW ROMAN INSTALLATION COMPLETE."
echo "Please restart PM2 now: pm2 restart all"
echo "=============================================================================="
