// setup-scheduler.js - COMPLETE INTEGRATION with Maintenance, Telegram, and All Bots
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const { createLogger } = require('./logger');
const logger = createLogger('setup-scheduler');
const execAsync = util.promisify(exec);

async function setupScheduler() {
  this.logger.info('\n╔═══════════════════════════════════════════════════════════╗');
  this.logger.info('║  FACEBOOK BOT - COMPLETE SYSTEM SETUP                     ║');
  this.logger.info('╚═══════════════════════════════════════════════════════════╝\n');
  
  try {
    // Install dependencies
    this.logger.info('📦 Installing dependencies...');
    await execAsync('npm install node-cron axios node-telegram-bot-api');
    this.logger.info('✅ Dependencies installed\n');

    // Create directories
    const dirs = [
      '../scheduler',
      '../logs/scheduler',
      '../logs/telegram',
      '../logs/maintenance',
      '../temp',
      '../backups',
      '../videos',
      '../photos'
    ];
    
    this.logger.info('📁 Creating directories...');
    for (const dir of dirs) {
      await fs.mkdir(path.join(__dirname, dir), { recursive: true });
      this.logger.info(`  ✅ ${dir}`);
    }
    console.log('');

    // Create PM2 ecosystem file with COMPLETE configuration
    this.logger.info('📝 Creating PM2 ecosystem config...');
    const ecosystemPath = path.join(__dirname, 'ecosystem.config.js');
    
    // Check if file exists and has content
    let existingConfig = null;
    try {
      const content = await fs.readFile(ecosystemPath, 'utf8');
      if (content.includes('fb-telegram-bot')) {
        this.logger.info('  ℹ️  ecosystem.config.js already exists with telegram-bot');
        existingConfig = content;
      }
    } catch (e) {
      // File doesn't exist, will create
    }

    if (!existingConfig) {
      // Write the complete ecosystem.config.js from the document
      const ecosystemContent = `// ecosystem.config.js - Complete PM2 Configuration with Maintenance
// This file manages all Facebook automation processes with PM2

const path = require('path');

module.exports = {
  apps: [
    // ========================================
    // MAIN SCHEDULER
    // ========================================
    {
      name: 'fb-scheduler',
      script: path.join(__dirname, 'scheduler-cli.js'),
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 5000,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta',
        MAX_CONCURRENT_GLOBAL: '3',
        MAX_CONCURRENT_PER_ACCOUNT: '1'
      },
      error_file: path.join(__dirname, '../logs/scheduler/pm2-error.log'),
      out_file: path.join(__dirname, '../logs/scheduler/pm2-out.log'),
      log_file: path.join(__dirname, '../logs/scheduler/pm2-combined.log'),
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      min_uptime: '10s',
      max_restarts: 10
    },

    // ========================================
    // TELEGRAM BOT
    // ========================================
    {
      name: 'fb-telegram-bot',
      script: path.join(__dirname, 'telegram-bot.js'),
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      restart_delay: 3000,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta',
        TELEGRAM_USER_IDS: '1088206273'
      },
      error_file: path.join(__dirname, '../logs/telegram/pm2-error.log'),
      out_file: path.join(__dirname, '../logs/telegram/pm2-out.log'),
      log_file: path.join(__dirname, '../logs/telegram/pm2-combined.log'),
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      min_uptime: '10s',
      max_restarts: 15
    },

    // ========================================
    // MAINTENANCE - AUTO COOKIE REFRESH
    // Runs every 6 hours to check and refresh cookies
    // ========================================
    {
      name: 'fb-maintenance-cookies',
      script: path.join(__dirname, 'maintenance.js'),
      args: 'check-cookies',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: false,
      cron_restart: '0 */6 * * *', // Every 6 hours
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta'
      },
      error_file: path.join(__dirname, '../logs/maintenance/cookies-error.log'),
      out_file: path.join(__dirname, '../logs/maintenance/cookies-out.log'),
      log_file: path.join(__dirname, '../logs/maintenance/cookies-combined.log'),
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // ========================================
    // MAINTENANCE - LOG CLEANUP
    // Runs daily at 3 AM to cleanup old logs (7 days)
    // ========================================
    {
      name: 'fb-maintenance-logs',
      script: path.join(__dirname, 'maintenance.js'),
      args: 'cleanup-logs 7',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: false,
      cron_restart: '0 3 * * *', // Daily at 3 AM
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta'
      },
      error_file: path.join(__dirname, '../logs/maintenance/cleanup-error.log'),
      out_file: path.join(__dirname, '../logs/maintenance/cleanup-out.log'),
      log_file: path.join(__dirname, '../logs/maintenance/cleanup-combined.log'),
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // ========================================
    // MAINTENANCE - TEMP FILES CLEANUP
    // Runs daily at 4 AM to cleanup temporary files
    // ========================================
    {
      name: 'fb-maintenance-temp',
      script: path.join(__dirname, 'maintenance.js'),
      args: 'cleanup-temp',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: false,
      cron_restart: '0 4 * * *', // Daily at 4 AM
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta'
      },
      error_file: path.join(__dirname, '../logs/maintenance/temp-error.log'),
      out_file: path.join(__dirname, '../logs/maintenance/temp-out.log'),
      log_file: path.join(__dirname, '../logs/maintenance/temp-combined.log'),
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // ========================================
    // MAINTENANCE - DAILY REPORT
    // Runs daily at 6 AM to generate daily report
    // ========================================
    {
      name: 'fb-maintenance-report',
      script: path.join(__dirname, 'maintenance.js'),
      args: 'daily-report',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: false,
      cron_restart: '0 6 * * *', // Daily at 6 AM
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta'
      },
      error_file: path.join(__dirname, '../logs/maintenance/report-error.log'),
      out_file: path.join(__dirname, '../logs/maintenance/report-out.log'),
      log_file: path.join(__dirname, '../logs/maintenance/report-combined.log'),
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // ========================================
    // MAINTENANCE - FULL AUTO MAINTENANCE
    // Runs weekly on Sunday at 2 AM
    // Includes: cookie refresh, log cleanup, temp cleanup, report
    // ========================================
    {
      name: 'fb-maintenance-full',
      script: path.join(__dirname, 'maintenance.js'),
      args: 'auto-maintenance',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: false,
      cron_restart: '0 2 * * 0', // Every Sunday at 2 AM
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta'
      },
      error_file: path.join(__dirname, '../logs/maintenance/full-error.log'),
      out_file: path.join(__dirname, '../logs/maintenance/full-out.log'),
      log_file: path.join(__dirname, '../logs/maintenance/full-combined.log'),
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};`;
      
      await fs.writeFile(ecosystemPath, ecosystemContent);
      this.logger.info('✅ PM2 ecosystem file created\n');
    } else {
      this.logger.info('✅ PM2 ecosystem file already configured\n');
    }

    // Setup account schedule.json files
    this.logger.info('📋 Creating schedule configs for accounts...');
    const accountsDir = path.join(__dirname, '../accounts');
    
    try {
      const accounts = await fs.readdir(accountsDir);
      let updatedCount = 0;
      
      for (const accountId of accounts) {
        const accountPath = path.join(accountsDir, accountId);
        const configPath = path.join(accountPath, 'config.json');
        const schedulePath = path.join(accountPath, 'schedule.json');

        try {
          await fs.access(configPath);

          try {
            await fs.access(schedulePath);
            this.logger.info(`  ℹ️  ${accountId}: schedule.json exists`);
          } catch (err) {
            const defaultSchedule = {
              enabled: false,
              timezone: "Asia/Jakarta",
              runs: [
                {
                  bot: "uploadreels",
                  enabled: false,
                  priority: "normal",
                  time: "20:00",
                  days: ["monday", "wednesday", "friday"],
                  randomizeMinutes: 30
                },
                {
                  bot: "updatestatus",
                  enabled: false,
                  priority: "high",
                  time: "17:30",
                  days: ["daily"],
                  randomizeMinutes: 15
                },
                {
                  bot: "videocomment",
                  enabled: false,
                  priority: "normal",
                  cron: "0 */4 * * *",
                  randomizeMinutes: 5
                },
                {
                  bot: "groupcomment",
                  enabled: false,
                  priority: "normal",
                  cron: "0 19,20,21 * * *",
                  randomizeMinutes: 30
                },
                {
                  bot: "timelinecomment",
                  enabled: false,
                  priority: "normal",
                  cron: "0 18,20 * * *",
                  randomizeMinutes: 30
                },
                {
                  bot: "autolike",
                  enabled: false,
                  priority: "normal",
                  cron: "0 */8 * * *",
                  randomizeMinutes: 30
                },
                {
                  bot: "viewstory",
                  enabled: false,
                  priority: "normal",
                  cron: "0 18 * * *",
                  randomizeMinutes: 30
                },
                {
                  bot: "scrape",
                  enabled: false,
                  priority: "low",
                  cron: "30 23 * * *",
                  randomizeMinutes: 5
                },
                {
                  bot: "sharereels",
                  enabled: false,
                  priority: "normal",
                  cron: "30 18 * * *",
                  randomizeMinutes: 45
                },
                {
                  bot: "reply",
                  enabled: false,
                  priority: "normal",
                  cron: "0 */3 * * *",
                  randomizeMinutes: 10
                },
                {
                  bot: "confirm",
                  enabled: false,
                  priority: "low",
                  time: "22:00",
                  days: ["daily"],
                  randomizeMinutes: 60
                }
              ]
            };
            await fs.writeFile(schedulePath, JSON.stringify(defaultSchedule, null, 2));
            this.logger.info(`  ✅ ${accountId}: schedule.json created`);
            updatedCount++;
          }

          // Ensure safety config in config.json
          const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
          let configUpdated = false;
          
          if (!config.safety) {
            config.safety = {
              maxRunsPerDay: 15,
              maxRunsPerHour: 3,
              cooldownOnFailure: 1800,
              quietHours: {
                enabled: true,
                start: 2,
                end: 6
              }
            };
            configUpdated = true;
          }
          
          if (config.schedule) {
            delete config.schedule;
            configUpdated = true;
            this.logger.info(`  ✅ ${accountId}: removed old schedule from config.json`);
          }
          
          if (configUpdated) {
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
          }

        } catch (error) {
          if (error.code === 'ENOENT') {
            this.logger.info(`  ⏭️  ${accountId}: config.json not found`);
          }
        }
      }
      this.logger.info(`  📊 Processed ${updatedCount} accounts\n`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.info(`  ⚠️  No accounts directory found\n`);
      }
    }

    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║  ✅ SETUP COMPLETE!                                       ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝\n');
    
    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║  📖 NEXT STEPS                                             ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝\n');
    
    this.logger.info('1️⃣  CREATE ACCOUNTS:');
    this.logger.info('   node bot/account-setup.js\n');
    
    this.logger.info('2️⃣  CONFIGURE SCHEDULES:');
    this.logger.info('   Edit: accounts/{account}/schedule.json');
    this.logger.info('   - Set enabled: true');
    this.logger.info('   - Configure bot runs, times, and days\n');
    
    this.logger.info('3️⃣  TEST THE SYSTEM:');
    this.logger.info('   node bot/scheduler-cli.js status');
    this.logger.info('   node bot/executor.js status');
    this.logger.info('   node bot/executor.js list\n');
    
    this.logger.info('4️⃣  START WITH PM2:');
    this.logger.info('   pm2 start bot/ecosystem.config.js');
    this.logger.info('   pm2 save');
    this.logger.info('   pm2 startup  # Follow instructions for auto-start\n');
    
    this.logger.info('5️⃣  MONITOR:');
    this.logger.info('   pm2 logs fb-scheduler');
    this.logger.info('   pm2 logs fb-telegram-bot');
    this.logger.info('   pm2 logs fb-maintenance-cookies');
    this.logger.info('   pm2 monit\n');
    
    this.logger.info('6️⃣  MANUAL EXECUTION:');
    this.logger.info('   node bot/executor.js run autoupdate_status account1');
    this.logger.info('   node bot/executor.js run autoupload_reels account1');
    this.logger.info('   node bot/executor.js run autokomenvideo parallel\n');
    
    this.logger.info('7️⃣  COOKIE MANAGEMENT:');
    this.logger.info('   node bot/executor.js validate-cookies');
    this.logger.info('   node bot/executor.js refresh-cookies account1');
    this.logger.info('   node bot/maintenance.js check-cookies\n');
    
    this.logger.info('8️⃣  MAINTENANCE:');
    this.logger.info('   node bot/maintenance.js auto-maintenance');
    this.logger.info('   node bot/maintenance.js daily-report\n');
    
    this.logger.info('9️⃣  TELEGRAM BOT:');
    this.logger.info('   Search @YourBot on Telegram');
    this.logger.info('   Send /start');
    this.logger.info('   Control everything from mobile!\n');
    
    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║  🎯 KEY FEATURES                                           ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝\n');
    this.logger.info('✅ Scheduler → Delegates to Executor (unified queue)');
    this.logger.info('✅ Automatic cookie validation & auto-refresh');
    this.logger.info('✅ Priority-based task execution');
    this.logger.info('✅ Account locking (prevents conflicts)');
    this.logger.info('✅ Rate limiting per bot/account');
    this.logger.info('✅ Telegram notifications (unified)');
    this.logger.info('✅ Telegram bot (full control panel)');
    this.logger.info('✅ Maintenance (auto cookie refresh, cleanup)');
    this.logger.info('✅ Jakarta timezone (Asia/Jakarta)');
    this.logger.info('✅ Auto Upload Reels with AI captions');
    this.logger.info('✅ Memory system (anti-monotony)');
    this.logger.info('✅ OCR & Vision analysis');
    this.logger.info('✅ OpenRouter AI (FREE models)\n');
    
    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║  📱 TELEGRAM BOT TOKEN                                     ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝\n');
    this.logger.info('⚠️  IMPORTANT: Update bot token in notify.js and telegram-bot.js');
    this.logger.info('   Current token: 8304737551:AAGFbRLwD1EMwgGMcCLysUIzbsqnBLyHDCY');
    this.logger.info('   Get your own: https://t.me/BotFather\n');
    
    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║  🔐 AUTO-LOGIN CONFIGURATION                               ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝\n');
    this.logger.info('Auto-login will handle cookie refresh automatically!');
    this.logger.info('Setup during account creation with account-setup.js\n');
    
    this.logger.info('╔═══════════════════════════════════════════════════════════╗');
    this.logger.info('║  📊 MONITORING                                             ║');
    this.logger.info('╚═══════════════════════════════════════════════════════════╝\n');
    this.logger.info('Status commands:');
    this.logger.info('  node bot/scheduler-cli.js status  # Scheduler status');
    this.logger.info('  node bot/executor.js status       # Executor status');
    this.logger.info('  node bot/executor.js locks        # Check locks');
    this.logger.info('  node bot/maintenance.js status    # Maintenance status');
    console.log('');
    this.logger.info('PM2 commands:');
    this.logger.info('  pm2 list                          # All processes');
    this.logger.info('  pm2 logs fb-scheduler             # Scheduler logs');
    this.logger.info('  pm2 logs fb-telegram-bot          # Telegram bot logs');
    this.logger.info('  pm2 logs fb-maintenance-cookies   # Cookie refresh logs');
    this.logger.info('  pm2 monit                         # Real-time monitoring');
    console.log('');

  } catch (error) {
    this.logger.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupScheduler();
