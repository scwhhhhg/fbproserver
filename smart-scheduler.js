// smart-scheduler.js - Complete Fixed Version
// Fixes: Timezone issues, quiet hours blocking (NO CATCH-UP), NaN errors, proper execution timing
// Date: October 20, 2025

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cron = require('node-cron');
require('./loader'); // Enable encrypted module loading
const BotExecutor = require('./executor');

// CRITICAL: Set timezone to Asia/Jakarta for all Date operations
process.env.TZ = 'Asia/Jakarta';

class SmartScheduler {
  constructor() {
    this.accountsDir = path.join(__dirname, '../accounts');
    this.schedulerDir = path.join(__dirname, '../scheduler');
    this.logsDir = path.join(__dirname, '../logs/scheduler');

    this.executor = new BotExecutor();

    // State management
    this.scheduledJobs = new Map();
    this.schedules = [];
    this.rateLimits = new Map();
    this.pausedSchedules = new Set();
    this.missedSchedules = new Map();
    this.wasQuietHoursPreviously = false;

    // Configuration
    this.config = {
      healthCheckInterval: 60,
      accountLimits: {
        maxRunsPerDay: 30,
        maxRunsPerHour: 4
      },
      quietHours: {
        enabled: true,
        start: 23,  // 23:00 WIB
        end: 6,     // 06:00 WIB
        timezone: 'Asia/Jakarta'
      },

      // Bot execution intervals (in seconds)
      botIntervals: {
        // Frequent bots (every 30 min - 2 hours)
        updatestatus: {
          min: 1800,   // 30 minutes
          max: 7200    // 2 hours
        },
        reply: {
          min: 1800,   // 30 minutes
          max: 7200    // 2 hours
        },

        // Regular bots (every 1-4 hours)
        videocomment: {
          min: 3600,   // 1 hour
          max: 14400   // 4 hours
        },
        timelinecomment: {
          min: 3600,   // 1 hour
          max: 14400   // 4 hours
        },
        groupcomment: {
          min: 3600,   // 1 hour
          max: 14400   // 4 hours
        },

        // Less frequent bots (every 2-8 hours)
        sharereels: {
          min: 7200,   // 2 hours
          max: 28800   // 8 hours
        },
        confirm: {
          min: 7200,   // 2 hours
          max: 86400   // 24 hours
        },

        // Daily/rare bots (every 4-24 hours)
        scrape: {
          min: 14400,  // 4 hours
          max: 86400   // 24 hours
        },
        uploadreels: {
          min: 43200,  // 12 hours
          max: 86400   // 24 hours
        },
        scrape_post: {
          min: 14400,  // 4 hours
          max: 86400   // 24 hours
        }
      }
    };

    this.notify = require('./notify');

    // Setup quiet hours end handler
    this.setupQuietHoursEndHandler();
  }

  // ==================== INITIALIZATION ====================

  async initialize() {
    const time = this.getCurrentTime();
    console.log(`[${time}] === Initializing Smart Scheduler ===`);

    // Create directories
    await fs.mkdir(this.schedulerDir, { recursive: true });
    await fs.mkdir(this.logsDir, { recursive: true });

    // Initialize executor
    await this.executor.initialize();

    // Load schedules
    await this.loadScheduleConfigs();

    // Initialize rate limiting
    await this.initializeRateLimiting();

    // Validate cookies on startup
    console.log(`[${time}] Validating cookies for ${this.executor.accounts.length} accounts...`);
    await this.executor.validateAllAccountsCookies();

    const cookieSummary = this.executor.getCookieSummary();
    console.log(`[${time}] Cookie validation complete: ${cookieSummary.valid}/${cookieSummary.total} valid`);

    // Auto-refresh invalid cookies if possible
    if (cookieSummary.expired > 0 || cookieSummary.unknown > 0) {
      console.log(`[${time}] Attempting to refresh ${cookieSummary.expired + cookieSummary.unknown} invalid cookies...`);

      for (const account of this.executor.accounts) {
        if (account.enabled && account.hasLoginConfig) {
          const result = this.executor.cookieCheckResults.get(account.id);
          if (!result || !result.isValid) {
            console.log(`[${time}] Refreshing cookies for ${account.id}...`);
            await this.executor.ensureValidCookies(account.id);
            await this.executor.delay(5000);
          }
        }
      }
    }

    // Start scheduled jobs
    await this.startScheduledJobs();

    // Start health monitoring
    this.startHealthMonitoring();

    console.log(`[${time}] Smart Scheduler initialized with ${this.schedules.length} scheduled tasks`);
    console.log(`[${time}] Quiet Hours: ${this.config.quietHours.enabled ? `${this.config.quietHours.start}:00 - ${this.config.quietHours.end}:00` : 'Disabled'}`);

    const isQuiet = this.isCurrentlyQuietHours();
    console.log(`[${time}] Currently in quiet hours: ${isQuiet ? 'YES' : 'NO'}`);

    await this.notify.systemAlert('scheduler', `Initialized: ${this.schedules.length} tasks, Cookies: ${cookieSummary.valid}/${cookieSummary.total}, Quiet: ${isQuiet ? 'Yes' : 'No'}`);
  }

  // ==================== TIMEZONE UTILITIES ====================

  getCurrentTime(format = 'long') {
    const now = new Date();
    if (format === 'long') {
      return now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    } else if (format === 'short') {
      return now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
    } else if (format === 'hour') {
      return now.getHours();
    }
    return now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  }

  // FIXED: Proper timezone-aware quiet hours check
  isCurrentlyQuietHours() {
    if (!this.config.quietHours.enabled) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const quietStart = this.config.quietHours.start;
    const quietEnd = this.config.quietHours.end;

    let isQuiet = false;
    if (quietStart < quietEnd) {
      // Normal range (e.g., 2-6)
      isQuiet = (currentHour >= quietStart && currentHour < quietEnd);
    } else {
      // Wrap-around range (e.g., 23-6)
      isQuiet = (currentHour >= quietStart || currentHour < quietEnd);
    }

    return isQuiet;
  }

  // ==================== QUIET HOURS MANAGEMENT ====================

  setupQuietHoursEndHandler() {
    // Check every minute if quiet hours just ended
    setInterval(async () => {
      if (!this.config.quietHours.enabled) return;

      const isQuietNow = this.isCurrentlyQuietHours();

      // Check if we just exited quiet hours
      if (!isQuietNow && this.wasQuietHoursPreviously) {
        const time = this.getCurrentTime();
        console.log(`[${time}] ✅ Quiet hours ended - schedules will resume normally`);

        // Clear missed schedules - they are now cancelled
        if (this.missedSchedules.size > 0) {
          console.log(`[${time}] 🚫 Cancelled ${this.missedSchedules.size} missed schedules from quiet hours`);
          await this.notify.systemAlert('scheduler', `Cancelled ${this.missedSchedules.size} tasks that were blocked by quiet hours`);
          this.missedSchedules.clear();
        }
      }

      this.wasQuietHoursPreviously = isQuietNow;
    }, 60000); // Check every minute
  }

  // ==================== SCHEDULE LOADING ====================

  async loadScheduleConfigs() {
    this.schedules = [];
    const time = this.getCurrentTime();

    for (const account of this.executor.accounts) {
      if (!account.enabled) continue;

      const schedulePath = path.join(account.path, 'schedule.json');

      try {
        if (!fsSync.existsSync(schedulePath)) continue;

        const scheduleData = await fs.readFile(schedulePath, 'utf8');
        const scheduleConfig = JSON.parse(scheduleData);

        if (!scheduleConfig.enabled) continue;

        const runs = scheduleConfig.runs || [];
        const timezone = scheduleConfig.timezone || 'Asia/Jakarta';

        for (const run of runs) {
          if (!run.bot || !run.enabled) continue;

          const cronExpression = this.buildCronExpression(run);

          if (cronExpression) {
            this.schedules.push({
              accountId: account.id,
              botName: run.bot,
              cronExpression: cronExpression,
              priority: run.priority || 'normal',
              config: run,
              timezone: timezone,
              lastRun: 0,
              lastAttempt: 0
            });
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`[${time}] Failed to load schedule for ${account.id}:`, error.message);
        }
      }
    }

    console.log(`Loaded ${this.schedules.length} scheduled tasks`);
  }

  // ==================== CRON EXPRESSION BUILDER ====================

  buildCronExpression(run) {
    if (run.cron) return run.cron;

    const timeStr = run.time || '09:00';
    const timeParts = timeStr.split(':').map(Number);

    let hours = timeParts[0];
    let minutes = timeParts[1] || 0;

    // Validate parsed values
    if (isNaN(hours) || isNaN(minutes)) {
      console.error(`[CRON] Invalid time format: ${run.time}, using default 09:00`);
      hours = 9;
      minutes = 0;
    }

    // Validate ranges
    if (hours < 0 || hours > 23) {
      console.error(`[CRON] Invalid hour: ${hours}, using 9`);
      hours = 9;
    }
    if (minutes < 0 || minutes > 59) {
      console.error(`[CRON] Invalid minute: ${minutes}, using 0`);
      minutes = 0;
    }

    // FIXED: Adjust schedule if it falls during quiet hours
    let adjustedHour = hours;
    if (this.config.quietHours.enabled) {
      const quietStart = this.config.quietHours.start;
      const quietEnd = this.config.quietHours.end;

      if (quietStart < quietEnd) {
        // Normal range (e.g., 2-6)
        if (adjustedHour >= quietStart && adjustedHour < quietEnd) {
          adjustedHour = quietEnd;
          console.log(`[CRON] ⚠️ ${run.bot}: Adjusted from ${hours}:00 to ${adjustedHour}:00 (after quiet hours)`);
        }
      } else {
        // Wrap-around range (e.g., 23-6)
        if (adjustedHour >= quietStart || adjustedHour < quietEnd) {
          adjustedHour = quietEnd;
          console.log(`[CRON] ⚠️ ${run.bot}: Adjusted from ${hours}:00 to ${adjustedHour}:00 (after quiet hours)`);
        }
      }
    }

    // FIXED: Proper randomization with bounds checking
    const randomizeMinutes = Math.min(
      Math.abs(run.randomizeMinutes !== undefined ? run.randomizeMinutes : 15),
      30 // Cap at 30 minutes to prevent overflow
    );

    const randomOffset = Math.floor(Math.random() * (randomizeMinutes * 2 + 1)) - randomizeMinutes;
    let randomMinutes = minutes + randomOffset;

    // FIXED: Handle hour overflow if minutes went negative/over 59
    let finalHour = adjustedHour;
    let finalMinutes = randomMinutes;

    if (randomMinutes < 0) {
      finalHour = (adjustedHour - 1 + 24) % 24;
      finalMinutes = 60 + randomMinutes;
    } else if (randomMinutes > 59) {
      finalHour = (adjustedHour + 1) % 24;
      finalMinutes = randomMinutes - 60;
    }

    // Final validation
    finalMinutes = Math.max(0, Math.min(59, finalMinutes));
    finalHour = Math.max(0, Math.min(23, finalHour));

    // Build days expression
    let daysExpr = '*';
    if (run.days && run.days.length > 0) {
      if (run.days.includes('daily')) {
        daysExpr = '*';
      } else {
        const dayMap = {
          sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
          thursday: 4, friday: 5, saturday: 6
        };
        const dayNumbers = run.days.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined);
        if (dayNumbers.length > 0) {
          daysExpr = dayNumbers.join(',');
        }
      }
    }

    const cronExpression = `${finalMinutes} ${finalHour} * * ${daysExpr}`;

    // Log the final cron for debugging
    console.log(`[CRON] ${run.bot}: ${run.time} → ${cronExpression} (randomize: ±${randomizeMinutes}m)`);

    return cronExpression;
  }

  // ==================== JOB SCHEDULING ====================

  async startScheduledJobs() {
    const time = this.getCurrentTime();
    console.log(`[${time}] Starting scheduled jobs with timezone: ${this.config.quietHours.timezone}`);

    for (const schedule of this.schedules) {
      try {
        // CRITICAL: Create cron job with timezone option
        const job = cron.schedule(
          schedule.cronExpression,
          async () => {
            await this.handleScheduledTask(schedule);
          },
          {
            scheduled: false,
            timezone: schedule.timezone
          }
        );

        const jobKey = `${schedule.accountId}_${schedule.botName}`;
        this.scheduledJobs.set(jobKey, job);
        job.start();

        console.log(`⏰ ${schedule.botName} for ${schedule.accountId}: ${schedule.cronExpression}`);

      } catch (error) {
        console.error(`Failed to schedule ${schedule.accountId}_${schedule.botName}: ${error.message}`);
        await this.notify.systemAlert('scheduler', `Failed to schedule ${schedule.accountId}_${schedule.botName}: ${error.message}`);
      }
    }

    console.log(`[${time}] Started ${this.scheduledJobs.size} scheduled jobs`);
  }

  // ==================== TASK EXECUTION ====================

  async handleScheduledTask(schedule, forceExecute = false) {
    const jobKey = `${schedule.accountId}_${schedule.botName}`;
    const time = this.getCurrentTime();

    if (this.pausedSchedules.has(jobKey)) {
      console.log(`[${time}] ⏸️ Skipped (paused): ${jobKey}`);
      return;
    }

    // Skip checks if force execute (auto-recovery)
    if (!forceExecute) {
      const canExecute = await this.preExecutionChecks(schedule);
      if (!canExecute.allowed) {
        console.log(`[${time}] 🚫 Cancelled ${jobKey}: ${canExecute.reason}`);

        // Track as missed only for logging purposes
        if (canExecute.reason.includes('Quiet hours')) {
          this.missedSchedules.set(jobKey, Date.now());
          // DO NOT execute after quiet hours - just cancel
        }

        return;
      }
    } else {
      console.log(`[${time}] 🔄 Force executing (auto-recovery): ${jobKey}`);
    }

    schedule.lastAttempt = Date.now();

    try {
      console.log(`[${time}] ⚡ Triggering: ${jobKey}`);

      this.executor.addToQueue({
        accountId: schedule.accountId,
        botName: schedule.botName,
        priority: this.getPriorityValue(schedule.priority),
        validateCookies: true,
        schedulerTriggered: true
      });

      await this.updateRateLimits(schedule.accountId, schedule.botName);
      schedule.lastRun = Date.now();

      // Clear from missed schedules
      this.missedSchedules.delete(jobKey);

    } catch (error) {
      console.error(`[${time}] ❌ Failed to trigger ${jobKey}:`, error.message);
      await this.notify.error('scheduler', jobKey, error.message);
    }
  }

  async preExecutionChecks(schedule) {
    // CRITICAL: Use proper timezone-aware quiet hours check
    if (this.isCurrentlyQuietHours()) {
      return {
        allowed: false,
        reason: `Quiet hours (${this.config.quietHours.start}:00-${this.config.quietHours.end}:00 WIB)`
      };
    }

    // Rate limit check
    const rateLimitOk = await this.checkRateLimits(schedule.accountId, schedule.botName);
    if (!rateLimitOk.allowed) {
      return { allowed: false, reason: rateLimitOk.reason };
    }

    // Minimum interval check
    const minInterval = this.config.botIntervals[schedule.botName]?.min || 1800;
    const timeSinceLastRun = (Date.now() - schedule.lastRun) / 1000;

    if (timeSinceLastRun < minInterval) {
      return {
        allowed: false,
        reason: `Min interval not met (${Math.round(minInterval - timeSinceLastRun)}s remaining)`
      };
    }

    // Executor capacity check
    const executorStatus = this.executor.getStatus();
    if (executorStatus.runningProcesses >= this.executor.config.maxConcurrentGlobal) {
      return { allowed: false, reason: 'Executor at capacity' };
    }

    return { allowed: true };
  }

  // ==================== RATE LIMITING ====================

  async checkRateLimits(accountId, botName) {
    const now = Date.now();
    const rateLimitKey = `${accountId}_${botName}`;

    if (!this.rateLimits.has(rateLimitKey)) {
      this.rateLimits.set(rateLimitKey, {
        hourlyRuns: [],
        dailyRuns: []
      });
    }

    const limits = this.rateLimits.get(rateLimitKey);

    // Clean up old entries
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    limits.hourlyRuns = limits.hourlyRuns.filter(t => t > oneHourAgo);
    limits.dailyRuns = limits.dailyRuns.filter(t => t > oneDayAgo);

    // Check limits
    if (limits.hourlyRuns.length >= this.config.accountLimits.maxRunsPerHour) {
      return { allowed: false, reason: 'Hourly rate limit exceeded' };
    }
    if (limits.dailyRuns.length >= this.config.accountLimits.maxRunsPerDay) {
      return { allowed: false, reason: 'Daily rate limit exceeded' };
    }

    return { allowed: true };
  }

  async updateRateLimits(accountId, botName) {
    const now = Date.now();
    const rateLimitKey = `${accountId}_${botName}`;
    const limits = this.rateLimits.get(rateLimitKey);

    if (limits) {
      limits.hourlyRuns.push(now);
      limits.dailyRuns.push(now);
    }
  }

  getPriorityValue(priorityName) {
    const priorities = {
      critical: 1,
      high: 2,
      normal: 5,
      low: 8
    };
    return priorities[priorityName] || 5;
  }

  async initializeRateLimiting() {
    const rateLimitFile = path.join(this.schedulerDir, 'rate_limits.json');

    try {
      if (fsSync.existsSync(rateLimitFile)) {
        const data = await fs.readFile(rateLimitFile, 'utf8');
        const savedLimits = JSON.parse(data);

        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        for (const [key, limits] of Object.entries(savedLimits)) {
          this.rateLimits.set(key, {
            hourlyRuns: (limits.hourlyRuns || []).filter(t => t > oneHourAgo),
            dailyRuns: (limits.dailyRuns || []).filter(t => t > oneDayAgo)
          });
        }

        console.log(`Restored rate limiting data`);
      }
    } catch (error) {
      console.error('Failed to load rate limit data:', error.message);
    }

    // Save rate limit data every 10 minutes
    setInterval(async () => {
      await this.saveRateLimitData();
    }, 10 * 60 * 1000);
  }

  async saveRateLimitData() {
    try {
      const rateLimitFile = path.join(this.schedulerDir, 'rate_limits.json');
      const data = Object.fromEntries(this.rateLimits);
      await fs.writeFile(rateLimitFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save rate limit data:', error.message);
    }
  }

  // ==================== HEALTH MONITORING ====================

  startHealthMonitoring() {
    setInterval(async () => {
      const now = Date.now();
      const isQuiet = this.isCurrentlyQuietHours();
      const time = this.getCurrentTime();

      // Skip health monitoring during quiet hours
      if (isQuiet) return;

      for (const schedule of this.schedules) {
        const jobKey = `${schedule.accountId}_${schedule.botName}`;

        if (this.pausedSchedules.has(jobKey)) continue;

        const timeSinceAttempt = now - schedule.lastAttempt;
        const maxInterval = this.config.botIntervals[schedule.botName]?.max || 7200;

        // Check if schedule is overdue (2x max interval)
        if (schedule.lastAttempt > 0 && timeSinceAttempt > (maxInterval * 2 * 1000)) {
          const minutesOverdue = Math.round(timeSinceAttempt / 1000 / 60);

          // Check if the last attempt was BEFORE quiet hours started
          const lastAttemptDate = new Date(schedule.lastAttempt);
          const lastAttemptHour = lastAttemptDate.getHours();

          // If last attempt was during normal hours and we're past the interval,
          // it means the task should have run but was blocked by quiet hours
          // In this case, we CANCEL it instead of recovering
          const quietStart = this.config.quietHours.start;
          const quietEnd = this.config.quietHours.end;


          let wasBlockedByQuietHours = false;

          // Calculate when the task should have run
          const expectedRunTime = schedule.lastAttempt + (maxInterval * 1000);
          const expectedRunDate = new Date(expectedRunTime);
          const expectedRunHour = expectedRunDate.getHours();

          // Check if the expected run time would have been during quiet hours
          if (quietStart < quietEnd) {
            // Normal range (e.g., 2-6)
            wasBlockedByQuietHours = (expectedRunHour >= quietStart && expectedRunHour < quietEnd);
          } else {
            // Wrap-around range (e.g., 23-6)
            wasBlockedByQuietHours = (expectedRunHour >= quietStart || expectedRunHour < quietEnd);
          }

          if (wasBlockedByQuietHours) {
            // CANCEL overdue tasks that were blocked by quiet hours
            console.log(`[${time}] 🚫 Cancelled overdue task ${jobKey} (${minutesOverdue}m) - was blocked by quiet hours`);

            // Reset the lastAttempt to now so it won't trigger again
            schedule.lastAttempt = now;

            // Alert once per day max
            const lastAlert = this.lastOverdueAlerts?.get(jobKey) || 0;
            const timeSinceAlert = now - lastAlert;

            if (timeSinceAlert > (24 * 60 * 60 * 1000)) {
              await this.notify.systemAlert('scheduler', `Cancelled overdue: ${jobKey} (${minutesOverdue}m) - blocked by quiet hours`);
              if (!this.lastOverdueAlerts) this.lastOverdueAlerts = new Map();
              this.lastOverdueAlerts.set(jobKey, now);
            }

          } else {
            // Only recover if it's genuinely overdue (not due to quiet hours)
            const lastAlert = this.lastOverdueAlerts?.get(jobKey) || 0;
            const timeSinceAlert = now - lastAlert;

            if (timeSinceAlert > (60 * 60 * 1000)) { // Alert max once per hour
              console.log(`[${time}] ⚠️ Schedule ${jobKey} overdue: ${minutesOverdue} minutes - Auto-recovering...`);
              await this.notify.systemAlert('scheduler', `Schedule overdue: ${jobKey} (${minutesOverdue}m) - Auto-recovering...`);

              if (!this.lastOverdueAlerts) this.lastOverdueAlerts = new Map();
              this.lastOverdueAlerts.set(jobKey, now);
            }

            // AUTO-RECOVERY: Only for genuine overdue (not quiet hours related)
            console.log(`[${time}] 🔄 Auto-recovering overdue task: ${jobKey}`);
            try {
              // Force execute with bypass of min interval and rate limit checks
              await this.handleScheduledTask(schedule, true);

              // Resolution logging
              console.log(`[${time}] ✅ Overdue task ${jobKey} recovered successfully`);

            } catch (error) {
              console.error(`[${time}] ❌ Auto-recovery failed for ${jobKey}:`, error.message);
            }
          }
        }
      }
    }, this.config.healthCheckInterval * 1000);
  }

  // ==================== MANUAL CONTROLS ====================

  async pauseSchedule(accountId, botName = null) {
    const time = this.getCurrentTime();

    if (botName) {
      const jobKey = `${accountId}_${botName}`;
      this.pausedSchedules.add(jobKey);
      console.log(`[${time}] ⏸️ Paused: ${jobKey}`);
      return true;
    } else {
      let pausedCount = 0;
      for (const schedule of this.schedules) {
        if (schedule.accountId === accountId) {
          const jobKey = `${schedule.accountId}_${schedule.botName}`;
          this.pausedSchedules.add(jobKey);
          pausedCount++;
        }
      }
      console.log(`[${time}] ⏸️ Paused ${pausedCount} schedules for: ${accountId}`);
      return pausedCount > 0;
    }
  }

  async resumeSchedule(accountId, botName = null) {
    const time = this.getCurrentTime();

    if (botName) {
      const jobKey = `${accountId}_${botName}`;
      this.pausedSchedules.delete(jobKey);
      console.log(`[${time}] ▶️ Resumed: ${jobKey}`);
      return true;
    } else {
      let resumedCount = 0;
      for (const schedule of this.schedules) {
        if (schedule.accountId === accountId) {
          const jobKey = `${schedule.accountId}_${schedule.botName}`;
          this.pausedSchedules.delete(jobKey);
          resumedCount++;
        }
      }
      console.log(`[${time}] ▶️ Resumed ${resumedCount} schedules for: ${accountId}`);
      return resumedCount > 0;
    }
  }

  async forceRunTask(accountId, botName) {
    const time = this.getCurrentTime();
    const schedule = this.schedules.find(
      s => s.accountId === accountId && s.botName === botName
    );

    if (!schedule) {
      throw new Error(`Schedule not found: ${accountId}_${botName}`);
    }

    console.log(`[${time}] 🚀 Force running: ${accountId}_${botName}`);

    this.executor.addToQueue({
      accountId: accountId,
      botName: botName,
      priority: 1,
      validateCookies: true,
      manualTrigger: true
    });
  }

  // ==================== STATUS & MONITORING ====================

  getStatus() {
    const executorStatus = this.executor.getStatus();
    const time = this.getCurrentTime();
    const isQuietHour = this.isCurrentlyQuietHours();

    return {
      timestamp: time,
      scheduler: {
        scheduledJobs: this.scheduledJobs.size,
        activeSchedules: this.schedules.length - this.pausedSchedules.size,
        pausedSchedules: this.pausedSchedules.size,
        missedSchedules: this.missedSchedules.size,
        quietHours: {
          enabled: this.config.quietHours.enabled,
          period: `${this.config.quietHours.start}:00 - ${this.config.quietHours.end}:00`,
          timezone: this.config.quietHours.timezone,
          currentlyActive: isQuietHour
        },
        nextRuns: this.schedules
          .filter(s => !this.pausedSchedules.has(`${s.accountId}_${s.botName}`))
          .map(s => ({
            accountId: s.accountId,
            botName: s.botName,
            cron: s.cronExpression,
            timezone: s.timezone,
            lastRun: s.lastRun ? new Date(s.lastRun).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'Never'
          }))
          .slice(0, 10)
      },
      executor: executorStatus
    };
  }

  // ==================== SHUTDOWN ====================

  async shutdown() {
    const time = this.getCurrentTime();
    console.log(`[${time}] Shutting down Smart Scheduler...`);

    // Stop all cron jobs
    for (const [jobKey, job] of this.scheduledJobs) {
      job.stop();
    }

    // Save rate limit data
    await this.saveRateLimitData();

    // Stop executor
    await this.executor.stopAll();

    console.log(`[${time}] Smart Scheduler shutdown complete`);
  }
}

module.exports = SmartScheduler;
