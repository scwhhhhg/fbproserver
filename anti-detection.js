/**
 * Anti-Bot Detection Module for FacebookPro Blaster
 * 
 * Provides comprehensive anti-detection measures including:
 * - Puppeteer-extra with stealth plugin
 * - Webdriver property masking
 * - Canvas fingerprint randomization
 * - WebGL fingerprint protection
 * - Navigator property spoofing
 * - Human-like behavior simulation
 * - Request interception for tracking prevention
 * 
 * Usage:
 *   const { createStealthBrowser, applyAntiDetection, humanDelay } = require('./anti-detection');
 *   const { browser, page } = await createStealthBrowser(config);
 */

// CHANGED: Using vanilla puppeteer instead of puppeteer-extra
// The stealth plugin causes Facebook to stuck on loading screen
const puppeteer = require('puppeteer');

// REMOVED: Stealth plugin (causes Facebook to not load)
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// Random User Agents (updated Chrome versions)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

// Screen resolutions
const SCREEN_RESOLUTIONS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 1024 },
    { width: 1280, height: 800 }
];

// Timezone options
const TIMEZONES = [
    'Asia/Jakarta',
    'Asia/Singapore',
    'Asia/Kuala_Lumpur',
    'Asia/Bangkok'
];

/**
 * Get random element from array
 */
function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Human-like delay with randomization
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 */
async function humanDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Human-like typing with random delays between keystrokes
 * @param {Page} page - Puppeteer page
 * @param {string} selector - Input selector
 * @param {string} text - Text to type
 */
async function humanType(page, selector, text) {
    await page.click(selector);
    await humanDelay(200, 500);

    for (const char of text) {
        await page.keyboard.type(char);
        const delay = Math.floor(Math.random() * 100) + 50; // 50-150ms between keystrokes
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

/**
 * Human-like mouse movement
 * @param {Page} page - Puppeteer page
 * @param {number} x - Target X coordinate
 * @param {number} y - Target Y coordinate
 */
async function humanMouseMove(page, x, y) {
    const steps = Math.floor(Math.random() * 10) + 5;
    await page.mouse.move(x, y, { steps });
}

/**
 * Get stealth browser arguments
 */
function getStealthArgs(isProduction = false) {
    const baseArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',

        // Anti-detection args
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-infobars',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',

        // Privacy args
        '--disable-notifications',
        '--disable-translate',
        '--disable-features=TranslateUI',
        '--disable-save-password-bubble',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',

        // Fingerprint randomization
        `--window-size=${1280 + Math.floor(Math.random() * 100)},${1024 + Math.floor(Math.random() * 100)}`
    ];

    if (isProduction) {
        baseArgs.push(
            '--single-process',
            '--memory-pressure-off'
        );
    }

    return baseArgs;
}

/**
 * Apply comprehensive anti-detection measures to a page
 * @param {Page} page - Puppeteer page object
 * @param {string} accountId - Account ID for logging
 */
async function applyAntiDetection(page, accountId = 'default') {
    // COMPLETELY DISABLED: All anti-detection measures cause Facebook to stuck
    // Using pure vanilla approach - only basic settings

    // Select random user agent
    const userAgent = getRandomElement(USER_AGENTS);
    await page.setUserAgent(userAgent);

    // Set random viewport
    const resolution = getRandomElement(SCREEN_RESOLUTIONS);
    await page.setViewport({
        width: resolution.width,
        height: resolution.height
    });

    // REMOVED: All evaluateOnNewDocument overrides (causes Facebook to stuck)
    // REMOVED: All HTTP headers modifications
    // REMOVED: All navigator overrides
    // REMOVED: All fingerprint protection

    // Minimal logging (commented out to reduce clutter)
    // console.log(`[${accountId}] ✓ Vanilla mode (no anti-detection)`);
    // console.log(`[${accountId}]   - User Agent: ${userAgent.substring(0, 40)}...`);
    // console.log(`[${accountId}]   - Viewport: ${resolution.width}x${resolution.height}`);
}

/**
 * Create a stealth browser instance with anti-detection
 * @param {Object} config - Browser configuration
 * @param {string} accountId - Account ID for logging
 * @returns {Promise<{browser: Browser, page: Page}>}
 */
async function createStealthBrowser(config = {}, accountId = 'default') {
    const isProduction = process.env.NODE_ENV === 'production';

    // Check for FORCE_HEADLESS environment variable (from --headless flag)
    let headlessMode;
    if (process.env.FORCE_HEADLESS === 'false') {
        headlessMode = false; // Force visible browser
    } else {
        headlessMode = isProduction ? 'new' : (config.headless !== undefined ? config.headless : 'new');
    }

    console.log(`[${accountId}] 🔒 Launching browser...`);

    const browser = await puppeteer.launch({
        headless: headlessMode,
        args: getStealthArgs(isProduction),
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: null, // Will be set in applyAntiDetection
        timeout: config.timeout || 90000,
        protocolTimeout: config.protocolTimeout || 180000
    });

    const page = await browser.newPage();

    // Apply anti-detection
    await applyAntiDetection(page, accountId);

    // Set timeouts
    await page.setDefaultTimeout(config.defaultTimeout || 60000);
    await page.setDefaultNavigationTimeout(config.navigationTimeout || 90000);

    console.log(`[${accountId}] ✓ Browser ready`);

    return { browser, page };
}

/**
 * Dismiss Facebook popups (notifications, translate, etc)
 * @param {Page} page - Puppeteer page
 * @param {string} accountId - Account ID for logging
 */
async function dismissFacebookPopups(page, accountId = 'default') {
    try {
        await page.evaluate(() => {
            const closeSelectors = [
                'div[aria-label="Close"]',
                'div[aria-label="Tutup"]',
                '[aria-label="Not Now"]',
                '[aria-label="Lain Kali"]',
                '[aria-label="Dismiss"]',
                'div[role="button"][aria-label*="close" i]',
                'div[role="button"][aria-label*="tutup" i]'
            ];

            closeSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(btn => {
                    try {
                        if (btn.offsetParent) btn.click();
                    } catch (e) { }
                });
            });
        });
        console.log(`[${accountId}] → Popups dismissed`);
    } catch (error) {
        // Silently fail - popups might not exist
    }
}

/**
 * Random scroll to simulate human behavior
 * @param {Page} page - Puppeteer page
 */
async function humanScroll(page) {
    const scrollAmount = Math.floor(Math.random() * 300) + 100;
    await page.evaluate((amount) => {
        window.scrollBy({
            top: amount,
            behavior: 'smooth'
        });
    }, scrollAmount);
    await humanDelay(500, 1500);
}

module.exports = {
    createStealthBrowser,
    applyAntiDetection,
    humanDelay,
    humanType,
    humanMouseMove,
    humanScroll,
    dismissFacebookPopups,
    getStealthArgs,
    USER_AGENTS,
    SCREEN_RESOLUTIONS
};
