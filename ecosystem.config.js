// ecosystem.config.js - Complete PM2 Configuration with Maintenance
// FacebookPro Blaster - All-in-One Facebook Automation System
// This file manages all FacebookPro Blaster processes with PM2

const path = require('path');

module.exports = {
  apps: [
    // ========================================
    // MAIN SCHEDULER
    // ========================================
    {
      name: 'fbpro-scheduler',
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
      name: 'fbpro-telegram-bot',
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
      name: 'fbpro-maintenance-cookies',
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
      name: 'fbpro-maintenance-logs',
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
      name: 'fbpro-maintenance-temp',
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
      name: 'fbpro-maintenance-report',
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
      name: 'fbpro-maintenance-full',
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
};
