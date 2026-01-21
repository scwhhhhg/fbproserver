#!/bin/bash

# FacebookPro Blaster - One Click Setup for Linux
# This script will automatically setup everything you need

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      FACEBOOKPRO BLASTER - ONE CLICK SETUP (Linux)       ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${YELLOW}⚠️  Please do not run this script as root${NC}"
    echo -e "${YELLOW}   Run as normal user (script will ask for sudo when needed)${NC}"
    exit 1
fi

echo -e "${GREEN}🚀 Starting automated setup...${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    OS=$(uname -s)
fi

echo -e "${CYAN}📋 Detected OS: $OS${NC}"
echo ""

# 1. Check and Install Node.js
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📦 STEP 1: Node.js Installation${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if command_exists node; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js already installed: $NODE_VERSION${NC}"
else
    echo -e "${YELLOW}⏳ Installing Node.js LTS...${NC}"
    
    case "$OS" in
        ubuntu|debian)
            echo -e "${YELLOW}   Using apt package manager...${NC}"
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        fedora|rhel|centos)
            echo -e "${YELLOW}   Using dnf/yum package manager...${NC}"
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo dnf install -y nodejs || sudo yum install -y nodejs
            ;;
        arch|manjaro)
            echo -e "${YELLOW}   Using pacman package manager...${NC}"
            sudo pacman -S --noconfirm nodejs npm
            ;;
        *)
            echo -e "${RED}❌ Unsupported OS: $OS${NC}"
            echo -e "${YELLOW}   Please install Node.js manually from: https://nodejs.org${NC}"
            exit 1
            ;;
    esac
    
    if command_exists node; then
        echo -e "${GREEN}✅ Node.js installed successfully!${NC}"
    else
        echo -e "${RED}❌ Node.js installation failed${NC}"
        exit 1
    fi
fi

echo ""


# 2. Check and Install Python 3.12
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🐍 STEP 2: Python 3.12 Installation${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if command_exists python3.12; then
    PY_VERSION=$(python3.12 --version)
    echo -e "${GREEN}✅ Python 3.12 already installed: $PY_VERSION${NC}"
else
    echo -e "${YELLOW}⏳ Installing Python 3.12...${NC}"
    
    case "$OS" in
        ubuntu|debian)
            echo -e "${YELLOW}   Using apt package manager...${NC}"
            sudo apt-get update
            sudo apt-get install -y software-properties-common
            sudo add-apt-repository -y ppa:deadsnakes/ppa
            sudo apt-get update
            sudo apt-get install -y python3.12 python3.12-venv python3.12-dev python3-pip
            ;;
        *)
            echo -e "${RED}⚠️  Please install Python 3.12 manually for your OS${NC}"
            echo -e "${YELLOW}   Face Swap feature might not work without it.${NC}"
            ;;
    esac
fi

# Install Python Dependencies
if command_exists python3.12; then
    echo -e "${YELLOW}⏳ Installing Python dependencies (InsightFace)...${NC}"
    # Upgrade pip via module to avoid conflicts
    python3.12 -m pip install --upgrade pip
    python3.12 -m pip install insightface onnxruntime opencv-python gdown
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Python dependencies installed!${NC}"
        
        # Download Face Swap Model
        echo -e "${YELLOW}⏳ Downloading Face Swap Model (inswapper_128.onnx)...${NC}"
        # Create bot directory if not exists (it should exist after unzip, but just in case)
        mkdir -p bot
        
        # Check if model already exists
        if [ ! -f "bot/inswapper_128.onnx" ]; then
             python3.12 -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O bot/inswapper_128.onnx
             if [ $? -eq 0 ]; then
                 echo -e "${GREEN}✅ Face Swap Model downloaded!${NC}"
             else
                 echo -e "${RED}❌ Failed to download Face Swap Model${NC}"
             fi
        else
             echo -e "${GREEN}✅ Face Swap Model already exists!${NC}"
        fi

    else
        echo -e "${RED}❌ Failed to install Python dependencies${NC}"
    fi
else
    echo -e "${RED}❌ Python 3.12 not found. Skipping dependency installation.${NC}"
fi

echo ""

# 3. Install Additional Dependencies
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📦 STEP 2: System Dependencies${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "${YELLOW}⏳ Installing required system packages...${NC}"

case "$OS" in
    ubuntu|debian)
        sudo apt-get update
        sudo apt-get install -y \
            build-essential \
            git \
            libcairo2-dev \
            libpango1.0-dev \
            libjpeg-dev \
            libgif-dev \
            librsvg2-dev \
            curl \
            wget \
            ca-certificates \
            fonts-liberation \
            libappindicator3-1 \
            libasound2 \
            libatk-bridge2.0-0 \
            libatk1.0-0 \
            libc6 \
            libcairo2 \
            libcups2 \
            libdbus-1-3 \
            libexpat1 \
            libfontconfig1 \
            libgbm1 \
            libgcc1 \
            libglib2.0-0 \
            libgtk-3-0 \
            libnspr4 \
            libnss3 \
            libpango-1.0-0 \
            libpangocairo-1.0-0 \
            libstdc++6 \
            libx11-6 \
            libx11-xcb1 \
            libxcb1 \
            libxcomposite1 \
            libxcursor1 \
            libxdamage1 \
            libxext6 \
            libxfixes3 \
            libxi6 \
            libxrandr2 \
            libxrender1 \
            libxss1 \
            libxtst6 \
            lsb-release \
            xdg-utils \
            libdrm2 \
            libxkbcommon0 \
            libgbm-dev
        ;;
    fedora|rhel|centos)
        sudo dnf install -y \
            gcc-c++ \
            git \
            make \
            cairo-devel \
            pango-devel \
            libjpeg-turbo-devel \
            giflib-devel \
            curl \
            wget \
            ca-certificates \
            liberation-fonts \
            alsa-lib \
            atk \
            at-spi2-atk \
            cups-libs \
            dbus-libs \
            expat \
            fontconfig \
            glib2 \
            gtk3 \
            libdrm \
            libgbm \
            libX11 \
            libXcomposite \
            libXcursor \
            libXdamage \
            libXext \
            libXfixes \
            libXi \
            libXrandr \
            libXrender \
            libxcb \
            libXScrnSaver \
            libXtst \
            mesa-libgbm \
            nspr \
            nss \
            nss-util \
            xdg-utils || \
        sudo yum install -y \
            gcc-c++ \
            make \
            cairo-devel \
            pango-devel \
            libjpeg-turbo-devel \
            giflib-devel \
            curl \
            wget \
            ca-certificates \
            liberation-fonts \
            alsa-lib \
            atk \
            at-spi2-atk \
            cups-libs \
            dbus-libs \
            expat \
            fontconfig \
            glib2 \
            gtk3 \
            libdrm \
            libgbm \
            libX11 \
            libXcomposite \
            libXcursor \
            libXdamage \
            libXext \
            libXfixes \
            libXi \
            libXrandr \
            libXrender \
            libxcb \
            libXScrnSaver \
            libXtst \
            mesa-libgbm \
            nspr \
            nss \
            nss-util \
            xdg-utils
        ;;
    arch|manjaro)
        sudo pacman -S --noconfirm \
            base-devel \
            cairo \
            pango \
            libjpeg-turbo \
            giflib \
            curl \
            wget \
            ca-certificates \
            ttf-liberation \
            alsa-lib \
            at-spi2-atk \
            atk \
            cups \
            dbus \
            expat \
            fontconfig \
            glib2 \
            gtk3 \
            libdrm \
            libgbm \
            libx11 \
            libxcomposite \
            libxcursor \
            libxdamage \
            libxext \
            libxfixes \
            libxi \
            libxrandr \
            libxrender \
            libxcb \
            libxscrnsaver \
            libxtst \
            mesa \
            nspr \
            nss \
            xdg-utils
        ;;
esac

echo -e "${GREEN}✅ System dependencies installed!${NC}"
echo ""

# 3. Prepare Folders
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# 4. Prepare Folders
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📁 STEP 4: Preparing Folders${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

FOLDERS=(
    "accounts"
    "videos"
    "photos"
    "logs"
    "logs/scheduler"
    "logs/telegram"
    "logs/maintenance"
    "logs/executor"
    "backups"
    "downloads"
    "temp"
    "data"
    "scheduler"
)

for folder in "${FOLDERS[@]}"; do
    if [ ! -d "$folder" ]; then
        mkdir -p "$folder"
        echo -e "${GREEN}✅ Created: $folder/${NC}"
    else
        echo -e "${GREEN}✅ Exists: $folder/${NC}"
    fi
done

echo ""

# 4. Install Dependencies
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# 5. Install Dependencies
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📦 STEP 5: Installing Node Dependencies${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f "package.json" ]; then
    echo -e "${YELLOW}⏳ Running npm install (this may take several minutes)...${NC}"
    echo ""
    
    npm install
    
    echo ""
    echo -e "${GREEN}✅ Dependencies installed successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  package.json not found, skipping npm install${NC}"
fi

echo ""

# Install scheduler dependencies
echo -e "${YELLOW}⏳ Installing scheduler dependencies...${NC}"
npm install node-cron --save

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ node-cron installed successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  Failed to install node-cron (optional)${NC}"
fi

echo ""

# 5. Install PM2
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# 6. Install PM2
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📦 STEP 6: Installing PM2${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if command_exists pm2; then
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}✅ PM2 already installed: v$PM2_VERSION${NC}"
else
    echo -e "${YELLOW}⏳ Installing PM2 globally...${NC}"
    sudo npm install -g pm2
    
    if command_exists pm2; then
        echo -e "${GREEN}✅ PM2 installed successfully!${NC}"
        echo -e "${CYAN}   Setting up PM2 startup script...${NC}"
        pm2 startup | grep -E '^sudo' | bash || true
    else
        echo -e "${YELLOW}⚠️  PM2 installation failed${NC}"
    fi
fi

echo ""

# 6. Set Permissions
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# 7. Set Permissions
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🔐 STEP 7: Setting Permissions${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Make scripts executable
if [ -d "bot" ]; then
    echo -e "${YELLOW}⏳ Setting executable permissions for bot scripts...${NC}"
    
    # Set executable permission for main executables (extension-less files)
    chmod +x bot/executor 2>/dev/null && echo -e "${GREEN}   ✅ executor${NC}" || echo -e "${YELLOW}   ⚠️  executor not found${NC}"
    chmod +x bot/scheduler-cli 2>/dev/null && echo -e "${GREEN}   ✅ scheduler-cli${NC}" || echo -e "${YELLOW}   ⚠️  scheduler-cli not found${NC}"
    chmod +x bot/executor_wrapper.sh 2>/dev/null && echo -e "${GREEN}   ✅ executor_wrapper.sh${NC}" || echo -e "${YELLOW}   ⚠️  executor_wrapper.sh not found${NC}"
    
    # Make all .sh scripts executable
    chmod +x bot/*.sh 2>/dev/null || true
    echo -e "${GREEN}   ✅ Shell scripts${NC}"
    
    echo ""
    echo -e "${CYAN}📋 Verifying executable permissions:${NC}"
    ls -la bot/executor bot/scheduler-cli bot/executor_wrapper.sh 2>/dev/null | grep -E "^-" || echo -e "${YELLOW}   (Some files not found - will be created by build)${NC}"
fi

# Set folder permissions
chmod 755 accounts videos photos logs backups downloads temp data scheduler 2>/dev/null || true
echo -e "${GREEN}✅ Folder permissions set${NC}"

echo ""

# 7. Check License
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
# 8. Check License
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🔐 STEP 8: License Activation${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f "bot/.license" ]; then
    echo -e "${GREEN}✅ License already activated!${NC}"
else
    echo -e "${YELLOW}⚠️  No license found${NC}"
    echo ""
    echo -e "${CYAN}To activate your license, run:${NC}"
    echo -e "   ${NC}node bot/sys-init YOUR_LICENSE_KEY${NC}"
    echo ""
    echo -e "${NC}License format: FBPROBLASTER_XXXX_XXXX_0001_TIER${NC}"
fi

echo ""

# 8. Success Summary
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✅ SETUP COMPLETED SUCCESSFULLY!             ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}📋 NEXT STEPS:${NC}"
echo ""

echo -e "${YELLOW}1️⃣  Activate License (if not done yet):${NC}"
echo -e "   ${NC}node bot/sys-init YOUR_LICENSE_KEY${NC}"
echo ""

echo -e "${YELLOW}2️⃣  Setup Your First Account:${NC}"
echo -e "   ${NC}node bot/account-setup${NC}"
echo ""

echo -e "${YELLOW}3️⃣  Test the Bot:${NC}"
echo -e "   ${NC}node bot/executor list${NC}"
echo ""

echo -e "${YELLOW}4️⃣  Run a Bot:${NC}"
echo -e "   ${NC}node bot/executor run autolike YOUR_ACCOUNT_ID${NC}"
echo ""

echo -e "${CYAN}📚 Documentation:${NC}"
echo -e "   ${NC}- README.md${NC}"
echo -e "   ${NC}- LICENSE_ACTIVATION_GUIDE.md${NC}"
echo -e "   ${NC}- INTEGRATED_LICENSE_SYSTEM.md${NC}"
echo ""

echo -e "${GREEN}🎉 You're all set! Happy automating!${NC}"
echo ""
