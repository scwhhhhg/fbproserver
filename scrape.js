const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Multi-account support
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'scrape';

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: true,
    targetURL: "https://www.facebook.com/watch/reels/",
    maxScrolls: 10,
    retentionDays: 7,
    deduplication: {
      enabled: true,
      checkDuplicates: true,
      autoCleanup: true
    },
    navigation: {
      timeout: 90000,
      maxRetries: 3,
      waitBetweenRetries: 5000
    }
  };
}

// Paths
const REELS_URLS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "reels_urls.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");

const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const nowInSeconds = () => Math.floor(Date.now() / 1000);

// ========================================
// RETRY MECHANISM
// ========================================
async function retryOperation(operation, maxRetries = 3, baseDelay = 2000, operationName = 'operation') {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${ACCOUNT_ID}] ${operationName} - Attempt ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      console.log(`[${ACCOUNT_ID}] ${operationName} - Attempt ${attempt} failed: ${error.message}`);

      if (attempt === maxRetries) {
        throw new Error(`${operationName} failed after ${maxRetries} attempts: ${error.message}`);
      }

      const delayTime = baseDelay * Math.pow(2, attempt - 1);
      console.log(`[${ACCOUNT_ID}] Retrying in ${delayTime}ms...`);
      await delay(delayTime);
    }
  }
}

// ========================================
// ENHANCED NAVIGATION
// ========================================
async function navigateToUrlSafely(page, url, options = {}) {
  const maxRetries = options.maxRetries || config.navigation?.maxRetries || 3;
  const timeout = options.timeout || config.navigation?.timeout || 90000;

  return await retryOperation(async () => {
    try {
      console.log(`[${ACCOUNT_ID}] Navigating to: ${url}`);

      // Clear cache first
      await page.goto('about:blank');
      await delay(1000);

      // Try primary navigation strategy
      await page.goto(url, {
        waitUntil: ["domcontentloaded", "networkidle0"],
        timeout: timeout
      });

      // Wait for page to be fully loaded
      await page.waitForFunction(
        () => document.readyState === 'complete' &&
          document.body &&
          document.body.children.length > 0,
        { timeout: 30000 }
      );

      console.log(`[${ACCOUNT_ID}] ✅ Page loaded successfully`);
      return true;

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Primary navigation failed: ${error.message}`);

      // Fallback: Try simple navigation
      if (error.message.includes('timeout')) {
        console.log(`[${ACCOUNT_ID}] Trying fallback navigation strategy...`);

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeout
        });

        await delay(8000);
        console.log(`[${ACCOUNT_ID}] ✅ Fallback navigation successful`);
        return true;
      }

      throw error;
    }
  }, maxRetries, config.navigation?.waitBetweenRetries || 5000, 'Navigation');
}

// ========================================
// COOKIE MANAGEMENT
// ========================================
async function loadCookiesFromFile() {
  try {
    console.log(`[${ACCOUNT_ID}] Loading cookies from: ${COOKIES_PATH}`);
    const cookiesData = await fs.readFile(COOKIES_PATH, "utf8");
    const cookies = JSON.parse(cookiesData);

    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new Error("Cookies file is empty or invalid format");
    }

    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.facebook.com',
      path: cookie.path || '/',
      httpOnly: !!cookie.httpOnly,
      secure: !!cookie.secure,
      sameSite: ['Strict', 'Lax', 'None'].includes(cookie.sameSite) ? cookie.sameSite : 'Lax'
    }));
  } catch (error) {
    throw new Error(`Failed to load cookies: ${error.message}`);
  }
}

// ========================================
// DEDUPLICATION & STORAGE
// ========================================

class ReelsStorage {
  constructor() {
    this.reels = new Map(); // url -> {url, timestamp, source}
    this.urlHashes = new Set(); // For faster lookup
  }

  async load() {
    try {
      const data = await fs.readFile(REELS_URLS_PATH, "utf8");
      const lines = data.split("\n").filter(line => line.trim() !== "");

      for (const line of lines) {
        const parts = line.split("|");
        const url = parts[0] ? parts[0].trim() : "";
        const timestamp = parts[1] ? parseInt(parts[1], 10) : nowInSeconds();
        const source = parts[2] ? parts[2].trim() : "unknown";

        if (url && url.startsWith("http") && url.includes('/reel/')) {
          const normalized = this.normalizeUrl(url);
          const hash = this.generateHash(normalized);

          if (!this.urlHashes.has(hash)) {
            this.reels.set(normalized, { url: normalized, timestamp, source });
            this.urlHashes.add(hash);
          }
        }
      }

      console.log(`[${ACCOUNT_ID}] ✅ Loaded ${this.reels.size} existing reels`);
      return this.reels.size;
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log(`[${ACCOUNT_ID}] 📝 Creating new reels_urls.txt`);
        await fs.writeFile(REELS_URLS_PATH, "", "utf8");
        return 0;
      }
      throw error;
    }
  }

  normalizeUrl(url) {
    // Remove query parameters and fragments
    let normalized = url.split('?')[0].split('#')[0];

    // Ensure consistent format
    if (!normalized.endsWith('/')) {
      normalized = normalized.replace(/\/reel\/(\d+).*$/, '/reel/$1');
    }

    return normalized;
  }

  generateHash(url) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex');
  }

  addUrl(url, source = 'scrape') {
    const normalized = this.normalizeUrl(url);
    const hash = this.generateHash(normalized);

    if (this.urlHashes.has(hash)) {
      return false; // Duplicate
    }

    this.reels.set(normalized, {
      url: normalized,
      timestamp: nowInSeconds(),
      source: source
    });
    this.urlHashes.add(hash);

    return true; // New URL added
  }

  isDuplicate(url) {
    const normalized = this.normalizeUrl(url);
    const hash = this.generateHash(normalized);
    return this.urlHashes.has(hash);
  }

  cleanupOldReels() {
    const retentionDays = config.retentionDays || 7;
    const cutoffTime = nowInSeconds() - (retentionDays * 24 * 60 * 60);

    let removedCount = 0;
    const toRemove = [];

    for (const [url, data] of this.reels.entries()) {
      if (data.timestamp < cutoffTime) {
        toRemove.push(url);
      }
    }

    for (const url of toRemove) {
      const hash = this.generateHash(url);
      this.reels.delete(url);
      this.urlHashes.delete(hash);
      removedCount++;
    }

    if (removedCount > 0) {
      console.log(`[${ACCOUNT_ID}] 🗑️  Cleaned up ${removedCount} old reels (older than ${retentionDays} days)`);
    }

    return removedCount;
  }

  async save() {
    try {
      const lines = Array.from(this.reels.values())
        .sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
        .map(r => `${r.url}|${r.timestamp}|${r.source}`);

      const content = lines.join("\n");
      await fs.writeFile(REELS_URLS_PATH, content, "utf8");
      console.log(`[${ACCOUNT_ID}] ✅ Saved ${this.reels.size} reels URLs`);

      // Backup to account directory
      try {
        const accountReelsPath = path.join(__dirname, "../accounts", ACCOUNT_ID, "reels_urls.txt");
        await fs.writeFile(accountReelsPath, content, "utf8");
        console.log(`[${ACCOUNT_ID}] 💾 Backup saved to account directory`);
      } catch (backupError) {
        console.log(`[${ACCOUNT_ID}] ⚠️ Backup warning: ${backupError.message}`);
      }

      return this.reels.size;
    } catch (error) {
      throw new Error(`Failed to save reels: ${error.message}`);
    }
  }

  getStats() {
    return {
      total: this.reels.size,
      newest: this.getNewestTimestamp(),
      oldest: this.getOldestTimestamp()
    };
  }

  getNewestTimestamp() {
    let newest = 0;
    for (const data of this.reels.values()) {
      if (data.timestamp > newest) newest = data.timestamp;
    }
    return newest;
  }

  getOldestTimestamp() {
    let oldest = nowInSeconds();
    for (const data of this.reels.values()) {
      if (data.timestamp < oldest) oldest = data.timestamp;
    }
    return oldest;
  }
}

// ========================================
// ENHANCED SCRAPING
// ========================================
async function scrapeReelsFromPage(page, storage) {
  console.log(`[${ACCOUNT_ID}] 🎬 Starting reels scraping...`);

  // Wait for content to load
  await delay(8000);

  // Verify login status
  const title = await page.title();
  console.log(`[${ACCOUNT_ID}] 📄 Page title: ${title}`);

  if (title.includes('Log') || title.includes('login')) {
    throw new Error('Login failed - Check cookies.json!');
  }

  let newUrlsCount = 0;
  let duplicatesCount = 0;
  let noNewUrlsStreak = 0;
  let totalScraped = 0;

  for (let i = 0; i < config.maxScrolls; i++) {
    console.log(`[${ACCOUNT_ID}] 📜 Scroll ${i + 1}/${config.maxScrolls}...`);

    const beforeCount = newUrlsCount;

    // Extract URLs from page
    const links = await page.evaluate(() => {
      const reelsUrls = new Set();
      const reelLinks = document.querySelectorAll('a[href*="/reel/"]');

      reelLinks.forEach(link => {
        if (link.href && link.href.includes('/reel/')) {
          // Extract clean URL
          const url = link.href.split('?')[0].split('#')[0];

          // Validate URL format
          if (url.match(/\/reel\/\d+/)) {
            reelsUrls.add(url);
          }
        }
      });

      return Array.from(reelsUrls);
    });

    totalScraped += links.length;

    // Process URLs with deduplication
    for (const url of links) {
      if (storage.isDuplicate(url)) {
        duplicatesCount++;
      } else {
        if (storage.addUrl(url, 'scrape')) {
          newUrlsCount++;
          console.log(`[${ACCOUNT_ID}]    ✅ NEW: ${url}`);
        }
      }
    }

    const newInThisScroll = newUrlsCount - beforeCount;
    console.log(`[${ACCOUNT_ID}]    📊 This scroll: ${newInThisScroll} new, ${links.length - newInThisScroll} duplicates`);

    // Stop if no new URLs for multiple scrolls
    if (newInThisScroll === 0) {
      noNewUrlsStreak++;
      if (noNewUrlsStreak >= 3) {
        console.log(`[${ACCOUNT_ID}] ⏹️  No new URLs for 3 scrolls, stopping early`);
        break;
      }
    } else {
      noNewUrlsStreak = 0;
    }

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 1000));
    await delay(4000);
  }

  return {
    newUrlsCount,
    duplicatesCount,
    totalScraped
  };
}

// ========================================
// MAIN FUNCTION
// ========================================
async function main() {
  let browser = null;

  console.log(`\n[${ACCOUNT_ID}] ═══════════════════════════════════════`);
  console.log(`[${ACCOUNT_ID}]   FACEBOOKPRO BLASTER - REELS SCRAPER (Enhanced)`);
  console.log(`[${ACCOUNT_ID}] ═══════════════════════════════════════\n`);

  try {
    // Create directories
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    // Initialize storage
    const storage = new ReelsStorage();
    await storage.load();

    // Auto cleanup old reels if enabled
    if (config.deduplication?.autoCleanup !== false) {
      storage.cleanupOldReels();
    }

    // Load cookies
    const cookies = await loadCookiesFromFile();
    console.log(`[${ACCOUNT_ID}] 🍪 Loaded ${cookies.length} cookies`);

    // Launch browser with anti-detection
    console.log(`[${ACCOUNT_ID}] 🚀 Launching stealth browser...`);

    // Create stealth browser with anti-detection
    const stealthResult = await createStealthBrowser({
      headless: config.headless,
      timeout: 90000,
      protocolTimeout: 180000,
      defaultTimeout: 60000,
      navigationTimeout: config.navigation?.timeout || 90000
    }, ACCOUNT_ID);

    browser = stealthResult.browser;
    const page = stealthResult.page;

    await page.setCookie(...cookies);
    console.log(`[${ACCOUNT_ID}] ✅ Browser ready`);

    // Navigate to target URL with retry
    await navigateToUrlSafely(page, config.targetURL);

    // Scrape reels
    const results = await scrapeReelsFromPage(page, storage);

    // Save results
    await storage.save();

    // Get stats
    const stats = storage.getStats();

    // Take success screenshot
    try {
      const screenshotPath = path.join(ARTIFACTS_DIR, `scrape_success_${Date.now()}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: false
      });
      console.log(`[${ACCOUNT_ID}] 📸 Screenshot saved`);
    } catch (screenshotError) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Screenshot warning: ${screenshotError.message}`);
    }

    // Print summary
    console.log(`\n[${ACCOUNT_ID}] ═══════════════════════════════════════`);
    console.log(`[${ACCOUNT_ID}]   SCRAPING COMPLETED`);
    console.log(`[${ACCOUNT_ID}] ═══════════════════════════════════════`);
    console.log(`[${ACCOUNT_ID}] 📊 Results:`);
    console.log(`[${ACCOUNT_ID}]    • Total scraped: ${results.totalScraped}`);
    console.log(`[${ACCOUNT_ID}]    • New URLs: ${results.newUrlsCount}`);
    console.log(`[${ACCOUNT_ID}]    • Duplicates: ${results.duplicatesCount}`);
    console.log(`[${ACCOUNT_ID}]    • Total stored: ${stats.total}`);
    console.log(`[${ACCOUNT_ID}] ═══════════════════════════════════════\n`);

    // Send success notification
    const successDetails = `Scraped: ${results.totalScraped}, New: ${results.newUrlsCount}, Total: ${stats.total}`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

  } catch (error) {
    console.error(`\n[${ACCOUNT_ID}] ❌ ERROR: ${error.message}`);
    console.error(`[${ACCOUNT_ID}] Stack: ${error.stack}`);

    // Take error screenshot
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const page = pages[0];
          const errorScreenshot = path.join(ARTIFACTS_DIR, `scrape_error_${Date.now()}.png`);
          await page.screenshot({
            path: errorScreenshot,
            fullPage: true
          });
          console.log(`[${ACCOUNT_ID}] 📸 Error screenshot: ${errorScreenshot}`);
        }
      } catch (screenshotError) {
        console.log(`[${ACCOUNT_ID}] ⚠️ Could not capture error screenshot`);
      }
    }

    // Send error notification
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`[${ACCOUNT_ID}] 🔒 Browser closed`);
      } catch (closeError) {
        console.log(`[${ACCOUNT_ID}] ⚠️ Browser close warning: ${closeError.message}`);
      }
    }
  }
}

// ========================================
// GRACEFUL SHUTDOWN
// ========================================
process.on('SIGINT', () => {
  console.log(`\n[${ACCOUNT_ID}] 🛑 Bot stopped by user`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[${ACCOUNT_ID}] 🛑 Received SIGTERM, shutting down...`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${ACCOUNT_ID}] ❌ Unhandled Rejection:`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(`[${ACCOUNT_ID}] ❌ Uncaught Exception:`, error);
  process.exit(1);
});

// Start the bot
main();
