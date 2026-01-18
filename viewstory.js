const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

const notify = require('./notify');

// Multi-account support
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'viewstory';

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
  console.log(`[${ACCOUNT_ID}] ✓ Config loaded from: ${configPath}`);
} catch (e) {
  console.log(`[${ACCOUNT_ID}] ⚠️ Config file not found (${e.message}), using default config`);
  config = {
    headless: true,
    targetURL: "https://www.facebook.com/stories",
    storiesToView: 10,
    minIntervalSeconds: 3,
    maxIntervalSeconds: 8,
    autoLike: true,
    watchDuration: 5000, // Duration to watch each story (ms)
    storiesPerSet: 5 // Number of stories to watch per person/set before moving to next
  };
}

// Paths
const LOG_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "story_viewed.txt");
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () => 1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

// ========================================
// RETRY MECHANISM
// ========================================

async function retryOperation(operation, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`[${ACCOUNT_ID}] Attempt ${attempt} failed: ${error.message}`);

      if (attempt === maxRetries) {
        throw error;
      }

      const delayTime = baseDelay * Math.pow(2, attempt - 1);
      console.log(`[${ACCOUNT_ID}] Retrying in ${delayTime}ms...`);
      await delay(delayTime);
    }
  }
}

// ========================================
// LIKE STORY FUNCTION (Click on canvas)
// ========================================

async function likeStory(page) {
  try {
    console.log(`[${ACCOUNT_ID}] -> Trying to like story...`);

    // Based on recording: Click on canvas element (bottom left area for like)
    const canvas = await page.$('div.x4k7w5x canvas');

    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        // Click on left side of canvas (like button area) - from recording offset
        const clickX = box.x + 28;
        const clickY = box.y + box.height - 21;

        await page.mouse.click(clickX, clickY);
        console.log(`[${ACCOUNT_ID}] -> Story liked via canvas click`);
        await delay(1000);
        return;
      }
    }

    // Fallback: Try traditional selectors
    const likeSelectors = [
      'div[aria-label="Suka"], div[aria-label="Like"]',
      'div[role="button"][aria-label*="Suka"], div[role="button"][aria-label*="Like"]',
      'div[aria-pressed="false"][aria-label*="Suka"], div[aria-pressed="false"][aria-label*="Like"]'
    ];

    let likeClicked = false;

    for (const selector of likeSelectors) {
      try {
        const likeButtons = await page.$$(selector);

        for (const likeBtn of likeButtons) {
          const isVisible = await likeBtn.boundingBox();
          const isPressed = await likeBtn.evaluate(el => el.getAttribute('aria-pressed') === 'true');

          if (isVisible && !isPressed) {
            await likeBtn.click({ delay: 100 });
            console.log(`[${ACCOUNT_ID}] -> Story liked successfully`);
            likeClicked = true;
            break;
          }
        }

        if (likeClicked) break;
      } catch (e) {
        continue;
      }
    }

    if (!likeClicked) {
      console.log(`[${ACCOUNT_ID}] -> Like button not found or already liked`);
    }

    await delay(800);

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] -> Failed to like: ${error.message}`);
  }
}

// ========================================
// NEXT STORY IN SAME SET (Arrow button)
// ========================================

async function clickNextInSet(page) {
  try {
    console.log(`[${ACCOUNT_ID}] -> Clicking next story in set...`);

    // Based on recording: Click on next arrow (right side)
    const nextArrowSelectors = [
      'div[aria-label="Bucket Selanjutnya"]',
      'div.x1q0g3np > div:nth-of-type(3) svg', // From recording
      'div.x1q0g3np > div:nth-of-type(3)',
      'div[aria-label="Berikutnya"], div[aria-label="Next"]'
    ];

    for (const selector of nextArrowSelectors) {
      try {
        const nextBtn = await page.$(selector);
        if (nextBtn) {
          const isVisible = await nextBtn.boundingBox();
          if (isVisible) {
            await nextBtn.click({ delay: 100 });
            console.log(`[${ACCOUNT_ID}] -> Clicked next arrow`);
            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    console.log(`[${ACCOUNT_ID}] -> Next arrow not found`);
    return false;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] -> Failed to click next: ${error.message}`);
    return false;
  }
}

// ========================================
// CLICK NEXT STORY CARD (Different person)
// ========================================

async function clickNextStoryCard(page, currentIndex = 0) {
  try {
    console.log(`[${ACCOUNT_ID}] -> Looking for next story card...`);

    // Try multiple selector strategies
    const nextCardClicked = await page.evaluate((index) => {
      // Strategy 1: Using the original working selector
      let storyCards = document.querySelectorAll('div.x1rg5ohu span > span');

      console.log(`Strategy 1: Found ${storyCards.length} story cards (x1rg5ohu)`);

      if (storyCards.length > 0) {
        for (let i = index; i < storyCards.length; i++) {
          const card = storyCards[i];
          if (card && card.offsetParent !== null) {
            card.click();
            console.log(`Clicked story card at index ${i} (Strategy 1)`);
            return i + 1;
          }
        }
      }

      // Strategy 2: Try x1iyjqo2 pattern from recording
      storyCards = document.querySelectorAll('div.x1iyjqo2');

      console.log(`Strategy 2: Found ${storyCards.length} story cards (x1iyjqo2)`);

      for (let i = index; i < storyCards.length; i++) {
        const card = storyCards[i];

        // Look for the clickable span inside
        const clickableSpan = card.querySelector('div > div > div:nth-of-type(2) > span');

        if (clickableSpan && clickableSpan.offsetParent !== null) {
          clickableSpan.click();
          console.log(`Clicked story card at index ${i} (Strategy 2)`);
          return i + 1;
        }
      }

      // Strategy 3: Generic story card selectors
      const genericSelectors = [
        'div[role="button"][aria-label*="story" i]',
        'a[href*="/stories/"]',
        'div[data-pagelet*="StoriesCard"]'
      ];

      for (const selector of genericSelectors) {
        storyCards = document.querySelectorAll(selector);
        console.log(`Strategy 3 (${selector}): Found ${storyCards.length} cards`);

        if (storyCards.length > index) {
          for (let i = index; i < storyCards.length; i++) {
            if (storyCards[i] && storyCards[i].offsetParent !== null) {
              storyCards[i].click();
              console.log(`Clicked story card at index ${i} (Strategy 3)`);
              return i + 1;
            }
          }
        }
      }

      return -1; // Not found
    }, currentIndex);

    if (nextCardClicked > 0) {
      console.log(`[${ACCOUNT_ID}] -> Opened next story set (index: ${nextCardClicked})`);
      await delay(3000);
      return nextCardClicked;
    }

    console.log(`[${ACCOUNT_ID}] -> No more story cards available`);
    return -1;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] -> Failed to click next card: ${error.message}`);
    return -1;
  }
}

// ========================================
// COOKIE & FILE LOADING
// ========================================

async function loadCookiesFromFile() {
  try {
    const cookiesData = await fs.readFile(COOKIES_PATH, "utf8");
    const cookies = JSON.parse(cookiesData);

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
    if (error.code === 'ENOENT') {
      throw new Error(`[${ACCOUNT_ID}] cookies.json not found!`);
    }
    throw new Error(`[${ACCOUNT_ID}] Failed to load cookies: ${error.message}`);
  }
}

async function loadLog() {
  try {
    const data = await fs.readFile(LOG_PATH, "utf8");
    return new Set(data.split("\n").filter(line => line.trim() !== ""));
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
}

async function appendToLog(storyId) {
  await fs.appendFile(LOG_PATH, `${storyId}\n`);
}

// ========================================
// ENHANCED NAVIGATION
// ========================================

async function navigateToUrlSafely(page, url, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const timeout = options.timeout || 90000;

  console.log(`[${ACCOUNT_ID}] Navigating to: ${url}`);

  return await retryOperation(async () => {
    try {
      await page.goto('about:blank');
      await delay(1000);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeout
      });

      console.log(`[${ACCOUNT_ID}] Page loaded successfully: ${url}`);

    } catch (error) {
      console.error(`[${ACCOUNT_ID}] Navigation failed: ${error.message}`);

      if (error.message.includes('timeout')) {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeout
        });
        console.log(`[${ACCOUNT_ID}] Navigation successful with simple strategy`);
      } else {
        throw error;
      }
    }
  }, maxRetries);
}

// ========================================
// STORY VIEWER FUNCTION
// ========================================

async function watchStory(page, duration) {
  try {
    console.log(`[${ACCOUNT_ID}] -> Watching story for ${duration / 1000}s...`);
    await delay(duration);
    console.log(`[${ACCOUNT_ID}] -> Story watched`);
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] -> Error watching story: ${error.message}`);
  }
}

// ========================================
// MAIN FUNCTION
// ========================================

async function main() {
  let browser;

  try {
    console.log(`[${ACCOUNT_ID}] === FacebookPro Blaster - Auto View Story ===`);
    console.log(`[${ACCOUNT_ID}] Auto-like enabled: ${config.autoLike !== false ? 'Yes' : 'No'}`);
    console.log(`[${ACCOUNT_ID}] Watch duration: ${config.watchDuration / 1000}s per story`);
    console.log(`[${ACCOUNT_ID}] Stories per set: ${config.storiesPerSet || 5}`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const targetURL = config.targetURL || "https://www.facebook.com/stories";
    console.log(`[${ACCOUNT_ID}] 🎯 Target: ${targetURL}`);

    console.log(`[${ACCOUNT_ID}] Launching browser...`);

    // Create stealth browser with anti-detection
    const stealthResult = await createStealthBrowser({
      headless: config.headless,
      timeout: 90000,
      protocolTimeout: 180000,
      defaultTimeout: 60000,
      navigationTimeout: 90000
    }, ACCOUNT_ID);

    browser = stealthResult.browser;
    const page = stealthResult.page;

    console.log(`[${ACCOUNT_ID}] Loading cookies...`);
    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(`[${ACCOUNT_ID}] ${cookies.length} cookies loaded`);

    console.log(`[${ACCOUNT_ID}] Navigating to Stories...`);
    await navigateToUrlSafely(page, targetURL, {
      maxRetries: 3,
      timeout: 90000
    });

    // Wait for stories to load
    console.log(`[${ACCOUNT_ID}] Waiting for stories to load (8s)...`);
    await delay(8000);

    // Check if there are stories available
    const storiesAvailable = await page.evaluate(() => {
      // Try multiple selectors to detect stories
      const selector1 = document.querySelectorAll('div.x1rg5ohu span > span');
      const selector2 = document.querySelectorAll('div.x1iyjqo2');
      const selector3 = document.querySelectorAll('div[role="button"][aria-label*="story" i]');

      console.log(`Story detection: x1rg5ohu=${selector1.length}, x1iyjqo2=${selector2.length}, aria-label=${selector3.length}`);

      return selector1.length > 0 || selector2.length > 0 || selector3.length > 0;
    });

    if (!storiesAvailable) {
      console.log(`[${ACCOUNT_ID}] No stories found on the page`);
      throw new Error("No stories available to view");
    }

    console.log(`[${ACCOUNT_ID}] Stories detected, ready to start viewing`);

    const log = await loadLog();
    let storiesViewed = 0;
    let currentStoryCardIndex = 0;
    const storiesPerSet = config.storiesPerSet || 5;

    console.log(`[${ACCOUNT_ID}] Target: ${config.storiesToView} stories`);

    // Main loop: iterate through story cards (different people)
    while (storiesViewed < config.storiesToView) {

      // Open story card
      console.log(`[${ACCOUNT_ID}]\n=== Opening story set #${currentStoryCardIndex + 1} ===`);

      const cardIndex = await clickNextStoryCard(page, currentStoryCardIndex);

      if (cardIndex < 0) {
        console.log(`[${ACCOUNT_ID}] No more story cards available`);
        break;
      }

      currentStoryCardIndex = cardIndex;

      // Watch stories in this set
      let storiesInSet = 0;

      while (storiesInSet < storiesPerSet && storiesViewed < config.storiesToView) {
        try {
          // Wait for story to load
          await delay(1500);

          // Get current story info
          const storyInfo = await page.evaluate(() => {
            const url = window.location.href;
            const storyIdMatch = url.match(/story_fbid=(\d+)/);

            const viewerDialog = document.querySelector('#viewer_dialog');

            if (storyIdMatch) {
              return {
                id: storyIdMatch[1],
                url: url
              };
            }

            if (viewerDialog) {
              const storyElement = viewerDialog.querySelector('[data-story-id]');
              if (storyElement) {
                return {
                  id: storyElement.getAttribute('data-story-id'),
                  url: url
                };
              }
            }

            return {
              id: `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              url: url
            };
          });

          console.log(`[${ACCOUNT_ID}] -> Story ${storiesInSet + 1}/${storiesPerSet} in set | Total: ${storiesViewed + 1}/${config.storiesToView}`);
          console.log(`[${ACCOUNT_ID}] -> ID: ${storyInfo.id.substring(0, 30)}...`);

          // Check if already viewed
          if (log.has(storyInfo.id)) {
            console.log(`[${ACCOUNT_ID}] -> Already viewed, skipping...`);

            // Try to move to next in set
            const hasNext = await clickNextInSet(page);
            if (!hasNext) {
              console.log(`[${ACCOUNT_ID}] -> No more stories in this set`);
              break;
            }

            storiesInSet++;
            continue;
          }

          // Watch the story
          await watchStory(page, config.watchDuration || 5000);

          // Like if enabled
          if (config.autoLike !== false) {
            await likeStory(page);
          }

          // Log the view
          await appendToLog(storyInfo.id);
          log.add(storyInfo.id);
          storiesViewed++;
          storiesInSet++;

          console.log(`[${ACCOUNT_ID}] -> ✓ Story viewed and logged`);

          // If not the last story, wait and move to next in set
          if (storiesInSet < storiesPerSet && storiesViewed < config.storiesToView) {
            const interval = getRandomInterval();
            console.log(`[${ACCOUNT_ID}] Waiting ${interval / 1000}s...`);
            await delay(interval);

            // Click next arrow to go to next story in same set
            const hasNext = await clickNextInSet(page);

            if (!hasNext) {
              console.log(`[${ACCOUNT_ID}] -> No more stories in this set (reached end)`);
              break;
            }
          }

        } catch (error) {
          console.error(`[${ACCOUNT_ID}] -> Error in story: ${error.message}`);

          // Try to continue to next story in set
          try {
            const hasNext = await clickNextInSet(page);
            if (!hasNext) break;
          } catch (e) {
            break;
          }
        }
      }

      console.log(`[${ACCOUNT_ID}] -> Finished viewing ${storiesInSet} stories in this set`);

      // If we haven't reached target, wait before opening next story card
      if (storiesViewed < config.storiesToView) {
        const interval = getRandomInterval();
        console.log(`[${ACCOUNT_ID}] Waiting ${interval / 1000}s before next story set...`);
        await delay(interval);

        // Close current viewer by pressing Escape
        try {
          await page.keyboard.press('Escape');
          await delay(2000);
        } catch (e) {
          console.log(`[${ACCOUNT_ID}] Could not close viewer, continuing...`);
        }
      }
    }

    console.log(`[${ACCOUNT_ID}] === COMPLETE ===`);
    const successDetails = `Total stories viewed: ${storiesViewed}/${config.storiesToView}`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);
    console.log(`[${ACCOUNT_ID}] ${successDetails}`);

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Fatal error:`, error.message);

    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        const errorScreenshot = path.join(ARTIFACTS_DIR, `error_${Date.now()}.png`);
        await page.screenshot({
          path: errorScreenshot,
          fullPage: false
        });
        console.log(`[${ACCOUNT_ID}] Error screenshot: ${errorScreenshot}`);

        await notify.error(ACCOUNT_ID, BOT_NAME, error.message, errorScreenshot);
      } catch (e) {
        console.error(`[${ACCOUNT_ID}] Screenshot failed`);
      }
    }

    process.exit(1);
  } finally {
    if (browser) {
      try {
        const pages = await browser.pages();
        for (const page of pages) {
          try {
            await page.close();
          } catch (e) {
            // Ignore
          }
        }

        await delay(2000);

        await browser.close();
        console.log(`[${ACCOUNT_ID}] Browser closed`);

        await delay(3000);

      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Cleanup error: ${e.message}`);
      }
    }
  }
}

process.on('SIGINT', () => {
  console.log(`\n[${ACCOUNT_ID}] Bot stopped by user`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[${ACCOUNT_ID}] Received SIGTERM, shutting down...`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${ACCOUNT_ID}] Unhandled Rejection:`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(`[${ACCOUNT_ID}] Uncaught Exception:`, error);
  process.exit(1);
});

main();
