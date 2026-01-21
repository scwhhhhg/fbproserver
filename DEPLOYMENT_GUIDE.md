# 🚀 FacebookPro Blaster - Server-Side Edition
## Production Deployment Guide (VPS/Cloud Server)

### 📋 System Requirements
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **RAM**: Minimum 2GB (Recommended 4GB+)
- **Storage**: Minimum 10GB free space
- **Node.js**: Version 20.x or higher
- **Python**: Version 3.12 (auto-installed by setup script)
- **Internet**: Stable connection for API calls

---

## 🔧 Quick Installation (Ubuntu/Debian)

### Step 1: Extract & Navigate
```bash
unzip FacebookPro_Blaster_Ultimate_Secure_*.zip
cd FacebookPro_Blaster_Ultimate_Secure_*
```

### Step 2: Run Automated Setup
```bash
chmod +x setup-linux.sh
./setup-linux.sh
```

**What the setup script does:**
- ✅ Installs Node.js 20.x
- ✅ Installs Python 3.12 + dependencies (InsightFace, OpenCV, ONNX Runtime)
- ✅ Downloads Face Swap AI model (inswapper_128.onnx)
- ✅ Installs all NPM packages
- ✅ Creates required directories
- ✅ Verifies installation

### Step 3: Configure Your Account
```bash
node bot/executor account-setup
```

Follow the interactive prompts to:
1. Enter account name (e.g., "silvia")
2. Upload cookies.json file
3. Configure bot settings

### Step 4: Start Bot with PM2 (24/7 Operation)
```bash
# Start all bots
pm2 start ecosystem.config.js

# View logs
pm2 logs

# Monitor status
pm2 status

# Save configuration
pm2 save

# Enable auto-start on server reboot
pm2 startup
```

---

## 🎯 Manual Installation (Advanced)

### 1. Install Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Should show v20.x.x
```

### 2. Install Python 3.12
```bash
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt-get update
sudo apt-get install -y python3.12 python3.12-venv python3.12-dev python3-pip
```

### 3. Install Python Dependencies
```bash
python3.12 -m pip install insightface onnxruntime opencv-python gdown
```

### 4. Download Face Swap Model
```bash
python3.12 -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O bot/inswapper_128.onnx
```

### 5. Install NPM Dependencies
```bash
npm install
```

### 6. Install PM2 Globally
```bash
sudo npm install -g pm2
```

---

## 🔐 Security Best Practices

### 1. Firewall Configuration
```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS (if needed for webhook)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### 2. Create Non-Root User
```bash
sudo adduser fbprobot
sudo usermod -aG sudo fbprobot
su - fbprobot
```

### 3. Secure Cookies & Credentials
```bash
# Set proper permissions
chmod 600 accounts/*/cookies.json
chmod 700 accounts/
```

---

## 📊 Monitoring & Maintenance

### PM2 Commands
```bash
# View all processes
pm2 list

# View logs (real-time)
pm2 logs

# View logs for specific bot
pm2 logs updatestatus

# Restart all bots
pm2 restart all

# Restart specific bot
pm2 restart updatestatus

# Stop all bots
pm2 stop all

# Delete all processes
pm2 delete all

# Monitor CPU/Memory usage
pm2 monit
```

### Log Management
```bash
# View executor logs
tail -f logs/executor.log

# View scheduler logs
tail -f logs/scheduler/scheduler.log

# Clear old logs
pm2 flush
```

---

## 🐛 Troubleshooting Guide

### Issue 1: "Cannot find module 'python-shell'"
**Solution:**
```bash
npm install python-shell
```

### Issue 2: Face Swap Fails - Model Not Found
**Solution:**
```bash
# Check if model exists
ls -lh bot/inswapper_128.onnx

# If not, download manually
python3.12 -m gdown "https://drive.google.com/uc?export=download&id=1krOLgjW2tAPaqV-Bw4YALz0xT5zlb5HF" -O bot/inswapper_128.onnx
```

### Issue 3: "Protocol error (Input.dispatchKeyEvent): Session closed"
**Cause:** Browser/page closed unexpectedly during automation.

**Solutions:**
1. **Increase timeout values** in bot config:
   ```json
   {
     "timeout": 90000,
     "navigationTimeout": 120000
   }
   ```

2. **Check system resources:**
   ```bash
   free -h  # Check RAM
   df -h    # Check disk space
   ```

3. **Restart bot:**
   ```bash
   pm2 restart updatestatus
   ```

### Issue 4: Cookies Expired
**Solution:**
```bash
# Regenerate cookies
node bot/executor generate silvia

# Or use cookiegenerator directly
node bot/cookiegenerator generate silvia
```

### Issue 5: Pollinations.ai API Timeout
**Cause:** Network issues or API overload.

**Solutions:**
1. **Increase timeout:**
   Edit `bot/updatestatus.js`:
   ```javascript
   timeout: 60000  // Increase to 60 seconds
   ```

2. **Use fallback providers:**
   The bot automatically falls back to OpenRouter → Gemini if Pollinations fails.

### Issue 6: High Memory Usage
**Solution:**
```bash
# Limit PM2 memory
pm2 start ecosystem.config.js --max-memory-restart 1G

# Or edit ecosystem.config.js:
{
  max_memory_restart: '1G'
}
```

---

## 🔄 Update & Maintenance

### Update Bot Logic (From Worker)
The bot automatically fetches the latest logic from Cloudflare Worker on each run. No manual update needed!

### Update Dependencies
```bash
npm update
python3.12 -m pip install --upgrade insightface onnxruntime opencv-python
```

### Backup Configuration
```bash
# Backup accounts folder
tar -czf accounts_backup_$(date +%Y%m%d).tar.gz accounts/

# Backup to remote server (optional)
scp accounts_backup_*.tar.gz user@backup-server:/backups/
```

---

## 📈 Performance Optimization

### 1. Enable Headless Mode (Production)
Edit `accounts/[account]/bots/updatestatus.json`:
```json
{
  "headless": "new"
}
```

### 2. Adjust Concurrency
Edit `ecosystem.config.js`:
```javascript
{
  instances: 1,  // Run single instance per bot
  exec_mode: 'fork'
}
```

### 3. Optimize Photo Settings
```json
{
  "photo_settings": {
    "use_pollinations": true,
    "use_local_faceswap": true,  // Disable if CPU limited
    "use_local_photos": false    // Disable to save bandwidth
  }
}
```

---

## 🌐 Remote Worker Configuration

### Default Worker URL
```
https://server.fbproblaster.workers.dev
```

### Custom Worker (Optional)
Set environment variable:
```bash
export REMOTE_CONFIG_URL="https://your-custom-worker.workers.dev"
export REMOTE_CONFIG_SECRET="your-secret-key"
```

Or edit `bot/remote-config.js`:
```javascript
module.exports = {
  WORKER_URL: 'https://your-custom-worker.workers.dev',
  AUTH_SECRET: 'your-secret-key'
};
```

---

## 📞 Support & Resources

- **Documentation**: See `DOKUMENTASI.html` for detailed guide
- **GitHub Issues**: Report bugs and feature requests
- **Telegram**: Contact @marmosm for support

---

## ⚠️ Important Notes

1. **Cookie Security**: Never share your `cookies.json` file
2. **API Keys**: Keep your Pollinations.ai API key private
3. **Rate Limits**: Respect Facebook's rate limits to avoid account restrictions
4. **Legal**: Use responsibly and comply with Facebook's Terms of Service
5. **Backups**: Regularly backup your `accounts/` folder

---

## 🎉 Success Checklist

- [ ] Setup script completed without errors
- [ ] Python 3.12 installed (`python3.12 --version`)
- [ ] Node.js 20+ installed (`node --version`)
- [ ] Face swap model downloaded (`ls bot/inswapper_128.onnx`)
- [ ] Account configured (`ls accounts/[name]/cookies.json`)
- [ ] PM2 running (`pm2 status`)
- [ ] Logs showing activity (`pm2 logs`)
- [ ] Bot posting successfully on Facebook

---

**Version**: 1.1.0 (Production Ready)  
**Build Date**: 2026-01-21  
**License**: AGENCY Edition

*For the best experience, use Ubuntu 22.04 LTS on a VPS with at least 2GB RAM.*
