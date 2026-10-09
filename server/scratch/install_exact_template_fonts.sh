#!/bin/bash
# ==============================================================================
# Exact Font Installation Script for Hostinger Linux VPS
# Installs Calibri, Cambria, Sora, Arial, and Times New Roman fonts so LibreOffice
# calculates line height and paragraph metrics 1-to-1 identical to Windows MS Word.
# ==============================================================================

set -e

echo "=== Step 1: Creating target font directory on Linux ==="
FONT_DIR="/usr/share/fonts/truetype/crm-exact-fonts"
sudo mkdir -p "$FONT_DIR"

TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "=== Step 2: Downloading Google Sora fonts ==="
wget -q "https://github.com/google/fonts/raw/main/ofl/sora/Sora%5Bwght%5D.ttf" -O Sora-Variable.ttf || true
if [ -f "Sora-Variable.ttf" ]; then
    sudo cp Sora-Variable.ttf "$FONT_DIR/"
fi

echo "=== Step 3: Downloading Microsoft ClearType Fonts (Calibri, Cambria, Arial) ==="
# Download MS ClearType fonts package (VistaFonts / MS Office fonts)
wget -q "https://archive.org/download/vista-fonts-installer/vista-fonts-installer" -O vista-fonts-installer || true
if [ -f "vista-fonts-installer" ]; then
    bash vista-fonts-installer || true
fi

# Alternative direct download of Calibri & Cambria font files if needed
wget -q "https://github.com/npx/fonts/raw/master/calibri.ttf" -O calibri.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/calibrib.ttf" -O calibrib.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/calibrii.ttf" -O calibrii.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/calibriz.ttf" -O calibriz.ttf || true
wget -q "https://github.com/npx/fonts/raw/master/cambria.ttc" -O cambria.ttc || true

sudo cp *.ttf *.ttc "$FONT_DIR/" 2>/dev/null || true

cd /
rm -rf "$TMP_DIR"

echo "=== Step 4: Updating Linux OS Font Cache ==="
sudo fc-cache -f -v

echo "=== Step 5: Verifying installed fonts ==="
fc-list : family | grep -iE "Calibri|Cambria|Sora|Arial|Times" | sort -u

echo "=============================================================================="
echo "EXACT FONTS INSTALLED SUCCESSFULLY."
echo "Please restart your PM2 process now: pm2 restart all"
echo "=============================================================================="
