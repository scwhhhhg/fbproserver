// maintenance.js - FacebookPro Blaster Maintenance System

// --- HARDCODED VAULT CREDENTIALS (PRODUCTION) ---
// Credentials are Base64 encoded for additional security
const _decode = (s) => Buffer.from(s, 'base64').toString('utf8');
process.env.VAULT_ADDR = process.env.VAULT_ADDR || _decode('aHR0cHM6Ly9vcGVuYmFvLXByb2R1Y3Rpb24tMTg4NC51cC5yYWlsd2F5LmFwcA==');
process.env.VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || _decode('ZmJwcm9ibGFzdGVy');
process.env.VAULT_ROLE_ID = process.env.VAULT_ROLE_ID || _decode('MjAwZGZhZTktMzQyNS03MmI5LWMxYzUtYzdlNjQ4OTIzZWUy');
process.env.VAULT_SECRET_ID = process.env.VAULT_SECRET_ID || _decode('ZjYzYmRjMzYtNDk3OS0xOTg3LTdjZTMtYzBhNTVkMTZhMjEw');

const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
require('./loader'); // Enable encrypted module loading
const { createLogger } = require('./logger');
const { CookieGenerator } = require('./cookiegenerator');
const notify = require('./notify');
const logger = createLogger('maintenance');

// Set timezone ke Jakarta Indonesia
process.env.TZ = 'Asia/Jakarta';

class MaintenanceManager {
  constructor() {
    this.logger = logger; // Use shared logger instance
    this.accountsDir = path.join(__dirname, "../accounts");
    this.logsDir = path.join(__dirname, "../logs");
    this.tempDir = path.join(__dirname, "../temp");
    this.backupDir = path.join(__dirname, "../backups");
    this.autoLoginInstances = new Map();
    this.cookieCheckResults = new Map();
  }

  async initialize() {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] === Initializing FacebookPro Blaster Maintenance Manager ===`);

    await this.createDirectories();
    await this.loadAccounts();
    await this.initializeAutoLoginInstances();

    this.logger.info(`[${jakartaTime}] FacebookPro Blaster Maintenance Manager initialized with ${this.accounts.length} accounts`);
  }

  async createDirectories() {
    const dirs = [this.accountsDir, this.logsDir, this.tempDir, this.backupDir];
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async loadAccounts() {
    const accounts = [];
    try {
      const accountDirs = await fs.readdir(this.accountsDir);

      for (const accountId of accountDirs) {
        const accountPath = path.join(this.accountsDir, accountId);
        const stat = await fs.stat(accountPath);

        if (stat.isDirectory()) {
          try {
            const configPath = path.join(accountPath, "config.json");
            const config = JSON.parse(await fs.readFile(configPath, "utf8"));

            // Check if cookies exist
            const cookiesPath = path.join(accountPath, "cookies.json");
            const hasCookies = fsSync.existsSync(cookiesPath);

            // Check if login config exists
            const loginConfigPath = path.join(accountPath, "facebook_login.json");
            const hasLoginConfig = fsSync.existsSync(loginConfigPath);

            accounts.push({
              id: accountId,
              config,
              path: accountPath,
              hasCookies,
              hasLoginConfig
            });
          } catch (error) {
            this.logger.info(`Warning: Could not load config for ${accountId}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.logger.info("No accounts directory found");
    }

    this.accounts = accounts;
    return accounts;
  }

  async initializeAutoLoginInstances() {
    for (const account of this.accounts) {
      if (account.hasLoginConfig) {
        try {
          const autoLogin = new CookieGenerator(account.id);
          await autoLogin.initialize();
          this.autoLoginInstances.set(account.id, autoLogin);
          this.logger.info(`[${account.id}] Auto-login instance initialized for maintenance`);
        } catch (error) {
          this.logger.error(`[${account.id}] Auto-login initialization failed: ${error.message}`);
        }
      }
    }
  }

  async checkCookieExpiry() {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] Checking cookie expiry for all accounts...`);

    const results = {
      total: this.accounts.length,
      valid: 0,
      expired: 0,
      missing: 0,
      errors: 0,
      details: []
    };

    for (const account of this.accounts) {
      try {
        const result = await this.checkAccountCookieExpiry(account.id);
        results.details.push(result);

        if (result.status === 'valid') results.valid++;
        else if (result.status === 'expired') results.expired++;
        else if (result.status === 'missing') results.missing++;
        else results.errors++;

      } catch (error) {
        this.logger.error(`Error checking cookies for ${account.id}: ${error.message}`);
        results.errors++;
        results.details.push({
          accountId: account.id,
          status: 'error',
          error: error.message
        });
      }
    }

    // Log summary
    this.logger.info(`\nCookie Expiry Summary:`);
    this.logger.info(`Total: ${results.total}`);
    this.logger.info(`Valid: ${results.valid}`);
    this.logger.info(`Expired: ${results.expired}`);
    this.logger.info(`Missing: ${results.missing}`);
    this.logger.info(`Errors: ${results.errors}`);

    // Send Telegram notification
    await notify.systemAlert('maintenance',
      `Cookie expiry check: ${results.valid} valid, ${results.expired} expired, ${results.missing} missing, ${results.errors} errors`);

    return results;
  }

  async checkAccountCookieExpiry(accountId) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const cookiesPath = path.join(account.path, "cookies.json");

    if (!fsSync.existsSync(cookiesPath)) {
      return {
        accountId,
        status: 'missing',
        hasLoginConfig: account.hasLoginConfig,
        canAutoRefresh: account.hasLoginConfig
      };
    }

    try {
      const cookies = JSON.parse(await fs.readFile(cookiesPath, "utf8"));
      const now = Date.now() / 1000;

      let expiredCount = 0;
      let totalCount = cookies.length;
      let nearExpiryCount = 0;
      const oneWeekFromNow = now + (7 * 24 * 60 * 60); // 1 week

      for (const cookie of cookies) {
        if (cookie.expirationDate) {
          if (cookie.expirationDate <= now) {
            expiredCount++;
          } else if (cookie.expirationDate <= oneWeekFromNow) {
            nearExpiryCount++;
          }
        }
      }

      let status = 'valid';
      if (expiredCount > totalCount * 0.3) { // More than 30% expired
        status = 'expired';
      } else if (nearExpiryCount > totalCount * 0.5) { // More than 50% expiring soon
        status = 'near_expiry';
      }

      // Store result for other methods to use
      this.cookieCheckResults.set(accountId, {
        isValid: status === 'valid',
        checkedAt: Date.now(),
        status: status,
        canAutoRefresh: account.hasLoginConfig,
        expiredCount,
        totalCount,
        nearExpiryCount
      });

      return {
        accountId,
        status,
        expiredCount,
        totalCount,
        nearExpiryCount,
        hasLoginConfig: account.hasLoginConfig,
        canAutoRefresh: account.hasLoginConfig
      };

    } catch (error) {
      throw new Error(`Failed to parse cookies: ${error.message}`);
    }
  }

  async refreshExpiredCookies() {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] Starting cookie refresh for accounts with expired cookies...`);

    // First check which accounts have expired cookies
    await this.checkCookieExpiry();

    const accountsNeedingRefresh = this.accounts.filter(account => {
      const result = this.cookieCheckResults.get(account.id);
      return result && (result.status === 'expired' || result.status === 'near_expiry') && account.hasLoginConfig;
    });

    if (accountsNeedingRefresh.length === 0) {
      this.logger.info('No accounts with expired cookies that have login config found');
      return { success: [], failed: [] };
    }

    this.logger.info(`Found ${accountsNeedingRefresh.length} accounts needing cookie refresh`);

    const results = { success: [], failed: [] };

    for (const account of accountsNeedingRefresh) {
      try {
        this.logger.info(`Refreshing cookies for ${account.id}...`);

        const autoLogin = this.autoLoginInstances.get(account.id);
        if (!autoLogin) {
          throw new Error('Auto-login instance not available');
        }

        // Backup current cookies before refresh
        await this.backupAccountCookies(account.id);

        const success = await autoLogin.ensureValidCookies();

        if (success) {
          this.logger.info(`${account.id}: Cookies refreshed successfully`);
          results.success.push(account.id);
          await notify.success(account.id, 'cookie-refresh',
            'Cookies refreshed during maintenance');
        } else {
          this.logger.info(`${account.id}: Cookie refresh failed`);
          results.failed.push({ accountId: account.id, error: 'Refresh failed' });
          await notify.error(account.id, 'cookie-refresh',
            'Cookie refresh failed during maintenance');
        }

        // Small delay between refreshes
        await this.delay(3000);

      } catch (error) {
        this.logger.error(`${account.id}: Error during refresh - ${error.message}`);
        results.failed.push({ accountId: account.id, error: error.message });
        await notify.error(account.id, 'cookie-refresh',
          `Cookie refresh error: ${error.message}`);
      }
    }

    // Summary
    this.logger.info(`\nCookie refresh completed:`);
    this.logger.info(`Successful: ${results.success.length}`);
    this.logger.info(`Failed: ${results.failed.length}`);

    await notify.systemAlert('maintenance',
      `Cookie refresh completed: ${results.success.length} successful, ${results.failed.length} failed`);

    return results;
  }

  async backupAccountCookies(accountId) {
    try {
      const account = this.accounts.find(a => a.id === accountId);
      if (!account) return;

      const cookiesPath = path.join(account.path, "cookies.json");
      if (!fsSync.existsSync(cookiesPath)) return;

      const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const timestamp = jakartaTime.replace(/[^\w]/g, '_');
      const backupPath = path.join(this.backupDir, `${accountId}_cookies_${timestamp}.json`);

      await fs.copyFile(cookiesPath, backupPath);
      this.logger.info(`Backed up cookies for ${accountId} to ${backupPath}`);
    } catch (error) {
      this.logger.error(`Failed to backup cookies for ${accountId}: ${error.message}`);
    }
  }

  async cleanupLogs(daysOld = 7) {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] Cleaning up logs older than ${daysOld} days...`);

    try {
      const files = await fs.readdir(this.logsDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.logsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
          totalSize += stats.size;
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      this.logger.info(`Deleted ${deletedCount} log files, freed ${Math.round(totalSize / 1024 / 1024)} MB`);

      await notify.systemAlert('maintenance',
        `Log cleanup: deleted ${deletedCount} files, freed ${Math.round(totalSize / 1024 / 1024)} MB`);

    } catch (error) {
      this.logger.error(`Log cleanup failed: ${error.message}`);
      await telegram.logSystemError('maintenance', `Log cleanup failed: ${error.message}`);
    }
  }

  async cleanupTempFiles() {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] Cleaning up temporary files...`);

    try {
      let deletedCount = 0;
      let totalSize = 0;

      const accounts = await fs.readdir(this.tempDir);

      for (const accountId of accounts) {
        const tempAccountDir = path.join(this.tempDir, accountId);
        const stats = await fs.stat(tempAccountDir);

        if (stats.isDirectory()) {
          const files = await fs.readdir(tempAccountDir);

          for (const file of files) {
            const filePath = path.join(tempAccountDir, file);
            const fileStats = await fs.stat(filePath);

            if (fileStats.isFile()) {
              totalSize += fileStats.size;
              await fs.unlink(filePath);
              deletedCount++;
            }
          }
        }
      }

      this.logger.info(`Deleted ${deletedCount} temp files, freed ${Math.round(totalSize / 1024 / 1024)} MB`);

      await notify.systemAlert('maintenance',
        `Temp cleanup: deleted ${deletedCount} files, freed ${Math.round(totalSize / 1024 / 1024)} MB`);

    } catch (error) {
      this.logger.error(`Temp cleanup failed: ${error.message}`);
      await telegram.logSystemError('maintenance', `Temp cleanup failed: ${error.message}`);
    }
  }

  async cleanupOldBackups(daysOld = 30) {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] Cleaning up backups older than ${daysOld} days...`);

    try {
      const files = await fs.readdir(this.backupDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

      let deletedCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
          totalSize += stats.size;
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      this.logger.info(`Deleted ${deletedCount} backup files, freed ${Math.round(totalSize / 1024 / 1024)} MB`);

    } catch (error) {
      this.logger.error(`Backup cleanup failed: ${error.message}`);
    }
  }

  async generateDailyReport() {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] Generating daily maintenance report...`);

    const report = {
      timestamp: jakartaTime,
      accounts: {
        total: this.accounts.length,
        enabled: this.accounts.filter(a => a.config.enabled).length,
        withLoginConfig: this.accounts.filter(a => a.hasLoginConfig).length,
        withCookies: this.accounts.filter(a => a.hasCookies).length
      },
      cookies: null,
      autoLogin: {
        instancesInitialized: this.autoLoginInstances.size,
        accountsWithAutoRefresh: this.accounts.filter(a => a.hasLoginConfig).length
      }
    };

    // Check cookie status
    const cookieResults = await this.checkCookieExpiry();
    report.cookies = {
      valid: cookieResults.valid,
      expired: cookieResults.expired,
      missing: cookieResults.missing,
      errors: cookieResults.errors,
      needingRefresh: cookieResults.details.filter(d =>
        (d.status === 'expired' || d.status === 'near_expiry') && d.canAutoRefresh
      ).length
    };

    // Create formatted report
    const reportText = `
=== Daily Maintenance Report ===
Date: ${jakartaTime}

Accounts:
- Total: ${report.accounts.total}
- Enabled: ${report.accounts.enabled}
- With Login Config: ${report.accounts.withLoginConfig}
- With Cookies: ${report.accounts.withCookies}

Cookies:
- Valid: ${report.cookies.valid}
- Expired: ${report.cookies.expired}
- Missing: ${report.cookies.missing}
- Errors: ${report.cookies.errors}
- Needing Auto-Refresh: ${report.cookies.needingRefresh}

Auto-Login:
- Instances Initialized: ${report.autoLogin.instancesInitialized}
- Accounts with Auto-Refresh: ${report.autoLogin.accountsWithAutoRefresh}
`;

    console.log(reportText);

    // Save report to file
    const reportFile = path.join(this.logsDir, `daily_report_${jakartaTime.replace(/[^\w]/g, '_')}.txt`);
    await fs.writeFile(reportFile, reportText);

    // Send to Telegram
    await notify.systemAlert('maintenance', `Daily Report:\n${reportText}`);

    return report;
  }

  async autoMaintenance() {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`[${jakartaTime}] Starting FacebookPro Blaster automated maintenance routine...`);

    await notify.systemAlert('maintenance', 'Starting FacebookPro Blaster automated maintenance routine');

    try {
      // 1. Check cookie expiry
      this.logger.info('\n=== Step 1: Checking Cookie Expiry ===');
      await this.checkCookieExpiry();

      // 2. Refresh expired cookies
      this.logger.info('\n=== Step 2: Refreshing Expired Cookies ===');
      await this.refreshExpiredCookies();

      // 3. Cleanup logs
      this.logger.info('\n=== Step 3: Cleaning Up Old Logs ===');
      await this.cleanupLogs(7);

      // 4. Cleanup temp files
      this.logger.info('\n=== Step 4: Cleaning Up Temp Files ===');
      await this.cleanupTempFiles();

      // 5. Cleanup old backups
      this.logger.info('\n=== Step 5: Cleaning Up Old Backups ===');
      await this.cleanupOldBackups(30);

      // 6. Generate daily report
      this.logger.info('\n=== Step 6: Generating Daily Report ===');
      await this.generateDailyReport();

      this.logger.info('\n=== FacebookPro Blaster Automated Maintenance Completed Successfully ===');
      await notify.systemAlert('maintenance', 'FacebookPro Blaster automated maintenance completed successfully');

    } catch (error) {
      this.logger.error('Automated maintenance failed:', error.message);
      await telegram.logSystemError('maintenance', `Automated maintenance failed: ${error.message}`);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getMaintenanceStatus() {
    const jakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    this.logger.info(`\n[${jakartaTime}] === FacebookPro Blaster Maintenance Status ===`);
    this.logger.info(`Total accounts: ${this.accounts.length}`);
    this.logger.info(`Accounts with login config: ${this.accounts.filter(a => a.hasLoginConfig).length}`);
    this.logger.info(`Auto-login instances: ${this.autoLoginInstances.size}`);

    if (this.cookieCheckResults.size > 0) {
      this.logger.info('\nCookie Status:');
      const statusCounts = {};
      for (const [accountId, result] of this.cookieCheckResults.entries()) {
        const status = result.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }

      for (const [status, count] of Object.entries(statusCounts)) {
        this.logger.info(`  ${status}: ${count} accounts`);
      }
    }

    // Check directory sizes
    this.checkDirectorySizes();
  }

  async checkDirectorySizes() {
    try {
      const dirs = [
        { name: 'logs', path: this.logsDir },
        { name: 'temp', path: this.tempDir },
        { name: 'backups', path: this.backupDir }
      ];

      this.logger.info('\nDirectory Sizes:');

      for (const dir of dirs) {
        try {
          const size = await this.getDirectorySize(dir.path);
          this.logger.info(`  ${dir.name}: ${Math.round(size / 1024 / 1024)} MB`);
        } catch (error) {
          this.logger.info(`  ${dir.name}: Error reading directory`);
        }
      }
    } catch (error) {
      this.logger.error('Error checking directory sizes:', error.message);
    }
  }

  async getDirectorySize(dirPath) {
    let totalSize = 0;

    try {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory doesn't exist or is empty
    }

    return totalSize;
  }
}

// CLI interface
async function main() {
  const maintenance = new MaintenanceManager();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.info('FacebookPro Blaster Maintenance System Usage:');
    logger.info('  node maintenance.js auto-maintenance');
    logger.info('  node maintenance.js check-cookies');
    logger.info('  node maintenance.js refresh-cookies');
    return;
  }

  const command = args[0];

  try {
    await maintenance.initialize();

    switch (command) {
      case 'auto-maintenance': await maintenance.autoMaintenance(); break;
      case 'check-cookies': await maintenance.checkCookieExpiry(); break;
      case 'refresh-cookies': await maintenance.refreshExpiredCookies(); break;
      case 'cleanup-logs': await maintenance.cleanupLogs(parseInt(args[1]) || 7); break;
      case 'cleanup-temp': await maintenance.cleanupTempFiles(); break;
      case 'daily-report': await maintenance.generateDailyReport(); break;
      case 'status': maintenance.getMaintenanceStatus(); break;
      default: logger.info(`Unknown command: ${command}`);
    }
  } catch (error) {
    logger.error('Error:', error.message);
  }
}

async function runMaintenance(command, args = []) {
  const maintenance = new MaintenanceManager();
  await maintenance.initialize();

  switch (command) {
    case 'auto-maintenance': await maintenance.autoMaintenance(); break;
    case 'check-cookies': await maintenance.checkCookieExpiry(); break;
    case 'refresh-cookies': await maintenance.refreshExpiredCookies(); break;
    case 'cleanup-logs': await maintenance.cleanupLogs(parseInt(args[0]) || 7); break;
    case 'cleanup-temp': await maintenance.cleanupTempFiles(); break;
    case 'daily-report': await maintenance.generateDailyReport(); break;
    case 'status': maintenance.getMaintenanceStatus(); break;
    default: logger.info(`Unknown command: ${command}`);
  }
}

if (require.main === module) {
  // Check license before running
  const { ensureLicense } = require('./sys-core');
  ensureLicense('Maintenance System').then(() => {
    main();
  }).catch(error => {
    this.logger.error('\n❌ License Error:', error.message);
    process.exit(1);
  });
}

module.exports = { MaintenanceManager, runMaintenance };
