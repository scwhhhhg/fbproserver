const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const otplib = require("otplib");
require('./loader'); // Enable encrypted module loading
const { createLogger } = require('./logger');

process.env.TZ = 'Asia/Jakarta';

// Configure TOTP for Bitwarden compatibility
function configureBitwardenCompatibleTOTP() {
  otplib.authenticator.options = {
    digits: 6,
    algorithm: 'sha1',
    period: 30,
    window: 1
  };

  otplib.totp.options = {
    digits: 6,
    algorithm: 'sha1',
    period: 30,
    window: 1
  };
}

function normalizeTOTPSecret(secret) {
  if (!secret) throw new Error('TOTP secret is required');
  return secret.replace(/\s+/g, '').toUpperCase();
}

function generateBitwardenCompatibleTOTP(secret, timeOffset = 0) {
  try {
    const normalizedSecret = normalizeTOTPSecret(secret);
    const currentTime = Math.floor(Date.now() / 1000) + timeOffset;
    const timeStep = Math.floor(currentTime / 30);
    const timeRemaining = 30 - (currentTime % 30);

    const token = otplib.authenticator.generate(normalizedSecret);
    return { token, timeRemaining };
  } catch (error) {
    throw new Error(`TOTP Generation Error: ${error.message}`);
  }
}

// Multi-account support
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);

const notify = require('./notify');

class CookieGenerator {
  constructor(accountId = 'default') {
    this.accountId = accountId;
    this.accountPath = path.join(ACCOUNTS_DIR, accountId);
    this.cookiesPath = path.join(this.accountPath, "cookies.json");
    this.loginConfigPath = path.join(this.accountPath, "facebook_login.json");
    this.artifactsDir = path.join(__dirname, "../artifacts", accountId);
    this.browser = null;
    this.page = null;
    this.logger = createLogger(`cookie/${accountId}`);

    // Load cookiegenerator config
    this.config = this.loadCookieGeneratorConfig();

    configureBitwardenCompatibleTOTP();
  }

  loadCookieGeneratorConfig() {
    const configPath = path.join(__dirname, "../config/cookiegenerator.json");

    // Default config
    // Gunakan 'let' agar objek bisa dimanipulasi jika perlu
    let defaultConfig = {
      headless: false,
      timeout: 60000,
      slowMo: 0,
      viewport: { width: 1280, height: 1024, deviceScaleFactor: 1 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      antiDetection: { enabled: true, blockAnalytics: true, blockCredentialSaving: true },
      autoSaveScreenshots: true,
      screenshotOnError: true
    };

    try {
      if (fsSync.existsSync(configPath)) {
        const configData = fsSync.readFileSync(configPath, 'utf8');
        const loadedConfig = JSON.parse(configData);

        // Gunakan 'let' untuk config
        let config = { ...defaultConfig, ...loadedConfig };

        // Override headless mode if FORCE_HEADLESS is set
        if (process.env.FORCE_HEADLESS !== undefined) {
          config.headless = process.env.FORCE_HEADLESS === 'true';
        }

        return config;
      }
    } catch (error) {
      this.logger && this.logger.warn('Failed to load cookiegenerator config, using defaults:', error.message);
    }

    // Override headless mode if FORCE_HEADLESS is set (untuk default config)
    if (process.env.FORCE_HEADLESS !== undefined) {
      defaultConfig.headless = process.env.FORCE_HEADLESS === 'true';
    }

    return defaultConfig;
  }

  async initialize() {
    try {
      await fs.mkdir(this.artifactsDir, { recursive: true });
    } catch (error) {
      // Directory already exists, continue
    }

    try {
      await fs.mkdir(this.accountPath, { recursive: true });
    } catch (error) {
      // Directory already exists, continue
    }
  }

  async loadLoginConfig() {
    this.logger.info('Loading login configuration...');

    try {
      const configData = await fs.readFile(this.loginConfigPath, "utf8");
      const config = JSON.parse(configData);

      this.logger.debug('Config loaded', {
        email: config.email ? `${config.email.substring(0, 3)}***` : 'missing',
        password: config.password ? '***' : 'missing',
        twoFA: config.twoFA?.enabled ? 'enabled' : 'disabled',
        antiDetection: config.antiDetection?.enabled ? 'enabled' : 'disabled'
      });

      if (!config.email || !config.password) {
        throw new Error("Email and password required");
      }

      if (config.twoFA?.enabled && config.twoFA.method === 'authenticator') {
        if (!config.twoFA.secret) throw new Error("2FA secret required");

        // Test TOTP
        const { token, timeRemaining } = generateBitwardenCompatibleTOTP(config.twoFA.secret);
        this.logger.success(`2FA test successful. Token valid for ${timeRemaining}s`);
      }

      this.logger.success('Login configuration loaded successfully');
      return config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.error('Configuration file not found');

        const exampleConfig = {
          email: "your-facebook-email@example.com",
          password: "your-facebook-password",
          twoFA: {
            enabled: true,
            secret: "YOUR_2FA_SECRET_KEY_HERE",
            method: "authenticator"
          },
          antiDetection: {
            enabled: true,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport: { width: 1280, height: 1024 },
            delays: {
              typing: { min: 80, max: 150 },
              between_actions: { min: 2000, max: 4000 },
              page_load: 10000
            }
          },
          cookieValidityHours: 168
        };

        await fs.writeFile(this.loginConfigPath, JSON.stringify(exampleConfig, null, 2));
        this.logger.success(`Example config created at: ${this.loginConfigPath}`);
        throw new Error(`Please configure ${this.loginConfigPath}`);
      }
      this.logger.error('Failed to load configuration', error);
      throw error;
    }
  }

  async checkCookieValidity() {
    this.logger.info('Checking cookie validity...');

    try {
      if (!fsSync.existsSync(this.cookiesPath)) {
        this.logger.warn('Cookie file not found');
        return { valid: false, reason: 'no_file' };
      }

      const cookiesData = await fs.readFile(this.cookiesPath, "utf8");
      if (!cookiesData.trim()) {
        this.logger.warn('Cookie file is empty');
        return { valid: false, reason: 'empty_file' };
      }

      let cookies;
      try {
        cookies = JSON.parse(cookiesData);
      } catch (jsonError) {
        this.logger.error('Cookie file is corrupted', jsonError);
        return { valid: false, reason: 'corrupted' };
      }

      if (!Array.isArray(cookies) || cookies.length === 0) {
        this.logger.warn('No cookies found in file');
        return { valid: false, reason: 'no_cookies' };
      }

      this.logger.info(`Found ${cookies.length} cookies`);

      // Check expiration
      const now = Date.now() / 1000;
      let validCount = 0;
      let expiredCount = 0;

      for (const cookie of cookies) {
        if (!cookie.expirationDate || cookie.expirationDate > now) {
          validCount++;
        } else {
          expiredCount++;
        }
      }

      const validPercentage = (validCount / cookies.length) * 100;

      this.logger.info(`Cookie expiration check: ${validCount} valid, ${expiredCount} expired (${validPercentage.toFixed(1)}%)`);

      if (validPercentage < 70) {
        this.logger.warn(`Too many expired cookies (${validPercentage.toFixed(1)}%)`);
        return { valid: false, reason: 'expired', percentage: validPercentage };
      }

      // Factual check with Facebook endpoint
      this.logger.info('Performing factual validation with Facebook...');
      let axios;
      try {
        axios = require('axios');
        this.logger.debug('Axios loaded successfully');
      } catch (e) {
        this.logger.error('Failed to require axios', e);
        return { valid: false, reason: 'dependency_missing', error: e.message };
      }

      try {
        this.logger.debug('Sending request to Facebook...');

        // Convert cookies array to cookie string format
        const cookieString = cookies
          .map(c => `${c.name}=${c.value}`)
          .join('; ');

        const response = await axios.get('https://www.facebook.com/', {
          headers: {
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive'
          },
          maxRedirects: 0, // Don't follow redirects
          validateStatus: (status) => {
            // Accept both success and redirect status codes
            return status >= 200 && status < 400;
          },
          timeout: 15000
        });

        // Check if response contains login page indicators
        const responseData = response.data || '';
        const isLoginPage =
          responseData.includes('login_form') ||
          responseData.includes('loginform') ||
          responseData.includes('data-testid="royal-email"') ||
          responseData.includes('data-testid="royal-pass"') ||
          (response.request?.path && response.request.path.includes('/login'));

        if (isLoginPage) {
          this.logger.error('Facebook returned login page - cookies invalid');
          return { valid: false, reason: 'login_page_detected', percentage: validPercentage };
        }

        // Check for successful Facebook page indicators
        const isLoggedIn =
          responseData.includes('"USER_ID"') ||
          responseData.includes('DTSG') ||
          responseData.includes('"actorID"') ||
          responseData.includes('fb_dtsg');

        if (!isLoggedIn) {
          this.logger.error('Could not confirm login status - cookies appear INVALID');
          // Be strict: if we can't confirm login, cookies are invalid
          return { valid: false, reason: 'login_status_unconfirmed', percentage: validPercentage, factual: true };
        }

        this.logger.success(`Cookies are valid and authenticated (${validPercentage.toFixed(1)}%)`);
        return { valid: true, percentage: validPercentage, factual: true };

      } catch (error) {
        // Handle 400 Bad Request - treat as INVALID (strict mode)
        if (error.response && error.response.status === 400) {
          this.logger.error('Bad request (400) - cookies appear INVALID');
          return { valid: false, reason: 'bad_request', percentage: validPercentage, factual: true };
        }

        // Handle redirect errors (302, 301, etc)
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
          const location = error.response.headers.location || error.response.headers.Location || '';

          if (location.includes('/login') || location.includes('login.php')) {
            this.logger.error(`Redirect to login detected: ${location}`);
            return { valid: false, reason: 'login_redirect', percentage: validPercentage, factual: true };
          }

          // Other redirects are also suspicious - treat as INVALID (strict mode)
          this.logger.error(`Redirect detected: ${location} - treating as INVALID`);
          return { valid: false, reason: 'redirect_detected', percentage: validPercentage, factual: true };
        }

        // Handle 401/403 Unauthorized/Forbidden - these mean cookies are truly invalid
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          this.logger.error(`Access denied (${error.response.status}) - cookies INVALID`);
          return { valid: false, reason: 'access_denied', percentage: validPercentage, factual: true };
        }

        // Handle network errors - treat as INVALID (strict mode)
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
          this.logger.error('Network error during validation - cannot verify, treating as INVALID');
          return { valid: false, reason: 'network_error', percentage: validPercentage, factual: false };
        }

        // Other errors - treat as INVALID (strict mode)
        this.logger.error('Validation check failed - treating cookies as INVALID');
        this.logger.error('Error details:', error.message);
        if (error.response) {
          this.logger.error(`Response status: ${error.response.status}`);
          this.logger.error(`Response data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
        if (error.code) {
          this.logger.error(`Error code: ${error.code}`);
        }
        return { valid: false, reason: 'validation_error', percentage: validPercentage, factual: false };
      }

    } catch (error) {
      this.logger.error('Cookie check error', error);
      return { valid: false, reason: 'check_error', error: error.message };
    }
  }

  async launchBrowser(config) {
    this.logger.step(1, 5, 'Launching browser...');

    const antiDetection = config.antiDetection || {};

    // Deteksi VPS: Linux without DISPLAY = VPS, Windows = Desktop
    const isWindows = process.platform === 'win32';
    const isVPS = !isWindows && !process.env.DISPLAY && !process.env.XDG_CURRENT_DESKTOP;

    this.logger.info(`Environment: ${isVPS ? 'VPS (headless)' : 'Desktop'}`);

    const baseArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--no-first-run",
      "--no-zygote",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-blink-features=AutomationControlled"
    ];

    const vpsArgs = [
      "--single-process",
      "--disable-extensions",
      "--disable-plugins",
      "--memory-pressure-off",
      "--max_old_space_size=2048",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--start-maximized",
      "--window-size=1280,800",
      "--force-device-scale-factor=1"
    ];

    // FIX: Ganti 'const args' menjadi 'let args' untuk menghindari error assignment
    let args = isVPS ? [...baseArgs, ...vpsArgs] : baseArgs;

    this.logger.debug('Browser arguments', { count: args.length, vpsOptimized: isVPS });

    // FIX: Ganti 'const headlessMode' menjadi 'let headlessMode'
    let headlessMode = this.config.headless !== undefined
      ? this.config.headless
      : (isVPS ? "new" : false);

    this.logger.info(`Headless mode: ${headlessMode}`);

    this.browser = await puppeteer.launch({
      headless: headlessMode,
      args: args,
      ignoreDefaultArgs: ["--enable-automation"],
      defaultViewport: this.config.viewport || {
        width: 1280,
        height: 1024,
        deviceScaleFactor: 1
      },
      timeout: this.config.timeout || 60000,
      slowMo: this.config.slowMo || (isVPS ? 50 : 0)
    });

    this.logger.success('Browser launched successfully');

    this.page = await this.browser.newPage();
    this.logger.info('New page created');

    // Enhanced popup and permission blocker
    this.logger.debug('Setting up popup blocker and anti-detection measures...');

    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions('https://www.facebook.com', []);
    this.logger.debug('All permissions blocked for facebook.com');

    await this.page.evaluateOnNewDocument(() => {
      // Block password save prompts
      if ('credentials' in navigator) {
        navigator.credentials.create = () => Promise.reject('disabled');
        navigator.credentials.get = () => Promise.reject('disabled');
        navigator.credentials.store = () => Promise.reject('disabled');
      }

      Object.defineProperty(navigator, 'credentials', {
        value: undefined,
        writable: false
      });

      Notification.requestPermission = () => Promise.resolve('denied');
      Notification.permission = 'denied';

      navigator.geolocation.getCurrentPosition = () => { };
      navigator.geolocation.watchPosition = () => { };

      window.open = () => null;
    });

    await this.page.setRequestInterception(true);
    this.page.on('request', (request) => {
      const url = request.url();
      if (url.includes('password') ||
        url.includes('credentials') ||
        url.includes('analytics') ||
        url.includes('pixel')) {
        request.abort();
      } else {
        request.continue();
      }
    });

    this.page.on('dialog', async dialog => {
      this.logger.debug(`Blocking dialog: ${dialog.type()} - ${dialog.message()}`);
      await dialog.dismiss();
    });

    await this.page.evaluateOnNewDocument(() => {
      delete navigator.__proto__.webdriver;

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });

      window.chrome = { runtime: {} };
    });

    const viewport = antiDetection.viewport || { width: 1280, height: 1024 };
    await this.page.setViewport(viewport);
    this.logger.info(`Viewport set: ${viewport.width}x${viewport.height}`);

    const userAgent = antiDetection.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await this.page.setUserAgent(userAgent);
    this.logger.debug('User agent set', { ua: userAgent.substring(0, 50) + '...' });

    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

    this.logger.success('Anti-detection measures applied');
  }

  async delay(ms) {
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) {
      if (this.logger) this.logger.debug(`Invalid delay value: ${ms}, defaulting to 1000ms`);
      ms = 1000;
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async randomDelay(config, type = 'between_actions') {
    const delays = config.antiDetection?.delays || {};
    let range = delays[type];

    // Validate range existence and properties
    if (!range || typeof range.min !== 'number' || typeof range.max !== 'number') {
      // Default ranges based on type
      if (type === 'typing') range = { min: 80, max: 150 };
      else if (type === 'page_load') range = { min: 3000, max: 6000 };
      else range = { min: 1000, max: 2000 };
    }

    const ms = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
    this.logger.debug(`Random delay: ${ms}ms (${type})`);
    await this.delay(ms);
  }

  async typeWithDelay(selector, text, config) {
    this.logger.debug(`Typing into: ${selector}`);
    const delays = config.antiDetection?.delays?.typing || {};

    // Ensure valid min/max
    const min = (typeof delays.min === 'number') ? delays.min : 80;
    const max = (typeof delays.max === 'number') ? delays.max : 150;

    await this.page.click(selector);
    await this.delay(500);

    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('a');
    await this.page.keyboard.up('Control');
    await this.delay(100);

    for (const char of text) {
      await this.page.keyboard.type(char);
      const delayMs = Math.floor(Math.random() * (max - min + 1)) + min;
      await this.delay(delayMs);
    }

    this.logger.debug(`Typed ${text.length} characters`);
  }

  async handle2FA(config) {
    this.logger.step(4, 5, 'Handling 2FA authentication...');

    try {
      await this.page.waitForSelector('body', { timeout: 30000 });
      await this.delay(5000);

      // Check if code form is already visible (direct 2FA without "Try another way")
      this.logger.info('Checking for 2FA code form...');

      const codeSelectors = [
        'input[aria-label="Kode"]',
        '#_r_8_',
        'input[id*="_r_"]',
        'input[type="text"]'
      ];

      let codeFormFound = false;
      for (const selector of codeSelectors) {
        try {
          const input = await this.page.$(selector);
          if (input) {
            const boundingBox = await input.boundingBox();
            if (boundingBox && boundingBox.width > 0) {
              this.logger.success('2FA code form already visible - proceeding directly');
              codeFormFound = true;
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }

      // Only click "Try another way" if code form is not found
      if (!codeFormFound) {
        this.logger.info('Code form not visible, looking for "Try another way" button...');

        let tryAnotherClicked = false;
        const exactSelector = 'span.x1lliihq.x193iq5w.x6ikm8r.x10wlt62.xlyipyv.xuxw1ft';
        const elements = await this.page.$(exactSelector);

        this.logger.debug(`Found ${elements.length} potential buttons`);

        for (let i = 0; i < elements.length; i++) {
          const text = await elements[i].evaluate(el => el.textContent?.trim());
          if (text && text.includes('Coba cara lain')) {
            this.logger.info(`Found button: "${text}"`);
            await elements[i].click();
            tryAnotherClicked = true;
            this.logger.success('Clicked "Try another way"');
            break;
          }
        }

        if (!tryAnotherClicked) {
          this.logger.warn('Could not find "Try another way" button - may already be on 2FA page');
        } else {
          await this.delay(3000);

          this.logger.info('Selecting authenticator method...');
          const authenticatorInput = await this.page.$('label:nth-of-type(2) input');
          if (authenticatorInput) {
            await authenticatorInput.click();
            this.logger.success('Authenticator method selected');
            await this.delay(2000);
          }

          this.logger.info('Clicking continue button...');
          const continueBtn = await this.page.$('div.xlp1x4z span > span');
          if (continueBtn) {
            await continueBtn.click();
            this.logger.success('Continue button clicked');
          } else {
            await this.page.keyboard.press('Enter');
            this.logger.info('Pressed Enter key');
          }

          await this.delay(5000);
        }
      }

      if (config.twoFA.method === 'authenticator' && config.twoFA.secret) {
        let codeAccepted = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!codeAccepted && attempts < maxAttempts) {
          attempts++;
          this.logger.info(`2FA attempt ${attempts}/${maxAttempts}`);

          if (attempts > 1) {
            const currentTime = Math.floor(Date.now() / 1000);
            const timeRemaining = 30 - (currentTime % 30);

            this.logger.warn(`Previous code rejected. Time remaining: ${timeRemaining}s`);

            if (timeRemaining < 10) {
              const waitTime = (timeRemaining + 5);
              this.logger.info(`Waiting ${waitTime}s for new TOTP period...`);
              await this.delay(waitTime * 1000);
            }
          }

          const { token, timeRemaining } = generateBitwardenCompatibleTOTP(config.twoFA.secret);
          this.logger.info(`Generated TOTP: ${token} (valid for ${timeRemaining}s)`);

          const codeSelectors = [
            'input[aria-label="Kode"]',
            '#_r_8_',
            'input[id*="_r_"]',
            'input[type="text"]'
          ];

          let codeEntered = false;
          for (const selector of codeSelectors) {
            try {
              const input = await this.page.$(selector);
              if (input) {
                const boundingBox = await input.boundingBox();
                if (boundingBox && boundingBox.width > 0) {
                  this.logger.debug(`Found code input: ${selector}`);
                  await input.click();
                  await this.delay(500);
                  await input.evaluate(el => el.value = '');
                  await this.delay(200);

                  await this.page.keyboard.down('Control');
                  await this.page.keyboard.press('a');
                  await this.page.keyboard.up('Control');
                  await this.delay(100);

                  await input.type(token);
                  this.logger.success('TOTP code entered');
                  codeEntered = true;
                  break;
                }
              }
            } catch (e) {
              this.logger.debug(`Selector failed: ${selector}`);
              continue;
            }
          }

          if (!codeEntered) {
            this.logger.error('Could not find code input field');
            throw new Error('Could not find code input');
          }

          await this.delay(1000);

          this.logger.info('Submitting 2FA code...');

          // Click submit button
          const finalBtn = await this.page.$('div.xod5an3 > div > div > div');
          if (finalBtn) {
            await finalBtn.click();
            this.logger.info('Submit button clicked');
          } else {
            await this.page.keyboard.press('Enter');
            this.logger.info('Pressed Enter to submit');
          }

          // Wait for navigation/loading to complete
          this.logger.info('Waiting for page to process 2FA code...');

          try {
            // Wait for navigation with longer timeout (30 seconds)
            await Promise.race([
              this.page.waitForNavigation({
                waitUntil: 'networkidle0',
                timeout: 30000
              }),
              // OR wait for URL to change
              this.page.waitForFunction(
                (oldUrl) => window.location.href !== oldUrl,
                { timeout: 30000 },
                this.page.url()
              )
            ]);
            this.logger.success('Page navigation completed');
          } catch (navError) {
            this.logger.debug('Navigation wait timeout - checking current state');
          }

          // Additional wait for any remaining loading
          await this.delay(3000);

          // Handle any dialogs that might appear (auto-dismiss)
          this.logger.info('Checking for dialogs or popups...');
          try {
            // Try to find and click any "OK", "Continue", "Lanjutkan" buttons
            const dialogButtons = await this.page.$('div[role="button"], button');
            for (const btn of dialogButtons) {
              try {
                const text = await btn.evaluate(el => el.textContent?.trim().toLowerCase());
                if (text && (text.includes('ok') ||
                  text.includes('continue') ||
                  text.includes('lanjut') ||
                  text.includes('next') ||
                  text.includes('tutup') ||
                  text.includes('close'))) {
                  this.logger.info(`Clicking dialog button: "${text}"`);
                  await btn.click();
                  await this.delay(2000);
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            this.logger.debug('No dialogs found');
          }

          // Now check the current URL
          const currentUrl = this.page.url();
          this.logger.info(`Current URL after processing: ${currentUrl}`);

          // Check if we're still on 2FA page (code rejected)
          if (currentUrl.includes('two_step_verification') ||
            currentUrl.includes('two_factor')) {

            // Check if there's an error message
            const pageContent = await this.page.content();
            if (pageContent.includes('salah') ||
              pageContent.includes('incorrect') ||
              pageContent.includes('wrong')) {
              this.logger.warn('2FA code appears to be incorrect');
              if (attempts < maxAttempts) {
                continue;
              } else {
                throw new Error('2FA code rejected after multiple attempts');
              }
            }

            this.logger.debug('Still on 2FA page but no error - may be loading');
          }

          // Try to extract cookies now
          this.logger.info('Extracting cookies...');
          try {
            const cookies = await this.page.cookies();
            const facebookCookies = cookies.filter(cookie =>
              cookie.domain.includes('facebook.com')
            );

            this.logger.info(`Found ${facebookCookies.length} Facebook cookies`);

            if (facebookCookies.length > 10) {
              this.logger.success('2FA code accepted! Sufficient cookies found.');
              codeAccepted = true;

              // Handle remember browser page if present
              if (currentUrl.includes('remember_browser')) {
                this.logger.info('Handling remember browser page...');
                await this.handleRememberBrowserPage();
              }
              break;
            }
          } catch (e) {
            this.logger.debug('Cookie extraction failed, checking URL status...');
          }

          // Check URL status for success indicators
          if (currentUrl.includes('remember_browser')) {
            this.logger.success('2FA code accepted! On remember browser page.');
            codeAccepted = true;
            await this.handleRememberBrowserPage();
            break;
          } else if (currentUrl === 'https://www.facebook.com/' ||
            currentUrl.includes('facebook.com/home') ||
            currentUrl.includes('facebook.com/?')) {
            this.logger.success('2FA code accepted! Login successful!');
            codeAccepted = true;
            break;
          } else if (attempts < maxAttempts) {
            this.logger.warn('Unable to confirm 2FA success, retrying with new code...');
            continue;
          }
        }

        if (!codeAccepted) {
          this.logger.error(`2FA failed after ${maxAttempts} attempts`);
          throw new Error('TOTP code rejected after multiple attempts');
        }

        return true;
      }

    } catch (error) {
      try {
        const errorScreenshot = path.join(this.artifactsDir, `2fa_error_${Date.now()}.png`);
        await this.page.screenshot({ path: errorScreenshot, fullPage: true });
        this.logger.error(`Screenshot saved: ${errorScreenshot}`);
      } catch (screenshotError) {
        this.logger.debug('Could not capture error screenshot (page may be closed)');
      }
      throw error;
    }
  }

  async handleRememberBrowserPage() {
    this.logger.info('Processing "remember browser" page...');
    await this.delay(3000);

    const trustDeviceBtn = await this.page.$('div.xlp1x4z > div > div > div > div > div > div:nth-of-type(1) > div.x3nfvp2 span > span');
    if (trustDeviceBtn) {
      await trustDeviceBtn.click();
      this.logger.success('Trust device button clicked');
      await this.delay(2000);
    } else {
      this.logger.warn('Trust device button not found');
    }

    const finalContinueBtn = await this.page.$('div.xod5an3 span > span');
    if (finalContinueBtn) {
      await finalContinueBtn.click();
      this.logger.success('Final continue button clicked');
    } else {
      await this.page.keyboard.press('Enter');
      this.logger.info('Pressed Enter for final continue');
    }

    await this.delay(5000);
  }

  async performLogin(config) {
    this.logger.step(2, 5, 'Navigating to Facebook...');

    try {
      this.logger.info('About to navigate to Facebook...');
      this.logger.info(`Browser connected: ${this.browser.isConnected()}`);
      this.logger.info(`Page URL before navigation: ${this.page.url()}`);

      await this.page.goto('https://www.facebook.com/', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      this.logger.info('Navigation completed');
      this.logger.success('Facebook page loaded');

      await this.randomDelay(config, 'page_load');

      // Robust selector for email input (handles different login page layouts)
      const emailSelector = '#email, [data-testid="royal-email"], input[name="email"]';

      this.logger.info(`Waiting for email input selector: ${emailSelector}`);
      this.logger.info(`Current URL: ${this.page.url()}`);

      try {
        await this.page.waitForSelector(emailSelector, { timeout: 30000 });
        this.logger.info('Email input selector found');
      } catch (selectorError) {
        // Capture page state for debugging
        const currentUrl = this.page.url();
        const pageTitle = await this.page.title().catch(() => 'Unable to get title');

        this.logger.error(`Failed to find email input selector after 30s`);
        this.logger.error(`Current URL: ${currentUrl}`);
        this.logger.error(`Page title: ${pageTitle}`);

        // Try to capture screenshot
        try {
          const screenshotPath = path.join(this.artifactsDir, `selector_timeout_${Date.now()}.png`);
          await this.page.screenshot({ path: screenshotPath, fullPage: true });
          this.logger.error(`Screenshot saved: ${screenshotPath}`);
        } catch (e) {
          this.logger.debug('Could not capture screenshot');
        }

        // Re-throw with more context
        throw new Error(`Email input not found. URL: ${currentUrl}, Title: ${pageTitle}. Original error: ${selectorError.message}`);
      }

      this.logger.step(3, 5, 'Entering credentials...');
      this.logger.info('Entering email...');
      await this.typeWithDelay(emailSelector, config.email, config);
      await this.randomDelay(config);

      this.logger.info('Entering password...');
      // Robust selector for password
      const passSelector = '#pass, [data-testid="royal-pass"], input[name="pass"]';
      await this.typeWithDelay(passSelector, config.password, config);
      await this.randomDelay(config);

      this.logger.info('Clicking login button...');
      const navigationPromise = this.page.waitForNavigation({
        waitUntil: 'networkidle0',
        timeout: 60000
      }).catch(() => null);

      await this.page.click('[data-testid="royal-login-button"]');
      await navigationPromise;
      await this.delay(5000);

      const currentUrl = this.page.url();
      this.logger.info(`Redirected to: ${currentUrl}`);

      if (currentUrl.includes('two_step_verification') || currentUrl.includes('two_factor')) {
        this.logger.info('2FA required');
        if (config.twoFA.enabled) {
          await this.handle2FA(config);
        } else {
          this.logger.error('2FA required but not configured');
          throw new Error('2FA required but not configured');
        }
      } else if (currentUrl.includes('checkpoint')) {
        this.logger.error('Account checkpoint - manual review required');
        throw new Error('Account requires manual review');
      } else if (currentUrl.includes('login')) {
        this.logger.error('Still on login page - invalid credentials');
        throw new Error('Login failed - invalid credentials');
      } else {
        this.logger.success('Login successful (no 2FA required)');
      }

      await this.waitForMainPageLoad();

      try {
        const successScreenshot = path.join(this.artifactsDir, `login_success_${Date.now()}.png`);
        await this.page.screenshot({ path: successScreenshot, fullPage: false });
        this.logger.success(`Success screenshot saved: ${successScreenshot}`);
      } catch (screenshotError) {
        this.logger.debug('Could not capture success screenshot');
      }

      return true;

    } catch (error) {
      try {
        const errorScreenshot = path.join(this.artifactsDir, `login_error_${Date.now()}.png`);
        await this.page.screenshot({ path: errorScreenshot, fullPage: true });
        this.logger.error(`Error screenshot saved: ${errorScreenshot}`);
      } catch (screenshotError) {
        this.logger.debug('Could not capture error screenshot (page may be closed)');
      }
      throw error;
    }
  }

  async waitForMainPageLoad() {
    this.logger.info('Waiting for main page to load completely...');

    await Promise.race([
      this.page.waitForFunction(
        () => {
          const url = window.location.href;
          return !url.includes('login') &&
            !url.includes('two_step') &&
            (url === 'https://www.facebook.com/' || url.includes('facebook.com/home'));
        },
        { timeout: 30000 }
      ),

      this.page.waitForSelector('[role="banner"], [role="main"]', { timeout: 30000 })
    ]);

    await this.delay(3000);
    this.logger.success('Main page loaded successfully');
  }

  async extractAndSaveCookies() {
    this.logger.step(5, 5, 'Extracting cookies...');

    const cookies = await this.page.cookies();
    this.logger.info(`Total cookies found: ${cookies.length}`);

    const facebookCookies = cookies.filter(cookie =>
      cookie.domain.includes('facebook.com')
    );

    this.logger.info(`Facebook cookies: ${facebookCookies.length}`);

    if (facebookCookies.length === 0) {
      this.logger.error('No Facebook cookies found');
      throw new Error('No Facebook cookies found');
    }

    await fs.writeFile(this.cookiesPath, JSON.stringify(facebookCookies, null, 2));
    this.logger.success(`Cookies saved to: ${this.cookiesPath}`);

    const configPath = path.join(this.accountPath, "config.json");
    try {
      const configData = await fs.readFile(configPath, "utf8");
      const accountConfig = JSON.parse(configData);
      accountConfig.lastLogin = new Date().toISOString();
      accountConfig.cookiesGenerated = new Date().toISOString();
      await fs.writeFile(configPath, JSON.stringify(accountConfig, null, 2));
      this.logger.info('Account config updated with timestamp');
    } catch (error) {
      this.logger.debug('Config update skipped (file may not exist)');
    }

    return facebookCookies;
  }

  async generateCookies() {
    this.logger.header(`🍪 COOKIE GENERATION START - Account: ${this.accountId}`);

    let success = false;
    const startTime = Date.now();

    const config = await this.loadLoginConfig();

    try {
      await this.launchBrowser(config);
      await this.performLogin(config);
      await this.extractAndSaveCookies();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      await notify.success(this.accountId, 'cookiegenerator', 'Cookies generated successfully');

      this.logger.header(`✓ COOKIE GENERATION SUCCESS - Duration: ${duration}s`);
      success = true;

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      await notify.error(this.accountId, 'cookiegenerator', error.message);

      this.logger.header(`✗ COOKIE GENERATION FAILED - Duration: ${duration}s`);
      this.logger.error('Generation failed', error);

      throw error;
    } finally {
      if (this.browser) {
        this.logger.info('Closing browser...');
        await this.browser.close();
        this.logger.success('Browser closed');
      }
    }

    return success;
  }

  async ensureValidCookies() {
    this.logger.header(`🔍 ENSURE VALID COOKIES - Account: ${this.accountId}`);

    const cookieCheck = await this.checkCookieValidity();

    if (cookieCheck.valid) {
      this.logger.success('Existing cookies are valid - no generation needed');
      return true;
    }

    this.logger.warn(`Cookies invalid (${cookieCheck.reason}) - generating new cookies...`);
    return await this.generateCookies();
  }
}

// Multi-account cookie management
class MultiAccountCookieManager {
  constructor() {
    this.accountsDir = ACCOUNTS_DIR;
    this.logger = createLogger('cookie/manager');
  }

  async getAccountList() {
    this.logger.info('Scanning for accounts...');

    try {
      const accountDirs = await fs.readdir(this.accountsDir);
      const accounts = [];

      for (const accountDir of accountDirs) {
        const accountPath = path.join(this.accountsDir, accountDir);
        const stat = await fs.stat(accountPath);

        if (stat.isDirectory()) {
          const loginConfigPath = path.join(accountPath, "facebook_login.json");
          if (fsSync.existsSync(loginConfigPath)) {
            accounts.push(accountDir);
          }
        }
      }

      this.logger.success(`Found ${accounts.length} configured account(s)`);
      return accounts;
    } catch (error) {
      this.logger.error('Failed to scan accounts', error);
      return [];
    }
  }

  async generateCookiesForAccount(accountId, skipCheck = false) {
    const generator = new CookieGenerator(accountId);
    await generator.initialize();

    if (skipCheck) {
      // Force generate tanpa checking
      generator.logger.info('FORCE MODE: Skipping cookie validation check');
      return await generator.generateCookies();
    }

    // Smart mode: check dulu baru generate jika perlu
    return await generator.ensureValidCookies();
  }

  async generateCookiesForAllAccounts(skipCheck = false) {
    if (skipCheck) {
      this.logger.header('🔄 FORCE GENERATE COOKIES FOR ALL ACCOUNTS');
    } else {
      this.logger.header('🔄 ENSURE COOKIES FOR ALL ACCOUNTS');
    }

    const accounts = await this.getAccountList();
    const results = [];

    for (let i = 0; i < accounts.length; i++) {
      const accountId = accounts[i];

      this.logger.info(`Processing account ${i + 1}/${accounts.length}: ${accountId}`);
      this.logger.separator();

      try {
        const success = await this.generateCookiesForAccount(accountId, skipCheck);
        results.push({ accountId, success, error: null });
        this.logger.success(`Account ${accountId}: SUCCESS`);

        if (i < accounts.length - 1) {
          this.logger.info('Waiting 5s before next account...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        results.push({ accountId, success: false, error: error.message });
        this.logger.error(`Account ${accountId}: FAILED - ${error.message}`);
      }
    }

    this.logger.separator();
    this.logger.header('📊 GENERATION SUMMARY');

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Total: ${results.length} | Success: ${successful} | Failed: ${failed}\n`);

    results.forEach(r => {
      const status = r.success ? '✓' : '✗';
      const color = '';
      console.log(`${status} ${r.accountId}${r.error ? ` - ${r.error}` : ''}`);
    });

    return results;
  }

  async checkAllAccountsCookies() {
    this.logger.header('🔍 COOKIE STATUS REPORT');

    const accounts = await this.getAccountList();

    for (const accountId of accounts) {
      const generator = new CookieGenerator(accountId);
      const result = await generator.checkCookieValidity();

      let status = result.valid ? '✓ VALID' : '✗ INVALID';
      let color = '';

      if (result.valid && result.factual === false) {
        status = '⚠ VALID (unverified)';
        color = '';
      }

      const percentage = result.percentage ? ` (${result.percentage.toFixed(1)}%)` : '';
      console.log(`${status} ${accountId}${percentage}`);

      if (result.reason) {
        console.log(`  Reason: ${result.reason}`);
      }
      if (result.warning) {
        console.log(`  Warning: ${result.warning}`);
      }
    }

    this.logger.separator();
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--'); // Filter out npm's -- separator
  const command = args[0];

  // Extract flags
  const hasForceFlag = args.includes('--force') || args.includes('-f');
  const hasHeadlessFlag = args.includes('--headless');
  const hasShowFlag = args.includes('--show');

  // Get account ID (first non-command, non-flag argument)
  const accountId = args.find((arg, index) =>
    index > 0 && !arg.startsWith('-') && arg !== command
  );

  // Override headless mode if flag is present
  if (hasHeadlessFlag) {
    process.env.FORCE_HEADLESS = 'true';
  } else if (hasShowFlag) {
    process.env.FORCE_HEADLESS = 'false';
  }

  const manager = new MultiAccountCookieManager();

  try {
    switch (command) {
      case 'generate':
        // FORCE GENERATE - langsung generate tanpa checking
        if (accountId) {
          const generator = new CookieGenerator(accountId);
          await generator.initialize();
          generator.logger.warn('🔄 FORCE MODE: Generating cookies without checking validity');
          await generator.generateCookies();
        } else {
          const accounts = await manager.getAccountList();
          for (const account of accounts) {
            const generator = new CookieGenerator(account);
            await generator.initialize();
            generator.logger.warn('🔄 FORCE MODE: Generating cookies without checking validity');
            await generator.generateCookies();
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        break;

      case 'check':
        await manager.checkAllAccountsCookies();
        break;

      case 'ensure':
        if (accountId) {
          const generator = new CookieGenerator(accountId);
          await generator.initialize();

          if (hasForceFlag) {
            generator.logger.warn('🔄 FORCE MODE: Generating cookies without checking validity');
            await generator.generateCookies();
          } else {
            await generator.ensureValidCookies();
          }
        } else {
          const accounts = await manager.getAccountList();
          for (const account of accounts) {
            const generator = new CookieGenerator(account);
            await generator.initialize();

            if (hasForceFlag) {
              generator.logger.warn('🔄 FORCE MODE: Generating cookies without checking validity');
              await generator.generateCookies();
            } else {
              await generator.ensureValidCookies();
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        break;

      case 'test-totp':
        if (accountId) {
          const generator = new CookieGenerator(accountId);
          const config = await generator.loadLoginConfig();
          if (config.twoFA?.enabled && config.twoFA.secret) {
            const { token, timeRemaining } = generateBitwardenCompatibleTOTP(config.twoFA.secret);
            console.log(`\n✓ Generated token: ${token}`);
            console.log(`⏱ Valid for: ${timeRemaining} seconds\n`);
          }
        } else {
          console.log('\n❌ Please specify an account ID\n');
        }
        break;

      default:
        console.log(`
╔════════════════════════════════════════════════════════════╗
║     FacebookPro Blaster - Cookie Generator v1.0.x        ║
║              VPS Optimized + Force Mode                  ║
╚════════════════════════════════════════════════════════════╝

Commands:
  generate [accountId]        - FORCE generate cookies (skip validity check)
  check                       - Check cookie validity (factual)
  ensure [accountId]          - Smart mode: check first, generate if needed
  ensure [accountId] --force  - FORCE generate even if cookies are valid
  test-totp [accountId]       - Test TOTP generation

Force Generation:
  ✓ generate              - Always force (no checking)
  ✓ ensure --force        - Force even if valid
  ✓ ensure -f             - Short flag for force

Features:
  ✓ VPS-optimized browser
  ✓ Factual cookie validation (tests with Facebook)
  ✓ Bitwarden-compatible 2FA
  ✓ Anti-detection measures
  ✓ Comprehensive logging with colors
  ✓ Multi-account support
  ✓ Error screenshots
  ✓ Force generation mode

Environment Variables:
  DEBUG=1               - Enable debug logging
  ACCOUNT_ID=xxx        - Set default account ID

Examples:
  # Smart mode (check first, generate if needed)
  node bot/cookiegenerator.js ensure account1

  # Force generate (skip validity check)
  node bot/cookiegenerator.js generate account1
  node bot/cookiegenerator.js ensure account1 --force
  node bot/cookiegenerator.js ensure account1 -f

  # Check all accounts
  node bot/cookiegenerator.js check

  # Force generate all accounts
  node bot/cookiegenerator.js generate

  # Test TOTP
  node bot/cookiegenerator.js test-totp account1
        `);
    }
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  // Check license before running
  const { ensureLicense } = require('./sys-core');
  ensureLicense('Cookie Generator').then(() => {
    main();
  }).catch(error => {
    console.error('\n❌ License Error:', error.message);
    process.exit(1);
  });
}

module.exports = {
  CookieGenerator,
  MultiAccountCookieManager,
  configureBitwardenCompatibleTOTP,
  generateBitwardenCompatibleTOTP,
  normalizeTOTPSecret
};
