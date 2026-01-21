# FacebookPro Blaster - Ultimate Secure Server Edition
## Version 1.2.0 - Production Ready Build

### 🎯 What's New in This Version

#### ✨ Major Features
- **Flux-Pro Model**: Ultra-realistic AI image generation
- **Local Face Swap**: InsightFace integration with auto-setup
- **Smart Python Detection**: Auto-finds Python 3.12 installation
- **Enhanced Error Handling**: Robust fallback mechanisms
- **Production-Ready**: Optimized for 24/7 VPS operation

#### 🔧 Technical Improvements
- Fixed Pollinations.ai text API response handling
- Improved Python path detection for Windows & Linux
- Model auto-download via setup scripts
- Bytecode compilation for security
- Comprehensive deployment guide included

---

### 📦 Package Contents

```
FacebookPro_Blaster_Ultimate_Secure_2026-01-21_Build_0334/
├── bot/                          # Bot executables (bytecode)
│   ├── executor                  # Main bot executor
│   ├── updatestatus              # Status update bot
│   ├── autolike                  # Auto-like bot
│   ├── videocomment              # Video comment bot
│   ├── timelinecomment           # Timeline comment bot
│   ├── groupcomment              # Group comment bot
│   ├── uploadreels               # Reels upload bot
│   ├── sharereels                # Reels share bot
│   ├── confirm                   # Friend request bot
│   ├── scrape                    # Content scraper
│   ├── reply                     # Auto-reply bot
│   ├── viewstory                 # Story viewer bot
│   ├── faceswap.py               # Face swap script
│   └── [other support files]
│
├── setup-linux.sh                # Automated setup for Linux
├── setup-windows.ps1             # Automated setup for Windows
├── ecosystem.config.js           # PM2 configuration
├── package.json                  # NPM dependencies
├── DEPLOYMENT_GUIDE.md           # Complete deployment guide
├── DOKUMENTASI.html              # Full documentation (ID/EN)
├── README.md                     # This file
└── .integrity                    # Build integrity manifest

```

---

### 🚀 Quick Start (3 Steps)

#### For Linux (Ubuntu/Debian):
```bash
# 1. Extract
unzip FacebookPro_Blaster_Ultimate_Secure_*.zip
cd FacebookPro_Blaster_Ultimate_Secure_*

# 2. Run setup
chmod +x setup-linux.sh
./setup-linux.sh

# 3. Configure & start
node bot/executor account-setup
pm2 start ecosystem.config.js
```

#### For Windows:
```powershell
# 1. Extract the ZIP file

# 2. Run setup (Right-click → Run with PowerShell)
.\setup-windows.ps1

# 3. Configure & start
node bot/executor account-setup
pm2 start ecosystem.config.js
```

---

### 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 20.04 / Windows 10 | Ubuntu 22.04 LTS / Windows 11 |
| **RAM** | 2GB | 4GB+ |
| **Storage** | 10GB free | 20GB+ free |
| **CPU** | 2 cores | 4+ cores |
| **Node.js** | v20.0.0 | v20.x (latest) |
| **Python** | 3.12 | 3.12 (auto-installed) |
| **Internet** | Stable connection | High-speed broadband |

---

### 🎨 AI Models & Features

#### Image Generation
- **Primary**: Flux-Pro (Ultra-realistic portraits)
- **Fallback**: Flux, Flux-Realism
- **Resolution**: 1024x1280 (optimized for Facebook)
- **Features**: No watermark, Enhanced quality, Private mode

#### Text Generation
- **Primary**: Pollinations.ai (OpenAI)
- **Fallback 1**: OpenRouter (Qwen 2.5 72B)
- **Fallback 2**: Google Gemini Pro
- **Style**: Natural Indonesian slang (Bahasa Gaul Jakarta)

#### Face Swap
- **Engine**: InsightFace (Buffalo_L model)
- **Model**: inswapper_128.onnx (514MB)
- **Quality**: Production-grade face replacement
- **Speed**: ~5-10 seconds per image (CPU)

---

### 🔐 Security Features

1. **Bytecode Compilation**: All bot logic is compiled to `.jsc` format
2. **Integrity Verification**: SHA256 checksums for all files
3. **Remote Logic Fetch**: Latest updates from secure Cloudflare Worker
4. **Cookie Encryption**: Secure storage of Facebook credentials
5. **License Validation**: CloudDB-based activation system

---

### 📊 What Each Bot Does

| Bot | Function | Use Case |
|-----|----------|----------|
| **updatestatus** | AI-powered status updates with photos | Engagement & presence |
| **autolike** | Auto-like posts on timeline | Increase visibility |
| **videocomment** | Comment on Reels/Videos | Viral content engagement |
| **timelinecomment** | Comment on timeline posts | Community interaction |
| **groupcomment** | Auto-comment in groups | Group marketing |
| **uploadreels** | Upload Reels with AI captions | Content creation |
| **sharereels** | Share viral Reels | Content distribution |
| **confirm** | Accept friend requests | Network growth |
| **scrape** | Scrape content for ideas | Content research |
| **reply** | Auto-reply to comments | Customer service |
| **viewstory** | View stories automatically | Engagement boost |

---

### 🛠️ Configuration Files

#### Main Config: `accounts/[name]/bots/updatestatus.json`
```json
{
  "enabled": true,
  "headless": "new",
  "gemini_prompt": "Your custom prompt...",
  "pollinations_settings": {
    "model": "flux-pro",
    "api_key": "your-api-key"
  },
  "photo_settings": {
    "use_local_faceswap": true,
    "use_pollinations": true
  }
}
```

#### PM2 Config: `ecosystem.config.js`
```javascript
{
  name: 'updatestatus',
  script: 'bot/executor',
  args: 'run updatestatus silvia',
  cron_restart: '0 */4 * * *'  // Every 4 hours
}
```

---

### 📖 Documentation

- **DEPLOYMENT_GUIDE.md**: Complete server deployment guide
- **DOKUMENTASI.html**: Full bilingual documentation (Indonesian/English)
- **README.md**: This quick start guide

---

### 🐛 Common Issues & Solutions

#### Issue: "Cannot find module 'python-shell'"
```bash
npm install python-shell
```

#### Issue: Face Swap model not found
```bash
# Linux
python3.12 -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O bot/inswapper_128.onnx

# Windows
python -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O bot/inswapper_128.onnx
```

#### Issue: Cookies expired
```bash
node bot/executor generate [account-name]
```

#### Issue: Bot crashes
```bash
# Check logs
pm2 logs

# Restart
pm2 restart all

# Monitor
pm2 monit
```

---

### 🔄 Update Instructions

The bot automatically fetches the latest logic from Cloudflare Worker. To update:

1. **Restart bots**: `pm2 restart all`
2. **Update dependencies**: `npm update`
3. **Update Python libs**: `python3.12 -m pip install --upgrade insightface onnxruntime opencv-python`

---

### 📞 Support

- **Email**: support@fbproblaster.com
- **Telegram**: @marmosm
- **GitHub**: https://github.com/scwhhhhg/fbproblaster

---

### ⚖️ License

**AGENCY Edition**  
Licensed to: MARMOSM  
License Type: AGENCY  
Activation: Cloud-based (Airtable)

---

### ⚠️ Disclaimer

This software is for educational and automation purposes only. Users are responsible for:
- Complying with Facebook's Terms of Service
- Respecting rate limits and usage policies
- Securing their account credentials
- Using the software ethically and legally

The developers are not responsible for any account restrictions or bans resulting from misuse.

---

**Build**: 0334  
**Date**: 2026-01-21  
**Worker**: https://server.fbproblaster.workers.dev  
**Status**: ✅ Production Ready

*Enjoy automated Facebook marketing with AI-powered content! 🚀*
