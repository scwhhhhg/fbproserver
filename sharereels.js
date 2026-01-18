const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Import AI comment generator module
const { generateAiComment, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support: Get paths from environment variables
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'sharereels';

// Load config with multi-account support
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    ai_caption: {
      enabled: true,
      use_openrouter: true,
      url_shortener_enabled: true,
      static_text: "Lihat video ini!",
      prompts: {
        default: "Buat caption menarik untuk reels Facebook ini dalam bahasa Indonesia. Gaya santai, mengundang penasaran, 1-2 kalimat maksimal dengan 1 emoji yang relevan. Caption original video: '{VIDEO_CAPTION}', berikan satu aja, jangan tambahkan penjelasan, jangan tambahkan tanda kutip.",
        short: "Buat caption singkat dan catchy untuk reels ini: '{VIDEO_CAPTION}'. 1 kalimat + 1 emoji. berikan satu aja, jangan tambahkan penjelasan, jangan tambahkan tanda kutip.",
        engaging: "Buat caption yang mengundang interaksi untuk video reels ini: '{VIDEO_CAPTION}'. Tambahkan pertanyaan atau call-to-action. Maksimal 2 kalimat + emoji. berikan satu aja, jangan tambahkan penjelasan, jangan tambahkan tanda kutip.",
        viral: "Buat caption viral dan trending untuk reels ini: '{VIDEO_CAPTION}'. Gunakan bahasa anak muda, relatable, maksimal 2 kalimat + emoji yang hits. berikan satu aja, jangan tambahkan penjelasan, jangan tambahkan tanda kutip."
      },
      current_style: "default",
      fallback_keywords: ["viral", "trending", "amazing", "wow", "must watch"],
      max_video_caption_length: 200,
      typing_delay_after_click: 3000
    }
  };
}

// Multi-account paths
const TARGET_GROUPS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "target_groups.txt");
const REELS_URLS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "reels_urls.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");

const notify = require('./notify');

// Helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () =>
  1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

// Load cookies from file
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
    throw new Error(`[${ACCOUNT_ID}] Failed to load cookies: ${error.message}`);
  }
}

// Load target groups
async function loadTargetGroups() {
  try {
    const data = await fs.readFile(TARGET_GROUPS_PATH, "utf8");
    const groups = data.split("\n").map(g => g.trim()).filter(Boolean);
    if (groups.length === 0) {
      throw new Error(`[${ACCOUNT_ID}] File target_groups.txt kosong`);
    }
    return groups;
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log(`[${ACCOUNT_ID}] File target_groups.txt tidak ditemukan. Membuat file default...`);
      const defaultGroups = [
        "https://www.facebook.com/groups/your-target-group-1",
        "https://www.facebook.com/groups/your-target-group-2"
      ].join("\n");
      await fs.writeFile(TARGET_GROUPS_PATH, defaultGroups, "utf8");
      throw new Error(`[${ACCOUNT_ID}] File target_groups.txt telah dibuat. Silakan edit dengan URL grup yang sebenarnya.`);
    }
    throw e;
  }
}

// IMPROVED: Load Reels URLs with better error handling
async function loadReelsUrls() {
  try {
    // Check if file exists
    if (!fsSync.existsSync(REELS_URLS_PATH)) {
      console.log(`[${ACCOUNT_ID}] File reels_urls.txt tidak ditemukan. Membuat file kosong...`);
      await fs.writeFile(REELS_URLS_PATH, "", "utf8");
      throw new Error(`[${ACCOUNT_ID}] File reels_urls.txt kosong. Silakan jalankan scrape.js terlebih dahulu atau tambahkan URL reels secara manual.`);
    }

    const data = await fs.readFile(REELS_URLS_PATH, "utf8");

    // Check if file is empty
    if (!data.trim()) {
      throw new Error(`[${ACCOUNT_ID}] File reels_urls.txt kosong. Silakan jalankan scrape.js terlebih dahulu atau tambahkan URL reels secara manual.`);
    }

    // Parse URLs with better handling
    const urls = data.split("\n")
      .map(u => u.trim())
      .filter(u => {
        // Check if it's a valid Facebook reel URL
        return u && (
          u.startsWith("https://www.facebook.com/reel/") ||
          u.startsWith("https://web.facebook.com/reel/") ||
          u.startsWith("https://facebook.com/reel/")
        );
      })
      .map(u => {
        // Clean up URL by removing additional parameters
        if (u.includes('|')) {
          u = u.split('|')[0];
        }
        return u;
      })
      .filter(Boolean);

    if (urls.length === 0) {
      throw new Error(`[${ACCOUNT_ID}] Tidak ada URL reels yang valid dalam file. Pastikan URL mengandung 'facebook.com/reel/'`);
    }

    console.log(`[${ACCOUNT_ID}] Loaded ${urls.length} valid reel URLs`);
    return urls;
  } catch (e) {
    if (e.code === "ENOENT") {
      await fs.writeFile(REELS_URLS_PATH, "", "utf8");
      throw new Error(`[${ACCOUNT_ID}] File reels_urls.txt tidak ditemukan. Silakan jalankan scrape.js terlebih dahulu.`);
    }
    throw e;
  }
}

// Load Gemini Keys
async function loadGeminiKeys() {
  if (!config.ai_caption?.enabled) {
    console.log(`[${ACCOUNT_ID}] AI caption disabled, skipping Gemini keys load`);
    return [];
  }

  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\n").map(k => k.trim()).filter(k => k && k.startsWith("AIzaSy"));

    if (keys.length === 0) {
      console.log(`[${ACCOUNT_ID}] Warning: AI caption enabled but no valid Gemini keys found.`);
      return [];
    }

    console.log(`[${ACCOUNT_ID}] Loaded ${keys.length} Gemini API keys`);
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[${ACCOUNT_ID}] Warning: gemini_keys.txt not found.`);
      return [];
    }
    throw new Error(`[${ACCOUNT_ID}] Failed to load Gemini keys: ${error.message}`);
  }
}

// Function to extract video caption from page
async function extractVideoCaption(page) {
  console.log(`[${ACCOUNT_ID}] Extracting video caption from page...`);

  try {
    const captionSelectors = [
      'div[data-ad-preview="message"]',
      '[data-testid="post_message"]',
      '.userContent',
      '[data-testid="post-caption"]',
      'div[dir="auto"]',
      'span[dir="auto"]'
    ];

    for (const selector of captionSelectors) {
      try {
        const caption = await page.$eval(selector, el => {
          const text = el.textContent || el.innerText || '';
          return text.trim();
        });

        if (caption && caption.length > 10) {
          console.log(`[${ACCOUNT_ID}] Video caption found: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"`);
          return caption;
        }
      } catch (e) {
        continue;
      }
    }

    const fallbackCaption = await page.evaluate(() => {
      const allText = document.body.innerText || '';
      const lines = allText.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 20 &&
          !trimmed.includes('Facebook') &&
          !trimmed.includes('Home') &&
          !trimmed.includes('Profile') &&
          !trimmed.includes('Settings');
      });

      return lines[0] || '';
    });

    if (fallbackCaption) {
      console.log(`[${ACCOUNT_ID}] Fallback caption: "${fallbackCaption.substring(0, 100)}${fallbackCaption.length > 100 ? '...' : ''}"`);
      return fallbackCaption;
    }

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] Error extracting video caption: ${error.message}`);
  }

  console.log(`[${ACCOUNT_ID}] No video caption found`);
  return "";
}

// Function to click share button
async function clickShareButton(page, timeout = 15000) {
  try {
    console.log(`[${ACCOUNT_ID}] Mencari tombol Share...`);

    const recordedSelectors = [
      'div.x1pq812k > div:nth-of-type(1) div.xuk3077 > div > div > div > div > div > div:nth-of-type(3) svg',
      'div.x1pq812k svg',
      'div.xuk3077 svg'
    ];

    for (const selector of recordedSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.boundingBox();
          if (isVisible && isVisible.width > 10 && isVisible.height > 10) {
            await element.click();
            console.log(`[${ACCOUNT_ID}] Tombol Share diklik dengan selector: ${selector}`);
            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    console.log(`[${ACCOUNT_ID}] Mencoba dengan text content...`);
    const shareButtonFound = await page.evaluate(() => {
      const shareTexts = ['Share', 'Bagikan', 'share'];
      const allElements = document.querySelectorAll('div[role="button"], button, div[aria-label*="Share"], div[aria-label*="Bagikan"]');

      for (const element of allElements) {
        const text = (element.textContent || '').toLowerCase().trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();

        for (const shareText of shareTexts) {
          if (text.includes(shareText.toLowerCase()) || ariaLabel.includes(shareText.toLowerCase())) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 10 && rect.height > 10 && element.offsetParent !== null) {
              element.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (shareButtonFound) {
      console.log(`[${ACCOUNT_ID}] Tombol Share diklik (text content strategy)`);
      await delay(2000);
      return true;
    }

    throw new Error("Tombol share tidak ditemukan dengan semua strategi");

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Error clicking share button:`, error.message);
    return false;
  }
}

// Function to click "Share to Group" button
async function clickShareToGroupButton(page, timeout = 15000) {
  try {
    console.log(`[${ACCOUNT_ID}] Mencari 'Bagikan ke grup'...`);

    await delay(4000);

    const recordedSelectors = [
      'div:nth-of-type(6) div:nth-of-type(5) > div > div.x1n2onr6 > div > div:nth-of-type(1) > div',
      'div.x1n2onr6 > div > div:nth-of-type(1) > div',
      'div:nth-of-type(5) > div > div.x1n2onr6'
    ];

    for (const selector of recordedSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.boundingBox();
          if (isVisible && isVisible.width > 30 && isVisible.height > 20) {
            await element.click();
            console.log(`[${ACCOUNT_ID}] Share to group diklik dengan selector: ${selector}`);
            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    await page.waitForFunction(() => {
      return document.querySelectorAll('div[role="button"], button, div[role="option"], li[role="option"]').length > 0;
    }, { timeout: 10000 });

    const shareToGroupFound = await page.evaluate(() => {
      const shareToGroupTexts = [
        'Share to a group',
        'Share to group',
        'Bagikan ke grup',
        'Bagikan ke Grup',
        'Post in group',
        'Post to group'
      ];

      const allElements = document.querySelectorAll('div[role="button"], button, div[role="option"], li[role="option"]');

      for (const element of allElements) {
        const text = (element.textContent || '').trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').trim();

        for (const searchText of shareToGroupTexts) {
          if (text.toLowerCase().includes(searchText.toLowerCase()) ||
            ariaLabel.toLowerCase().includes(searchText.toLowerCase())) {
            const rect = element.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 20 && element.offsetParent !== null) {
              element.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (shareToGroupFound) {
      console.log(`[${ACCOUNT_ID}] Tombol 'Bagikan ke grup' diklik`);
      await delay(2000);
      return true;
    }

    throw new Error("Tidak dapat menemukan opsi 'Bagikan ke grup'");

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Error clicking share to group button:`, error.message);
    return false;
  }
}

// Function to select group from dropdown
async function selectGroupFromDropdown(page, groupName, timeout = 15000) {
  try {
    console.log(`[${ACCOUNT_ID}] Mencari grup: ${groupName}`);

    await delay(3000);

    const groupSelectors = [
      'div.xdj266r > div > div.x78zum5 > div > div > div:nth-of-type(2) > div > div:nth-of-type(1) div:nth-of-type(2) > span',
      'div.xdj266r span',
      'div.x78zum5 span'
    ];

    for (const selector of groupSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.boundingBox();
          if (isVisible && isVisible.width > 30 && isVisible.height > 10) {
            await element.click();
            console.log(`[${ACCOUNT_ID}] Grup dipilih dengan selector: ${selector}`);
            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    await page.waitForFunction(() => {
      const inputs = [
        ...document.querySelectorAll('input[type="text"]'),
        ...document.querySelectorAll('div[contenteditable="true"]'),
        ...document.querySelectorAll('[role="textbox"]'),
        ...document.querySelectorAll('[role="combobox"]')
      ];
      return inputs.length > 0;
    }, { timeout: 10000 });

    const inputFound = await page.evaluate(() => {
      const inputs = [
        ...document.querySelectorAll('input[type="text"]'),
        ...document.querySelectorAll('div[contenteditable="true"]'),
        ...document.querySelectorAll('[role="textbox"]'),
        ...document.querySelectorAll('[role="combobox"]'),
        ...document.querySelectorAll('input[placeholder*="Search"]'),
        ...document.querySelectorAll('input[placeholder*="Cari"]')
      ];

      for (const input of inputs) {
        const rect = input.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20 && input.offsetParent !== null) {
          input.focus();
          input.click();
          return true;
        }
      }
      return false;
    });

    if (inputFound) {
      console.log(`[${ACCOUNT_ID}] Input field ditemukan`);
      await delay(1500);

      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Delete');
      await delay(800);

      await page.keyboard.type(groupName, { delay: 120 });
      console.log(`[${ACCOUNT_ID}] Berhasil mengetik: ${groupName}`);

      await delay(4000);

      const optionSelected = await page.evaluate(() => {
        const optionSelectors = [
          'div[role="listbox"] div[role="option"]',
          'div[role="option"]',
          'ul[role="listbox"] li',
          'div[data-testid*="option"]',
          'li[role="option"]'
        ];

        for (const selector of optionSelectors) {
          const options = document.querySelectorAll(selector);
          for (const option of options) {
            const rect = option.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 20 && option.offsetParent !== null) {
              option.click();
              return true;
            }
          }
        }
        return false;
      });

      if (optionSelected) {
        console.log(`[${ACCOUNT_ID}] Grup dipilih dari dropdown`);
        await delay(2000);
        return true;
      }

      console.log(`[${ACCOUNT_ID}] Mencoba keyboard navigation...`);
      await page.keyboard.press('ArrowDown');
      await delay(1500);
      await page.keyboard.press('Enter');
      console.log(`[${ACCOUNT_ID}] Grup dipilih dengan keyboard`);
      await delay(2000);
      return true;
    }

    console.log(`[${ACCOUNT_ID}] Grup dipilih (fallback method)`);
    await delay(2000);
    return true;

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Error selecting group:`, error.message);
    return false;
  }
}

// Function to add caption with AI-generated content
async function addCaption(page, caption, timeout = 8000) {
  try {
    console.log(`[${ACCOUNT_ID}] Menambahkan caption: "${caption}"`);

    await delay(3000);

    const recordedSelectors = [
      'div:nth-of-type(4) div.xzsf02u',
      'div.xzsf02u',
      '[aria-label="Say something about this (optional)"]',
      '[aria-label*="Tulis sesuatu"]'
    ];

    for (const selector of recordedSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.boundingBox();
          if (isVisible && isVisible.width > 50 && isVisible.height > 20) {
            await element.click();
            console.log(`[${ACCOUNT_ID}] Caption area clicked, waiting ${config.ai_caption?.typing_delay_after_click || 3000}ms...`);
            await delay(config.ai_caption?.typing_delay_after_click || 3000);

            await element.focus();
            await delay(500);

            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Delete');
            await delay(800);

            await page.keyboard.type(caption, { delay: 120 });
            console.log(`[${ACCOUNT_ID}] Caption ditambahkan dengan selector: ${selector}`);

            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    await page.waitForFunction(() => {
      const captionSelectors = [
        'div[contenteditable="true"]',
        'textarea',
        'div[aria-label*="comment"]',
        'div[role="textbox"]'
      ];

      for (const selector of captionSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) return true;
      }
      return false;
    }, { timeout: 8000 });

    const captionAdded = await page.evaluate((caption) => {
      const captionSelectors = [
        'div[contenteditable="true"]',
        'textarea',
        'div[aria-label*="comment"]',
        'div[aria-label*="Write"]',
        'div[aria-label*="Tulis"]',
        'div[role="textbox"]',
        '[data-testid*="comment"]'
      ];

      for (const selector of captionSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 30 && element.offsetParent !== null) {
            element.focus();
            element.click();

            if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
              element.value = caption;
            } else {
              element.textContent = caption;
              element.innerText = caption;
            }

            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

            return true;
          }
        }
      }
      return false;
    }, caption);

    if (captionAdded) {
      console.log(`[${ACCOUNT_ID}] Caption ditambahkan dengan fallback method`);
      await delay(2000);
      return true;
    }

    console.log(`[${ACCOUNT_ID}] Mencoba menambahkan caption dengan keyboard...`);
    await page.keyboard.type(caption, { delay: 120 });
    await delay(2000);
    return true;

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Error adding caption:`, error.message);
    return false;
  }
}

// Function to click post button
async function clickPostButton(page, timeout = 15000) {
  try {
    console.log(`[${ACCOUNT_ID}] Mencari tombol Post...`);

    await delay(3000);

    const recordedSelectors = [
      'div.x1uvtmcs > div > div > div > div > div.x78zum5 div.x1l90r2v span > span',
      'div.x1uvtmcs span > span',
      'div.x1l90r2v span > span'
    ];

    for (const selector of recordedSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.boundingBox();
          const text = await element.evaluate(el => el.textContent);

          if (isVisible && isVisible.width > 20 && isVisible.height > 10 &&
            text && text.toLowerCase().includes('post')) {
            await element.click();
            console.log(`[${ACCOUNT_ID}] Tombol Post diklik dengan selector: ${selector}`);
            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    await page.waitForFunction(() => {
      const buttons = [
        ...document.querySelectorAll('button[type="submit"]'),
        ...document.querySelectorAll('div[role="button"]'),
        ...document.querySelectorAll('button')
      ];
      return buttons.length > 0;
    }, { timeout: 10000 });

    const postClicked = await page.evaluate(() => {
      const buttonTexts = ['Post', 'Posting', 'Kirim', 'Share', 'Bagikan', 'Publish'];

      const buttons = [
        ...document.querySelectorAll('button[type="submit"]'),
        ...document.querySelectorAll('div[role="button"]'),
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('[data-testid*="post"]'),
        ...document.querySelectorAll('[data-testid*="share"]')
      ];

      for (const button of buttons) {
        const text = (button.textContent || '').trim();
        const ariaLabel = (button.getAttribute('aria-label') || '').trim();

        for (const searchText of buttonTexts) {
          if (text.toLowerCase().includes(searchText.toLowerCase()) ||
            ariaLabel.toLowerCase().includes(searchText.toLowerCase())) {

            const rect = button.getBoundingClientRect();
            const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';

            if (rect.width > 30 && rect.height > 20 &&
              !isDisabled &&
              button.offsetParent !== null) {

              button.click();
              return { success: true, text: text || ariaLabel };
            }
          }
        }
      }
      return { success: false };
    });

    if (postClicked.success) {
      console.log(`[${ACCOUNT_ID}] Tombol Post diklik: "${postClicked.text}"`);
      await delay(2000);
      return true;
    }

    console.log(`[${ACCOUNT_ID}] Mencoba keyboard shortcut Ctrl+Enter...`);
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');

    await delay(1500);

    console.log(`[${ACCOUNT_ID}] Mencoba tombol Enter...`);
    await page.keyboard.press('Enter');
    await delay(1000);

    return true;

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Error clicking post button:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  let browser = null;
  let page = null;

  console.log(`[${ACCOUNT_ID}] === FacebookPro Blaster - Auto Share Reels dengan AI Caption (OpenRouter Enhanced) ===`);
  console.log(`[${ACCOUNT_ID}] Working directory: ${process.cwd()}`);

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const groups = await loadTargetGroups();
    const reels = await loadReelsUrls();
    const cookies = await loadCookiesFromFile();

    console.log(`[${ACCOUNT_ID}] Loaded ${groups.length} target groups`);
    console.log(`[${ACCOUNT_ID}] Loaded ${reels.length} reels URLs`);
    console.log(`[${ACCOUNT_ID}] Loaded ${cookies.length} cookies`);

    let geminiKeys = [];
    let openRouterKeys = [];

    if (config.ai_caption?.enabled) {
      geminiKeys = await loadGeminiKeys();

      if (config.ai_caption.use_openrouter !== false) {
        openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);
        console.log(`[${ACCOUNT_ID}] Loaded ${openRouterKeys.length} OpenRouter API keys`);
      }

      console.log(`[${ACCOUNT_ID}] Loaded ${geminiKeys.length} Gemini API keys (fallback)`);
      console.log(`[${ACCOUNT_ID}] AI Caption enabled: OpenRouter → Gemini → Static`);
      console.log(`[${ACCOUNT_ID}] Current caption style: ${config.ai_caption?.current_style || 'default'}`);
    } else {
      console.log(`[${ACCOUNT_ID}] AI Caption disabled, will use static text: "${config.ai_caption?.static_text}"`);
    }

    console.log(`[${ACCOUNT_ID}] Meluncurkan stealth browser...`);

    // Create stealth browser with anti-detection
    const stealthResult = await createStealthBrowser({
      headless: config.headless,
      timeout: 90000,
      protocolTimeout: 180000,
      defaultTimeout: 60000,
      navigationTimeout: 90000
    }, ACCOUNT_ID);

    browser = stealthResult.browser;
    page = stealthResult.page;

    await page.setCookie(...cookies);

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const reelUrl = reels[Math.floor(Math.random() * reels.length)];

      console.log(`[${ACCOUNT_ID}] [${i + 1}/${groups.length}] Membagikan ke grup: ${group}`);
      console.log(`[${ACCOUNT_ID}] Reels URL: ${reelUrl}`);

      try {
        console.log(`[${ACCOUNT_ID}] Navigating to Facebook...`);
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
        await delay(4000);

        const loginCheck = await page.evaluate(() => {
          const title = document.title.toLowerCase();
          const url = window.location.href.toLowerCase();

          if (title.includes('log') || title.includes('login') ||
            url.includes('login') || url.includes('checkpoint')) {
            return { loggedIn: false, issue: 'login_required' };
          }

          const fbElements = [
            'div[role="main"]',
            '[data-testid="royal_login_form"]',
            'div[data-pagelet="root"]'
          ];

          for (const selector of fbElements) {
            if (document.querySelector(selector)) {
              return { loggedIn: true, issue: null };
            }
          }

          return { loggedIn: false, issue: 'unknown' };
        });

        if (!loginCheck.loggedIn) {
          throw new Error(`[${ACCOUNT_ID}] Tidak berhasil login ke Facebook. Issue: ${loginCheck.issue}. Periksa cookies.json!`);
        }

        console.log(`[${ACCOUNT_ID}] Navigating to Reels: ${reelUrl}`);
        await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await delay(6000);

        // Extract video caption
        console.log(`[${ACCOUNT_ID}] Step 0: Extracting video caption...`);
        const videoCaption = await extractVideoCaption(page);

        // Step 1: Click share button
        console.log(`[${ACCOUNT_ID}] Step 1: Mengklik tombol Share...`);
        const shareClicked = await clickShareButton(page, 15000);
        if (!shareClicked) {
          throw new Error("Gagal mengklik tombol Share");
        }
        await delay(5000);

        // Step 2: Click "Share to Group"
        console.log(`[${ACCOUNT_ID}] Step 2: Mengklik 'Bagikan ke grup'...`);
        const shareToGroupClicked = await clickShareToGroupButton(page, 15000);
        if (!shareToGroupClicked) {
          throw new Error("Gagal mengklik 'Bagikan ke grup'");
        }
        await delay(5000);

        // Step 3: Select group
        console.log(`[${ACCOUNT_ID}] Step 3: Memilih grup...`);
        const groupName = group.split("/").pop() || group;
        const groupSelected = await selectGroupFromDropdown(page, groupName, 20000);
        if (!groupSelected) {
          throw new Error(`Gagal memilih grup: ${groupName}`);
        }
        await delay(4000);

        // Step 4: Generate AI caption
        console.log(`[${ACCOUNT_ID}] Step 4: Generating AI caption with OpenRouter...`);
        let generatedCaption;

        if (config.ai_caption?.enabled && (openRouterKeys.length > 0 || geminiKeys.length > 0)) {
          const promptStyle = config.ai_caption?.current_style || "default";
          const promptTemplate = config.ai_caption?.prompts?.[promptStyle] || config.ai_caption?.prompts?.default || "Buat caption menarik untuk reels ini: '{VIDEO_CAPTION}'.";

          const result = await generateAiComment({
            caption: videoCaption,
            ctaLink: "",
            prompt: promptTemplate,
            openRouterKeys: openRouterKeys,
            geminiKeys: geminiKeys,
            staticComments: [config.ai_caption?.static_text || "Lihat video ini!"],
            geminiWorkingIndex: 0,
            accountId: ACCOUNT_ID
          });

          generatedCaption = result.comment;
          console.log(`[${ACCOUNT_ID}] -> Using ${result.provider} caption${result.model ? ` (${result.model})` : ''}`);
        } else {
          generatedCaption = config.ai_caption?.static_text || "Lihat video ini!";
          console.log(`[${ACCOUNT_ID}] -> Using static caption`);
        }

        console.log(`[${ACCOUNT_ID}] Step 5: Menambahkan caption...`);
        const captionAdded = await addCaption(page, generatedCaption, 10000);
        if (!captionAdded) {
          console.log(`[${ACCOUNT_ID}] Warning: Gagal menambahkan caption, lanjut tanpa caption.`);
        } else {
          console.log(`[${ACCOUNT_ID}] Caption berhasil ditambahkan: "${generatedCaption}"`);
        }
        await delay(4000);

        // Step 6: Click post button
        console.log(`[${ACCOUNT_ID}] Step 6: Mengklik tombol Post...`);
        const postClicked = await clickPostButton(page, 20000);
        if (postClicked) {
          console.log(`[${ACCOUNT_ID}] Berhasil share ke: ${group}`);
          console.log(`[${ACCOUNT_ID}] Caption: "${generatedCaption}"`);

          const successMsg = `Reels shared with AI caption: "${generatedCaption.substring(0, 50)}${generatedCaption.length > 50 ? '...' : ''}"`;
          await notify.success(ACCOUNT_ID, BOT_NAME, successMsg);

          await delay(6000);
        } else {
          console.log(`[${ACCOUNT_ID}] Gagal posting ke: ${group}`);
        }

        if (i < groups.length - 1) {
          const interval = getRandomInterval();
          console.log(`[${ACCOUNT_ID}] Jeda ${interval / 1000} detik sebelum grup berikutnya...`);
          await delay(interval);
        }

      } catch (error) {
        console.error(`[${ACCOUNT_ID}] Gagal share ke ${group}:`, error.message);

        await notify.error(ACCOUNT_ID, BOT_NAME, `Failed to share to ${group}: ${error.message}`);

        try {
          const screenshotPath = path.join(ARTIFACTS_DIR, `share_error_${Date.now()}.png`);
          await page.screenshot({
            path: screenshotPath,
            fullPage: false
          });
          console.log(`[${ACCOUNT_ID}] Screenshot error disimpan: ${screenshotPath}`);
        } catch (screenshotError) {
          console.error(`[${ACCOUNT_ID}] Gagal mengambil screenshot:`, screenshotError.message);
        }

        try {
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await delay(3000);
        } catch (recoveryError) {
          console.error(`[${ACCOUNT_ID}] Recovery navigation failed:`, recoveryError.message);
        }

        continue;
      }
    }

    console.log(`[${ACCOUNT_ID}] === Semua tugas selesai ===`);
    await notify.success(ACCOUNT_ID, BOT_NAME, `All ${groups.length} groups processed successfully`);

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Fatal Error:`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, `Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`[${ACCOUNT_ID}] Browser ditutup.`);
      } catch (e) {
        console.error(`[${ACCOUNT_ID}] Error closing browser:`, e.message);
      }
    }
  }
}

process.on('SIGINT', async () => {
  console.log(`\n[${ACCOUNT_ID}] Script dihentikan oleh user`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[${ACCOUNT_ID}] Received SIGTERM, shutting down...`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${ACCOUNT_ID}] Unhandled Rejection at:`, promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(`[${ACCOUNT_ID}] Uncaught Exception:`, error);
  process.exit(1);
});

main();
