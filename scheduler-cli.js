#!/usr/bin/env node

const SmartScheduler = require('./smart-scheduler');
require('./loader'); // Enable encrypted module loading
const { createLogger } = require('./logger');

class SchedulerCLI {
  constructor() {
    this.logger = createLogger('scheduler-cli');
    this.scheduler = new SmartScheduler();
  }

  async run() {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
      switch (command) {
        case 'start':
          await this.start();
          break;
        case 'status':
          await this.status();
          break;
        case 'pause':
          await this.pause(args[0], args[1]);
          break;
        case 'resume':
          await this.resume(args[0], args[1]);
          break;
        case 'run':
          await this.forceRun(args[0], args[1]);
          break;
        case 'health':
          await this.healthCheck();
          break;
        case 'stop':
          await this.stop();
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      this.logger.error('❌ Command failed:', error.message);
      process.exit(1);
    }
  }

  async start() {
    this.logger.info('🚀 Starting Smart Scheduler...');
    await this.scheduler.initialize();

    // Keep running
    this.logger.info('✅ Smart Scheduler is running. Press Ctrl+C to stop.');

    // Graceful shutdown handler
    process.on('SIGINT', async () => {
      this.logger.info('\n🛑 Received shutdown signal...');
      await this.scheduler.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.logger.info('\n🛑 Received termination signal...');
      await this.scheduler.shutdown();
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => { }, 1000);
  }

  async status() {
    await this.scheduler.initialize();
    const status = this.scheduler.getStatus();

    this.logger.info('\n📊 Smart Scheduler Status\n');
    this.logger.info(`Timestamp: ${status.timestamp}`);
    this.logger.info(`\n=== Scheduler ===`);
    this.logger.info(`Scheduled Jobs: ${status.scheduler.scheduledJobs}`);
    this.logger.info(`Active Schedules: ${status.scheduler.activeSchedules}`);
    this.logger.info(`Paused Schedules: ${status.scheduler.pausedSchedules}`);
    this.logger.info(`Missed Schedules: ${status.scheduler.missedSchedules}`);

    this.logger.info(`\n=== Quiet Hours ===`);
    this.logger.info(`Enabled: ${status.scheduler.quietHours.enabled ? 'Yes' : 'No'}`);
    this.logger.info(`Period: ${status.scheduler.quietHours.period}`);
    this.logger.info(`Currently Active: ${status.scheduler.quietHours.currentlyActive ? 'YES' : 'NO'}`);

    this.logger.info(`\n=== Executor ===`);
    this.logger.info(`Running Processes: ${status.executor.runningProcesses}`);
    this.logger.info(`Queued Tasks: ${status.executor.queuedTasks}`);
    this.logger.info(`Locked Accounts: ${status.executor.lockedAccounts}`);
    this.logger.info(`Total Accounts: ${status.executor.totalAccounts}`);
    this.logger.info(`Enabled Accounts: ${status.executor.enabledAccounts}`);

    if (status.executor.running && status.executor.running.length > 0) {
      this.logger.info('\n🏃 Currently Running:');
      status.executor.running.forEach(task => {
        this.logger.info(`  ${task.task} (${task.runtime}s)`);
      });
    }

    if (status.executor.queued && status.executor.queued.length > 0) {
      this.logger.info('\n⏳ Queued Tasks:');
      status.executor.queued.forEach(task => {
        this.logger.info(`  ${task.task} (Priority: ${task.priority})`);
      });
    }

    this.logger.info(`\n=== Cookies ===`);
    this.logger.info(`Total: ${status.executor.cookies.total}`);
    this.logger.info(`Valid: ${status.executor.cookies.valid} (${status.executor.cookies.factuallyVerified} verified)`);
    this.logger.info(`Expired: ${status.executor.cookies.expired}`);
    this.logger.info(`Unknown: ${status.executor.cookies.unknown}`);
    this.logger.info(`Can Auto-Refresh: ${status.executor.cookies.canRefresh}`);

    if (status.scheduler.nextRuns && status.scheduler.nextRuns.length > 0) {
      this.logger.info('\n⏰ Next Scheduled Runs:');
      status.scheduler.nextRuns.slice(0, 5).forEach(run => {
        this.logger.info(`  ${run.accountId}:${run.botName}`);
        this.logger.info(`    Cron: ${run.cron}`);
        this.logger.info(`    Last Run: ${run.lastRun}`);
      });
    }
  }

  async pause(accountId, botName) {
    if (!accountId) {
      this.logger.error('❌ Usage: pause <accountId> [botName]');
      return;
    }

    await this.scheduler.initialize();
    const success = await this.scheduler.pauseSchedule(accountId, botName);

    if (success) {
      this.logger.info(`⏸️ Paused schedule${botName ? ` for ${botName}` : 's'} on account: ${accountId}`);
    } else {
      this.logger.info('❌ Schedule not found');
    }
  }

  async resume(accountId, botName) {
    if (!accountId) {
      this.logger.error('❌ Usage: resume <accountId> [botName]');
      return;
    }

    await this.scheduler.initialize();
    const success = await this.scheduler.resumeSchedule(accountId, botName);

    if (success) {
      this.logger.info(`▶️ Resumed schedule${botName ? ` for ${botName}` : 's'} on account: ${accountId}`);
    } else {
      this.logger.info('❌ Schedule not found');
    }
  }

  async forceRun(accountId, botName) {
    if (!accountId || !botName) {
      this.logger.error('❌ Usage: run <accountId> <botName>');
      return;
    }

    await this.scheduler.initialize();
    await this.scheduler.forceRunTask(accountId, botName);
    this.logger.info(`✅ Task ${accountId}:${botName} queued for execution`);
  }

  async healthCheck() {
    const MaintenanceManager = require('./maintenance').MaintenanceManager;
    const maintenance = new MaintenanceManager();

    this.logger.info('🔍 Running comprehensive health check...\n');

    const health = await maintenance.checkSystemHealth();

    this.logger.info(`Overall Status: ${health.status.toUpperCase()}`);
    this.logger.info(`Total Accounts: ${health.accounts.total}`);
    this.logger.info(`Enabled: ${health.accounts.enabled}`);
    this.logger.info(`Valid Cookies: ${health.accounts.withValidCookies}\n`);

    if (health.accounts.issues.length > 0) {
      this.logger.info('⚠️ Account Issues:');
      health.accounts.issues.forEach(issue => this.logger.info(`  - ${issue}`));
      console.log();
    }

    if (health.issues.length > 0) {
      this.logger.info('🚨 System Issues:');
      health.issues.forEach(issue => this.logger.info(`  - ${issue}`));
    }
  }

  showHelp() {
    console.log(`
🤖 FacebookPro Blaster - Smart Scheduler CLI

Usage:
  node scheduler-cli.js <command> [options]

Commands:
  start                     - Start the Smart Scheduler daemon
  status                    - Show current scheduler status
  pause <account> [bot]     - Pause scheduled tasks
  resume <account> [bot]    - Resume scheduled tasks  
  run <account> <bot>       - Force run a specific task
  health                    - Run comprehensive health check
  stop                      - Stop the scheduler (when running as daemon)

Examples:
  node scheduler-cli.js start
  node scheduler-cli.js status
  node scheduler-cli.js pause account1
  node scheduler-cli.js resume account1 autoupdate_status
  node scheduler-cli.js run account1 autoupdate_status
  node scheduler-cli.js health

For daemon mode, use PM2:
  pm2 start bot/ecosystem.config.js
  pm2 status
  pm2 stop fb-scheduler
  pm2 restart fb-scheduler
    `);
  }
}

if (require.main === module) {
  const cli = new SchedulerCLI();
  cli.run().catch(console.error);
}

module.exports = SchedulerCLI;
