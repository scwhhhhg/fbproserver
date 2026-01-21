// ============================================================================
// CUSTOM MODULE LOADER - Decrypt encrypted files on-the-fly
// ============================================================================
const Module = require('module');
const crypto = require('crypto');
const fsSync = require('fs');
const path = require('path');

// Cache for decrypted modules
const decryptedModuleCache = new Map();

// Original require
const originalRequire = Module.prototype.require;

// Override Module.prototype.require
Module.prototype.require = function (id) {
  // Only intercept local requires (starting with ./  or ../)
  if (!id.startsWith('./') && !id.startsWith('../')) {
    return originalRequire.apply(this, arguments);
  }

  // Try to resolve the path - first with .js, then without
  let resolvedPath;
  try {
    resolvedPath = Module._resolveFilename(id, this);
  } catch (err) {
    // If resolution failed, try without .js extension (for encrypted files)
    const dirname = path.dirname(this.filename);

    const basename = path.basename(id, '.js');
    resolvedPath = path.join(dirname, basename);

    // Check if file exists without extension
    if (!fsSync.existsSync(resolvedPath)) {
      // File doesn't exist, use original require
      return originalRequire.apply(this, arguments);
    }
  }

  // Check if already cached
  if (decryptedModuleCache.has(resolvedPath)) {
    return decryptedModuleCache.get(resolvedPath);
  }

  // Try to read the file
  try {
    const content = fsSync.readFileSync(resolvedPath, 'utf8');

    // Check if file is encrypted (hex format)
    const isEncrypted = /^[0-9a-f]+$/i.test(content.trim());

    if (isEncrypted) {
      // File is encrypted, decrypt it
      const decrypted = decryptModuleContent(content);

      // Create a new module and compile the decrypted code
      const newModule = new Module(resolvedPath, this);
      newModule.filename = resolvedPath;
      newModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath));

      // Compile the decrypted code
      newModule._compile(decrypted, resolvedPath);

      // Cache the module
      decryptedModuleCache.set(resolvedPath, newModule.exports);

      return newModule.exports;
    } else {
      // Plain wrapper or other file. Let original require handle it by path.
      // This is SAFEST for bytecode (.jsc) and plain wrappers.
      const result = originalRequire.call(this, resolvedPath);
      decryptedModuleCache.set(resolvedPath, result);
      return result;
    }
  } catch (err) {
    // If file doesn't exist or can't be read, fall through to original require
  }

  // Not encrypted or error, use original require
  return originalRequire.apply(this, arguments);
};

// Decrypt function for modules
function decryptModuleContent(encryptedHex) {
  try {
    // Get encryption keys
    const keys = getEncryptionKeysSync();
    if (!keys) {
      throw new Error('Encryption keys not available');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', keys.key, keys.iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt module: ${error.message}`);
  }
}

// Synchronous version of getEncryptionKeys (for module loading)
function getEncryptionKeysSync() {
  // Try environment variables first (for development)
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_IV) {
    return {
      key: Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
      iv: Buffer.from(process.env.ENCRYPTION_IV, 'hex')
    };
  }

  // Production: hardcoded keys (standard build)
  // Keys derived from secure vault
  const PRODUCTION_KEY = '9dfcba7489ac7d654103c6e9d97d7466daa96738c6b306488e79a8f3f9e7c97a';
  const PRODUCTION_IV = '077c6a622b823f8b65d97d7466daa968';

  return {
    key: Buffer.from(PRODUCTION_KEY, 'hex'),
    iv: Buffer.from(PRODUCTION_IV, 'hex')
  };
}

// ============================================================================
// END CUSTOM MODULE LOADER
// ============================================================================

const fs = require("fs").promises;
const { spawn } = require("child_process");
const { ensureLicense, getLicenseInfo, getMachineHwid } = require('./sys-core'); // License management
const { createLogger } = require('./logger'); // Centralized logging


// Bun compiled detection
const isCompiled = path.basename(process.execPath).endsWith('.exe') &&
  !process.execPath.toLowerCase().includes('node.exe') &&
  !process.execPath.toLowerCase().includes('bun.exe');

// Helper to get executable and its arguments for spawning
const getExecContext = (args = []) => {
  if (isCompiled) {
    return { path: process.execPath, args };
  } else {
    // In production, we are loaded by the 'start' script in the parent directory
    // In dev, we are usually run directly as 'node executor.js'
    const startScript = path.join(__dirname, '..', 'start');
    const scriptPath = fsSync.existsSync(startScript) ? startScript : __filename;

    return { path: process.execPath, args: [scriptPath, ...args] };
  }
};

// Robust Argument Parser for both Node and Bun Binary
function getAppArguments() {
  let rawArgs = process.argv.slice(1);

  if (!isCompiled) {
    // In Node.js: [node, script.js, cmd, ...] -> slice(1) gives [script.js, cmd, ...]
    // We need to skip the script.js
    return rawArgs.slice(1);
  }

  // In Bun Binary: [exe, ?internal_path?, cmd, ...]
  // We need to skip anything that looks like a path pointing to our entry point
  return rawArgs.filter(arg => {
    if (!arg) return false;
    // Skip virtual Bun paths
    if (arg.includes('~BUN')) return false;
    // Skip internal entry points
    if (arg === __filename || arg.endsWith('executor.js')) return false;
    // Skip the executable's own path if it sneaks in
    if (arg === process.execPath) return false;
    return true;
  });
}

// --- HARDCODED VAULT CREDENTIALS (PRODUCTION) ---
// Credentials are Base64 encoded for additional security
// These are read-only credentials, safe even if discovered
const _decode = (s) => Buffer.from(s, 'base64').toString('utf8');
process.env.VAULT_ADDR = process.env.VAULT_ADDR || _decode('aHR0cHM6Ly9vcGVuYmFvLXByb2R1Y3Rpb24tMTg4NC51cC5yYWlsd2F5LmFwcA==');
process.env.VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || _decode('ZmJwcm9ibGFzdGVy');
process.env.VAULT_ROLE_ID = process.env.VAULT_ROLE_ID || _decode('MjAwZGZhZTktMzQyNS03MmI5LWMxYzUtYzdlNjQ4OTIzZWUy');
process.env.VAULT_SECRET_ID = process.env.VAULT_SECRET_ID || _decode('ZjYzYmRjMzYtNDk3OS0xOTg3LTdjZTMtYzBhNTVkMTZhMjEw');






// OpenBao removed - no longer used

// Helper function to format date as DD-MM-YYYY
function formatDate(dateString) {
  if (!dateString || dateString === 'never' || dateString === 'Never') return 'Never';
  try {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return dateString;
  }
}

// Note: Airtable credentials functions removed - now using Supabase
// ---------------------------------------------------------------------------------


// Embedded HWID Service Logic with Supabase (Cacheable)
let cachedHwid = null;
async function getMachineHwidCached() {
  if (cachedHwid) return cachedHwid;
  try {
    cachedHwid = await getMachineHwid();
    return cachedHwid;
  } catch (error) {
    return null;
  }
}

// Supabase Database Manager
function getDatabase() {
  const { getSupabaseManager } = require('./clouddb-manager');
  const db = getSupabaseManager();
  // Connection will happen on first query via ensureInitialized
  return db;
}

async function getHwidRecord(hwid) {
  try {
    const db = getDatabase();
    const record = await db.getHwidRecord(hwid);
    return record;
  } catch (error) {
    console.error('[HWID] Error getting record:', error.message);
    return null;
  }
}

async function createHwidRecord(hwid, licenseKey, deviceName = null) {
  try {
    const db = getDatabase();
    const record = await db.createHwidRecord(hwid, licenseKey, deviceName);
    console.log(`[HWID] Device registered: ${deviceName || 'Unknown'}`);
    return record;
  } catch (error) {
    console.error('[HWID] Error creating record:', error.message);
    throw error;
  }
}

async function isHwidActive(hwid) {
  try {
    const record = await getHwidRecord(hwid);
    if (!record) return false;
    return record.active === true;
  } catch (error) {
    console.error('[HWID] Error checking HWID:', error.message);
    return false;
  }
}

async function getHwidsByLicense(licenseKey) {
  try {
    const db = getDatabase();
    const records = await db.getHwidsByLicense(licenseKey);
    return records;
  } catch (error) {
    console.error('[HWID] Error getting devices:', error.message);
    return [];
  }
}

async function deleteHwidRecord(hwid) {
  try {
    const db = getDatabase();
    await db.deleteHwidRecord(hwid);
    console.log(`[HWID] Device removed: ${hwid}`);
    return true;
  } catch (error) {
    console.error('[HWID] Error deleting record:', error.message);
    return false;
  }
}

async function isHwidActiveAndLicensed(hwid, licenseKey, licenseType) {
  // SKIP HWID VALIDATION: If environment variable is set (for production VPS with network issues)
  if (process.env.SKIP_HWID_VALIDATION === 'true') {
    console.log('[INFO] ⚠️  HWID validation skipped (SKIP_HWID_VALIDATION=true)');
    console.log('[INFO] ℹ️  Device assumed active (use only if HWID already registered in Airtable)');
    return true;
  }

  // Shorten HWID for display (first 8 + last 8 chars)
  const shortHwid = `${hwid.substring(0, 8)}...${hwid.substring(hwid.length - 8)}`;

  const record = await getHwidRecord(hwid);
  if (!record) {
    // If HWID doesn't exist, check limits based on license type (from website pricing)
    if (licenseType === 'STARTER') {
      const records = await getHwidsByLicense(licenseKey);

      const limit = 2;
      if (records.length >= limit) {
        console.log(`[WARN] ${licenseType} license device limit reached (${records.length}/${limit})`);
        return false;
      }
    } else if (licenseType === 'PRO') {
      const records = await getHwidsByLicense(licenseKey);

      const limit = 5;
      if (records.length >= limit) {
        console.log(`[WARN] PRO license device limit reached (${records.length}/${limit})`);
        return false;
      }
    } else if (licenseType === 'AGENCY') {
      const records = await getHwidsByLicense(licenseKey);

      const limit = 15;
      if (records.length >= limit) {
        console.log(`[WARN] AGENCY license device limit reached (${records.length}/${limit})`);
        return false;
      }
    }

    // Create new HWID record
    const newRecord = await createHwidRecord(hwid, licenseKey, require('os').hostname());
    if (newRecord) {
      return newRecord.active;
    } else {
      console.error(`[ERROR] Failed to activate device`);
      return false;
    }
  }

  // Check if existing HWID is active
  return record.active === true;
}
// End Embedded Services


// --- Encryption Keys from Supabase ---
let cachedEncryptionKeys = null;

async function getEncryptionKeys() {
  if (cachedEncryptionKeys) {
    return cachedEncryptionKeys;
  }

  const { getSupabaseManager } = require('./clouddb-manager');
  const supabase = getSupabaseManager();

  try {
    const keys = await supabase.getEncryptionKeys();
    if (keys && keys.key && keys.iv) {
      cachedEncryptionKeys = keys;
      console.log('[INFO] Using encryption keys from CloudDB');
      return keys;
    }
  } catch (error) {
    console.warn('[WARN] Failed to get encryption keys from CloudDB:', error.message);
  }

  // Fallback to environment variables (for development)
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_IV) {
    console.log('[INFO] Using environment variable encryption keys');
    cachedEncryptionKeys = {
      key: Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
      iv: Buffer.from(process.env.ENCRYPTION_IV, 'hex')
    };
    return cachedEncryptionKeys;
  }

  return null;
}

async function decrypt(encryptedText) {
  try {
    const keys = await getEncryptionKeys();
    if (!keys) {
      throw new Error('Encryption keys not available');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', keys.key, keys.iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // Decryption failed
    throw new Error("Failed to decrypt bot script. The encryption key may be incorrect or file is corrupted.");
  }
}
// --- End of Decryption Section ---


// Decryption removed - no longer needed with Supabase RLS


// Dynamic Base Path for Binary Support
// isCompiled already defined above
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;

// Detect folder structure: check if accounts is sibling or local
let accountsPath = path.join(basePath, "../accounts");
if (isCompiled && !fsSync.existsSync(accountsPath)) {
  accountsPath = path.join(basePath, "./accounts");
}

const ACCOUNTS_DIR = accountsPath;
const LOGS_DIR = path.join(basePath, isCompiled && !fsSync.existsSync(path.join(basePath, "../logs")) ? "./logs" : "../logs");
const TEMP_DIR = path.join(basePath, isCompiled && !fsSync.existsSync(path.join(basePath, "../temp")) ? "./temp" : "../temp");
const DATA_DIR = path.join(basePath, isCompiled && !fsSync.existsSync(path.join(basePath, "../data")) ? "./data" : "../data");
let notify;
try {
  notify = require('./notify');
} catch (error) {
  // Notify module failed to load, using dummy functions
  console.log('[WARNING] Notify module failed to load, continuing without notifications');
  notify = {
    success: async () => ({ success: false, reason: 'notify_disabled' }),
    error: async () => ({ success: false, reason: 'notify_disabled' }),
    warning: async () => ({ success: false, reason: 'notify_disabled' }),
    info: async () => ({ success: false, reason: 'notify_disabled' }),
    cookieStatus: async () => ({ success: false, reason: 'notify_disabled' }),
    systemAlert: async () => ({ success: false, reason: 'notify_disabled' })
  };
}

class BotExecutor {
  constructor() {
    this.accountsDir = ACCOUNTS_DIR;
    this.logsDir = LOGS_DIR;
    this.tempDir = TEMP_DIR;
    this.pendingTasks = new Set();

    this.accounts = [];
    this.runningProcesses = new Map();
    this.accountLocks = new Map();
    this.accountQueues = new Map();
    this.taskQueue = []; // Legacy queue - will be deprecated
    this.cookieCheckResults = new Map();
    this.cookieGenerators = new Map();

    // Initialize centralized logger
    this.logger = createLogger('executor');

    // VPS Detection
    this.isVPS = !process.env.DISPLAY && !process.env.XDG_CURRENT_DESKTOP;

    // Configuration with VPS-aware defaults
    this.config = {
      maxConcurrentPerAccount: parseInt(process.env.MAX_CONCURRENT_PER_ACCOUNT) || 1,
      maxConcurrentGlobal: parseInt(process.env.MAX_CONCURRENT_GLOBAL) || (this.isVPS ? 2 : 3),
      defaultDelayBetweenAccounts: 30,
      cookieValidationInterval: 30 * 60 * 1000,
      autoRefreshCookies: true,

      // Enhanced queue management
      queueTimeout: parseInt(process.env.QUEUE_TIMEOUT) || 300000, // 5 minutes
      enableRotation: process.env.ENABLE_ROTATION !== 'false',
      queuePriorityEnabled: process.env.QUEUE_PRIORITY_ENABLED !== 'false',
      accountRotationCooldown: parseInt(process.env.ACCOUNT_ROTATION_COOLDOWN) || 60000, // 1 minute

      // VPS-specific configuration
      vps: {
        enabled: this.isVPS,
        maxMemoryMB: 1024,
        browserTimeout: 120000,
        navigationTimeout: 90000,
        pageLoadTimeout: 60000,
        retryAttempts: 3,
        retryDelay: 5000,
        enableMemoryMonitoring: true,
        enableResourceBlocking: true,
        reducedViewport: true,
        forceGarbageCollection: true
      }
    };

    // Initialize enhanced queue management (Lazy Loaded)
    this.queueManager = null;
    this.accountRotation = null;
    this.notify = null; // Lazy loaded notification manager

    this.processing = false;
    this.memoryStats = { peak: 0, current: 0 };

    // Start VPS monitoring if on VPS
    if (this.isVPS && this.config.vps.enableMemoryMonitoring) {
      this.startMemoryMonitoring();
    }
  }

  // --- LICENSE CHECK FUNCTION ---
  async checkLicense() {
    try {
      // Use license-manager to ensure license is activated
      // Using silent mode for internal deep check
      const licenseInfo = await ensureLicense('FacebookPro Blaster Bot', true);

      const licensedTo = licenseInfo.name || licenseInfo.email || licenseInfo.owner || 'Unknown';
      const licenseType = (licenseInfo.licenseType || 'UNKNOWN').toUpperCase();

      this.licenseKey = licenseInfo.licenseKey;
      this.licenseType = licenseType;
      this.hwid = licenseInfo.hwid;

      return { key: licenseInfo.licenseKey, type: licenseType, info: licenseInfo };
    } catch (error) {
      this.logger.error(`License check failed: ${error.message}`);
      process.exit(1);
    }
  }
  // --- END LICENSE CHECK FUNCTION ---

  // VPS OPTIMIZATION: Memory monitoring
  startMemoryMonitoring() {
    setInterval(() => {
      const used = process.memoryUsage();
      const currentMB = Math.round(used.heapUsed / 1024 / 1024);

      this.memoryStats.current = currentMB;
      if (currentMB > this.memoryStats.peak) {
        this.memoryStats.peak = currentMB;
      }

      // Force garbage collection if memory is high
      if (this.config.vps.forceGarbageCollection &&
        currentMB > this.config.vps.maxMemoryMB * 0.8) {
        if (global.gc) {
          this.getLogger('system', 'memory').warn(`High memory: ${currentMB}MB, forcing GC...`);
          global.gc();
        }
      }

      // Log warning if memory exceeds limit
      if (currentMB > this.config.vps.maxMemoryMB) {
        this.getLogger('system', 'memory').warn(`Memory exceeded: ${currentMB}MB / ${this.config.vps.maxMemoryMB}MB`);
      }
    }, 30000); // Check every 30 seconds
  }

  // Get logger for specific account/bot context
  getLogger(accountId, botName = null) {
    const context = botName ? `${accountId}/${botName}` : accountId;
    return this.logger.child(context);
  }

  // Helper method to get formatted timestamp (for backward compatibility)
  formatTime() {
    return this.logger.getTimestamp();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // VPS OPTIMIZATION: Enhanced retry mechanism with exponential backoff
  async retryOperation(operation, maxRetries = 3, baseDelay = 2000, accountId = 'system') {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        this.getLogger(accountId, 'retry').warn(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);

        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff with jitter
        const delayTime = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        this.getLogger(accountId, 'retry').info(`Retrying in ${Math.round(delayTime)}ms...`);
        await this.delay(delayTime);

        // Force garbage collection between retries
        if (global.gc && this.config.vps.forceGarbageCollection) {
          global.gc();
        }
      }
    }
  }

  // VPS OPTIMIZATION: Safe navigation with multiple fallback strategies
  async navigateToUrlSafely(page, url, accountId = 'system', options = {}) {
    const maxRetries = options.maxRetries || this.config.vps.retryAttempts;
    const timeout = options.timeout || this.config.vps.navigationTimeout;

    this.getLogger(accountId, 'navigation').info(`Navigating to: ${url}`);

    const strategies = [
      {
        name: 'networkidle2',
        waitUntil: 'networkidle2',
        timeout: timeout
      },
      {
        name: 'networkidle0',
        waitUntil: 'networkidle0',
        timeout: timeout * 0.8
      },
      {
        name: 'load',
        waitUntil: 'load',
        timeout: timeout * 0.6
      },
      {
        name: 'domcontentloaded',
        waitUntil: 'domcontentloaded',
        timeout: timeout * 0.5
      }
    ];

    for (const strategy of strategies) {
      try {
        this.getLogger(accountId, 'navigation').info(`Trying ${strategy.name}...`);

        await page.goto(url, {
          waitUntil: strategy.waitUntil,
          timeout: strategy.timeout
        });

        // Verify page loaded
        await page.waitForFunction(
          () => document.readyState === 'complete' || document.readyState === 'interactive',
          { timeout: 10000 }
        ).catch(() => { }); // Ignore timeout on verification

        this.getLogger(accountId, 'navigation').success(`Success with ${strategy.name}`);
        return true;

      } catch (error) {
        this.getLogger(accountId, 'navigation').warn(`${strategy.name} failed: ${error.message}`);
        await this.delay(2000);
      }
    }

    throw new Error(`All navigation strategies failed for ${url}`);
  }

  // VPS OPTIMIZATION: Enhanced browser launch options
  getBrowserLaunchOptions(botName = 'default') {
    const baseArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // CRITICAL for VPS!
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-features=VizDisplayCompositor",
      "--no-first-run",
      "--no-zygote",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-accelerated-2d-canvas",
      "--disable-accelerated-video-decode"
    ];

    // Aggressive VPS optimizations
    const vpsArgs = [
      "--single-process", // Critical for memory
      "--disable-extensions",
      "--disable-plugins",
      "--memory-pressure-off",
      "--max_old_space_size=1024",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--disable-hang-monitor",
      "--disable-prompt-on-repost",
      "--disable-domain-reliability",
      "--disable-component-update",
      "--disable-client-side-phishing-detection",
      "--no-pings",
      "--dns-prefetch-disable",
      "--disable-logging",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--disable-metrics",
      "--disable-metrics-reporting",
      "--force-device-scale-factor=1"
    ];

    const launchOptions = {
      headless: 'new', // Use new headless mode
      args: this.isVPS ? [...baseArgs, ...vpsArgs] : baseArgs,
      defaultViewport: this.config.vps.reducedViewport ?
        { width: 1280, height: 720 } :
        { width: 1366, height: 768 },
      ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features'],
      ignoreHTTPSErrors: true,
      protocolTimeout: this.config.vps.browserTimeout,
      timeout: this.config.vps.browserTimeout,
      pipe: this.isVPS, // More stable on VPS
      dumpio: false, // Don't dump stdio
      slowMo: this.isVPS ? 50 : 0
    };

    // Browser configuration loaded

    return launchOptions;
  }

  async initialize(skipLicenseCheck = false) {
    const isLean = process.env.LEAN_WORKER === 'true';

    if (isLean) {
      // Minimal init for workers
      await this.createDirectories();
      return null;
    }

    const time = this.formatTime();

    process.stdout.write('⚙️  Loading system components... ');
    await this.createDirectories();
    process.stdout.write('OK\n');

    // Parallel Account Loading (DB init is now on-demand)
    process.stdout.write('📡 Initializing storage... ');
    await this.loadAccounts();
    process.stdout.write('OK\n');

    // Only check license if not skipping
    let licenseInfo = null;
    if (!skipLicenseCheck) {
      process.stdout.write('🔐 Verifying access... ');
      try {
        licenseInfo = await this.checkLicense();
        this.licenseKey = licenseInfo.key; // Store the key separately if needed
        this.licenseType = licenseInfo.type; // Store the type separately if needed
        process.stdout.write('OK\n');
      } catch (error) {
        process.stdout.write('FAILED\n');
        this.getLogger('system', 'license').error(`License validation error: ${error.message}`);
        process.exit(1);
      }
    }

    process.stdout.write('🤖 Initializing bots... ');
    await this.initializeCookieGenerators();
    process.stdout.write('OK\n\n');

    return licenseInfo;
  }

  async createDirectories() {
    for (const dir of [this.accountsDir, this.logsDir, this.tempDir]) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async loadAccounts() {
    this.accounts = [];
    try {
      const accountDirs = await fs.readdir(this.accountsDir);

      for (const accountId of accountDirs) {
        const accountPath = path.join(this.accountsDir, accountId);
        const stat = await fs.stat(accountPath);

        if (stat.isDirectory()) {
          try {
            // Load main account config
            const configPath = path.join(accountPath, "config.json");
            const configContent = await fs.readFile(configPath, "utf8");
            const config = JSON.parse(configContent);

            // Load bot configs from separate files
            const botsPath = path.join(accountPath, "bots");
            let bots = {};

            try {
              const botFiles = await fs.readdir(botsPath);

              for (const botFile of botFiles) {
                if (botFile.endsWith('.json')) {
                  const botName = path.basename(botFile, '.json');
                  const botConfigPath = path.join(botsPath, botFile);
                  const botConfigContent = await fs.readFile(botConfigPath, "utf8");
                  const botConfig = JSON.parse(botConfigContent);

                  bots[botName] = botConfig;
                }
              }
            } catch (error) {
              // No bots directory
            }

            // If no separate bot configs found, try to load from main config (backward compatibility)
            if (Object.keys(bots).length === 0 && config.bots) {
              bots = config.bots;
            }

            const cookiesPath = path.join(accountPath, "cookies.json");
            const hasCookies = fsSync.existsSync(cookiesPath);

            const loginConfigPath = path.join(accountPath, "facebook_login.json");
            const hasLoginConfig = fsSync.existsSync(loginConfigPath);

            this.accounts.push({
              id: accountId,
              config: { ...config, bots }, // Merge main config with bot configs
              path: accountPath,
              hasCookies,
              hasLoginConfig,
              enabled: config.enabled !== false,
              isHealthy: true
            });

            this.cookieCheckResults.set(accountId, {
              isValid: false,
              checkedAt: 0,
              status: 'unknown',
              canAutoRefresh: hasLoginConfig
            });
          } catch (error) {
            // Warning
          }
        }
      }
    } catch (error) {
      // No accounts directory
    }

    // TRIAL License Enforcement: STRICTLY limit to 1 account
    if (this.licenseType === 'TRIAL') {
      const enabledAccounts = this.accounts.filter(acc => acc.enabled);

      if (enabledAccounts.length > 1) {
        this.logger.warn('═══════════════════════════════════════════════════════');
        this.logger.warn('  🎁 TRIAL LICENSE: Auto-limiting to 1 account');
        this.logger.warn('═══════════════════════════════════════════════════════');
        this.logger.warn(`  Found: ${enabledAccounts.length} enabled accounts`);
        this.logger.warn(`  TRIAL limit: 1 account only`);
        this.logger.warn('');
        this.logger.warn(`  ✅ Keeping: ${enabledAccounts[0].id}`);
        this.logger.warn(`  ❌ Auto-disabled: ${enabledAccounts.slice(1).map(a => a.id).join(', ')}`);
        this.logger.warn('');
        this.logger.warn('  📢 To use other accounts, upgrade your license:');
        this.logger.warn('  • STARTER: 5 accounts, 2 devices, 1 year');
        this.logger.warn('  • PRO: 15 accounts, 5 devices, 2 years ⭐');
        this.logger.warn('  • AGENCY: 50 accounts, unlimited devices, 2 years');
        this.logger.warn('');
        this.logger.warn('  🛒 https://fbpro-blaster.vercel.app/#pricing');
        this.logger.warn('═══════════════════════════════════════════════════════');

        // Auto-disable extra accounts (keep only first one)
        for (let i = 1; i < enabledAccounts.length; i++) {
          enabledAccounts[i].enabled = false;
        }

        // Update this.accounts to reflect disabled status
        this.accounts = this.accounts.map(acc => {
          const disabled = enabledAccounts.slice(1).find(ea => ea.id === acc.id);
          if (disabled) {
            return { ...acc, enabled: false };
          }
          return acc;
        });
      }

      // Show TRIAL info
      const activeAccount = this.accounts.find(acc => acc.enabled);
      if (activeAccount) {
        this.logger.info(`🎁 TRIAL license active: ${activeAccount.id} (1/1 account, max 3 days)`);
      }
    }
  }

  async initializeCookieGenerators() {
    const { CookieGenerator } = require('./cookiegenerator');
    this.cookieGenerators = new Map();
    for (const account of this.accounts) {
      if (account.hasLoginConfig) {
        try {
          const generator = new CookieGenerator(account.id);
          await generator.initialize();
          this.cookieGenerators.set(account.id, generator);
        } catch (error) {
          // Cookie generator failed
        }
      }
    }
  }

  async validateAccountCookies(accountId) {
    try {
      const generator = this.cookieGenerators.get(accountId);
      if (!generator) {
        return await this.manualCookieCheck(accountId);
      }

      const result = await generator.checkCookieValidity();

      this.cookieCheckResults.set(accountId, {
        isValid: result.valid,
        checkedAt: Date.now(),
        status: result.valid ? 'valid' : result.reason,
        factual: result.factual,
        percentage: result.percentage,
        canAutoRefresh: true
      });

      return result.valid;
    } catch (error) {
      this.getLogger(accountId, 'validation').error(`Cookie validation error: ${error.message}`);
      this.cookieCheckResults.set(accountId, {
        isValid: false,
        checkedAt: Date.now(),
        status: 'error',
        error: error.message,
        canAutoRefresh: false
      });
      return false;
    }
  }

  async manualCookieCheck(accountId) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account || !account.hasCookies) {
      this.cookieCheckResults.set(accountId, {
        isValid: false,
        checkedAt: Date.now(),
        status: 'no_setup',
        canAutoRefresh: false
      });
      return false;
    }

    try {
      const cookiesPath = path.join(account.path, "cookies.json");
      const cookies = JSON.parse(await fs.readFile(cookiesPath, "utf8"));
      const now = Date.now() / 1000;

      const validCookies = cookies.filter(cookie => {
        return !cookie.expirationDate || cookie.expirationDate > now;
      });

      const isValid = validCookies.length > cookies.length * 0.7;

      this.cookieCheckResults.set(accountId, {
        isValid,
        checkedAt: Date.now(),
        status: isValid ? 'valid_manual' : 'expired_manual',
        factual: false,
        canAutoRefresh: false
      });

      return isValid;
    } catch (error) {
      return false;
    }
  }

  async ensureValidCookies(accountId) {
    try {
      const generator = this.cookieGenerators.get(accountId);
      if (!generator) {
        throw new Error('No cookie generator');
      }

      this.getLogger(accountId, 'cookies').info('Refreshing cookies...');
      const success = await generator.ensureValidCookies();

      if (success) {
        this.cookieCheckResults.set(accountId, {
          isValid: true,
          checkedAt: Date.now(),
          status: 'refreshed',
          canAutoRefresh: true
        });

        const account = this.accounts.find(a => a.id === accountId);
        if (account) {
          account.hasCookies = true;
          account.isHealthy = true;
        }

        this.getLogger(accountId, 'cookies').success('Cookies refreshed successfully');
        if (!this.notify) {
          const notify = require('./notify');
          this.notify = notify;
        }
        await this.notify.cookieStatus(accountId, 'refreshed', 'Auto-refresh successful');
      } else {
        this.getLogger(accountId, 'cookies').error('Failed to refresh cookies');
        if (!this.notify) {
          const notify = require('./notify');
          this.notify = notify;
        }
        await this.notify.cookieStatus(accountId, 'invalid', 'Auto-refresh failed');
      }

      return success;
    } catch (error) {
      this.getLogger(accountId, 'cookies').error(`Refresh error: ${error.message}`);
      if (!this.notify) {
        const notify = require('./notify');
        this.notify = notify;
      }
      await this.notify.error(accountId, 'cookies', `Refresh failed: ${error.message}`);
      return false;
    }
  }

  async validateAllAccountsCookies() {
    const time = this.formatTime();
    // Validating accounts

    const results = [];

    for (const account of this.accounts) {
      if (!account.enabled) continue;

      if (!account.hasCookies && !account.hasLoginConfig) {
        this.getLogger(account.id, 'validation').warn('No cookies or login config');
        results.push({ accountId: account.id, valid: false, reason: 'no_setup' });
        continue;
      }

      const isValid = await this.validateAccountCookies(account.id);
      results.push({ accountId: account.id, valid: isValid });

      if (isValid) {
        this.getLogger(account.id, 'validation').success('Cookies valid');
      } else {
        this.getLogger(account.id, 'validation').error('Cookies invalid');
      }

      await this.delay(2000);
    }

    const validCount = results.filter(r => r.valid).length;
    if (!this.notify) this.notify = require('./notify');
    await this.notify.systemAlert('validation', `${validCount}/${results.length} accounts valid`);

    return results;
  }

  addToQueue(task) {
    const conflict = this.checkConflict(task);

    if (conflict) {
      task = this.resolveConflict(task, conflict);
    }

    task.priority = task.priority || this.getBotPriority(task.botName);
    task.validateCookies = task.validateCookies !== false;
    task.addedAt = Date.now();

    // Enhanced queue or legacy queue
    if (this.config.queuePriorityEnabled) {
      // Lazy load QueueManager
      if (!this.queueManager) {
        const { QueueManager } = require('./queue-manager');
        this.queueManager = new QueueManager(this.config.maxConcurrentGlobal);
      }
      // Use enhanced QueueManager
      try {
        const priorityStr = this._mapPriorityToString(task.priority);
        this.queueManager.enqueue(task, priorityStr);
        this.getLogger(task.accountId, task.botName).info(`Queued [Enhanced] (Priority ${priorityStr.toUpperCase()})`);
      } catch (error) {
        // Fallback to legacy if queue full
        this.getLogger(task.accountId, task.botName).warn(`Queue full, using legacy: ${error.message}`);
        this._addToLegacyQueue(task);
      }
    } else {
      // Use legacy queue
      this._addToLegacyQueue(task);
    }

    setImmediate(() => this.processQueue());
    return task;
  }

  _addToLegacyQueue(task) {
    const insertIndex = this.taskQueue.findIndex(t => t.priority > task.priority);
    if (insertIndex === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(insertIndex, 0, task);
    }
    this.getLogger(task.accountId, task.botName).info(`Queued [Legacy] (Priority ${task.priority})`);
  }

  _mapPriorityToString(priority) {
    if (priority >= 3) return 'high';
    if (priority <= 1) return 'low';
    return 'normal';
  }

  checkConflict(task) {
    for (const info of this.runningProcesses.values()) {
      if (info.accountId === task.accountId) {
        return {
          type: 'account_running',
          reason: `${task.accountId} running ${info.botName}`
        };
      }
    }

    const duplicate = this.taskQueue.find(t =>
      t.accountId === task.accountId && t.botName === task.botName
    );

    if (duplicate) {
      return {
        type: 'duplicate',
        reason: `${task.accountId}/${task.botName} already queued`
      };
    }

    return null;
  }

  resolveConflict(task, conflict) {
    if (conflict.type === 'account_running') {
      task.priority = Math.max(1, task.priority - 1);
      task.delayUntil = Date.now() + (2 * 60 * 1000);
    } else if (conflict.type === 'duplicate') {
      task.priority += 1;
      task.delayUntil = Date.now() + (5 * 60 * 1000);
    }
    return task;
  }

  async processQueue() {
    if (this.processing || this.runningProcesses.size >= this.config.maxConcurrentGlobal) {
      return;
    }

    this.processing = true;

    try {
      // Determine which queue to use
      const useEnhancedQueue = this.config.queuePriorityEnabled;

      while (this.runningProcesses.size < this.config.maxConcurrentGlobal) {
        // Get next task from appropriate queue
        let task;
        if (useEnhancedQueue) {
          if (!this.queueManager) {
            const { QueueManager } = require('./queue-manager');
            this.queueManager = new QueueManager(this.config.maxConcurrentGlobal);
          }
          task = this.queueManager.dequeue();
        } else {
          task = this.taskQueue.shift();
        }

        if (!task) break; // No more tasks

        const pendingKey = `${task.accountId}_${task.botName}`;
        this.pendingTasks.add(pendingKey);

        try {
          // Check delay
          if (task.delayUntil && Date.now() < task.delayUntil) {
            // Re-queue task
            if (useEnhancedQueue) {
              if (!this.queueManager) {
                const { QueueManager } = require('./queue-manager');
                this.queueManager = new QueueManager(this.config.maxConcurrentGlobal);
              }
              await this.queueManager.enqueueDelayed(task, task.delayUntil - Date.now());
            } else {
              this.taskQueue.unshift(task);
            }
            break;
          }

          // Check conflicts
          if (this.isTaskConflicted(task)) {
            // Re-queue task
            if (useEnhancedQueue) {
              if (!this.queueManager) {
                const { QueueManager } = require('./queue-manager');
                this.queueManager = new QueueManager(this.config.maxConcurrentGlobal);
              }
              await this.queueManager.enqueueDelayed(task, 5000); // Retry in 5 seconds
            } else {
              this.taskQueue.unshift(task);
            }
            break;
          }

          // Validate cookies if needed
          if (task.validateCookies) {
            const cookieResult = this.cookieCheckResults.get(task.accountId);
            const needsValidation = !cookieResult ||
              !cookieResult.isValid ||
              (Date.now() - cookieResult.checkedAt > this.config.cookieValidationInterval);

            if (needsValidation) {
              // Validating cookies
              const isValid = await this.validateAccountCookies(task.accountId);

              if (!isValid && this.config.autoRefreshCookies) {
                const account = this.accounts.find(a => a.id === task.accountId);
                if (account && account.hasLoginConfig) {
                  const refreshed = await this.ensureValidCookies(task.accountId);

                  if (!refreshed) {
                    task.retries = (task.retries || 0) + 1;
                    if (task.retries < 3) {
                      task.delayUntil = Date.now() + (10 * 60 * 1000);

                      // Re-queue with delay
                      if (useEnhancedQueue) {
                        if (!this.queueManager) {
                          const { QueueManager } = require('./queue-manager');
                          this.queueManager = new QueueManager(this.config.maxConcurrentGlobal);
                        }
                        await this.queueManager.enqueueDelayed(task, 10 * 60 * 1000);
                      } else {
                        this.taskQueue.push(task);
                      }
                      // Cookie refresh failed
                    } else {
                      // Max retries reached
                      if (!this.notify) {
                        const notify = require('./notify');
                        this.notify = notify;
                      }
                      await this.notify.error(task.accountId, task.botName,
                        'Max cookie refresh retries reached');
                    }
                    continue;
                  }
                } else {
                  // Invalid cookies, no auto-refresh
                  if (!this.notify) {
                    const notify = require('./notify');
                    this.notify = notify;
                  }
                  await this.notify.warning(task.accountId, task.botName,
                    'Invalid cookies, manual intervention needed');
                  continue;
                }
              } else if (!isValid) {
                this.getLogger(task.accountId, task.botName).error('Invalid cookies');
                continue;
              }
            }
          }

          // Execute task
          await this.executeTask(task);

          // Track completion for account rotation (if enabled)
          if (this.config.enableRotation) {
            if (!this.accountRotation) {
              const AccountRotation = require('./account-rotation');
              this.accountRotation = new AccountRotation(this.config.accountRotationCooldown);
            }
            this.accountRotation.recordCompletion(task.accountId);
          }
        } finally {
          this.pendingTasks.delete(pendingKey);
        }
      }
    } finally {
      this.processing = false;
    }

    // Check if more tasks to process
    const hasMoreTasks = this.config.queuePriorityEnabled
      ? (this.queueManager ? !this.queueManager.isEmpty() : false)
      : this.taskQueue.length > 0;

    if (hasMoreTasks) {
      setTimeout(() => this.processQueue(), 3000);
    }
  }

  isTaskConflicted(task) {
    for (const [_, info] of this.runningProcesses.entries()) {
      if (info.accountId === task.accountId) return true;
    }
    return false;
  }

  async executeTask(task) {
    console.log(`\n[EXECUTOR DEBUG] executeTask called for ${task.accountId}/${task.botName}`);
    const key = `${task.accountId}_${task.botName}_${Date.now()}`;

    this.accountLocks.set(task.accountId, {
      botName: task.botName,
      taskId: key,
      startTime: Date.now()
    });

    try {
      this.getLogger(task.accountId, task.botName).info('Preparing bot environment...');
      await this.prepareBotEnvironment(task.accountId, task.botName);

      this.getLogger(task.accountId, task.botName).info('Spawning bot process...');
      const process = await this.spawnBotProcess(task.accountId, task.botName);

      this.runningProcesses.set(key, {
        process,
        accountId: task.accountId,
        botName: task.botName,
        startTime: Date.now(),
        task
      });

      this.getLogger(task.accountId, task.botName).info('Bot process started successfully');

      // Send start notification (use systemAlert for better visibility, no rate limit)
      await notify.systemAlert('bot-start', `${task.botName} started for ${task.accountId}`);


      process.on('close', async (code) => {
        const info = this.runningProcesses.get(key);
        this.runningProcesses.delete(key);
        this.accountLocks.delete(task.accountId);

        const runtime = Math.floor((Date.now() - (info?.startTime || Date.now())) / 1000);

        this.getLogger(task.accountId, task.botName).info(`Process exited with code ${code} after ${runtime}s`);

        // Simplified notification logic (no output parsing since stdio is inherited)
        if (code === 0) {
          // Bot completed successfully
          await notify.success(task.accountId, task.botName, `Completed in ${runtime}s`);

        } else if (code === null) {
          // Process was killed
          await notify.warning(task.accountId, task.botName, `Process killed after ${runtime}s`);

        } else {
          // Non-zero exit code
          await notify.error(task.accountId, task.botName, `Exit code ${code} after ${runtime}s`);
        }

        await this.processNextInQueue(task.accountId);
        setImmediate(() => this.processQueue());
      });

      process.on('error', async (error) => {
        this.runningProcesses.delete(key);
        this.accountLocks.delete(task.accountId);

        // Process error

        await notify.error(task.accountId, task.botName,
          `Process error: ${error.message}`);

        await this.processNextInQueue(task.accountId);
        setImmediate(() => this.processQueue());
      });

    } catch (error) {
      this.runningProcesses.delete(key);
      this.accountLocks.delete(task.accountId);

      // Execution error

      await notify.error(task.accountId, task.botName, error.message);
    }
  }

  async processNextInQueue(accountId) {
    const queue = this.accountQueues.get(accountId);
    if (queue && queue.length > 0) {
      const next = queue.shift();

      setImmediate(() => {
        this.executeTask(next).catch(err => {
          this.getLogger(accountId, 'queue').error(`Dequeue error: ${err.message}`);
          this.processNextInQueue(accountId).catch(console.error);
        });
      });
    } else if (queue && queue.length === 0) {
      this.accountQueues.delete(accountId);
    }
  }

  async prepareBotEnvironment(accountId, botName) {
    // MODIFIED: No longer need to copy files to temp directory
    // We'll create a minimal config file with paths to original files

    const account = this.accounts.find(a => a.id === accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);

    // Get bot config from bots directory
    let botConfig;
    try {
      const botConfigPath = path.join(account.path, "bots", `${botName}.json`);
      const botConfigContent = await fs.readFile(botConfigPath, "utf8");
      botConfig = JSON.parse(botConfigContent);
    } catch (error) {
      // Fallback to main config if separate bot config doesn't exist
      botConfig = account.config.bots[botName];
    }

    if (!botConfig) {
      throw new Error(`Bot ${botName} not found in config for ${accountId}`);
    }
    if (!botConfig.enabled) {
      throw new Error(`Bot ${botName} not enabled for ${accountId}`);
    }

    // Create a minimal config file with paths to original files
    const configFileName = `config${botName}.json`;
    const configPath = path.join(this.tempDir, configFileName);

    const botSpecificConfig = {
      ...botConfig,
      timezone: 'Asia/Jakarta',
      autoLogin: {
        enabled: account.hasLoginConfig,
        validate_before_run: true
      },
      // Add paths to original files
      paths: {
        accountDir: account.path,
        cookies: path.join(account.path, "cookies.json"),
        login: path.join(account.path, "facebook_login.json"),
        comments: path.join(account.path, "comments.txt"),
        cta_link: path.join(account.path, "cta_link.txt"),
        gemini_keys: path.join(account.path, "gemini_keys.txt"),
        pexels_keys: path.join(account.path, "pexels_keys.txt"),
        unsplash_keys: path.join(account.path, "unsplash_keys.txt"),
        target_groups: path.join(account.path, "target_groups.txt"),
        reels_urls: path.join(account.path, "reels_urls.txt"),
        openrouter_keys: path.join(account.path, "openrouter_keys.txt"),
        ceklink: path.join(account.path, "ceklink.txt"),
        share_captions: path.join(account.path, "share_captions.txt"),
        memory: path.join(account.path, "memory.json"),
        upload_log: path.join(account.path, "upload_log.txt"),
        log_status: path.join(account.path, "log_status.txt")
      }
    };

    // CRITICAL FIX: Include persona from root config if not in bot config
    if (!botSpecificConfig.persona && account.config.persona) {
      botSpecificConfig.persona = account.config.persona;
      // Persona added from root config
    }

    // Also include name from root config if available
    if (!botSpecificConfig.name && account.config.name) {
      botSpecificConfig.name = account.config.name;
    }
  }

  async spawnBotProcess(accountId, botName) {
    this.getLogger(accountId, botName).info(`Spawning isolated bot process...`);

    // Use master execution context (points to 'start' script in production)
    const context = getExecContext(['bot', botName, accountId]);

    // Spawn the child process
    return spawn(context.path, context.args, {
      env: Object.assign({}, process.env, {
        ACCOUNT_ID: accountId,
        BOT_NAME: botName
      }),
      stdio: 'inherit'
    });
  }

  /**
   * Directly execute a bot script (used by child processes)
   */
  async runBotDirectly(botName, accountId) {
    this.getLogger(accountId, botName).info(`Executing bot logic...`);

    // 1. Try to find the script
    let obfuscatedBotName = botName.replace(/openbao/g, 'vault').replace(/supabase/g, 'clouddb');
    const namesToTry = [botName, obfuscatedBotName];
    const possiblePaths = [];

    for (const name of namesToTry) {
      possiblePaths.push(
        path.join(__dirname, name),
        path.join(__dirname, '..', 'bot', name),
        path.join(process.cwd(), 'bot', name),
        path.join(process.cwd(), name),
        path.join(__dirname, `${name}.js`),
        path.join(__dirname, '..', 'bot', `${name}.js`)
      );
    }

    let botScriptPath = null;
    let scriptContent = null;

    for (const p of possiblePaths) {
      try {
        if (fsSync.existsSync(p) && !fsSync.lstatSync(p).isDirectory()) {
          scriptContent = fsSync.readFileSync(p, 'utf8');
          botScriptPath = p;
          break;
        }
      } catch (e) { }
    }

    if (!botScriptPath) {
      throw new Error(`Bot logic not found for ${botName}`);
    }

    // 2. Check encryption
    const isEncrypted = /^[0-9a-f]+$/i.test(scriptContent.trim());

    if (isEncrypted) {
      this.getLogger(accountId, botName).info('Safe-loading encrypted remote stub');
      const { runRemoteBot } = require('./bot-injector');
      await runRemoteBot(botName);
    } else {
      this.getLogger(accountId, botName).info('Executing local logic');
      const m = new Module(botScriptPath, module);
      m.filename = botScriptPath;
      m.paths = Module._nodeModulePaths(path.dirname(botScriptPath));
      m._compile(scriptContent, botScriptPath);
    }
  }


  async runSingle(accountId, botName, options = {}) {
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);
    if (!account.enabled) throw new Error(`Account ${accountId} disabled`);

    const botConfig = account.config.bots[botName];
    if (!botConfig) {
      throw new Error(`Bot ${botName} not found in config for ${accountId}`);
    }
    if (!botConfig.enabled) {
      throw new Error(`Bot ${botName} not enabled for ${accountId}`);
    }

    const shouldWait = options.wait !== false;

    this.addToQueue({
      accountId,
      botName,
      priority: this.getBotPriority(botName),
      validateCookies: options.validateCookies !== false,
      options
    });

    if (shouldWait) {
      await this.waitForTask(accountId, botName);
    }
  }

  async waitForTask(accountId, botName) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const isRunning = Array.from(this.runningProcesses.values()).some(
          info => info.accountId === accountId && info.botName === botName
        );

        // Check legacy queue
        let isQueued = this.taskQueue.some(
          task => task.accountId === accountId && task.botName === botName
        );

        // Check enhanced queue if enabled
        if (!isQueued && this.config.queuePriorityEnabled) {
          if (!this.queueManager) {
            const { QueueManager } = require('./queue-manager');
            this.queueManager = new QueueManager(this.config.maxConcurrentGlobal);
          }
          const qmQueues = this.queueManager.queue.queues;
          isQueued = Object.values(qmQueues).some(q =>
            q.some(t => t.accountId === accountId && t.botName === botName)
          );
        }

        const isPending = this.pendingTasks.has(`${accountId}_${botName}`);

        if (!isRunning && !isQueued && !isPending) {
          setTimeout(() => {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            // Wait completed
            resolve();
          }, 2000);
        }
      }, 1000);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        // Task timeout
        reject(new Error('Task timeout after 30 minutes'));
      }, 30 * 60 * 1000);
    });
  }

  async runAll(botName, options = {}) {
    const enabled = this.accounts.filter(a =>
      a.enabled && a.config.bots[botName]?.enabled
    );

    if (enabled.length === 0) {
      // No enabled accounts
      return;
    }

    // Running bot for accounts

    for (const account of enabled) {
      this.addToQueue({
        accountId: account.id,
        botName: botName,
        priority: this.getBotPriority(botName),
        validateCookies: options.validateCookies !== false
      });

      if (options.delayBetweenAccounts) {
        await this.delay(options.delayBetweenAccounts * 1000);
      }
    }

    await this.processQueue();
  }

  async runParallel(botName, options = {}) {
    const enabled = this.accounts.filter(a =>
      a.enabled && a.config.bots[botName]?.enabled
    );

    if (enabled.length === 0) {
      // No enabled accounts
      return;
    }

    // Parallel execution for accounts

    const results = await Promise.all(
      enabled.map(async (account) => {
        const valid = await this.validateAccountCookies(account.id);
        return { accountId: account.id, valid };
      })
    );

    let valid = results.filter(r => r.valid).map(r => r.accountId);
    const invalid = results.filter(r => !r.valid);

    if (invalid.length > 0 && this.config.autoRefreshCookies) {
      // Refreshing accounts

      for (const result of invalid) {
        const account = this.accounts.find(a => a.id === result.accountId);
        if (account && account.hasLoginConfig) {
          const refreshed = await this.ensureValidCookies(result.accountId);
          if (refreshed) valid.push(result.accountId);
        }
      }
    }

    if (valid.length === 0) {
      // No valid cookies
      return;
    }

    for (const accountId of valid) {
      this.addToQueue({
        accountId,
        botName,
        priority: this.getBotPriority(botName),
        validateCookies: false
      });
    }

    await this.processQueue();
  }

  async stop(accountId, botName) {
    const key = Array.from(this.runningProcesses.keys())
      .find(k => k.startsWith(`${accountId}_${botName}`));

    if (!key) throw new Error(`${botName} not running for ${accountId}`);

    const info = this.runningProcesses.get(key);
    // Stopping bot

    info.process.kill('SIGTERM');
    setTimeout(() => {
      if (this.runningProcesses.has(key)) {
        info.process.kill('SIGKILL');
      }
    }, 10000);
  }

  async stopAll() {
    const keys = Array.from(this.runningProcesses.keys());
    // Stopping processes

    for (const key of keys) {
      const info = this.runningProcesses.get(key);
      info.process.kill('SIGTERM');
    }

    setTimeout(() => {
      for (const [key, info] of this.runningProcesses.entries()) {
        if (!info.process.killed) {
          info.process.kill('SIGKILL');
        }
      }
    }, 10000);

    this.accountLocks.clear();
    this.taskQueue = [];
    this.accountQueues.clear();
  }

  getBotPriority(botName) {
    const priorities = {
      'reply': 3,
      'scrape': 9,
      'updatestatus': 1,
      'uploadreels': 2,
      'videocomment': 4,
      'timelinecomment': 5,
      'groupcomment': 6,
      'sharereels': 8,
      'confirm': 7
    };
    return priorities[botName] || 5;
  }

  getStatus() {
    const time = this.formatTime();

    const status = {
      timestamp: time,
      vpsMode: this.isVPS,
      memory: this.memoryStats,
      totalAccounts: this.accounts.length,
      enabledAccounts: this.accounts.filter(a => a.enabled).length,
      withLoginConfig: this.accounts.filter(a => a.hasLoginConfig).length,
      runningProcesses: this.runningProcesses.size,
      queuedTasks: this.config.queuePriorityEnabled ? (this.queueManager ? this.queueManager.size() : 0) : this.taskQueue.length,
      lockedAccounts: this.accountLocks.size,
      running: Array.from(this.runningProcesses.entries()).map(([k, i]) => ({
        task: `${i.accountId}/${i.botName}`,
        runtime: Math.floor((Date.now() - i.startTime) / 1000)
      })),
      queued: this.taskQueue.slice(0, 10).map(t => ({
        task: `${t.accountId}/${t.botName}`,
        priority: t.priority
      })),
      cookies: this.getCookieSummary()
    };

    // Add enhanced queue stats if enabled
    if (this.config.queuePriorityEnabled && this.queueManager) {
      const queueStats = this.queueManager.getStatus();
      status.queueStats = {
        total: queueStats.total,
        byPriority: queueStats.byPriority,
        avgWaitTime: queueStats.avgWaitTime
      };
    }

    // Add rotation stats if enabled
    if (this.config.enableRotation) {
      if (!this.accountRotation) {
        const AccountRotation = require('./account-rotation');
        this.accountRotation = new AccountRotation(this.config.accountRotationCooldown);
      }
      const rotationStats = this.accountRotation.getStats();
      status.rotationStats = {
        totalAccounts: rotationStats.totalAccounts,
        fairnessScore: Math.round(rotationStats.fairness?.fairnessScore || 0),
        readyAccounts: rotationStats.readyAccounts.length
      };
    }

    return status;
  }

  getCookieSummary() {
    const summary = {
      total: this.accounts.length,
      valid: 0,
      expired: 0,
      unknown: 0,
      canRefresh: 0,
      factuallyVerified: 0
    };

    for (const account of this.accounts) {
      const result = this.cookieCheckResults.get(account.id);
      if (result) {
        if (result.isValid) {
          summary.valid++;
          if (result.factual) summary.factuallyVerified++;
        } else if (result.status.includes('expired')) {
          summary.expired++;
        } else {
          summary.unknown++;
        }

        if (result.canAutoRefresh) summary.canRefresh++;
      } else {
        summary.unknown++;
      }
    }

    return summary;
  }
}

async function main() {
  process.env.TZ = 'Asia/Jakarta';

  const executor = new BotExecutor();
  const args = getAppArguments();
  const cmd = args[0];

  // Display ASCII art and license info FIRST, before checking commands
  // SKIP for workers to save speed and keep logs clean
  if (process.env.LEAN_WORKER !== 'true') {
    // FacebookPro Blaster ASCII Art
    const asciiArt = `
                 ░█▀▀░█▀▄░█▀█░█▀▄░█▀█                      
                 ░█▀▀░█▀▄░█▀▀░█▀▄░█░█  v.1.0.0 b${process.env.BUILD_NUMBER || 'DEV'}             
                 ░▀░░░▀▀░░▀░▀░▀░▀░▀▀▀                      
                 ░█▀▄░█░░░█▀█░█▀▀░▀█▀░█▀▀░█▀▄              
                 ░█▀▄░█░░░█▀█░▀▀█░░█░░█▀▀░█▀▄              
                 ░▀▀░░▀▀▀░▀░▀░▀▀▀░░▀░░▀▀▀░▀░▀              
                                                           
             Advanced Facebook Automation System           
                                                           `;
    // Display ASCII art line by line
    console.log(asciiArt);

    // Display license information if available
    const licenseInfo = getLicenseInfo();
    if (licenseInfo) {
      const licensedTo = licenseInfo.name || licenseInfo.email || licenseInfo.owner || 'Unknown';
      const licenseType = (licenseInfo.licenseType || 'UNKNOWN').toUpperCase();
      console.log(`\nLicensed to: ${licensedTo}`);
      console.log(`License Type: ${licenseType}\n`);
    }
  }

  // Handle case when no command is provided - Interactive Shell Mode
  if (!cmd) {
    const showUsage = () => {
      console.log(`USAGE:
  node executor <command> [options]

COMMANDS:
  status                              - Show current status
  run <bot> [account] [parallel]      - Execute bot
  stop [bot] [account]                - Stop bot(s)
  list                                - List accounts
  account-setup                       - Setup new Facebook account
  scheduler <command> [args]          - Manage smart scheduler (start, status, pause, resume)
  maintenance <command>               - Run maintenance (check-cookies, cleanup-logs, etc.)
  diagnose <account>                  - Diagnose Facebook loading issues
  validate-cookies                    - Validate cookies (factual)
  refresh-cookies [account]           - Refresh cookies
  generate [account]                  - Generate cookies
  activate-license <key>              - Activate license key

AVAILABLE BOTS:
  autolike          - Auto like posts on timeline
  videocomment      - Comment on videos/reels
  timelinecomment   - Comment on timeline posts
  groupcomment      - Comment on group posts
  updatestatus      - Update status
  uploadreels       - Upload reels
  sharereels        - Share reels
  confirm           - Confirm friend requests
  scrape            - Scrape content
  reply             - Reply to comments
  viewstory         - View stories

OPTIONS:
  --headless, -h      - Force visual browser mode (NOT headless)
  --parallel          - Run bots in parallel mode (for 'run' command)
  [account]           - Specify a single account ID
  [bot]               - Specify a bot name`);

      process.stdout.write('\nEnter command > ');
    };

    showUsage();

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        process.stdout.write('> ');
        return;
      }

      if (input === 'exit' || input === 'quit') {
        rl.close();
        process.exit(0);
      }

      // Parse input
      const argsMatch = input.match(/(?:[^\s"]+|"[^"]*")+/g);
      if (!argsMatch) {
        process.stdout.write('> ');
        return;
      }
      const args = argsMatch.map(arg => arg.replace(/^"|"$/g, ''));

      const childCmd = args[0];

      if (childCmd === 'activate-license') {
        const key = args[1];
        if (key) {
          console.log(`[EXECUTOR] Activating license...`);
          const context = getExecContext(['activate-license', key]);

          // Pause parent readline to let child take control of stdin
          rl.pause();

          const childLic = spawn(context.path, context.args, { stdio: 'inherit' });
          childLic.on('close', () => {
            rl.resume();
            process.stdout.write('\nEnter command > ');
          });
        } else {
          console.log('Error: License key required. Usage: activate-license <key>');
          process.stdout.write('\nEnter command > ');
        }
      } else {
        const context = getExecContext(args);

        // Pause parent readline to let child take control of stdin
        rl.pause();

        const child = spawn(context.path, context.args, { stdio: 'inherit' });
        child.on('close', () => {
          rl.resume();
          process.stdout.write('\nEnter command > ');
        });
      }
    });

    return;
  }
  /* OLD CODE DISABLED
  if (false) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const showMenu = () => {
      console.log('\n================================');
      console.log('      MAIN MENU');
      console.log('================================');
      console.log('1. Run Bot');
      console.log('2. Show Status');
      console.log('3. List Accounts');
      console.log('4. Validate Cookies');
      console.log('5. Refresh Cookies');
      console.log('6. Activate License');
      console.log('0. Exit');

      rl.question('\nSelect an option: ', async (answer) => {
        switch (answer.trim()) {
          case '1':
            rl.question('Enter bot name (e.g., autolike): ', (botName) => {
              if (botName) {
                rl.question('Target (all/account_id) [all]: ', async (target) => {
                  target = target || 'all';
                  console.log(`\n[EXECUTOR] Launching ${botName} for ${target}...`);
                  const args = [__filename, 'run', botName];
                  if (target !== 'all') args.push(target);

                  const child = spawn(process.execPath, args, { stdio: 'inherit' });
                  child.on('close', () => showMenu());
                });
              } else {
                showMenu();
              }
            });
            break;
          case '2':
            const childStatus = spawn(process.execPath, [__filename, 'status'], { stdio: 'inherit' });
            childStatus.on('close', () => showMenu());
            break;
          case '3':
            const childList = spawn(process.execPath, [__filename, 'list'], { stdio: 'inherit' });
            childList.on('close', () => showMenu());
            break;
          case '4':
            const childVal = spawn(process.execPath, [__filename, 'validate-cookies'], { stdio: 'inherit' });
            childVal.on('close', () => showMenu());
            break;
          case '5':
            rl.question('Enter account ID (optional, press enter for all): ', (accId) => {
              const args = [__filename, 'refresh-cookies'];
              if (accId) args.push(accId);
              const childRef = spawn(process.execPath, args, { stdio: 'inherit' });
              childRef.on('close', () => showMenu());
            });
            break;
          case '6':
            rl.question('Enter License Key: ', (key) => {
              if (key) {
                const sysInitBase = path.join(__dirname, 'sys-init');
                const sysInitPath = fsSync.existsSync(sysInitBase) ? sysInitBase : path.join(__dirname, 'sys-init.js');
                console.log(`[EXECUTOR] Activating license...`);
                const childLic = spawn(process.execPath, [sysInitPath, key], { stdio: 'inherit' });
                childLic.on('close', () => showMenu());
              } else {
                console.log('License key required.');
                showMenu();
              }
            });
            break;
          case '0':
            console.log('Exiting...');
            rl.close();
            process.exit(0);
            break;
          default:
            console.log('Invalid option.');
            showMenu();
        }
      });
    };

    showMenu();
    return;
  }
  */

  // Check if command requires license verification
  const commandsRequiringLicense = ['run', 'validate-cookies', 'refresh-cookies', 'account-setup', 'scheduler', 'maintenance', 'diagnose', 'generate'];
  const requiresLicense = commandsRequiringLicense.includes(cmd);

  try {
    // Initialize everything in one go (directories, accounts, db, license)
    const licenseInfo = await executor.initialize(!requiresLicense);

    if (requiresLicense && licenseInfo) {
      // HWID already checked inside initialize -> checkLicense -> ensureLicense
      const hwid = executor.hwid;
      if (!hwid) {
        executor.logger.error('Could not retrieve device ID');
        process.exit(1);
      }

      const shortHwid = `${hwid.substring(0, 8)}...${hwid.substring(hwid.length - 8)}`;
      executor.logger.info(`Device ID: ${shortHwid}`);
      executor.logger.success('Device authorized');
    }

    // Process the command
    switch (cmd) {
      case 'status':
        console.log(JSON.stringify(executor.getStatus(), null, 2));
        process.exit(0);
        break;

      case 'bot': // Internal command for spawning bots (universal entry point)
        const botName = args[1];
        const accountId = args[2];
        if (!botName || !accountId) {
          executor.logger.error('Usage: bot <name> <account>');
          process.exit(1);
        }
        await executor.runBotDirectly(botName, accountId);
        break;

      case 'run':
        const bot = args[1];
        let account = args[2];
        let mode = args[3];

        // Check for --headless flag (can be anywhere in args)
        const hasHeadlessFlag = args.includes('--headless') || args.includes('-h');

        // Remove flags from args to get clean account/mode
        const cleanArgs = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));
        if (cleanArgs.length >= 3) account = cleanArgs[2];
        if (cleanArgs.length >= 4) mode = cleanArgs[3];

        if (!bot) {
          executor.logger.error('Bot name required');
          console.log('USAGE: node executor run <bot> [account] [parallel] [--headless]');
          return;
        }

        try {
          // Set headless mode via environment variable if flag is present
          if (hasHeadlessFlag) {
            process.env.FORCE_HEADLESS = 'false';
            executor.logger.info('Headless mode: DISABLED (browser will be visible)');
          }

          if (account) {
            executor.logger.info(`Running ${bot} for account ${account}`);
            await executor.runSingle(account, bot, { wait: true });
            executor.logger.success(`Bot ${bot} completed for account ${account}`);
          } else if (mode === 'parallel') {
            executor.logger.info(`Running ${bot} in parallel mode`);
            await executor.runParallel(bot, { validateCookies: true });
            executor.logger.success(`Bot ${bot} completed in parallel mode`);
          } else {
            executor.logger.info(`Running ${bot} for all accounts`);
            await executor.runAll(bot, { delayBetweenAccounts: 30, validateCookies: true });
            executor.logger.success(`Bot ${bot} completed for all accounts`);
          }
        } catch (error) {
          executor.logger.error(`Error running ${bot}: ${error.message}`);
          process.exit(1);
        }
        process.exit(0);
        break;

      case 'stop':
        const stopBot = args[1];
        const stopAccount = args[2];

        if (stopAccount && stopBot) {
          await executor.stop(stopAccount, stopBot);
        } else {
          await executor.stopAll();
        }
        process.exit(0);
        break;

      case 'validate-cookies':
        const results = await executor.validateAllAccountsCookies();
        // Cookie validation results
        results.forEach(r => {
          const cookieResult = executor.cookieCheckResults.get(r.accountId);
          const status = r.valid ? 'VALID' : 'INVALID';
          const factual = cookieResult?.factual ? ' (verified)' : '';
          const reason = r.reason ? ` (${r.reason})` : '';
          console.log(`${r.accountId}: ${status}${factual}${reason}`);
        });
        process.exit(0);
        break;


      case 'generate':
        const generateAccount = args[1];

        if (generateAccount) {
          // Generate cookies for specific account
          executor.logger.info(`Generating cookies for ${generateAccount}...`);
          const generator = new CookieGenerator(generateAccount);
          await generator.initialize();
          await generator.generateCookies();
          executor.logger.success(`Cookies generated for ${generateAccount}`);
        } else {
          // Generate cookies for all accounts
          executor.logger.info('Generating cookies for all accounts...');
          let successCount = 0;
          let failCount = 0;

          for (const acc of executor.accounts) {
            if (acc.enabled && acc.hasLoginConfig) {
              try {
                executor.logger.info(`Generating cookies for ${acc.id}...`);
                const generator = new CookieGenerator(acc.id);
                await generator.initialize();
                await generator.generateCookies();
                executor.logger.success(`✅ ${acc.id}: Success`);
                successCount++;
                await executor.delay(5000);
              } catch (error) {
                executor.logger.error(`❌ ${acc.id}: Failed - ${error.message}`);
                failCount++;
              }
            }
          }

          executor.logger.info(`\n📊 SUMMARY:`);
          executor.logger.info(`   Success: ${successCount}`);
          executor.logger.info(`   Failed: ${failCount}`);
          executor.logger.info(`   Total: ${successCount + failCount}`);
        }
        process.exit(0);
        break;

      case 'refresh-cookies':
        const refreshAccount = args[1];
        const { MaintenanceManager } = require('./maintenance');
        const maint = new MaintenanceManager();
        await maint.initialize();
        if (refreshAccount) {
          await maint.checkAccountCookieExpiry(refreshAccount);
          const autoLogin = maint.autoLoginInstances.get(refreshAccount);
          if (autoLogin) {
            await autoLogin.ensureValidCookies();
          } else {
            executor.logger.error(`No login config found for ${refreshAccount}`);
          }
        } else {
          await maint.refreshExpiredCookies();
        }
        process.exit(0);
        break;

      case 'list':
        const t = executor.formatTime();
        console.log(`\n╔═════════════════════════════════════════════════════════╗`);
        console.log(`                                                           `);
        console.log(`             FACEBOOKPRO BLASTER - ACCOUNT LIST            `);
        console.log(`                                                           `);
        console.log(`╚═════════════════════════════════════════════════════════╝\n`);

        for (const acc of executor.accounts) {
          const cookie = executor.cookieCheckResults.get(acc.id);
          let status = cookie ? cookie.status : 'unknown';
          if (cookie?.factual) status += ' (verified)';

          const bots = Object.entries(acc.config.bots)
            .filter(([_, b]) => b.enabled)
            .map(([n, _]) => n);

          // Account details
          console.log(`📱 Account: ${acc.id}`);
          console.log(`   Status: ${acc.enabled ? '✅ Enabled' : '❌ Disabled'}`);
          console.log(`   Cookies: ${status}`);
          console.log(`   Bots: ${bots.length > 0 ? bots.join(', ') : 'None'}`);
          console.log(`   Login Config: ${acc.hasLoginConfig ? '✅' : '❌'}`);
          console.log('');
        }

        const sum = executor.getCookieSummary();
        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total Accounts: ${sum.total}`);
        console.log(`   Valid Cookies: ${sum.valid}`);
        console.log(`   Expired: ${sum.expired}`);
        console.log(`   Unknown: ${sum.unknown}`);
        console.log(`   Can Auto-Refresh: ${sum.canRefresh}`);
        console.log(`   Factually Verified: ${sum.factuallyVerified}`);
        process.exit(0);
        break;

      case 'account-setup':
        const { AccountSetup } = require('./account-setup');
        const setup = new AccountSetup();
        await setup.setupNewAccount();
        process.exit(0);
        break;

      case 'scheduler':
        const SchedulerCLI = require('./scheduler-cli');
        // Proxy arguments to scheduler CLI
        const schedulerArgs = args.slice(1);
        process.argv = [process.argv[0], __filename, ...schedulerArgs];
        const cli = new SchedulerCLI();
        await cli.run();
        process.exit(0);
        break;

      case 'maintenance':
        const { runMaintenance } = require('./maintenance');
        const maintCmd = args[1] || 'auto-maintenance';
        const maintArgs = args.slice(2);
        await runMaintenance(maintCmd, maintArgs);
        process.exit(0);
        break;

      case 'diagnose':
        const diagAccount = args[1];
        if (!diagAccount) {
          executor.logger.error('Account ID required for diagnostic. Usage: diagnose <account>');
          process.exit(1);
        }
        const { runDiagnose } = require('./diagnose-facebook');
        await runDiagnose(diagAccount);
        process.exit(0);
        break;

      case 'worker':
        // Internal command for binary workers (bots)
        const workerBot = args[1];
        const workerAcc = args[2];
        if (!workerBot || !workerAcc) {
          console.error('Invalid worker arguments');
          process.exit(1);
        }

        // Setup environment
        process.env.ACCOUNT_ID = workerAcc;
        process.env.BOT_NAME = workerBot;

        try {
          // Check if it's encrypted
          const botPath = path.join(__dirname, workerBot);
          const hasExtension = botPath.endsWith('.js');
          const finalBotPath = hasExtension ? botPath : botPath + '.js';

          let content;
          try {
            content = fsSync.readFileSync(finalBotPath, 'utf8');
          } catch (e) {
            // Try without .js suffix if it failed
            if (hasExtension) {
              content = fsSync.readFileSync(botPath.slice(0, -3), 'utf8');
            } else {
              throw e;
            }
          }

          const isWorkerEnc = /^[0-9a-f]+$/i.test(content.trim());
          if (isWorkerEnc) {
            // Use loader logic
            const { decryptModuleContent } = require('./loader');
            const decrypted = decryptModuleContent(content);
            const Module = require('module');
            const workerModule = new Module(finalBotPath, module);
            workerModule.filename = finalBotPath;
            workerModule.paths = Module._nodeModulePaths(__dirname);
            workerModule._compile(decrypted, finalBotPath);
          } else {
            // Plain require
            require(`./${workerBot}`);
          }
        } catch (error) {
          console.error(`WORKER ERROR: ${error.message}`);
          process.exit(1);
        }
        break;

      case 'activate-license':
        const key = args[1] || args[0]; // Handle both formats
        if (!key || key === 'activate-license') {
          executor.logger.error('License key required');
          process.exit(1);
        }
        try {
          const { activateLicense } = require('./sys-core');
          await activateLicense(key);
          process.exit(0);
        } catch (error) {
          executor.logger.error(`Activation failed: ${error.message}`);
          process.exit(1);
        }
        break;

      default:
        executor.logger.error(`Unknown command: ${cmd}`);
        console.log(`USAGE:
  node executor <command> [options]

COMMANDS:
  status                              - Show current status
  run <bot> [account] [parallel]      - Execute bot
  stop [bot] [account]                - Stop bot(s)
  list                                - List accounts
  account-setup                       - Setup new Facebook account
  scheduler <command> [args]          - Manage smart scheduler (start, status, pause, resume)
  maintenance <command>               - Run maintenance (check-cookies, cleanup-logs, etc.)
  diagnose <account>                  - Diagnose Facebook loading issues
  validate-cookies                    - Validate cookies (factual)
  refresh-cookies [account]           - Refresh cookies
  generate [account]                  - Generate cookies
  activate-license <key>              - Activate license key

AVAILABLE BOTS:
  autolike          - Auto like posts on timeline
  videocomment      - Comment on videos/reels
  timelinecomment   - Comment on timeline posts
  groupcomment      - Comment on group posts
  updatestatus      - Update status
  uploadreels       - Upload reels
  sharereels        - Share reels
  confirm           - Confirm friend requests
  scrape            - Scrape content
  reply             - Reply to comments
  viewstory         - View stories

OPTIONS:
  --headless, -h      - Force visual browser mode (NOT headless)
  --parallel          - Run bots in parallel mode (for 'run' command)
  [account]           - Specify a single account ID
  [bot]               - Specify a bot name`);
        process.exit(1);
    }
  } catch (error) {
    executor.logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  const executor = new BotExecutor();
  const t = executor.formatTime();
  // Shutdown
  process.exit(0);
});

process.on('SIGTERM', async () => {
  const executor = new BotExecutor();
  const t = executor.formatTime();
  // Terminate
  process.exit(0);
});

// Lean Worker detection
if (process.argv.includes('bot')) {
  process.env.LEAN_WORKER = 'true';
}

// Entry point check
const isEntryPoint = require.main === module ||
  process.env.SECURE_RUNTIME === 'true' ||
  process.env.LEAN_WORKER === 'true' ||
  (process.argv[1] && (process.argv[1].endsWith('executor') || process.argv[1].endsWith('executor.js')));

if (isEntryPoint) {
  main().catch(err => {
    console.error('\n❌ FATAL ENGINE ERROR:');
    console.error(err);
    process.exit(1);
  });
}

module.exports = BotExecutor;
