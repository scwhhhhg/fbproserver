const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

// Multi-account support
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'confirm';

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    maxConfirms: 3,
    minIntervalSeconds: 8,
    maxIntervalSeconds: 15,
    send_greeting_message: true,
    greeting_message: "Halo, salam kenal kak",
    send_sticker_after_message: true,
    friend_limits: {
      enabled: true,
      max_per_hour: 15,
      max_per_day: 50
    }
  };
}

// Paths
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const LOG_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "friend_confirm_log.txt");

// Telegram logger
const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ========================================
// HELPERS
// ========================================
async function loadCookiesFromFile() {
  const cookiesData = await fs.readFile(COOKIES_PATH, "utf8");
  const cookies = JSON.parse(cookiesData);

  return cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || '.facebook.com',
    path: cookie.path || '/',
    httpOnly: !!cookie.httpOnly,
    secure: !!cookie.secure,
    sameSite: cookie.sameSite || 'Lax'
  }));
}

async function checkFriendLimits() {
  try {
    const logData = await fs.readFile(LOG_PATH, 'utf8');
    const lines = logData.split('\n').filter(line => line.trim());

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let confirmsPastHour = 0;
    let confirmsPastDay = 0;

    for (const line of lines) {
      if (line.includes('CONFIRMED')) {
        const timestampMatch = line.match(/\[(.*?)\]/);
        if (timestampMatch) {
          const timestamp = new Date(timestampMatch[1]);
          if (timestamp > oneHourAgo) confirmsPastHour++;
          if (timestamp > oneDayAgo) confirmsPastDay++;
        }
      }
    }

    const limits = config.friend_limits;
    if (limits?.enabled) {
      if (confirmsPastHour >= (limits.max_per_hour || 15)) {
        throw new Error(`Hourly limit: ${confirmsPastHour}/${limits.max_per_hour}`);
      }
      if (confirmsPastDay >= (limits.max_per_day || 50)) {
        throw new Error(`Daily limit: ${confirmsPastDay}/${limits.max_per_day}`);
      }
    }

    console.log(`[${ACCOUNT_ID}] 📊 Limits: ${confirmsPastHour}h, ${confirmsPastDay}d`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function waitForPageLoad(page, description = 'page') {
  console.log(`[${ACCOUNT_ID}] ⏳ Waiting for ${description} to load...`);

  try {
    await page.waitForFunction(() => document.readyState === 'complete', {
      timeout: 30000
    });
    console.log(`[${ACCOUNT_ID}] ✅ Document ready`);
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Document timeout, continuing...`);
  }

  try {
    await page.waitForSelector('[role="main"], [role="navigation"]', {
      timeout: 15000,
      visible: true
    });
    console.log(`[${ACCOUNT_ID}] ✅ Main content visible`);
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Main content timeout`);
  }

  await delay(8000);

  const hasContent = await page.evaluate(() => {
    const indicators = [
      '[role="main"]',
      '[role="navigation"]',
      'div[data-testid]',
      'a[href*="facebook.com"]',
      'div[role="article"]'
    ];

    let found = 0;
    for (const sel of indicators) {
      if (document.querySelector(sel)) found++;
    }

    return found >= 2;
  });

  if (hasContent) {
    console.log(`[${ACCOUNT_ID}] ✅ ${description} loaded successfully`);
  } else {
    console.log(`[${ACCOUNT_ID}] ⚠️ ${description} may not be fully loaded`);
    await delay(5000);
  }
}

async function navigateWithRetry(page, url, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${ACCOUNT_ID}] 🌐 Navigating to ${url} (attempt ${attempt}/${maxRetries})...`);

      await page.goto(url, {
        waitUntil: 'load',
        timeout: 60000
      });

      await waitForPageLoad(page, url.split('/').pop() || 'page');

      const title = await page.title();
      console.log(`[${ACCOUNT_ID}] ✅ Loaded: ${title}`);
      return true;

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Navigation attempt ${attempt} failed: ${error.message}`);

      if (attempt < maxRetries) {
        console.log(`[${ACCOUNT_ID}] 🔄 Retrying in 5s...`);
        await delay(5000);
      } else {
        console.log(`[${ACCOUNT_ID}] ⚠️ Proceeding despite navigation issues...`);
      }
    }
  }

  return false;
}

// ========================================
// **NEW**: SCROLL FUNCTION TO LOAD MORE REQUESTS
// ========================================
async function scrollToLoadRequests(page) {
  console.log(`[${ACCOUNT_ID}] 📜 Scrolling to load all friend requests...`);

  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight > 3000) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    await delay(3000);
    console.log(`[${ACCOUNT_ID}] ✅ Scroll complete`);
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Scroll error: ${error.message}`);
  }
}

// ========================================
// IMPROVED FRIEND REQUEST EXTRACTION
// ========================================
async function getFriendRequests(page) {
  console.log(`[${ACCOUNT_ID}] 🔍 Extracting friend requests...`);

  // **FIX 1**: Scroll to load all requests
  await scrollToLoadRequests(page);

  await delay(3000);

  try {
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, `friends_page_${Date.now()}.png`),
      fullPage: false
    });
    console.log(`[${ACCOUNT_ID}] 📸 Screenshot saved`);
  } catch (e) { }

  let friendRequests = [];

  try {
    const result = await page.evaluate(() => {
      const requests = [];
      const debug = [];

      try {
        const confirmElements = Array.from(document.querySelectorAll('div[role="button"], span, a, button'))
          .filter(el => {
            const text = (el.textContent || '').trim();
            return text === 'Konfirmasi' || text === 'Confirm';
          });

        debug.push(`Found ${confirmElements.length} potential confirm buttons.`);

        for (let i = 0; i < confirmElements.length; i++) {
          const confirmElement = confirmElements[i];
          let container = null;

          let current = confirmElement;
          for (let j = 0; j < 8; j++) {
            if (!current.parentElement) break;
            current = current.parentElement;
            const text = current.textContent || '';

            const hasConfirm = text.includes('Konfirmasi') || text.includes('Confirm');
            const hasDelete = text.includes('Hapus') || text.includes('Delete');
            const hasProfileLink = current.querySelector('a[href*="facebook.com/"], a[href^="/"]');

            if (hasConfirm && hasDelete && hasProfileLink) {
              container = current;
              debug.push(`Found a valid container for button ${i}.`);
              break;
            }
          }

          if (!container) {
            debug.push(`Could not find a valid container for button ${i}. It might be a different UI element.`);
            continue;
          }

          const uniqueId = `confirm-btn-${Date.now()}-${i}`;
          confirmElement.setAttribute('data-bot-confirm-id', uniqueId);

          let name = 'Unknown';
          let profileLink = '';

          const profileLinks = Array.from(container.querySelectorAll('a[href*="facebook.com/"], a[href^="/"]'));
          const nameLink = profileLinks.find(link => {
            const linkText = (link.textContent || '').trim();
            return linkText.length > 2 && !['Konfirmasi', 'Confirm', 'Hapus', 'Delete'].includes(linkText);
          });

          if (nameLink) {
            name = (nameLink.textContent || '').trim();
            profileLink = nameLink.href;
          }

          if (name === 'Unknown') {
            debug.push(`Could not extract a valid name from container ${i}.`);
            continue;
          }

          let mutualFriendsCount = 0;
          const containerText = container.textContent || '';
          const mutualMatch = containerText.match(/(\d+)\s*(teman bersama|mutual)/i);
          if (mutualMatch) {
            mutualFriendsCount = parseInt(mutualMatch[1]);
          }

          let deleteId = null;
          const deleteElements = Array.from(container.querySelectorAll('div[role="button"], span, a, button'))
            .filter(el => {
              const text = (el.textContent || '').trim();
              return text === 'Hapus' || text === 'Delete';
            });

          if (deleteElements.length > 0) {
            const deleteElement = deleteElements[0];
            deleteId = `delete-btn-${Date.now()}-${i}`;
            deleteElement.setAttribute('data-bot-delete-id', deleteId);
          }

          const img = container.querySelector('img[src*="scontent"], img[src*="fbcdn"]');
          const hasProfilePhoto = !!(img && img.src && !img.src.includes('silhouette') && !img.src.includes('default'));

          debug.push(`✅ Extracted: ${name} (${mutualFriendsCount} mutual, photo: ${hasProfilePhoto})`);
          requests.push({
            name,
            profileLink,
            mutualFriendsCount,
            hasProfilePhoto,
            confirmId: uniqueId,
            deleteId: deleteId
          });
        }

        return { requests, debug };
      } catch (error) {
        debug.push(`Fatal error in evaluation: ${error.message}`);
        return { requests: [], debug };
      }
    });

    console.log(`[${ACCOUNT_ID}] 🛠 Debug output:`);
    if (result && result.debug) {
      result.debug.forEach(msg => console.log(`  ${msg}`));
    }

    friendRequests = (result && result.requests) ? result.requests : [];

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] ❌ Error extracting requests:`, error.message);
    friendRequests = [];
  }

  console.log(`[${ACCOUNT_ID}] 📋 Found ${friendRequests.length} friend requests`);

  if (friendRequests.length === 0) {
    console.log(`[${ACCOUNT_ID}] ℹ️  No requests found, checking page content...`);
    try {
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        hasArticles: document.querySelectorAll('[role="article"]').length,
        hasButtons: document.querySelectorAll('[role="button"]').length,
        bodyText: document.body.innerText.substring(0, 500)
      }));
      console.log(`[${ACCOUNT_ID}] 📄 Page info:`, JSON.stringify(pageInfo, null, 2));
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Could not get page info`);
    }
  }

  return friendRequests;
}


// ========================================
// ACTIONS
// ========================================
async function confirmFriendRequest(page, request) {
  try {
    console.log(`[${ACCOUNT_ID}] ✅ Confirming: ${request.name}`);

    const clicked = await page.evaluate((confirmId) => {
      const btn = document.querySelector(`[data-bot-confirm-id="${confirmId}"]`);
      if (!btn) return false;

      let clickable = btn;
      for (let i = 0; i < 5; i++) {
        const style = window.getComputedStyle(clickable);
        if (style.cursor === 'pointer' && clickable.click) {
          clickable.click();
          return true;
        }
        if (!clickable.parentElement) break;
        clickable = clickable.parentElement;
      }

      btn.click();
      return true;
    }, request.confirmId);

    if (!clicked) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Button not found`);
      return false;
    }

    await delay(4000);
    console.log(`[${ACCOUNT_ID}] ✅ Confirmed`);
    return true;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ❌ Error: ${error.message}`);
    return false;
  }
}

async function deleteFriendRequest(page, request, reason) {
  try {
    console.log(`[${ACCOUNT_ID}] 🗑️ Deleting: ${request.name}`);

    if (!request.deleteId) {
      console.log(`[${ACCOUNT_ID}] ⚠️ No delete button ID`);
      return false;
    }

    const clicked = await page.evaluate((deleteId) => {
      const btn = document.querySelector(`[data-bot-delete-id="${deleteId}"]`);
      if (!btn) return false;

      let clickable = btn;
      for (let i = 0; i < 5; i++) {
        const style = window.getComputedStyle(clickable);
        if (style.cursor === 'pointer' && clickable.click) {
          clickable.click();
          return true;
        }
        if (!clickable.parentElement) break;
        clickable = clickable.parentElement;
      }

      btn.click();
      return true;
    }, request.deleteId);

    if (!clicked) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Delete button not found`);
      return false;
    }

    await delay(2000);

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] DELETED: ${request.name} | Reason: ${reason}\n`;
    await fs.appendFile(LOG_PATH, logEntry);

    console.log(`[${ACCOUNT_ID}] 🗑️ Deleted`);
    return true;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ❌ Error: ${error.message}`);
    return false;
  }
}

async function openProfileAndSendGreeting(page, request) {
  try {
    console.log(`[${ACCOUNT_ID}] 👤 Opening profile to send greeting...`);

    if (!request.profileLink) {
      console.log(`[${ACCOUNT_ID}] ⚠️ No profile link`);
      return false;
    }

    await page.goto(request.profileLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(5000);

    await waitForPageLoad(page, 'profile');

    // Step 1: Click the 'Kirim pesan' / 'Message' button
    console.log(`[${ACCOUNT_ID}] 💬 Looking for Message button...`);
    const messageButtonClicked = await page.evaluate(() => {
      const selectors = [
        'div.x1ifrov1 > div > div > div:nth-of-type(2) span > span',
        'span:has-text("Kirim pesan")',
        'span:has-text("Message")'
      ];

      // Try text-based search
      const allElements = Array.from(document.querySelectorAll('div[role="button"], span'));
      for (const el of allElements) {
        const text = (el.textContent || '').trim();
        if (text === 'Kirim pesan' || text === 'Message') {
          el.click();
          return true;
        }
      }

      return false;
    });

    if (!messageButtonClicked) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Message button not found`);
      return false;
    }

    await delay(5000); // Wait for chat box to fully load

    // Step 2: Click on the message input area
    console.log(`[${ACCOUNT_ID}] 📝 Clicking message input area...`);
    const inputClicked = await page.evaluate(() => {
      // Find the contenteditable div with role textbox
      const selectors = [
        'div[aria-hidden="true"][role="textbox"]',
        'div[aria-label*="Pesan"][role="textbox"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[aria-label*="Pesan"]',
        'div[aria-label*="Message"]',
        'p[dir="auto"]',
        'p[data-text="true"]'
      ];

      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input) {
          input.click();
          input.focus();
          return true;
        }
      }

      // Fallback: find by role paragraph inside message area
      const paragraphs = Array.from(document.querySelectorAll('p[role="paragraph"]'));
      for (const p of paragraphs) {
        if (p.closest('div[role="textbox"]')) {
          p.click();
          return true;
        }
      }

      return false;
    });

    if (!inputClicked) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Could not click message input`);
    }

    await delay(1500);

    // Step 3: Type the greeting message character by character
    const greetingMessage = config.greeting_message || "Halo, salam kenal kak";
    console.log(`[${ACCOUNT_ID}] ⌨️  Typing message: "${greetingMessage}"`);

    // Type slowly to mimic human behavior
    for (const char of greetingMessage) {
      await page.keyboard.type(char, { delay: 50 + Math.random() * 50 });
    }

    await delay(1000); // Small pause after typing

    // Step 4: Press Enter to send message (DIRECT APPROACH)
    console.log(`[${ACCOUNT_ID}] 📤 Pressing Enter to send...`);
    await page.keyboard.press('Enter');

    await delay(3000); // Wait for message to be sent

    // Verify message was sent by checking if input is cleared
    const messageWasSent = await page.evaluate(() => {
      const input = document.querySelector('div[contenteditable="true"][role="textbox"]');
      if (input) {
        const text = input.textContent || '';
        return text.trim().length === 0; // Input should be empty after sending
      }
      return true; // Assume sent if we can't find input
    });

    if (messageWasSent) {
      console.log(`[${ACCOUNT_ID}] ✅ Greeting message sent!`);
    } else {
      console.log(`[${ACCOUNT_ID}] ⚠️ Message may not have been sent, retrying...`);
      // Try Enter one more time
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    return true;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Greeting error: ${error.message}`);
    return false;
  }
}

async function sendStickerToProfile(page, request) {
  try {
    console.log(`[${ACCOUNT_ID}] 😊 Sending sticker...`);

    // Chat should already be open from previous greeting message
    // If not, open it
    const isChatOpen = await page.evaluate(() => {
      return !!document.querySelector('div[role="textbox"]');
    });

    if (!isChatOpen) {
      console.log(`[${ACCOUNT_ID}] 📱 Opening chat first...`);
      if (!request.profileLink) {
        console.log(`[${ACCOUNT_ID}] ⚠️ No profile link`);
        return false;
      }

      await page.goto(request.profileLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(3000);

      // Click message button
      const messageButtonClicked = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('div[role="button"], span'));
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text === 'Kirim pesan' || text === 'Message') {
            el.click();
            return true;
          }
        }
        return false;
      });

      if (!messageButtonClicked) {
        console.log(`[${ACCOUNT_ID}] ⚠️ Could not open chat`);
        return false;
      }

      await delay(5000);
    }

    // Click the sticker button (from recording selector)
    console.log(`[${ACCOUNT_ID}] 🎨 Clicking sticker button...`);
    const stickerButtonClicked = await page.evaluate(() => {
      // From recording: div.x2lah0s > div > div > div > span > div > div.x9f619 > div
      const selectors = [
        'div.x2lah0s > div > div > div > span > div > div.x9f619 > div',
        'div.x2lah0s div.x9f619',
        '[aria-label*="sticker"]',
        '[aria-label*="Stiker"]',
        'div[role="button"][aria-label*="Send"]'
      ];

      for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn) {
          btn.click();
          return true;
        }
      }

      // Fallback: look for any button near the message input that might be the sticker button
      const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
      for (const btn of buttons) {
        const ariaLabel = btn.getAttribute('aria-label') || '';
        if (ariaLabel.toLowerCase().includes('sticker') ||
          ariaLabel.toLowerCase().includes('stiker') ||
          ariaLabel.toLowerCase().includes('like') ||
          ariaLabel.toLowerCase().includes('suka')) {
          btn.click();
          return true;
        }
      }

      return false;
    });

    if (!stickerButtonClicked) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Sticker button not found`);
      return false;
    }

    await delay(2000);
    console.log(`[${ACCOUNT_ID}] ✅ Sticker sent!`);

    return true;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Sticker error: ${error.message}`);
    return false;
  }
}

// ========================================
// SAFETY CHECKS - REMOVED (Accept all requests)
// ========================================
async function shouldAcceptFriendRequest(request) {
  console.log(`[${ACCOUNT_ID}] 🔍 Checking: ${request.name}`);

  // Accept all requests (no memory check, no safety checks)
  console.log(`[${ACCOUNT_ID}] ✅ Accepting request`);
  return { accept: true, reason: 'auto_accept' };
}

async function returnToFriendsTab(page) {
  console.log(`[${ACCOUNT_ID}] ↩️  Returning to Friends...`);

  try {
    await navigateWithRetry(page, 'https://www.facebook.com/friends', 1);
    console.log(`[${ACCOUNT_ID}] ✅ Returned`);
    return true;
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Return error: ${error.message}`);
    return false;
  }
}

// ========================================
// **NEW**: REFRESH PAGE AFTER EACH CONFIRM
// ========================================
async function refreshFriendsPage(page) {
  console.log(`[${ACCOUNT_ID}] 🔄 Refreshing page to load new requests...`);

  try {
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await waitForPageLoad(page, 'friends page');
    console.log(`[${ACCOUNT_ID}] ✅ Page refreshed`);
    return true;
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Refresh error: ${error.message}`);
    return false;
  }
}

// ========================================
// MAIN
// ========================================
async function main() {
  let browser = null;

  try {
    console.log(`[${ACCOUNT_ID}] === FacebookPro Blaster - Auto Confirm Friends ===`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    await checkFriendLimits();

    console.log(`[${ACCOUNT_ID}] 🍪 Loading cookies...`);
    const cookies = await loadCookiesFromFile();

    console.log(`[${ACCOUNT_ID}] 🚀 Launching browser...`);
    browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ],
      defaultViewport: {
        width: 1280,
        height: 1024,
        deviceScaleFactor: 1  // **FIX**: Normal zoom level
      },
      timeout: 90000
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(60000);

    // **FIX**: Set appropriate viewport matching common monitor sizes
    await page.setViewport({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.setCookie(...cookies);
    console.log(`[${ACCOUNT_ID}] 🍪 ${cookies.length} cookies loaded`);

    await navigateWithRetry(page, 'https://www.facebook.com/');

    const title = await page.title();
    if (title.includes('Log') || title.includes('login')) {
      throw new Error(`Login failed!`);
    }

    console.log(`[${ACCOUNT_ID}] ✅ Login successful`);

    await navigateWithRetry(page, 'https://www.facebook.com/friends');

    let confirmedCount = 0;
    let deletedCount = 0;
    let messagesSent = 0;
    let stickersSent = 0;
    const maxConfirms = config.maxConfirms || 3;

    console.log(`[${ACCOUNT_ID}] 🎯 Target: ${maxConfirms} confirms`);

    // **FIX 3**: Process multiple requests with refresh cycle
    let cycleCount = 0;
    const maxCycles = maxConfirms * 2; // Prevent infinite loops

    while (confirmedCount < maxConfirms && cycleCount < maxCycles) {
      cycleCount++;
      console.log(`\n[${ACCOUNT_ID}] 🔄 === CYCLE ${cycleCount} ===`);

      const friendRequests = await getFriendRequests(page);

      if (friendRequests.length === 0) {
        console.log(`[${ACCOUNT_ID}] ℹ️  No more requests found`);
        break;
      }

      let processedInCycle = 0;

      for (const request of friendRequests) {
        if (confirmedCount >= maxConfirms) {
          console.log(`[${ACCOUNT_ID}] 🛑 Limit reached`);
          break;
        }

        try {
          const decision = await shouldAcceptFriendRequest(request);

          if (decision.accept) {
            const confirmed = await confirmFriendRequest(page, request);
            if (confirmed) {
              confirmedCount++;
              processedInCycle++;

              const timestamp = new Date().toISOString();
              const logEntry = `[${timestamp}] CONFIRMED: ${request.name} | Mutual: ${request.mutualFriendsCount}\n`;
              await fs.appendFile(LOG_PATH, logEntry);

              console.log(`[${ACCOUNT_ID}] 📊 Progress: ${confirmedCount}/${maxConfirms}`);

              // Refresh page after confirm to get fresh requests
              if (confirmedCount < maxConfirms) {
                await delay(3000);
                await refreshFriendsPage(page);
                await delay(3000);
              }

              // Send greeting message after confirming (optional)
              if (config.send_greeting_message !== false && confirmedCount < maxConfirms) {
                const messageSent = await openProfileAndSendGreeting(page, request);
                if (messageSent) {
                  messagesSent++;

                  // Wait before sending sticker
                  await delay(3000);

                  // Send sticker after message (optional)
                  if (config.send_sticker_after_message !== false) {
                    const stickerSent = await sendStickerToProfile(page, request);
                    if (stickerSent) stickersSent++;
                  }
                }

                // Wait before closing chat to ensure everything is sent
                await delay(3000);

                // Verify chat is still open before trying to close
                const isChatOpen = await page.evaluate(() => {
                  return !!document.querySelector('div[role="textbox"], div[aria-label*="Pesan"]');
                });

                if (isChatOpen) {
                  console.log(`[${ACCOUNT_ID}] 🚪 Closing chat...`);
                  try {
                    await page.keyboard.press('Escape');
                    await delay(2000);
                  } catch (e) {
                    console.log(`[${ACCOUNT_ID}] ⚠️ Could not close chat with Escape`);
                  }
                } else {
                  console.log(`[${ACCOUNT_ID}] ℹ️  Chat already closed`);
                }

                await returnToFriendsTab(page);
                await delay(2000);
              }

              // Break inner loop to get fresh requests
              break;
            }
          } else {
            // This branch should never happen now since we accept all
            const deleted = await deleteFriendRequest(page, request, decision.reason);
            if (deleted) {
              deletedCount++;
              processedInCycle++;
            }
          }

          const minInterval = (config.minIntervalSeconds || 8) * 1000;
          const maxInterval = (config.maxIntervalSeconds || 15) * 1000;
          const waitTime = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;

          console.log(`[${ACCOUNT_ID}] ⏳ Waiting ${waitTime / 1000}s...\n`);
          await delay(waitTime);

        } catch (error) {
          console.log(`[${ACCOUNT_ID}] ❌ Error: ${error.message}`);
          try { await returnToFriendsTab(page); } catch (e) { }
          continue;
        }
      }

      // If no requests were processed in this cycle, break
      if (processedInCycle === 0 && friendRequests.length > 0) {
        console.log(`[${ACCOUNT_ID}] ℹ️  All visible requests already processed`);
        break;
      }
    }

    // Memory save removed - no longer needed (accept all requests)

    console.log(`\n[${ACCOUNT_ID}] === COMPLETE ===`);
    console.log(`[${ACCOUNT_ID}] ✅ Confirmed: ${confirmedCount}`);
    console.log(`[${ACCOUNT_ID}] 💬 Messages sent: ${messagesSent}`);
    console.log(`[${ACCOUNT_ID}] 😊 Stickers sent: ${stickersSent}`);
    console.log(`[${ACCOUNT_ID}] 🔄 Cycles: ${cycleCount}`);

    const successDetails = `${confirmedCount} confirmed (${messagesSent} messages, ${stickersSent} stickers)`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, `friends_success_${Date.now()}.png`)
    });

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] ❌ ERROR:`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        await pages[0].screenshot({
          path: path.join(ARTIFACTS_DIR, `friends_error_${Date.now()}.png`),
          fullPage: true
        });
      } catch (e) { }
    }

    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[${ACCOUNT_ID}] 🔒 Browser closed`);
    }
  }
}

process.on('SIGINT', () => {
  console.log(`\n[${ACCOUNT_ID}] 🛑 Stopped by user`);
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[${ACCOUNT_ID}] ❌ Unhandled rejection:`, reason);
  process.exit(1);
});

main();
