/**
 * Cloudflare Worker for FacebookPro Blaster - SECURE BUNDLE
 * Version: 2.3.0 (Multi-Bot Logic Vault)
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        const authHeader = request.headers.get("X-FBPro-Auth");
        const secret = env.AUTH_SECRET || "PLACEHOLDER_SECRET";
        if (authHeader !== secret) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401, headers: { "Content-Type": "application/json" }
            });
        }

        if (path === "/selectors") {
            const selectors = {
                facebook: {
                    feed: "div[role='article'][aria-posinset], div[data-pagelet^='FeedUnit']",
                    post_container: "div[role='article']",
                    like_button_primary: "div[data-ad-rendering-role='like_button'] > div[role='button']",
                    like_button_aria: "div[role='button'][aria-label='Suka'], div[role='button'][aria-label='Like']",
                    like_labels: ["Suka", "Like", "Sukai"],
                    already_liked_labels: ["Hapus suka", "Unlike", "Remove like"],
                    toolbar: "div[role='toolbar']",
                    progressbar: "[role='progressbar']",
                    post_link: "a[href*='/posts/'], a[href*='/permalink/']"
                },
                videocomment: {
                    like_selector: 'div.x1pq812k > div:nth-of-type(1) div.xuk3077 > div > div > div > div > div > div:nth-of-type(1) svg',
                    comment_panel_selector: 'div.x1pq812k > div:nth-of-type(1) div.xuk3077 > div > div > div > div > div > div:nth-of-type(2) svg',
                    next_video_selector: 'div.x1r8uery > div.x78zum5 > div:nth-of-type(2) svg',
                    caption_selectors: [
                        'div[role="complementary"] div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u span[dir="auto"]',
                        'div[aria-label*="Caption"]', 'div[aria-label*="Keterangan"]', 'div[dir="auto"]'
                    ]
                }
            };
            return new Response(JSON.stringify(selectors), { headers: { "Content-Type": "application/json" } });
        }

        if (path === "/logic") {
            const logic = {
                autolike: { scroll_ratio: 0.8, max_scroll_attempts: 50, max_resets: 3, min_delay: 5000, max_delay: 15000 },
                videocomment: { caption_wait_timeout: 3000, panel_wait_timeout: 10000, next_video_wait_timeout: 5000 }
            };
            return new Response(JSON.stringify(logic), { headers: { "Content-Type": "application/json" } });
        }

        if (path === "/script") {
            const name = url.searchParams.get("name");
            const scripts = {
            "autolike": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
// Immediate startup log to stderr (always captured)
console.error('[AUTOLIKE STARTUP] Script starting...');
console.error('[AUTOLIKE STARTUP] __dirname:', __dirname);
console.error('[AUTOLIKE STARTUP] process.cwd():', process.cwd());
console.error('[AUTOLIKE STARTUP] ACCOUNT_ID env:', process.env.ACCOUNT_ID);

// REMOVED: Anti-detection is now lazy-loaded inside main() to avoid spawn() race condition
// let antiDetection;
// try {
//   process.stderr.write('[AUTOLIKE STARTUP] About to require anti-detection...\\n');
//   antiDetection = require('./anti-detection');
//   process.stderr.write('[AUTOLIKE STARTUP] anti-detection loaded successfully\\n');
// } catch (e) {
//   process.stderr.write('[AUTOLIKE STARTUP] FATAL: Failed to load anti-detection: ' + e.message + '\\n');
//   process.stderr.write('[AUTOLIKE STARTUP] Error name: ' + e.name + '\\n');
//   process.stderr.write('[AUTOLIKE STARTUP] Stack: ' + e.stack + '\\n');
//   process.stderr.write('[AUTOLIKE STARTUP] Attempted path: ./anti-detection\\n');
//   process.stderr.write('[AUTOLIKE STARTUP] __dirname: ' + __dirname + '\\n');

//   // Try to list files in current directory
//   try {
//     const fs = require('fs');
//     const files = fs.readdirSync(__dirname);
//     process.stderr.write('[AUTOLIKE STARTUP] Files in __dirname: ' + files.join(', ') + '\\n');
//   } catch (listErr) {
//     process.stderr.write('[AUTOLIKE STARTUP] Could not list directory\\n');
//   }

//   process.exit(1);
// }

// const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = antiDetection;
const fs = require("fs").promises;
const path = require("path");

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

console.error('[AUTOLIKE STARTUP] Variables set - ACCOUNT_ID:', ACCOUNT_ID, 'BOT_NAME:', BOT_NAME);

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  console.log(\`[\${ACCOUNT_ID}] Loading config from: \${configPath}\`);
  config = require(configPath);
  console.log(\`[\${ACCOUNT_ID}] Config loaded successfully\`);
} catch (e) {
  console.log(\`[\${ACCOUNT_ID}] Config file not found, using defaults\`);
  config = {
    headless: "new",
    targetURL: "https://www.facebook.com/",
    postsToLike: 20,
    minIntervalSeconds: 5,
    maxIntervalSeconds: 15,
    blockAds: false, // Disabled by default
    blockKeywords: ["slot", "gacor", "maxwin", "bet", "toto", "mahjong"]
  };
}

console.log(\`[\${ACCOUNT_ID}] Config headless: \${config.headless}\`);

// Paths
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");

// Telegram logger
const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () => {
  const min = config.minIntervalSeconds || 5;
  const max = config.maxIntervalSeconds || 15;
  return 1000 * (Math.floor(Math.random() * (max - min + 1)) + min);
};

// Helper: Safe screenshot
async function safeScreenshot(page, filepath, options = {}) {
  try {
    if (!page || page.isClosed()) return false;
    await page.screenshot({ path: filepath, timeout: 5000, ...options });
    return true;
  } catch (error) {
    return false;
  }
}

// Helper: Check if error is fatal
function isFatalError(error) {
  const fatalMessages = ['Target closed', 'Session closed', 'Protocol error'];
  return fatalMessages.some(msg => error.message && error.message.includes(msg));
}

async function containsBlockedKeywords(post, keywords) {
  try {
    // Get text content only from visible elements within post
    const postText = await post.evaluate((postElement) => {
      // Get text from visible elements only
      const visibleElements = Array.from(postElement.querySelectorAll('*'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            el.offsetWidth > 0 &&
            el.offsetHeight > 0;
        });

      return visibleElements.map(el => el.textContent).join(' ').toLowerCase();
    });

    // Check for exact keyword matches or keyword as part of a word
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();

      // Check for exact match
      if (postText.includes(lowerKeyword)) {
        // Additional check: make sure it's not part of a larger word
        const words = postText.split(/\\s+/);
        for (const word of words) {
          if (word === lowerKeyword) {
            return true;
          }
        }
      }
    }

    return false;
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Error checking blocked keywords: \${error.message}\`);
    return false;
  }
}

// SIMPLIFIED: Only check for blocked keywords, no sponsored detection
async function shouldBlockPost(post, blockKeywords) {
  // Only check for blocked keywords
  if (blockKeywords && blockKeywords.length > 0) {
    const hasBlockedKeywords = await containsBlockedKeywords(post, blockKeywords);
    if (hasBlockedKeywords) {
      console.log(\`[\${ACCOUNT_ID}] -> Post contains BLOCKED KEYWORDS - SKIPPING\`);
      return true;
    }
  }

  return false;
}

async function likePost(page, post) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Trying to like post...\`);

    // Strategy 1: Find Like button within post scope using specific selectors
    const likeResult = await post.evaluate((postElement) => {
      // Function to check if element or its children contain Like/Suka
      const isLikeButton = (element) => {
        const ariaLabel = element.getAttribute('aria-label') || '';
        const text = element.textContent || '';

        // Check for like-related text
        const hasLikeText = ariaLabel.match(/^(suka|like|sukai)$/i) ||
          text.match(/^(suka|like|sukai)$/i);

        // Must not be already liked
        const isPressed = element.getAttribute('aria-pressed') === 'true';
        const alreadyLiked = ariaLabel.includes('Hapus suka') ||
          ariaLabel.includes('Unlike') ||
          ariaLabel.includes('Remove like');

        return hasLikeText && !isPressed && !alreadyLiked;
      };

      // NEW: Primary selector for like button
      const primaryLikeButton = postElement.querySelector('div[data-ad-rendering-role="like_button"]');
      if (primaryLikeButton) {
        const rect = primaryLikeButton.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 15 && primaryLikeButton.offsetParent !== null) {
          primaryLikeButton.click();
          return { success: true, method: 'primary-like-button', label: 'Like Button' };
        }
      }

      // Strategy 1a: Find by exact aria-label within post
      const likeByAriaLabel = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .find(btn => {
          const label = (btn.getAttribute('aria-label') || '').trim();
          return (label === 'Suka' || label === 'Like' || label === 'Sukai') &&
            btn.getAttribute('aria-pressed') !== 'true' &&
            btn.offsetParent !== null;
        });

      if (likeByAriaLabel) {
        const rect = likeByAriaLabel.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 15) {
          likeByAriaLabel.click();
          return { success: true, method: 'aria-label', label: likeByAriaLabel.getAttribute('aria-label') };
        }
      }

      // Strategy 1b: Find first clickable button in reactions toolbar
      const toolbars = Array.from(postElement.querySelectorAll('div[role="toolbar"]'));
      for (const toolbar of toolbars) {
        // Get immediate child buttons only (not nested)
        const buttons = Array.from(toolbar.children).filter(child =>
          child.getAttribute('role') === 'button' ||
          child.tagName === 'DIV' && child.hasAttribute('tabindex')
        );

        if (buttons.length >= 2) { // Typically: Like, Comment, Share
          const firstBtn = buttons[0];

          // Verify it's a like button
          if (isLikeButton(firstBtn)) {
            const rect = firstBtn.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 15 && firstBtn.offsetParent !== null) {
              firstBtn.click();
              return { success: true, method: 'toolbar-first', label: firstBtn.getAttribute('aria-label') || firstBtn.textContent };
            }
          }
        }
      }

      // Strategy 1c: Find by SVG icon (thumbs up) within clickable button
      const buttonsWithSvg = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .filter(btn => btn.querySelector('svg'));

      for (const btn of buttonsWithSvg) {
        if (isLikeButton(btn)) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && btn.offsetParent !== null) {
            btn.click();
            return { success: true, method: 'svg-icon', label: btn.getAttribute('aria-label') || 'Like' };
          }
        }
      }

      // Strategy 1d: Find by text content matching (last resort)
      const allInteractive = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"], div[tabindex="0"]'));

      for (const element of allInteractive) {
        const text = (element.textContent || '').trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').trim();

        if ((text === 'Suka' || text === 'Like' || ariaLabel === 'Suka' || ariaLabel === 'Like') &&
          element.getAttribute('aria-pressed') !== 'true' &&
          !ariaLabel.includes('Hapus') &&
          !ariaLabel.includes('Unlike')) {

          const rect = element.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && element.offsetParent !== null) {
            element.click();
            return { success: true, method: 'text-match', label: ariaLabel || text };
          }
        }
      }

      return { success: false };
    });

    if (likeResult.success) {
      console.log(\`[\${ACCOUNT_ID}] -> Post liked successfully (\${likeResult.method})\`);
      await delay(1000);
      return true;
    }

    console.log(\`[\${ACCOUNT_ID}] -> Like button not found or already liked\`);
    await delay(1000);
    return false;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to like: \${error.message}\`);
    return false;
  }
}

async function loadCookiesFromFile() {
  try {
    console.log(\`[\${ACCOUNT_ID}] Loading cookies from: \${COOKIES_PATH}\`);
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
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load cookies: \${error.message}\`);
  }
}

async function main() {
  // Lazy-load anti-detection to avoid spawn() race condition
  console.error('[AUTOLIKE] Lazy-loading anti-detection inside main()...');

  // Small delay to ensure process is fully initialized
  await new Promise(resolve => setTimeout(resolve, 100));

  let createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups;
  try {
    console.error('[AUTOLIKE] About to require anti-detection...');
    const antiDetection = require('./anti-detection');
    console.error('[AUTOLIKE] Require completed, extracting exports...');
    createStealthBrowser = antiDetection.createStealthBrowser;
    applyAntiDetection = antiDetection.applyAntiDetection;
    humanDelay = antiDetection.humanDelay;
    dismissFacebookPopups = antiDetection.dismissFacebookPopups;
    console.error('[AUTOLIKE] Anti-detection loaded successfully');
  } catch (e) {
    console.error('[AUTOLIKE] FATAL: Failed to load anti-detection:', e.message);
    console.error('[AUTOLIKE] Stack:', e.stack);
    process.exit(1);
  }

  let browser;

  try {
    console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto Like ===\`);
    console.log(\`[\${ACCOUNT_ID}] Ad Blocking: \${config.blockAds !== false ? 'Enabled' : 'Disabled'}\`);

    if (config.blockKeywords && config.blockKeywords.length > 0) {
      console.log(\`[\${ACCOUNT_ID}] Blocked keywords: \${config.blockKeywords.join(', ')}\`);
    }

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    console.log(\`[\${ACCOUNT_ID}] Target: \${config.postsToLike} likes\`);

    // Determine headless mode
    const isProduction = process.env.NODE_ENV === 'production';
    const headlessMode = isProduction
      ? 'new'
      : (config.headless !== undefined ? config.headless : 'new');

    // Removed verbose logs to reduce clutter
    // console.log(\`[\${ACCOUNT_ID}] Environment: \${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}\`);
    // console.log(\`[\${ACCOUNT_ID}] Headless mode: \${headlessMode} \${isProduction ? '(forced for VPS)' : '(from config)'}\`);

    // Create stealth browser with anti-detection
    const stealthResult = await createStealthBrowser({
      headless: headlessMode,
      timeout: 90000,
      protocolTimeout: 180000,
      defaultTimeout: 60000,
      navigationTimeout: 90000
    }, ACCOUNT_ID);

    browser = stealthResult.browser;
    const page = stealthResult.page;

    console.log(\`[\${ACCOUNT_ID}] Loading cookies...\`);
    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(\`[\${ACCOUNT_ID}] \${cookies.length} cookies loaded\`);

    console.log(\`[\${ACCOUNT_ID}] Navigating to: \${config.targetURL}\`);
    try {
      await page.goto(config.targetURL, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
    } catch (navError) {
      console.log(\`[\${ACCOUNT_ID}] Navigation timeout, continuing...\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Waiting for Facebook to finish loading...\`);

    // Wait for loading spinner to disappear and feed to appear
    let feedReady = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    while (!feedReady && attempts < maxAttempts) {
      feedReady = await page.evaluate(() => {
        // Check if loading spinner is gone
        const loadingSpinner = document.querySelector('[role="progressbar"]');
        const hasLoadingIndicator = loadingSpinner && loadingSpinner.offsetParent !== null;

        // Check if feed elements exist
        const feedElements = document.querySelectorAll('div[role="article"], div[role="feed"]');
        const hasFeedElements = feedElements.length > 0;

        // Check if we're not on a blank/loading page
        const bodyText = document.body.textContent || '';
        const notBlankPage = bodyText.length > 100;

        return !hasLoadingIndicator && hasFeedElements && notBlankPage;
      });

      if (!feedReady) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        if (attempts % 10 === 0) {
          console.log(\`[\${ACCOUNT_ID}] Still waiting for feed to load... (\${attempts}s)\`);
        }
      }
    }

    if (!feedReady) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Feed did not load within timeout, continuing anyway...\`);
    } else {
      console.log(\`[\${ACCOUNT_ID}] ✓ Feed loaded successfully after \${attempts}s\`);
    }

    // Additional wait to ensure everything is settled
    console.log(\`[\${ACCOUNT_ID}] Waiting for content to stabilize (5s)...\`);
    await delay(5000);

    // Dismiss any popups (notifications, translate, etc)
    await dismissFacebookPopups(page, ACCOUNT_ID);

    const title = await page.title();
    if (title.includes('Log') || title.includes('login')) {
      throw new Error(\`[\${ACCOUNT_ID}] Login failed! Check cookies.json\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Page ready: \${title}\`);

    // Additional wait to ensure posts are fully rendered
    console.log(\`[\${ACCOUNT_ID}] Ensuring posts are fully rendered...\`);
    await delay(5000);

    // Scroll a bit to trigger lazy loading
    await page.evaluate(() => {
      window.scrollBy(0, 300);
    });
    await delay(2000);

    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await delay(3000);

    // Validate that posts with like buttons are actually loaded
    console.log(\`[\${ACCOUNT_ID}] Validating that like buttons are rendered...\`);
    const hasLikeButtons = await page.evaluate(() => {
      const posts = document.querySelectorAll("div[role='article'], div[aria-posinset]");
      for (const post of posts) {
        const likeButton = post.querySelector('div[role="button"][aria-label*="Suka"], div[role="button"][aria-label*="Like"]');
        if (likeButton) {
          return true;
        }
      }
      return false;
    });

    if (!hasLikeButtons) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Warning: No like buttons found yet. Taking screenshot for debugging...\`);

      // Take screenshot to see what's on the page
      const debugScreenshot = path.join(ARTIFACTS_DIR, \`debug_no_like_buttons_\${Date.now()}.png\`);
      await safeScreenshot(page, debugScreenshot, { fullPage: true });
      console.log(\`[\${ACCOUNT_ID}] Debug screenshot saved: \${debugScreenshot}\`);

      console.log(\`[\${ACCOUNT_ID}] Waiting additional 10s...\`);
      await delay(10000);

      // Check again after waiting
      const hasLikeButtonsNow = await page.evaluate(() => {
        const posts = document.querySelectorAll("div[role='article'], div[aria-posinset]");
        for (const post of posts) {
          const likeButton = post.querySelector('div[role="button"][aria-label*="Suka"], div[role="button"][aria-label*="Like"]');
          if (likeButton) {
            return true;
          }
        }
        return false;
      });

      if (!hasLikeButtonsNow) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Still no like buttons found. Check screenshot: \${debugScreenshot}\`);
      } else {
        console.log(\`[\${ACCOUNT_ID}] ✓ Like buttons now detected after additional wait\`);
      }
    } else {
      console.log(\`[\${ACCOUNT_ID}] ✓ Like buttons detected, ready to start\`);
    }

    const processedPosts = new Set();
    let postsLiked = 0;
    let lastProcessedIndex = -1;
    let noNewPostsCount = 0;

    // Circuit breaker to prevent extended execution
    let totalResets = 0;
    const maxResets = 3; // Max times to reset to top of page
    let totalScrollAttempts = 0;
    const maxScrollAttempts = 50; // Max scroll attempts total

    // Function to get unique post ID
    async function getPostId(post) {
      return await post.evaluate(el => {
        // Try to get post link first
        const postLink = el.querySelector('a[href*="/posts/"], a[href*="/permalink/"]');
        if (postLink) {
          const href = postLink.getAttribute('href');
          const match = href.match(/\\/posts\\/(\\d+)|\\/permalink\\/(\\d+)/);
          if (match) return \`post_\${match[1] || match[2]}\`;
        }

        // Fallback to content hash
        const content = el.textContent || '';
        const hash = content.substring(0, 100).replace(/\\s/g, '');
        const rect = el.getBoundingClientRect();
        return \`hash_\${Math.floor(rect.top)}_\${hash}\`;
      });
    }

    // Function to scroll to next post
    async function scrollToNextPost() {
      try {
        console.log(\`[\${ACCOUNT_ID}] -> Scrolling to load more posts...\`);

        await page.evaluate(() => {
          // Scroll down by viewport height
          window.scrollBy(0, window.innerHeight * 0.8);
        });

        await delay(2000);
        return true;
      } catch (error) {
        console.log(\`[\${ACCOUNT_ID}] -> Failed to scroll: \${error.message}\`);
        return false;
      }
    }

    while (postsLiked < config.postsToLike) {
      // Get all visible posts
      const posts = await page.$$("div[role='article'], div[aria-posinset]");

      if (posts.length === 0) {
        console.log(\`[\${ACCOUNT_ID}] No posts found. Waiting...\`);
        await delay(10000);
        noNewPostsCount++;
        if (noNewPostsCount > 5) {
          console.log(\`[\${ACCOUNT_ID}] No posts found after multiple attempts. Exiting.\`);
          break;
        }
        continue;
      }

      console.log(\`[\${ACCOUNT_ID}] Found \${posts.length} potential posts\`);

      // Reset counter when we find posts
      noNewPostsCount = 0;

      // Process posts sequentially from last processed index
      let foundNewPost = false;

      for (let i = Math.max(0, lastProcessedIndex + 1); i < posts.length; i++) {
        const post = posts[i];

        try {
          // Get unique post ID
          const postId = await getPostId(post);

          if (!postId) {
            console.log(\`[\${ACCOUNT_ID}] -> No valid postId, skipping\`);
            continue;
          }

          // Check if already processed in this session
          if (processedPosts.has(postId)) {
            console.log(\`[\${ACCOUNT_ID}] -> Post already processed, skipping\`);
            continue;
          }

          console.log(\`[\${ACCOUNT_ID}] -> Processing post \${i + 1}/\${posts.length} (ID: \${postId.substring(0, 30)}...)\`);

          // Ensure post is in viewport
          await post.evaluate(el => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });

          // Wait longer for like button to render
          console.log(\`[\${ACCOUNT_ID}] -> Waiting for post to fully render...\`);
          await delay(4000);

          // Check if post should be blocked (only keywords, no sponsored check)
          if (config.blockKeywords && config.blockKeywords.length > 0) {
            const shouldBlock = await shouldBlockPost(post, config.blockKeywords);
            if (shouldBlock) {
              processedPosts.add(postId);
              lastProcessedIndex = i;
              console.log(\`[\${ACCOUNT_ID}] -> Post SKIPPED (blocked keywords)\`);
              continue;
            }
          }

          // Like the post
          const likeSuccess = await likePost(page, post);

          if (likeSuccess) {
            postsLiked++;
            console.log(\`[\${ACCOUNT_ID}] -> ✓ Post liked successfully\`);
          } else {
            console.log(\`[\${ACCOUNT_ID}] -> ✗ Failed to like post\`);
          }

          processedPosts.add(postId);
          lastProcessedIndex = i;
          foundNewPost = true;

          // Mark post as processed
          await post.evaluate(el => {
            el.setAttribute('data-bot-processed', 'true');
            el.style.opacity = '0.7'; // Visual indicator (optional)
          });

          // Check if we've reached the target
          if (postsLiked >= config.postsToLike) {
            console.log(\`[\${ACCOUNT_ID}] Target reached: \${postsLiked}/\${config.postsToLike}\`);
            break;
          }

          // Wait random interval before processing next post
          const interval = getRandomInterval();
          console.log(\`[\${ACCOUNT_ID}] Waiting \${interval / 1000}s before next like...\`);
          await delay(interval);

          break; // Exit the for loop to re-query posts

        } catch (error) {
          console.error(\`[\${ACCOUNT_ID}] -> Failed to interact: \${error.message}\`);

          // Check if error is fatal (browser/page closed)
          if (isFatalError(error)) {
            console.error(\`[\${ACCOUNT_ID}] -> Fatal browser error detected, exiting...\`);
            throw error; // Re-throw to exit main loop
          }

          // Try to take screenshot
          const errorScreenshot = path.join(ARTIFACTS_DIR, \`autolike_error_\${Date.now()}.png\`);
          const screenshotTaken = await safeScreenshot(page, errorScreenshot, { fullPage: false });
          if (screenshotTaken) {
            console.log(\`[\${ACCOUNT_ID}] -> Error screenshot: \${errorScreenshot}\`);
          }

          // Mark as processed to avoid infinite loop
          if (postId) {
            processedPosts.add(postId);
          }
          lastProcessedIndex = i;

          continue;
        }
      }

      // If no new post was processed, scroll to load more
      if (!foundNewPost) {
        totalScrollAttempts++;
        noNewPostsCount++;

        console.log(\`[\${ACCOUNT_ID}] No new posts processed. Scrolling for more content... (Scroll \${totalScrollAttempts}/\${maxScrollAttempts})\`);

        // Circuit breaker: Check max scroll attempts
        if (totalScrollAttempts >= maxScrollAttempts) {
          console.log(\`[\${ACCOUNT_ID}] ⚠️ Circuit breaker: Max scroll attempts (\${maxScrollAttempts}) reached\`);
          console.log(\`[\${ACCOUNT_ID}] Exiting to prevent extended execution.\`);
          break;
        }

        await scrollToNextPost();
        lastProcessedIndex = -1; // Reset to start from beginning after scroll

        // If we've scrolled too much, reset to top
        if (noNewPostsCount > 3) {
          totalResets++;

          // Circuit breaker: Check max resets
          if (totalResets >= maxResets) {
            console.log(\`[\${ACCOUNT_ID}] ⚠️ Circuit breaker: Max page resets (\${maxResets}) reached\`);
            console.log(\`[\${ACCOUNT_ID}] Feed appears exhausted. Exiting gracefully.\`);
            break;
          }

          console.log(\`[\${ACCOUNT_ID}] Resetting to top of page... (Reset \${totalResets}/\${maxResets})\`);
          await page.evaluate(() => {
            window.scrollTo(0, 0);
          });
          await delay(2000);
          lastProcessedIndex = -1;
          noNewPostsCount = 0;
        }
      } else {
        // Reset counters when we successfully process a post
        noNewPostsCount = 0;
      }
    }

    console.log(\`[\${ACCOUNT_ID}] === COMPLETE ===\`);
    console.log(\`[\${ACCOUNT_ID}] Total posts liked: \${postsLiked}/\${config.postsToLike}\`);
    console.log(\`[\${ACCOUNT_ID}] Total scroll attempts: \${totalScrollAttempts}\`);
    console.log(\`[\${ACCOUNT_ID}] Total page resets: \${totalResets}\`);

    const successDetails = \`Likes: \${postsLiked}/\${config.postsToLike} | Scrolls: \${totalScrollAttempts} | Resets: \${totalResets}\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Fatal error:\`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    // Try to take final screenshot only if browser is still alive
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages && pages.length > 0) {
          const page = pages[0];
          if (page && !page.isClosed()) {
            const errorScreenshot = path.join(ARTIFACTS_DIR, \`fatal_error_\${Date.now()}.png\`);
            await page.screenshot({ path: errorScreenshot, fullPage: true, timeout: 5000 });
            console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${errorScreenshot}\`);
          }
        }
      } catch (screenshotError) {
        console.log(\`[\${ACCOUNT_ID}] -> Failed to take final screenshot: \${screenshotError.message}\`);
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
        console.log(\`[\${ACCOUNT_ID}] Browser closed\`);

        await delay(3000);

      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Cleanup error: \${e.message}\`);
      }
    }
  }
}

process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Bot stopped by user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] Unhandled Rejection:\`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] Uncaught Exception:\`, error);
  process.exit(1);
});

process.stderr.write('[AUTOLIKE STARTUP] About to call main()...\\n');
main().then(() => {
  process.stderr.write('[AUTOLIKE STARTUP] main() completed successfully\\n');
  process.exit(0);
}).catch((error) => {
  process.stderr.write('[AUTOLIKE STARTUP] main() failed: ' + error.message + '\\n');
  process.stderr.write('[AUTOLIKE STARTUP] Stack: ' + error.stack + '\\n');
  process.exit(1);
});
`,
            "timelinecomment": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

// Import AI comment generator module
const { generateAiComment, typeCommentSafely, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
// ACCOUNT_ID override
const ACCOUNTS_DIR = process.env.ACCOUNTS_DIR || path.join(__dirname, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    targetURL: "https://www.facebook.com/",
    postsToComment: 5,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    autoLike: true,
    blockAds: true,
    blockKeywords: ["sponsored", "bersponsor"],
    ai_settings: {
      use_openrouter: true,
      url_shortener_enabled: false,
      gemini_prompt: "Buat komentar untuk postingan teman: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. Friendly dan natural, 1-2 kalimat.",
      typing_delay_after_click: 2000,
      openrouter_model: "anthropic/claude-3.5-sonnet",
      openrouter_temperature: 0.7,
      openrouter_max_tokens: 150,
      openrouter_system_prompt: "You are a helpful assistant that generates natural, engaging Facebook comments in Indonesian language. Keep comments short, friendly, and relevant to the post content.",
      openrouter_fallback_comments: [
        "Menarik sekali! 👍",
        "Setuju banget dengan ini",
        "Terima kasih sudah berbagi",
        "Sangat informatif",
        "Keren! 🔥"
      ]
    }
  };
}

// Inline: Apply environment variable overrides (for Electron)
if (process.env.HEADLESS) {
  config.headless = process.env.HEADLESS;
}

// Paths
const COMMENTS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "comments.txt");
const CTA_LINK_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cta_link.txt");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");

// Telegram logger
const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () => {
  const min = config.minIntervalSeconds || 60;
  const max = config.maxIntervalSeconds || 180;
  return 1000 * (Math.floor(Math.random() * (max - min + 1)) + min);
};

// Helper: Safe screenshot
async function safeScreenshot(page, filepath, options = {}) {
  try {
    if (!page || page.isClosed()) return false;
    await page.screenshot({ path: filepath, timeout: 5000, ...options });
    return true;
  } catch (error) {
    return false;
  }
}

// Helper: Check if error is fatal
function isFatalError(error) {
  const fatalMessages = ['Target closed', 'Session closed', 'Protocol error'];
  return fatalMessages.some(msg => error.message && error.message.includes(msg));
}

// Ad Blocker Functions - More precise detection
async function isPostSponsored(post) {
  try {
    // Method 1: Check for specific sponsored elements within the post only
    const sponsoredInPost = await post.evaluate(() => {
      // Look for sponsored indicators within this post only
      const sponsoredSelectors = [
        '[aria-label*="Sponsored"]',
        '[aria-label*="Bersponsor"]',
        'span:contains("Sponsored")',
        'span:contains("Bersponsor")',
        '[data-testid*="ad"]',
        '[data-ft*="ad"]',
        '.x1yztbdb.x1n2xrkh', // Common ad container class
        '.x1lliihq.x1k90msu' // Another ad container class
      ];

      for (const selector of sponsoredSelectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        // Check if any of these elements are within this post
        for (const element of elements) {
          // Check if element is a descendant of the post
          if (element.closest('[role="article"], [aria-posinset]') === document.querySelector('[role="article"], [aria-posinset]')) {
            return true;
          }
        }
      }

      return false;
    });

    if (sponsoredInPost) {
      return true;
    }

    // Method 2: Check for sponsored text in the post content only
    const sponsoredTextInPost = await post.evaluate(() => {
      const text = document.body.textContent.toLowerCase();
      // Only consider it sponsored if the text appears multiple times or in specific contexts
      return (text.includes('sponsored') || text.includes('bersponsor')) &&
        (text.includes('advertiser') || text.includes('iklan') || text.includes('promoted'));
    });

    return sponsoredTextInPost;
  } catch (error) {
    return false;
  }
}

async function containsBlockedKeywords(post, keywords) {
  try {
    const postText = await post.evaluate(el => el.textContent || '');
    const lowerPostText = postText.toLowerCase();

    for (const keyword of keywords) {
      if (lowerPostText.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

async function shouldBlockPost(post, blockKeywords) {
  if (await isPostSponsored(post)) {
    console.log(\`[\${ACCOUNT_ID}] -> Post is SPONSORED - SKIPPING\`);
    return true;
  }

  if (blockKeywords && blockKeywords.length > 0) {
    if (await containsBlockedKeywords(post, blockKeywords)) {
      console.log(\`[\${ACCOUNT_ID}] -> Post contains BLOCKED KEYWORDS - SKIPPING\`);
      return true;
    }
  }

  return false;
}

// Enhanced caption extraction with UI element filtering
async function extractPostCaption(post) {
  try {
    // Primary selectors (prioritized)
    const primarySelectors = [
      'div[data-ad-rendering-role="story_message"]',
      'div[data-ad-comet-preview="message"]',
      'div[data-ad-preview="message"]'
    ];

    // Try primary selectors first
    for (const selector of primarySelectors) {
      try {
        const elements = await post.$$(selector);

        for (const element of elements) {
          const text = await element.evaluate(el => {
            const getAllText = (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.trim();
              }

              if (node.nodeType === Node.ELEMENT_NODE) {
                const role = node.getAttribute('role');
                const ariaLabel = node.getAttribute('aria-label');

                if (role === 'button' ||
                  role === 'link' ||
                  ariaLabel?.includes('Like') ||
                  ariaLabel?.includes('Comment') ||
                  ariaLabel?.includes('Share')) {
                  return '';
                }

                let text = '';
                for (const child of node.childNodes) {
                  text += getAllText(child) + ' ';
                }
                return text;
              }

              return '';
            };

            return getAllText(el).trim();
          });

          if (text && text.length > 10 && !text.includes('Like') && !text.includes('Comment')) {
            return text;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Fallback selectors
    const fallbackSelectors = [
      '[data-testid="post_message"]',
      'div[data-testid="post_message"]',
      '.userContent',
      'div.xdj266r.x11i5rnm.xat24cr.x1mh8g0r',
      'div[dir="auto"][style*="text-align"]'
    ];

    for (const selector of fallbackSelectors) {
      try {
        const elements = await post.$$(selector);

        for (const element of elements) {
          const text = await element.evaluate(el => {
            const getAllText = (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.trim();
              }

              if (node.nodeType === Node.ELEMENT_NODE) {
                const role = node.getAttribute('role');
                const ariaLabel = node.getAttribute('aria-label');

                if (role === 'button' ||
                  role === 'link' ||
                  ariaLabel?.includes('Like') ||
                  ariaLabel?.includes('Comment') ||
                  ariaLabel?.includes('Share')) {
                  return '';
                }

                let text = '';
                for (const child of node.childNodes) {
                  text += getAllText(child) + ' ';
                }
                return text;
              }

              return '';
            };

            return getAllText(el).trim();
          });

          if (text && text.length > 10 && !text.includes('Like') && !text.includes('Comment')) {
            return text;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Last resort: find post content within the post container only
    const postContent = await post.evaluate((postEl) => {
      // UI element patterns to exclude
      const uiPatterns = [
        /^\\d+\\s+(Obrolan|notifikasi|Chat|notification)/i,
        /Belum Dibaca|Unread/i,
        /Jumlah notifikasi/i,
        /ObrolanSemua|ChatAll/i,
        /Memiliki konten baru/i,
        /^\\d+\\s*:\\s*\\d+$/,
        /^\\d+\\s+(jam|menit|detik|hour|minute|second)/i,
        /^(Like|Comment|Share|Suka|Komentar|Bagikan)$/,
        /Pelajari selengkapnya|Learn more/i,
        /Sponsored|Bersponsor/i
      ];

      // Find all text-containing divs within this specific post
      const textDivs = Array.from(postEl.querySelectorAll('div[dir="auto"]'));

      let bestCandidate = '';
      let maxScore = 0;

      for (const div of textDivs) {
        // Get only direct text content
        let text = '';
        for (const child of div.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent + ' ';
          } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'SPAN') {
            text += child.textContent + ' ';
          }
        }
        text = text.trim();

        // Skip if too short or matches UI patterns
        if (text.length < 15) continue;

        let isUIElement = false;
        for (const pattern of uiPatterns) {
          if (pattern.test(text)) {
            isUIElement = true;
            break;
          }
        }

        if (isUIElement) continue;

        // Skip if it's part of action bar
        const role = div.getAttribute('role');
        const ariaLabel = div.getAttribute('aria-label');
        if (role === 'button' || role === 'navigation' || role === 'toolbar') continue;
        if (ariaLabel && (ariaLabel.includes('Like') || ariaLabel.includes('Comment'))) continue;

        // Check if element is within post bounds
        const rect = div.getBoundingClientRect();
        const postRect = postEl.getBoundingClientRect();

        if (rect.left < postRect.left || rect.right > postRect.right) continue;

        // Score based on length and position
        let score = text.length;

        // Prefer text in upper-middle section
        const relativeTop = (rect.top - postRect.top) / postRect.height;
        if (relativeTop > 0.1 && relativeTop < 0.5) {
          score += 100;
        }

        // Prefer text with sentence structure
        if (/[.!?]/.test(text)) {
          score += 50;
        }

        if (score > maxScore) {
          maxScore = score;
          bestCandidate = text;
        }
      }

      return bestCandidate;
    });

    if (postContent && postContent.length > 15) {
      return postContent;
    }

    return "";

  } catch (error) {
    return "";
  }
}

async function likePost(page, post) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Trying to like post...\`);

    // Strategy 1: Find Like button within post scope using specific selectors
    const likeResult = await post.evaluate((postElement) => {
      // Function to check if element or its children contain Like/Suka
      const isLikeButton = (element) => {
        const ariaLabel = element.getAttribute('aria-label') || '';
        const text = element.textContent || '';

        // Check for like-related text
        const hasLikeText = ariaLabel.match(/^(suka|like|sukai)$/i) ||
          text.match(/^(suka|like|sukai)$/i);

        // Must not be already liked
        const isPressed = element.getAttribute('aria-pressed') === 'true';
        const alreadyLiked = ariaLabel.includes('Hapus suka') ||
          ariaLabel.includes('Unlike') ||
          ariaLabel.includes('Remove like');

        return hasLikeText && !isPressed && !alreadyLiked;
      };

      // Strategy 1a: Find by exact aria-label within post
      const likeByAriaLabel = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .find(btn => {
          const label = (btn.getAttribute('aria-label') || '').trim();
          return (label === 'Suka' || label === 'Like' || label === 'Sukai') &&
            btn.getAttribute('aria-pressed') !== 'true' &&
            btn.offsetParent !== null;
        });

      if (likeByAriaLabel) {
        const rect = likeByAriaLabel.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 15) {
          likeByAriaLabel.click();
          return { success: true, method: 'aria-label', label: likeByAriaLabel.getAttribute('aria-label') };
        }
      }

      // Strategy 1b: Find first clickable button in reactions toolbar
      const toolbars = Array.from(postElement.querySelectorAll('div[role="toolbar"]'));
      for (const toolbar of toolbars) {
        // Get immediate child buttons only (not nested)
        const buttons = Array.from(toolbar.children).filter(child =>
          child.getAttribute('role') === 'button' ||
          child.tagName === 'DIV' && child.hasAttribute('tabindex')
        );

        if (buttons.length >= 2) { // Typically: Like, Comment, Share
          const firstBtn = buttons[0];

          // Verify it's a like button
          if (isLikeButton(firstBtn)) {
            const rect = firstBtn.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 15 && firstBtn.offsetParent !== null) {
              firstBtn.click();
              return { success: true, method: 'toolbar-first', label: firstBtn.getAttribute('aria-label') || firstBtn.textContent };
            }
          }
        }
      }

      // Strategy 1c: Find by SVG icon (thumbs up) within clickable button
      const buttonsWithSvg = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .filter(btn => btn.querySelector('svg'));

      for (const btn of buttonsWithSvg) {
        if (isLikeButton(btn)) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && btn.offsetParent !== null) {
            btn.click();
            return { success: true, method: 'svg-icon', label: btn.getAttribute('aria-label') || 'Like' };
          }
        }
      }

      // Strategy 1d: Find by text content matching (last resort)
      const allInteractive = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"], div[tabindex="0"]'));

      for (const element of allInteractive) {
        const text = (element.textContent || '').trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').trim();

        if ((text === 'Suka' || text === 'Like' || ariaLabel === 'Suka' || ariaLabel === 'Like') &&
          element.getAttribute('aria-pressed') !== 'true' &&
          !ariaLabel.includes('Hapus') &&
          !ariaLabel.includes('Unlike')) {

          const rect = element.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && element.offsetParent !== null) {
            element.click();
            return { success: true, method: 'text-match', label: ariaLabel || text };
          }
        }
      }

      return { success: false };
    });

    if (likeResult.success) {
      console.log(\`[\${ACCOUNT_ID}] -> Post liked\`);
      await delay(1000);
      return true;
    }

    console.log(\`[\${ACCOUNT_ID}] -> Like button not found or already liked\`);
    await delay(1000);
    return false;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to like: \${error.message}\`);
    return false;
  }
}

async function loadCookiesFromFile() {
  try {
    console.log(\`[\${ACCOUNT_ID}] Loading cookies from: \${COOKIES_PATH}\`);
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
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load cookies: \${error.message}\`);
  }
}

async function loadComments() {
  try {
    const data = await fs.readFile(COMMENTS_PATH, "utf8");
    const comments = data.split("---").map(comment => comment.trim()).filter(comment => comment);
    if (comments.length === 0) {
      throw new Error(\`[\${ACCOUNT_ID}] Comments file is empty\`);
    }
    return comments;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] comments.txt not found, creating default...\`);
      const defaultComments = [
        "Bagus banget ini!",
        "Keren! Thanks for sharing",
        "Mantap",
        "Nice post!",
        "Suka banget dengan konten ini"
      ].join("\\n---\\n");
      await fs.writeFile(COMMENTS_PATH, defaultComments, "utf8");
      return defaultComments.split("---").map(c => c.trim());
    }
    throw error;
  }
}

async function loadCtaLink() {
  try {
    const data = await fs.readFile(CTA_LINK_PATH, "utf8");
    return data.trim();
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] cta_link.txt not found\`);
    return "";
  }
}

async function loadGeminiApiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(key => key.trim()).filter(key => key && key.startsWith("AIzaSy"));
    if (keys.length === 0) {
      console.log(\`[\${ACCOUNT_ID}] Warning: No valid Gemini API keys found\`);
      return [];
    }
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] Warning: gemini_keys.txt not found\`);
      return [];
    }
    throw error;
  }
}

async function main() {
  let browser;

  try {
    console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto Comment Timeline (No Logging) ===\`);
    console.log(\`[\${ACCOUNT_ID}] Ad Blocking: \${config.blockAds !== false ? 'Enabled' : 'Disabled'}\`);
    console.log(\`[\${ACCOUNT_ID}] Auto-like: \${config.autoLike !== false ? 'Yes' : 'No'}\`);

    if (config.blockAds !== false && config.blockKeywords) {
      console.log(\`[\${ACCOUNT_ID}] Blocked keywords: \${config.blockKeywords.join(', ')}\`);
    }

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const comments = await loadComments();
    console.log(\`[\${ACCOUNT_ID}] Loaded \${comments.length} static comments\`);

    let ctaLink = "";
    let geminiKeys = [];
    let openRouterKeys = [];

    const potentialAI = (await fs.access(OPENROUTER_KEYS_PATH).then(() => true).catch(() => false)) ||
      (await fs.access(GEMINI_KEYS_PATH).then(() => true).catch(() => false));

    if (potentialAI) {
      ctaLink = await loadCtaLink();
      geminiKeys = await loadGeminiApiKeys();
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);

      console.log(\`[\${ACCOUNT_ID}] Loaded \${openRouterKeys.length} OpenRouter API keys\`);
      console.log(\`[\${ACCOUNT_ID}] Loaded \${geminiKeys.length} Gemini API keys (fallback)\`);
    }

    const useAI = (openRouterKeys.length > 0 || geminiKeys.length > 0);

    if (!useAI && comments.length === 0) {
      throw new Error(\`[\${ACCOUNT_ID}] No AI keys and comments.txt is empty!\`);
    }


    // Determine headless mode
    const isProduction = process.env.NODE_ENV === 'production';
    const headlessMode = isProduction
      ? 'new'
      : (config.headless !== undefined ? config.headless : 'new');

    // Removed verbose logs to reduce clutter
    // console.log(\`[\${ACCOUNT_ID}] Environment: \${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}\`);
    // console.log(\`[\${ACCOUNT_ID}] Headless mode: \${headlessMode} \${isProduction ? '(forced for VPS)' : '(from config)'}\`);

    // Create stealth browser with anti-detection
    const stealthResult = await createStealthBrowser({
      headless: headlessMode,
      timeout: 90000,
      protocolTimeout: 180000,
      defaultTimeout: 60000,
      navigationTimeout: 90000
    }, ACCOUNT_ID);

    browser = stealthResult.browser;
    const page = stealthResult.page;

    console.log(\`[\${ACCOUNT_ID}] Loading cookies...\`);
    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(\`[\${ACCOUNT_ID}] \${cookies.length} cookies loaded\`);

    console.log(\`[\${ACCOUNT_ID}] Navigating to: \${config.targetURL}\`);
    try {
      await page.goto(config.targetURL, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
    } catch (navError) {
      console.log(\`[\${ACCOUNT_ID}] Navigation timeout, continuing...\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Waiting for initial content load (15s)...\`);
    await delay(15000);

    // Dismiss any popups
    await dismissFacebookPopups(page, ACCOUNT_ID);

    const title = await page.title();
    if (title.includes('Log') || title.includes('login')) {
      throw new Error(\`[\${ACCOUNT_ID}] Login failed! Check cookies.json\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Page ready: \${title}\`);

    // Additional stabilization to ensure posts are fully rendered
    console.log(\`[\${ACCOUNT_ID}] Ensuring timeline posts are fully rendered...\`);
    await delay(3000);

    const processedPosts = new Set();
    let commentIndex = 0;
    let commentsPosted = 0;
    let postsLikedOnly = 0;
    let adsBlocked = 0;
    console.log(\`[\${ACCOUNT_ID}] Target: \${config.postsToComment} comments\`);

    let geminiWorkingIndex = 0;
    let currentPostIndex = 1; // Start with aria-posinset="1"
    let noNewPostsCount = 0;

    // Circuit breaker to prevent infinite loop
    let consecutiveNotFound = 0;
    let maxConsecutiveNotFound = 10; // Exit after 10 consecutive failures
    let totalScrollAttempts = 0;
    let maxScrollAttempts = 50; // Max 50 scroll attempts total
    let lastPostCount = 0;
    let samePostCountStreak = 0;

    // Function to scroll to next post - moved inside main to access page
    async function scrollToNextPost(currentPos) {
      try {
        const nextPos = currentPos + 1;
        console.log(\`[\${ACCOUNT_ID}] -> Scrolling to next container (aria-posinset="\${nextPos}")\`);

        const scrolled = await page.evaluate((targetPos) => {
          const nextPost = document.querySelector(\`div[aria-posinset="\${targetPos}"]\`);
          if (nextPost) {
            nextPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
          }
          return false;
        }, nextPos);

        if (!scrolled) {
          console.log(\`[\${ACCOUNT_ID}] -> Next container not found, using fallback scroll\`);
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 0.7);
          });
        }

        await delay(2000);
        return true;
      } catch (error) {
        console.log(\`[\${ACCOUNT_ID}] -> Failed to scroll to next post: \${error.message}\`);
        return false;
      }
    }

    while (commentsPosted < config.postsToComment) {
      // Get all visible posts
      const posts = await page.$$("div[role='article'], div[aria-posinset]");

      console.log(\`[\${ACCOUNT_ID}] === Loop iteration: commentsPosted=\${commentsPosted}/\${config.postsToComment}, currentPostIndex=\${currentPostIndex} ===\`);

      if (posts.length === 0) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️  No posts found with selectors: div[role='article'], div[aria-posinset]\`);
        console.log(\`[\${ACCOUNT_ID}] Waiting 10s and retrying...\`);
        await delay(10000);
        noNewPostsCount++;
        if (noNewPostsCount > 5) {
          console.log(\`[\${ACCOUNT_ID}] ❌ No posts found after \${noNewPostsCount} attempts. Exiting.\`);
          break;
        }
        continue;
      }

      console.log(\`[\${ACCOUNT_ID}] ✓ Found \${posts.length} potential posts on page\`);

      // Reset counter when we find posts
      noNewPostsCount = 0;

      // Find post with current aria-posinset OR fallback to array index
      let post = await page.$(\`div[aria-posinset="\${currentPostIndex}"]\`);

      if (!post && posts.length >= currentPostIndex) {
        console.log(\`[\${ACCOUNT_ID}] ℹ️  aria-posinset="\${currentPostIndex}" not found, using index match.\`);
        post = posts[currentPostIndex - 1]; // 0-based index
      }

      if (!post) {
        consecutiveNotFound++;
        totalScrollAttempts++;

        console.log(\`[\${ACCOUNT_ID}] ⚠️  No post found with aria-posinset="\${currentPostIndex}". Scrolling for more content... (Attempt \${consecutiveNotFound}/\${maxConsecutiveNotFound}, Total scrolls: \${totalScrollAttempts}/\${maxScrollAttempts})\`);

        // Circuit breaker: Check if we should exit
        if (consecutiveNotFound >= maxConsecutiveNotFound) {
          console.log(\`[\${ACCOUNT_ID}] ⚠️ Circuit breaker triggered: \${maxConsecutiveNotFound} consecutive posts not found\`);
          console.log(\`[\${ACCOUNT_ID}] Likely reached end of feed. Exiting gracefully.\`);
          break;
        }

        if (totalScrollAttempts >= maxScrollAttempts) {
          console.log(\`[\${ACCOUNT_ID}] ⚠️ Circuit breaker triggered: Maximum scroll attempts (\${maxScrollAttempts}) reached\`);
          console.log(\`[\${ACCOUNT_ID}] Exiting to prevent infinite loop.\`);
          break;
        }

        // Check if we're seeing the same number of posts repeatedly (stuck)
        const currentPostsCount = posts.length;
        if (currentPostsCount === lastPostCount) {
          samePostCountStreak++;
          if (samePostCountStreak >= 5) {
            console.log(\`[\${ACCOUNT_ID}] ⚠️ Circuit breaker triggered: Same post count (\${currentPostsCount}) for \${samePostCountStreak} iterations\`);
            console.log(\`[\${ACCOUNT_ID}] Feed appears stuck. Exiting.\`);
            break;
          }
        } else {
          samePostCountStreak = 0;
        }
        lastPostCount = currentPostsCount;

        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.7);
        });
        await delay(3000);

        // Try to find post again after scrolling
        let newPost = await page.$(\`div[aria-posinset="\${currentPostIndex}"]\`);

        // Re-query all posts to perform index check if needed
        if (!newPost) {
          const refinedPosts = await page.$$("div[role='article'], div[aria-posinset]");
          if (refinedPosts.length >= currentPostIndex) {
            newPost = refinedPosts[currentPostIndex - 1];
          }
        }

        if (!newPost) {
          console.log(\`[\${ACCOUNT_ID}] ⚠️  Still not found after scroll. Moving to next index.\`);
          // If still not found, increment index and continue
          currentPostIndex++;
          if (currentPostIndex > 20) {
            // Reset if we've gone too far
            console.log(\`[\${ACCOUNT_ID}] ⚠️  Index too high (\${currentPostIndex}), resetting to 1...\`);
            currentPostIndex = 1;
            await page.evaluate(() => {
              window.scrollTo(0, 0);
            });
            await delay(2000);
          }
          continue;
        } else {
          // Found post after scrolling, reset consecutive counter
          consecutiveNotFound = 0;
        }
      } else {
        // Post found, reset consecutive counter
        consecutiveNotFound = 0;
      }

      // Declare postId outside try block so it's accessible in catch
      let postId;

      try {
        // Skip if already marked as processed
        const alreadyMarked = await post.evaluate(el => {
          return el.getAttribute('data-bot-processed') === 'true';
        });

        if (alreadyMarked) {
          console.log(\`[\${ACCOUNT_ID}] → Post \${currentPostIndex} already processed (marked), skipping\`);
          currentPostIndex++;
          continue;
        }

        // Get unique post ID
        postId = await post.evaluate(el => {
          const posinset = el.getAttribute("aria-posinset");
          const testid = el.getAttribute("data-testid");
          const id = el.getAttribute("id");

          if (posinset) return \`pos_\${posinset}\`;

          const links = el.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href) {
              const match = href.match(/\\/posts\\/(\\d+)|\\/permalink\\/(\\d+)/);
              if (match) return \`post_\${match[1] || match[2]}\`;
            }
          }

          if (testid) return \`test_\${testid}\`;
          if (id) return \`id_\${id}\`;

          const content = el.textContent || '';
          return \`hash_\${content.substring(0, 100).replace(/\\s/g, '')}\`;
        });

        if (!postId) {
          console.log(\`[\${ACCOUNT_ID}] → Post \${currentPostIndex} has no valid ID, skipping\`);
          currentPostIndex++;
          continue;
        }

        // Check if already processed in this session
        if (processedPosts.has(postId)) {
          console.log(\`[\${ACCOUNT_ID}] → Post \${currentPostIndex} (ID: \${postId.substring(0, 20)}) already in processedPosts, skipping\`);
          currentPostIndex++;
          continue;
        }

        console.log(\`[\${ACCOUNT_ID}] → Processing post \${currentPostIndex} (ID: \${postId.substring(0, 30)}...)\`);

        // Ensure post is in viewport
        await post.evaluate(el => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        // Wait longer for post elements to render
        console.log(\`[\${ACCOUNT_ID}] -> Waiting for post to fully render...\`);
        await delay(4000);

        // Check if post should be blocked
        if (config.blockAds !== false) {
          const shouldBlock = await shouldBlockPost(post, config.blockKeywords);
          if (shouldBlock) {
            processedPosts.add(postId);
            currentPostIndex++;
            adsBlocked++;
            console.log(\`[\${ACCOUNT_ID}] -> Post SKIPPED (ads/suggested)\`);
            continue;
          }
        }

        // Extract caption
        const caption = await extractPostCaption(post);

        // Check if caption is valid
        if (!caption || caption.length < 10) {
          console.log(\`[\${ACCOUNT_ID}] -> ⚠️  Caption not readable (\${caption ? caption.length : 0} chars)\`);
          console.log(\`[\${ACCOUNT_ID}] -> Action: LIKE ONLY (no comment)\`);

          // Auto-like
          if (config.autoLike !== false) {
            await likePost(page, post);
          }

          processedPosts.add(postId);
          currentPostIndex++;
          postsLikedOnly++;

          // Mark post as processed
          await post.evaluate(el => {
            el.setAttribute('data-bot-processed', 'true');
            el.style.opacity = '0.7';
          });

          // Clear focus
          await page.evaluate(() => {
            if (document.activeElement) {
              document.activeElement.blur();
            }
            if (window.getSelection) {
              window.getSelection().removeAllRanges();
            }
          });
          await delay(1000);

          // Scroll to next post BEFORE waiting
          await scrollToNextPost(currentPostIndex);

          // Wait shorter interval for like-only
          const shortInterval = Math.floor(getRandomInterval() / 2);
          console.log(\`[\${ACCOUNT_ID}] Waiting \${shortInterval / 1000}s before next post...\`);
          await delay(shortInterval);

          continue;
        }

        console.log(\`[\${ACCOUNT_ID}] -> ✓ Caption extracted (\${caption.length} chars): "\${caption.substring(0, 60)}..."\`);

        let comment;

        // Generate or select comment
        if (useAI) {
          const result = await generateAiComment({
            caption: caption,
            ctaLink: ctaLink,
            prompt: config.ai_settings?.gemini_prompt || "Buat komentar untuk: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. 1-2 kalimat.",
            openRouterKeys: openRouterKeys,
            geminiKeys: geminiKeys,
            staticComments: comments,
            geminiWorkingIndex: geminiWorkingIndex,
            accountId: ACCOUNT_ID,
            urlShortenerEnabled: config.ai_settings?.url_shortener_enabled === true
          });

          comment = result.comment;
          geminiWorkingIndex = result.workingIndex;

          if (!comment) {
            console.log(\`[\${ACCOUNT_ID}] -> Failed to generate comment, skipping\`);
            processedPosts.add(postId);
            currentPostIndex++;
            continue;
          }

          console.log(\`[\${ACCOUNT_ID}] -> Using \${result.provider} comment\${result.model ? \` (\${result.model})\` : ''}\`);
        } else {
          comment = comments[commentIndex % comments.length];
          console.log(\`[\${ACCOUNT_ID}] -> Using static comment\`);
        }

        // Find and click comment button
        let commentClicked = false;

        // Strategy 1: Look for comment button with aria-label
        const commentButtonSelectors = [
          "div[aria-label='Beri komentar']",
          "div[aria-label='Comment']",
          "div[aria-label='Write a comment']",
          "div[role='button'][aria-label*='comment']",
          "div[role='button'][aria-label*='Comment']",
          "div[role='button'][aria-label*='komentar']"
        ];

        for (const selector of commentButtonSelectors) {
          try {
            const button = await post.$(selector);
            if (button) {
              const isVisible = await button.boundingBox();
              if (isVisible && isVisible.height > 10) {
                await button.click({ delay: 100 });
                console.log(\`[\${ACCOUNT_ID}] -> Comment button clicked\`);
                commentClicked = true;
                await delay(config.ai_settings?.typing_delay_after_click || 2000);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }

        // Strategy 2: Look for existing comment text area (already expanded)
        if (!commentClicked) {
          const textAreaSelectors = [
            "div[contenteditable='true'][role='textbox']",
            "div[contenteditable='true'][aria-label*='comment']",
            "div[contenteditable='true'][aria-label*='Write']",
            "div[contenteditable='true']",
            "p.xdj266r.x14z9mp.xat24cr.x1lziwak",
            "textarea[placeholder*='comment']",
            "textarea[placeholder*='komentar']"
          ];

          for (const selector of textAreaSelectors) {
            try {
              const area = await post.$(selector);
              if (area) {
                const isVisible = await area.boundingBox();
                if (isVisible && isVisible.width > 100 && isVisible.height > 20) {
                  await area.click({ delay: 100 });
                  console.log(\`[\${ACCOUNT_ID}] -> Comment area clicked (\${selector})\`);
                  commentClicked = true;
                  await delay(config.ai_settings?.typing_delay_after_click || 2000);
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
        }

        // Strategy 3: Try to find by text content "Comment" or "Komentar"
        if (!commentClicked) {
          commentClicked = await post.evaluate(() => {
            const commentTexts = ['Comment', 'Komentar', 'Beri komentar', 'Write a comment'];
            const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));

            for (const btn of allButtons) {
              const text = (btn.textContent || '').trim();
              const ariaLabel = btn.getAttribute('aria-label') || '';

              for (const commentText of commentTexts) {
                if (text.includes(commentText) || ariaLabel.includes(commentText)) {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 30 && rect.height > 15 && btn.offsetParent !== null) {
                    btn.click();
                    return true;
                  }
                }
              }
            }
            return false;
          });

          if (commentClicked) {
            console.log(\`[\${ACCOUNT_ID}] -> Comment button clicked (text search)\`);
            await delay(config.ai_settings?.typing_delay_after_click || 2000);
          }
        }

        // If still not found, skip this post but still like it
        if (!commentClicked) {
          console.log(\`[\${ACCOUNT_ID}] -> Comment area not found, doing LIKE ONLY\`);

          // Auto-like
          if (config.autoLike !== false) {
            await likePost(page, post);
          }

          processedPosts.add(postId);
          currentPostIndex++;
          postsLikedOnly++;

          // Mark post as processed
          await post.evaluate(el => {
            el.setAttribute('data-bot-processed', 'true');
            el.style.opacity = '0.7';
          });

          // Clear focus
          await page.evaluate(() => {
            if (document.activeElement) {
              document.activeElement.blur();
            }
            if (window.getSelection) {
              window.getSelection().removeAllRanges();
            }
          });
          await delay(1000);

          // Scroll to next post BEFORE waiting
          await scrollToNextPost(currentPostIndex);

          // Wait shorter interval
          const shortInterval = Math.floor(getRandomInterval() / 2);
          console.log(\`[\${ACCOUNT_ID}] Waiting \${shortInterval / 1000}s before next post...\`);
          await delay(shortInterval);

          continue;
        }

        // Wait for comment box to be fully ready and focused
        await delay(1000);

        // Clear any existing focus and ensure we're starting fresh
        await page.evaluate(() => {
          // Clear any selection
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }

          // Find the active element (should be the comment box)
          const activeEl = document.activeElement;
          if (activeEl && activeEl.isContentEditable) {
            // Clear any existing content
            activeEl.textContent = '';
          }
        });

        await delay(500);

        // Type comment with safe delays
        console.log(\`[\${ACCOUNT_ID}] -> Typing comment: "\${comment}"\`);

        await typeCommentSafely(page, comment, {
          delayAfterClick: 0, // Already waited above
          typingDelay: 100,
          accountId: ACCOUNT_ID
        });

        await delay(1000);

        // Send comment
        await page.keyboard.press("Enter");
        console.log(\`[\${ACCOUNT_ID}] -> Comment sent\`);

        // Auto-like
        await delay(2000);
        if (config.autoLike !== false) {
          await likePost(page, post);
        }

        // Close any dialogs
        await delay(2000);
        await page.keyboard.press("Escape");
        await delay(800);
        await page.keyboard.press("Escape");
        await delay(800);

        // Force blur and clear selection
        await page.evaluate(() => {
          if (document.activeElement) {
            document.activeElement.blur();
          }
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
          document.body.click();
        });
        await delay(500);

        processedPosts.add(postId);
        currentPostIndex++;
        commentsPosted++;

        if (!useAI) {
          commentIndex++;
        }

        // MARK this post as processed immediately
        await post.evaluate(el => {
          el.setAttribute('data-bot-processed', 'true');
          el.style.opacity = '0.7'; // Visual indicator (optional)
        });

        // Clear focus
        await page.evaluate(() => {
          if (document.activeElement) {
            document.activeElement.blur();
          }
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
        });
        await delay(1000);

        // Scroll to next post BEFORE waiting
        await scrollToNextPost(currentPostIndex);

        // Check if we've reached the target
        if (commentsPosted >= config.postsToComment) {
          console.log(\`[\${ACCOUNT_ID}] Target reached: \${commentsPosted}/\${config.postsToComment}\`);
          break;
        }

        // Wait random interval before processing next post
        const interval = getRandomInterval();
        console.log(\`[\${ACCOUNT_ID}] Waiting \${interval / 1000}s before next comment...\`);
        await delay(interval);

      } catch (error) {
        console.error(\`[\${ACCOUNT_ID}] -> Failed to interact: \${error.message}\`);

        try {
          const errorScreenshot = path.join(ARTIFACTS_DIR, \`timeline_error_\${Date.now()}.png\`);
          await page.screenshot({ path: errorScreenshot, fullPage: false });
          console.log(\`[\${ACCOUNT_ID}] -> Error screenshot: \${errorScreenshot}\`);
        } catch (screenshotError) {
          console.log(\`[\${ACCOUNT_ID}] -> Failed to take screenshot\`);
        }

        // Mark as processed to avoid infinite loop
        if (postId) {
          processedPosts.add(postId);
        }
        currentPostIndex++;

        continue;
      }
    }

    console.log(\`[\${ACCOUNT_ID}] === COMPLETE ===\`);
    console.log(\`[\${ACCOUNT_ID}] Total comments posted: \${commentsPosted}/\${config.postsToComment}\`);
    console.log(\`[\${ACCOUNT_ID}] Total posts liked only (no caption): \${postsLikedOnly}\`);
    console.log(\`[\${ACCOUNT_ID}] Total ads blocked: \${adsBlocked}\`);
    console.log(\`[\${ACCOUNT_ID}] Total scroll attempts: \${totalScrollAttempts}\`);
    console.log(\`[\${ACCOUNT_ID}] Circuit breaker status: \${consecutiveNotFound}/\${maxConsecutiveNotFound} consecutive failures\`);

    const successDetails = \`Comments: \${commentsPosted}/\${config.postsToComment} | Liked Only: \${postsLikedOnly} | Blocked: \${adsBlocked} | Scrolls: \${totalScrollAttempts}\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Fatal error:\`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        const errorScreenshot = path.join(ARTIFACTS_DIR, \`fatal_error_\${Date.now()}.png\`);
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${errorScreenshot}\`);
      } catch (screenshotError) {
        console.log(\`[\${ACCOUNT_ID}] -> Failed to take screenshot\`);
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
        console.log(\`[\${ACCOUNT_ID}] Browser closed\`);

        await delay(3000);

      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Cleanup error: \${e.message}\`);
      }
    }
  }
}

process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Bot stopped by user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] Unhandled Rejection:\`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] Uncaught Exception:\`, error);
  process.exit(1);
});

main();
`,
            "videocomment": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

// Import AI comment generator module
const { generateAiComment, typeCommentSafely, loadOpenRouterKeys } = require('./commentgenerator');
const notify = require('./notify');

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: true,
    targetURL: "https://www.facebook.com/reel/",
    postsToComment: 5,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    autoLike: true,
    ai_settings: {
      use_openrouter: true,
      url_shortener_enabled: true,
      gemini_prompt: "Buat komentar untuk video ini: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. Engaging dan natural, 1-2 kalimat.",
      typing_delay_after_click: 3000
    }
  };
}

// Paths
const LOG_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "ceklink.txt");
const COMMENTS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "comments.txt");
const CTA_LINK_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cta_link.txt");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () => 1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

async function retryOperation(operation, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] Attempt \${attempt} failed: \${error.message}\`);

      if (attempt === maxRetries) {
        throw error;
      }

      const delayTime = baseDelay * Math.pow(2, attempt - 1);
      console.log(\`[\${ACCOUNT_ID}] Retrying in \${delayTime}ms...\`);
      await delay(delayTime);
    }
  }
}

async function likeVideo(page) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Trying to like video...\`);

    // Updated like button selector based on recording
    const likeSelector = 'div.x1pq812k > div:nth-of-type(1) div.xuk3077 > div > div > div > div > div > div:nth-of-type(1) svg';

    try {
      await page.waitForSelector(likeSelector, { timeout: 5000 });
      const likeButton = await page.$(likeSelector);

      if (likeButton) {
        await likeButton.click({ delay: 100 });
        console.log(\`[\${ACCOUNT_ID}] -> Video liked successfully\`);
      } else {
        console.log(\`[\${ACCOUNT_ID}] -> Like button not found\`);
      }
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] -> Failed to like: \${e.message}\`);
    }

    await delay(1000);

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to like: \${error.message}\`);
  }
}

async function openCommentPanel(page) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Opening comment panel...\`);

    // Updated comment panel selector based on recording
    const commentPanelSelector = 'div.x1pq812k > div:nth-of-type(1) div.xuk3077 > div > div > div > div > div > div:nth-of-type(2) svg';

    await page.waitForSelector(commentPanelSelector, { timeout: 10000 });
    const commentButton = await page.$(commentPanelSelector);

    if (commentButton) {
      await commentButton.click({ delay: 200 });
      console.log(\`[\${ACCOUNT_ID}] -> Comment panel opened\`);
      await delay(3000);
      return true;
    } else {
      console.log(\`[\${ACCOUNT_ID}] -> Comment button not found\`);
      return false;
    }
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to open comment panel: \${error.message}\`);
    return false;
  }
}

async function navigateToNextVideo(page) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Navigating to next video...\`);

    // Updated next video selector based on recording
    const nextVideoSelector = 'div.x1r8uery > div.x78zum5 > div:nth-of-type(2) svg';

    await page.waitForSelector(nextVideoSelector, { timeout: 5000 });
    const nextButton = await page.$(nextVideoSelector);

    if (nextButton) {
      await nextButton.click({ delay: 100 });
      console.log(\`[\${ACCOUNT_ID}] -> Navigated to next video\`);
      await delay(5000); // Wait for video to load
      return true;
    } else {
      console.log(\`[\${ACCOUNT_ID}] -> Next video button not found\`);
      return false;
    }
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to navigate to next video: \${error.message}\`);
    return false;
  }
}

async function getCurrentVideoUrl(page) {
  try {
    return await page.evaluate(() => window.location.href);
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to get current video URL: \${error.message}\`);
    return null;
  }
}

// UPDATED: Function to get caption with improved selectors and validation
async function getCurrentVideoCaption(page) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Looking for caption...\`);

    // List of common UI text that should be ignored as captions
    const ignoreTexts = [
      "Cadangkan obrolan agar Anda bisa memulihkannya jika beralih perangkat",
      "Backup your chats so you can restore them if you switch devices",
      "Kirim ke",
      "Send to",
      "Bagikan",
      "Share",
      "Laporkan",
      "Report",
      "Berhenti mengikuti",
      "Unfollow"
    ];

    // Try multiple selectors in order of preference
    const captionSelectors = [
      // Primary selector based on your input
      'div[role="complementary"] div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u span[dir="auto"]',
      'div[data-visualcompletion="ignore"] div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u span[dir="auto"]',
      'div[data-pagelet="ReelsCommentPane"] div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u span[dir="auto"]',

      // Fallback: Try the main div without span selector
      'div[role="complementary"] div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u',
      'div[data-visualcompletion="ignore"] div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u',
      'div[data-pagelet="ReelsCommentPane"] div.x78zum5.xdt5ytf.xz62fqu.x16ldp7u',

      // Additional selectors for video caption
      'div[aria-label*="Caption"]',
      'div[aria-label*="Keterangan"]',
      'div[data-visualcompletion="ignore"] div[dir="auto"]',
      'div[role="complementary"] div[dir="auto"]',

      // Previous selectors as additional fallbacks
      'div[role="complementary"] span[dir="auto"]',
      'div[data-visualcompletion="ignore"] span[dir="auto"]',
      'span[dir="auto"]:not([aria-hidden="true"])',
      'div[dir="auto"]'
    ];

    for (const selector of captionSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        const captionElements = await page.$$(selector);

        if (captionElements.length > 0) {
          // Find the element with the most text (likely the main caption)
          let bestCaption = "";
          let bestElement = null;

          for (const element of captionElements) {
            const text = await page.evaluate(el => el.textContent, element);

            // Skip if text is in ignore list or too short
            if (text.length < 10) continue;

            let shouldIgnore = false;
            for (const ignoreText of ignoreTexts) {
              if (text.includes(ignoreText)) {
                shouldIgnore = true;
                break;
              }
            }

            if (shouldIgnore) continue;

            if (text.length > bestCaption.length) {
              bestCaption = text;
              bestElement = element;
            }
          }

          if (bestElement) {
            const caption = await page.evaluate(el => el.textContent, bestElement);
            console.log(\`[\${ACCOUNT_ID}] -> Caption found using selector: \${selector}\`);
            return caption.trim();
          }
        }
      } catch (e) {
        // Continue to next selector
        continue;
      }
    }

    console.log(\`[\${ACCOUNT_ID}] -> Caption not found with any selector\`);
    return "";
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to get caption: \${error.message}\`);
    return "";
  }
}

// SIMPLIFIED: Function to check if URL is a valid reel URL (has video ID)
function isValidReelUrl(url) {
  if (!url) return false;
  // Simply check if URL contains /reel/ path
  return url.includes("/reel/");
}

// NEW: Function to check if URL has a video ID
function hasVideoId(url) {
  if (!url) return false;
  // Check if URL contains a video ID (reel URLs have ?v= parameter)
  return url.includes("/reel/?v=");
}

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
      throw new Error(\`[\${ACCOUNT_ID}] cookies.json not found!\`);
    }
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load cookies: \${error.message}\`);
  }
}

async function loadLog() {
  try {
    const data = await fs.readFile(LOG_PATH, "utf8");
    return new Set(data.split("\\n").filter(line => line.trim() !== ""));
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
}

async function loadComments() {
  try {
    const data = await fs.readFile(COMMENTS_PATH, "utf8");
    return data.split("---").map(comment => comment.trim()).filter(comment => comment);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function loadCtaLink() {
  try {
    const data = await fs.readFile(CTA_LINK_PATH, "utf8");
    return data.trim();
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] cta_link.txt not found\`);
    return "";
  }
}

async function loadGeminiApiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(key => key.trim()).filter(key => key && key.startsWith("AIzaSy"));
    if (keys.length === 0) {
      console.log(\`[\${ACCOUNT_ID}] Warning: No valid Gemini API keys found\`);
    }
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] Warning: gemini_keys.txt not found\`);
      return [];
    }
    throw error;
  }
}

async function appendToLog(url) {
  await fs.appendFile(LOG_PATH, \`\${url}\\n\`);
}

async function navigateToUrlSafely(page, url, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const timeout = options.timeout || 90000;

  console.log(\`[\${ACCOUNT_ID}] Navigating to: \${url}\`);

  return await retryOperation(async () => {
    try {
      await page.goto('about:blank');
      await delay(1000);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeout
      });

      console.log(\`[\${ACCOUNT_ID}] Page loaded successfully: \${url}\`);

    } catch (error) {
      console.error(\`[\${ACCOUNT_ID}] Navigation failed: \${error.message}\`);

      if (error.message.includes('timeout')) {
        // Try simple navigation
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeout
        });
        console.log(\`[\${ACCOUNT_ID}] Navigation successful with simple strategy\`);
      } else {
        throw error;
      }
    }
  }, maxRetries);
}

async function main() {
  let browser;
  let commentPanelOpened = false; // Track if comment panel is already opened

  try {
    console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto Comment Video (Enhanced) ===\`);
    console.log(\`[\${ACCOUNT_ID}] Auto-like enabled: \${config.autoLike !== false ? 'Yes' : 'No'}\`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const comments = await loadComments();
    let ctaLink = "";
    let geminiKeys = [];
    let openRouterKeys = [];

    const potentialAI = (await fs.access(OPENROUTER_KEYS_PATH).then(() => true).catch(() => false)) ||
      (await fs.access(GEMINI_KEYS_PATH).then(() => true).catch(() => false));

    if (potentialAI) {
      ctaLink = await loadCtaLink();
      geminiKeys = await loadGeminiApiKeys();
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);
      console.log(\`[\${ACCOUNT_ID}] Loaded \${openRouterKeys.length} OpenRouter API keys\`);
      console.log(\`[\${ACCOUNT_ID}] Loaded \${geminiKeys.length} Gemini API keys (fallback)\`);
    }

    const useAI = (openRouterKeys.length > 0 || geminiKeys.length > 0);

    if (!useAI && comments.length === 0) {
      throw new Error(\`[\${ACCOUNT_ID}] No AI keys and comments.txt is empty!\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Launching browser...\`);

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

    console.log(\`[\${ACCOUNT_ID}] Loading cookies...\`);
    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(\`[\${ACCOUNT_ID}] \${cookies.length} cookies loaded\`);

    await navigateToUrlSafely(page, config.targetURL, {
      maxRetries: 3,
      timeout: 90000
    });

    // CRITICAL: Wait for page to load
    console.log(\`[\${ACCOUNT_ID}] Waiting for initial content load (15s)...\`);
    await delay(15000);

    // Additional stabilization
    console.log(\`[\${ACCOUNT_ID}] Ensuring video elements are fully rendered...\`);
    await delay(3000);

    console.log(\`[\${ACCOUNT_ID}] Page ready\`);

    const log = await loadLog();
    let commentIndex = log.size % (comments.length || 1);
    let commentsPosted = 0;
    console.log(\`[\${ACCOUNT_ID}] Target: \${config.postsToComment} comments\`);

    let geminiWorkingIndex = 0;

    // NEW APPROACH: Process videos sequentially
    while (commentsPosted < config.postsToComment) {
      try {
        // Get current video URL
        const currentVideoUrl = await getCurrentVideoUrl(page);

        if (!currentVideoUrl) {
          console.log(\`[\${ACCOUNT_ID}] -> Failed to get current video URL\`);
          break;
        }

        // Check if this is a valid reel URL
        if (!isValidReelUrl(currentVideoUrl)) {
          console.log(\`[\${ACCOUNT_ID}] -> Current URL is not a valid reel URL, skipping\`);

          // Navigate to next video
          const navigated = await navigateToNextVideo(page);
          if (!navigated) {
            console.log(\`[\${ACCOUNT_ID}] -> Failed to navigate to next video\`);
            break;
          }
          continue;
        }

        // FIXED: Only check log if URL has a video ID
        if (hasVideoId(currentVideoUrl) && log.has(currentVideoUrl)) {
          console.log(\`[\${ACCOUNT_ID}] -> Already commented on this video, skipping\`);

          // Navigate to next video
          const navigated = await navigateToNextVideo(page);
          if (!navigated) {
            console.log(\`[\${ACCOUNT_ID}] -> Failed to navigate to next video\`);
            break;
          }
          continue;
        }

        // Only open comment panel if it's not already opened
        if (!commentPanelOpened) {
          const panelOpened = await openCommentPanel(page);
          if (!panelOpened) {
            console.log(\`[\${ACCOUNT_ID}] -> Failed to open comment panel\`);

            // Try to navigate to next video
            const navigated = await navigateToNextVideo(page);
            if (!navigated) {
              console.log(\`[\${ACCOUNT_ID}] -> Failed to navigate to next video\`);
              break;
            }
            continue;
          }
          commentPanelOpened = true; // Mark that comment panel is now opened
        }

        // Get caption with the updated function
        const caption = await getCurrentVideoCaption(page);
        console.log(\`[\${ACCOUNT_ID}] -> Caption: \${caption.substring(0, 100)}...\`);

        // Generate comment
        let comment;

        if (useAI) {
          const result = await generateAiComment({
            caption: caption,
            ctaLink: ctaLink,
            prompt: config.ai_settings.gemini_prompt || "Buat komentar untuk video: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. 1-2 kalimat.",
            openRouterKeys: openRouterKeys,
            geminiKeys: geminiKeys,
            staticComments: comments,
            geminiWorkingIndex: geminiWorkingIndex,
            accountId: ACCOUNT_ID,
            urlShortenerEnabled: config.ai_settings?.url_shortener_enabled === true
          });

          comment = result.comment;
          geminiWorkingIndex = result.workingIndex;

          if (!comment) {
            console.log(\`[\${ACCOUNT_ID}] -> Failed to generate comment, skipping\`);

            // FIXED: Only append to log if URL has a video ID
            if (hasVideoId(currentVideoUrl)) {
              await appendToLog(currentVideoUrl);
            }

            // Navigate to next video
            const navigated = await navigateToNextVideo(page);
            if (!navigated) {
              console.log(\`[\${ACCOUNT_ID}] -> Failed to navigate to next video\`);
              break;
            }
            continue;
          }

          console.log(\`[\${ACCOUNT_ID}] -> Using \${result.provider} comment\${result.model ? \` (\${result.model})\` : ''}\`);
        } else {
          comment = comments[commentIndex % comments.length];
        }

        // Like video if enabled
        if (config.autoLike !== false) {
          await likeVideo(page);
        }

        // Type comment
        console.log(\`[\${ACCOUNT_ID}] -> Typing comment: \${comment}\`);

        await typeCommentSafely(page, comment, {
          delayAfterClick: config.ai_settings?.typing_delay_after_click || 3000,
          typingDelay: 120,
          accountId: ACCOUNT_ID
        });

        // Submit comment
        await page.keyboard.press("Enter");
        console.log(\`[\${ACCOUNT_ID}] -> Comment sent\`);

        // FIXED: Only append to log if URL has a video ID
        if (hasVideoId(currentVideoUrl)) {
          await appendToLog(currentVideoUrl);
          log.add(currentVideoUrl);
        }

        commentsPosted++;

        if (!useAI) {
          commentIndex++;
        }

        // Wait before next video
        const interval = getRandomInterval();
        console.log(\`[\${ACCOUNT_ID}] Waiting \${interval / 1000}s before next video...\`);
        await delay(interval);

        // Navigate to next video
        const navigated = await navigateToNextVideo(page);
        if (!navigated) {
          console.log(\`[\${ACCOUNT_ID}] -> Failed to navigate to next video\`);
          break;
        }

      } catch (error) {
        console.error(\`[\${ACCOUNT_ID}] -> Error processing video: \${error.message}\`);

        try {
          // Try to navigate to next video
          const navigated = await navigateToNextVideo(page);
          if (!navigated) {
            console.log(\`[\${ACCOUNT_ID}] -> Failed to navigate to next video\`);
            break;
          }
        } catch (recoveryError) {
          console.error(\`[\${ACCOUNT_ID}] -> Recovery failed\`);
          throw error;
        }
      }
    }

    console.log(\`[\${ACCOUNT_ID}] === COMPLETE ===\`);
    const successDetails = \`Total comments: \${commentsPosted}/\${config.postsToComment}\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);
    console.log(\`[\${ACCOUNT_ID}] Total comments posted: \${commentsPosted}/\${config.postsToComment}\`);

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Fatal error:\`, error.message);

    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        const errorScreenshot = path.join(ARTIFACTS_DIR, \`error_\${Date.now()}.png\`);
        await page.screenshot({
          path: errorScreenshot,
          fullPage: false
        });
        console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${errorScreenshot}\`);

        await notify.error(ACCOUNT_ID, BOT_NAME, error.message, errorScreenshot);
      } catch (e) {
        console.error(\`[\${ACCOUNT_ID}] Screenshot failed\`);
      }
    }

    process.exit(1);
  } finally {
    if (browser) {
      try {
        // CRITICAL: Complete cleanup
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
        console.log(\`[\${ACCOUNT_ID}] Browser closed\`);

        // CRITICAL: Extra delay between accounts
        await delay(3000);

      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Cleanup error: \${e.message}\`);
      }
    }
  }
}

process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Bot stopped by user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] Unhandled Rejection:\`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] Uncaught Exception:\`, error);
  process.exit(1);
});

main();
`,
            "groupcomment": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

// Import AI comment generator module
const { generateAiComment, typeCommentSafely, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    targetURL: "https://www.facebook.com/groups/feed/",
    postsToComment: 5,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    autoLike: true,
    ai_settings: {
      use_openrouter: true,
      url_shortener_enabled: true,
      gemini_prompt: "Buat komentar untuk postingan grup ini: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. Santai dan engaging, 1-2 kalimat.",
      typing_delay_after_click: 3000
    }
  };
}

// Paths
const COMMENTS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "comments.txt");
const CTA_LINK_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cta_link.txt");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");

// Telegram logger
const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () => 1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

async function extractPostCaption(post) {
  try {
    // Primary selectors (prioritized)
    const primarySelectors = [
      'div[data-ad-rendering-role="story_message"]',
      'div[data-ad-comet-preview="message"]',
      'div[data-ad-preview="message"]'
    ];

    // Try primary selectors first
    for (const selector of primarySelectors) {
      try {
        const elements = await post.$$(selector);

        for (const element of elements) {
          const text = await element.evaluate(el => {
            const getAllText = (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.trim();
              }

              if (node.nodeType === Node.ELEMENT_NODE) {
                const role = node.getAttribute('role');
                const ariaLabel = node.getAttribute('aria-label');

                if (role === 'button' ||
                  role === 'link' ||
                  ariaLabel?.includes('Like') ||
                  ariaLabel?.includes('Comment') ||
                  ariaLabel?.includes('Share')) {
                  return '';
                }

                let text = '';
                for (const child of node.childNodes) {
                  text += getAllText(child) + ' ';
                }
                return text;
              }

              return '';
            };

            return getAllText(el).trim();
          });

          if (text && text.length > 10 && !text.includes('Like') && !text.includes('Comment')) {
            return text;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Fallback selectors
    const fallbackSelectors = [
      '[data-testid="post_message"]',
      'div[data-testid="post_message"]',
      '.userContent',
      'div.xdj266r.x11i5rnm.xat24cr.x1mh8g0r',
      'div[dir="auto"][style*="text-align"]'
    ];

    for (const selector of fallbackSelectors) {
      try {
        const elements = await post.$$(selector);

        for (const element of elements) {
          const text = await element.evaluate(el => {
            const getAllText = (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.trim();
              }

              if (node.nodeType === Node.ELEMENT_NODE) {
                const role = node.getAttribute('role');
                const ariaLabel = node.getAttribute('aria-label');

                if (role === 'button' ||
                  role === 'link' ||
                  ariaLabel?.includes('Like') ||
                  ariaLabel?.includes('Comment') ||
                  ariaLabel?.includes('Share')) {
                  return '';
                }

                let text = '';
                for (const child of node.childNodes) {
                  text += getAllText(child) + ' ';
                }
                return text;
              }

              return '';
            };

            return getAllText(el).trim();
          });

          if (text && text.length > 10 && !text.includes('Like') && !text.includes('Comment')) {
            return text;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Last resort: find post content within the post container only
    const postContent = await post.evaluate((postEl) => {
      // UI element patterns to exclude
      const uiPatterns = [
        /^\\d+\\s+(Obrolan|notifikasi|Chat|notification)/i,
        /Belum Dibaca|Unread/i,
        /Jumlah notifikasi/i,
        /ObrolanSemua|ChatAll/i,
        /Memiliki konten baru/i,
        /^\\d+\\s*:\\s*\\d+$/,
        /^\\d+\\s+(jam|menit|detik|hour|minute|second)/i,
        /^(Like|Comment|Share|Suka|Komentar|Bagikan)$/,
        /Pelajari selengkapnya|Learn more/i,
        /Sponsored|Bersponsor/i
      ];

      // Find all text-containing divs within this specific post
      const textDivs = Array.from(postEl.querySelectorAll('div[dir="auto"]'));

      let bestCandidate = '';
      let maxScore = 0;

      for (const div of textDivs) {
        // Get only direct text content
        let text = '';
        for (const child of div.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent + ' ';
          } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'SPAN') {
            text += child.textContent + ' ';
          }
        }
        text = text.trim();

        // Skip if too short or matches UI patterns
        if (text.length < 15) continue;

        let isUIElement = false;
        for (const pattern of uiPatterns) {
          if (pattern.test(text)) {
            isUIElement = true;
            break;
          }
        }

        if (isUIElement) continue;

        // Skip if it's part of action bar
        const role = div.getAttribute('role');
        const ariaLabel = div.getAttribute('aria-label');
        if (role === 'button' || role === 'navigation' || role === 'toolbar') continue;
        if (ariaLabel && (ariaLabel.includes('Like') || ariaLabel.includes('Comment'))) continue;

        // Check if element is within post bounds
        const rect = div.getBoundingClientRect();
        const postRect = postEl.getBoundingClientRect();

        if (rect.left < postRect.left || rect.right > postRect.right) continue;

        // Score based on length and position
        let score = text.length;

        // Prefer text in upper-middle section
        const relativeTop = (rect.top - postRect.top) / postRect.height;
        if (relativeTop > 0.1 && relativeTop < 0.5) {
          score += 100;
        }

        // Prefer text with sentence structure
        if (/[.!?]/.test(text)) {
          score += 50;
        }

        if (score > maxScore) {
          maxScore = score;
          bestCandidate = text;
        }
      }

      return bestCandidate;
    });

    if (postContent && postContent.length > 15) {
      return postContent;
    }

    return "";

  } catch (error) {
    return "";
  }
}

async function likePost(page, post) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Trying to like post...\`);

    // Strategy 1: Find Like button within post scope using specific selectors
    const likeResult = await post.evaluate((postElement) => {
      // Function to check if element or its children contain Like/Suka
      const isLikeButton = (element) => {
        const ariaLabel = element.getAttribute('aria-label') || '';
        const text = element.textContent || '';

        // Check for like-related text
        const hasLikeText = ariaLabel.match(/^(suka|like|sukai)$/i) ||
          text.match(/^(suka|like|sukai)$/i);

        // Must not be already liked
        const isPressed = element.getAttribute('aria-pressed') === 'true';
        const alreadyLiked = ariaLabel.includes('Hapus suka') ||
          ariaLabel.includes('Unlike') ||
          ariaLabel.includes('Remove like');

        return hasLikeText && !isPressed && !alreadyLiked;
      };

      // Strategy 1a: Find by exact aria-label within post
      const likeByAriaLabel = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .find(btn => {
          const label = (btn.getAttribute('aria-label') || '').trim();
          return (label === 'Suka' || label === 'Like' || label === 'Sukai') &&
            btn.getAttribute('aria-pressed') !== 'true' &&
            btn.offsetParent !== null;
        });

      if (likeByAriaLabel) {
        const rect = likeByAriaLabel.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 15) {
          likeByAriaLabel.click();
          return { success: true, method: 'aria-label', label: likeByAriaLabel.getAttribute('aria-label') };
        }
      }

      // Strategy 1b: Find first clickable button in reactions toolbar
      const toolbars = Array.from(postElement.querySelectorAll('div[role="toolbar"]'));
      for (const toolbar of toolbars) {
        // Get immediate child buttons only (not nested)
        const buttons = Array.from(toolbar.children).filter(child =>
          child.getAttribute('role') === 'button' ||
          child.tagName === 'DIV' && child.hasAttribute('tabindex')
        );

        if (buttons.length >= 2) { // Typically: Like, Comment, Share
          const firstBtn = buttons[0];

          // Verify it's a like button
          if (isLikeButton(firstBtn)) {
            const rect = firstBtn.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 15 && firstBtn.offsetParent !== null) {
              firstBtn.click();
              return { success: true, method: 'toolbar-first', label: firstBtn.getAttribute('aria-label') || firstBtn.textContent };
            }
          }
        }
      }

      // Strategy 1c: Find by SVG icon (thumbs up) within clickable button
      const buttonsWithSvg = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .filter(btn => btn.querySelector('svg'));

      for (const btn of buttonsWithSvg) {
        if (isLikeButton(btn)) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && btn.offsetParent !== null) {
            btn.click();
            return { success: true, method: 'svg-icon', label: btn.getAttribute('aria-label') || 'Like' };
          }
        }
      }

      // Strategy 1d: Find by text content matching (last resort)
      const allInteractive = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"], div[tabindex="0"]'));

      for (const element of allInteractive) {
        const text = (element.textContent || '').trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').trim();

        if ((text === 'Suka' || text === 'Like' || ariaLabel === 'Suka' || ariaLabel === 'Like') &&
          element.getAttribute('aria-pressed') !== 'true' &&
          !ariaLabel.includes('Hapus') &&
          !ariaLabel.includes('Unlike')) {

          const rect = element.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && element.offsetParent !== null) {
            element.click();
            return { success: true, method: 'text-match', label: ariaLabel || text };
          }
        }
      }

      return { success: false };
    });

    if (likeResult.success) {
      console.log(\`[\${ACCOUNT_ID}] -> Post liked\`);
      await delay(1000);
      return true;
    }

    console.log(\`[\${ACCOUNT_ID}] -> Like button not found or already liked\`);
    await delay(1000);
    return false;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to like: \${error.message}\`);
    return false;
  }
}

async function loadCookiesFromFile() {
  try {
    console.log(\`[\${ACCOUNT_ID}] Loading cookies from: \${COOKIES_PATH}\`);
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
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load cookies: \${error.message}\`);
  }
}

async function loadComments() {
  try {
    const data = await fs.readFile(COMMENTS_PATH, "utf8");
    const comments = data.split("---").map(comment => comment.trim()).filter(comment => comment);
    if (comments.length === 0) {
      throw new Error(\`[\${ACCOUNT_ID}] Comments file is empty\`);
    }
    return comments;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] comments.txt not found, creating default...\`);
      const defaultComments = [
        "Bagus banget ini!",
        "Keren! Thanks for sharing",
        "Mantap",
        "Nice post!",
        "Suka banget dengan konten ini"
      ].join("\\n---\\n");
      await fs.writeFile(COMMENTS_PATH, defaultComments, "utf8");
      return defaultComments.split("---").map(c => c.trim());
    }
    throw error;
  }
}

async function loadCtaLink() {
  try {
    // Try to get path from config first (new method)
    if (config.paths && config.paths.cta_link) {
      const data = await fs.readFile(config.paths.cta_link, "utf8");
      return data.trim();
    }

    // Fallback to old method
    const data = await fs.readFile(CTA_LINK_PATH, "utf8");
    return data.trim();
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] cta_link.txt not found\`);
    return "";
  }
}

async function loadGeminiApiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(key => key.trim()).filter(key => key && key.startsWith("AIzaSy"));
    if (keys.length === 0) {
      console.log(\`[\${ACCOUNT_ID}] Warning: No valid Gemini API keys found\`);
      return [];
    }
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] Warning: gemini_keys.txt not found\`);
      return [];
    }
    throw error;
  }
}

async function main() {
  let browser;

  try {
    console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto Comment Group (Enhanced) ===\`);
    console.log(\`[\${ACCOUNT_ID}] Auto-like enabled: \${config.autoLike !== false ? 'Yes' : 'No'}\`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const comments = await loadComments();
    console.log(\`[\${ACCOUNT_ID}] Loaded \${comments.length} static comments\`);

    let ctaLink = "";
    let geminiKeys = [];
    let openRouterKeys = [];

    // Check if we should use AI
    const potentialAI = (await fs.access(OPENROUTER_KEYS_PATH).then(() => true).catch(() => false)) ||
      (await fs.access(GEMINI_KEYS_PATH).then(() => true).catch(() => false));

    if (potentialAI) {
      ctaLink = await loadCtaLink();
      geminiKeys = await loadGeminiApiKeys();
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);

      console.log(\`[\${ACCOUNT_ID}] Loaded \${openRouterKeys.length} OpenRouter API keys\`);
      console.log(\`[\${ACCOUNT_ID}] Loaded \${geminiKeys.length} Gemini API keys (fallback)\`);
    }

    const useAI = (openRouterKeys.length > 0 || geminiKeys.length > 0);

    if (!useAI && comments.length === 0) {
      throw new Error(\`[\${ACCOUNT_ID}] No AI keys and comments.txt is empty!\`);
    }

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

    console.log(\`[\${ACCOUNT_ID}] Loading cookies...\`);
    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(\`[\${ACCOUNT_ID}] \${cookies.length} cookies loaded\`);

    console.log(\`[\${ACCOUNT_ID}] Navigating to: \${config.targetURL}\`);
    try {
      await page.goto(config.targetURL, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
    } catch (navError) {
      console.log(\`[\${ACCOUNT_ID}] Navigation timeout, continuing...\`);
    }

    // CRITICAL: Wait for page to stabilize
    console.log(\`[\${ACCOUNT_ID}] Waiting for initial content load (15s)...\`);
    await delay(15000);

    const title = await page.title();
    if (title.includes('Log') || title.includes('login')) {
      throw new Error(\`[\${ACCOUNT_ID}] Login failed! Check cookies.json\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Page ready: \${title}\`);

    // Additional stabilization to ensure group posts are fully rendered
    console.log(\`[\${ACCOUNT_ID}] Ensuring group posts are fully rendered...\`);
    await delay(3000);

    const processedPosts = new Set();
    let commentIndex = 0;
    let commentsPosted = 0;
    console.log(\`[\${ACCOUNT_ID}] Target: \${config.postsToComment} comments\`);

    let geminiWorkingIndex = 0;
    let postsLikedOnly = 0; // Track posts that only get liked (no comment)
    let currentPostIndex = 0; // Array index (0-based)
    let noNewPostsCount = 0;

    // Circuit breaker to prevent infinite loop
    let consecutiveNotFound = 0;
    let maxConsecutiveNotFound = 10; // Exit after 10 consecutive failures
    let totalScrollAttempts = 0;
    let maxScrollAttempts = 50; // Max 50 scroll attempts total
    let lastPostCount = 0;
    let samePostCountStreak = 0;

    // Function to scroll to load more posts
    async function scrollToLoadMore() {
      try {
        console.log(\`[\${ACCOUNT_ID}] -> Scrolling to load more posts...\`);

        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.7);
        });

        await delay(2000);
        return true;
      } catch (error) {
        console.log(\`[\${ACCOUNT_ID}] -> Failed to scroll: \${error.message}\`);
        return false;
      }
    }

    // Function to scroll to next post
    async function scrollToNextPost(currentPos) {
      try {
        const nextPos = currentPos + 1;
        console.log(\`[\${ACCOUNT_ID}] -> Scrolling to next container (aria-posinset="\${nextPos}")\`);

        const scrolled = await page.evaluate((targetPos) => {
          const nextPost = document.querySelector(\`div[aria-posinset="\${targetPos}"]\`);
          if (nextPost) {
            nextPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
          }
          return false;
        }, nextPos);

        if (!scrolled) {
          console.log(\`[\${ACCOUNT_ID}] -> Next container not found, using fallback scroll\`);
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 0.7);
          });
        }

        await delay(2000);
        return true;
      } catch (error) {
        console.log(\`[\${ACCOUNT_ID}] -> Failed to scroll to next post: \${error.message}\`);
        return false;
      }
    }

    while (commentsPosted < config.postsToComment) {
      // Get all visible posts using div[role="article"]
      const posts = await page.$$("div[role='article']");

      if (posts.length === 0) {
        console.log(\`[\${ACCOUNT_ID}] No posts found. Waiting...\`);
        await delay(10000);
        noNewPostsCount++;
        if (noNewPostsCount > 5) {
          console.log(\`[\${ACCOUNT_ID}] No posts found after multiple attempts. Exiting.\`);
          break;
        }
        continue;
      }

      console.log(\`[\${ACCOUNT_ID}] Found \${posts.length} posts (current index: \${currentPostIndex})\`);

      // Reset counter when we find posts
      noNewPostsCount = 0;

      // Check if we need to scroll for more posts
      if (currentPostIndex >= posts.length) {
        console.log(\`[\${ACCOUNT_ID}] Current index \${currentPostIndex} >= posts.length \${posts.length}, scrolling for more...\`);
        await scrollToLoadMore();
        totalScrollAttempts++;
        consecutiveNotFound++;

        if (consecutiveNotFound >= maxConsecutiveNotFound || totalScrollAttempts >= maxScrollAttempts) {
          console.log(\`[\${ACCOUNT_ID}] Reached scroll limit. Exiting.\`);
          break;
        }
        continue;
      }

      // Get post by array index
      const post = posts[currentPostIndex];

      // Reset consecutive not found counter
      consecutiveNotFound = 0;

      try {
        // Skip if already marked as processed
        const alreadyMarked = await post.evaluate(el => {
          return el.getAttribute('data-bot-processed') === 'true';
        });

        if (alreadyMarked) {
          currentPostIndex++;
          continue;
        }
        // Generate unique post ID using array index and content hash
        const postId = await post.evaluate((el, index) => {
          // Get post content for hashing
          const textContent = el.textContent?.substring(0, 200) || '';
          const timestamp = el.querySelector('abbr')?.getAttribute('data-utime') || '';

          // Create a simple hash from content
          let hash = 0;
          for (let i = 0; i < textContent.length; i++) {
            const char = textContent.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }

          // Use array index + content hash for unique ID
          return \`post_\${index}_\${Math.abs(hash).toString(36)}_\${timestamp}\`;
        }, currentPostIndex);

        // Check if already processed
        if (processedPosts.has(postId)) {
          console.log(\`[\${ACCOUNT_ID}] Post \${currentPostIndex} already processed (ID: \${postId.substring(0, 50)}...), skipping...\`);
          currentPostIndex++;
          continue;
        }

        console.log(\`[\${ACCOUNT_ID}] Processing post \${currentPostIndex} (ID: \${postId.substring(0, 50)}...)\`);

        // Ensure post is in viewport
        await post.evaluate(el => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        // Wait longer for post elements to render
        console.log(\`[\${ACCOUNT_ID}] -> Waiting for post to fully render...\`);
        await delay(4000);

        // Extract caption using enhanced function
        console.log(\`[\${ACCOUNT_ID}] -> Extracting caption from post...\`);
        const caption = await extractPostCaption(post);

        // Check if caption is too short - if so, just like and skip commenting
        if (!caption || caption.length < 10) {
          console.log(\`[\${ACCOUNT_ID}] -> Caption too short (\${caption?.length || 0} chars), will only like this post\`);

          // Auto-like
          if (config.autoLike !== false) {
            await delay(1000);
            await likePost(page, post);
            postsLikedOnly++;
            console.log(\`[\${ACCOUNT_ID}] -> Post liked (no comment due to short caption)\`);
          }

          processedPosts.add(postId);

          // Mark post as processed
          await post.evaluate(el => {
            el.setAttribute('data-bot-processed', 'true');
            el.style.opacity = '0.7';
          });

          // Clear focus
          console.log(\`[\${ACCOUNT_ID}] -> Clearing focus...\`);
          await page.evaluate(() => {
            if (document.activeElement) {
              document.activeElement.blur();
            }
            if (window.getSelection) {
              window.getSelection().removeAllRanges();
            }
          });
          await delay(1000);

          // Scroll to next post BEFORE waiting
          await scrollToNextPost(currentPostIndex);
          currentPostIndex++;

          // Wait shorter interval
          const shortInterval = Math.floor(getRandomInterval() / 2);
          console.log(\`[\${ACCOUNT_ID}] Waiting \${shortInterval / 1000}s before next post...\`);
          await delay(shortInterval);

          continue;
        }

        let comment;

        // Generate or select comment
        if (useAI) {
          const result = await generateAiComment({
            caption: caption,
            ctaLink: ctaLink,
            prompt: config.ai_settings.gemini_prompt || "Buat komentar untuk: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. 1-2 kalimat.",
            openRouterKeys: openRouterKeys,
            geminiKeys: geminiKeys,
            staticComments: comments,
            geminiWorkingIndex: geminiWorkingIndex,
            accountId: ACCOUNT_ID,
            urlShortenerEnabled: config.ai_settings?.url_shortener_enabled === true
          });

          comment = result.comment;
          geminiWorkingIndex = result.workingIndex;

          if (!comment) {
            processedPosts.add(postId);
            currentPostIndex++;
            continue;
          }

          console.log(\`[\${ACCOUNT_ID}] -> Using \${result.provider} comment\${result.model ? \` (\${result.model})\` : ''}\`);
        } else {
          comment = comments[commentIndex % comments.length];
          console.log(\`[\${ACCOUNT_ID}] -> Using static comment\`);
        }

        // Find and click comment button - 3 STRATEGIES
        let commentClicked = false;

        // Strategy 1: Look for comment button with aria-label
        const commentButtonSelectors = [
          "div[aria-label='Beri komentar']",
          "div[aria-label='Comment']",
          "div[aria-label='Write a comment']",
          "div[role='button'][aria-label*='comment']",
          "div[role='button'][aria-label*='Comment']",
          "div[role='button'][aria-label*='komentar']"
        ];

        for (const selector of commentButtonSelectors) {
          try {
            const button = await post.$(selector);
            if (button) {
              const isVisible = await button.boundingBox();
              if (isVisible && isVisible.height > 10) {
                await button.click({ delay: 100 });
                console.log(\`[\${ACCOUNT_ID}] -> Comment button clicked\`);
                commentClicked = true;
                await delay(config.ai_settings?.typing_delay_after_click || 2000);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }

        // Strategy 2: Look for existing comment text area (already expanded)
        if (!commentClicked) {
          const textAreaSelectors = [
            "div[contenteditable='true'][role='textbox']",
            "div[contenteditable='true'][aria-label*='comment']",
            "div[contenteditable='true'][aria-label*='Write']",
            "div[contenteditable='true']",
            "p.xdj266r.x14z9mp.xat24cr.x1lziwak",
            "textarea[placeholder*='comment']",
            "textarea[placeholder*='komentar']"
          ];

          for (const selector of textAreaSelectors) {
            try {
              const area = await post.$(selector);
              if (area) {
                const isVisible = await area.boundingBox();
                if (isVisible && isVisible.width > 100 && isVisible.height > 20) {
                  await area.click({ delay: 100 });
                  console.log(\`[\${ACCOUNT_ID}] -> Comment area clicked (\${selector})\`);
                  commentClicked = true;
                  await delay(config.ai_settings?.typing_delay_after_click || 2000);
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
        }

        // Strategy 3: Try to find by text content "Comment" or "Komentar"
        if (!commentClicked) {
          commentClicked = await post.evaluate(() => {
            const commentTexts = ['Comment', 'Komentar', 'Beri komentar', 'Write a comment'];
            const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));

            for (const btn of allButtons) {
              const text = (btn.textContent || '').trim();
              const ariaLabel = btn.getAttribute('aria-label') || '';

              for (const commentText of commentTexts) {
                if (text.includes(commentText) || ariaLabel.includes(commentText)) {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 30 && rect.height > 15 && btn.offsetParent !== null) {
                    btn.click();
                    return true;
                  }
                }
              }
            }
            return false;
          });

          if (commentClicked) {
            console.log(\`[\${ACCOUNT_ID}] -> Comment button clicked (text search)\`);
            await delay(config.ai_settings?.typing_delay_after_click || 2000);
          }
        }

        // If still not found, skip this post
        if (!commentClicked) {
          console.log(\`[\${ACCOUNT_ID}] -> Comment area not found\`);
          processedPosts.add(postId);
          currentPostIndex++;
          continue;
        }

        // Wait for comment box to be fully ready and focused
        await delay(1000);

        // Clear any existing focus and ensure we're starting fresh
        await page.evaluate(() => {
          // Clear any selection
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }

          // Find the active element (should be the comment box)
          const activeEl = document.activeElement;
          if (activeEl && activeEl.isContentEditable) {
            // Clear any existing content
            activeEl.textContent = '';
          }
        });

        await delay(500);

        // Type comment with safe delays
        console.log(\`[\${ACCOUNT_ID}] -> Typing comment: "\${comment}"\`);

        await typeCommentSafely(page, comment, {
          delayAfterClick: 0, // Already waited above
          typingDelay: 100,
          accountId: ACCOUNT_ID
        });

        // Send comment
        await page.keyboard.press("Enter");
        console.log(\`[\${ACCOUNT_ID}] -> Comment sent\`);

        // Auto-like
        await delay(2000);
        if (config.autoLike !== false) {
          await likePost(page, post);
        }

        // Close any dialogs
        await delay(2000);
        await page.keyboard.press("Escape");
        console.log(\`[\${ACCOUNT_ID}] -> Closing dialog\`);
        await delay(800);
        await page.keyboard.press("Escape");
        await delay(800);

        // Force blur and clear selection
        await page.evaluate(() => {
          if (document.activeElement) {
            document.activeElement.blur();
          }
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
          document.body.click();
        });
        await delay(500);

        processedPosts.add(postId);
        commentsPosted++;

        if (!useAI) {
          commentIndex++;
        }

        // MARK this post as processed immediately
        await post.evaluate(el => {
          el.setAttribute('data-bot-processed', 'true');
          el.style.opacity = '0.7'; // Visual indicator (optional)
        });

        // Clear focus
        console.log(\`[\${ACCOUNT_ID}] -> Clearing focus...\`);
        await page.evaluate(() => {
          if (document.activeElement) {
            document.activeElement.blur();
          }
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
        });
        await delay(1000);

        // Scroll to next post BEFORE waiting
        await scrollToNextPost(currentPostIndex);
        currentPostIndex++;

        // Check if we've reached the target
        if (commentsPosted >= config.postsToComment) {
          console.log(\`[\${ACCOUNT_ID}] Target reached: \${commentsPosted}/\${config.postsToComment}\`);
          break;
        }

        // Wait random interval before processing next post
        const interval = getRandomInterval();
        console.log(\`[\${ACCOUNT_ID}] Waiting \${interval / 1000}s before next comment...\`);
        await delay(interval);

      } catch (error) {
        console.error(\`[\${ACCOUNT_ID}] -> Failed to interact: \${error.message}\`);

        try {
          const errorScreenshot = path.join(ARTIFACTS_DIR, \`group_error_\${Date.now()}.png\`);
          await page.screenshot({ path: errorScreenshot, fullPage: false });
          console.log(\`[\${ACCOUNT_ID}] -> Error screenshot: \${errorScreenshot}\`);
        } catch (screenshotError) {
          console.log(\`[\${ACCOUNT_ID}] -> Failed to take screenshot\`);
        }

        currentPostIndex++;
        continue;
      }
    }

    console.log(\`[\${ACCOUNT_ID}] === COMPLETE ===\`);
    console.log(\`[\${ACCOUNT_ID}] Total comments posted: \${commentsPosted}/\${config.postsToComment}\`);
    console.log(\`[\${ACCOUNT_ID}] Total posts liked only (no caption): \${postsLikedOnly}\`);
    console.log(\`[\${ACCOUNT_ID}] Total scroll attempts: \${totalScrollAttempts}\`);
    console.log(\`[\${ACCOUNT_ID}] Circuit breaker status: \${consecutiveNotFound}/\${maxConsecutiveNotFound} consecutive failures\`);

    const successDetails = \`Comments: \${commentsPosted}/\${config.postsToComment} | Liked Only: \${postsLikedOnly} | Scrolls: \${totalScrollAttempts}\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Fatal error:\`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        const errorScreenshot = path.join(ARTIFACTS_DIR, \`fatal_error_\${Date.now()}.png\`);
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${errorScreenshot}\`);

        await notify.error(ACCOUNT_ID, BOT_NAME, error.message, errorScreenshot);
      } catch (screenshotError) {
        console.log(\`[\${ACCOUNT_ID}] Failed to take screenshot\`);
      }
    }

    process.exit(1);
  } finally {
    if (browser) {
      try {
        // CRITICAL: Complete cleanup
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
        console.log(\`[\${ACCOUNT_ID}] Browser closed\`);

        // CRITICAL: Extra delay between accounts
        await delay(3000);

      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Cleanup error: \${e.message}\`);
      }
    }
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Bot stopped by user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] Unhandled Rejection:\`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] Uncaught Exception:\`, error);
  process.exit(1);
});

main();
`,
            "uploadreels": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Import AI caption generator
const { generateAiComment, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    maxUploadsPerRun: 3,
    minIntervalSeconds: 300,
    maxIntervalSeconds: 600,
    videoSettings: {
      maxSizeGB: 4,
      allowedFormats: ['.mp4', '.mov', '.avi', '.mkv'],
      moveAfterUpload: true,
      uploadedFolder: "uploaded",
      use_local_videos: true, // Priority: local first
      auto_download: true, // Auto-download jika tidak ada video lokal
      download_source: "pexels", // pexels or pixabay
      video_orientation: "portrait", // portrait or landscape
      video_duration: "medium", // short (15s), medium (15-30s), long (30s+)
      search_queries: [
        "motivation",
        "success",
        "nature",
        "fitness",
        "lifestyle",
        "travel",
        "business",
        "inspiration"
      ]
    },
    ai_caption: {
      enabled: true,
      use_openrouter: true,
      prompt: "Buat caption menarik untuk video reels ini. Deskripsi: {VIDEO_DESCRIPTION}. Caption harus engaging, 1-2 kalimat dengan emoji yang sesuai.",
      fallback_caption: "Check this out! 🔥",
      add_quote: true,
      quote_style: "motivational" // motivational, inspirational, success, lifestyle
    },
    typing_delays: {
      after_video_upload: 8000,
      after_caption: 3000,
      typing_speed: 80,
      before_post: 2000
    },
    sound_settings: {
      enabled: false, // Manual control - set true to enable
      use_trending: true,
      fallback_sound: null
    },
    privacy: "public"
  };
}

// Paths
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const PEXELS_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "pexels_keys.txt");
const PIXABAY_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "pixabay_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const LOCAL_VIDEOS_DIR = path.join(__dirname, "../videos");
const DOWNLOADED_VIDEOS_DIR = path.join(ARTIFACTS_DIR, "downloaded_videos");
const UPLOADED_VIDEOS_DIR = path.join(LOCAL_VIDEOS_DIR, config.videoSettings?.uploadedFolder || "uploaded");
const UPLOAD_LOG_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "upload_log.txt");

// Telegram logger with error handling
let notify;
try {
  notify = require('./notify');
} catch (e) {
  console.error(\`[\${ACCOUNT_ID}] Failed to load telegram logger:\`, e.message);
  notify = {
    success: async () => { },
    error: async () => { },
    warning: async () => { },
    systemAlert: async () => { }
  };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Motivational quotes database
const QUOTES = {
  motivational: [
    "Success is not final, failure is not fatal 💪",
    "Dream big, work hard, stay focused 🎯",
    "Every day is a new beginning 🌅",
    "Believe you can and you're halfway there ✨",
    "The future belongs to those who believe 🚀",
    "Make it happen, shock everyone 💥",
    "Your only limit is you 🔥",
    "Stay hungry, stay foolish 🌟"
  ],
  inspirational: [
    "Be the energy you want to attract ✨",
    "Create the life you can't wait to wake up to 🌈",
    "Good vibes only 🌺",
    "Life is beautiful 🦋",
    "Choose happiness every day 😊",
    "Shine bright like a diamond 💎",
    "Live your best life 🌸",
    "Positive mind, positive vibes ☀️"
  ],
  success: [
    "Success starts with self-belief 👑",
    "Hustle until your haters ask if you're hiring 💼",
    "Work hard in silence, let success make the noise 📈",
    "The grind never stops 💯",
    "Boss mode activated 👔",
    "Building an empire 🏆",
    "Success is a journey, not a destination 🛤️",
    "Winners never quit 🥇"
  ],
  lifestyle: [
    "Living my best life 🎉",
    "Good times and tan lines ☀️",
    "Making memories 📸",
    "Life is short, make it sweet 🍭",
    "Collect moments, not things 🌍",
    "Adventure awaits 🗺️",
    "Enjoy the little things 🌼",
    "Life is better when you're laughing 😄"
  ]
};

async function loadCookiesFromFile() {
  try {
    console.log(\`[\${ACCOUNT_ID}] Reading cookies from: \${COOKIES_PATH}\`);
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
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load cookies: \${error.message}\`);
  }
}

async function loadGeminiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(k => k.trim()).filter(k => k.startsWith("AIzaSy"));

    if (keys.length === 0) {
      throw new Error(\`[\${ACCOUNT_ID}] No valid Gemini API keys\`);
    }

    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(GEMINI_KEYS_PATH, "# Add your Gemini API keys here\\n# AIzaSy..._YOUR_KEY");
      throw new Error(\`[\${ACCOUNT_ID}] gemini_keys.txt not found. Template created.\`);
    }
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load Gemini keys: \${error.message}\`);
  }
}

async function loadPexelsKeys() {
  try {
    const data = await fs.readFile(PEXELS_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(k => k.trim()).filter(k => k && k.length > 10);
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(PEXELS_KEYS_PATH, "# Add your Pexels API keys here\\n# Get from: https://www.pexels.com/api/\\n");
    }
    return [];
  }
}

async function loadPixabayKeys() {
  try {
    const data = await fs.readFile(PIXABAY_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(k => k.trim()).filter(k => k && k.length > 10);
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(PIXABAY_KEYS_PATH, "# Add your Pixabay API keys here\\n# Get from: https://pixabay.com/api/docs/\\n");
    }
    return [];
  }
}

async function downloadVideoFromPexels(query, apiKeys) {
  console.log(\`[\${ACCOUNT_ID}] Searching Pexels for: \${query}\`);

  await fs.mkdir(DOWNLOADED_VIDEOS_DIR, { recursive: true });

  for (const apiKey of apiKeys) {
    try {
      const orientation = config.videoSettings?.video_orientation || 'portrait';

      const searchResponse = await axios.get('https://api.pexels.com/videos/search', {
        params: {
          query: query,
          orientation: orientation,
          size: 'medium',
          per_page: 15
        },
        headers: {
          'Authorization': apiKey
        },
        timeout: 15000
      });

      if (!searchResponse.data.videos || searchResponse.data.videos.length === 0) {
        console.log(\`[\${ACCOUNT_ID}] No videos found for: \${query}\`);
        continue;
      }

      const videos = searchResponse.data.videos;
      const selectedVideo = videos[Math.floor(Math.random() * videos.length)];

      // Get video file based on quality
      let videoFile = selectedVideo.video_files.find(f => f.quality === 'hd' && f.width <= 1080);
      if (!videoFile) {
        videoFile = selectedVideo.video_files.find(f => f.quality === 'sd');
      }
      if (!videoFile) {
        videoFile = selectedVideo.video_files[0];
      }

      console.log(\`[\${ACCOUNT_ID}] Selected: \${selectedVideo.url}\`);
      console.log(\`[\${ACCOUNT_ID}] Duration: \${selectedVideo.duration}s | Quality: \${videoFile.quality}\`);

      // Download video
      const videoResponse = await axios.get(videoFile.link, {
        responseType: 'arraybuffer',
        timeout: 120000
      });

      const timestamp = Date.now();
      const fileName = \`pexels_\${query.replace(/\\s+/g, '_')}_\${timestamp}.mp4\`;
      const filePath = path.join(DOWNLOADED_VIDEOS_DIR, fileName);

      await fs.writeFile(filePath, videoResponse.data);

      const stat = await fs.stat(filePath);

      console.log(\`[\${ACCOUNT_ID}] Downloaded: \${fileName} (\${(stat.size / 1024 / 1024).toFixed(2)}MB)\`);
      console.log(\`[\${ACCOUNT_ID}] Video by \${selectedVideo.user.name} on Pexels\`);

      return {
        filename: fileName,
        path: filePath,
        size: stat.size,
        sizeGB: (stat.size / 1024 / 1024 / 1024).toFixed(2),
        source: 'pexels',
        attribution: {
          photographer: selectedVideo.user.name,
          photographer_url: selectedVideo.user.url,
          video_url: selectedVideo.url
        }
      };

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] Pexels API failed: \${error.message}\`);
      continue;
    }
  }

  throw new Error(\`[\${ACCOUNT_ID}] All Pexels API keys failed\`);
}

async function downloadVideoFromPixabay(query, apiKeys) {
  console.log(\`[\${ACCOUNT_ID}] Searching Pixabay for: \${query}\`);

  await fs.mkdir(DOWNLOADED_VIDEOS_DIR, { recursive: true });

  for (const apiKey of apiKeys) {
    try {
      const searchResponse = await axios.get('https://pixabay.com/api/videos/', {
        params: {
          key: apiKey,
          q: query,
          per_page: 20,
          safesearch: true
        },
        timeout: 15000
      });

      if (!searchResponse.data.hits || searchResponse.data.hits.length === 0) {
        console.log(\`[\${ACCOUNT_ID}] No videos found for: \${query}\`);
        continue;
      }

      const videos = searchResponse.data.hits;
      const selectedVideo = videos[Math.floor(Math.random() * videos.length)];

      // Get best quality video
      let videoFile = selectedVideo.videos.large || selectedVideo.videos.medium || selectedVideo.videos.small;

      console.log(\`[\${ACCOUNT_ID}] Selected: Video ID \${selectedVideo.id}\`);
      console.log(\`[\${ACCOUNT_ID}] Duration: \${selectedVideo.duration}s\`);

      // Download video
      const videoResponse = await axios.get(videoFile.url, {
        responseType: 'arraybuffer',
        timeout: 120000
      });

      const timestamp = Date.now();
      const fileName = \`pixabay_\${query.replace(/\\s+/g, '_')}_\${timestamp}.mp4\`;
      const filePath = path.join(DOWNLOADED_VIDEOS_DIR, fileName);

      await fs.writeFile(filePath, videoResponse.data);

      const stat = await fs.stat(filePath);

      console.log(\`[\${ACCOUNT_ID}] Downloaded: \${fileName} (\${(stat.size / 1024 / 1024).toFixed(2)}MB)\`);
      console.log(\`[\${ACCOUNT_ID}] Video by \${selectedVideo.user} on Pixabay\`);

      return {
        filename: fileName,
        path: filePath,
        size: stat.size,
        sizeGB: (stat.size / 1024 / 1024 / 1024).toFixed(2),
        source: 'pixabay',
        attribution: {
          photographer: selectedVideo.user,
          video_url: selectedVideo.pageURL
        }
      };

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] Pixabay API failed: \${error.message}\`);
      continue;
    }
  }

  throw new Error(\`[\${ACCOUNT_ID}] All Pixabay API keys failed\`);
}

async function getRandomQuote() {
  const quoteStyle = config.ai_caption?.quote_style || 'motivational';
  const quotes = QUOTES[quoteStyle] || QUOTES.motivational;
  return quotes[Math.floor(Math.random() * quotes.length)];
}

async function getLocalVideos() {
  try {
    console.log(\`[\${ACCOUNT_ID}] Scanning local videos: \${LOCAL_VIDEOS_DIR}\`);

    await fs.mkdir(LOCAL_VIDEOS_DIR, { recursive: true });
    await fs.mkdir(UPLOADED_VIDEOS_DIR, { recursive: true });

    const files = await fs.readdir(LOCAL_VIDEOS_DIR);
    const allowedFormats = config.videoSettings?.allowedFormats || ['.mp4', '.mov', '.avi', '.mkv'];
    const maxSizeBytes = (config.videoSettings?.maxSizeGB || 4) * 1024 * 1024 * 1024;

    const videos = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!allowedFormats.includes(ext)) continue;

      const filePath = path.join(LOCAL_VIDEOS_DIR, file);
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) continue;
      if (stat.size > maxSizeBytes) {
        console.log(\`[\${ACCOUNT_ID}] Skipping \${file} (too large: \${(stat.size / 1024 / 1024 / 1024).toFixed(2)}GB)\`);
        continue;
      }

      // Check if already uploaded
      const uploadLog = await getUploadLog();
      if (uploadLog.includes(file)) {
        console.log(\`[\${ACCOUNT_ID}] Skipping \${file} (already uploaded)\`);
        continue;
      }

      videos.push({
        filename: file,
        path: filePath,
        size: stat.size,
        sizeGB: (stat.size / 1024 / 1024 / 1024).toFixed(2),
        source: 'local'
      });
    }

    console.log(\`[\${ACCOUNT_ID}] Found \${videos.length} local videos\`);
    return videos;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] Error scanning videos: \${error.message}\`);
    return [];
  }
}

async function selectVideo(pexelsKeys, pixabayKeys) {
  const useLocalVideos = config.videoSettings?.use_local_videos !== false;
  const autoDownload = config.videoSettings?.auto_download !== false; // Default true

  console.log(\`[\${ACCOUNT_ID}] Video selection mode:\`);
  console.log(\`[\${ACCOUNT_ID}]   - Use local videos: \${useLocalVideos}\`);
  console.log(\`[\${ACCOUNT_ID}]   - Auto download: \${autoDownload}\`);
  console.log(\`[\${ACCOUNT_ID}]   - Pexels keys: \${pexelsKeys.length}\`);
  console.log(\`[\${ACCOUNT_ID}]   - Pixabay keys: \${pixabayKeys.length}\`);

  // Try local videos first
  if (useLocalVideos) {
    console.log(\`[\${ACCOUNT_ID}] Scanning for local videos...\`);
    const localVideos = await getLocalVideos();
    if (localVideos.length > 0) {
      const selectedVideo = localVideos[Math.floor(Math.random() * localVideos.length)];
      console.log(\`[\${ACCOUNT_ID}] ✓ Selected local video: \${selectedVideo.filename}\`);
      return selectedVideo;
    }
    console.log(\`[\${ACCOUNT_ID}] No local videos found in: \${LOCAL_VIDEOS_DIR}\`);
  }

  // Auto-download if enabled
  if (!autoDownload) {
    throw new Error(\`[\${ACCOUNT_ID}] Auto-download is disabled and no local videos available\`);
  }

  if (pexelsKeys.length === 0 && pixabayKeys.length === 0) {
    throw new Error(\`[\${ACCOUNT_ID}] No API keys available. Please add keys to:\\n  - \${PEXELS_KEYS_PATH}\\n  - \${PIXABAY_KEYS_PATH}\`);
  }

  const queries = config.videoSettings?.search_queries || ["motivation", "success", "inspiration"];
  const randomQuery = queries[Math.floor(Math.random() * queries.length)];

  console.log(\`[\${ACCOUNT_ID}] Starting auto-download with query: "\${randomQuery}"\`);

  const downloadSource = config.videoSettings?.download_source || 'pexels';

  // Try preferred source first
  if (downloadSource === 'pexels' && pexelsKeys.length > 0) {
    try {
      console.log(\`[\${ACCOUNT_ID}] Attempting download from Pexels...\`);
      return await downloadVideoFromPexels(randomQuery, pexelsKeys);
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] Pexels failed: \${e.message}\`);
      if (pixabayKeys.length > 0) {
        console.log(\`[\${ACCOUNT_ID}] Trying fallback to Pixabay...\`);
        try {
          return await downloadVideoFromPixabay(randomQuery, pixabayKeys);
        } catch (e2) {
          console.log(\`[\${ACCOUNT_ID}] Pixabay also failed: \${e2.message}\`);
        }
      }
    }
  } else if (downloadSource === 'pixabay' && pixabayKeys.length > 0) {
    try {
      console.log(\`[\${ACCOUNT_ID}] Attempting download from Pixabay...\`);
      return await downloadVideoFromPixabay(randomQuery, pixabayKeys);
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] Pixabay failed: \${e.message}\`);
      if (pexelsKeys.length > 0) {
        console.log(\`[\${ACCOUNT_ID}] Trying fallback to Pexels...\`);
        try {
          return await downloadVideoFromPexels(randomQuery, pexelsKeys);
        } catch (e2) {
          console.log(\`[\${ACCOUNT_ID}] Pexels also failed: \${e2.message}\`);
        }
      }
    }
  } else {
    // No preferred source, try any available
    if (pexelsKeys.length > 0) {
      try {
        console.log(\`[\${ACCOUNT_ID}] Attempting download from Pexels...\`);
        return await downloadVideoFromPexels(randomQuery, pexelsKeys);
      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Pexels failed: \${e.message}\`);
      }
    }

    if (pixabayKeys.length > 0) {
      try {
        console.log(\`[\${ACCOUNT_ID}] Attempting download from Pixabay...\`);
        return await downloadVideoFromPixabay(randomQuery, pixabayKeys);
      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Pixabay failed: \${e.message}\`);
      }
    }
  }

  throw new Error(\`[\${ACCOUNT_ID}] All video sources failed. Please check:\\n  1. Add videos to: \${LOCAL_VIDEOS_DIR}\\n  2. Add API keys to: \${PEXELS_KEYS_PATH} or \${PIXABAY_KEYS_PATH}\\n  3. Check your internet connection\`);
}

async function getUploadLog() {
  try {
    const data = await fs.readFile(UPLOAD_LOG_PATH, "utf8");
    return data;
  } catch (error) {
    return "";
  }
}

async function logUpload(filename, caption) {
  const timestamp = new Date().toISOString();
  const logEntry = \`[\${timestamp}] \${filename} | Caption: \${caption}\\n\`;
  await fs.appendFile(UPLOAD_LOG_PATH, logEntry);
  console.log(\`[\${ACCOUNT_ID}] Upload logged\`);
}

async function moveToUploaded(videoPath) {
  try {
    const filename = path.basename(videoPath);
    const destination = path.join(UPLOADED_VIDEOS_DIR, filename);
    await fs.rename(videoPath, destination);
    console.log(\`[\${ACCOUNT_ID}] Moved \${filename} to uploaded folder\`);
  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Failed to move video: \${error.message}\`);
  }
}

async function generateCaption(videoInfo, openRouterKeys, geminiKeys) {
  let caption = "";

  // Add quote if enabled
  if (config.ai_caption?.add_quote) {
    const quote = await getRandomQuote();
    caption = quote + "\\n\\n";
    console.log(\`[\${ACCOUNT_ID}] Added quote: \${quote}\`);
  }

  // Generate AI caption if enabled
  if (config.ai_caption?.enabled) {
    const baseFilename = path.basename(videoInfo.filename, path.extname(videoInfo.filename));
    const videoDescription = baseFilename.replace(/_/g, ' ').replace(/\\d+$/, '').trim();

    console.log(\`[\${ACCOUNT_ID}] Generating AI caption for: \${videoDescription}\`);

    try {
      const prompt = (config.ai_caption?.prompt || "Buat caption untuk video: {VIDEO_DESCRIPTION}")
        .replace('{VIDEO_DESCRIPTION}', videoDescription);

      const result = await generateAiComment({
        caption: videoDescription,
        ctaLink: "",
        prompt: prompt,
        openRouterKeys: openRouterKeys,
        geminiKeys: geminiKeys,
        staticComments: [config.ai_caption?.fallback_caption || "Check this out! 🔥"],
        geminiWorkingIndex: 0,
        accountId: ACCOUNT_ID
      });

      caption += result.comment;
      console.log(\`[\${ACCOUNT_ID}] AI caption via \${result.provider}\${result.model ? \` (\${result.model})\` : ''}\`);

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] AI caption failed: \${error.message}, using fallback\`);
      caption += config.ai_caption?.fallback_caption || "Check this out! 🔥";
    }
  } else {
    if (!caption) {
      caption = config.ai_caption?.fallback_caption || "Check this out! 🔥";
    }
  }

  // Add attribution if from downloaded source
  if (videoInfo.source !== 'local' && videoInfo.attribution) {
    caption += \`\\n\\n📹 Video by \${videoInfo.attribution.photographer}\`;
  }

  console.log(\`[\${ACCOUNT_ID}] Final caption: "\${caption}"\`);
  return caption;
}

async function addMentions(page, settings = {}) {
  const mentions = settings?.mentions || ['pengikut', 'sorotan'];
  const delayBetween = settings?.delay_between_mentions || 1500;
  const delayAfterTab = settings?.delay_after_tab || 1000;

  console.log(\`[\${ACCOUNT_ID}] 👥 Adding \${mentions.length} mentions...\`);

  for (const mention of mentions) {
    try {
      console.log(\`[\${ACCOUNT_ID}] 👥 Typing @\${mention}...\`);

      // Type mention
      await page.keyboard.type(\` @\${mention}\`, { delay: 100 });
      await delay(delayBetween);

      // Press Tab to select from dropdown
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await delay(delayAfterTab);

      console.log(\`[\${ACCOUNT_ID}] ✅ @\${mention} added\`);

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Failed to add @\${mention}: \${error.message}\`);
      // Continue with next mention
    }
  }

  console.log(\`[\${ACCOUNT_ID}] ✅ All mentions processed\`);
  await delay(2000);
}

async function addHastags(page, settings = {}) {
  const hastags = settings?.hastags || ['fbpro', 'fblifestyle'];

  console.log(\`[\${ACCOUNT_ID}] 👥 Adding \${hastags.length} Hastags...\`);

  for (const hastag of hastags) {
    try {
      console.log(\`[\${ACCOUNT_ID}] 👥 Typing @\${hastag}...\`);

      // Type hastag
      await page.keyboard.type(\` #\${hastag}\`, { delay: 100 });
      await page.keyboard.press('Space');

      console.log(\`[\${ACCOUNT_ID}] ✅ #\${hastag} added\`);

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Failed to add @\${hastag}: \${error.message}\`);
      // Continue with next hastag
    }
  }

  console.log(\`[\${ACCOUNT_ID}] ✅ All hastags processed\`);
  await delay(2000);
}

async function uploadReelsVideo(page, video, caption) {
  console.log(\`[\${ACCOUNT_ID}] === Uploading Reels Video ===\`);
  console.log(\`[\${ACCOUNT_ID}] File: \${video.filename}\`);
  console.log(\`[\${ACCOUNT_ID}] Size: \${video.sizeGB}GB\`);
  console.log(\`[\${ACCOUNT_ID}] Source: \${video.source}\`);
  console.log(\`[\${ACCOUNT_ID}] Caption: "\${caption}"\`);

  try {
    console.log(\`[\${ACCOUNT_ID}] [1/6] Navigating to Facebook...\`);
    await page.setViewport({ width: 1280, height: 1024 });

    try {
      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
    } catch (navError) {
      console.log(\`[\${ACCOUNT_ID}] Navigation timeout, but continuing...\`);
    }

    await delay(5000);

    console.log(\`[\${ACCOUNT_ID}] [2/6] Uploading video file...\`);
    const fileInputSelectors = [
      'input[type="file"][accept*="video"]',
      'input[type="file"]'
    ];

    let fileUploaded = false;

    for (const selector of fileInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000, visible: false });
        const fileInput = await page.$(selector);

        if (fileInput) {
          await fileInput.uploadFile(video.path);
          console.log(\`[\${ACCOUNT_ID}] Video file uploaded: \${video.filename}\`);
          fileUploaded = true;

          const videoSizeMB = video.size / 1024 / 1024;
          const afterVideoUpload = config.typing_delays?.after_video_upload || 8000;
          const additionalWait = Math.max(0, videoSizeMB * 100);
          const waitTime = afterVideoUpload + additionalWait;

          console.log(\`[\${ACCOUNT_ID}] Waiting for video to process (\${waitTime}ms)...\`);
          await delay(waitTime);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!fileUploaded) {
      throw new Error("Failed to upload video file");
    }

    console.log(\`[\${ACCOUNT_ID}] [3/6] Adding caption...\`);
    await delay(3000);

    const captionSelectors = [
      'div[contenteditable="true"]',
    ];

    let captionAdded = false;

    for (const selector of captionSelectors) {
      try {
        console.log(\`[\${ACCOUNT_ID}] Waiting for caption input selector: \${selector}\`);
        await page.waitForSelector(selector, { timeout: 15000 });
        const captionInput = await page.$(selector);

        if (captionInput) {
          const isVisible = await captionInput.boundingBox();
          if (isVisible && isVisible.width > 0 && isVisible.height > 0) {
            await captionInput.click();
            await delay(1000);
            await captionInput.focus();

            const typingSpeed = config.typing_delays?.typing_speed || 80;
            await page.keyboard.type(caption, { delay: typingSpeed });
            console.log(\`[\${ACCOUNT_ID}] Caption added successfully\`);
            await addMentions(page);
            console.log(\`[\${ACCOUNT_ID}] Adding mentions\`);
            await addHastags(page);
            console.log(\`[\${ACCOUNT_ID}] Adding Hastags\`);
            const afterCaption = config.typing_delays?.after_caption || 3000;
            await delay(afterCaption);

            captionAdded = true;
            break;
          }
        }
      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Caption input failed: \${e.message}\`);
        continue;
      }
    }

    if (!captionAdded) {
      console.log(\`[\${ACCOUNT_ID}] Warning: Could not add caption, continuing...\`);
    }


    console.log(\`[\${ACCOUNT_ID}] [4/6] Clicking "Berikutnya"...\`);

    const nextButtonSelector = 'div:nth-of-type(4) div.x1l90r2v span > span';
    try {
      await page.waitForSelector(nextButtonSelector, { timeout: 15000 });
      await page.click(nextButtonSelector);
      console.log(\`[\${ACCOUNT_ID}] Clicked "Berikutnya" button\`);
    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] Failed to find "Berikutnya" button: \${error.message}\`);
    }

    const beforePost = config.typing_delays?.before_post || 2000;
    await delay(beforePost);

    console.log(\`[\${ACCOUNT_ID}] [5/6] Clicking "Kirim"...\`);

    const postButtonSelectors = [
      'div:nth-of-type(1) > div > div:nth-of-type(4) div.xod5an3 span > span',
      'div.xod5an3 span > span'
    ];

    let posted = false;

    for (const selector of postButtonSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.evaluate(el => el.textContent);
          const isVisible = await element.boundingBox();

          if (isVisible && text && (text.includes('Kirim') || text.includes('Post') || text.includes('Posting'))) {
            await element.click();
            console.log(\`[\${ACCOUNT_ID}] Post clicked: "\${text}"\`);
            await delay(10000);
            posted = true;
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!posted) {
      const fallbackPosted = await page.evaluate(() => {
        const buttonTexts = ['Kirim', 'Post', 'Posting'];
        const buttons = document.querySelectorAll('div[role="button"], button, span');

        for (const button of buttons) {
          const text = (button.textContent || '').trim();
          const ariaLabel = button.getAttribute('aria-label') || '';

          for (const searchText of buttonTexts) {
            if (text === searchText || text.includes(searchText) || ariaLabel.includes(searchText)) {
              const rect = button.getBoundingClientRect();
              const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';

              if (rect.width > 30 && rect.height > 20 && !isDisabled && button.offsetParent !== null) {
                button.click();
                return { success: true, text: text || ariaLabel };
              }
            }
          }
        }
        return { success: false };
      });

      if (fallbackPosted.success) {
        console.log(\`[\${ACCOUNT_ID}] Post clicked (fallback): "\${fallbackPosted.text}"\`);
        posted = true;
      }
    }

    await delay(10000);

    console.log(\`[\${ACCOUNT_ID}] [6/6] Waiting for DOM content to load...\`);
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] Navigation timeout, checking current state...\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Waiting for upload to complete...\`);
    await delay(15000);

    const currentUrl = page.url();
    console.log(\`[\${ACCOUNT_ID}] Current URL: \${currentUrl}\`);

    if (currentUrl.includes('/reel/') || currentUrl === 'https://www.facebook.com/') {
      console.log(\`[\${ACCOUNT_ID}] UPLOAD SUCCESS!\`);

      await logUpload(video.filename, caption);

      if (config.videoSettings?.moveAfterUpload !== false) {
        await moveToUploaded(video.path);
      }

      return true;
    } else {
      console.log(\`[\${ACCOUNT_ID}] Upload status unclear, assuming success\`);

      await logUpload(video.filename, caption);

      if (config.videoSettings?.moveAfterUpload !== false) {
        await moveToUploaded(video.path);
      }

      return true;
    }

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Upload error: \${error.message}\`);
    throw error;
  }
}

async function main() {
  let browser;

  try {
    console.log(\`\\n[\${ACCOUNT_ID}] ======================================\`);
    console.log(\`[\${ACCOUNT_ID}] FacebookPro Blaster - Auto Upload Reels Bot\`);
    console.log(\`[\${ACCOUNT_ID}] Account: \${ACCOUNT_ID}\`);
    console.log(\`[\${ACCOUNT_ID}] ======================================\\n\`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    await fs.mkdir(LOCAL_VIDEOS_DIR, { recursive: true });
    await fs.mkdir(DOWNLOADED_VIDEOS_DIR, { recursive: true });

    const geminiKeys = await loadGeminiKeys();
    let openRouterKeys = [];

    if (config.ai_caption?.use_openrouter !== false) {
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);
      console.log(\`[\${ACCOUNT_ID}] Loaded \${openRouterKeys.length} OpenRouter key(s)\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Loaded \${geminiKeys.length} Gemini key(s)\`);

    // Load video API keys
    const pexelsKeys = await loadPexelsKeys();
    const pixabayKeys = await loadPixabayKeys();
    console.log(\`[\${ACCOUNT_ID}] Loaded \${pexelsKeys.length} Pexels key(s)\`);
    console.log(\`[\${ACCOUNT_ID}] Loaded \${pixabayKeys.length} Pixabay key(s)\`);

    console.log(\`[\${ACCOUNT_ID}] Launching stealth browser...\`);

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

    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(\`[\${ACCOUNT_ID}] Cookies loaded\`);

    const maxUploads = config.maxUploadsPerRun || 3;
    let uploadedCount = 0;

    for (let i = 0; i < maxUploads; i++) {
      try {
        console.log(\`\\n[\${ACCOUNT_ID}] --- Processing video \${i + 1}/\${maxUploads} ---\`);

        // Select video (local or auto-download)
        const video = await selectVideo(pexelsKeys, pixabayKeys);

        // Generate caption with quote
        const caption = await generateCaption(video, openRouterKeys, geminiKeys);

        await uploadReelsVideo(page, video, caption);

        uploadedCount++;
        console.log(\`[\${ACCOUNT_ID}] Progress: \${uploadedCount}/\${maxUploads} videos uploaded\`);

        if (i < maxUploads - 1) {
          const interval = 1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);
          console.log(\`[\${ACCOUNT_ID}] Waiting \${interval / 1000}s before next upload...\`);
          await delay(interval);
        }

      } catch (error) {
        console.error(\`[\${ACCOUNT_ID}] Failed to process video \${i + 1}: \${error.message}\`);

        // Take error screenshot
        try {
          const screenshotPath = path.join(ARTIFACTS_DIR, \`error_video_\${i + 1}_\${Date.now()}.png\`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${screenshotPath}\`);
        } catch (e) {
          console.log(\`[\${ACCOUNT_ID}] Failed to capture error screenshot\`);
        }

        continue;
      }
    }

    console.log(\`\\n[\${ACCOUNT_ID}] ======================================\`);
    console.log(\`[\${ACCOUNT_ID}] AUTO-UPLOAD COMPLETED\`);
    console.log(\`[\${ACCOUNT_ID}] Uploaded: \${uploadedCount}/\${maxUploads} videos\`);
    console.log(\`[\${ACCOUNT_ID}] ======================================\\n\`);

    await notify.success(ACCOUNT_ID, BOT_NAME, \`Uploaded \${uploadedCount} reels videos\`);

  } catch (error) {
    console.error(\`\\n[\${ACCOUNT_ID}] ERROR: \${error.message}\\n\`);
    console.error(error.stack);

    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    // Take error screenshot
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const page = pages[0];
          const screenshotPath = path.join(ARTIFACTS_DIR, \`error_\${ACCOUNT_ID}_\${Date.now()}.png\`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${screenshotPath}\`);
        }
      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Failed to capture error screenshot\`);
      }
    }

    throw error;

  } finally {
    if (browser) {
      try {
        // CRITICAL: Complete cleanup
        const pages = await browser.pages();
        for (const page of pages) {
          try {
            await page.close();
          } catch (e) {
            // Ignore page close errors
          }
        }

        await delay(2000);

        await browser.close();
        console.log(\`[\${ACCOUNT_ID}] Browser closed\`);

        // CRITICAL: Extra delay between sequential accounts
        await delay(3000);

      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Error during cleanup: \${e.message}\`);
      }
    }
  }
}

process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Bot stopped by user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] Unhandled Rejection:\`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] Uncaught Exception:\`, error);
  process.exit(1);
});

main().catch(error => {
  console.error(\`[\${ACCOUNT_ID}] Fatal error:\`, error);
  process.exit(1);
});
`,
            "updatestatus": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const axios = require("axios");
const { PythonShell } = require('python-shell');

// ========================================
// CONFIGURATION
// ========================================
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  config = require(configPath);
  console.log(\`[\${ACCOUNT_ID}] ⚙️  Config loaded from: \${configPath}\`);
} catch (e) {
  console.log(\`[\${ACCOUNT_ID}] ⚙️  Using default config (file not found)\`);
  config = {
    headless: "new",
    minIntervalSeconds: 300,
    maxIntervalSeconds: 600,
    gemini_prompt: "Tulis status Facebook singkat (2-4 kalimat) dengan gaya bahasa santai dan personal seolah ditulis oleh seorang gadis muda berusia 20-an.",
    ai_settings: {
      use_openrouter: true,
      typing_delay_after_click: 2000
    },
    typing_delays: {
      after_click: 2000,
      after_clear: 800,
      typing_speed: 100,
      after_typing: 6000,
      long_text_extra: 3000,
      final_verification: 2000,
      after_photo_upload: 5000,
      before_caption: 3000
    },
    photo_settings: {
      enabled: true,
      use_pollinations: true,
      use_local_faceswap: true, // Dinonaktifkan sementara oleh user, sekarang aktif kembali
      use_local_photos: true,
      orientation: "portrait",
      per_page: 10,
      content_filter: "high"
    },
    pollinations_settings: {
      model: "flux-pro",
      width: 1024,
      height: 1280,
      nologo: true,
      enhance: true,
      private: false
    },
    nanobanana_settings: {
      face_reference: "face_reference.jpg",
      model: "imagen-3.0-generate-001",
      negative_prompt: "deformed, blurry, bad anatomy, bad face, text, watermark",
      aspect_ratio: "1:1"
    },
    memory_settings: {
      max_history: 50,
      min_similarity_threshold: 0.7,
      topics_to_track: true
    }
  };
}

// Override headless mode if FORCE_HEADLESS is set (from --headless flag)
if (process.env.FORCE_HEADLESS === 'false') {
  config.headless = false;
  console.log(\`[\${ACCOUNT_ID}] 🔍 Headless mode OVERRIDDEN: Browser will be visible (--headless flag)\`);
}

console.log(\`[\${ACCOUNT_ID}] ⚙️  Photo settings:\`, JSON.stringify(config.photo_settings, null, 2));

// Paths
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const UNSPLASH_KEY_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "unsplash_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const PHOTOS_DIR = path.join(ARTIFACTS_DIR, "downloaded_photos");
const LOCAL_PHOTOS_DIR = path.join(__dirname, "../photos");
const TEMP_PHOTOS_DIR = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "photos"); // Folder temp untuk foto
const LOG_STATUS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "log_status.txt");
const LOG_PHOTOS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "log_photos.txt"); // Log foto yang sudah digunakan
const MEMORY_DB_PATH = path.join(__dirname, "../accounts", ACCOUNT_ID, "memory.json");

// Telegram logger
let notify;
try {
  notify = require('./notify');
} catch (e) {
  console.error(\`[\${ACCOUNT_ID}] Failed to load telegram logger:\`, e.message);
  notify = {
    success: async () => { },
    error: async () => { },
    warning: async () => { },
    systemAlert: async () => { }
  };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ========================================
// PHOTO LOGGING SYSTEM
// ========================================
class PhotoLogger {
  constructor() {
    this.usedPhotos = new Set();
  }

  async load() {
    try {
      const data = await fs.readFile(LOG_PHOTOS_PATH, 'utf8');
      const lines = data.split('\\n').filter(line => line.trim());
      lines.forEach(line => {
        // Format: [timestamp] filename
        const match = line.match(/\\] (.+)$/);
        if (match) {
          this.usedPhotos.add(match[1]);
        }
      });
      console.log(\`[\${ACCOUNT_ID}] 📸 Loaded \${this.usedPhotos.size} used photos from log\`);
    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] 📸 Creating new photo log\`);
      this.usedPhotos = new Set();
    }
  }

  async logPhoto(filename) {
    this.usedPhotos.add(filename);
    const timestamp = new Date().toISOString();
    const logEntry = \`[\${timestamp}] \${filename}\\n\`;
    await fs.appendFile(LOG_PHOTOS_PATH, logEntry);
  }

  isPhotoUsed(filename) {
    return this.usedPhotos.has(filename);
  }

  getUsedPhotosCount() {
    return this.usedPhotos.size;
  }
}

// ========================================
// MEMORY MANAGEMENT
// ========================================
class StatusMemory {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.history = [];
    this.topics = new Map();
  }

  async load() {
    try {
      const data = await fs.readFile(MEMORY_DB_PATH, 'utf8');
      const parsed = JSON.parse(data);
      this.history = parsed.history || [];
      this.topics = new Map(Object.entries(parsed.topics || {}));
      console.log(\`[\${ACCOUNT_ID}] 💾 Loaded \${this.history.length} status from memory\`);
    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] 💾 Creating new memory database\`);
      this.history = [];
      this.topics = new Map();
    }
  }

  async save() {
    const data = {
      history: this.history,
      topics: Object.fromEntries(this.topics),
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(MEMORY_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(\`[\${ACCOUNT_ID}] 💾 Saved \${this.history.length} status to memory\`);
  }

  addStatus(status, metadata = {}) {
    const entry = {
      status: status,
      timestamp: new Date().toISOString(),
      timeOfDay: metadata.timeOfDay || 'Unknown',
      provider: metadata.provider || 'unknown',
      topics: this.extractTopics(status)
    };

    this.history.unshift(entry);

    // Keep only last N entries
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }

    // Update topic frequency
    entry.topics.forEach(topic => {
      this.topics.set(topic, (this.topics.get(topic) || 0) + 1);
    });

    console.log(\`[\${ACCOUNT_ID}] 📝 Added to memory. Total: \${this.history.length}\`);
  }

  extractTopics(text) {
    const topics = [];
    const lower = text.toLowerCase();

    // Common topics
    const topicKeywords = {
      'makanan': ['makan', 'lapar', 'masak', 'sarapan', 'makan siang', 'makan malam', 'kopi', 'nasi', 'ayam'],
      'cuaca': ['panas', 'hujan', 'dingin', 'cerah', 'mendung', 'gerimis'],
      'aktivitas': ['kerja', 'kuliah', 'belajar', 'meeting', 'tugas', 'deadline'],
      'hiburan': ['nonton', 'film', 'drama', 'musik', 'game', 'scrolling'],
      'perasaan': ['senang', 'sedih', 'lelah', 'capek', 'happy', 'bosan', 'semangat'],
      'weekend': ['weekend', 'sabtu', 'minggu', 'libur', 'santai'],
      'tidur': ['tidur', 'ngantuk', 'begadang', 'insomnia', 'mimpi'],
      'teman': ['teman', 'sahabat', 'bestie', 'ngobrol', 'hangout']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  getRecentStatuses(count = 10) {
    return this.history.slice(0, count);
  }

  getOverusedTopics(threshold = 3) {
    const recent = this.history.slice(0, 10);
    const recentTopics = new Map();

    recent.forEach(entry => {
      entry.topics.forEach(topic => {
        recentTopics.set(topic, (recentTopics.get(topic) || 0) + 1);
      });
    });

    return Array.from(recentTopics.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([topic, _]) => topic);
  }

  calculateSimilarity(str1, str2) {
    const words1 = str1.toLowerCase().split(/\\s+/);
    const words2 = str2.toLowerCase().split(/\\s+/);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  isTooSimilar(newStatus, threshold = 0.7) {
    const recent = this.history.slice(0, 5);

    for (const entry of recent) {
      const similarity = this.calculateSimilarity(newStatus, entry.status);
      if (similarity >= threshold) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Too similar (\${(similarity * 100).toFixed(0)}%): "\${entry.status}"\`);
        return true;
      }
    }

    return false;
  }

  getMemoryPrompt() {
    const recent = this.getRecentStatuses(10);
    const overusedTopics = this.getOverusedTopics(3);

    if (recent.length === 0) {
      return "\\n🆕 Ini status pertama, bebas pilih topik!\\n";
    }

    let prompt = "\\n📚 MEMORY - STATUS YANG SUDAH PERNAH DIPOSTING:\\n";
    prompt += "=".repeat(50) + "\\n";

    recent.forEach((entry, idx) => {
      const time = new Date(entry.timestamp).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit'
      });
      prompt += \`\${idx + 1}. [\${entry.timeOfDay} - \${time}] "\${entry.status}"\\n\`;
    });

    prompt += "=".repeat(50) + "\\n";

    if (overusedTopics.length > 0) {
      prompt += \`\\n🚫 TOPIK YANG TERLALU SERING (HINDARI!):\\n\`;
      prompt += overusedTopics.map(t => \`- \${t.toUpperCase()}\`).join('\\n');
      prompt += "\\n";
    }

    prompt += \`\\n✅ ATURAN PENTING:\\n\`;
    prompt += \`1. JANGAN tulis status yang mirip dengan 10 status di atas!\\n\`;
    prompt += \`2. HINDARI topik yang sudah terlalu sering\\n\`;
    prompt += \`3. Buat sesuatu yang BARU dan FRESH\\n\`;
    prompt += \`4. Gunakan perspektif atau sudut pandang yang berbeda\\n\`;
    prompt += \`5. Ekspresikan emosi atau pengalaman dengan cara unik\\n\\n\`;

    return prompt;
  }

  getStats() {
    const topTopics = Array.from(this.topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalStatuses: this.history.length,
      topTopics
    };
  }
}

// ========================================
// API KEY LOADERS
// ========================================
async function loadKeys(filePath, validator = k => k.length > 10) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return data.split("\\n")
      .map(k => k.trim())
      .filter(k => !k.startsWith('#') && validator(k));
  } catch (error) {
    return [];
  }
}

async function loadGeminiKeys() {
  const keys = await loadKeys(GEMINI_KEYS_PATH, k => k.startsWith("AIzaSy"));
  if (keys.length === 0) {
    await fs.writeFile(GEMINI_KEYS_PATH, "# Add Gemini API keys (one per line)\\n# AIzaSy...");
  }
  return keys;
}

async function loadOpenRouterKeys() {
  return loadKeys(OPENROUTER_KEYS_PATH, k => k.startsWith("sk-or-"));
}

async function loadUnsplashKeys() {
  return loadKeys(UNSPLASH_KEY_PATH);
}


function getTimeContext() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const day = now.getDay();

  let timeOfDay;
  let timeDescription;

  if (hours >= 5 && hours < 10) {
    timeOfDay = 'Pagi';
    timeDescription = 'pagi hari (05:00-10:00)';
  } else if (hours >= 10 && hours < 15) {
    timeOfDay = 'Siang';
    timeDescription = 'siang hari (10:00-15:00)';
  } else if (hours >= 15 && hours < 18) {
    timeOfDay = 'Sore';
    timeDescription = 'sore hari (15:00-18:00)';
  } else if (hours >= 18 && hours < 22) {
    timeOfDay = 'Malam';
    timeDescription = 'malam hari (18:00-22:00)';
  } else {
    timeOfDay = 'Larut Malam';
    timeDescription = 'larut malam (22:00-05:00)';
  }

  const isWeekend = day === 0 || day === 6;
  const dayType = isWeekend ? 'akhir pekan' : 'hari kerja';

  return {
    hours,
    minutes,
    timeOfDay,
    timeDescription,
    isWeekend,
    dayType,
    fullTime: \`\${hours.toString().padStart(2, '0')}:\${minutes.toString().padStart(2, '0')}\`
  };
}

async function generateWithPollinationsText(basePrompt, memory) {
  try {
    const memoryPrompt = memory.getMemoryPrompt();
    const fullPrompt = basePrompt + memoryPrompt;

    console.log(\`[\${ACCOUNT_ID}] 🤖 Trying Pollinations.ai (openai)...\`);
    const encodedPrompt = encodeURIComponent(fullPrompt);
    const url = \`https://text.pollinations.ai/\${encodedPrompt}?model=openai\`;

    const headers = {};
    if (config.pollinations_settings?.api_key) {
      headers['Authorization'] = \`Bearer \${config.pollinations_settings.api_key}\`;
    }

    const response = await axios.get(url, {
      headers,
      timeout: 30000,
      responseType: 'text' // Force text response to avoid auto JSON parsing if unwanted
    });

    let text = response.data;
    if (typeof text !== 'string') {
      text = String(text);
    }
    text = text?.trim();

    if (!text) {
      throw new Error('Empty response from Pollinations');
    }

    console.log(\`[\${ACCOUNT_ID}] ✅ Pollinations.ai success\`);
    return { status: text, provider: 'Pollinations.ai (openai)' };
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Pollinations.ai failed: \${error.message}\`);
    throw error;
  }
}

async function generateWithGemini(basePrompt, memory) {
  const keys = await loadGeminiKeys();

  if (keys.length === 0) {
    throw new Error('No Gemini keys found');
  }

  const memoryPrompt = memory.getMemoryPrompt();
  const fullPrompt = basePrompt + memoryPrompt;

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      console.log(\`[\${ACCOUNT_ID}] 🤖 Trying Gemini (key \${i + 1}/\${keys.length})...\`);

      const response = await axios.post(
        \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=\${apiKey}\`,
        {
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            temperature: 0.9,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 200
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        },
        { timeout: 30000 }
      );

      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Gemini returned empty response\`);
        continue;
      }

      console.log(\`[\${ACCOUNT_ID}] ✅ Gemini success\`);
      return { status: text, provider: 'Gemini' };

    } catch (error) {
      if (error.response?.status === 429) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Gemini key \${i + 1} rate limited (429). Waiting 5s...\`);
        await delay(5000);
        // Retry once for this key
        try {
          const retryResponse = await axios.post(
            \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=\${apiKey}\`,
            {
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: { temperature: 0.9, maxOutputTokens: 200 }
            },
            { timeout: 30000 }
          );
          const text = retryResponse.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            console.log(\`[\${ACCOUNT_ID}] ✅ Gemini success on retry\`);
            return { status: text, provider: 'Gemini' };
          }
        } catch (e) { }
      }
      const errMsg = error.response?.data?.error?.message || error.message;
      const errCode = error.response?.status;
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Gemini key \${i + 1} failed (\${errCode}): \${errMsg}\`);
      continue;
    }
  }

  throw new Error('All Gemini keys failed');
}

async function generateWithOpenRouter(basePrompt, memory) {
  const keys = await loadOpenRouterKeys();

  if (keys.length === 0) {
    throw new Error('No OpenRouter keys found');
  }

  const memoryPrompt = memory.getMemoryPrompt();
  const fullPrompt = basePrompt + memoryPrompt;

  const models = [
    'qwen/qwen-2.5-72b-instruct',  // Most stable, no :free suffix
    'meta-llama/llama-3.2-3b-instruct:free',
    'x-ai/grok-2-vision-1212:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free'
  ];

  for (const apiKey of keys) {
    for (const model of models) {
      try {
        console.log(\`[\${ACCOUNT_ID}] 🤖 Trying OpenRouter (\${model})...\`);

        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model,
            messages: [
              {
                role: 'user',
                content: fullPrompt
              }
            ]
          },
          {
            headers: {
              'Authorization': \`Bearer \${apiKey}\`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        const text = response.data.choices?.[0]?.message?.content?.trim();
        if (!text) {
          console.log(\`[\${ACCOUNT_ID}] ⚠️ \${model} returned empty response\`);
          continue;
        }

        console.log(\`[\${ACCOUNT_ID}] ✅ OpenRouter success with \${model}\`);
        return { status: text, provider: \`OpenRouter (\${model})\` };

      } catch (error) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ \${model} failed: \${error.message}\`);
        continue;
      }
    }
  }

  throw new Error('All OpenRouter models failed');
}

async function generateTimeAwareStatus(context, memory) {
  const basePrompt = \`\${config.gemini_prompt}

⏰ KONTEKS WAKTU SAAT INI:
- Waktu: \${context.timeOfDay} (\${context.fullTime} WIB)
- Detail: \${context.timeDescription}
- Tipe hari: \${context.dayType}

🎯 INSTRUKSI:
- Buat status yang SANGAT RELEVAN dengan suasana \${context.timeOfDay}
- Status harus natural, santai (relaxed), dan variatif.
- JANGAN menyebutkan jam secara spesifik (seperti "jam \${context.fullTime}"), gunakan penyebutan waktu umum saja.
- Gunakan konteks \${context.dayType} dalam status dengan gaya bercerita yang ringan.
- Langsung tulis statusnya saja!

CONTOH STYLE (jangan copy, buat yang baru!):
- Pagi: "Bangun pagi enak bgt dengerin burung berkicau 🌤️"
- Siang: "Panasss bgt ga sanggup keluar rumah 😫"
- Sore: "Sore2 gini enaknya ngeteh sambil liat sunset ☕"
- Malam: "Nyantai dulu ah abis seharian cape 😌"

✏️ Tulis status yang benar-benar beda dari sebelumnya:\`;

  const maxAttempts = 5;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      let result;

      // Priority: Pollinations (OpenAI) -> OpenRouter -> Gemini
      try {
        console.log(\`[\${ACCOUNT_ID}] 🔄 Attempt \${attempts}/\${maxAttempts}: Trying Pollinations.ai...\`);
        result = await generateWithPollinationsText(basePrompt, memory);
      } catch (pollError) {
        try {
          console.log(\`[\${ACCOUNT_ID}] 🤖 Pollinations failed, trying OpenRouter...\`);
          result = await generateWithOpenRouter(basePrompt, memory);
        } catch (orError) {
          console.log(\`[\${ACCOUNT_ID}] 🤖 OpenRouter failed, falling back to Gemini...\`);
          try {
            result = await generateWithGemini(basePrompt, memory);
          } catch (geminiError) {
            throw new Error('All text generation providers failed');
          }
        }
      }

      // Clean up the status
      let cleanStatus = result.status
        .replace(/^(Status:|Caption:|Post:|Here is|Here's|Sure|Tentu|Berikut|Ini adalah)\\s*.*?:/gmi, '')
        .replace(/^(Status:|Caption:|Post:)\\s*/gi, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      // Aggressive cleanup for "Status: ..." pattern if it survived
      if (cleanStatus.toLowerCase().startsWith("status: \\"")) {
        cleanStatus = cleanStatus.substring(9).replace(/"$/, '');
      }

      // Check similarity
      if (memory.isTooSimilar(cleanStatus)) {
        console.log(\`[\${ACCOUNT_ID}] 🔄 Attempt \${attempts}/\${maxAttempts}: Too similar, regenerating...\`);
        await delay(2000);
        continue;
      }

      return { status: cleanStatus, provider: result.provider };

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ❌ Attempt \${attempts}/\${maxAttempts} failed: \${error.message}\`);

      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique status after maximum attempts');
      }

      await delay(3000);
    }
  }

  throw new Error('Failed to generate status');
}

// ========================================
// PHOTO MANAGEMENT WITH LOGGING
// ========================================
async function getLocalPhotos() {
  try {
    console.log(\`[\${ACCOUNT_ID}] 📷 Checking local photos directory\`);

    await fs.mkdir(LOCAL_PHOTOS_DIR, { recursive: true });
    const files = await fs.readdir(LOCAL_PHOTOS_DIR);

    const photoExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

    const photoFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      const isPhoto = photoExts.includes(ext);
      return isPhoto;
    });

    console.log(\`[\${ACCOUNT_ID}] 📷 Valid photo files: \${photoFiles.length}\`);

    return photoFiles.map(f => path.join(LOCAL_PHOTOS_DIR, f));
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Error reading local photos: \${error.message}\`);
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Error stack: \${error.stack}\`);
    return [];
  }
}

async function selectLocalPhoto(photoLogger) {
  const photos = await getLocalPhotos();

  if (photos.length === 0) {
    console.log(\`[\${ACCOUNT_ID}] 📷 No local photos found\`);
    return null;
  }

  console.log(\`[\${ACCOUNT_ID}] 📷 Found \${photos.length} local photos\`);

  // Filter out already used photos
  const unusedPhotos = photos.filter(photoPath => {
    const filename = path.basename(photoPath);
    return !photoLogger.isPhotoUsed(filename);
  });

  if (unusedPhotos.length === 0) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ All local photos have been used\`);
    return null;
  }

  console.log(\`[\${ACCOUNT_ID}] 📷 \${unusedPhotos.length} unused photos available\`);

  // Select random unused photo
  const selected = unusedPhotos[Math.floor(Math.random() * unusedPhotos.length)];
  const filename = path.basename(selected);

  // Copy to temp folder
  await fs.mkdir(TEMP_PHOTOS_DIR, { recursive: true });
  const tempPath = path.join(TEMP_PHOTOS_DIR, filename);
  await fs.copyFile(selected, tempPath);

  // Log the photo
  await photoLogger.logPhoto(filename);

  return {
    filePath: tempPath,
    attribution: { photographer: 'Local Upload', source: 'local' }
  };
}

async function downloadFromUnsplash(keywords, unsplashKeys) {
  await fs.mkdir(PHOTOS_DIR, { recursive: true });

  for (const key of unsplashKeys) {
    try {
      const { data } = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query: keywords,
          orientation: config.photo_settings?.orientation || 'landscape',
          per_page: config.photo_settings?.per_page || 10
        },
        headers: { 'Authorization': \`Client-ID \${key}\` },
        timeout: 15000
      });

      if (data.results.length === 0) continue;

      const photo = data.results[Math.floor(Math.random() * data.results.length)];
      const photoData = await axios.get(photo.urls.regular, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const fileName = \`unsplash_\${Date.now()}.jpg\`;
      const filePath = path.join(PHOTOS_DIR, fileName);
      await fs.writeFile(filePath, photoData.data);

      console.log(\`[\${ACCOUNT_ID}] 📷 Unsplash: \${photo.user.name}\`);

      return {
        filePath,
        attribution: {
          photographer: photo.user.name,
          source: 'unsplash'
        }
      };
    } catch (error) {
      continue;
    }
  }

  throw new Error('All Unsplash keys failed');
}

async function translateStatusToImagePrompt(statusText) {
  const prompt = \`Ubah status Facebook ini menjadi prompt gambar yang sangat detail dalam Bahasa Indonesia untuk hasil foto DSLR yang realistis.
  Gambarkan adegan spesifik dengan seorang wanita muda muslim Indonesia berusia 20-an yang mengenakan hijab modis/syari, tekstur kulit nyata, pencahayaan alami, dan fokus tajam.
  Hasil harus bergaya foto mentah (raw photo), 8k UHD, sangat detail, tanpa filter artistik, dan tidak terlihat dreamy atau lembut (soft).
  Status: "\${statusText}"
  Format hasil langsung berupa satu paragraf prompt deskriptif saja. Tanpa teks tambahan.\`;

  try {
    const result = await generateWithPollinationsText(prompt, { getMemoryPrompt: () => "" });
    return result.status;
  } catch (e) {
    try {
      const result = await generateWithOpenRouter(prompt, { getMemoryPrompt: () => "" });
      return result.status;
    } catch (e2) {
      try {
        const result = await generateWithGemini(prompt, { getMemoryPrompt: () => "" });
        return result.status;
      } catch (e3) {
        return \`A young woman in her 20s, natural lifestyle setting, high quality, no face visible, consistent with status: \${statusText}\`;
      }
    }
  }
}

async function generateImagePollinations(imagePrompt) {
  try {
    const model = config.pollinations_settings?.model || 'flux';
    const width = config.pollinations_settings?.width || 1024;
    const height = config.pollinations_settings?.height || 1280;
    const seed = Math.floor(Math.random() * 1000000);

    // Construct Pollinations URL
    // Safe prompt encoding
    const safePrompt = encodeURIComponent(imagePrompt.substring(0, 1500));
    const url = \`https://image.pollinations.ai/prompt/\${safePrompt}?model=\${model}&width=\${width}&height=\${height}&seed=\${seed}&nologo=true&enhance=true\`;

    console.log(\`[\${ACCOUNT_ID}] 🐝 Generating image with Pollinations.ai (\${model})...\`);

    const headers = { 'User-Agent': 'FBProBlaster/1.0' };
    if (config.pollinations_settings?.api_key) {
      headers['Authorization'] = \`Bearer \${config.pollinations_settings.api_key}\`;
    }

    // Download directly
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: headers,
      timeout: 60000
    });

    const fileName = \`pollinations_\${Date.now()}.jpg\`;
    const filePath = path.join(TEMP_PHOTOS_DIR, fileName);
    await fs.writeFile(filePath, response.data);

    console.log(\`[\${ACCOUNT_ID}] 🐝 Image generated successfully!\`);
    return filePath;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ❌ Pollinations Generation failed: \${error.message}\`);
    return null;
  }
}

// generateImageHuggingFace removed to use Pollinations exclusively

const { spawn } = require('child_process');

async function applyLocalFaceSwap(targetImagePath) {
  const scriptPath = path.join(__dirname, 'faceswap.py');
  const faceRefName = config.nanobanana_settings?.face_reference || "face_reference.jpg";
  const faceRefPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, faceRefName);

  if (!fsSync.existsSync(faceRefPath)) {
    console.log(\`[\${ACCOUNT_ID}] 🐍 ❌ Face reference not found: \${faceRefPath}\`);
    return targetImagePath;
  }

  const outputPath = path.join(TEMP_PHOTOS_DIR, \`swapped_local_\${Date.now()}.jpg\`);

  console.log(\`[\${ACCOUNT_ID}] 🐍 Running Local Face Swap (InsightFace) via spawn...\`);

  return new Promise((resolve) => {
    // Try to find Python 3.12 executable
    const os = require('os');
    const possiblePythonPaths = [
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'), // User install
      'C:\\\\Python312\\\\python.exe', // System install
      'python3.12', // PATH
      'python3', // PATH
      'python' // Fallback
    ];

    let pythonCmd = 'py';
    let pythonArgs = ['-3.12', '-u', scriptPath, faceRefPath, targetImagePath, outputPath];

    // Check if any full path exists
    for (const pyPath of possiblePythonPaths) {
      if (pyPath.includes('\\\\') && fsSync.existsSync(pyPath)) {
        pythonCmd = pyPath;
        pythonArgs = ['-u', scriptPath, faceRefPath, targetImagePath, outputPath]; // Remove -3.12 flag
        console.log(\`[\${ACCOUNT_ID}] 🐍 Using Python at: \${pyPath}\`);
        break;
      }
    }

    const pythonProcess = spawn(pythonCmd, pythonArgs);

    pythonProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(\`[\${ACCOUNT_ID}] 🐍 Python STDOUT: \${msg}\`);
    });

    pythonProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(\`[\${ACCOUNT_ID}] 🐍 Python STDERR: \${msg}\`);
    });

    pythonProcess.on('error', (err) => {
      console.log(\`[\${ACCOUNT_ID}] 🐍 ❌ Spawn Error: \${err.message}\`);
      resolve(targetImagePath);
    });

    pythonProcess.on('close', (code) => {
      console.log(\`[\${ACCOUNT_ID}] 🐍 Python process closed with code \${code}\`);
      if (code === 0 && fsSync.existsSync(outputPath)) {
        console.log(\`[\${ACCOUNT_ID}] 🐍 ✅ Local Face Swap Successful!\`);
        resolve(outputPath);
      } else {
        console.log(\`[\${ACCOUNT_ID}] 🐍 ⚠️ Face Swap Failed (Code: \${code})\`);
        resolve(targetImagePath);
      }
    });
  });
}

// Replaces applyFaceSwap with local version logic where needed
async function applyFaceSwap(targetImagePath) {
  if (config.photo_settings?.use_local_faceswap) {
    return await applyLocalFaceSwap(targetImagePath);
  }
  // Fallback to HF if local disabled (legacy code logic kept optional)
  return targetImagePath;
}

async function selectPhoto(photoLogger, statusText = '') {
  if (config.photo_settings?.enabled === false) {
    console.log(\`[\${ACCOUNT_ID}] 📷 Photos disabled in config\`);
    return { filePath: null, attribution: { photographer: 'Text Only', source: 'none' } };
  }

  // Priority 1: Pollinations AI + Face Swap
  if (config.photo_settings?.use_pollinations !== false) {
    console.log(\`[\${ACCOUNT_ID}] 🚀 Starting Pollinations.ai image workflow...\`);
    const imagePrompt = await translateStatusToImagePrompt(statusText);
    console.log(\`[\${ACCOUNT_ID}] ✍️  Image Prompt: "\${imagePrompt}"\`);

    let imagePath = await generateImagePollinations(imagePrompt);
    if (imagePath) {
      console.log(\`[\${ACCOUNT_ID}] 🚀 Image generated, applying face swap...\`);
      // Apply Face Swap (using local script)
      imagePath = await applyFaceSwap(imagePath);
      console.log(\`[\${ACCOUNT_ID}] 🚀 Face swap step finished, returning image.\`);
      return {
        filePath: imagePath,
        attribution: { photographer: 'Pollinations.ai + Local FaceSwap', source: 'pollinations' }
      };
    }
    console.log(\`[\${ACCOUNT_ID}] ⚠️  Pollinations Workflow failed, trying fallback...\`);
  }

  // Priority 2: Hugging Face (FLUX + Face Swap) - Backup
  if (config.photo_settings?.use_huggingface === true) {
    // ... logic for HF generation if explicitly enabled as backup
  }

  // Priority 2: NanoBanana AI Generation (Redirected to Pollinations)
  // Legacy generateImageWithNanoBanana call removed as it's now integrated in Pollinations flow above
  if (config.photo_settings?.use_nanobanana === true && config.photo_settings?.use_pollinations === false) {
    // If someone explicitly wants nanobanana but Pollinations is off, we could implement it here
    // but the user wants both together.
  }

  // Default to true if undefined (try local photos by default)
  const useLocalPhotos = config.photo_settings?.use_local_photos !== false;
  console.log(\`[\${ACCOUNT_ID}] 📷 Will use local photos: \${useLocalPhotos}\`);

  // Try local photos first if enabled (default behavior)
  if (useLocalPhotos) {
    console.log(\`[\${ACCOUNT_ID}] 📷 Trying local photos...\`);
    const local = await selectLocalPhoto(photoLogger);
    if (local) {
      console.log(\`[\${ACCOUNT_ID}] 📷 ✅ Local photo selected: \${path.basename(local.filePath)}\`);
      return local;
    }

    console.log(\`[\${ACCOUNT_ID}] 📷 No local photos available, trying Unsplash...\`);
  } else {
    console.log(\`[\${ACCOUNT_ID}] 📷 Local photos explicitly disabled in config, trying Unsplash...\`);
  }

  // Try Unsplash as fallback
  const unsplashKeys = await loadUnsplashKeys();
  console.log(\`[\${ACCOUNT_ID}] 📷 Unsplash keys found: \${unsplashKeys.length}\`);

  if (unsplashKeys.length > 0) {
    try {
      const unsplash = await downloadFromUnsplash('lifestyle positive', unsplashKeys);
      console.log(\`[\${ACCOUNT_ID}] 📷 ✅ Unsplash photo downloaded\`);
      return unsplash;
    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ❌ Unsplash failed: \${error.message}\`);
    }
  }

  // PENTING: Selalu return object, jangan return null!
  console.log(\`[\${ACCOUNT_ID}] 📝 No photos available, will post text-only\`);
  return { filePath: null, attribution: { photographer: 'Text Only', source: 'none' } };
}

// ========================================
// FACEBOOK AUTOMATION
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

async function clickTextArea(page) {
  console.log(\`[\${ACCOUNT_ID}] 🖱️  Clicking text area...\`);

  const selectors = [
    'div[role="button"][aria-label*="Apa yang Anda pikirkan"]',
    'div[aria-label*="Buat postingan"]',
    'div[role="button"][aria-label*="create"]',
    'div[role="button"][aria-label*="post"]',
    'div[aria-label*="Create"]'
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        console.log(\`[\${ACCOUNT_ID}] ✅ Text area clicked\`);
        await delay(3000); // Wait for dialog to fully open
        return true;
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error('Could not find text area to click');
}

async function uploadPhoto(page, imagePath) {
  console.log(\`[\${ACCOUNT_ID}] 📤 Uploading photo...\`);

  try {
    // Wait for file input to exist
    const fileInputSelector = 'input[type="file"]';
    await page.waitForSelector(fileInputSelector, { timeout: 15000 });

    const fileInput = await page.$(fileInputSelector);
    if (!fileInput) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ File input not found\`);
      return false;
    }

    await fileInput.uploadFile(imagePath);
    console.log(\`[\${ACCOUNT_ID}] ✅ Photo uploaded\`);

    await delay(config.typing_delays?.after_photo_upload || 5000);
    return true;
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ❌ Photo upload failed: \${error.message}\`);
    return false;
  }
}

async function addMentions(page, settings = {}) {
  const mentions = settings?.mentions || ['pengikut', 'sorotan'];
  const delayBetween = settings?.delay_between_mentions || 1500;
  const delayAfterTab = settings?.delay_after_tab || 1000;

  console.log(\`[\${ACCOUNT_ID}] 👥 Adding \${mentions.length} mentions...\`);

  for (const mention of mentions) {
    try {
      console.log(\`[\${ACCOUNT_ID}] 👥 Typing @\${mention}...\`);

      // Type mention
      await page.keyboard.type(\` @\${mention}\`, { delay: 100 });
      await delay(delayBetween);

      // Press Tab to select from dropdown
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await delay(delayAfterTab);

      console.log(\`[\${ACCOUNT_ID}] ✅ @\${mention} added\`);

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Failed to add @\${mention}: \${error.message}\`);
      // Continue with next mention
    }
  }

  console.log(\`[\${ACCOUNT_ID}] ✅ All mentions processed\`);
  await delay(2000);
}

async function addHastags(page, settings = {}) {
  const hastags = settings?.hastags || ['fbpro', 'fblifestyle'];

  console.log(\`[\${ACCOUNT_ID}] 👥 Adding \${hastags.length} Hastags...\`);

  for (const hastag of hastags) {
    try {
      console.log(\`[\${ACCOUNT_ID}] 👥 Typing @\${hastag}...\`);

      // Type hastag
      await page.keyboard.type(\` #\${hastag}\`, { delay: 100 });
      await page.keyboard.press('Space');

      console.log(\`[\${ACCOUNT_ID}] ✅ #\${hastag} added\`);

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Failed to add @\${hastag}: \${error.message}\`);
      // Continue with next hastag
    }
  }

  console.log(\`[\${ACCOUNT_ID}] ✅ All hastags processed\`);
  await delay(2000);
}

async function typeCaption(page, caption) {

  await delay(config.typing_delays?.before_caption || 3000);
  await page.keyboard.type(caption, {
    delay: config.typing_delays?.typing_speed || 100
  });

  console.log(\`[\${ACCOUNT_ID}] ✅ Caption typed\`);
  await delay(config.typing_delays?.after_typing || 6000);
  await addMentions(page);
  await addHastags(page);
}

async function clickNextButton(page) {
  console.log(\`[\${ACCOUNT_ID}] Finding Next button...\`);

  await delay(5000);

  const nextButtonSelectors = [
    'div:nth-of-type(4) div.x1l90r2v span > span',
    'div.x1l90r2v span > span'
  ];

  for (const selector of nextButtonSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const text = await element.evaluate(el => el.textContent);
        const isVisible = await element.boundingBox();

        if (isVisible && text && (text.includes('Berikutnya') || text.includes('Next'))) {
          await element.click();
          console.log(\`[\${ACCOUNT_ID}] Next clicked: \${text}\`);
          await delay(3000);
          return true;
        }
      }
    } catch (e) {
      continue;
    }
  }

  const fallbackNext = await page.evaluate(() => {
    const buttons = document.querySelectorAll('div[role="button"], button, span');
    for (const button of buttons) {
      const text = button.textContent || '';
      if (text.includes('Berikutnya') || text.includes('Next')) {
        const rect = button.getBoundingClientRect();
        if (rect.width > 30 && rect.height > 15 && button.offsetParent !== null) {
          button.click();
          return true;
        }
      }
    }
    return false;
  });

  if (fallbackNext) {
    console.log(\`[\${ACCOUNT_ID}] Next clicked (fallback)\`);
    await delay(3000);
    return true;
  }

  console.log(\`[\${ACCOUNT_ID}] Next button not found, continuing...\`);
  return false;
}

async function clickPostButton(page) {
  console.log(\`[\${ACCOUNT_ID}] Finding Post button...\`);

  await delay(5000);

  const postButtonSelectors = [
    'div[aria-label="Posting"]',
    'div[aria-label="Kirim"]',
    'div[role="button"]:has-text("Bagikan")',
    'div.xod5an3 span > span'
  ];

  for (const selector of postButtonSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const text = await element.evaluate(el => el.textContent);
        const isVisible = await element.boundingBox();
        const isDisabled = await element.evaluate(el => {
          return el.disabled ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.classList.contains('disabled');
        });

        if (isVisible && !isDisabled && text &&
          (text.includes('Kirim') || text.includes('Post') ||
            text.includes('Posting') || text.includes('Bagikan'))) {

          console.log(\`[\${ACCOUNT_ID}] Found button: "\${text}"\`);

          for (let attempt = 1; attempt <= 3; attempt++) {
            await element.click();
            console.log(\`[\${ACCOUNT_ID}] Click attempt \${attempt}/3\`);
            await delay(2000);

            const dialogGone = await page.evaluate(() => {
              return !document.querySelector('div[role="dialog"]');
            });

            if (dialogGone) {
              console.log(\`[\${ACCOUNT_ID}] Dialog closed after click \${attempt}\`);
              await delay(8000);
              return true;
            }
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  const fallbackPosted = await page.evaluate(() => {
    const buttonTexts = ['Kirim', 'Post', 'Posting'];
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button, span'));

    buttons.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return (rectB.bottom + rectB.right) - (rectA.bottom + rectA.right);
    });

    for (const button of buttons) {
      const text = (button.textContent || '').trim();
      const ariaLabel = button.getAttribute('aria-label') || '';

      for (const searchText of buttonTexts) {
        if (text === searchText || text.includes(searchText) || ariaLabel.includes(searchText)) {
          const rect = button.getBoundingClientRect();
          const isDisabled = button.disabled ||
            button.getAttribute('aria-disabled') === 'true' ||
            button.classList.contains('disabled');

          if (rect.width > 50 && rect.height > 25 &&
            !isDisabled && button.offsetParent !== null &&
            rect.top >= 0 && rect.bottom <= window.innerHeight) {

            button.click();
            return { success: true, text: text || ariaLabel };
          }
        }
      }
    }
    return { success: false };
  });

  if (fallbackPosted.success) {
    console.log(\`[\${ACCOUNT_ID}] Post clicked (fallback): "\${fallbackPosted.text}"\`);
    await delay(15000);
    return true;
  }

  console.log(\`[\${ACCOUNT_ID}] ⚠️ WARNING: Post button not found!\`);
  return false;
}

async function verifyPostSuccess(page) {
  console.log(\`[\${ACCOUNT_ID}] Verifying post...\`);

  await delay(5000);

  try {
    const isSuccess = await page.evaluate(() => {
      try {
        const dialogClosed = !document.querySelector('div[role="dialog"]');
        const backToTimeline = document.querySelector('[role="main"]') ||
          window.location.href === 'https://www.facebook.com/';
        const noErrors = !document.querySelector('[role="alert"]');
        const titleOk = document.title.includes('Facebook');

        const indicators = [dialogClosed, backToTimeline, noErrors, titleOk];
        const successCount = indicators.filter(Boolean).length;

        return {
          success: successCount >= 2,
          successCount
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    if (isSuccess.success) {
      console.log(\`[\${ACCOUNT_ID}] Post verified (\${isSuccess.successCount}/4 indicators)\`);
      return true;
    } else {
      console.log(\`[\${ACCOUNT_ID}] Verification uncertain (\${isSuccess.successCount}/4)\`);
      return false;
    }
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] Verification failed: \${error.message}\`);
    return false;
  }
}

async function postStatus(page, status, photoInfo) {
  console.log(\`[\${ACCOUNT_ID}] 📝 Starting post process...\`);

  // Upload foto langsung (ini akan membuka dialog)
  if (photoInfo.filePath) {
    await uploadPhoto(page, photoInfo.filePath);
  } else {
    // Hanya untuk text-only post, baru klik text area
    await clickTextArea(page);  // ← INI YANG HANDLE TEXT-ONLY
  }

  await typeCaption(page, status);
  await clickNextButton(page);
  await clickPostButton(page);
  await verifyPostSuccess(page);
}

// ========================================
// MAIN
// ========================================
async function main() {
  let browser;

  try {
    console.log(\`\\n[\${ACCOUNT_ID}] ======================================\`);
    console.log(\`[\${ACCOUNT_ID}] FacebookPro Blaster - Auto Post Bot with MEMORY\`);
    console.log(\`[\${ACCOUNT_ID}] Priority: Gemini → OpenRouter\`);
    console.log(\`[\${ACCOUNT_ID}] With Photo Logging & Fallback\`);
    console.log(\`[\${ACCOUNT_ID}] ======================================\\n\`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    await fs.mkdir(TEMP_PHOTOS_DIR, { recursive: true });

    const memory = new StatusMemory(config.memory_settings?.max_history || 50);
    await memory.load();

    const photoLogger = new PhotoLogger();
    await photoLogger.load();

    const stats = memory.getStats();
    console.log(\`[\${ACCOUNT_ID}] 📊 Memory Stats:\`);
    console.log(\`[\${ACCOUNT_ID}]   Total Statuses: \${stats.totalStatuses}\`);
    console.log(\`[\${ACCOUNT_ID}]   Used Photos: \${photoLogger.getUsedPhotosCount()}\`);
    if (stats.topTopics.length > 0) {
      console.log(\`[\${ACCOUNT_ID}]   Top Topics:\`);
      stats.topTopics.forEach(([topic, count]) => {
        console.log(\`[\${ACCOUNT_ID}]     - \${topic}: \${count}x\`);
      });
    }
    console.log('');

    const context = getTimeContext();
    const result = await generateTimeAwareStatus(context, memory);

    console.log(\`[\${ACCOUNT_ID}] 📝 Status: "\${result.status}"\`);
    console.log(\`[\${ACCOUNT_ID}] 🤖 Provider: \${result.provider}\\n\`);

    memory.addStatus(result.status, {
      timeOfDay: context.timeOfDay,
      provider: result.provider
    });
    await memory.save();

    const photoInfo = await selectPhoto(photoLogger, result.status);

    if (!photoInfo.filePath) {
      console.log(\`[\${ACCOUNT_ID}] 📝 Will post TEXT ONLY\`);
    }

    // config.headless already overridden by FORCE_HEADLESS at top of file
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
    await page.setViewport({ width: 1366, height: 768 });

    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);

    console.log(\`[\${ACCOUNT_ID}] 🌐 Navigating to Facebook...\`);
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
    await delay(15000);

    if (page.url().includes('/login')) {
      throw new Error('Cookies expired');
    }

    await postStatus(page, result.status, photoInfo);

    console.log(\`\\n[\${ACCOUNT_ID}] ✅ SUCCESS!\\n\`);
    const successMsg = photoInfo.filePath
      ? \`Posted with photo: \${result.status}\`
      : \`Posted text only: \${result.status}\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successMsg);

  } catch (error) {
    console.error(\`\\n[\${ACCOUNT_ID}] ❌ ERROR: \${error.message}\\n\`);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);
    throw error;

  } finally {
    if (browser) {
      await browser.close();
      await delay(3000);
    }
  }
}

main().catch(error => {
  console.error(\`[\${ACCOUNT_ID}] Fatal: \${error.message}\`);
  process.exit(1);
});
`,
            "confirm": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
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
    const lines = logData.split('\\n').filter(line => line.trim());

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let confirmsPastHour = 0;
    let confirmsPastDay = 0;

    for (const line of lines) {
      if (line.includes('CONFIRMED')) {
        const timestampMatch = line.match(/\\[(.*?)\\]/);
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
        throw new Error(\`Hourly limit: \${confirmsPastHour}/\${limits.max_per_hour}\`);
      }
      if (confirmsPastDay >= (limits.max_per_day || 50)) {
        throw new Error(\`Daily limit: \${confirmsPastDay}/\${limits.max_per_day}\`);
      }
    }

    console.log(\`[\${ACCOUNT_ID}] 📊 Limits: \${confirmsPastHour}h, \${confirmsPastDay}d\`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function waitForPageLoad(page, description = 'page') {
  console.log(\`[\${ACCOUNT_ID}] ⏳ Waiting for \${description} to load...\`);

  try {
    await page.waitForFunction(() => document.readyState === 'complete', {
      timeout: 30000
    });
    console.log(\`[\${ACCOUNT_ID}] ✅ Document ready\`);
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Document timeout, continuing...\`);
  }

  try {
    await page.waitForSelector('[role="main"], [role="navigation"]', {
      timeout: 15000,
      visible: true
    });
    console.log(\`[\${ACCOUNT_ID}] ✅ Main content visible\`);
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Main content timeout\`);
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
    console.log(\`[\${ACCOUNT_ID}] ✅ \${description} loaded successfully\`);
  } else {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ \${description} may not be fully loaded\`);
    await delay(5000);
  }
}

async function navigateWithRetry(page, url, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(\`[\${ACCOUNT_ID}] 🌐 Navigating to \${url} (attempt \${attempt}/\${maxRetries})...\`);

      await page.goto(url, {
        waitUntil: 'load',
        timeout: 60000
      });

      await waitForPageLoad(page, url.split('/').pop() || 'page');

      const title = await page.title();
      console.log(\`[\${ACCOUNT_ID}] ✅ Loaded: \${title}\`);
      return true;

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Navigation attempt \${attempt} failed: \${error.message}\`);

      if (attempt < maxRetries) {
        console.log(\`[\${ACCOUNT_ID}] 🔄 Retrying in 5s...\`);
        await delay(5000);
      } else {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Proceeding despite navigation issues...\`);
      }
    }
  }

  return false;
}

// ========================================
// **NEW**: SCROLL FUNCTION TO LOAD MORE REQUESTS
// ========================================
async function scrollToLoadRequests(page) {
  console.log(\`[\${ACCOUNT_ID}] 📜 Scrolling to load all friend requests...\`);

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
    console.log(\`[\${ACCOUNT_ID}] ✅ Scroll complete\`);
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Scroll error: \${error.message}\`);
  }
}

// ========================================
// IMPROVED FRIEND REQUEST EXTRACTION
// ========================================
async function getFriendRequests(page) {
  console.log(\`[\${ACCOUNT_ID}] 🔍 Extracting friend requests...\`);

  // **FIX 1**: Scroll to load all requests
  await scrollToLoadRequests(page);

  await delay(3000);

  try {
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, \`friends_page_\${Date.now()}.png\`),
      fullPage: false
    });
    console.log(\`[\${ACCOUNT_ID}] 📸 Screenshot saved\`);
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

        debug.push(\`Found \${confirmElements.length} potential confirm buttons.\`);

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
              debug.push(\`Found a valid container for button \${i}.\`);
              break;
            }
          }

          if (!container) {
            debug.push(\`Could not find a valid container for button \${i}. It might be a different UI element.\`);
            continue;
          }

          const uniqueId = \`confirm-btn-\${Date.now()}-\${i}\`;
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
            debug.push(\`Could not extract a valid name from container \${i}.\`);
            continue;
          }

          let mutualFriendsCount = 0;
          const containerText = container.textContent || '';
          const mutualMatch = containerText.match(/(\\d+)\\s*(teman bersama|mutual)/i);
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
            deleteId = \`delete-btn-\${Date.now()}-\${i}\`;
            deleteElement.setAttribute('data-bot-delete-id', deleteId);
          }

          const img = container.querySelector('img[src*="scontent"], img[src*="fbcdn"]');
          const hasProfilePhoto = !!(img && img.src && !img.src.includes('silhouette') && !img.src.includes('default'));

          debug.push(\`✅ Extracted: \${name} (\${mutualFriendsCount} mutual, photo: \${hasProfilePhoto})\`);
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
        debug.push(\`Fatal error in evaluation: \${error.message}\`);
        return { requests: [], debug };
      }
    });

    console.log(\`[\${ACCOUNT_ID}] 🛠 Debug output:\`);
    if (result && result.debug) {
      result.debug.forEach(msg => console.log(\`  \${msg}\`));
    }

    friendRequests = (result && result.requests) ? result.requests : [];

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] ❌ Error extracting requests:\`, error.message);
    friendRequests = [];
  }

  console.log(\`[\${ACCOUNT_ID}] 📋 Found \${friendRequests.length} friend requests\`);

  if (friendRequests.length === 0) {
    console.log(\`[\${ACCOUNT_ID}] ℹ️  No requests found, checking page content...\`);
    try {
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        hasArticles: document.querySelectorAll('[role="article"]').length,
        hasButtons: document.querySelectorAll('[role="button"]').length,
        bodyText: document.body.innerText.substring(0, 500)
      }));
      console.log(\`[\${ACCOUNT_ID}] 📄 Page info:\`, JSON.stringify(pageInfo, null, 2));
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Could not get page info\`);
    }
  }

  return friendRequests;
}


// ========================================
// ACTIONS
// ========================================
async function confirmFriendRequest(page, request) {
  try {
    console.log(\`[\${ACCOUNT_ID}] ✅ Confirming: \${request.name}\`);

    const clicked = await page.evaluate((confirmId) => {
      const btn = document.querySelector(\`[data-bot-confirm-id="\${confirmId}"]\`);
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
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Button not found\`);
      return false;
    }

    await delay(4000);
    console.log(\`[\${ACCOUNT_ID}] ✅ Confirmed\`);
    return true;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ❌ Error: \${error.message}\`);
    return false;
  }
}

async function deleteFriendRequest(page, request, reason) {
  try {
    console.log(\`[\${ACCOUNT_ID}] 🗑️ Deleting: \${request.name}\`);

    if (!request.deleteId) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ No delete button ID\`);
      return false;
    }

    const clicked = await page.evaluate((deleteId) => {
      const btn = document.querySelector(\`[data-bot-delete-id="\${deleteId}"]\`);
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
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Delete button not found\`);
      return false;
    }

    await delay(2000);

    const timestamp = new Date().toISOString();
    const logEntry = \`[\${timestamp}] DELETED: \${request.name} | Reason: \${reason}\\n\`;
    await fs.appendFile(LOG_PATH, logEntry);

    console.log(\`[\${ACCOUNT_ID}] 🗑️ Deleted\`);
    return true;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ❌ Error: \${error.message}\`);
    return false;
  }
}

async function openProfileAndSendGreeting(page, request) {
  try {
    console.log(\`[\${ACCOUNT_ID}] 👤 Opening profile to send greeting...\`);

    if (!request.profileLink) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ No profile link\`);
      return false;
    }

    await page.goto(request.profileLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(5000);

    await waitForPageLoad(page, 'profile');

    // Step 1: Click the 'Kirim pesan' / 'Message' button
    console.log(\`[\${ACCOUNT_ID}] 💬 Looking for Message button...\`);
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
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Message button not found\`);
      return false;
    }

    await delay(5000); // Wait for chat box to fully load

    // Step 2: Click on the message input area
    console.log(\`[\${ACCOUNT_ID}] 📝 Clicking message input area...\`);
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
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Could not click message input\`);
    }

    await delay(1500);

    // Step 3: Type the greeting message character by character
    const greetingMessage = config.greeting_message || "Halo, salam kenal kak";
    console.log(\`[\${ACCOUNT_ID}] ⌨️  Typing message: "\${greetingMessage}"\`);

    // Type slowly to mimic human behavior
    for (const char of greetingMessage) {
      await page.keyboard.type(char, { delay: 50 + Math.random() * 50 });
    }

    await delay(1000); // Small pause after typing

    // Step 4: Press Enter to send message (DIRECT APPROACH)
    console.log(\`[\${ACCOUNT_ID}] 📤 Pressing Enter to send...\`);
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
      console.log(\`[\${ACCOUNT_ID}] ✅ Greeting message sent!\`);
    } else {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Message may not have been sent, retrying...\`);
      // Try Enter one more time
      await page.keyboard.press('Enter');
      await delay(2000);
    }

    return true;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Greeting error: \${error.message}\`);
    return false;
  }
}

async function sendStickerToProfile(page, request) {
  try {
    console.log(\`[\${ACCOUNT_ID}] 😊 Sending sticker...\`);

    // Chat should already be open from previous greeting message
    // If not, open it
    const isChatOpen = await page.evaluate(() => {
      return !!document.querySelector('div[role="textbox"]');
    });

    if (!isChatOpen) {
      console.log(\`[\${ACCOUNT_ID}] 📱 Opening chat first...\`);
      if (!request.profileLink) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ No profile link\`);
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
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Could not open chat\`);
        return false;
      }

      await delay(5000);
    }

    // Click the sticker button (from recording selector)
    console.log(\`[\${ACCOUNT_ID}] 🎨 Clicking sticker button...\`);
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
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Sticker button not found\`);
      return false;
    }

    await delay(2000);
    console.log(\`[\${ACCOUNT_ID}] ✅ Sticker sent!\`);

    return true;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Sticker error: \${error.message}\`);
    return false;
  }
}

// ========================================
// SAFETY CHECKS - REMOVED (Accept all requests)
// ========================================
async function shouldAcceptFriendRequest(request) {
  console.log(\`[\${ACCOUNT_ID}] 🔍 Checking: \${request.name}\`);

  // Accept all requests (no memory check, no safety checks)
  console.log(\`[\${ACCOUNT_ID}] ✅ Accepting request\`);
  return { accept: true, reason: 'auto_accept' };
}

async function returnToFriendsTab(page) {
  console.log(\`[\${ACCOUNT_ID}] ↩️  Returning to Friends...\`);

  try {
    await navigateWithRetry(page, 'https://www.facebook.com/friends', 1);
    console.log(\`[\${ACCOUNT_ID}] ✅ Returned\`);
    return true;
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Return error: \${error.message}\`);
    return false;
  }
}

// ========================================
// **NEW**: REFRESH PAGE AFTER EACH CONFIRM
// ========================================
async function refreshFriendsPage(page) {
  console.log(\`[\${ACCOUNT_ID}] 🔄 Refreshing page to load new requests...\`);

  try {
    await page.reload({ waitUntil: 'load', timeout: 30000 });
    await waitForPageLoad(page, 'friends page');
    console.log(\`[\${ACCOUNT_ID}] ✅ Page refreshed\`);
    return true;
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Refresh error: \${error.message}\`);
    return false;
  }
}

// ========================================
// MAIN
// ========================================
async function main() {
  let browser = null;

  try {
    console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto Confirm Friends ===\`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    await checkFriendLimits();

    console.log(\`[\${ACCOUNT_ID}] 🍪 Loading cookies...\`);
    const cookies = await loadCookiesFromFile();

    console.log(\`[\${ACCOUNT_ID}] 🚀 Launching browser...\`);
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
    console.log(\`[\${ACCOUNT_ID}] 🍪 \${cookies.length} cookies loaded\`);

    await navigateWithRetry(page, 'https://www.facebook.com/');

    const title = await page.title();
    if (title.includes('Log') || title.includes('login')) {
      throw new Error(\`Login failed!\`);
    }

    console.log(\`[\${ACCOUNT_ID}] ✅ Login successful\`);

    await navigateWithRetry(page, 'https://www.facebook.com/friends');

    let confirmedCount = 0;
    let deletedCount = 0;
    let messagesSent = 0;
    let stickersSent = 0;
    const maxConfirms = config.maxConfirms || 3;

    console.log(\`[\${ACCOUNT_ID}] 🎯 Target: \${maxConfirms} confirms\`);

    // **FIX 3**: Process multiple requests with refresh cycle
    let cycleCount = 0;
    const maxCycles = maxConfirms * 2; // Prevent infinite loops

    while (confirmedCount < maxConfirms && cycleCount < maxCycles) {
      cycleCount++;
      console.log(\`\\n[\${ACCOUNT_ID}] 🔄 === CYCLE \${cycleCount} ===\`);

      const friendRequests = await getFriendRequests(page);

      if (friendRequests.length === 0) {
        console.log(\`[\${ACCOUNT_ID}] ℹ️  No more requests found\`);
        break;
      }

      let processedInCycle = 0;

      for (const request of friendRequests) {
        if (confirmedCount >= maxConfirms) {
          console.log(\`[\${ACCOUNT_ID}] 🛑 Limit reached\`);
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
              const logEntry = \`[\${timestamp}] CONFIRMED: \${request.name} | Mutual: \${request.mutualFriendsCount}\\n\`;
              await fs.appendFile(LOG_PATH, logEntry);

              console.log(\`[\${ACCOUNT_ID}] 📊 Progress: \${confirmedCount}/\${maxConfirms}\`);

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
                  console.log(\`[\${ACCOUNT_ID}] 🚪 Closing chat...\`);
                  try {
                    await page.keyboard.press('Escape');
                    await delay(2000);
                  } catch (e) {
                    console.log(\`[\${ACCOUNT_ID}] ⚠️ Could not close chat with Escape\`);
                  }
                } else {
                  console.log(\`[\${ACCOUNT_ID}] ℹ️  Chat already closed\`);
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

          console.log(\`[\${ACCOUNT_ID}] ⏳ Waiting \${waitTime / 1000}s...\\n\`);
          await delay(waitTime);

        } catch (error) {
          console.log(\`[\${ACCOUNT_ID}] ❌ Error: \${error.message}\`);
          try { await returnToFriendsTab(page); } catch (e) { }
          continue;
        }
      }

      // If no requests were processed in this cycle, break
      if (processedInCycle === 0 && friendRequests.length > 0) {
        console.log(\`[\${ACCOUNT_ID}] ℹ️  All visible requests already processed\`);
        break;
      }
    }

    // Memory save removed - no longer needed (accept all requests)

    console.log(\`\\n[\${ACCOUNT_ID}] === COMPLETE ===\`);
    console.log(\`[\${ACCOUNT_ID}] ✅ Confirmed: \${confirmedCount}\`);
    console.log(\`[\${ACCOUNT_ID}] 💬 Messages sent: \${messagesSent}\`);
    console.log(\`[\${ACCOUNT_ID}] 😊 Stickers sent: \${stickersSent}\`);
    console.log(\`[\${ACCOUNT_ID}] 🔄 Cycles: \${cycleCount}\`);

    const successDetails = \`\${confirmedCount} confirmed (\${messagesSent} messages, \${stickersSent} stickers)\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, \`friends_success_\${Date.now()}.png\`)
    });

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] ❌ ERROR:\`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        await pages[0].screenshot({
          path: path.join(ARTIFACTS_DIR, \`friends_error_\${Date.now()}.png\`),
          fullPage: true
        });
      } catch (e) { }
    }

    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log(\`[\${ACCOUNT_ID}] 🔒 Browser closed\`);
    }
  }
}

process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] 🛑 Stopped by user\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error(\`[\${ACCOUNT_ID}] ❌ Unhandled rejection:\`, reason);
  process.exit(1);
});

main();
`,
            "sharereels": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Import AI comment generator module
const { generateAiComment, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support: Get paths from environment variables
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config with multi-account support
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
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
    console.log(\`[\${ACCOUNT_ID}] Loading cookies from: \${COOKIES_PATH}\`);
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
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load cookies: \${error.message}\`);
  }
}

// Load target groups
async function loadTargetGroups() {
  try {
    const data = await fs.readFile(TARGET_GROUPS_PATH, "utf8");
    const groups = data.split("\\n").map(g => g.trim()).filter(Boolean);
    if (groups.length === 0) {
      throw new Error(\`[\${ACCOUNT_ID}] File target_groups.txt kosong\`);
    }
    return groups;
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] File target_groups.txt tidak ditemukan. Membuat file default...\`);
      const defaultGroups = [
        "https://www.facebook.com/groups/your-target-group-1",
        "https://www.facebook.com/groups/your-target-group-2"
      ].join("\\n");
      await fs.writeFile(TARGET_GROUPS_PATH, defaultGroups, "utf8");
      throw new Error(\`[\${ACCOUNT_ID}] File target_groups.txt telah dibuat. Silakan edit dengan URL grup yang sebenarnya.\`);
    }
    throw e;
  }
}

// IMPROVED: Load Reels URLs with better error handling
async function loadReelsUrls() {
  try {
    // Check if file exists
    if (!fsSync.existsSync(REELS_URLS_PATH)) {
      console.log(\`[\${ACCOUNT_ID}] File reels_urls.txt tidak ditemukan. Membuat file kosong...\`);
      await fs.writeFile(REELS_URLS_PATH, "", "utf8");
      throw new Error(\`[\${ACCOUNT_ID}] File reels_urls.txt kosong. Silakan jalankan scrape.js terlebih dahulu atau tambahkan URL reels secara manual.\`);
    }

    const data = await fs.readFile(REELS_URLS_PATH, "utf8");

    // Check if file is empty
    if (!data.trim()) {
      throw new Error(\`[\${ACCOUNT_ID}] File reels_urls.txt kosong. Silakan jalankan scrape.js terlebih dahulu atau tambahkan URL reels secara manual.\`);
    }

    // Parse URLs with better handling
    const urls = data.split("\\n")
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
      throw new Error(\`[\${ACCOUNT_ID}] Tidak ada URL reels yang valid dalam file. Pastikan URL mengandung 'facebook.com/reel/'\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Loaded \${urls.length} valid reel URLs\`);
    return urls;
  } catch (e) {
    if (e.code === "ENOENT") {
      await fs.writeFile(REELS_URLS_PATH, "", "utf8");
      throw new Error(\`[\${ACCOUNT_ID}] File reels_urls.txt tidak ditemukan. Silakan jalankan scrape.js terlebih dahulu.\`);
    }
    throw e;
  }
}

// Load Gemini Keys
async function loadGeminiKeys() {
  if (!config.ai_caption?.enabled) {
    console.log(\`[\${ACCOUNT_ID}] AI caption disabled, skipping Gemini keys load\`);
    return [];
  }

  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(k => k.trim()).filter(k => k && k.startsWith("AIzaSy"));

    if (keys.length === 0) {
      console.log(\`[\${ACCOUNT_ID}] Warning: AI caption enabled but no valid Gemini keys found.\`);
      return [];
    }

    console.log(\`[\${ACCOUNT_ID}] Loaded \${keys.length} Gemini API keys\`);
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] Warning: gemini_keys.txt not found.\`);
      return [];
    }
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load Gemini keys: \${error.message}\`);
  }
}

// Function to extract video caption from page
async function extractVideoCaption(page) {
  console.log(\`[\${ACCOUNT_ID}] Extracting video caption from page...\`);

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
          console.log(\`[\${ACCOUNT_ID}] Video caption found: "\${caption.substring(0, 100)}\${caption.length > 100 ? '...' : ''}"\`);
          return caption;
        }
      } catch (e) {
        continue;
      }
    }

    const fallbackCaption = await page.evaluate(() => {
      const allText = document.body.innerText || '';
      const lines = allText.split('\\n').filter(line => {
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
      console.log(\`[\${ACCOUNT_ID}] Fallback caption: "\${fallbackCaption.substring(0, 100)}\${fallbackCaption.length > 100 ? '...' : ''}"\`);
      return fallbackCaption;
    }

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] Error extracting video caption: \${error.message}\`);
  }

  console.log(\`[\${ACCOUNT_ID}] No video caption found\`);
  return "";
}

// Function to click share button
async function clickShareButton(page, timeout = 15000) {
  try {
    console.log(\`[\${ACCOUNT_ID}] Mencari tombol Share...\`);

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
            console.log(\`[\${ACCOUNT_ID}] Tombol Share diklik dengan selector: \${selector}\`);
            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    console.log(\`[\${ACCOUNT_ID}] Mencoba dengan text content...\`);
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
      console.log(\`[\${ACCOUNT_ID}] Tombol Share diklik (text content strategy)\`);
      await delay(2000);
      return true;
    }

    throw new Error("Tombol share tidak ditemukan dengan semua strategi");

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Error clicking share button:\`, error.message);
    return false;
  }
}

// Function to click "Share to Group" button
async function clickShareToGroupButton(page, timeout = 15000) {
  try {
    console.log(\`[\${ACCOUNT_ID}] Mencari 'Bagikan ke grup'...\`);

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
            console.log(\`[\${ACCOUNT_ID}] Share to group diklik dengan selector: \${selector}\`);
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
      console.log(\`[\${ACCOUNT_ID}] Tombol 'Bagikan ke grup' diklik\`);
      await delay(2000);
      return true;
    }

    throw new Error("Tidak dapat menemukan opsi 'Bagikan ke grup'");

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Error clicking share to group button:\`, error.message);
    return false;
  }
}

// Function to select group from dropdown
async function selectGroupFromDropdown(page, groupName, timeout = 15000) {
  try {
    console.log(\`[\${ACCOUNT_ID}] Mencari grup: \${groupName}\`);

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
            console.log(\`[\${ACCOUNT_ID}] Grup dipilih dengan selector: \${selector}\`);
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
      console.log(\`[\${ACCOUNT_ID}] Input field ditemukan\`);
      await delay(1500);

      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Delete');
      await delay(800);

      await page.keyboard.type(groupName, { delay: 120 });
      console.log(\`[\${ACCOUNT_ID}] Berhasil mengetik: \${groupName}\`);

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
        console.log(\`[\${ACCOUNT_ID}] Grup dipilih dari dropdown\`);
        await delay(2000);
        return true;
      }

      console.log(\`[\${ACCOUNT_ID}] Mencoba keyboard navigation...\`);
      await page.keyboard.press('ArrowDown');
      await delay(1500);
      await page.keyboard.press('Enter');
      console.log(\`[\${ACCOUNT_ID}] Grup dipilih dengan keyboard\`);
      await delay(2000);
      return true;
    }

    console.log(\`[\${ACCOUNT_ID}] Grup dipilih (fallback method)\`);
    await delay(2000);
    return true;

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Error selecting group:\`, error.message);
    return false;
  }
}

// Function to add caption with AI-generated content
async function addCaption(page, caption, timeout = 8000) {
  try {
    console.log(\`[\${ACCOUNT_ID}] Menambahkan caption: "\${caption}"\`);

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
            console.log(\`[\${ACCOUNT_ID}] Caption area clicked, waiting \${config.ai_caption?.typing_delay_after_click || 3000}ms...\`);
            await delay(config.ai_caption?.typing_delay_after_click || 3000);

            await element.focus();
            await delay(500);

            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Delete');
            await delay(800);

            await page.keyboard.type(caption, { delay: 120 });
            console.log(\`[\${ACCOUNT_ID}] Caption ditambahkan dengan selector: \${selector}\`);

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
      console.log(\`[\${ACCOUNT_ID}] Caption ditambahkan dengan fallback method\`);
      await delay(2000);
      return true;
    }

    console.log(\`[\${ACCOUNT_ID}] Mencoba menambahkan caption dengan keyboard...\`);
    await page.keyboard.type(caption, { delay: 120 });
    await delay(2000);
    return true;

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Error adding caption:\`, error.message);
    return false;
  }
}

// Function to click post button
async function clickPostButton(page, timeout = 15000) {
  try {
    console.log(\`[\${ACCOUNT_ID}] Mencari tombol Post...\`);

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
            console.log(\`[\${ACCOUNT_ID}] Tombol Post diklik dengan selector: \${selector}\`);
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
      console.log(\`[\${ACCOUNT_ID}] Tombol Post diklik: "\${postClicked.text}"\`);
      await delay(2000);
      return true;
    }

    console.log(\`[\${ACCOUNT_ID}] Mencoba keyboard shortcut Ctrl+Enter...\`);
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');

    await delay(1500);

    console.log(\`[\${ACCOUNT_ID}] Mencoba tombol Enter...\`);
    await page.keyboard.press('Enter');
    await delay(1000);

    return true;

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Error clicking post button:\`, error.message);
    return false;
  }
}

// Main function
async function main() {
  let browser = null;
  let page = null;

  console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto Share Reels dengan AI Caption (OpenRouter Enhanced) ===\`);
  console.log(\`[\${ACCOUNT_ID}] Working directory: \${process.cwd()}\`);

  try {
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const groups = await loadTargetGroups();
    const reels = await loadReelsUrls();
    const cookies = await loadCookiesFromFile();

    console.log(\`[\${ACCOUNT_ID}] Loaded \${groups.length} target groups\`);
    console.log(\`[\${ACCOUNT_ID}] Loaded \${reels.length} reels URLs\`);
    console.log(\`[\${ACCOUNT_ID}] Loaded \${cookies.length} cookies\`);

    let geminiKeys = [];
    let openRouterKeys = [];

    if (config.ai_caption?.enabled) {
      geminiKeys = await loadGeminiKeys();

      if (config.ai_caption.use_openrouter !== false) {
        openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);
        console.log(\`[\${ACCOUNT_ID}] Loaded \${openRouterKeys.length} OpenRouter API keys\`);
      }

      console.log(\`[\${ACCOUNT_ID}] Loaded \${geminiKeys.length} Gemini API keys (fallback)\`);
      console.log(\`[\${ACCOUNT_ID}] AI Caption enabled: OpenRouter → Gemini → Static\`);
      console.log(\`[\${ACCOUNT_ID}] Current caption style: \${config.ai_caption?.current_style || 'default'}\`);
    } else {
      console.log(\`[\${ACCOUNT_ID}] AI Caption disabled, will use static text: "\${config.ai_caption?.static_text}"\`);
    }

    console.log(\`[\${ACCOUNT_ID}] Meluncurkan stealth browser...\`);

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

      console.log(\`[\${ACCOUNT_ID}] [\${i + 1}/\${groups.length}] Membagikan ke grup: \${group}\`);
      console.log(\`[\${ACCOUNT_ID}] Reels URL: \${reelUrl}\`);

      try {
        console.log(\`[\${ACCOUNT_ID}] Navigating to Facebook...\`);
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
          throw new Error(\`[\${ACCOUNT_ID}] Tidak berhasil login ke Facebook. Issue: \${loginCheck.issue}. Periksa cookies.json!\`);
        }

        console.log(\`[\${ACCOUNT_ID}] Navigating to Reels: \${reelUrl}\`);
        await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await delay(6000);

        // Extract video caption
        console.log(\`[\${ACCOUNT_ID}] Step 0: Extracting video caption...\`);
        const videoCaption = await extractVideoCaption(page);

        // Step 1: Click share button
        console.log(\`[\${ACCOUNT_ID}] Step 1: Mengklik tombol Share...\`);
        const shareClicked = await clickShareButton(page, 15000);
        if (!shareClicked) {
          throw new Error("Gagal mengklik tombol Share");
        }
        await delay(5000);

        // Step 2: Click "Share to Group"
        console.log(\`[\${ACCOUNT_ID}] Step 2: Mengklik 'Bagikan ke grup'...\`);
        const shareToGroupClicked = await clickShareToGroupButton(page, 15000);
        if (!shareToGroupClicked) {
          throw new Error("Gagal mengklik 'Bagikan ke grup'");
        }
        await delay(5000);

        // Step 3: Select group
        console.log(\`[\${ACCOUNT_ID}] Step 3: Memilih grup...\`);
        const groupName = group.split("/").pop() || group;
        const groupSelected = await selectGroupFromDropdown(page, groupName, 20000);
        if (!groupSelected) {
          throw new Error(\`Gagal memilih grup: \${groupName}\`);
        }
        await delay(4000);

        // Step 4: Generate AI caption
        console.log(\`[\${ACCOUNT_ID}] Step 4: Generating AI caption with OpenRouter...\`);
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
          console.log(\`[\${ACCOUNT_ID}] -> Using \${result.provider} caption\${result.model ? \` (\${result.model})\` : ''}\`);
        } else {
          generatedCaption = config.ai_caption?.static_text || "Lihat video ini!";
          console.log(\`[\${ACCOUNT_ID}] -> Using static caption\`);
        }

        console.log(\`[\${ACCOUNT_ID}] Step 5: Menambahkan caption...\`);
        const captionAdded = await addCaption(page, generatedCaption, 10000);
        if (!captionAdded) {
          console.log(\`[\${ACCOUNT_ID}] Warning: Gagal menambahkan caption, lanjut tanpa caption.\`);
        } else {
          console.log(\`[\${ACCOUNT_ID}] Caption berhasil ditambahkan: "\${generatedCaption}"\`);
        }
        await delay(4000);

        // Step 6: Click post button
        console.log(\`[\${ACCOUNT_ID}] Step 6: Mengklik tombol Post...\`);
        const postClicked = await clickPostButton(page, 20000);
        if (postClicked) {
          console.log(\`[\${ACCOUNT_ID}] Berhasil share ke: \${group}\`);
          console.log(\`[\${ACCOUNT_ID}] Caption: "\${generatedCaption}"\`);

          const successMsg = \`Reels shared with AI caption: "\${generatedCaption.substring(0, 50)}\${generatedCaption.length > 50 ? '...' : ''}"\`;
          await notify.success(ACCOUNT_ID, BOT_NAME, successMsg);

          await delay(6000);
        } else {
          console.log(\`[\${ACCOUNT_ID}] Gagal posting ke: \${group}\`);
        }

        if (i < groups.length - 1) {
          const interval = getRandomInterval();
          console.log(\`[\${ACCOUNT_ID}] Jeda \${interval / 1000} detik sebelum grup berikutnya...\`);
          await delay(interval);
        }

      } catch (error) {
        console.error(\`[\${ACCOUNT_ID}] Gagal share ke \${group}:\`, error.message);

        await notify.error(ACCOUNT_ID, BOT_NAME, \`Failed to share to \${group}: \${error.message}\`);

        try {
          const screenshotPath = path.join(ARTIFACTS_DIR, \`share_error_\${Date.now()}.png\`);
          await page.screenshot({
            path: screenshotPath,
            fullPage: false
          });
          console.log(\`[\${ACCOUNT_ID}] Screenshot error disimpan: \${screenshotPath}\`);
        } catch (screenshotError) {
          console.error(\`[\${ACCOUNT_ID}] Gagal mengambil screenshot:\`, screenshotError.message);
        }

        try {
          await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await delay(3000);
        } catch (recoveryError) {
          console.error(\`[\${ACCOUNT_ID}] Recovery navigation failed:\`, recoveryError.message);
        }

        continue;
      }
    }

    console.log(\`[\${ACCOUNT_ID}] === Semua tugas selesai ===\`);
    await notify.success(ACCOUNT_ID, BOT_NAME, \`All \${groups.length} groups processed successfully\`);

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Fatal Error:\`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, \`Fatal error: \${error.message}\`);
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(\`[\${ACCOUNT_ID}] Browser ditutup.\`);
      } catch (e) {
        console.error(\`[\${ACCOUNT_ID}] Error closing browser:\`, e.message);
      }
    }
  }
}

process.on('SIGINT', async () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Script dihentikan oleh user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] Unhandled Rejection at:\`, promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] Uncaught Exception:\`, error);
  process.exit(1);
});

main();
`,
            "scrape": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
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
      console.log(\`[\${ACCOUNT_ID}] \${operationName} - Attempt \${attempt}/\${maxRetries}\`);
      return await operation();
    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] \${operationName} - Attempt \${attempt} failed: \${error.message}\`);

      if (attempt === maxRetries) {
        throw new Error(\`\${operationName} failed after \${maxRetries} attempts: \${error.message}\`);
      }

      const delayTime = baseDelay * Math.pow(2, attempt - 1);
      console.log(\`[\${ACCOUNT_ID}] Retrying in \${delayTime}ms...\`);
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
      console.log(\`[\${ACCOUNT_ID}] Navigating to: \${url}\`);

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

      console.log(\`[\${ACCOUNT_ID}] ✅ Page loaded successfully\`);
      return true;

    } catch (error) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Primary navigation failed: \${error.message}\`);

      // Fallback: Try simple navigation
      if (error.message.includes('timeout')) {
        console.log(\`[\${ACCOUNT_ID}] Trying fallback navigation strategy...\`);

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeout
        });

        await delay(8000);
        console.log(\`[\${ACCOUNT_ID}] ✅ Fallback navigation successful\`);
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
    console.log(\`[\${ACCOUNT_ID}] Loading cookies from: \${COOKIES_PATH}\`);
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
    throw new Error(\`Failed to load cookies: \${error.message}\`);
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
      const lines = data.split("\\n").filter(line => line.trim() !== "");

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

      console.log(\`[\${ACCOUNT_ID}] ✅ Loaded \${this.reels.size} existing reels\`);
      return this.reels.size;
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log(\`[\${ACCOUNT_ID}] 📝 Creating new reels_urls.txt\`);
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
      normalized = normalized.replace(/\\/reel\\/(\\d+).*$/, '/reel/$1');
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
      console.log(\`[\${ACCOUNT_ID}] 🗑️  Cleaned up \${removedCount} old reels (older than \${retentionDays} days)\`);
    }

    return removedCount;
  }

  async save() {
    try {
      const lines = Array.from(this.reels.values())
        .sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
        .map(r => \`\${r.url}|\${r.timestamp}|\${r.source}\`);

      const content = lines.join("\\n");
      await fs.writeFile(REELS_URLS_PATH, content, "utf8");
      console.log(\`[\${ACCOUNT_ID}] ✅ Saved \${this.reels.size} reels URLs\`);

      // Backup to account directory
      try {
        const accountReelsPath = path.join(__dirname, "../accounts", ACCOUNT_ID, "reels_urls.txt");
        await fs.writeFile(accountReelsPath, content, "utf8");
        console.log(\`[\${ACCOUNT_ID}] 💾 Backup saved to account directory\`);
      } catch (backupError) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Backup warning: \${backupError.message}\`);
      }

      return this.reels.size;
    } catch (error) {
      throw new Error(\`Failed to save reels: \${error.message}\`);
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
  console.log(\`[\${ACCOUNT_ID}] 🎬 Starting reels scraping...\`);

  // Wait for content to load
  await delay(8000);

  // Verify login status
  const title = await page.title();
  console.log(\`[\${ACCOUNT_ID}] 📄 Page title: \${title}\`);

  if (title.includes('Log') || title.includes('login')) {
    throw new Error('Login failed - Check cookies.json!');
  }

  let newUrlsCount = 0;
  let duplicatesCount = 0;
  let noNewUrlsStreak = 0;
  let totalScraped = 0;

  for (let i = 0; i < config.maxScrolls; i++) {
    console.log(\`[\${ACCOUNT_ID}] 📜 Scroll \${i + 1}/\${config.maxScrolls}...\`);

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
          if (url.match(/\\/reel\\/\\d+/)) {
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
          console.log(\`[\${ACCOUNT_ID}]    ✅ NEW: \${url}\`);
        }
      }
    }

    const newInThisScroll = newUrlsCount - beforeCount;
    console.log(\`[\${ACCOUNT_ID}]    📊 This scroll: \${newInThisScroll} new, \${links.length - newInThisScroll} duplicates\`);

    // Stop if no new URLs for multiple scrolls
    if (newInThisScroll === 0) {
      noNewUrlsStreak++;
      if (noNewUrlsStreak >= 3) {
        console.log(\`[\${ACCOUNT_ID}] ⏹️  No new URLs for 3 scrolls, stopping early\`);
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

  console.log(\`\\n[\${ACCOUNT_ID}] ═══════════════════════════════════════\`);
  console.log(\`[\${ACCOUNT_ID}]   FACEBOOKPRO BLASTER - REELS SCRAPER (Enhanced)\`);
  console.log(\`[\${ACCOUNT_ID}] ═══════════════════════════════════════\\n\`);

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
    console.log(\`[\${ACCOUNT_ID}] 🍪 Loaded \${cookies.length} cookies\`);

    // Launch browser with anti-detection
    console.log(\`[\${ACCOUNT_ID}] 🚀 Launching stealth browser...\`);

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
    console.log(\`[\${ACCOUNT_ID}] ✅ Browser ready\`);

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
      const screenshotPath = path.join(ARTIFACTS_DIR, \`scrape_success_\${Date.now()}.png\`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: false
      });
      console.log(\`[\${ACCOUNT_ID}] 📸 Screenshot saved\`);
    } catch (screenshotError) {
      console.log(\`[\${ACCOUNT_ID}] ⚠️ Screenshot warning: \${screenshotError.message}\`);
    }

    // Print summary
    console.log(\`\\n[\${ACCOUNT_ID}] ═══════════════════════════════════════\`);
    console.log(\`[\${ACCOUNT_ID}]   SCRAPING COMPLETED\`);
    console.log(\`[\${ACCOUNT_ID}] ═══════════════════════════════════════\`);
    console.log(\`[\${ACCOUNT_ID}] 📊 Results:\`);
    console.log(\`[\${ACCOUNT_ID}]    • Total scraped: \${results.totalScraped}\`);
    console.log(\`[\${ACCOUNT_ID}]    • New URLs: \${results.newUrlsCount}\`);
    console.log(\`[\${ACCOUNT_ID}]    • Duplicates: \${results.duplicatesCount}\`);
    console.log(\`[\${ACCOUNT_ID}]    • Total stored: \${stats.total}\`);
    console.log(\`[\${ACCOUNT_ID}] ═══════════════════════════════════════\\n\`);

    // Send success notification
    const successDetails = \`Scraped: \${results.totalScraped}, New: \${results.newUrlsCount}, Total: \${stats.total}\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

  } catch (error) {
    console.error(\`\\n[\${ACCOUNT_ID}] ❌ ERROR: \${error.message}\`);
    console.error(\`[\${ACCOUNT_ID}] Stack: \${error.stack}\`);

    // Take error screenshot
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const page = pages[0];
          const errorScreenshot = path.join(ARTIFACTS_DIR, \`scrape_error_\${Date.now()}.png\`);
          await page.screenshot({
            path: errorScreenshot,
            fullPage: true
          });
          console.log(\`[\${ACCOUNT_ID}] 📸 Error screenshot: \${errorScreenshot}\`);
        }
      } catch (screenshotError) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Could not capture error screenshot\`);
      }
    }

    // Send error notification
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(\`[\${ACCOUNT_ID}] 🔒 Browser closed\`);
      } catch (closeError) {
        console.log(\`[\${ACCOUNT_ID}] ⚠️ Browser close warning: \${closeError.message}\`);
      }
    }
  }
}

// ========================================
// GRACEFUL SHUTDOWN
// ========================================
process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] 🛑 Bot stopped by user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] 🛑 Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] ❌ Unhandled Rejection:\`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] ❌ Uncaught Exception:\`, error);
  process.exit(1);
});

// Start the bot
main();
`,
            "viewstory": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

const notify = require('./notify');

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  config = require(configPath);
  console.log(\`[\${ACCOUNT_ID}] ✓ Config loaded from: \${configPath}\`);
} catch (e) {
  console.log(\`[\${ACCOUNT_ID}] ⚠️ Config file not found (\${e.message}), using default config\`);
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
      console.log(\`[\${ACCOUNT_ID}] Attempt \${attempt} failed: \${error.message}\`);

      if (attempt === maxRetries) {
        throw error;
      }

      const delayTime = baseDelay * Math.pow(2, attempt - 1);
      console.log(\`[\${ACCOUNT_ID}] Retrying in \${delayTime}ms...\`);
      await delay(delayTime);
    }
  }
}

// ========================================
// LIKE STORY FUNCTION (Click on canvas)
// ========================================

async function likeStory(page) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Trying to like story...\`);

    // Based on recording: Click on canvas element (bottom left area for like)
    const canvas = await page.$('div.x4k7w5x canvas');

    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        // Click on left side of canvas (like button area) - from recording offset
        const clickX = box.x + 28;
        const clickY = box.y + box.height - 21;

        await page.mouse.click(clickX, clickY);
        console.log(\`[\${ACCOUNT_ID}] -> Story liked via canvas click\`);
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
            console.log(\`[\${ACCOUNT_ID}] -> Story liked successfully\`);
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
      console.log(\`[\${ACCOUNT_ID}] -> Like button not found or already liked\`);
    }

    await delay(800);

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to like: \${error.message}\`);
  }
}

// ========================================
// NEXT STORY IN SAME SET (Arrow button)
// ========================================

async function clickNextInSet(page) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Clicking next story in set...\`);

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
            console.log(\`[\${ACCOUNT_ID}] -> Clicked next arrow\`);
            await delay(2000);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    console.log(\`[\${ACCOUNT_ID}] -> Next arrow not found\`);
    return false;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to click next: \${error.message}\`);
    return false;
  }
}

// ========================================
// CLICK NEXT STORY CARD (Different person)
// ========================================

async function clickNextStoryCard(page, currentIndex = 0) {
  try {
    console.log(\`[\${ACCOUNT_ID}] -> Looking for next story card...\`);

    // Try multiple selector strategies
    const nextCardClicked = await page.evaluate((index) => {
      // Strategy 1: Using the original working selector
      let storyCards = document.querySelectorAll('div.x1rg5ohu span > span');

      console.log(\`Strategy 1: Found \${storyCards.length} story cards (x1rg5ohu)\`);

      if (storyCards.length > 0) {
        for (let i = index; i < storyCards.length; i++) {
          const card = storyCards[i];
          if (card && card.offsetParent !== null) {
            card.click();
            console.log(\`Clicked story card at index \${i} (Strategy 1)\`);
            return i + 1;
          }
        }
      }

      // Strategy 2: Try x1iyjqo2 pattern from recording
      storyCards = document.querySelectorAll('div.x1iyjqo2');

      console.log(\`Strategy 2: Found \${storyCards.length} story cards (x1iyjqo2)\`);

      for (let i = index; i < storyCards.length; i++) {
        const card = storyCards[i];

        // Look for the clickable span inside
        const clickableSpan = card.querySelector('div > div > div:nth-of-type(2) > span');

        if (clickableSpan && clickableSpan.offsetParent !== null) {
          clickableSpan.click();
          console.log(\`Clicked story card at index \${i} (Strategy 2)\`);
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
        console.log(\`Strategy 3 (\${selector}): Found \${storyCards.length} cards\`);

        if (storyCards.length > index) {
          for (let i = index; i < storyCards.length; i++) {
            if (storyCards[i] && storyCards[i].offsetParent !== null) {
              storyCards[i].click();
              console.log(\`Clicked story card at index \${i} (Strategy 3)\`);
              return i + 1;
            }
          }
        }
      }

      return -1; // Not found
    }, currentIndex);

    if (nextCardClicked > 0) {
      console.log(\`[\${ACCOUNT_ID}] -> Opened next story set (index: \${nextCardClicked})\`);
      await delay(3000);
      return nextCardClicked;
    }

    console.log(\`[\${ACCOUNT_ID}] -> No more story cards available\`);
    return -1;

  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Failed to click next card: \${error.message}\`);
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
      throw new Error(\`[\${ACCOUNT_ID}] cookies.json not found!\`);
    }
    throw new Error(\`[\${ACCOUNT_ID}] Failed to load cookies: \${error.message}\`);
  }
}

async function loadLog() {
  try {
    const data = await fs.readFile(LOG_PATH, "utf8");
    return new Set(data.split("\\n").filter(line => line.trim() !== ""));
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
}

async function appendToLog(storyId) {
  await fs.appendFile(LOG_PATH, \`\${storyId}\\n\`);
}

// ========================================
// ENHANCED NAVIGATION
// ========================================

async function navigateToUrlSafely(page, url, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const timeout = options.timeout || 90000;

  console.log(\`[\${ACCOUNT_ID}] Navigating to: \${url}\`);

  return await retryOperation(async () => {
    try {
      await page.goto('about:blank');
      await delay(1000);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeout
      });

      console.log(\`[\${ACCOUNT_ID}] Page loaded successfully: \${url}\`);

    } catch (error) {
      console.error(\`[\${ACCOUNT_ID}] Navigation failed: \${error.message}\`);

      if (error.message.includes('timeout')) {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: timeout
        });
        console.log(\`[\${ACCOUNT_ID}] Navigation successful with simple strategy\`);
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
    console.log(\`[\${ACCOUNT_ID}] -> Watching story for \${duration / 1000}s...\`);
    await delay(duration);
    console.log(\`[\${ACCOUNT_ID}] -> Story watched\`);
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] -> Error watching story: \${error.message}\`);
  }
}

// ========================================
// MAIN FUNCTION
// ========================================

async function main() {
  let browser;

  try {
    console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto View Story ===\`);
    console.log(\`[\${ACCOUNT_ID}] Auto-like enabled: \${config.autoLike !== false ? 'Yes' : 'No'}\`);
    console.log(\`[\${ACCOUNT_ID}] Watch duration: \${config.watchDuration / 1000}s per story\`);
    console.log(\`[\${ACCOUNT_ID}] Stories per set: \${config.storiesPerSet || 5}\`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const targetURL = config.targetURL || "https://www.facebook.com/stories";
    console.log(\`[\${ACCOUNT_ID}] 🎯 Target: \${targetURL}\`);

    console.log(\`[\${ACCOUNT_ID}] Launching browser...\`);

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

    console.log(\`[\${ACCOUNT_ID}] Loading cookies...\`);
    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(\`[\${ACCOUNT_ID}] \${cookies.length} cookies loaded\`);

    console.log(\`[\${ACCOUNT_ID}] Navigating to Stories...\`);
    await navigateToUrlSafely(page, targetURL, {
      maxRetries: 3,
      timeout: 90000
    });

    // Wait for stories to load
    console.log(\`[\${ACCOUNT_ID}] Waiting for stories to load (8s)...\`);
    await delay(8000);

    // Check if there are stories available
    const storiesAvailable = await page.evaluate(() => {
      // Try multiple selectors to detect stories
      const selector1 = document.querySelectorAll('div.x1rg5ohu span > span');
      const selector2 = document.querySelectorAll('div.x1iyjqo2');
      const selector3 = document.querySelectorAll('div[role="button"][aria-label*="story" i]');

      console.log(\`Story detection: x1rg5ohu=\${selector1.length}, x1iyjqo2=\${selector2.length}, aria-label=\${selector3.length}\`);

      return selector1.length > 0 || selector2.length > 0 || selector3.length > 0;
    });

    if (!storiesAvailable) {
      console.log(\`[\${ACCOUNT_ID}] No stories found on the page\`);
      throw new Error("No stories available to view");
    }

    console.log(\`[\${ACCOUNT_ID}] Stories detected, ready to start viewing\`);

    const log = await loadLog();
    let storiesViewed = 0;
    let currentStoryCardIndex = 0;
    const storiesPerSet = config.storiesPerSet || 5;

    console.log(\`[\${ACCOUNT_ID}] Target: \${config.storiesToView} stories\`);

    // Main loop: iterate through story cards (different people)
    while (storiesViewed < config.storiesToView) {

      // Open story card
      console.log(\`[\${ACCOUNT_ID}]\\n=== Opening story set #\${currentStoryCardIndex + 1} ===\`);

      const cardIndex = await clickNextStoryCard(page, currentStoryCardIndex);

      if (cardIndex < 0) {
        console.log(\`[\${ACCOUNT_ID}] No more story cards available\`);
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
            const storyIdMatch = url.match(/story_fbid=(\\d+)/);

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
              id: \`story_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`,
              url: url
            };
          });

          console.log(\`[\${ACCOUNT_ID}] -> Story \${storiesInSet + 1}/\${storiesPerSet} in set | Total: \${storiesViewed + 1}/\${config.storiesToView}\`);
          console.log(\`[\${ACCOUNT_ID}] -> ID: \${storyInfo.id.substring(0, 30)}...\`);

          // Check if already viewed
          if (log.has(storyInfo.id)) {
            console.log(\`[\${ACCOUNT_ID}] -> Already viewed, skipping...\`);

            // Try to move to next in set
            const hasNext = await clickNextInSet(page);
            if (!hasNext) {
              console.log(\`[\${ACCOUNT_ID}] -> No more stories in this set\`);
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

          console.log(\`[\${ACCOUNT_ID}] -> ✓ Story viewed and logged\`);

          // If not the last story, wait and move to next in set
          if (storiesInSet < storiesPerSet && storiesViewed < config.storiesToView) {
            const interval = getRandomInterval();
            console.log(\`[\${ACCOUNT_ID}] Waiting \${interval / 1000}s...\`);
            await delay(interval);

            // Click next arrow to go to next story in same set
            const hasNext = await clickNextInSet(page);

            if (!hasNext) {
              console.log(\`[\${ACCOUNT_ID}] -> No more stories in this set (reached end)\`);
              break;
            }
          }

        } catch (error) {
          console.error(\`[\${ACCOUNT_ID}] -> Error in story: \${error.message}\`);

          // Try to continue to next story in set
          try {
            const hasNext = await clickNextInSet(page);
            if (!hasNext) break;
          } catch (e) {
            break;
          }
        }
      }

      console.log(\`[\${ACCOUNT_ID}] -> Finished viewing \${storiesInSet} stories in this set\`);

      // If we haven't reached target, wait before opening next story card
      if (storiesViewed < config.storiesToView) {
        const interval = getRandomInterval();
        console.log(\`[\${ACCOUNT_ID}] Waiting \${interval / 1000}s before next story set...\`);
        await delay(interval);

        // Close current viewer by pressing Escape
        try {
          await page.keyboard.press('Escape');
          await delay(2000);
        } catch (e) {
          console.log(\`[\${ACCOUNT_ID}] Could not close viewer, continuing...\`);
        }
      }
    }

    console.log(\`[\${ACCOUNT_ID}] === COMPLETE ===\`);
    const successDetails = \`Total stories viewed: \${storiesViewed}/\${config.storiesToView}\`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);
    console.log(\`[\${ACCOUNT_ID}] \${successDetails}\`);

  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] Fatal error:\`, error.message);

    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        const errorScreenshot = path.join(ARTIFACTS_DIR, \`error_\${Date.now()}.png\`);
        await page.screenshot({
          path: errorScreenshot,
          fullPage: false
        });
        console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${errorScreenshot}\`);

        await notify.error(ACCOUNT_ID, BOT_NAME, error.message, errorScreenshot);
      } catch (e) {
        console.error(\`[\${ACCOUNT_ID}] Screenshot failed\`);
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
        console.log(\`[\${ACCOUNT_ID}] Browser closed\`);

        await delay(3000);

      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Cleanup error: \${e.message}\`);
      }
    }
  }
}

process.on('SIGINT', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Bot stopped by user\`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(\`\\n[\${ACCOUNT_ID}] Received SIGTERM, shutting down...\`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(\`[\${ACCOUNT_ID}] Unhandled Rejection:\`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(\`[\${ACCOUNT_ID}] Uncaught Exception:\`, error);
  process.exit(1);
});

main();
`,
            "reply": `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
// reply.js - FIXED VERSION dengan Memory & Self-Reply Filter

const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Import AI comment generator module
const { generateAiComment, typeCommentSafely, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
// ACCOUNT_ID override
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
// BOT_NAME override

console.log(\`[DEBUG] Environment - ACCOUNT_ID: \${ACCOUNT_ID}, ACCOUNTS_DIR, ACCOUNT_ID: \${ACCOUNTS_DIR, ACCOUNT_ID}, BOT_NAME: \${BOT_NAME}\`);

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", \`\${BOT_NAME}.json\`);
  config = require(configPath);
} catch (e) {
  console.log(\`[DEBUG] Could not load specific config, using defaults: \${e.message}\`);
  config = {
    headless: "new",
    maxReplies: 10,
    minIntervalSeconds: 30,
    maxIntervalSeconds: 120,
    ai_replies: {
      enabled: false,
      use_openrouter: true,
      url_shortener_enabled: false,
      gemini_prompt: "Balas komentar ini dengan friendly dan natural. Komentar: '{COMMENT_TEXT}'. Buatlah balasan yang singkat, ramah, dan relevan dalam 1-2 kalimat. Gunakan bahasa Indonesia yang santai.",
      typing_delay_after_click: 3000
    },
    static_replies: [
      "Terima kasih komentar nya!",
      "Setuju banget!",
      "Thanks udah komen!",
      "Betul sekali!"
    ],
    skip_keywords: [
      "spam", "promo", "jual", "beli", "iklan", "follow back"
    ]
  };
}

// Paths
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const LOG_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "auto_reply_log.txt");
const REPLIED_COMMENTS_PATH = path.join(__dirname, "../accounts", ACCOUNT_ID, "replied_comments.json"); // NEW: Memory file

const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// NEW: Load replied comments history
async function loadRepliedComments() {
  try {
    const data = await fs.readFile(REPLIED_COMMENTS_PATH, "utf8");
    const history = JSON.parse(data);
    console.log(\`[\${ACCOUNT_ID}] Loaded \${Object.keys(history).length} replied comments from memory\`);
    return history;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] No reply history found, starting fresh\`);
      return {};
    }
    console.log(\`[\${ACCOUNT_ID}] Error loading reply history: \${error.message}\`);
    return {};
  }
}

// NEW: Save replied comment to memory
async function saveRepliedComment(commentHash, commentData) {
  try {
    let history = {};
    try {
      const data = await fs.readFile(REPLIED_COMMENTS_PATH, "utf8");
      history = JSON.parse(data);
    } catch (e) {
      // File doesn't exist yet
    }
    
    history[commentHash] = {
      text: commentData.text.substring(0, 100),
      repliedAt: new Date().toISOString(),
      postUrl: commentData.postUrl || 'unknown'
    };
    
    // Keep only last 1000 entries to prevent file from growing too large
    const entries = Object.entries(history);
    if (entries.length > 1000) {
      // Sort by date and keep newest 1000
      entries.sort((a, b) => new Date(b[1].repliedAt) - new Date(a[1].repliedAt));
      history = Object.fromEntries(entries.slice(0, 1000));
    }
    
    await fs.writeFile(REPLIED_COMMENTS_PATH, JSON.stringify(history, null, 2));
    console.log(\`[\${ACCOUNT_ID}] Saved reply to memory: \${commentHash}\`);
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] Error saving to memory: \${error.message}\`);
  }
}

// NEW: Generate hash for comment (for deduplication)
function generateCommentHash(commentText, postUrl) {
  const crypto = require('crypto');
  const content = \`\${commentText.substring(0, 100)}_\${postUrl}\`;
  return crypto.createHash('md5').update(content).digest('hex');
}

// NEW: Get account name from Facebook - UPDATED with priority selector
async function getAccountName(page) {
  try {
    const accountName = await page.evaluate(() => {
      // PRIMARY SELECTOR (highest priority)
      const primarySelector = 'span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6';
      const primaryElement = document.querySelector(primarySelector);
      
      if (primaryElement && primaryElement.textContent) {
        const text = primaryElement.textContent.trim();
        if (text.length > 0 && text.length < 100) {
          console.log(\`Account name from primary selector: \${text}\`);
          return text;
        }
      }
      
      // FALLBACK SELECTORS (if primary fails)
      const fallbackSelectors = [
        // Generic span with styles
        'span.x1lliihq',
        'span.x193iq5w',
        'span.x6ikm8r',

        // Profile menu selectors
        'a[href*="/me"] span',
        'div[aria-label*="Profil"] span',
        'a[aria-label*="Profil"] span',
        
        // Header selectors
        'span[dir="auto"]',
        'div[role="navigation"] span',
        
        // Account switcher selectors
        'div[aria-label*="Akun"] span',
        'div[data-visualcompletion="ignore-dynamic"] span'
      ];
      
      for (const selector of fallbackSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          console.log(\`Trying fallback selector "\${selector}": found \${elements.length} elements\`);
          
          for (const element of elements) {
            const text = element.textContent.trim();
            
            // Validate text
            if (text.length > 0 && text.length < 100) {
              // Skip if it's a menu item or button text
              const lowerText = text.toLowerCase();
              if (lowerText.includes('home') ||
                  lowerText.includes('beranda') ||
                  lowerText.includes('watch') ||
                  lowerText.includes('marketplace') ||
                  lowerText.includes('groups') ||
                  lowerText.includes('gaming') ||
                  lowerText.includes('settings') ||
                  lowerText.includes('pengaturan') ||
                  lowerText.includes('log out') ||
                  lowerText.includes('keluar') ||
                  lowerText.includes('menu') ||
                  lowerText.includes('notification') ||
                  lowerText.includes('notifikasi')) {
                continue;
              }
              
              // Check if it looks like a name (has at least 2 words or is > 3 chars)
              const words = text.split(' ');
              if (words.length >= 2 || text.length > 3) {
                console.log(\`Account name from fallback "\${selector}": \${text}\`);
                return text;
              }
            }
          }
        } catch (e) {
          console.log(\`Fallback selector error: \${e.message}\`);
          continue;
        }
      }
      
      // LAST RESORT: Extract from page title
      const title = document.title;
      if (title) {
        // Facebook title format: "(2) Name | Facebook" or "Name | Facebook"
        const patterns = [
          /\\(\\d+\\)\\s+(.+?)\\s+\\|/,  // Match: (2) Account Name | Facebook
          /^(.+?)\\s+\\|/,            // Match: Account Name | Facebook
          /^(.+?)\\s+-\\s+Facebook/   // Match: Account Name - Facebook
        ];
        
        for (const pattern of patterns) {
          const match = title.match(pattern);
          if (match && match[1]) {
            const name = match[1].trim();
            if (name.length > 0 && name.length < 100) {
              console.log(\`Account name from page title: \${name}\`);
              return name;
            }
          }
        }
      }
      
      console.log('Could not detect account name from any source');
      return null;
    });
    
    if (accountName) {
      console.log(\`[\${ACCOUNT_ID}] ✅ Account name detected: \${accountName}\`);
      return accountName;
    }
    
    console.log(\`[\${ACCOUNT_ID}] ⚠️ Could not detect account name\`);
    return null;
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] ❌ Error detecting account name: \${error.message}\`);
    return null;
  }
}

// UPDATED: More robust self-comment detection
async function shouldSkipComment(commentText, accountName) {
  const skipKeywords = config.skip_keywords || [];
  const lowerComment = commentText.toLowerCase();
  
  // Check skip keywords
  for (const keyword of skipKeywords) {
    if (lowerComment.includes(keyword.toLowerCase())) {
      console.log(\`[\${ACCOUNT_ID}] ⏭️ Skipping comment containing keyword: \${keyword}\`);
      return true;
    }
  }
  
  // Check if too short
  if (commentText.trim().length < 3) {
    console.log(\`[\${ACCOUNT_ID}] ⏭️ Skipping too short comment\`);
    return true;
  }
  
  // NEW: Enhanced self-comment detection
  if (accountName) {
    const accountNameLower = accountName.toLowerCase();
    const commentLower = commentText.toLowerCase();
    
    // Method 1: Check if comment starts with our name
    if (commentLower.startsWith(accountNameLower)) {
      console.log(\`[\${ACCOUNT_ID}] ⏭️ Skipping own comment (starts with: \${accountName})\`);
      return true;
    }
    
    // Method 2: Check first 3 words contain our name
    const commentWords = commentText.split(' ');
    const firstThreeWords = commentWords.slice(0, 3).join(' ').toLowerCase();
    
    if (firstThreeWords.includes(accountNameLower)) {
      console.log(\`[\${ACCOUNT_ID}] ⏭️ Skipping own comment (name in first 3 words: \${accountName})\`);
      return true;
    }
    
    // Method 3: Check if our name appears at the beginning (with tolerance for slight variations)
    // Example: "Account Name ok kk" vs "account name ok kk"
    const accountNameWords = accountName.toLowerCase().split(' ');
    const matchCount = accountNameWords.filter(word => 
      commentWords.slice(0, accountNameWords.length).some(cw => 
        cw.toLowerCase().includes(word) || word.includes(cw.toLowerCase())
      )
    ).length;
    
    // If more than half of our name words match in the beginning, it's probably our comment
    if (matchCount >= Math.ceil(accountNameWords.length / 2)) {
      console.log(\`[\${ACCOUNT_ID}] ⏭️ Skipping own comment (name match: \${matchCount}/\${accountNameWords.length} words)\`);
      return true;
    }
    
    // Method 4: Check exact match anywhere in first 50 characters
    const first50Chars = commentText.substring(0, 50).toLowerCase();
    if (first50Chars.includes(accountNameLower)) {
      console.log(\`[\${ACCOUNT_ID}] ⏭️ Skipping own comment (exact name in first 50 chars)\`);
      return true;
    }
  }
  
  return false;
}

// UPDATED: Enhanced comment detection with self-filter
async function goToPostAndFindComments(page, postUrl, repliedComments, accountName) {
  console.log(\`[\${ACCOUNT_ID}] Going to post: \${postUrl}\`);
  
  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await delay(5000);

    console.log(\`[\${ACCOUNT_ID}] Loading comments...\`);
    
    // Expand comments
    try {
      const expandClicked = await page.evaluate(() => {
        let clickCount = 0;
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const el of allElements) {
          try {
            const text = el.textContent || '';
            if ((el.tagName === 'SPAN' || el.tagName === 'DIV') && 
                (text.includes('View more comments') || 
                 text.includes('Lihat komentar lainnya') ||
                 text.includes('more comments') ||
                 text.includes('lebih banyak'))) {
              el.click();
              clickCount++;
              if (clickCount >= 3) break;
            }
          } catch (e) {
            continue;
          }
        }
        return clickCount;
      });
      
      if (expandClicked > 0) {
        console.log(\`[\${ACCOUNT_ID}] Clicked \${expandClicked} expand buttons\`);
        await delay(3000);
      } else {
        console.log(\`[\${ACCOUNT_ID}] No expand buttons found\`);
      }
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] Could not expand comments: \${e.message}\`);
    }

    // Scroll
    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(2000);
      } catch (e) {
        break;
      }
    }

    // UPDATED: Enhanced comment detection with self-filter
    const comments = await page.evaluate((postUrl, accountName) => {
      try { 
        const commentElements = [];
        console.log("Starting comment detection...");
        console.log(\`Account name for filtering: \${accountName || 'Not detected'}\`);
        
        // Strategy: Cari tombol "Balas" dulu, baru ambil text comment-nya
        const replyButtons = document.querySelectorAll(
          '[aria-label*="Balas"], [aria-label*="Reply"], ' +
          '[role="button"][aria-label*="sebagai"]'
        );
        
        console.log(\`Found \${replyButtons.length} reply buttons\`);
        
        for (const replyBtn of replyButtons) {
          try {
            const ariaLabel = replyBtn.getAttribute('aria-label') || '';
            
            // Skip jika bukan tombol balas comment
            if (!ariaLabel.toLowerCase().includes('balas') && 
                !ariaLabel.toLowerCase().includes('reply')) {
              continue;
            }
            
            // Cari comment text di sekitar tombol ini
            let commentElement = replyBtn;
            let commentText = '';
            let commentAuthor = ''; // NEW: Track comment author
            let attempts = 0;
            
            // Traverse ke parent untuk cari comment text
            while (commentElement && attempts < 8) {
              // PRIMARY: Cari nama dengan selector prioritas
              if (!commentAuthor) {
                const authorSpan = commentElement.querySelector('span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6');
                if (authorSpan && authorSpan.textContent) {
                  commentAuthor = authorSpan.textContent.trim();
                  console.log(\`Found comment author: \${commentAuthor}\`);
                }
              }
              
              // Cari div dengan dir="auto" yang kemungkinan berisi comment
              const textDivs = commentElement.querySelectorAll('div[dir="auto"]');
              
              for (const textDiv of textDivs) {
                const text = (textDiv.textContent || '').trim();
                
                if (text.length >= 5 && text.length <= 1000) {
                  // Skip jika ini menu text atau button text
                  if (text.toLowerCase().includes('write a comment') ||
                      text.toLowerCase().includes('tulis komentar') ||
                      text.toLowerCase().includes('like') ||
                      text.toLowerCase().includes('share') ||
                      text.toLowerCase().includes('comment') && text.length < 50 ||
                      text.toLowerCase().includes('balas') && text.length < 50) {
                    continue;
                  }
                  
                  // Ambil comment text terpanjang yang valid
                  if (text.length > commentText.length) {
                    commentText = text;
                  }
                }
              }
              
              commentElement = commentElement.parentElement;
              attempts++;
            }
            
            if (commentText && commentText.length >= 5) {
              // NEW: Filter by comment author (if detected)
              if (accountName && commentAuthor) {
                const authorLower = commentAuthor.toLowerCase();
                const accountLower = accountName.toLowerCase();
                
                if (authorLower === accountLower || 
                    authorLower.includes(accountLower) || 
                    accountLower.includes(authorLower)) {
                  console.log(\`Skipping own comment by author: "\${commentAuthor}"\`);
                  continue;
                }
              }
              
              // Filter by comment text (starts with our name)
              if (accountName) {
                const commentLower = commentText.toLowerCase();
                const accountLower = accountName.toLowerCase();
                
                if (commentLower.startsWith(accountLower)) {
                  console.log(\`Skipping own comment (starts with name): "\${commentText.substring(0, 30)}"\`);
                  continue;
                }
              }
              
              // Verifikasi ini bukan caption (caption biasanya di bagian atas)
              const rect = replyBtn.getBoundingClientRect();
              const isNotCaption = rect.top > 300; // Caption biasanya di top
              
              if (isNotCaption) {
                // Cek duplikat
                const isDuplicate = commentElements.some(item => 
                  item.text === commentText || 
                  item.text.substring(0, 50) === commentText.substring(0, 50)
                );
                
                if (!isDuplicate) {
                  console.log(\`Adding comment: "\${commentText.substring(0, 50)}..." (Author: \${commentAuthor || 'Unknown'})\`);
                  commentElements.push({
                    text: commentText,
                    preview: commentText.substring(0, 100),
                    ariaLabel: ariaLabel,
                    postUrl: postUrl,
                    author: commentAuthor || 'Unknown'
                  });
                }
              } else {
                console.log(\`Skipping caption at top: "\${commentText.substring(0, 30)}..."\`);
              }
            }
          } catch (e) {
            console.log(\`Error processing reply button: \${e.message}\`);
            continue;
          }
        }

        console.log(\`Found \${commentElements.length} valid comments (after self-filter)\`);
        return commentElements.slice(0, 5);
      
      } catch (e) {
        console.error("FATAL ERROR:", e.message);
        return [];
      }
    }, postUrl, accountName);

    // Filter out already replied comments
    const newComments = [];
    for (const comment of comments) {
      const hash = generateCommentHash(comment.text, postUrl);
      
      if (repliedComments[hash]) {
        console.log(\`[\${ACCOUNT_ID}] ⏭️ Skipping already replied comment: "\${comment.text.substring(0, 50)}..."\`);
        console.log(\`[\${ACCOUNT_ID}] 📅 Previously replied at: \${repliedComments[hash].repliedAt}\`);
        continue;
      }
      
      newComments.push(comment);
    }

    console.log(\`[\${ACCOUNT_ID}] 📊 Found \${comments.length} total comments, \${newComments.length} new (not replied yet)\`);
    
    if (newComments.length > 0) {
      newComments.forEach((c, i) => {
        console.log(\`[\${ACCOUNT_ID}] 💬 New Comment \${i+1} by \${c.author}: \${c.preview}...\`);
      });
    } else {
      console.log(\`[\${ACCOUNT_ID}] ℹ️ No new comments to reply to\`);
      
      try {
        if (!fsSync.existsSync(ARTIFACTS_DIR)) {
          await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
        }
        const screenshot = path.join(ARTIFACTS_DIR, \`debug_post_\${Date.now()}.png\`);
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log(\`[\${ACCOUNT_ID}] Debug screenshot: \${screenshot}\`);
      } catch (e) {
        // Continue
      }
    }
    
    return newComments;
    
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] Error loading post: \${error.message}\`);
    return [];
  }
}

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
      sameSite: cookie.sameSite || 'Lax'
    }));
  } catch (error) {
    throw new Error(\`[\${ACCOUNT_ID}] Gagal load cookies: \${error.message}\`);
  }
}

async function loadGeminiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\\n").map(k => k.trim()).filter(k => k.startsWith("AIzaSy"));
    if (keys.length === 0 && config.ai_replies?.enabled) {
      console.log(\`[\${ACCOUNT_ID}] Warning: Tidak ada API key Gemini, fallback ke balasan statis.\`);
      return [];
    }
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(\`[\${ACCOUNT_ID}] Info: File gemini_keys.txt tidak ditemukan.\`);
      return [];
    }
    return [];
  }
}

// UPDATED: Add self-comment detection
async function shouldSkipComment(commentText, accountName) {
  const skipKeywords = config.skip_keywords || [];
  const lowerComment = commentText.toLowerCase();
  
  // Check skip keywords
  for (const keyword of skipKeywords) {
    if (lowerComment.includes(keyword.toLowerCase())) {
      console.log(\`[\${ACCOUNT_ID}] Skipping comment containing keyword: \${keyword}\`);
      return true;
    }
  }
  
  // Check if too short
  if (commentText.trim().length < 3) {
    console.log(\`[\${ACCOUNT_ID}] Skipping too short comment\`);
    return true;
  }
  
  // NEW: Check if this is our own comment
  if (accountName) {
    // Extract name from comment (usually starts with name)
    const commentWords = commentText.split(' ');
    const firstWords = commentWords.slice(0, 3).join(' ').toLowerCase();
    
    if (firstWords.includes(accountName.toLowerCase())) {
      console.log(\`[\${ACCOUNT_ID}] Skipping own comment (contains our name: \${accountName})\`);
      return true;
    }
    
    // Check if comment starts with our name
    if (commentText.toLowerCase().startsWith(accountName.toLowerCase())) {
      console.log(\`[\${ACCOUNT_ID}] Skipping own comment (starts with our name)\`);
      return true;
    }
  }
  
  return false;
}

async function getNotifications(page) {
  console.log(\`[\${ACCOUNT_ID}] Checking notifications...\`);
  
  await page.goto('https://www.facebook.com/notifications', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await delay(5000);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
  }

  const notifications = await page.evaluate(() => {
    const notificationItems = [];
    console.log("Starting notification detection...");
    
    const notificationSelectors = [
      'div[role="article"]',
      'div[data-pagelet*="notification"]',
      'div[data-testid*="notification"]',
      'div[data-pressable-container="true"]',
      'div[tabindex="0"]',
      'div.xwib8y2',
      'div.x1n2onr6 > div',
      'div.x78zum5 > div'
    ];

    let allElements = new Set();
    
    notificationSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        console.log(\`Selector "\${selector}" found \${elements.length} elements\`);
        
        elements.forEach(el => {
          const text = el.textContent || '';
          if (text.length > 20 && text.length < 500) {
            allElements.add(el);
          }
        });
      } catch (e) {
        console.log(\`Selector error: \${e.message}\`);
      }
    });

    console.log(\`Total potential elements: \${allElements.size}\`);

    for (const element of allElements) {
      try {
        const originalText = element.textContent || '';
        const text = originalText.toLowerCase();
        
        if (text.includes('notifikasi semua') || 
            text.includes('belum dibaca notifikasi otomatis') ||
            text.includes('aktifkan notifikasi') ||
            text.length > 300) {
          continue;
        }
        
        const commentKeywords = [
          'commented', 'berkomentar', 'mengomentari', 'comment',
          'replied', 'membalas', 'replied to', 'balas',
        ];
        
        const mentionKeywords = [
          'mentioned', 'menyebut', 'menyebutkan', 'mention',
        ];
        
        const hasCommentKeyword = commentKeywords.some(keyword => text.includes(keyword));
        const hasMentionKeyword = mentionKeywords.some(keyword => text.includes(keyword));
        
        const hasTimeIndicator = /\\d+\\s*(min|hour|day|jam|hari|menit)\\s*(ago|lalu|yang lalu)?/i.test(text);
        const hasPersonName = /[A-Za-z\\s]{2,30}\\s+(commented|mentioned|replied|berkomentar|menyebut)/i.test(text);
        
        if ((hasCommentKeyword && hasMentionKeyword) || 
            (hasCommentKeyword && hasTimeIndicator) ||
            (hasPersonName && hasMentionKeyword)) {
          
          const links = element.querySelectorAll('a[href*="facebook.com"]');
          let bestLink = null;
          
          for (const link of links) {
            const href = link.href;
            
            if ((href.includes('/posts/') || 
                 href.includes('/photo') || 
                 href.includes('/videos/') || 
                 href.includes('comment_id=') ||
                 href.includes('/permalink/') ||
                 href.includes('story_fbid=') ||
                 href.includes('/groups/')) &&
                !href.includes('/notifications') && 
                !href.includes('/settings/') &&
                !href.includes('/marketplace/') &&
                href !== 'https://www.facebook.com/') {
              bestLink = href;
              break;
            }
          }
          
          if (bestLink) {
            const isDuplicate = notificationItems.some(item => 
              item.link === bestLink || 
              item.text.substring(0, 50) === originalText.substring(0, 50)
            );
            
            if (!isDuplicate) {
              console.log(\`Adding notification: "\${originalText.substring(0, 50)}..."\`);
              notificationItems.push({
                text: originalText.trim(),
                link: bestLink
              });
            }
          }
        }
      } catch (e) {
        console.log(\`Error processing element: \${e.message}\`);
        continue;
      }
    }

    console.log(\`Found \${notificationItems.length} valid notifications\`);
    return notificationItems.slice(0, 10);
  });

  console.log(\`[\${ACCOUNT_ID}] Found \${notifications.length} potential comment notifications\`);
  
  if (notifications.length > 0) {
    notifications.forEach((notif, index) => {
      console.log(\`[\${ACCOUNT_ID}] Notification \${index + 1}:\`);
      console.log(\`  Text: \${notif.text.substring(0, 100)}...\`);
      console.log(\`  Link: \${notif.link}\`);
    });
  } else {
    console.log(\`[\${ACCOUNT_ID}] No notifications found.\`);
    
    try {
      if (!fsSync.existsSync(ARTIFACTS_DIR)) {
        fs.mkdir(ARTIFACTS_DIR, { recursive: true });
      }
      const debugScreenshot = path.join(ARTIFACTS_DIR, \`debug_notifications_\${Date.now()}.png\`);
      await page.screenshot({ path: debugScreenshot, fullPage: true });
      console.log(\`[\${ACCOUNT_ID}] Debug screenshot saved: \${debugScreenshot}\`);
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] Could not save debug screenshot\`);
    }
  }
  
  return notifications;
}

// UPDATED: Add postUrl and repliedComments check
async function goToPostAndFindComments(page, postUrl, repliedComments, accountName) {
  console.log(\`[\${ACCOUNT_ID}] Going to post: \${postUrl}\`);
  
  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await delay(5000);

    console.log(\`[\${ACCOUNT_ID}] Loading comments...\`);
    
    // Expand comments
    try {
      const expandClicked = await page.evaluate(() => {
        let clickCount = 0;
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const el of allElements) {
          try {
            const text = el.textContent || '';
            if ((el.tagName === 'SPAN' || el.tagName === 'DIV') && 
                (text.includes('View more comments') || 
                 text.includes('Lihat komentar lainnya') ||
                 text.includes('more comments') ||
                 text.includes('lebih banyak'))) {
              el.click();
              clickCount++;
              if (clickCount >= 3) break;
            }
          } catch (e) {
            continue;
          }
        }
        return clickCount;
      });
      
      if (expandClicked > 0) {
        console.log(\`[\${ACCOUNT_ID}] Clicked \${expandClicked} expand buttons\`);
        await delay(3000);
      } else {
        console.log(\`[\${ACCOUNT_ID}] No expand buttons found\`);
      }
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] Could not expand comments: \${e.message}\`);
    }

    // Scroll
    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(2000);
      } catch (e) {
        break;
      }
    }

    // UPDATED: Find comments with memory check and self-filter
    const comments = await page.evaluate((postUrl, accountName) => {
      try { 
        const commentElements = [];
        console.log("Starting comment detection...");
        
        // Strategy: Cari tombol "Balas" dulu, baru ambil text comment-nya
        const replyButtons = document.querySelectorAll(
          '[aria-label*="Balas"], [aria-label*="Reply"], ' +
          '[role="button"][aria-label*="sebagai"]'
        );
        
        console.log(\`Found \${replyButtons.length} reply buttons\`);
        
        for (const replyBtn of replyButtons) {
          try {
            const ariaLabel = replyBtn.getAttribute('aria-label') || '';
            
            // Skip jika bukan tombol balas comment
            if (!ariaLabel.toLowerCase().includes('balas') && 
                !ariaLabel.toLowerCase().includes('reply')) {
              continue;
            }
            
            // Cari comment text di sekitar tombol ini
            let commentElement = replyBtn;
            let commentText = '';
            let attempts = 0;
            
            // Traverse ke parent untuk cari comment text
            while (commentElement && attempts < 8) {
              // Cari div dengan dir="auto" yang kemungkinan berisi comment
              const textDivs = commentElement.querySelectorAll('div[dir="auto"]');
              
              for (const textDiv of textDivs) {
                const text = (textDiv.textContent || '').trim();
                
                if (text.length >= 5 && text.length <= 1000) {
                  // Skip jika ini menu text atau button text
                  if (text.toLowerCase().includes('write a comment') ||
                      text.toLowerCase().includes('tulis komentar') ||
                      text.toLowerCase().includes('like') ||
                      text.toLowerCase().includes('share') ||
                      text.toLowerCase().includes('comment') && text.length < 50 ||
                      text.toLowerCase().includes('balas') && text.length < 50) {
                    continue;
                  }
                  
                  // NEW: Skip if comment starts with our account name
                  if (accountName && text.toLowerCase().startsWith(accountName.toLowerCase())) {
                    console.log(\`Skipping own comment: "\${text.substring(0, 30)}"\`);
                    continue;
                  }
                  
                  // Ambil comment text terpanjang yang valid
                  if (text.length > commentText.length) {
                    commentText = text;
                  }
                }
              }
              
              commentElement = commentElement.parentElement;
              attempts++;
            }
            
            if (commentText && commentText.length >= 5) {
              // Verifikasi ini bukan caption (caption biasanya di bagian atas)
              const rect = replyBtn.getBoundingClientRect();
              const isNotCaption = rect.top > 300; // Caption biasanya di top
              
              if (isNotCaption) {
                // Cek duplikat
                const isDuplicate = commentElements.some(item => 
                  item.text === commentText || 
                  item.text.substring(0, 50) === commentText.substring(0, 50)
                );
                
                if (!isDuplicate) {
                  console.log(\`Adding comment: "\${commentText.substring(0, 50)}..."\`);
                  commentElements.push({
                    text: commentText,
                    preview: commentText.substring(0, 100),
                    ariaLabel: ariaLabel,
                    postUrl: postUrl // Add postUrl for hash generation
                  });
                }
              } else {
                console.log(\`Skipping caption at top: "\${commentText.substring(0, 30)}..."\`);
              }
            }
          } catch (e) {
            console.log(\`Error processing reply button: \${e.message}\`);
            continue;
          }
        }

        console.log(\`Found \${commentElements.length} valid comments\`);
        return commentElements.slice(0, 5);
      
      } catch (e) {
        console.error("FATAL ERROR:", e.message);
        return [];
      }
    }, postUrl, accountName);

    // NEW: Filter out already replied comments
    const newComments = [];
    for (const comment of comments) {
      const hash = generateCommentHash(comment.text, postUrl);
      
      if (repliedComments[hash]) {
        console.log(\`[\${ACCOUNT_ID}] Skipping already replied comment: "\${comment.text.substring(0, 50)}..."\`);
        console.log(\`[\${ACCOUNT_ID}] Previously replied at: \${repliedComments[hash].repliedAt}\`);
        continue;
      }
      
      newComments.push(comment);
    }

    console.log(\`[\${ACCOUNT_ID}] Found \${comments.length} total comments, \${newComments.length} new (not replied yet)\`);
    
    if (newComments.length > 0) {
      newComments.forEach((c, i) => {
        console.log(\`[\${ACCOUNT_ID}] New Comment \${i+1}: \${c.preview}...\`);
      });
    } else {
      console.log(\`[\${ACCOUNT_ID}] No new comments to reply to\`);
      
      try {
        if (!fsSync.existsSync(ARTIFACTS_DIR)) {
          await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
        }
        const screenshot = path.join(ARTIFACTS_DIR, \`debug_post_\${Date.now()}.png\`);
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log(\`[\${ACCOUNT_ID}] Debug screenshot: \${screenshot}\`);
      } catch (e) {
        // Continue
      }
    }
    
    return newComments;
    
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] Error loading post: \${error.message}\`);
    return [];
  }
}

async function replyToComment(page, comment, geminiKeys, openRouterKeys, staticReplies) {
  try {
    console.log(\`[\${ACCOUNT_ID}] Replying to: "\${comment.text.substring(0, 50)}..."\`);
    
    // STEP 1: Klik tombol "Balas" - IMPROVED METHOD
    console.log(\`[\${ACCOUNT_ID}] Looking for reply button...\`);
    
    // Karena kita sudah punya ariaLabel dari deteksi comment, gunakan itu!
    let buttonClicked = await page.evaluate((commentData) => {
      try {
        console.log(\`Searching for comment: "\${commentData.text.substring(0, 30)}"\`);
        console.log(\`Expected aria-label: "\${commentData.ariaLabel}"\`);
        
        // METHOD 1: Cari menggunakan aria-label yang sudah kita simpan
        if (commentData.ariaLabel) {
          const exactButton = document.querySelector(\`[aria-label="\${commentData.ariaLabel}"]\`);
          if (exactButton) {
            exactButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            exactButton.click();
            console.log('Reply button clicked using exact aria-label!');
            return true;
          }
        }
        
        // METHOD 2: Cari semua tombol Balas, cocokkan dengan comment text
        const allReplyButtons = document.querySelectorAll(
          '[aria-label*="Balas"], [aria-label*="Reply"]'
        );
        
        console.log(\`Found \${allReplyButtons.length} reply buttons total\`);
        
        for (const btn of allReplyButtons) {
          const ariaLabel = btn.getAttribute('aria-label') || '';
          
          // Skip jika bukan tombol balas
          if (!ariaLabel.toLowerCase().includes('balas') && 
              !ariaLabel.toLowerCase().includes('reply')) {
            continue;
          }
          
          // Cari comment text di sekitar tombol ini
          let parent = btn;
          for (let i = 0; i < 8; i++) {
            if (!parent) break;
            
            const parentText = parent.textContent || '';
            
            // Cocokkan dengan comment text kita (minimal 30 karakter pertama)
            if (parentText.includes(commentData.text.substring(0, 30))) {
              console.log(\`Found matching comment near button\`);
              console.log(\`Button aria-label: "\${ariaLabel}"\`);
              
              // Scroll button into view
              btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // Klik tombol
              btn.click();
              console.log('Reply button clicked!');
              return true;
            }
            
            parent = parent.parentElement;
          }
        }
        
        // METHOD 3: Cari dengan XPath (fallback)
        const xpathResults = document.evaluate(
          "//div[@role='button' and contains(@aria-label, 'Balas')]",
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        
        console.log(\`XPath found \${xpathResults.snapshotLength} buttons\`);
        
        for (let i = 0; i < xpathResults.snapshotLength; i++) {
          const btn = xpathResults.snapshotItem(i);
          let parent = btn;
          
          for (let j = 0; j < 8; j++) {
            if (!parent) break;
            
            const parentText = parent.textContent || '';
            if (parentText.includes(commentData.text.substring(0, 30))) {
              btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              btn.click();
              console.log('Reply button clicked using XPath!');
              return true;
            }
            
            parent = parent.parentElement;
          }
        }
        
        console.log('Reply button not found with all methods');
        return false;
        
      } catch (e) {
        console.error('Error clicking reply button:', e.message);
        return false;
      }
    }, comment);
    
    if (!buttonClicked) {
      console.log(\`[\${ACCOUNT_ID}] Could not click reply button\`);
      
      // ALTERNATIVE: Coba klik menggunakan Puppeteer selector
      try {
        console.log(\`[\${ACCOUNT_ID}] Trying alternative click method...\`);
        
        // Tunggu tombol muncul
        await page.waitForSelector('[aria-label*="Balas"], [aria-label*="Reply"]', {
          timeout: 5000
        });
        
        // Coba klik semua tombol Balas sampai ketemu yang benar
        const buttons = await page.$$('[aria-label*="Balas"], [aria-label*="Reply"]');
        console.log(\`[\${ACCOUNT_ID}] Found \${buttons.length} reply buttons via Puppeteer\`);
        
        for (const btn of buttons) {
          try {
            // Get button position and text
            const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label'), btn);
            console.log(\`[\${ACCOUNT_ID}] Checking button: \${ariaLabel}\`);
            
            // Check if this button is near our comment
            const isNearComment = await page.evaluate((element, commentText) => {
              let parent = element;
              for (let i = 0; i < 8; i++) {
                if (!parent) break;
                const text = parent.textContent || '';
                if (text.includes(commentText.substring(0, 30))) {
                  return true;
                }
                parent = parent.parentElement;
              }
              return false;
            }, btn, comment.text);
            
            if (isNearComment) {
              console.log(\`[\${ACCOUNT_ID}] Found correct button, clicking...\`);
              
              // Scroll into view
              await btn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
              await delay(500);
              
              // Click
              await btn.click();
              console.log(\`[\${ACCOUNT_ID}] Alternative click successful!\`);
              buttonClicked = true;
              break;
            }
          } catch (e) {
            console.log(\`[\${ACCOUNT_ID}] Button click attempt failed: \${e.message}\`);
            continue;
          }
        }
        
        if (!buttonClicked) {
          console.log(\`[\${ACCOUNT_ID}] All alternative methods failed\`);
          
          // Debug screenshot
          const screenshot = path.join(ARTIFACTS_DIR, \`debug_reply_btn_\${Date.now()}.png\`);
          await page.screenshot({ path: screenshot, fullPage: true });
          console.log(\`[\${ACCOUNT_ID}] Debug screenshot: \${screenshot}\`);
          
          return false;
        }
        
      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Alternative method error: \${e.message}\`);
        return false;
      }
    }
    
    // STEP 2: Tunggu textarea muncul
    console.log(\`[\${ACCOUNT_ID}] Waiting for textarea...\`);
    await delay(3000);
    
    // STEP 3: Generate reply text
    let replyText;
    
    if (config.ai_replies?.enabled && (openRouterKeys.length > 0 || geminiKeys.length > 0)) {
      const aiPrompt = (config.ai_replies?.gemini_prompt || "Balas: {COMMENT_TEXT}")
        .replace('{COMMENT_TEXT}', comment.text);
      
      const result = await generateAiComment({
        caption: comment.text,
        ctaLink: "",
        prompt: aiPrompt,
        openRouterKeys: openRouterKeys,
        geminiKeys: geminiKeys,
        staticComments: staticReplies,
        geminiWorkingIndex: 0,
        accountId: ACCOUNT_ID
      });
      
      replyText = result.comment;
      console.log(\`[\${ACCOUNT_ID}] -> \${result.provider} reply\${result.model ? \` (\${result.model})\` : ''}\`);
    } else {
      replyText = staticReplies[Math.floor(Math.random() * staticReplies.length)];
      console.log(\`[\${ACCOUNT_ID}] -> Static reply\`);
    }
    
    // STEP 4: Ketik reply - MULTIPLE METHODS
    console.log(\`[\${ACCOUNT_ID}] Typing: "\${replyText}"\`);
    
    let typed = false;
    
    // METHOD 1: Cari textarea dengan aria-label
    try {
      const textareaVisible = await page.waitForSelector(
        '[aria-label*="Balas"], [aria-label*="Reply"], div[contenteditable="true"]',
        { timeout: 5000, visible: true }
      );
      
      if (textareaVisible) {
        console.log(\`[\${ACCOUNT_ID}] Textarea found, clicking...\`);
        
        // Klik textarea
        await page.click('[aria-label*="Balas sebagai"], [aria-label*="Reply as"], div[contenteditable="true"]');
        await delay(500);
        
        // Clear existing text (jika ada)
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        
        // Type text
        await page.keyboard.type(replyText, { delay: 50 });
        
        typed = true;
        console.log(\`[\${ACCOUNT_ID}] Typed successfully using Method 1\`);
      }
      
    } catch (e) {
      console.log(\`[\${ACCOUNT_ID}] Method 1 failed: \${e.message}\`);
    }
    
    // METHOD 2: Direct DOM manipulation
    if (!typed) {
      try {
        const textareaFilled = await page.evaluate((text) => {
          // Cari textarea yang visible
          const textareas = document.querySelectorAll(
            'div[contenteditable="true"], ' +
            'div.xzsf02u[contenteditable="true"], ' +
            'div[aria-label*="Balas"], ' +
            'div[aria-label*="Reply"]'
          );
          
          console.log(\`Found \${textareas.length} potential textareas\`);
          
          for (const textarea of textareas) {
            // Check if visible
            if (textarea.offsetParent === null) continue;
            
            const rect = textarea.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            
            console.log('Found visible textarea');
            
            // Focus
            textarea.click();
            textarea.focus();
            
            // Clear existing content
            textarea.innerHTML = '';
            
            // Set text - try multiple methods
            const p = textarea.querySelector('p');
            if (p) {
              p.textContent = text;
            } else {
              textarea.textContent = text;
            }
            
            // Trigger events
            textarea.dispatchEvent(new Event('focus', { bubbles: true }));
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            
            console.log('Textarea filled with DOM manipulation');
            return true;
          }
          
          return false;
        }, replyText);
        
        if (textareaFilled) {
          typed = true;
          console.log(\`[\${ACCOUNT_ID}] Typed successfully using Method 2\`);
        }
      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Method 2 failed: \${e.message}\`);
      }
    }
    
    // METHOD 3: Focus and type (fallback)
    if (!typed) {
      try {
        await page.evaluate(() => {
          const textareas = document.querySelectorAll('div[contenteditable="true"]');
          for (const textarea of textareas) {
            if (textarea.offsetParent !== null) {
              textarea.focus();
              return;
            }
          }
        });
        
        await delay(500);
        await page.keyboard.type(replyText, { delay: 50 });
        
        typed = true;
        console.log(\`[\${ACCOUNT_ID}] Typed successfully using Method 3\`);
        
      } catch (e) {
        console.log(\`[\${ACCOUNT_ID}] Method 3 failed: \${e.message}\`);
      }
    }
    
    if (!typed) {
      console.log(\`[\${ACCOUNT_ID}] Could not type reply\`);
      
      // Debug screenshot
      const screenshot = path.join(ARTIFACTS_DIR, \`debug_type_fail_\${Date.now()}.png\`);
      await page.screenshot({ path: screenshot });
      console.log(\`[\${ACCOUNT_ID}] Debug screenshot: \${screenshot}\`);
      
      return false;
    }
    
    // STEP 5: Kirim dengan Enter
    await delay(1000);
    await page.keyboard.press('Enter');
    await delay(3000);
    
    console.log(\`[\${ACCOUNT_ID}] Reply sent: "\${replyText}"\`);
    
    // NEW: Save to memory after successful reply
    const commentHash = generateCommentHash(comment.text, comment.postUrl);
    await saveRepliedComment(commentHash, comment);
    
    // Log
    const timestamp = new Date().toISOString();
    const logEntry = \`[\${timestamp}] Replied to: "\${comment.text.substring(0, 100)}" | Reply: "\${replyText}"\\n\`;
    await fs.appendFile(LOG_PATH, logEntry);
    
    return true;
    
  } catch (error) {
    console.log(\`[\${ACCOUNT_ID}] Error replying: \${error.message}\`);
    console.log(\`[\${ACCOUNT_ID}] Stack: \${error.stack}\`);
    
    // Debug screenshot
    try {
      if (!fsSync.existsSync(ARTIFACTS_DIR)) {
        await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
      }
      const screenshot = path.join(ARTIFACTS_DIR, \`debug_error_\${Date.now()}.png\`);
      await page.screenshot({ path: screenshot, fullPage: true });
      console.log(\`[\${ACCOUNT_ID}] Error screenshot: \${screenshot}\`);
    } catch (e) {
      // Continue
    }
    
    return false;
  }
}

async function main() {
  let browser = null;
  try {
    console.log(\`[\${ACCOUNT_ID}] === FacebookPro Blaster - Auto Reply Comments Bot (Enhanced) ===\`);
    
    try {
      // Start notification removed (executor handles queue logging)
    } catch (e) {
      console.error(\`[\${ACCOUNT_ID}] Warning: Failed to send Telegram start notification\`);
    }
    
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    
    console.log(\`[\${ACCOUNT_ID}] Loading cookies and API keys...\`);
    const cookies = await loadCookiesFromFile();
    const geminiKeys = await loadGeminiKeys();
    
    let openRouterKeys = [];
    if (config.ai_replies?.use_openrouter !== false) {
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);
      console.log(\`[\${ACCOUNT_ID}] Loaded \${openRouterKeys.length} OpenRouter API keys\`);
    }
    
    console.log(\`[\${ACCOUNT_ID}] Loaded \${geminiKeys.length} Gemini API keys (fallback)\`);
    
    // NEW: Load reply history
    const repliedComments = await loadRepliedComments();
    
    console.log(\`[\${ACCOUNT_ID}] Launching browser...\`);
    browser = await puppeteer.launch({
      headless: config.headless === false ? false : (config.headless === true || config.headless === "new" ? "new" : "new"),
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
    await page.setViewport({ width: 1280, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setCookie(...cookies);
    console.log(\`[\${ACCOUNT_ID}] Cookies loaded\`);
    
    console.log(\`[\${ACCOUNT_ID}] Opening Facebook...\`);
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await delay(5000);
    
    const title = await page.title();
    if (title.includes('Log') || title.includes('login') || title.includes('Login')) {
      throw new Error(\`[\${ACCOUNT_ID}] Login gagal! Periksa cookies.json. Title: \${title}\`);
    }
    console.log(\`[\${ACCOUNT_ID}] Login berhasil: \${title}\`);
    
    // NEW: Get account name for self-reply filter
    const accountName = await getAccountName(page);
    
    const notifications = await getNotifications(page);
    if (notifications.length === 0) {
      console.log(\`[\${ACCOUNT_ID}] No comment notifications found\`);
      try {
        await notify.success(ACCOUNT_ID, BOT_NAME, "No comment notifications to reply to");
      } catch (e) {
        console.error(\`[\${ACCOUNT_ID}] Warning: Failed to send Telegram success notification\`);
      }
      return;
    }
    
    let totalReplies = 0;
    const maxReplies = config.maxReplies || 10;
    
    for (const notification of notifications) {
      if (totalReplies >= maxReplies) {
        console.log(\`[\${ACCOUNT_ID}] Reached maximum replies limit: \${maxReplies}\`);
        break;
      }
      
      try {
        // UPDATED: Pass repliedComments and accountName
        const comments = await goToPostAndFindComments(page, notification.link, repliedComments, accountName);
        
        for (const comment of comments) {
          if (totalReplies >= maxReplies) break;
          
          // UPDATED: Pass accountName to skip check
          if (await shouldSkipComment(comment.text, accountName)) {
            continue;
          }
          
          const replied = await replyToComment(
            page, 
            comment, 
            geminiKeys, 
            openRouterKeys,
            config.static_replies || ["Terima kasih!"]
          );
          
          if (replied) {
            totalReplies++;
            
            const minInterval = (config.minIntervalSeconds || 30) * 1000;
            const maxInterval = (config.maxIntervalSeconds || 120) * 1000;
            const waitTime = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
            console.log(\`[\${ACCOUNT_ID}] Waiting \${waitTime/1000} seconds...\`);
            await delay(waitTime);
          }
        }
      } catch (error) {
        console.log(\`[\${ACCOUNT_ID}] Error processing notification: \${error.message}\`);
        continue;
      }
    }
    
    console.log(\`[\${ACCOUNT_ID}] AUTO REPLY COMPLETED!\`);
    console.log(\`[\${ACCOUNT_ID}] Total replies sent: \${totalReplies}\`);
    console.log(\`[\${ACCOUNT_ID}] Total comments in memory: \${Object.keys(repliedComments).length + totalReplies}\`);
    
    try {
      await notify.success(ACCOUNT_ID, BOT_NAME, \`\${totalReplies} replies sent\`);
    } catch (e) {
      console.error(\`[\${ACCOUNT_ID}] Warning: Failed to send Telegram success notification\`);
    }
    
    try {
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, \`reply_success_\${Date.now()}.png\`)
      });
      console.log(\`[\${ACCOUNT_ID}] Success screenshot saved\`);
    } catch (e) {
      console.error(\`[\${ACCOUNT_ID}] Warning: Failed to save success screenshot\`);
    }
    
  } catch (error) {
    console.error(\`[\${ACCOUNT_ID}] ERROR:\`, error.message);
    console.error(\`[\${ACCOUNT_ID}] Stack:\`, error.stack);
    
    try {
      await notify.error(ACCOUNT_ID, BOT_NAME, error.message);
    } catch (e) {
      console.error(\`[\${ACCOUNT_ID}] Warning: Failed to send Telegram error notification\`);
    }
    
    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0];
        const errorScreenshot = path.join(ARTIFACTS_DIR, \`reply_error_\${Date.now()}.png\`);
        await page.screenshot({ path: errorScreenshot });
        console.log(\`[\${ACCOUNT_ID}] Screenshot error disimpan: \${errorScreenshot}\`);
      } catch (e) {
        console.error(\`[\${ACCOUNT_ID}] Warning: Failed to take error screenshot\`);
      }
    }
    
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(\`[\${ACCOUNT_ID}] Browser ditutup\`);
      } catch (e) {
        console.error(\`[\${ACCOUNT_ID}] Warning: Error closing browser\`);
      }
    }
  }
}

main();
`
        };
        
        if (scripts[name]) {
                return new Response(JSON.stringify({ script: scripts[name] }), {
                    headers: { "Content-Type": "application/json" }
                });
            }
            return new Response(JSON.stringify({ error: "Script not found" }), { status: 404 });
        }

        return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
    }
};
