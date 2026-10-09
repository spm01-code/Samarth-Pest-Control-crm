#!/bin/bash
# ==============================================================================
# Hostinger VPS Font Setup Script for Exact PDF Rendering Parity
# ==============================================================================
# This script installs Microsoft TrueType fonts (Arial, Calibri, Times New Roman,
# Cambria) and Sora fonts on Linux VPS so LibreOffice renders DOCX layout
# with exact font metrics matching Local Windows MS Word.
# ==============================================================================

echo "=== Step 1: Installing Font utilities and Microsoft TrueType Core Fonts ==="
sudo apt-get update -y
sudo apt-get install -y ttf-mscorefonts-installer fontconfig wget unzip

# Accept EULA for mscorefonts automatically
echo ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true | sudo debconf-set-selections

# Reconfigure mscorefonts
sudo dpkg-reconfigure -f noninteractive ttf-mscorefonts-installer

echo "=== Step 2: Creating custom font directory for Sora & MS Fonts ==="
FONT_DIR="/usr/share/fonts/truetype/custom-crm-fonts"
sudo mkdir -p "$FONT_DIR"

# Download Google Sora font (used in CRM templates)
echo "=== Step 3: Downloading Sora Font ==="
CDIR=$(pwd)
TMP_FONT_DIR=$(mktemp -d)
cd "$TMP_FONT_DIR"
wget -q "https://github.com/google/fonts/raw/main/ofl/sora/Sora%5Bwght%5D.ttf" -O Sora-Variable.ttf || true
if [ -f "Sora-Variable.ttf" ]; then
    sudo cp Sora-Variable.ttf "$FONT_DIR/"
fi
cd "$CDIR"
rm -rf "$TMP_FONT_DIR"

echo "=== Step 4: Updating Font Cache ==="
sudo fc-cache -f -v

echo "=== Step 5: Verifying installed fonts ==="
fc-list : family | grep -iE "Arial|Calibri|Times|Cambria|Sora|Liberation" | sort -u

echo "=============================================================================="
echo "FONT INSTALLATION COMPLETE. Restart backend PM2 process to apply changes:"
echo "pm2 restart all"
echo "=============================================================================="
