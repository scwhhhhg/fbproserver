// Helper function to generate comprehensive README
function generateREADME(buildNumber) {
    return `# FacebookPro Blaster - Ultimate Secure Server Edition
## Version 1.2.1 - Production Ready (Build #${buildNumber})

### 🚀 Quick Start (3 Steps)

#### Linux (Ubuntu/Debian):
\`\`\`bash
# 1. Extract & navigate
unzip FacebookPro_Blaster_*.zip
cd FacebookPro_Blaster_*

# 2. Run automated setup
chmod +x setup-linux.sh
./setup-linux.sh

# 3. Configure & start
node bot/executor account-setup
pm2 start ecosystem.config.js
\`\`\`

#### Windows:
\`\`\`powershell
# 1. Extract ZIP file

# 2. Run setup (Right-click → Run with PowerShell)
.\\setup-windows.ps1

# 3. Configure & start
node bot/executor account-setup
pm2 start ecosystem.config.js
\`\`\`

---

### 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 20.04 / Windows 10 | Ubuntu 22.04 LTS |
| **RAM** | 2GB | 4GB+ |
| **Storage** | 10GB free | 20GB+ |
| **Node.js** | v20.0.0 | v20.x |
| **Python** | 3.12 (auto-installed) | 3.12 |

---

### 🔧 What Setup Script Does

- ✅ Installs Node.js 20.x
- ✅ Installs Python 3.12 + pip
- ✅ Installs Python libs: insightface, onnxruntime, opencv-python
- ✅ Downloads Face Swap model (514MB)
- ✅ Installs NPM packages
- ✅ Creates directories
- ✅ Verifies installation

---

### 🎯 Features

**AI-Powered:**
- Text: OpenRouter (Qwen) → Pollinations → Gemini
- Image: Pollinations Flux-Pro (Ultra-realistic)
- Face Swap: InsightFace (Local)

**11 Bots Included:**
updatestatus, autolike, videocomment, timelinecomment, groupcomment, uploadreels, sharereels, confirm, scrape, reply, viewstory

---

### 🐛 Troubleshooting

**Issue: "Cannot find module 'python-shell'"**
\`\`\`bash
npm install python-shell
\`\`\`

**Issue: Face Swap model not found**
\`\`\`bash
python3.12 -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O bot/inswapper_128.onnx
\`\`\`

**Issue: Cookies expired**
\`\`\`bash
node bot/executor generate [account-name]
\`\`\`

**Issue: Bot crashes**
\`\`\`bash
pm2 logs        # Check logs
pm2 restart all # Restart
pm2 monit       # Monitor
\`\`\`

---

### 📊 PM2 Commands

\`\`\`bash
pm2 list           # View processes
pm2 logs           # View logs
pm2 restart all    # Restart all
pm2 stop all       # Stop all
pm2 monit          # Monitor CPU/RAM
\`\`\`

---

### 🔄 Updates

Bot auto-fetches latest logic from Worker. To update:
\`\`\`bash
pm2 restart all
npm update
\`\`\`

---

### 🌐 Remote Worker

- **URL**: https://server.fbproblaster.workers.dev
- **Status**: ✅ Active

---

### 📞 Support

- **Documentation**: See DOKUMENTASI.md
- **GitHub**: https://github.com/scwhhhhg/fbproblaster

---

**Build**: ${buildNumber} | **Date**: ${new Date().toISOString().split('T')[0]} | **License**: AGENCY Edition
`;
}

module.exports = { generateREADME };
